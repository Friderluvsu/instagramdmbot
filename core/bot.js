import { spawn } from 'child_process';
import fs from 'fs/promises';
import { app } from 'electron';
import path from 'path';
import { platform } from 'os';

// Stealth
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
puppeteer.use(StealthPlugin());

// Ghost Cursor
import { createCursor } from 'ghost-cursor';

// Antidetect fingerprint
import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';

const fpGenerator = new FingerprintGenerator({
    browsers: [{ name: 'chrome', minVersion: 120 }],
    devices: ['desktop'],
    operatingSystems: ['windows', 'macos'],
});

/**
 * Parse proxy string:
 *   "host:port:user:pass"  → static proxy with auth
 *   "host:port"           → static proxy no auth
 *   "http://..."          → rotation URL (GET before launch)
 */
export function parseProxy(proxyStr) {
    if (!proxyStr || proxyStr.trim() === '') return null;
    const s = proxyStr.trim();
    if (s.startsWith('http://') || s.startsWith('https://')) {
        return { type: 'rotate', url: s };
    }
    const parts = s.split(':');
    if (parts.length === 4) return { type: 'static', host: parts[0], port: parts[1], user: parts[2], pass: parts[3] };
    if (parts.length === 2) return { type: 'static', host: parts[0], port: parts[1], user: null, pass: null };
    return null;
}

/**
 * Detect timezone for an IP via ip-api.com (free, no key needed)
 * Returns e.g. "America/New_York" or null on failure
 */
async function detectTimezone(ip) {
    try {
        const url = `http://ip-api.com/json/${ip}?fields=timezone`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
        const data = await res.json();
        return data.timezone || null;
    } catch { return null; }
}



const randomWait = (base, range) => base + Math.random() * range;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function humanClick(cursor, page, elementOrSelector) {
    if (!elementOrSelector) return;
    try {
        await cursor.click(elementOrSelector, {
            waitForClick: randomWait(50, 150),
            moveDelay: randomWait(50, 100)
        });
    } catch (e) {
        // Fallback to native click if ghost-cursor fails
        if (typeof elementOrSelector === 'string') {
            const el = await page.$(elementOrSelector);
            if (el) await el.click();
        } else {
            await elementOrSelector.click();
        }
    }
}

async function sleepWithRandomMouse(cursor, page, ms) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        const remaining = ms - (Date.now() - start);
        if (remaining <= 0) break;
        const chunk = Math.min(remaining, Math.random() * 2000 + 1000);
        await sleep(chunk);

        if (Math.random() < 0.7) {
            try {
                const { width, height } = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
                const x = Math.random() * width;
                const y = Math.random() * height;
                await cursor.moveTo({ x, y });
            } catch (e) { }
        }
    }
}

export function getChromePath() {
    switch (platform()) {
        case 'win32':
            return process.env['PROGRAMFILES'] + '\\Google\\Chrome\\Application\\chrome.exe'
                || process.env['PROGRAMFILES(X86)'] + '\\Google\\Chrome\\Application\\chrome.exe';
        case 'darwin':
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
        case 'linux':
            return '/usr/bin/google-chrome';
    }
}

let chromeProc = null;

export async function startChromeApp(debugPort = 9222, log = console.log, extraArgs = []) {
    const bin = getChromePath();
    const userDataDir = path.join(app.getPath('userData'), 'ChromeBot');

    // If caller provides userDataDir in extraArgs, don't double-add it
    const hasUserData = extraArgs.some(a => a.startsWith('--user-data-dir'));

    const args = [
        `--remote-debugging-port=${debugPort}`,
        ...(hasUserData ? [] : [`--user-data-dir=${userDataDir}`]),
        '--no-first-run',
        '--no-default-browser-check',
        '--restore-last-session',
        '--start-maximized',
        ...extraArgs.filter(a => !a.startsWith('--remote-debugging-port') && !a.startsWith('--no-first-run') && !a.startsWith('--no-default-browser-check') && !a.startsWith('--restore-last-session') && !a.startsWith('--start-maximized'))
    ];

    log(`Starting Chrome at ${bin}...`);
    chromeProc = spawn(bin, args, { detached: true, stdio: 'ignore' });
    chromeProc.unref();
    await sleep(4000); // Wait for Chrome to spin up
}

export async function stopChromeApp() {
    if (chromeProc) {
        try { chromeProc.kill(); } catch (e) { }
        chromeProc = null;
    }
}

async function loadJSON(pathStr) {
    try { return JSON.parse(await fs.readFile(pathStr, 'utf8')); }
    catch { return []; }
}

export async function runBot(configOverride = {}) {
    const log = configOverride.logCallback || console.log;
    const abortSignal = configOverride.abortSignal;
    const targetsRaw = configOverride.targets || [];
    const messages = configOverride.messages || [];
    const igUsername = configOverride.igUsername || '';
    const igPassword = configOverride.igPassword || '';
    const saveHistory = typeof configOverride.saveHistory === 'boolean' ? configOverride.saveHistory : true;

    // ── Profile / Antidetect config ──────────────────────────
    const profileId = configOverride.profileId || 'default';
    const proxyRaw = configOverride.proxyRaw || '';
    const rotateUrl = configOverride.rotateUrl || '';
    const storedFingerprint = configOverride.storedFingerprint || null;
    const onFingerprintGenerated = configOverride.onFingerprintGenerated || null;

    const SENT_FILE_PATH = path.join(app.getPath('userData'), 'profiles', profileId, 'sent_users.json');
    // Ensure profile dir exists
    await fs.mkdir(path.dirname(SENT_FILE_PATH), { recursive: true });

    log('Starting bot initialization...', 'info');
    if (targetsRaw.length === 0 || messages.length === 0) {
        log('Targets or messages are empty. Stopping.', 'error');
        return;
    }

    // ── Handle rotation URL (mobile proxy) ──────────────────
    const proxy = parseProxy(rotateUrl || proxyRaw);
    if (proxy?.type === 'rotate') {
        log(`🔄 Rotating IP via: ${proxy.url}`, 'info');
        try {
            await fetch(proxy.url, { signal: AbortSignal.timeout(8000) });
            await sleep(3000);
            log('✅ IP rotated.', 'success');
        } catch (e) {
            log(`⚠️ IP rotation failed: ${e.message}`, 'warn');
        }
    }

    // ── Fingerprint ─────────────────────────────────────────
    let fingerprint = storedFingerprint;
    if (!fingerprint) {
        log('🎲 Generating new browser fingerprint...', 'info');
        fingerprint = fpGenerator.getFingerprint();
        if (onFingerprintGenerated) onFingerprintGenerated(fingerprint);
    }
    const { screen, userAgent } = fingerprint.fingerprint || fingerprint;

    // ── Timezone from proxy IP ───────────────────────────────
    let timezone = null;
    const staticProxy = parseProxy(proxyRaw);
    if (staticProxy?.type === 'static') {
        timezone = await detectTimezone(staticProxy.host);
        if (timezone) log(`🌍 Timezone detected: ${timezone}`, 'info');
    }

    // ── Sent users history ───────────────────────────────────
    const sentUsers = await loadJSON(SENT_FILE_PATH);
    const targets = targetsRaw.filter(u => !sentUsers.includes(u));
    log(`Loaded ${targetsRaw.length} targets. ${sentUsers.length} already sent. Remaining: ${targets.length}`, 'info');
    if (targets.length === 0) {
        log('No new targets to message. We already messaged them all!', 'success');
        return;
    }

    let browser;
    try {
        const userDataDir = path.join(app.getPath('userData'), 'profiles', profileId);
        await fs.mkdir(userDataDir, { recursive: true });

        // Build Chrome args
        const chromeArgs = [
            `--remote-debugging-port=9222`,
            `--user-data-dir=${userDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--restore-last-session',
            '--start-maximized',
        ];
        if (staticProxy?.type === 'static') {
            chromeArgs.push(`--proxy-server=${staticProxy.host}:${staticProxy.port}`);
        }
        if (timezone) {
            chromeArgs.push(`--timezone=${timezone}`);
        }

        log(`🌐 Launching Chrome for profile: ${profileId}`, 'info');
        await startChromeApp(9222, log, chromeArgs);

        log('Connecting Puppeteer to Chrome...', 'info');
        browser = await puppeteer.connect({
            browserURL: 'http://127.0.0.1:9222',
            defaultViewport: null,
            timeout: 120000,
        });
    } catch (err) {
        log(`Failed to connect to Chrome: ${err.message}`, 'error');
        throw err;
    }

    const page = await browser.newPage();

    // ── Inject fingerprint (UA, Canvas, WebGL, Fonts, Screen) ──
    try {
        const fpInjector = new FingerprintInjector();
        await fpInjector.attachFingerprintToPuppeteer(page, fingerprint);
        // Set screen viewport from fingerprint
        if (screen) {
            await page.setViewport({
                width: screen.width || 1920,
                height: screen.height || 1080,
                deviceScaleFactor: screen.devicePixelRatio || 1
            });
        }
        // Emulate timezone
        if (timezone) await page.emulateTimezone(timezone).catch(() => { });
        log(`✅ Fingerprint injected. UA: ${(userAgent || '').slice(0, 60)}...`, 'info');
    } catch (e) {
        log(`⚠️ Fingerprint injection skipped: ${e.message}`, 'warn');
    }

    // Proxy auth
    if (staticProxy?.user) {
        await page.authenticate({ username: staticProxy.user, password: staticProxy.pass });
    }

    const cursor = createCursor(page);

    // Abort handling
    const onAbort = async () => {
        log('🛑 Abort signal received. Stopping ASAP.', 'warn');
        await page.close().catch(() => { });
        await browser.disconnect().catch(() => { });
    };
    if (abortSignal) abortSignal.addEventListener('abort', onAbort);

    try {
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (['image', 'media', 'font'].includes(req.resourceType())) return req.abort();
            req.continue();
        });
        page.setDefaultNavigationTimeout(60000);

        log('🔄 Navigating to Instagram Home...', 'info');
        await page.goto('https://www.instagram.com/', { waitUntil: 'networkidle2', timeout: 60000 });
        await sleep(10000); // Give the page more ample time to paint

        // Multiple selectors - Instagram uses name="email" and name="pass" (not username/password!)
        const isLoginVisible = await page.$('input[name="email"], input[name="username"], input[autocomplete*="username"]');
        if (isLoginVisible) {
            if (igUsername && igPassword) {
                log('🔐 Login screen detected. Attempting auto-login...', 'info');
                // Try standard name selectors first, fallback to user provided XPaths if needed
                const usernameInput = await page.$('input[name="email"], input[name="username"], input[type="text"][autocomplete*="username"]');
                const passwordInput = await page.$('input[name="pass"], input[name="password"], input[type="password"]');
                const loginBtn = await page.$('button[type="submit"]');

                if (usernameInput) {
                    if (abortSignal?.aborted) throw new Error('Aborted by user');
                    await usernameInput.click(); // focus first
                    await sleep(300);
                    for (const char of igUsername) {
                        if (abortSignal?.aborted) throw new Error('Aborted by user');
                        await page.keyboard.type(char, { delay: randomWait(80, 80) });
                    }
                    await sleep(500);
                }
                if (passwordInput) {
                    if (abortSignal?.aborted) throw new Error('Aborted by user');
                    await passwordInput.click(); // focus first
                    await sleep(300);
                    for (const char of igPassword) {
                        if (abortSignal?.aborted) throw new Error('Aborted by user');
                        await page.keyboard.type(char, { delay: randomWait(80, 80) });
                    }
                    await sleep(500);
                }

                if (abortSignal?.aborted) throw new Error('Aborted by user');
                if (loginBtn) {
                    const box = await loginBtn.boundingBox();
                    if (box) {
                        await humanClick(cursor, page, loginBtn);
                    } else {
                        await page.keyboard.press('Enter');
                    }
                    log('⏳ Waiting for login to process...', 'info');
                } else {
                    await page.keyboard.press('Enter');
                }
            } else {
                log('⚠️ Instagram is asking for login, but no credentials were provided in Settings. Please login manually in the opened Chrome window. Waiting up to 2 minutes...', 'warn');
            }

            try {
                // Wait up to 120s for login to succeed: logged-in element appears
                let loggedIn = false;
                for (let i = 0; i < 60; i++) {
                    if (abortSignal?.aborted) throw new Error('Aborted by user');
                    // Check if 'Not Now' popup or Home Feed 'svg[aria-label="Home"]' exists
                    const isHomeIcon = await page.$('svg[aria-label="Home"], svg[aria-label="Главная"]').catch(() => null);
                    const isSaveInfo = await page.$eval('button', el => el.textContent.includes('Not Now') || el.textContent.includes('Не сейчас') || el.textContent.includes('Save Info')).catch(() => false);
                    const isSearchIcon = await page.$('svg[aria-label="Search"], svg[aria-label="Поисковый запрос"]').catch(() => null);

                    const passwordInputVisible = await page.$('input[name="pass"], input[name="password"], input[type="password"]').catch(() => null);

                    if ((isHomeIcon || isSearchIcon || isSaveInfo) && !passwordInputVisible) {
                        loggedIn = true;
                        break;
                    }
                    await sleep(2000);
                }

                if (loggedIn) {
                    log('✅ Login successful! Continuing automation.', 'success');
                    await sleep(5000); // give the post-login page time to render
                } else {
                    const currentUrl = page.url();
                    if (currentUrl.includes('login') || currentUrl.includes('challenge')) {
                        log('⚠️ Login might have failed due to incorrect credentials or a verification challenge. Please check the Chrome window.', 'error');
                        throw new Error('Login failed or challenged.');
                    }
                }
            } catch (e) {
                log(`❌ Error during login wait: ${e.message}`, 'error');
                throw e;
            } // END OF try-catch logic
        } else {
            log('✅ No login screen detected. Assuming already logged in.', 'success');
        }

        // 💥 CRITICAL FIX: Repeatedly check for 'Not Now' dialogues as they appear dynamically
        for (let i = 0; i < 3; i++) {
            const notNowSelector = 'div[role="button"], button';
            const buttons = await page.$$(notNowSelector);
            for (const btn of buttons) {
                try {
                    const text = await page.evaluate(el => el.textContent, btn);
                    if (text && (text.includes('Not Now') || text.includes('Не сейчас'))) {
                        log('Dismissing popup...', 'info');
                        await humanClick(cursor, page, btn);
                        await sleep(2000);
                    }
                } catch (e) { }
            }
            await sleep(2000);
        }

        let sentCount = 0;
        for (const target of targets) {
            if (abortSignal && abortSignal.aborted) break;

            log(`\n✉️ Attempting to message ${target}...`, 'info');

            try {
                // SEARCH FLOW — navigate directly to explore to open search
                await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                await sleep(3000);

                // Check we are actually logged in on home page (not redirected to login)
                const isStillOnLogin = await page.$('input[name="email"], input[name="username"], input[autocomplete*="username"]').catch(() => null);
                if (isStillOnLogin) {
                    log('❌ Not logged into Instagram! Please login manually in Chrome, then restart the bot.', 'error');
                    throw new Error('User is not logged in to Instagram.');
                }

                const searchInputSelector = 'input[aria-label="Search input"], input[placeholder="Search"], input[placeholder="Поиск"]';
                let searchInput = await page.$(searchInputSelector);
                let isSearchVisible = searchInput ? await searchInput.boundingBox() : null;

                if (!isSearchVisible) {
                    log('⏳ Search panel not open, clicking Search icon in sidebar...', 'info');

                    // Find the Search icon: its parent <a> or <span role="link">
                    // We find the SVG first then click its closest clickable ancestor
                    const searchIconClicked = await page.evaluate(() => {
                        const svgs = Array.from(document.querySelectorAll('svg'));
                        const searchSvg = svgs.find(s =>
                            s.getAttribute('aria-label') === 'Search' ||
                            s.querySelector('title')?.textContent?.trim() === 'Search'
                        );
                        if (!searchSvg) return false;
                        // Walk up to find clickable ancestor
                        let el = searchSvg;
                        for (let i = 0; i < 5; i++) {
                            el = el.parentElement;
                            if (!el) break;
                            if (el.tagName === 'A' || el.getAttribute('role') === 'link' || el.getAttribute('role') === 'button') {
                                el.click();
                                return true;
                            }
                        }
                        // Last resort: click the SVG itself
                        searchSvg.click();
                        return true;
                    });

                    if (searchIconClicked) {
                        log('✅ Clicked Search icon. Waiting for panel to open...', 'info');
                        await sleep(2000);
                    } else {
                        log('⚠️ Search icon not found in sidebar, trying direct navigation...', 'warn');
                        // Fallback: go to home - search panel sometimes appears after reload
                        await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
                        await sleep(3000);
                    }

                    // Retry finding the search input after clicking Search icon
                    for (let i = 0; i < 5; i++) {
                        searchInput = await page.$(searchInputSelector);
                        if (searchInput) { isSearchVisible = await searchInput.boundingBox(); }
                        if (isSearchVisible) break;
                        log('⏳ Waiting for search input to appear...', 'info');
                        await sleep(2000);
                    }
                }

                if (!searchInput || !isSearchVisible) {
                    throw new Error('Search input not found after all attempts');
                }

                log(`🔍 Searching for: ${target}`);
                await humanClick(cursor, page, searchInput);
                await sleep(1000); // 💥 Ensure click registers
                await searchInput.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await sleep(1000); // 💥 Ensure clear registers

                for (const char of target) {
                    await page.keyboard.type(char, { delay: randomWait(100, 200) });
                }

                log(`⏳ Waiting for search results to populate...`);
                await sleep(7000); // 💥 More time for results

                const resultSelector = `a[href*="/${target.toLowerCase()}/"]`;
                try {
                    await page.waitForSelector(resultSelector, { timeout: 15000, visible: true });
                    const resultLink = await page.$(resultSelector);
                    if (resultLink) {
                        await humanClick(cursor, page, resultLink);
                        await sleepWithRandomMouse(cursor, page, 7000); // 💥 More time for profile load
                    } else {
                        throw new Error('Null link');
                    }
                } catch (e) {
                    log(`⚠️ User ${target} not found in search results. Skipping.`, 'warn');
                    continue; // skips cleanly
                }

                // Evaluate Profile
                await sleep(3000);
                const isUnavailable = await page.evaluate(() => document.body.innerText.includes("Sorry, this page isn't available."));
                if (isUnavailable) { log(`🚫 Profile ${target} unavailable.`, 'warn'); continue; }

                const isPrivate = await page.evaluate(() => {
                    const h2 = document.querySelector('h2');
                    return h2 && h2.textContent.toLowerCase().includes('this account is private');
                });
                if (isPrivate) { log(`🔒 Profile ${target} is private.`, 'warn'); continue; }

                // --- 🤖 BEGIN HUMAN SIMULATION BLOCK ---

                // 1. Check for "No posts yet"
                const hasNoPosts = await page.evaluate(() => {
                    const main = document.querySelector('main');
                    if (main && (main.innerText.includes('No posts yet') || main.innerText.includes('Нет публикаций'))) return true;

                    const firstLi = document.querySelector('header ul > li:first-child');
                    if (firstLi) {
                        const txt = firstLi.innerText.trim();
                        if (txt === '0' || txt.startsWith('0 ') || txt.startsWith('0\n')) return true;
                    }
                    return false;
                });
                if (hasNoPosts) {
                    log(`🚫 Profile ${target} has no posts, skipping.`, 'warn');
                    continue;
                }

                // 2. Random scroll
                await sleep(randomWait(1500, 1000));
                const scrollCount = Math.floor(Math.random() * 4) + 1;
                log(`   - Scrolling profile ${scrollCount} times...`, 'info');
                for (let i = 0; i < scrollCount; i++) {
                    await page.evaluate(() => window.scrollBy(0, Math.random() * 400 + 200));
                    await sleep(randomWait(800, 1200));
                }
                log(`   - Scrolling back to top...`, 'info');
                await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
                await sleep(randomWait(2000, 1000));

                // 3. Simulate reading bio (highlighting text) - 35% chance
                if (Math.random() < 0.35) {
                    log(`🧐 Simulating bio reading (highlighting text)...`, 'info');
                    try {
                        const bioElHandle = await page.evaluateHandle(() => {
                            const header = document.querySelector('header');
                            if (!header) return null;
                            const allEls = Array.from(header.querySelectorAll('*'));
                            let candidate = null;
                            let maxLen = 0;
                            for (const el of allEls) {
                                if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'BUTTON') continue;
                                const text = Array.from(el.childNodes)
                                    .filter(node => node.nodeType === Node.TEXT_NODE)
                                    .map(node => node.textContent.trim())
                                    .join(' ');
                                if (text.length > maxLen && text.length > 10) {
                                    maxLen = text.length;
                                    candidate = el;
                                }
                            }
                            return candidate;
                        });

                        const bioEl = bioElHandle.asElement();
                        if (bioEl) {
                            const box = await bioEl.boundingBox();
                            if (box) {
                                await page.mouse.move(box.x + 5, box.y + box.height / 2, { steps: 10 });
                                await sleep(randomWait(300, 200));
                                await page.mouse.down();
                                await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 25 });
                                await sleep(randomWait(1000, 1500));
                                await page.mouse.up();
                                await sleep(randomWait(500, 500));
                                await page.mouse.click(box.x - 10 > 0 ? box.x - 10 : 10, box.y);
                            }
                        }
                    } catch (e) { }
                }

                // 4. Check and watch story - 25% chance
                const hasStory = await page.$('header canvas');
                if (hasStory && Math.random() < 0.25) {
                    log(`🟣 Found story (colored ring), deciding to watch...`, 'info');
                    try {
                        // Traverse up to find clickable wrapper
                        await page.evaluate((canvasEl) => {
                            let el = canvasEl;
                            for (let i = 0; i < 5; i++) {
                                el = el.parentElement;
                                if (!el) break;
                                if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') {
                                    el.click();
                                    return true;
                                }
                            }
                            canvasEl.click(); // fallback
                            return true;
                        }, hasStory);

                        // Wait up to 5s for the URL to change to /stories/
                        let storyOpened = false;
                        for (let i = 0; i < 5; i++) {
                            await sleep(1000);
                            if (page.url().includes('/stories/')) {
                                storyOpened = true;
                                break;
                            }
                        }

                        if (storyOpened) {
                            const watchTime = randomWait(4000, 7000);
                            log(`   - Story opened! Watching for ${Math.round(watchTime / 1000)}s...`, 'info');
                            await sleepWithRandomMouse(cursor, page, watchTime);
                            log(`   - Closing story...`, 'info');
                        } else {
                            log(`   - ⚠️ Failed to open story (URL didn't change to /stories/).`, 'warn');
                        }

                        // Try to close
                        const closeStoryBtn = await page.$('svg[aria-label="Close"], svg[aria-label="Закрыть"]').catch(() => null);
                        if (closeStoryBtn) await humanClick(cursor, page, closeStoryBtn);
                        else await page.keyboard.press('Escape');
                        await sleep(1000);

                        // Ensure we escape the story view completely
                        for (let i = 0; i < 3; i++) {
                            if (!page.url().includes('/stories/')) break;
                            await page.keyboard.press('Escape');
                            await sleep(1000);
                        }
                    } catch (e) {
                        log(`⚠️ Error watching story: ${e.message}`, 'error');
                        try { await page.keyboard.press('Escape'); } catch (e2) { }
                    }
                }

                // 5. View random post - ~30% chance
                if (Math.random() < 0.30) {
                    log(`👀 Randomly deciding to view a post...`, 'info');
                    try {
                        const posts = await page.$$('article a[href^="/p/"]');
                        if (posts.length > 0) {
                            const postEl = posts[0];
                            log(`   - Clicking a post...`, 'info');
                            await postEl.evaluate(el => el.scrollIntoView({ block: 'center' }));
                            await sleep(1000);
                            try { await humanClick(cursor, page, postEl); }
                            catch (e) { await postEl.evaluate(el => el.click()); }

                            const viewTime = randomWait(6000, 1000);
                            log(`   - Viewing post for ${Math.round(viewTime / 1000)}s...`, 'info');
                            await sleepWithRandomMouse(cursor, page, viewTime);

                            if (Math.random() < 0.3) {
                                log(`   - "Forgetting" to close modal, using Browser Back button...`, 'info');
                                await page.goBack();
                                await sleep(2000);
                            } else {
                                const closeBtn = await page.$('svg[aria-label="Close"], svg[aria-label="Закрыть"]');
                                if (closeBtn) {
                                    log(`   - Closing post modal...`, 'info');
                                    await humanClick(cursor, page, closeBtn);
                                    await sleep(1000);
                                } else {
                                    await page.keyboard.press('Escape');
                                }
                            }
                        } else { log(`⚠️ No posts found to view.`, 'warn'); }
                    } catch (e) { log(`⚠️ Error viewing post: ${e.message}`, 'error'); }
                }

                // 6. Check for forbidden words in highlights
                const highlightsXPath = '/html/body/div[1]/div/div/div[2]/div/div/div[1]/div[2]/div[2]/section/main/div/div/header/section[3]/div/div[1]/div';
                const [highlightsEl] = await page.$$('::-p-xpath(' + highlightsXPath + ')');
                let skippedByHighlight = false;
                if (highlightsEl) {
                    const hText = await page.evaluate(el => el.textContent, highlightsEl);
                    const forbiddenWords = ['Beats', 'Beat', 'Catalog'];
                    if (forbiddenWords.some(w => hText.toLowerCase().includes(w.toLowerCase()))) {
                        log(`🛑 Profile ${target} skipped: found forbidden word in highlights.`, 'warn');
                        if (saveHistory) {
                            sentUsers.push(target);
                            await fs.writeFile(SENT_FILE_PATH, JSON.stringify(sentUsers, null, 2));
                        }
                        skippedByHighlight = true;
                    }
                }
                if (skippedByHighlight) continue;

                // 7. Like latest post
                try {
                    const latestPost = await page.$('article a[href^="/p/"]');
                    if (latestPost) {
                        log(`❤️ Liking latest post...`, 'info');
                        await humanClick(cursor, page, latestPost);
                        await sleepWithRandomMouse(cursor, page, randomWait(3000, 2000));

                        const likeBtnSelector = 'svg[aria-label="Like"], svg[aria-label="Нравится"]';
                        const likeBtn = await page.$(likeBtnSelector);
                        if (likeBtn) {
                            await humanClick(cursor, page, likeBtn);
                            log(`   - Liked!`, 'success');
                            await sleep(1000);
                        } else {
                            log(`   - Already liked or button not found.`, 'info');
                        }

                        const closeBtn = await page.$('svg[aria-label="Close"], svg[aria-label="Закрыть"]');
                        if (closeBtn) await humanClick(cursor, page, closeBtn);
                        else await page.keyboard.press('Escape');
                        await sleep(1000);
                    }
                } catch (e) {
                    log(`⚠️ Failed to like post: ${e.message}`, 'error');
                }

                // --- 🤖 END HUMAN SIMULATION BLOCK ---

                log(`🔍 Searching for Message button...`);
                let clicked = false;
                const msgBtnHandle = await page.evaluateHandle(() => {
                    const elems = Array.from(document.querySelectorAll('div[role="button"], button, a, span'));
                    return elems.find(el => {
                        if (el.offsetParent === null) return false;
                        const txt = el.innerText?.trim().toLowerCase() || '';
                        const label = el.getAttribute('aria-label')?.toLowerCase() || '';
                        const t = ['message', 'сообщение', 'send message', 'написать'];
                        return t.includes(txt) || t.includes(label);
                    });
                });

                const element = msgBtnHandle.asElement();
                if (element) {
                    await humanClick(cursor, page, element);
                    await sleep(4000); // 💥 Wait for chat to open
                    clicked = await page.evaluate(() => !!document.querySelector("div[aria-label='Message'], div[aria-label='Сообщение'], div[contenteditable='true']"));
                }

                if (!clicked) {
                    log(`ℹ️ Method 1 failed. Trying Inbox new chat.`, 'warn');
                    await page.goto('https://www.instagram.com/direct/inbox/', { waitUntil: 'domcontentloaded' });
                    await sleep(7000); // 💥 Inbox takes a while to load

                    const newMsgBtnOptions = ['svg[aria-label="New message"]', 'svg[aria-label="Новое сообщение"]', '[aria-label="New message"]'];
                    let newMsgBtnFound = false;
                    for (let i = 0; i < 3; i++) {
                        for (const sel of newMsgBtnOptions) {
                            const el = await page.$(sel);
                            if (el) { await el.click(); newMsgBtnFound = true; break; }
                        }
                        if (newMsgBtnFound) break;
                        log('⏳ Waiting for New Message button...', 'info');
                        await sleep(3000);
                    }

                    if (!newMsgBtnFound) throw new Error("Could not find new message button");
                    await sleep(3000);

                    const toInput = 'input[name="queryBox"], input[placeholder="Search..."], input[placeholder="Поиск..."]';
                    await page.waitForSelector(toInput, { timeout: 15000 });

                    // 💥 Click and clear just in case
                    const toInputEl = await page.$(toInput);
                    await toInputEl.click({ clickCount: 3 });
                    await page.keyboard.press('Backspace');

                    for (const char of target) await page.type(toInput, char, { delay: 100 });
                    await sleep(6000);

                    // 💥 Retry finding the user in the list
                    let userClicked = false;
                    for (let i = 0; i < 3; i++) {
                        userClicked = await page.evaluate((usr) => {
                            for (const el of document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] span')) {
                                if (el.textContent.includes(usr)) {
                                    // Click the closest actionable parent
                                    const actionable = el.closest('div[role="button"]') || el;
                                    actionable.click();
                                    return true;
                                }
                            }
                            return false;
                        }, target);
                        if (userClicked) break;
                        log('⏳ Waiting for user to appear in search list...', 'info');
                        await sleep(3000);
                    }
                    if (!userClicked) throw new Error(`Could not find user in list.`);
                    await sleep(3000);

                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"]'));
                        const cb = btns.find(b => b.textContent === 'Chat' || b.textContent === 'Чат');
                        if (cb) cb.click();
                    });
                }

                const inputSelector = "div[aria-label='Message'], div[aria-label='Сообщение'], div[contenteditable='true'], textarea";
                log(`⏳ Waiting for message input field...`);
                await page.waitForSelector(inputSelector, { visible: true, timeout: 25000 }); // 💥 Long wait

                const input = await page.$(inputSelector);
                if (!input) throw new Error('No input field');

                await sleep(1000);
                await humanClick(cursor, page, input); // 💥 Focus it explicitly like a human
                await sleep(500);

                const msg = messages[Math.floor(Math.random() * messages.length)].replace('{user}', target);

                for (const char of msg) {
                    await page.keyboard.type(char, { delay: randomWait(40, 90) });
                }
                await sleep(1000); // 💥 Wait before pressing enter
                await page.keyboard.press('Enter');

                if (saveHistory) {
                    sentUsers.push(target);
                    await fs.writeFile(SENT_FILE_PATH, JSON.stringify(sentUsers, null, 2));
                    log(`✅ Sent to ${target}! Progress saved.`, 'success');
                } else {
                    log(`✅ Sent to ${target}!`, 'success');
                }
                sentCount++;

                const delay = randomWait(60000, 12000); // ~60 sec
                log(`⏳ Delaying for ~${Math.round(delay / 1000)}s...`, 'info');
                await sleepWithRandomMouse(cursor, page, delay);

            } catch (dmErr) {
                log(`⚠️ Error messaging ${target}: ${dmErr.message}`, 'error');
            }
        }

        log(`🎉 Finished. Success messages sent: ${sentCount}`, 'success');

    } finally {
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        try { await page.close(); } catch (e) { }
        try { await browser.disconnect(); } catch (e) { }
        await stopChromeApp();
    }
}
