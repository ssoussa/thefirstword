/* TheFirstWord — lead capture popup (bilingual, self-contained)
   Include on content pages only (never app.html):
   <script src="https://thefirstword.ca/lead-popup.js" defer></script> */
(function () {
  'use strict';

  var STORE_KEY = 'tfwLeadPopup';
  var API_URL = 'https://thefirstword.ca/api/capture-lead';
  var SUPPRESS_DAYS_AFTER_DISMISS = 7;

  // ── Frequency guard ──────────────────────────────────────────────────────
  function getState() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setState(s) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  var st = getState();
  if (st.submitted) return;
  if (st.dismissedAt && (Date.now() - st.dismissedAt) < SUPPRESS_DAYS_AFTER_DISMISS * 86400000) return;

  // ── Language (read at show time; index.html toggles lang dynamically) ────
  function lang() {
    var l = (document.documentElement.lang || '').toLowerCase();
    if (l.indexOf('fr') === 0) return 'fr';
    if (l.indexOf('en') === 0) return 'en';
    var q = new URLSearchParams(window.location.search).get('lang');
    return q === 'en' ? 'en' : 'fr';
  }

  var TEXT = {
    fr: {
      eyebrow: 'GUIDE GRATUIT',
      title: 'Les 5 erreurs qui ferment la conversation avant qu\u2019elle commence',
      sub: 'Vous voulez parler \u00e0 un proche de sa consommation? \u00c9vitez les erreurs qui d\u00e9clenchent la d\u00e9fensive \u2014 avec les phrases exactes \u00e0 dire \u00e0 la place.',
      placeholder: 'Votre courriel',
      btn: 'Recevoir le guide (PDF)',
      consent: 'En vous inscrivant, vous acceptez de recevoir quelques courriels de TheFirstWord. D\u00e9sinscription en un clic, en tout temps.',
      successTitle: 'C\u2019est envoy\u00e9!',
      successBody: 'V\u00e9rifiez votre bo\u00eete de r\u00e9ception \u2014 le guide arrive dans la prochaine minute. (Pensez \u00e0 regarder vos courriels ind\u00e9sirables.)',
      close: 'Fermer',
      invalid: 'Entrez une adresse courriel valide.',
      error: 'Une erreur est survenue. R\u00e9essayez dans un instant.'
    },
    en: {
      eyebrow: 'FREE GUIDE',
      title: 'The 5 Mistakes That Shut Down the Conversation Before It Starts',
      sub: 'Want to talk to someone you love about their substance use? Avoid the mistakes that trigger defensiveness \u2014 with the exact phrases to say instead.',
      placeholder: 'Your email',
      btn: 'Get the guide (PDF)',
      consent: 'By signing up, you agree to receive a few emails from TheFirstWord. One-click unsubscribe, anytime.',
      successTitle: 'It\u2019s on its way!',
      successBody: 'Check your inbox \u2014 the guide will arrive within the next minute. (Remember to check your spam folder.)',
      close: 'Close',
      invalid: 'Please enter a valid email address.',
      error: 'Something went wrong. Please try again in a moment.'
    }
  };

  // ── Styles ───────────────────────────────────────────────────────────────
  var css = [
    '#tfw-lead-overlay{position:fixed;inset:0;background:rgba(28,43,58,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s ease;}',
    '#tfw-lead-overlay.tfw-visible{opacity:1;}',
    '#tfw-lead-card{background:#F7F4EF;border-radius:16px;max-width:480px;width:100%;padding:36px 32px 28px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,0.3);transform:translateY(12px);transition:transform .25s ease;max-height:90vh;overflow-y:auto;}',
    '#tfw-lead-overlay.tfw-visible #tfw-lead-card{transform:translateY(0);}',
    '#tfw-lead-close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:26px;line-height:1;color:#5a6a7a;cursor:pointer;padding:6px;}',
    '#tfw-lead-eyebrow{font-family:Inter,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:2px;color:#2A7F7F;margin:0 0 10px;}',
    '#tfw-lead-title{font-family:"Playfair Display",Georgia,serif;font-size:22px;font-weight:700;line-height:1.25;color:#1C2B3A;margin:0 0 10px;}',
    '#tfw-lead-sub{font-family:Inter,Arial,sans-serif;font-size:14px;line-height:1.6;color:#5a6a7a;margin:0 0 20px;}',
    '#tfw-lead-form{display:flex;flex-direction:column;gap:10px;}',
    '#tfw-lead-email{font-family:Inter,Arial,sans-serif;font-size:16px;padding:13px 16px;border:1px solid #E8E2D9;border-radius:8px;background:#fff;color:#1C2B3A;width:100%;box-sizing:border-box;}',
    '#tfw-lead-email:focus{outline:none;border-color:#2A7F7F;}',
    '#tfw-lead-submit{font-family:Inter,Arial,sans-serif;font-size:15px;font-weight:700;background:#C4622D;color:#fff;border:none;border-radius:8px;padding:14px;cursor:pointer;transition:background .2s;}',
    '#tfw-lead-submit:hover{background:#a8501f;}',
    '#tfw-lead-submit:disabled{background:#c9a48d;cursor:wait;}',
    '#tfw-lead-consent{font-family:Inter,Arial,sans-serif;font-size:11px;line-height:1.5;color:#8a94a0;margin:10px 0 0;}',
    '#tfw-lead-msg{font-family:Inter,Arial,sans-serif;font-size:13px;color:#b3402a;margin:6px 0 0;min-height:16px;}',
    '.tfw-hp{position:absolute;left:-9999px;opacity:0;height:0;overflow:hidden;}',
    '@media (max-width:600px){#tfw-lead-card{padding:28px 20px 22px;}#tfw-lead-title{font-size:19px;}}'
  ].join('');

  function esc(s) { return s.replace(/</g, '&lt;'); }

  var shown = false;

  function show(trigger) {
    if (shown) return;
    shown = true;
    var t = TEXT[lang()];

    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'tfw-lead-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div id="tfw-lead-card">' +
        '<button id="tfw-lead-close" aria-label="' + esc(t.close) + '">\u00d7</button>' +
        '<p id="tfw-lead-eyebrow">' + esc(t.eyebrow) + '</p>' +
        '<h2 id="tfw-lead-title">' + esc(t.title) + '</h2>' +
        '<p id="tfw-lead-sub">' + esc(t.sub) + '</p>' +
        '<div id="tfw-lead-form">' +
          '<input id="tfw-lead-email" type="email" inputmode="email" autocomplete="email" placeholder="' + esc(t.placeholder) + '">' +
          '<input class="tfw-hp" type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<button id="tfw-lead-submit">' + esc(t.btn) + '</button>' +
          '<p id="tfw-lead-msg"></p>' +
          '<p id="tfw-lead-consent">' + esc(t.consent) + '</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add('tfw-visible'); });

    try { if (window.posthog) posthog.capture('lead_popup_shown', { trigger: trigger, lang: lang() }); } catch (e) {}

    function dismiss() {
      setState({ dismissedAt: Date.now() });
      overlay.classList.remove('tfw-visible');
      setTimeout(function () { overlay.remove(); }, 260);
      try { if (window.posthog) posthog.capture('lead_popup_dismissed'); } catch (e) {}
    }
    overlay.querySelector('#tfw-lead-close').addEventListener('click', dismiss);
    overlay.addEventListener('click', function (ev) { if (ev.target === overlay) dismiss(); });
    document.addEventListener('keydown', function esc_(ev) {
      if (ev.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc_); }
    });

    var emailEl = overlay.querySelector('#tfw-lead-email');
    var hpEl = overlay.querySelector('.tfw-hp');
    var btnEl = overlay.querySelector('#tfw-lead-submit');
    var msgEl = overlay.querySelector('#tfw-lead-msg');

    function submit() {
      var email = (emailEl.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        msgEl.textContent = TEXT[lang()].invalid;
        return;
      }
      msgEl.textContent = '';
      btnEl.disabled = true;
      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email,
          lang: lang(),
          source: window.location.pathname || 'unknown',
          website: hpEl.value || ''
        })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.ok) {
            setState({ submitted: true });
            var t2 = TEXT[lang()];
            overlay.querySelector('#tfw-lead-card').innerHTML =
              '<button id="tfw-lead-close" aria-label="' + esc(t2.close) + '">\u00d7</button>' +
              '<p id="tfw-lead-eyebrow">' + esc(t2.eyebrow) + '</p>' +
              '<h2 id="tfw-lead-title">' + esc(t2.successTitle) + '</h2>' +
              '<p id="tfw-lead-sub">' + esc(t2.successBody) + '</p>';
            overlay.querySelector('#tfw-lead-close').addEventListener('click', function () {
              overlay.classList.remove('tfw-visible');
              setTimeout(function () { overlay.remove(); }, 260);
            });
            try { if (window.posthog) posthog.capture('lead_captured', { lang: lang() }); } catch (e) {}
          } else {
            btnEl.disabled = false;
            msgEl.textContent = TEXT[lang()].error;
          }
        })
        .catch(function () {
          btnEl.disabled = false;
          msgEl.textContent = TEXT[lang()].error;
        });
    }
    btnEl.addEventListener('click', submit);
    emailEl.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') submit(); });
    setTimeout(function () { try { emailEl.focus(); } catch (e) {} }, 300);
  }

  // ── Triggers ─────────────────────────────────────────────────────────────
  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  if (!isTouch) {
    // Desktop: exit intent (cursor leaves viewport at the top)
    document.addEventListener('mouseout', function (ev) {
      if (!ev.relatedTarget && ev.clientY <= 0) show('exit-intent');
    });
    // Fallback: 45 seconds on page
    setTimeout(function () { show('timer'); }, 45000);
  } else {
    // Mobile: 50% scroll depth, or 25 seconds — whichever comes first
    var fired = false;
    function onScroll() {
      if (fired) return;
      var depth = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
      if (depth >= 0.5) { fired = true; show('scroll-50'); window.removeEventListener('scroll', onScroll); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    setTimeout(function () { if (!fired) { fired = true; show('timer'); } }, 25000);
  }
})();
