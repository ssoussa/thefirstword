const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── RATE LIMITING ────────────────────────────────────────────────────────────
const rateLimitMap = new Map();
function rateLimit(ip, maxPerHour = 15) {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + windowMs; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  return entry.count > maxPerHour;
}

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://blelhuisbjvtckephqxd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=representation' },
    body: JSON.stringify(data)
  });
  return res.json();
}
async function supabaseQuery(table, filters = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.json();
}
async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    body: JSON.stringify(data)
  });
  return res.status;
}

// ─── EMAIL HELPERS ────────────────────────────────────────────────────────────
const signature = `
  <table style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e0d8;width:100%;">
    <tr><td>
      <p style="margin:0;font-size:15px;font-weight:700;color:#1a1a1a;font-family:Georgia,serif;">Sami Soussa</p>
      <p style="margin:3px 0 0;font-size:12px;color:#E8650A;font-weight:600;">Founder &amp; CEO</p>
      <p style="margin:3px 0 0;font-size:12px;color:#6b6460;">TheFirstWord</p>
      <p style="margin:4px 0 0;font-size:12px;"><a href="https://thefirstword.ca" style="color:#2A7F7F;text-decoration:none;">thefirstword.ca</a></p>
    </td></tr>
  </table>`;

function emailWrapper(content, lang = 'en') {
  const logoUrl = lang === 'fr'
    ? 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-fr.png'
    : 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-en.png';
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0eb;padding:32px 16px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td style="background:white;padding:20px 28px;border-radius:12px 12px 0 0;border-bottom:3px solid #E8650A;text-align:center;">
    <img src="${logoUrl}" alt="TheFirstWord" style="height:72px;width:auto;display:inline-block;" />
  </td></tr>
  <tr><td style="background:white;padding:32px 28px;border-radius:0 0 12px 12px;">
    ${content}
    ${signature}
  </td></tr>
  <tr><td style="padding:16px 0;text-align:center;">
    <p style="margin:0;font-size:11px;color:#9b9390;">
      &copy; ${new Date().getFullYear()} TheFirstWord &mdash; thefirstword.ca<br>
      ${lang === 'en'
        ? 'This email was sent because you used TheFirstWord to generate a personalized intervention kit.'
        : "Ce courriel vous a \u00e9t\u00e9 envoy\u00e9 parce que vous avez utilis\u00e9 TheFirstWord."
      }
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// ─── MARKDOWN → PLAIN TEXT PREVIEW (first ~200 chars, no markdown symbols) ───
function mdPreview(text, maxChars = 220) {
  if (!text) return '';
  const clean = text
    .replace(/^#{1,3}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[-•*]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .trim();
  return clean.length > maxChars ? clean.substring(0, maxChars).trim() + '...' : clean;
}

// ─── KIT EMAIL — PREVIEW FORMAT (mobile-friendly, no wall of text) ───────────
function buildKitEmail(outputs, recipientName, lang, subscriberEmail) {
  const isEn = lang !== 'fr';
  const name = recipientName ? recipientName.charAt(0).toUpperCase() + recipientName.slice(1) : '';
  const kitUrl = `https://thefirstword.ca/app.html?returning=true&email=${encodeURIComponent(subscriberEmail || '')}&lang=${lang}`;

  function previewSection(label, emoji, color, rawText, tabId) {
    if (!rawText || !rawText.trim()) return '';
    const preview = mdPreview(rawText);
    return `
    <table style="width:100%;margin-bottom:20px;border:1px solid #e8e0d8;border-radius:10px;border-collapse:separate;border-spacing:0;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#f5f0eb;padding:12px 18px;border-bottom:1px solid #e8e0d8;border-radius:10px 10px 0 0;">
          <p style="margin:0;font-size:11px;font-weight:700;color:${color};letter-spacing:2px;text-transform:uppercase;">${emoji} ${label}</p>
        </td>
      </tr>
      <tr>
        <td style="background:white;padding:16px 18px 12px;">
          <p style="margin:0 0 12px;font-size:14px;line-height:1.7;color:#3a3330;font-family:Georgia,serif;">${preview}</p>
          <a href="${kitUrl}" style="display:inline-block;font-size:12px;font-weight:700;color:#2A7F7F;text-decoration:none;border:1px solid #2A7F7F;border-radius:6px;padding:6px 14px;">
            ${isEn ? 'Read full version →' : 'Lire la version complète →'}
          </a>
        </td>
      </tr>
    </table>`;
  }

  const sections = [
    previewSection(isEn ? 'Intervention Letter' : "Lettre d'intervention", '📄', '#2A7F7F', outputs.letter),
    previewSection(isEn ? 'Conversation Guide' : 'Guide de conversation', '📋', '#2A7F7F', outputs.guide),
    previewSection(isEn ? 'SMS Message' : 'Message SMS', '💬', '#2A7F7F', outputs.sms),
    previewSection(isEn ? 'Spoken Script' : 'Script parlé', '🎭', '#2A7F7F', outputs.script),
    outputs.planB ? previewSection('Plan B', '🔄', '#c4622d', outputs.planB) : '',
  ].join('');

  const content = `
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 6px;font-family:Georgia,serif;">
      ${isEn ? `Hi${name ? ' ' + name : ''},` : `Bonjour${name ? ' ' + name : ''},`}
    </p>
    <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 8px;">
      ${isEn
        ? 'Your personalized intervention kit is ready. Below is a preview of each section.'
        : "Votre kit d'intervention personnalisé est prêt. Voici un aperçu de chaque section."
      }
    </p>

    <!-- VIEW FULL KIT BUTTON -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 28px;">
      <tr><td align="center">
        <a href="${kitUrl}" style="display:inline-block;background:#C4622D;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;font-family:Georgia,serif;">
          ${isEn ? '📖 Open My Full Kit →' : '📖 Ouvrir mon kit complet →'}
        </a>
        <p style="margin:8px 0 0;font-size:11px;color:#9b9390;">${isEn ? 'All 5 sections available on the site — works on any device.' : 'Les 5 sections disponibles sur le site — fonctionne sur tous les appareils.'}</p>
      </td></tr>
    </table>

    ${sections}

    <!-- PLAN B CTA -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;background:#fff8f0;border:1px solid rgba(196,98,45,0.2);border-radius:10px;">
      <tr><td style="padding:20px 20px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#c4622d;">${isEn ? '🔄 If the first approach doesn\'t work' : '🔄 Si la première approche ne fonctionne pas'}</p>
        <p style="margin:0 0 14px;font-size:13px;color:#3a3330;line-height:1.6;">
          ${isEn
            ? 'Come back and tell us what happened. We\'ll generate a completely new strategy based on their reaction.'
            : 'Revenez nous dire ce qui s\'est passé. Nous allons générer une stratégie entièrement nouvelle basée sur leur réaction.'
          }
        </p>
        <a href="${kitUrl}&planb=true" style="display:inline-block;background:#c4622d;color:white;text-decoration:none;padding:10px 22px;border-radius:7px;font-size:13px;font-weight:700;">
          ${isEn ? 'Generate Plan B →' : 'Générer le Plan B →'}
        </a>
      </td></tr>
    </table>

    <table style="width:100%;background:#f0f7f7;border-left:4px solid #2A7F7F;border-radius:0 8px 8px 0;margin-top:20px;" cellpadding="0" cellspacing="0">
      <tr><td style="padding:14px 18px;">
        <p style="margin:0 0 4px;font-size:12px;color:#2A7F7F;font-weight:700;">${isEn ? 'A reminder' : 'Un rappel'}</p>
        <p style="margin:0;font-size:12px;color:#3a3330;line-height:1.6;">
          ${isEn
            ? "You don't have to say everything perfectly. What matters is that you show up."
            : "Vous n'avez pas à tout dire parfaitement. Ce qui compte, c'est d'être présent(e)."
          }
        </p>
      </td></tr>
    </table>`;

  return emailWrapper(content, lang);
}

// ─── WEEKLY EMAIL TEMPLATES ───────────────────────────────────────────────────
function buildWeeklyEmail(weekNumber, recipientName, lang, subscriberId, subscriberEmail) {
  const isEn = lang !== 'fr';
  const name = recipientName ? recipientName.charAt(0).toUpperCase() + recipientName.slice(1) : (isEn ? 'there' : '');
  const planBUrl = `https://thefirstword.ca/app.html?returning=true&email=${encodeURIComponent(subscriberEmail || '')}&lang=${lang}&planb=true`;

  const weeks = {
    1: {
      subject: isEn ? 'Week 1 — How are you doing?' : 'Semaine 1 — Comment allez-vous?',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">${isEn ? "It's been one week since you received your intervention kit. That took real courage — we want to check in." : "Cela fait une semaine que vous avez reçu votre kit. Cela a demandé du courage — nous voulons prendre de vos nouvelles."}</p>
        <div style="background:#f5f0eb;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1a1a1a;">${isEn ? 'This week, ask yourself:' : 'Cette semaine, demandez-vous:'}</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? 'Have you had a chance to start the conversation?' : "Avez-vous eu l'occasion d'entamer la conversation?"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? "If not, what's holding you back?" : "Sinon, qu'est-ce qui vous retient?"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? 'Do you need to adjust the approach or timing?' : "Avez-vous besoin d'ajuster l'approche ou le moment?"}</td></tr>
          </table>
        </div>
        <p style="font-size:13px;color:#3a3330;line-height:1.7;margin:0 0 16px;">${isEn ? "There is no perfect moment. But there is a right moment — and often, it's the one you create." : "Il n'y a pas de moment parfait. Mais il y a un bon moment — et souvent, c'est celui que vous créez."}</p>
        <p style="font-size:13px;color:#6b6460;font-style:italic;">${isEn ? 'Reply to this email anytime if you need support.' : 'Répondez à ce courriel à tout moment si vous avez besoin de soutien.'}</p>`
    },
    2: {
      subject: isEn ? "Week 2 — If the conversation hasn't happened yet" : "Semaine 2 — Si la conversation n'a pas encore eu lieu",
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">${isEn ? "Two weeks in. Whether the conversation happened or not — you're still here, still trying. That means everything." : "Deux semaines. Que la conversation ait eu lieu ou non — vous êtes toujours là, vous essayez encore."}</p>
        <div style="background:#f5f0eb;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#1a1a1a;">${isEn ? "If it didn't go as planned:" : "Si ça ne s'est pas passé comme prévu:"}</p>
          <p style="margin:0;font-size:13px;color:#3a3330;line-height:1.7;">${isEn ? "Resistance is normal. Addiction rarely responds to one conversation. What matters is consistency — showing up with love and clarity, not pressure." : "La résistance est normale. La dépendance répond rarement à une seule conversation. Ce qui compte, c'est la constance — revenir avec amour et clarté, sans pression."}</p>
        </div>
        <div style="background:#f0f7f7;border-left:4px solid #2A7F7F;padding:14px 18px;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <p style="margin:0 0 4px;font-size:12px;color:#2A7F7F;font-weight:700;">${isEn ? 'Try this this week:' : 'Essayez ceci cette semaine:'}</p>
          <p style="margin:0;font-size:13px;color:#3a3330;line-height:1.6;">${isEn ? "Choose one small, specific moment — not a sit-down intervention. A car ride. A quiet evening. One sentence from your letter, spoken out loud." : "Choisissez un petit moment précis. Un trajet en voiture. Une soirée calme. Une phrase de votre lettre, dite à voix haute."}</p>
        </div>`
    },
    3: {
      subject: isEn ? 'Week 3 — When resistance continues' : 'Semaine 3 — Quand la résistance persiste',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">${isEn ? "Three weeks. If your loved one is still resistant, it's time to think about your Plan B." : "Trois semaines. Si votre proche résiste encore, il est temps de réfléchir à votre Plan B."}</p>
        <div style="background:#f5f0eb;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1a1a1a;">${isEn ? 'What Plan B looks like:' : 'À quoi ressemble le Plan B:'}</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? "Clearly defining what you will and won't continue to accept" : "Définir clairement ce que vous accepterez ou non"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? 'Setting a specific deadline or condition' : "Fixer une échéance ou une condition précise"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? 'Involving another trusted person' : "Impliquer une autre personne de confiance"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">• ${isEn ? 'Exploring professional intervention' : "Explorer les options d'intervention professionnelle"}</td></tr>
          </table>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">
          <tr><td align="center">
            <a href="${planBUrl}" style="display:inline-block;background:#c4622d;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
              ${isEn ? '🔄 Generate a New Plan B Strategy →' : '🔄 Générer une nouvelle stratégie Plan B →'}
            </a>
            <p style="margin:8px 0 0;font-size:11px;color:#9b9390;">${isEn ? 'Tell us what happened — we\'ll build a completely new approach.' : 'Dites-nous ce qui s\'est passé — nous allons créer une nouvelle approche.'}</p>
          </td></tr>
        </table>`
    },
    4: {
      subject: isEn ? 'Week 4 — What comes next' : 'Semaine 4 — Et maintenant',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">${isEn ? "Four weeks. You've been carrying something heavy — and you've kept going. That matters more than you know." : "Quatre semaines. Vous portez quelque chose de lourd — et vous avez continué. Cela compte plus que vous ne le savez."}</p>
        <div style="background:#f5f0eb;border-radius:10px;padding:20px;margin-bottom:20px;">
          <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1a1a1a;">${isEn ? 'Where things might stand:' : 'Où en sont les choses:'}</p>
          <table cellpadding="0" cellspacing="0" style="width:100%;">
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">✅ ${isEn ? "Your loved one agreed to get help — keep supporting" : "Votre proche a accepté de l'aide — continuez à soutenir"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">⏳ ${isEn ? "Still resistant — a new Plan B strategy may help" : "Toujours résistant(e) — une nouvelle stratégie Plan B peut aider"}</td></tr>
            <tr><td style="padding:4px 0;font-size:13px;color:#3a3330;">💛 ${isEn ? "You need support too — your wellbeing is not optional" : "Vous avez besoin de soutien aussi — votre bien-être n'est pas optionnel"}</td></tr>
          </table>
        </div>
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f7f7;border-radius:10px;margin-top:16px;">
          <tr><td style="padding:24px;text-align:center;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:700;color:#1a1a1a;">${isEn ? 'Ready to try a different approach?' : 'Prêt(e) à essayer une approche différente?'}</p>
            <p style="margin:0 0 16px;font-size:12px;color:#6b6460;">${isEn ? "Tell us what happened and what their reaction was — we'll build a new strategy from scratch." : "Dites-nous ce qui s'est passé et quelle a été leur réaction — nous allons créer une nouvelle stratégie."}</p>
            <a href="${planBUrl}" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:13px 28px;border-radius:8px;font-size:14px;font-weight:700;">
              ${isEn ? '🔄 Generate My Plan B →' : '🔄 Générer mon Plan B →'}
            </a>
            <p style="margin:10px 0 0;font-size:11px;color:#9b9390;">${isEn ? 'Your original answers are saved. Takes less than 2 minutes.' : 'Vos réponses originales sont sauvegardées. Moins de 2 minutes.'}</p>
          </td></tr>
        </table>`
    }
  };

  const week = weeks[weekNumber];
  const unsubLink = subscriberId
    ? `<p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:20px;"><a href="https://thefirstword.ca/api/unsubscribe?id=${subscriberId}" style="color:#c0b8b0;">${isEn ? 'Unsubscribe from weekly emails' : 'Se désabonner des courriels hebdomadaires'}</a></p>`
    : '';
  return { subject: week.subject, html: emailWrapper(week.content + unsubLink, lang) };
}

// ─── RESEND HELPER ────────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  const resendKey = process.env.RESEND_API_KEY;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${resendKey}` },
    body: JSON.stringify({ from: "TheFirstWord <hello@thefirstword.ca>", reply_to: "thefirstword.ca@gmail.com", to: [to], subject, html }),
  });
  return response.json();
}

// ─── API: GENERATE ────────────────────────────────────────────────────────────
app.post("/api/generate", async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (rateLimit(ip, 15)) return res.status(429).json({ error: "Too many requests. Please try again later." });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured." });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, messages: [{ role: "user", content: prompt }] }),
    });
    const data = await response.json();
    if (data.content?.[0]?.text) {
      res.json({ output: data.content[0].text });
    } else {
      res.status(500).json({ error: "Unexpected response from AI. Please try again." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect to AI. Please try again." });
  }
});

// ─── API: SEND KIT EMAIL ──────────────────────────────────────────────────────
app.post("/api/send-email", async (req, res) => {
  const { email, name, lang, outputs, plan, answers } = req.body;
  if (!email || !outputs) return res.status(400).json({ error: "Missing email or outputs." });
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });
  try {
    const html = buildKitEmail(outputs, name, lang, email);
    const subject = lang === 'fr'
      ? "Votre kit d'intervention personnalisé — TheFirstWord"
      : "Your personalized intervention kit — TheFirstWord";
    const emailResult = await sendEmail(email, subject, html);
    if (!emailResult.id) {
      console.error("Resend error:", emailResult);
      return res.status(500).json({ error: "Failed to send email." });
    }
    if (SUPABASE_KEY && plan === 'monthly') {
      try {
        const a = answers || {};
        await supabaseInsert('subscribers', {
          email, name: name || '', lang: lang || 'en', plan,
          signed_up_at: new Date().toISOString(),
          week1_sent: false, week2_sent: false, week3_sent: false, week4_sent: false, active: true,
          relationship: a.relationship || '', substance: a.substance || '', duration: a.duration || '',
          treatment: a.treatment || '', attitude: a.attitude || '', tone: a.tone || '',
          situation: a.situation || '', patient_name: a.patientName || ''
        });
      } catch (dbErr) { console.error("Supabase save error:", dbErr); }
    }
    res.json({ success: true, id: emailResult.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

// ─── API: TESTIMONIALS ────────────────────────────────────────────────────────
app.post("/api/testimonial", async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
  if (rateLimit(ip + '_t', 3)) return res.status(429).json({ error: "Too many submissions." });
  const { name, relationship, message, lang, rating } = req.body;
  if (!message || message.trim().length < 20) return res.status(400).json({ error: "Message too short." });
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured." });
  try {
    await supabaseInsert('testimonials', {
      name: (name || '').trim() || 'Anonymous', relationship: relationship || '',
      message: message.trim(), lang: lang || 'en', rating: rating || 5,
      approved: false, created_at: new Date().toISOString()
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to save." }); }
});

app.get("/api/testimonials", async (req, res) => {
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured." });
  try {
    const rows = await supabaseQuery('testimonials', 'approved=eq.true&order=created_at.desc&limit=20');
    res.json({ testimonials: rows || [] });
  } catch (err) { res.status(500).json({ error: "Failed to load testimonials." }); }
});

// ─── API: WEEKLY BATCH ────────────────────────────────────────────────────────
app.post("/api/send-weekly-batch", async (req, res) => {
  const authHeader = req.headers['x-cron-secret'];
  if (authHeader !== process.env.CRON_SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured." });
  try {
    const now = new Date();
    const results = { sent: 0, failed: 0 };
    const subscribers = await supabaseQuery('subscribers', 'active=eq.true&select=*');
    for (const sub of subscribers) {
      const signedUp = new Date(sub.signed_up_at);
      const daysSince = Math.floor((now - signedUp) / (1000 * 60 * 60 * 24));
      const weekChecks = [
        { week: 1, field: 'week1_sent', minDays: 7,  maxDays: 13 },
        { week: 2, field: 'week2_sent', minDays: 14, maxDays: 20 },
        { week: 3, field: 'week3_sent', minDays: 21, maxDays: 27 },
        { week: 4, field: 'week4_sent', minDays: 28, maxDays: 34 },
      ];
      const allSent = sub.week1_sent && sub.week2_sent && sub.week3_sent && sub.week4_sent;
      if (allSent && sub.plan === 'monthly' && daysSince >= 35 && daysSince <= 41) {
        try {
          const isEn = sub.lang !== 'fr';
          const subName = sub.name ? sub.name.charAt(0).toUpperCase() + sub.name.slice(1) : (isEn ? 'there' : '');
          const continueUrl = `https://thefirstword.ca/api/checkin-continue?id=${sub.id}&choice=yes`;
          const stopUrl    = `https://thefirstword.ca/api/checkin-continue?id=${sub.id}&choice=no`;
          const unsubUrl   = `https://thefirstword.ca/api/unsubscribe?id=${sub.id}`;
          const subject    = isEn ? 'Do you still need us?' : 'Avez-vous encore besoin de nous?';
          const bodyHtml   = `
            <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${subName},` : `Bonjour ${subName},`}</p>
            <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 24px;">${isEn ? "It's been 4 weeks. Are you still in it, or has something shifted?" : "Cela fait 4 semaines. Êtes-vous toujours dans la situation?"}</p>
            <table style="width:100%;background:#f5f0eb;border-radius:12px;margin-bottom:24px;" cellpadding="20" cellspacing="0">
              <tr><td style="text-align:center;">
                <p style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1a1a1a;">${isEn ? 'Do you still need weekly support?' : 'Avez-vous encore besoin de soutien hebdomadaire?'}</p>
                <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
                  <td style="padding-right:10px;"><a href="${continueUrl}" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;">${isEn ? '✅ Yes, keep them coming' : '✅ Oui, continuez'}</a></td>
                  <td><a href="${stopUrl}" style="display:inline-block;background:white;color:#3a3330;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:13px;font-weight:700;border:1px solid #e8e0d8;">${isEn ? "🙏 No, I'm okay now" : '🙏 Non, ça va maintenant'}</a></td>
                </tr></table>
              </td></tr>
            </table>
            <p style="font-size:11px;color:#c0b8b0;text-align:center;"><a href="${unsubUrl}" style="color:#c0b8b0;">${isEn ? 'Unsubscribe from all emails' : 'Se désabonner de tous les courriels'}</a></p>`;
          const result = await sendEmail(sub.email, subject, emailWrapper(bodyHtml, sub.lang));
          result.id ? results.sent++ : results.failed++;
        } catch(e) { results.failed++; }
        continue;
      }
      for (const check of weekChecks) {
        if (!sub[check.field] && daysSince >= check.minDays && daysSince <= check.maxDays) {
          try {
            // FIXED: pass sub.email so week 4 Plan B link uses real email
            const { subject, html } = buildWeeklyEmail(check.week, sub.name, sub.lang, sub.id, sub.email);
            const result = await sendEmail(sub.email, subject, html);
            if (result.id) {
              await supabaseUpdate('subscribers', sub.id, { [check.field]: true });
              results.sent++;
            } else { results.failed++; }
          } catch(e) { results.failed++; }
          break;
        }
      }
    }
    res.json({ success: true, ...results });
  } catch (err) { res.status(500).json({ error: "Batch send failed." }); }
});

// ─── API: CHECKIN CONTINUE ────────────────────────────────────────────────────
app.get("/api/checkin-continue", async (req, res) => {
  const { id, choice } = req.query;
  if (!id || !choice) return res.status(400).send('Missing parameters');
  if (!SUPABASE_KEY) return res.status(500).send('Database not configured');
  const page = (emoji, title, body) => `<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:480px;margin:80px auto;text-align:center;padding:20px;"><div style="font-size:48px;margin-bottom:16px;">${emoji}</div><h2 style="color:#1a1a1a;margin-bottom:12px;">${title}</h2><p style="color:#6b6460;line-height:1.7;">${body}</p><a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Return to TheFirstWord</a></body></html>`;
  try {
    if (choice === 'yes') {
      await supabaseUpdate('subscribers', id, { week1_sent: false, week2_sent: false, week3_sent: false, week4_sent: false, active: true, signed_up_at: new Date().toISOString() });
      res.send(page('💚', "We're still with you.", "Your weekly check-ins will continue every Monday. You're not doing this alone."));
    } else {
      await supabaseUpdate('subscribers', id, { active: false });
      res.send(page('🙏', "Thank you for letting us know.", "We hope things are moving in the right direction. Come back anytime."));
    }
  } catch(err) { res.status(500).send('Something went wrong.'); }
});

app.get("/api/unsubscribe", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('Missing id');
  if (!SUPABASE_KEY) return res.status(500).send('Database not configured');
  try {
    await supabaseUpdate('subscribers', id, { active: false });
    res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:480px;margin:80px auto;text-align:center;padding:20px;"><h2 style="color:#1a1a1a;margin-bottom:12px;">You've been unsubscribed.</h2><p style="color:#6b6460;line-height:1.7;">You won't receive any more emails. We wish you and your family well.</p><a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Return to TheFirstWord</a></body></html>`);
  } catch(err) { res.status(500).send('Something went wrong.'); }
});

// ─── API: RETURNING CLIENT LOOKUP ────────────────────────────────────────────
app.get("/api/returning-client", async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: "Missing email" });
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured" });
  try {
    const rows = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(email)}&select=*&limit=1`);
    if (rows && rows.length > 0) {
      const sub = rows[0];
      res.json({
        found: true, name: sub.name, lang: sub.lang, plan: sub.plan, signedUpAt: sub.signed_up_at,
        answers: {
          relationship: sub.relationship || '', substance: sub.substance || '',
          duration: sub.duration || '', treatment: sub.treatment || '',
          attitude: sub.attitude || '', tone: sub.tone || '',
          situation: sub.situation || '', patientName: sub.patient_name || ''
        }
      });
    } else { res.json({ found: false }); }
  } catch (err) { res.status(500).json({ error: "Lookup failed" }); }
});

// ─── CATCH ALL ────────────────────────────────────────────────────────────────
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "index.html")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TheFirstWord running on port ${PORT}`));
