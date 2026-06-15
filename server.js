const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── MARKDOWN → HTML ──────────────────────────────────────────────────────────

function markdownToHtml(text) {
  if (!text) return '';
  return text
    // Strip markdown bold but keep the text
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#1a1a1a;">$1</strong>')
    // H2 headers (##)
    .replace(/^## (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;color:#2A7F7F;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px;">$1</h3>')
    // H1 headers (#)
    .replace(/^# (.+)$/gm, '<h2 style="font-size:16px;font-weight:700;color:#1a1a1a;margin:20px 0 8px;">$1</h2>')
    // Bullet points (- or •)
    .replace(/^[-•] (.+)$/gm, '<div style="display:flex;gap:8px;margin:4px 0;"><span style="color:#2A7F7F;flex-shrink:0;">•</span><span>$1</span></div>')
    // Horizontal rule
    .replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #e8e0d8;margin:16px 0;">')
    // Blank lines → paragraph breaks
    .replace(/\n\n+/g, '</p><p style="font-size:14px;line-height:1.8;color:#3a3330;margin:8px 0;">')
    // Single newlines → line breaks (inside paragraphs)
    .replace(/\n/g, '<br>');
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
              <img src="${lang === 'fr'
                ? 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-fr.png'
                : 'https://raw.githubusercontent.com/ssoussa/thefirstword/main/logo-en.png'
              }" alt="TheFirstWord" style="height:96px;width:auto;display:inline-block;" />
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

// ─── TRANSACTIONAL EMAIL: KIT DELIVERY ────────────────────────────────────────

function buildKitEmail(outputs, recipientName, lang) {
  const isEn = lang !== 'fr';

  const outputSection = (label, emoji, content) => `
    <div style="margin-bottom:28px;border:1px solid #e8e0d8;border-radius:10px;overflow:hidden;">
      <div style="background:#f5f0eb;padding:12px 20px;border-bottom:1px solid #e8e0d8;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#2A7F7F;letter-spacing:1px;text-transform:uppercase;">${emoji} ${label}</p>
      </div>
      <div style="padding:20px;">
        <p style="font-size:14px;line-height:1.8;color:#3a3330;margin:0;">${markdownToHtml(content)}</p>
      </div>
    </div>
  `;

  const sections = [];
  if (outputs.letter) sections.push(outputSection(isEn ? 'Intervention Letter' : 'Lettre d\'intervention', '📄', outputs.letter));
  if (outputs.guide) sections.push(outputSection(isEn ? 'Conversation Guide' : 'Guide de conversation', '📋', outputs.guide));
  if (outputs.sms) sections.push(outputSection(isEn ? 'SMS Message' : 'Message SMS', '💬', outputs.sms));
  if (outputs.script) sections.push(outputSection(isEn ? 'Spoken Script' : 'Script parlé', '🎭', outputs.script));
  if (outputs.planB) sections.push(outputSection('Plan B', '🔄', outputs.planB));

  const content = `
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">
      ${isEn ? `Hi${recipientName ? ' ' + recipientName : ''},` : `Bonjour${recipientName ? ' ' + recipientName : ''},`}
    </p>
    <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 24px;">
      ${isEn
        ? 'Your personalized intervention kit is ready. Everything below was written specifically for your situation. Take your time, read it through, and trust yourself — reaching out took courage.'
        : 'Votre kit d\'intervention personnalisé est prêt. Tout ce qui suit a été rédigé spécifiquement pour votre situation. Prenez le temps de le lire et faites confiance à votre instinct — faire cette démarche demande du courage.'
      }
    </p>

    ${sections.join('')}

    <div style="background:#f0f7f7;border-left:4px solid #2A7F7F;padding:16px 20px;border-radius:0 8px 8px 0;margin-top:8px;">
      <p style="margin:0;font-size:13px;color:#2A7F7F;font-weight:700;">${isEn ? 'A reminder' : 'Un rappel'}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#3a3330;line-height:1.6;">
        ${isEn
          ? 'You don\'t have to say everything perfectly. What matters is that you show up. This kit is your foundation — use what feels right, adapt what doesn\'t.'
          : 'Vous n\'avez pas à tout dire parfaitement. Ce qui compte, c\'est d\'être présent(e). Ce kit est votre point de départ — utilisez ce qui vous convient, adaptez le reste.'
        }
      </p>
    </div>
  `;

  return emailWrapper(content, lang);
}

// ─── WEEKLY EMAIL TEMPLATES ────────────────────────────────────────────────────

function buildWeeklyEmail(weekNumber, recipientName, lang, outputs) {
  const isEn = lang !== 'fr';
  const name = recipientName || (isEn ? 'there' : '');

  const weeks = {
    1: {
      subject: isEn ? 'Your first week — how are you doing?' : 'Votre première semaine — comment allez-vous?',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'It\'s been one week since you received your intervention kit. That took real courage, and we want to check in.'
            : 'Cela fait une semaine que vous avez reçu votre kit d\'intervention. Cela a demandé un vrai courage, et nous voulons prendre de vos nouvelles.'
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'This week, ask yourself:' : 'Cette semaine, demandez-vous:'}
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#3a3330;line-height:2;">
            <li>${isEn ? 'Have you had a chance to start the conversation?' : 'Avez-vous eu l\'occasion d\'entamer la conversation?'}</li>
            <li>${isEn ? 'If not, what\'s holding you back?' : 'Sinon, qu\'est-ce qui vous retient?'}</li>
            <li>${isEn ? 'Do you need to adjust the approach or the timing?' : 'Avez-vous besoin d\'ajuster l\'approche ou le moment?'}</li>
          </ul>
        </div>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'There is no perfect moment. But there is a right moment — and often, it\'s the one you create. Your kit is still there, ready when you are.'
            : 'Il n\'y a pas de moment parfait. Mais il y a un bon moment — et souvent, c\'est celui que vous créez. Votre kit est toujours là, prêt quand vous l\'êtes.'
          }
        </p>
        <p style="font-size:14px;color:#6b6460;font-style:italic;">
          ${isEn ? 'Reply to this email anytime if you need support.' : 'Répondez à ce courriel à tout moment si vous avez besoin de soutien.'}
        </p>
      `
    },
    2: {
      subject: isEn ? 'Week 2 — if the conversation hasn\'t happened yet' : 'Semaine 2 — si la conversation n\'a pas encore eu lieu',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'Two weeks in. Whether the conversation happened or not — you\'re still here, still trying. That means everything.'
            : 'Deux semaines. Que la conversation ait eu lieu ou non — vous êtes toujours là, vous essayez encore. C\'est ce qui compte.'
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'If it didn\'t go as planned:' : 'Si ça ne s\'est pas passé comme prévu:'}
          </p>
          <p style="margin:0;font-size:14px;color:#3a3330;line-height:1.8;">
            ${isEn
              ? 'Resistance is normal. Addiction rarely responds to one conversation. What matters is consistency — showing up again and again with love and clarity, not pressure.'
              : 'La résistance est normale. La dépendance répond rarement à une seule conversation. Ce qui compte, c\'est la constance — revenir encore et encore avec amour et clarté, sans pression.'
            }
          </p>
        </div>
        <div style="background:#f0f7f7;border-left:4px solid #2A7F7F;padding:16px 20px;border-radius:0 8px 8px 0;margin-bottom:20px;">
          <p style="margin:0;font-size:13px;color:#2A7F7F;font-weight:700;">${isEn ? 'Try this this week:' : 'Essayez ceci cette semaine:'}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#3a3330;line-height:1.6;">
            ${isEn
              ? 'Choose one small, specific moment — not a sit-down intervention. A car ride. A quiet evening. One sentence from your letter, spoken out loud.'
              : 'Choisissez un petit moment précis — pas une intervention formelle. Un trajet en voiture. Une soirée calme. Une phrase de votre lettre, dite à voix haute.'
            }
          </p>
        </div>
        <p style="font-size:14px;color:#6b6460;font-style:italic;">
          ${isEn ? 'You\'re not alone in this. We\'re with you.' : 'Vous n\'êtes pas seul(e) dans cette démarche. Nous sommes avec vous.'}
        </p>
      `
    },
    3: {
      subject: isEn ? 'Week 3 — when resistance continues' : 'Semaine 3 — quand la résistance persiste',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'Three weeks. If your loved one is still resistant, it\'s time to think about your Plan B — and your own boundaries.'
            : 'Trois semaines. Si votre proche résiste encore, il est temps de réfléchir à votre Plan B — et à vos propres limites.'
          }
        </p>
        <div style="background:#f5f0eb;border-radius:10px;padding:24px;margin-bottom:24px;">
          <p style="margin:0 0 12px;font-size:14px;font-weight:700;color:#1a1a1a;">
            ${isEn ? 'What Plan B looks like:' : 'À quoi ressemble le Plan B:'}
          </p>
          <ul style="margin:0;padding-left:20px;font-size:14px;color:#3a3330;line-height:2;">
            <li>${isEn ? 'Clearly defining what you will and won\'t continue to accept' : 'Définir clairement ce que vous accepterez ou non de continuer'}</li>
            <li>${isEn ? 'Setting a specific deadline or condition' : 'Fixer une échéance ou une condition précise'}</li>
            <li>${isEn ? 'Involving another trusted person in the next conversation' : 'Impliquer une autre personne de confiance dans la prochaine conversation'}</li>
            <li>${isEn ? 'Exploring professional intervention options' : 'Explorer les options d\'intervention professionnelle'}</li>
          </ul>
        </div>
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'Loving someone through addiction does not mean absorbing all the consequences. You are allowed to protect yourself while still fighting for them.'
            : 'Aimer quelqu\'un à travers la dépendance ne signifie pas absorber toutes les conséquences. Vous avez le droit de vous protéger tout en vous battant pour eux.'
          }
        </p>
        <div style="background:#fff8f0;border-left:4px solid #c4622d;padding:16px 20px;border-radius:0 8px 8px 0;">
          <p style="margin:0;font-size:13px;color:#c4622d;font-weight:700;">${isEn ? 'Your Plan B from your kit:' : 'Votre Plan B de votre kit:'}</p>
          <p style="margin:6px 0 0;font-size:13px;color:#3a3330;line-height:1.6;">
            ${isEn
              ? 'Go back to the Plan B section of your original kit. It was written for exactly this moment.'
              : 'Relisez la section Plan B de votre kit original. Elle a été rédigée exactement pour ce moment.'
            }
          </p>
        </div>
      `
    },
    4: {
      subject: isEn ? 'Week 4 — what comes next' : 'Semaine 4 — et maintenant',
      content: `
        <p style="font-size:16px;color:#1a1a1a;margin:0 0 8px;">${isEn ? `Hi ${name},` : `Bonjour ${name},`}</p>
        <p style="font-size:15px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'Four weeks. You\'ve been carrying something heavy — and you\'ve kept going. That matters more than you know.'
            : 'Quatre semaines. Vous portez quelque chose de lourd — et vous avez continué. Cela compte plus que vous ne le savez.'
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
        <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
          ${isEn
            ? 'If you\'d like to continue with monthly support — new approaches, fresh strategies, someone in your corner — your plan is still active.'
            : 'Si vous souhaitez continuer avec un soutien mensuel — nouvelles approches, stratégies actualisées, quelqu\'un dans votre coin — votre plan est toujours actif.'
          }
        </p>
        <div style="background:#f0f7f7;border-radius:10px;padding:20px 24px;text-align:center;">
          <p style="margin:0 0 12px;font-size:14px;color:#1a1a1a;">
            ${isEn ? 'Need to regenerate your kit with a new approach?' : 'Besoin de régénérer votre kit avec une nouvelle approche?'}
          </p>
          <a href="https://thefirstword.ca/app.html" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;">
            ${isEn ? 'Return to TheFirstWord →' : 'Retourner à TheFirstWord →'}
          </a>
        </div>
      `
    }
  };

  const week = weeks[weekNumber];
  return {
    subject: week.subject,
    html: emailWrapper(week.content, lang)
  };
}

// ─── API: GENERATE (Claude AI) ────────────────────────────────────────────────

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

// ─── API: SEND KIT EMAIL ──────────────────────────────────────────────────────

app.post("/api/send-email", async (req, res) => {
  const { email, name, lang, outputs } = req.body;
  if (!email || !outputs) return res.status(400).json({ error: "Missing email or outputs." });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });

  try {
    const html = buildKitEmail(outputs, name, lang);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "TheFirstWord <hello@thefirstword.ca>",
        reply_to: "thefirstword.ca@gmail.com",
        to: [email],
        subject: lang === 'fr'
          ? "Votre kit d'intervention personnalisé — TheFirstWord"
          : "Your personalized intervention kit — TheFirstWord",
        html,
      }),
    });

    const data = await response.json();
    if (data.id) {
      res.json({ success: true, id: data.id });
    } else {
      console.error("Resend error:", data);
      res.status(500).json({ error: "Failed to send email. Please try again." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send email." });
  }
});

// ─── API: SEND WEEKLY EMAIL ───────────────────────────────────────────────────

app.post("/api/send-weekly", async (req, res) => {
  const { email, name, lang, weekNumber, outputs } = req.body;
  if (!email || !weekNumber) return res.status(400).json({ error: "Missing required fields." });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });

  try {
    const { subject, html } = buildWeeklyEmail(weekNumber, name, lang, outputs);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: "TheFirstWord <hello@thefirstword.ca>",
        reply_to: "thefirstword.ca@gmail.com",
        to: [email],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (data.id) {
      res.json({ success: true, id: data.id });
    } else {
      console.error("Resend error:", data);
      res.status(500).json({ error: "Failed to send weekly email." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send weekly email." });
  }
});

// ─── CATCH ALL ────────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TheFirstWord running on port ${PORT}`));
