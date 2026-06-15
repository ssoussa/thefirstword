const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://blelhuisbjvtckephqxd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseInsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function supabaseQuery(table, filters = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filters}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    },
    body: JSON.stringify(data)
  });
  return res.status;
}

// ─── EMAIL TEMPLATES ──────────────────────────────────────────────────────────

const signature = `
  <table style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e0d8;width:100%;">
    <tr>
      <td style="vertical-align:middle;padding-right:20px;">
        <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a1a;font-family:Georgia,serif;">Sami Soussa</p>
        <p style="margin:3px 0 0;font-size:13px;color:#E8650A;font-weight:600;">Founder &amp; CEO</p>
        <p style="margin:3px 0 0;font-size:13px;color:#6b6460;">TheFirstWord</p>
        <p style="margin:4px 0 0;font-size:13px;"><a href="https://thefirstword.ca" style="color:#2A7F7F;text-decoration:none;">thefirstword.ca</a></p>
      </td>
    </tr>
  </table>
`;

function emailWrapper(content, lang = 'en') {
  const logoUrl = lang === 'fr'
    ? 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-fr.png'
    : 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-en.png';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f5f0eb;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0eb;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER -->
          <tr>
            <td style="background:white;padding:20px 32px;border-radius:12px 12px 0 0;border-bottom:3px solid #E8650A;text-align:center;">
              <img src="${logoUrl}" alt="TheFirstWord" style="height:64px;width:auto;display:inline-block;" />
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:white;padding:36px 32px;border-radius:0 0 12px 12px;">
              ${content}
              ${signature}
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding:20px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:#9b9390;">
                © ${new Date().getFullYear()} TheFirstWord — thefirstword.ca<br>
                ${lang === 'en'
                  ? 'This email was sent because you used TheFirstWord to generate a personalized intervention kit.'
                  : 'Ce courriel vous a été envoyé parce que vous avez utilisé TheFirstWord pour générer un kit d\'intervention personnalisé.'
                }
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

// ─── KIT EMAIL ────────────────────────────────────────────────────────────────

function buildKitEmail(outputs, recipientName, lang) {
  const isEn = lang !== 'fr';
  const name = recipientName
    ? recipientName.charAt(0).toUpperCase() + recipientName.slice(1)
    : '';

  function mdToHtml(text) {
    if (!text) return '';
    // Normalize line endings
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n');
    let html = '';
    let inList = false;

    for (let line of lines) {
      // Inline bold/italic
      line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      line = line.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

      if (/^#{1,3}\s+/.test(line)) {
        if (inList) { html += '</ul>'; inList = false; }
        const txt = line.replace(/^#{1,3}\s+/, '');
        html += `<p style="margin:18px 0 6px;font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:1px solid #e8e0d8;padding-bottom:4px;">${txt}</p>`;
      }
      else if (/^(\d+\.|-|•|\*)\s+/.test(line)) {
        if (!inList) { html += '<table style="width:100%;margin:6px 0;" cellpadding="0" cellspacing="0">'; inList = true; }
        const txt = line.replace(/^(\d+\.|-|•|\*)\s+/, '');
        html += `<tr><td style="width:16px;font-size:14px;color:#2A7F7F;vertical-align:top;padding:3px 0;">•</td><td style="font-size:14px;color:#3a3330;line-height:1.7;padding:3px 0;">${txt}</td></tr>`;
      }
      else if (line.trim() === '') {
        if (inList) { html += '</table>'; inList = false; }
        html += '<div style="height:8px;"></div>';
      }
      else {
        if (inList) { html += '</table>'; inList = false; }
        html += `<p style="margin:0 0 8px;font-size:14px;line-height:1.8;color:#3a3330;">${line}</p>`;
      }
    }
    if (inList) html += '</table>';
    return html;
  }

  function section(label, emoji, color, rawText) {
    if (!rawText || !rawText.trim()) return '';
    return `
    <table style="width:100%;margin-bottom:24px;border:1px solid #e8e0d8;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#f5f0eb;padding:12px 20px;border-bottom:1px solid #e8e0d8;">
          <p style="margin:0;font-size:11px;font-weight:700;color:${color};letter-spacing:2px;text-transform:uppercase;">${emoji} ${label}</p>
        </td>
      </tr>
      <tr>
        <td style="background:white;padding:20px 24px;">
          ${mdToHtml(rawText)}
        </td>
      </tr>
    </table>`;
  }

  const sections = [
    section(isEn ? 'Intervention Letter' : "Lettre d'intervention", '📄', '#2A7F7F', outputs.letter),
    section(isEn ? 'Conversation Guide' : 'Guide de conversation', '📋', '#2A7F7F', outputs.guide),
    section(isEn ? 'SMS Message' : 'Message SMS', '💬', '#2A7F7F', outputs.sms),
    section(isEn ? 'Spoken Script' : 'Script parlé', '🎭', '#2A7F7F', outputs.script),
    section('Plan B', '🔄', '#c4622d', outputs.planB),
  ].join('');

  const content = `
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 6px;font-family:Georgia,serif;">
      ${isEn ? `Hi${name ? ' ' + name : ''},` : `Bonjour${name ? ' ' + name : ''},`}
    </p>
    <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 28px;">
      ${isEn
        ? 'Your personalized intervention kit is ready. Everything below was written specifically for your situation. Take your time reading it — and trust that reaching out took courage.'
        : "Votre kit d'intervention personnalisé est prêt. Tout ce qui suit a été rédigé spécifiquement pour votre situation. Prenez le temps de le lire — et faites confiance au fait que cette démarche demande du courage."
      }
    </p>

    ${sections}

    <table style="width:100%;background:#f0f7f7;border-left:4px solid #2A7F7F;border-radius:0 8px 8px 0;margin-top:8px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:16px 20px;">
          <p style="margin:0 0 6px;font-size:13px;color:#2A7F7F;font-weight:700;">${isEn ? 'A reminder' : 'Un rappel'}</p>
          <p style="margin:0;font-size:13px;color:#3a3330;line-height:1.6;">
            ${isEn
              ? "You don't have to say everything perfectly. What matters is that you show up. This kit is your foundation — use what feels right, adapt what doesn't."
              : "Vous n'avez pas à tout dire parfaitement. Ce qui compte, c'est d'être présent(e). Ce kit est votre point de départ — utilisez ce qui vous convient, adaptez le reste."
            }
          </p>
        </td>
      </tr>
    </table>
  `;

  return emailWrapper(content, lang);
}

// ─── WEEKLY EMAIL TEMPLATES ────────────────────────────────────────────────────

function buildWeeklyEmail(weekNumber, recipientName, lang, subscriberId) {
  const isEn = lang !== 'fr';
  const name = recipientName
    ? recipientName.charAt(0).toUpperCase() + recipientName.slice(1)
    : (isEn ? 'there' : '');

  const weeks = {
    1: {
      subject: isEn ? 'Week 1 — How are you doing?' : 'Semaine 1 — Comment allez-vous?',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? "It's been one week since you received your intervention kit. That took real courage, and we want to check in."
            : "Cela fait une semaine que vous avez reçu votre kit d'intervention. Cela a demandé un vrai courage, et nous voulons prendre de vos nouvelles."
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'This week, ask yourself:' : 'Cette semaine, demandez-vous:'}
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#3a3330;line-height:2;">
            <li>${isEn ? 'Have you had a chance to start the conversation?' : "Avez-vous eu l'occasion d'entamer la conversation?"}</li>
            <li>${isEn ? "If not, what's holding you back?" : "Sinon, qu'est-ce qui vous retient?"}</li>
            <li>${isEn ? 'Do you need to adjust the approach or the timing?' : "Avez-vous besoin d'ajuster l'approche ou le moment?"}</li>
          </ul>
        </div>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? "There is no perfect moment. But there is a right moment — and often, it's the one you create. Your kit is still there, ready when you are."
            : "Il n'y a pas de moment parfait. Mais il y a un bon moment — et souvent, c'est celui que vous créez. Votre kit est toujours là, prêt quand vous l'êtes."
          }
        </p>
        <p style="font-size:14px;color:#6b6460;font-style:italic;">
          ${isEn ? 'Reply to this email anytime if you need support.' : 'Répondez à ce courriel à tout moment si vous avez besoin de soutien.'}
        </p>
      `
    },
    2: {
      subject: isEn ? "Week 2 — If the conversation hasn't happened yet" : "Semaine 2 — Si la conversation n'a pas encore eu lieu",
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? "Two weeks in. Whether the conversation happened or not — you're still here, still trying. That means everything."
            : "Deux semaines. Que la conversation ait eu lieu ou non — vous êtes toujours là, vous essayez encore. C'est ce qui compte."
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? "If it didn't go as planned:" : "Si ça ne s'est pas passé comme prévu:"}
          </p>
          <p style="margin:0;font-size:14px;color:#3a3330;line-height:1.8;">
            ${isEn
              ? "Resistance is normal. Addiction rarely responds to one conversation. What matters is consistency — showing up again and again with love and clarity, not pressure."
              : "La résistance est normale. La dépendance répond rarement à une seule conversation. Ce qui compte, c'est la constance — revenir encore et encore avec amour et clarté, sans pression."
            }
          </p>
        </div>
        <div style="background:#f0f7f7;border-left:4px solid #2A7F7F;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <p style="margin:0;font-size:13px;color:#2A7F7F;font-weight:700;">${isEn ? 'Try this this week:' : 'Essayez ceci cette semaine:'}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#3a3330;line-height:1.6;">
            ${isEn
              ? "Choose one small, specific moment — not a sit-down intervention. A car ride. A quiet evening. One sentence from your letter, spoken out loud."
              : "Choisissez un petit moment précis — pas une intervention formelle. Un trajet en voiture. Une soirée calme. Une phrase de votre lettre, dite à voix haute."
            }
          </p>
        </div>
        <p style="font-size:14px;color:#6b6460;font-style:italic;">
          ${isEn ? "You're not alone in this. We're with you." : "Vous n'êtes pas seul(e) dans cette démarche. Nous sommes avec vous."}
        </p>
      `
    },
    3: {
      subject: isEn ? 'Week 3 — When resistance continues' : 'Semaine 3 — Quand la résistance persiste',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? "Three weeks. If your loved one is still resistant, it's time to think about your Plan B — and your own boundaries."
            : "Trois semaines. Si votre proche résiste encore, il est temps de réfléchir à votre Plan B — et à vos propres limites."
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'What Plan B looks like:' : 'À quoi ressemble le Plan B:'}
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#3a3330;line-height:2;">
            <li>${isEn ? "Clearly defining what you will and won't continue to accept" : "Définir clairement ce que vous accepterez ou non de continuer"}</li>
            <li>${isEn ? 'Setting a specific deadline or condition' : "Fixer une échéance ou une condition précise"}</li>
            <li>${isEn ? 'Involving another trusted person in the next conversation' : "Impliquer une autre personne de confiance dans la prochaine conversation"}</li>
            <li>${isEn ? 'Exploring professional intervention options' : "Explorer les options d'intervention professionnelle"}</li>
          </ul>
        </div>
        <div style="background:#fff8f0;border-left:4px solid #c4622d;padding:16px 20px;border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:13px;color:#c4622d;font-weight:700;">${isEn ? 'Your Plan B from your kit:' : 'Votre Plan B de votre kit:'}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#3a3330;line-height:1.6;">
            ${isEn
              ? 'Go back to the Plan B section of your original kit. It was written for exactly this moment.'
              : "Relisez la section Plan B de votre kit original. Elle a été rédigée exactement pour ce moment."
            }
          </p>
        </div>
      `
    },
    4: {
      subject: isEn ? 'Week 4 — What comes next' : 'Semaine 4 — Et maintenant',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? "Four weeks. You've been carrying something heavy — and you've kept going. That matters more than you know."
            : "Quatre semaines. Vous portez quelque chose de lourd — et vous avez continué. Cela compte plus que vous ne le savez."
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'Where things might stand:' : 'Où en sont les choses:'}
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#3a3330;line-height:2;">
            <li>${isEn ? '✅ Your loved one agreed to get help — keep supporting, keep documenting' : '✅ Votre proche a accepté de l\'aide — continuez à soutenir, continuez à documenter'}</li>
            <li>${isEn ? '⏳ Still resistant — a professional interventionist may be the next step' : '⏳ Toujours résistant(e) — un intervenant professionnel pourrait être la prochaine étape'}</li>
            <li>${isEn ? '💛 You need support too — your wellbeing is not optional' : '💛 Vous avez besoin de soutien aussi — votre bien-être n\'est pas optionnel'}</li>
          </ul>
        </div>
        <div style="background:#f0f7f7;border-radius:10px;padding:24px;text-align:center;">
          <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'Ready to try a different approach?' : 'Prêt(e) à essayer une approche différente?'}
          </p>
          <p style="margin:0 0 16px;font-size:13px;color:#6b6460;line-height:1.6;">
            ${isEn
              ? 'Click below and we\'ll bring up your original situation so you can generate a new Plan B strategy — no need to start from scratch.'
              : 'Cliquez ci-dessous et nous afficherons votre situation originale pour générer une nouvelle stratégie Plan B — sans repartir de zéro.'
            }
          </p>
          <a href="https://thefirstword.ca/app.html?returning=true&email=${encodeURIComponent(recipientName || '')}&lang=${lang}" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;">
            ${isEn ? 'Generate My Plan B →' : 'Générer mon Plan B →'}
          </a>
          <p style="margin:12px 0 0;font-size:11px;color:#9b9390;">
            ${isEn ? 'Your previous answers are saved. This takes less than 2 minutes.' : 'Vos réponses précédentes sont sauvegardées. Cela prend moins de 2 minutes.'}
          </p>
        </div>
      `
    }
  };

  const week = weeks[weekNumber];
  const unsubLink = subscriberId
    ? `<p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:20px;"><a href="https://thefirstword.ca/api/unsubscribe?id=${subscriberId}" style="color:#c0b8b0;">${isEn ? 'Unsubscribe from weekly emails' : 'Se désabonner des courriels hebdomadaires'}</a></p>`
    : '';
  return {
    subject: week.subject,
    html: emailWrapper(week.content + unsubLink, lang)
  };
}

// ─── RESEND HELPER ────────────────────────────────────────────────────────────

async function sendEmail(to, subject, html) {
  const resendKey = process.env.RESEND_API_KEY;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify({
      from: "TheFirstWord <hello@thefirstword.ca>",
      reply_to: "thefirstword.ca@gmail.com",
      to: [to],
      subject,
      html,
    }),
  });
  return response.json();
}

// ─── API: GENERATE ────────────────────────────────────────────────────────────

app.post("/api/generate", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured." });

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.content?.[0]?.text) {
      res.json({ letter: data.content[0].text });
    } else {
      res.status(500).json({ error: "Unexpected response from AI. Please try again." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect to AI. Please try again." });
  }
});

// ─── API: SEND KIT EMAIL + SAVE TO SUPABASE ───────────────────────────────────

app.post("/api/send-email", async (req, res) => {
  const { email, name, lang, outputs, plan } = req.body;
  if (!email || !outputs) return res.status(400).json({ error: "Missing email or outputs." });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });

  try {
    // 1. Send the kit email
    const html = buildKitEmail(outputs, name, lang);
    const subject = lang === 'fr'
      ? "Votre kit d'intervention personnalisé — TheFirstWord"
      : "Your personalized intervention kit — TheFirstWord";

    const emailResult = await sendEmail(email, subject, html);

    if (!emailResult.id) {
      console.error("Resend error:", emailResult);
      return res.status(500).json({ error: "Failed to send email." });
    }

    // 2. Save subscriber to Supabase — monthly plan ONLY gets weekly emails
    if (SUPABASE_KEY && plan === 'monthly') {
      try {
        await supabaseInsert('subscribers', {
          email,
          name: name || '',
          lang: lang || 'en',
          plan: plan || 'complete',
          signed_up_at: new Date().toISOString(),
          week1_sent: false,
          week2_sent: false,
          week3_sent: false,
          week4_sent: false,
          active: true
        });
        console.log(`Subscriber saved: ${email}`);
      } catch (dbErr) {
        console.error("Supabase save error:", dbErr);
        // Don't fail the request if DB save fails
      }
    }

    res.json({ success: true, id: emailResult.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

// ─── API: SEND WEEKLY EMAILS (called by GitHub Actions) ──────────────────────

app.post("/api/send-weekly-batch", async (req, res) => {
  const authHeader = req.headers['x-cron-secret'];
  if (authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured." });

  try {
    const now = new Date();
    const results = { sent: 0, failed: 0, skipped: 0 };

    // Get all active subscribers
    const subscribers = await supabaseQuery('subscribers', 'active=eq.true&select=*');

    for (const sub of subscribers) {
      const signedUp = new Date(sub.signed_up_at);
      const daysSince = Math.floor((now - signedUp) / (1000 * 60 * 60 * 24));

      const weekChecks = [
        { week: 1, field: 'week1_sent', minDays: 7, maxDays: 13 },
        { week: 2, field: 'week2_sent', minDays: 14, maxDays: 20 },
        { week: 3, field: 'week3_sent', minDays: 21, maxDays: 27 },
        { week: 4, field: 'week4_sent', minDays: 28, maxDays: 34 },
      ];
      // After week 4: send continuation opt-in email for monthly subscribers
      const allSent = sub.week1_sent && sub.week2_sent && sub.week3_sent && sub.week4_sent;
      if (allSent && sub.plan === 'monthly' && daysSince >= 35 && daysSince <= 41) {
        try {
          const isEn = sub.lang !== 'fr';
          const subName = sub.name ? sub.name.charAt(0).toUpperCase() + sub.name.slice(1) : (isEn ? 'there' : '');
          const continueUrl = 'https://thefirstword.ca/api/checkin-continue?id=' + sub.id + '&choice=yes';
          const stopUrl = 'https://thefirstword.ca/api/checkin-continue?id=' + sub.id + '&choice=no';
          const unsubUrl = 'https://thefirstword.ca/api/unsubscribe?id=' + sub.id;

          const subject = isEn ? 'Do you still need us?' : 'Avez-vous encore besoin de nous?';

          const greeting = isEn ? ('Hi ' + subName + ',') : ('Bonjour ' + subName + ',');
          const intro = isEn
            ? "It's been 4 weeks since you started this journey. We want to check in one more time — are you still in the thick of it, or has things changed?"
            : "Cela fait 4 semaines que vous avez commencé ce parcours. Nous voulons prendre de vos nouvelles une dernière fois — êtes-vous toujours dans la situation?";
          const question = isEn ? 'Do you still need weekly support?' : 'Avez-vous encore besoin de soutien hebdomadaire?';
          const yesLabel = isEn ? '✅ Yes, keep them coming' : '✅ Oui, continuez';
          const noLabel = isEn ? "🙏 No, I'm okay now" : '🙏 Non, ça va maintenant';
          const noteText = isEn
            ? 'If you click Yes, your weekly check-ins will continue every Monday.'
            : 'Si vous cliquez Oui, vos suivis hebdomadaires continueront chaque lundi.';
          const unsubLabel = isEn ? 'Unsubscribe from all emails' : 'Se désabonner de tous les courriels';

          const bodyHtml = '<p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">' + greeting + '</p>'
            + '<p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 24px;">' + intro + '</p>'
            + '<table style="width:100%;background:#f5f0eb;border-radius:12px;margin-bottom:24px;" cellpadding="24" cellspacing="0">'
            + '<tr><td style="text-align:center;">'
            + '<p style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1a1a1a;">' + question + '</p>'
            + '<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>'
            + '<td style="padding-right:12px;"><a href="' + continueUrl + '" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:700;">' + yesLabel + '</a></td>'
            + '<td><a href="' + stopUrl + '" style="display:inline-block;background:white;color:#3a3330;text-decoration:none;padding:14px 28px;border-radius:8px;font-size:14px;font-weight:700;border:1px solid #e8e0d8;">' + noLabel + '</a></td>'
            + '</tr></table>'
            + '</td></tr></table>'
            + '<p style="font-size:13px;color:#9b9390;text-align:center;">' + noteText + '</p>'
            + '<p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:16px;"><a href="' + unsubUrl + '" style="color:#c0b8b0;">' + unsubLabel + '</a></p>';

          const html = emailWrapper(bodyHtml, sub.lang);
          const result = await sendEmail(sub.email, subject, html);
          if (result.id) {
            results.sent++;
            console.log('Continuation email sent to ' + sub.email);
          }
        } catch(e) {
          console.error('Continuation email failed for ' + sub.email + ':', e);
          results.failed++;
        }
        continue;
      }

      for (const check of weekChecks) {
        if (!sub[check.field] && daysSince >= check.minDays && daysSince <= check.maxDays) {
          try {
            const { subject, html } = buildWeeklyEmail(check.week, sub.name, sub.lang, sub.id);
            const result = await sendEmail(sub.email, subject, html);

            if (result.id) {
              await supabaseUpdate('subscribers', sub.id, { [check.field]: true });
              results.sent++;
              console.log(`Week ${check.week} sent to ${sub.email}`);
            } else {
              results.failed++;
            }
          } catch (e) {
            console.error(`Failed for ${sub.email}:`, e);
            results.failed++;
          }
          break;
        }
      }
    }

    res.json({ success: true, ...results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Batch send failed." });
  }
});

// ─── API: WEEKLY CONTINUATION OPT-IN/OUT ─────────────────────────────────────

app.get("/api/checkin-continue", async (req, res) => {
  const { id, choice } = req.query;
  if (!id || !choice) return res.status(400).send('Missing parameters');
  if (!SUPABASE_KEY) return res.status(500).send('Database not configured');

  try {
    if (choice === 'yes') {
      // Reset week counters so they get another 4 weeks
      await supabaseUpdate('subscribers', id, {
        week1_sent: false,
        week2_sent: false,
        week3_sent: false,
        week4_sent: false,
        active: true,
        signed_up_at: new Date().toISOString()
      });
      res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:500px;margin:80px auto;text-align:center;padding:20px;">
        <div style="font-size:48px;margin-bottom:16px;">💚</div>
        <h2 style="color:#1a1a1a;margin-bottom:12px;">We're still with you.</h2>
        <p style="color:#6b6460;line-height:1.7;">Your weekly check-ins will continue. You'll hear from us again next Monday. You're not doing this alone.</p>
        <a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Return to TheFirstWord</a>
      </body></html>`);
    } else {
      await supabaseUpdate('subscribers', id, { active: false });
      res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:500px;margin:80px auto;text-align:center;padding:20px;">
        <div style="font-size:48px;margin-bottom:16px;">🙏</div>
        <h2 style="color:#1a1a1a;margin-bottom:12px;">Thank you for letting us know.</h2>
        <p style="color:#6b6460;line-height:1.7;">We hope things are moving in the right direction. You can always come back to TheFirstWord if you need support again.</p>
        <a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Return to TheFirstWord</a>
      </body></html>`);
    }
  } catch(err) {
    console.error(err);
    res.status(500).send('Something went wrong. Please try again.');
  }
});

app.get("/api/unsubscribe", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).send('Missing id');
  if (!SUPABASE_KEY) return res.status(500).send('Database not configured');
  try {
    await supabaseUpdate('subscribers', id, { active: false });
    res.send(`<!DOCTYPE html><html><body style="font-family:Georgia,serif;max-width:500px;margin:80px auto;text-align:center;padding:20px;">
      <h2 style="color:#1a1a1a;margin-bottom:12px;">You've been unsubscribed.</h2>
      <p style="color:#6b6460;line-height:1.7;">You won't receive any more emails from TheFirstWord. We wish you and your family well.</p>
      <a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Return to TheFirstWord</a>
    </body></html>`);
  } catch(err) {
    res.status(500).send('Something went wrong.');
  }
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
        found: true,
        name: sub.name,
        lang: sub.lang,
        plan: sub.plan,
        signedUpAt: sub.signed_up_at
      });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// ─── CATCH ALL ────────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TheFirstWord running on port ${PORT}`));
