const licenseSection = document.getElementById('licenseSection');
const appSection = document.getElementById('appSection');
const verifyBtn = document.getElementById('verifyBtn');
const licenseKeyInput = document.getElementById('licenseKey');
const startBotBtn = document.getElementById('startBotBtn');
const stopBotBtn = document.getElementById('stopBotBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const logDiv = document.getElementById('log');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');

const igUsernameInput = document.getElementById('igUsername');
const igPasswordInput = document.getElementById('igPassword');
const targetsInput = document.getElementById('targetsInput');
const messagesInput = document.getElementById('messagesInput');
const saveHistoryInput = document.getElementById('saveHistory');
const targetsBadge = document.getElementById('targetsBadge');
const targetsBadgeCount = document.getElementById('targetsBadgeCount');
const langDropdown = document.getElementById('langDropdown');
const currentLangLabel = document.getElementById('currentLangLabel');
const subscriptionBadge = document.getElementById('subscriptionBadge');
const subStatusText = document.getElementById('subStatusText');
const subIcon = subscriptionBadge.querySelector('i');

// ─── Translations ─────────────────────────────────────────────────────────────
const translations = {
    en: {
        app_title: "Instagram DM Bot",
        status_stopped: "Stopped",
        status_running: "Running",
        lic_title: "Activate Bot",
        lic_desc: "Enter your license key to get started.",
        btn_verify: "Verify & Start App",
        tab_settings: "Settings",
        tab_logs: "Live Logs",
        lbl_ig_account: "Instagram Account",
        lbl_ig_optional: "Optional — for auto-login",
        lbl_targets: "Target Usernames",
        lbl_targets_count: "users",
        lbl_targets_hint: "Accepted: raw usernames, @handles, Instagram links, comma/space-separated lists — all formats auto-cleaned.",
        lbl_messages: "Messages",
        lbl_messages_desc: "Separate options with double newline",
        lbl_options: "Options",
        lbl_remember: "Remember sent users",
        lbl_remember_desc: "Already-messaged usernames are saved locally and skipped on the next run.",
        btn_start: "Start Bot",
        btn_stop: "Stop Bot",
        btn_clear: "Clear",
        lbl_clear_settings: "Reset Cache",
        lbl_live_logs: "Live Logs",
        err_no_targets: "Please enter at least one target username.",
        err_no_messages: "Please enter at least one message.",
        err_no_valid_targets: "No valid targets found.",
        err_no_valid_messages: "No valid messages found.",
        msg_starting: (t, m) => `Starting bot with ${t} targets and ${m} messages...`,
        msg_stopped_err: (e) => `Bot stopped with error: ${e}`,
        msg_finished: "Bot process finished.",
        msg_license_ok: "License verified successfully!",
        msg_req_stop: "Requesting bot to stop...",
        alert_lic_key: "Enter license key",
        alert_lic_err: "License Error: ",
        sub_free: "Free Plan",
        sub_basic: "Basic Plan",
        sub_premium: "Premium Plan",
        sub_vip: "VIP Plan",
        tab_settings: "Settings",
        tab_logs: "Live Logs",
        tab_plans: "Plans",
        billing_monthly: "Monthly",
        billing_yearly: "Yearly",
        btn_purchase: "Get Started",
        btn_purchase_pro: "Go PRO",
        btn_purchase_vip: "Get VIP",
        plan_monthly: "/mo",
        plan_yearly: "/yr"
    },
    ru: {
        app_title: "Instagram DM Бот",
        status_stopped: "Остановлен",
        status_running: "Запущен",
        lic_title: "Активация бота",
        lic_desc: "Введите ваш лицензионный ключ, чтобы начать.",
        btn_verify: "Проверить и запустить",
        tab_settings: "Настройки",
        tab_logs: "Логи",
        lbl_ig_account: "Аккаунт Instagram",
        lbl_ig_optional: "Необязательно — для авто-входа",
        lbl_targets: "Список пользователей",
        lbl_targets_count: "чел.",
        lbl_targets_hint: "Принимаются: ники, @ники, ссылки на профили, списки через запятую — все форматы очищаются автоматически.",
        lbl_messages: "Сообщения",
        lbl_messages_desc: "Разделяйте варианты сообщений двойным переносом",
        lbl_options: "Опции",
        lbl_remember: "Запоминать отправленные",
        lbl_remember_desc: "Имена пользователей, которым уже отправлены сообщения, сохраняются и будут пропущены.",
        btn_start: "Запустить бота",
        btn_stop: "Остановить бота",
        btn_clear: "Очистить",
        lbl_clear_settings: "Сбросить кэш",
        lbl_live_logs: "Текущие логи",
        err_no_targets: "Пожалуйста, введите хотя бы одного пользователя.",
        err_no_messages: "Пожалуйста, введите хотя бы одно сообщение.",
        err_no_valid_targets: "Валидные пользователи не найдены.",
        err_no_valid_messages: "Валидные сообщения не найдены.",
        msg_starting: (t, m) => `Запуск бота с ${t} целями и ${m} сообщениями...`,
        msg_stopped_err: (e) => `Бот остановлен с ошибкой: ${e}`,
        msg_finished: "Работа бота завершена.",
        msg_license_ok: "Лицензия успешно подтверждена!",
        msg_req_stop: "Запрос на остановку бота...",
        alert_lic_key: "Введите лицензионный ключ",
        alert_lic_err: "Ошибка лицензии: ",
        sub_free: "Бесплатный план",
        sub_basic: "Базовый план",
        sub_premium: "Премиум план",
        sub_vip: "VIP план",
        tab_settings: "Настройки",
        tab_logs: "Журнал",
        tab_plans: "Планы",
        billing_monthly: "Ежемесячно",
        billing_yearly: "Ежегодно",
        btn_purchase: "Начать",
        btn_purchase_pro: "Купить PRO",
        btn_purchase_vip: "Купить VIP",
        plan_monthly: "/мес",
        plan_yearly: "/год"
    }
};

let currentLang = 'en';

function setLanguage(lang) {
    currentLang = lang;
    const t = translations[lang];

    document.getElementById('appTitle').textContent = t.app_title;
    if (!startBotBtn.style.display || startBotBtn.style.display === 'inline-flex') {
        statusText.textContent = t.status_stopped;
    } else {
        statusText.textContent = t.status_running;
    }

    document.getElementById('licTitle').textContent = t.lic_title;
    document.getElementById('licDesc').textContent = t.lic_desc;
    document.getElementById('btnVerifyText').textContent = t.btn_verify;

    document.querySelector('#tabSettings span').textContent = t.tab_settings;
    document.querySelector('#tabLogs span').textContent = t.tab_logs;

    document.getElementById('lblIgAccount').textContent = t.lbl_ig_account;
    document.getElementById('lblIgOptional').textContent = t.lbl_ig_optional;
    document.getElementById('lblTargets').textContent = t.lbl_targets;
    document.getElementById('lblTargetsCount').textContent = t.lbl_targets_count;
    document.getElementById('lblTargetsHint').textContent = t.lbl_targets_hint;
    document.getElementById('lblMessages').textContent = t.lbl_messages;
    document.getElementById('lblMessagesDesc').textContent = t.lbl_messages_desc;
    document.getElementById('lblOptions').textContent = t.lbl_options;
    document.getElementById('lblRemember').textContent = t.lbl_remember;
    document.getElementById('lblRememberDesc').textContent = t.lbl_remember_desc;
    document.getElementById('btnStartText').textContent = t.btn_start;
    document.getElementById('btnStopText').textContent = t.btn_stop;
    document.getElementById('lblLiveLogs').textContent = t.lbl_live_logs;
    document.getElementById('btnClearText').textContent = t.btn_clear;
    if (document.getElementById('lblClearSettings')) document.getElementById('lblClearSettings').textContent = t.lbl_clear_settings;

    // Update Tabs
    document.querySelector('#tabSettings span').textContent = t.tab_settings;
    document.querySelector('#tabLogs span').textContent = t.tab_logs;
    document.querySelector('#tabPlans span').textContent = t.tab_plans;

    // Update Plans Tab
    document.getElementById('labelMonthly').textContent = t.billing_monthly;
    document.getElementById('labelYearly').textContent = t.billing_yearly;

    document.querySelectorAll('.btn-purchase').forEach((btn, idx) => {
        let span = btn.querySelector('span');
        if (idx === 0) span.textContent = t.btn_purchase;
        if (idx === 1) span.textContent = t.btn_purchase_pro;
        if (idx === 2) span.textContent = t.btn_purchase_vip;
    });

    const isYearly = document.getElementById('billingToggle').checked;
    document.querySelectorAll('.plan-price .period').forEach(s => {
        s.textContent = isYearly ? t.plan_yearly : t.plan_monthly;
    });

    // Update custom dropdown label
    currentLangLabel.textContent = lang === 'en' ? 'English' : 'Русский';
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.value === lang);
    });
}

// ─── Subscription Logic ─────────────────────────────────────────────────────
function updateSubscriptionBadge(level) {
    const t = translations[currentLang];
    subscriptionBadge.className = `sub-badge ${level}`;

    let icon = 'award';
    let text = t.sub_free;

    if (level === 'basic') { icon = 'zap'; text = t.sub_basic; }
    if (level === 'premium') { icon = 'star'; text = t.sub_premium; }
    if (level === 'vip') { icon = 'crown'; text = t.sub_vip; }

    subStatusText.textContent = text;
    subIcon.setAttribute('data-lucide', icon);
    lucide.createIcons();
}

// ─── Pricing Toggle Logic ───────────────────────────────────────────────────
const billingToggle = document.getElementById('billingToggle');
const priceBasic = document.getElementById('priceBasic');
const pricePremium = document.getElementById('pricePremium');
const priceVip = document.getElementById('priceVip');
const labelMonthly = document.getElementById('labelMonthly');
const labelYearly = document.getElementById('labelYearly');

billingToggle.addEventListener('change', () => {
    const isYearly = billingToggle.checked;
    const t = translations[currentLang];

    labelMonthly.classList.toggle('active', !isYearly);
    labelYearly.classList.toggle('active', isYearly);

    if (isYearly) {
        priceBasic.textContent = '120';
        pricePremium.textContent = '180';
        priceVip.textContent = '300';
    } else {
        priceBasic.textContent = '20';
        pricePremium.textContent = '30';
        priceVip.textContent = '50';
    }

    document.querySelectorAll('.plan-price .period').forEach(s => {
        s.textContent = isYearly ? t.plan_yearly : t.plan_monthly;
    });
});

// ─── External Links Handling ──────────────────────────────────────────────────
document.querySelectorAll('.btn-purchase-link').forEach(btn => {
    btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url && window.api.openExternal) {
            window.api.openExternal(url);
        }
    });
});

// ─── Language Dropdown Logic ────────────────────────────────────────────────
langDropdown.addEventListener('click', (e) => {
    langDropdown.classList.toggle('open');
    e.stopPropagation();
});

document.addEventListener('click', () => langDropdown.classList.remove('open'));

document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
        const val = item.dataset.value;
        if (val !== currentLang) {
            setLanguage(val);
            saveInputs();
        }
    });
});

// ─── Username sanitizer ───────────────────────────────────────────────────────
function sanitizeTargets(raw) {
    const parts = raw.split(/[\n,;\s\t|]+/);
    return parts
        .map(p => p.trim())
        .map(p => {
            const urlMatch = p.match(/instagram\.com\/([a-zA-Z0-9_.]+)/);
            if (urlMatch) return urlMatch[1];
            return p;
        })
        .map(p => p.replace(/^@+/, '').replace(/[\/\\?#\s]+$/, '').replace(/^[\/\\?#\s]+/, ''))
        .map(p => p.replace(/[^a-zA-Z0-9_.]/g, ''))
        .filter(p => p.length >= 1)
        .filter((p, i, arr) => arr.indexOf(p) === i);
}

function updateTargetsBadge(users) {
    if (users.length > 0) {
        targetsBadgeCount.textContent = users.length;
        targetsBadge.classList.add('visible');
    } else {
        targetsBadge.classList.remove('visible');
    }
}

function cleanTargetsField() {
    const cleaned = sanitizeTargets(targetsInput.value);
    if (cleaned.length > 0) targetsInput.value = cleaned.join('\n');
    updateTargetsBadge(cleaned);
}

targetsInput.addEventListener('blur', cleanTargetsField);
targetsInput.addEventListener('paste', () => setTimeout(cleanTargetsField, 50));
targetsInput.addEventListener('input', () => updateTargetsBadge(sanitizeTargets(targetsInput.value)));

// ─── Password toggle ──────────────────────────────────────────────────────────
document.getElementById('togglePwdBtn').addEventListener('click', () => {
    const isPassword = igPasswordInput.type === 'password';
    igPasswordInput.type = isPassword ? 'text' : 'password';
    const eyeIcon = document.getElementById('eyeIcon');
    eyeIcon.setAttribute('data-lucide', isPassword ? 'eye-off' : 'eye');
    lucide.createIcons();
});

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.tab, .tab-content').forEach(el => el.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target).classList.add('active');
    });
});

// ─── Logging ──────────────────────────────────────────────────────────────────
function appendLog(msg, type = '') {
    const el = document.createElement('div');
    el.className = 'log-entry ' + type;
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = `[${new Date().toLocaleTimeString()}]`;
    const content = document.createElement('span');
    content.textContent = ' ' + msg;
    el.appendChild(time);
    el.appendChild(content);
    logDiv.appendChild(el);
    logDiv.scrollTop = logDiv.scrollHeight;
}

clearLogsBtn.addEventListener('click', () => logDiv.innerHTML = '');
window.api.onLog((event, { message, type }) => appendLog(message, type));

// ─── Init & Persistence ─────────────────────────────────────────────────────
window.api.getLicenseKey().then(key => {
    if (key) licenseKeyInput.value = key;
});

window.api.getSavedInputs().then(inputs => {
    if (inputs.igUsername) igUsernameInput.value = inputs.igUsername;
    if (inputs.igPassword) igPasswordInput.value = inputs.igPassword;
    if (inputs.targets) {
        targetsInput.value = inputs.targets;
        updateTargetsBadge(sanitizeTargets(inputs.targets));
    }
    if (inputs.messages) messagesInput.value = inputs.messages;
    if (typeof inputs.saveHistory === 'boolean') saveHistoryInput.checked = inputs.saveHistory;
    if (inputs.lang) {
        setLanguage(inputs.lang);
    } else {
        setLanguage('en');
    }
});

// Auto-save logic
const saveInputs = () => {
    const config = {
        igUsername: igUsernameInput.value.trim(),
        igPassword: igPasswordInput.value.trim(),
        targets: targetsInput.value,
        messages: messagesInput.value,
        saveHistory: saveHistoryInput.checked,
        lang: currentLang
    };
    window.api.saveSettings(config);
};

[igUsernameInput, igPasswordInput, targetsInput, messagesInput, saveHistoryInput].forEach(el => {
    el.addEventListener('input', saveInputs);
    if (el === saveHistoryInput) {
        el.addEventListener('change', saveInputs);
    }
});

const clearSettingsBtn = document.getElementById('clearSettingsBtn');
if (clearSettingsBtn) {
    clearSettingsBtn.addEventListener('click', async () => {
        if (confirm(currentLang === 'ru' ? 'Сбросить все настройки и кэш лицензии?' : 'Reset all settings and license cache?')) {
            await window.api.clearSettings();
            window.location.reload();
        }
    });
}

// ─── Bot flow ─────────────────────────────────────────────────────────────────
verifyBtn.addEventListener('click', async () => {
    const t = translations[currentLang];
    const key = licenseKeyInput.value.trim();
    if (!key) return alert(t.alert_lic_key);

    verifyBtn.disabled = true;
    const oldText = document.getElementById('btnVerifyText').textContent;
    document.getElementById('btnVerifyText').textContent = '...';

    const res = await window.api.checkLicense(key);

    if (res.valid) {
        licenseSection.style.display = 'none';
        appSection.style.display = 'block';
        appendLog(t.msg_license_ok, 'success');

        // Optionally update badge based on tier if backend returned it (for now, assume premium if valid)
        updateSubscriptionBadge('premium');
    } else {
        alert(t.alert_lic_err + (res.error || res.reason || "Verification failed"));
        verifyBtn.disabled = false;
        document.getElementById('btnVerifyText').textContent = oldText;
    }
});

startBotBtn.addEventListener('click', async () => {
    const t = translations[currentLang];
    cleanTargetsField();

    const igUsername = igUsernameInput.value.trim();
    const igPassword = igPasswordInput.value.trim();
    const rawTargets = targetsInput.value.trim();
    const rawMessages = messagesInput.value.trim();
    const saveHistory = saveHistoryInput.checked;
    const lang = currentLang;

    if (!rawTargets) return alert(t.err_no_targets);
    if (!rawMessages) return alert(t.err_no_messages);

    const targets = rawTargets.split('\n').map(u => u.trim()).filter(Boolean);
    const messages = rawMessages.split('\n\n').map(m => m.trim()).filter(Boolean);

    if (targets.length === 0) return alert(t.err_no_valid_targets);
    if (messages.length === 0) return alert(t.err_no_valid_messages);

    startBotBtn.style.display = 'none';
    stopBotBtn.style.display = 'inline-flex';
    statusIndicator.className = 'running';
    statusText.textContent = t.status_running;

    appendLog(t.msg_starting(targets.length, messages.length), 'info');
    document.querySelector('.tab[data-target="logsTab"]').click();

    const config = { targets, messages, igUsername, igPassword, saveHistory, lang };
    const res = await window.api.startBot(config);

    startBotBtn.style.display = 'inline-flex';
    stopBotBtn.style.display = 'none';
    statusIndicator.className = '';
    statusText.textContent = t.status_stopped;

    if (res.error) {
        appendLog(t.msg_stopped_err(res.error), 'error');
    } else {
        appendLog(res.message || t.msg_finished, 'success');
    }
});

stopBotBtn.addEventListener('click', async () => {
    const t = translations[currentLang];
    stopBotBtn.disabled = true;
    appendLog(t.msg_req_stop, 'warn');
    await window.api.stopBot();
    stopBotBtn.disabled = false;
});

// ─── PROFILES ─────────────────────────────────────────────────────────────────
let profilesData = [];

function maskProxy(proxy) {
    if (!proxy) return '—';
    if (proxy.startsWith('http')) return '🔄 Rotation URL';
    const parts = proxy.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}${parts.length > 2 ? ':****' : ''}`;
    return proxy;
}

function renderProfiles() {
    const grid = document.getElementById('profileGrid');
    const empty = document.getElementById('profilesEmpty');

    // Remove old cards (keep the empty state element)
    grid.querySelectorAll('.profile-card').forEach(c => c.remove());

    document.getElementById('profileUsed').textContent = profilesData.length;

    if (profilesData.length === 0) {
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    profilesData.forEach(profile => {
        const hasFP = !!profile.fingerprint;
        const card = document.createElement('div');
        card.className = 'profile-card';
        card.innerHTML = `
          <div class="profile-info">
            <div class="profile-name">${profile.name}</div>
            <div class="profile-meta">
              <span>🌐 ${maskProxy(profile.proxy || profile.rotateUrl)}</span>
              <span><span class="fp-dot ${hasFP ? '' : 'empty'}"></span> ${hasFP ? 'Fingerprint ready' : 'No fingerprint yet'}</span>
            </div>
          </div>
          <div class="profile-actions">
            <button class="btn-sm primary" data-action="start" data-id="${profile.id}">▶ Start</button>
            ${hasFP ? `<button class="btn-sm" data-action="reset" data-id="${profile.id}" title="Reset fingerprint">🔄</button>` : ''}
            <button class="btn-sm danger" data-action="delete" data-id="${profile.id}">🗑</button>
          </div>
        `;
        grid.appendChild(card);
    });

    // Re-init lucide icons for new elements
    if (window.lucide) lucide.createIcons();
}

async function loadProfiles() {
    const res = await window.api.getProfiles();
    profilesData = res.profiles || [];
    document.getElementById('profileLimit').textContent = res.limit ?? 3;
    renderProfiles();
}

// Load profiles when Profiles tab is clicked
document.querySelector('[data-target="profilesTab"]').addEventListener('click', loadProfiles);

// Create profile modal
document.getElementById('createProfileBtn').addEventListener('click', () => {
    document.getElementById('pModalName').value = '';
    document.getElementById('pModalProxy').value = '';
    document.getElementById('profileModal').classList.add('open');
    if (window.lucide) lucide.createIcons();
});
document.getElementById('pModalCancel').addEventListener('click', () => {
    document.getElementById('profileModal').classList.remove('open');
});
document.getElementById('pModalSave').addEventListener('click', async () => {
    const name = document.getElementById('pModalName').value.trim() || `Account #${profilesData.length + 1}`;
    const rawProxy = document.getElementById('pModalProxy').value.trim();
    const isRotation = rawProxy.startsWith('http://') || rawProxy.startsWith('https://');
    const data = {
        name,
        proxy: isRotation ? '' : rawProxy,
        rotateUrl: isRotation ? rawProxy : ''
    };
    const res = await window.api.createProfile(data);
    if (res.error === 'limit_reached') {
        alert(`Limit reached! Your plan allows up to ${res.limit} profiles. Upgrade to create more.`);
    } else {
        document.getElementById('profileModal').classList.remove('open');
        loadProfiles();
    }
});

// Profile action buttons (delegated)
document.getElementById('profileGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'delete') {
        if (!confirm('Delete this profile and all its data?')) return;
        await window.api.deleteProfile(id);
        loadProfiles();
    }

    if (action === 'reset') {
        if (!confirm('Reset fingerprint? A new one will be generated on next run.')) return;
        await window.api.resetFingerprint(id);
        loadProfiles();
    }

    if (action === 'start') {
        const profile = profilesData.find(p => p.id === id);
        if (!profile) return;

        // Gather current settings for the bot run
        const targetsRaw = (document.getElementById('targetsInput')?.value || '').split('\n').map(s => s.trim()).filter(Boolean);
        const messages = (document.getElementById('messagesInput')?.value || '').split('\n\n').map(s => s.trim()).filter(Boolean);
        const igUsername = document.getElementById('igUsername')?.value || '';
        const igPassword = document.getElementById('igPassword')?.value || '';

        if (targetsRaw.length === 0 || messages.length === 0) {
            alert('Please fill in Targets and Messages in the Settings tab first.');
            return;
        }

        statusIndicator.className = 'running';
        statusText.textContent = `Running: ${profile.name}`;
        appendLog(`🚀 Starting profile "${profile.name}"...`, 'info');
        document.querySelector('.tab[data-target="logsTab"]').click();

        const res = await window.api.startBotProfile(id, {
            targets: targetsRaw, messages, igUsername, igPassword,
            saveHistory: true, lang: currentLang
        });

        statusIndicator.className = '';
        statusText.textContent = translations[currentLang].status_stopped;
        if (res?.error) appendLog(`❌ ${res.error}`, 'error');
        else appendLog(`✅ Profile "${profile.name}" finished.`, 'success');
        loadProfiles(); // Refresh to show newly saved fingerprint
    }
});
