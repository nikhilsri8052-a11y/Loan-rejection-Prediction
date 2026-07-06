// ── Dark Mode ──────────────────────────────────────────────
const html = document.documentElement;
const themeToggle = document.getElementById('themeToggle');

function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
    localStorage.setItem('theme', theme);
    updateThemeButton();
}

function updateThemeButton() {
    if (!themeToggle) return;
    const isDark = html.getAttribute('data-theme') === 'dark';
    themeToggle.innerHTML = `<span class="me-2">${isDark ? '☽' : '☀'}</span><span>${isDark ? 'Dark' : 'Light'}</span>`;
}

const saved = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const initialTheme = saved || (prefersDark ? 'dark' : 'light');
applyTheme(initialTheme);

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
    });
}

// ── Sliders ──────────────────────────────────────────────────
function updateSlider(input, fill, display, formatter) {
    const min = parseFloat(input.min);
    const max = parseFloat(input.max);
    const val = parseFloat(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    fill.style.width = pct + '%';
    if (display) display.textContent = formatter(val);
}

const sliderConfigs = [
    { id: 'age', formatter: v => v + ' yrs' },
    { id: 'cigsPerDay', formatter: v => v },
    { id: 'totChol', formatter: v => v + ' mg/dL' },
    { id: 'glucose', formatter: v => v + ' mg/dL' },
    { id: 'sysBP', formatter: v => v },
    { id: 'diaBP', formatter: v => v },
    { id: 'BMI', formatter: v => v },
    { id: 'heartRate', formatter: v => v + ' bpm' },
];

const sliders = {};
sliderConfigs.forEach(cfg => {
    const input = document.getElementById(cfg.id);
    if (!input) return;
    const fill = document.getElementById(cfg.id + 'Fill');
    const display = document.getElementById(cfg.id + 'Display');
    sliders[cfg.id] = { input, fill, display, formatter: cfg.formatter };
    updateSlider(input, fill, display, cfg.formatter);
    input.addEventListener('input', () => {
        updateSlider(input, fill, display, cfg.formatter);
        syncSummary();
    });
});

// ── Summary box ──────────────────────────────────────────────
const summaryAge = document.getElementById('summaryAge');
const summaryBMI = document.getElementById('summaryBMI');
const summaryBP = document.getElementById('summaryBP');
const summaryGlucose = document.getElementById('summaryGlucose');

function syncSummary() {
    if (summaryAge && sliders.age) summaryAge.textContent = sliders.age.input.value + ' yrs';
    if (summaryBMI && sliders.BMI) summaryBMI.textContent = sliders.BMI.input.value;
    if (summaryBP && sliders.sysBP && sliders.diaBP) {
        summaryBP.textContent = `${sliders.sysBP.input.value}/${sliders.diaBP.input.value}`;
    }
    if (summaryGlucose && sliders.glucose) summaryGlucose.textContent = sliders.glucose.input.value + ' mg/dL';
}
syncSummary();

// ── Gauge (0–100% ten-year CHD risk) ──────────────────────────
function animateGauge(percent) {
    const needle = document.getElementById('gaugeNeedle');
    const gaugeArc = document.getElementById('gaugeArc');
    const ARC_LEN = 377;
    const ARC_START = -90;
    const ARC_SWEEP = 180;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const pct = clamp(percent / 100, 0, 1);
    const needleAngle = ARC_START + pct * ARC_SWEEP;
    const dashOffset = ARC_LEN - pct * ARC_LEN;
    needle.style.transform = `rotate(${needleAngle}deg)`;
    gaugeArc.style.strokeDashoffset = dashOffset;
}

function animateCounter(el, target, duration = 1200) {
    let start = null;
    const step = ts => {
        if (!start) start = ts;
        const prog = Math.min((ts - start) / duration, 1);
        const eased = 1 - Math.pow(1 - prog, 3);
        el.textContent = (target * eased).toFixed(1) + '%';
        if (prog < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

// ── Result rendering ───────────────────────────────────────────
const resultSection = document.getElementById('resultSection');
const resultErrorWrap = document.getElementById('resultErrorWrap');
const resultError = document.getElementById('resultError');
const riskBadge = document.getElementById('riskBadge');

function showSuccess(data) {
    if (!resultSection) return;

    if (resultErrorWrap) resultErrorWrap.style.display = 'none';

    resultSection.classList.remove('visible');
    void resultSection.offsetWidth;
    resultSection.classList.add('visible');

    const readingEl = document.getElementById('readingValue');
    const labelEl = document.getElementById('predictionLabel');
    const summaryEl = document.getElementById('predictionSummary');

    animateCounter(readingEl, data.rejection_probability);
    animateGauge(data.rejection_probability);

    const message = data.prediction_text || data.message || 'Prediction complete';
    if (labelEl) labelEl.textContent = 'Based on the values you entered';
    if (summaryEl) summaryEl.textContent = message;

    if (riskBadge) {
        const isHigh = (data.risk_level || '').toLowerCase().includes('high');
        riskBadge.textContent = data.risk_level || '—';
        riskBadge.className = 'badge rounded-pill ' + (isHigh ? 'text-bg-danger' : 'text-bg-success');
    }

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showError(message) {
    if (!resultSection || !resultErrorWrap || !resultError) return;

    resultErrorWrap.style.display = '';
    resultError.textContent = 'Error: ' + message;

    resultSection.classList.remove('visible');
    void resultSection.offsetWidth;
    resultSection.classList.add('visible');

    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Form submission ──────────────────────────────────────────
const form = document.getElementById('predictForm');
const btn = document.getElementById('predictBtn');

if (form && btn) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        btn.disabled = true;
        btn.querySelector('.btn-text').textContent = 'Predicting…';
        const payload = new FormData(form);
        try {
            const res = await fetch('/predict', {
                method: 'POST',
                body: payload,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const data = await res.json();
            if (data.success) {
                showSuccess(data);
            } else {
                showError(data.error || 'Something went wrong.');
            }
        } catch (err) {
            showError('Could not reach the server. Make sure Flask is running.');
        } finally {
            btn.disabled = false;
            btn.querySelector('.btn-text').textContent = 'Estimate My Risk';
        }
    });
}

// ── Render server-side result on full page load (non-AJAX fallback) ──
window.addEventListener('DOMContentLoaded', () => {
    if (window.FLASK_RESULT) {
        if (window.FLASK_RESULT.success) {
            showSuccess(window.FLASK_RESULT);
        } else {
            showError(window.FLASK_RESULT.error || 'Something went wrong.');
        }
    }
});