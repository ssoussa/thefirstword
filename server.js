const express = require("express");
const cors = require("cors");
const path = require("path");
const PDFDocument = require("pdfkit");

const app = express();
app.use(cors());
// IMPORTANT: the Stripe webhook route (/api/stripe-webhook) needs the raw,
// unmodified request body to verify Stripe's signature. express.json() below
// runs globally and would parse/re-serialize the body before the webhook
// route's own express.raw() middleware ever sees it — and once the body is
// re-serialized, its bytes no longer match what Stripe originally signed,
// so signature verification always fails. We skip the global JSON parser
// specifically for that one path so its raw bytes survive intact.
app.use((req, res, next) => {
  if (req.path === '/api/stripe-webhook') return next();
  express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname)));

// ─── SUPABASE CONFIG ──────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://blelhuisbjvtckephqxd.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function supabaseUpsert(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

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
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  const body = await res.json();
  if (res.status >= 400) {
    console.error(`supabaseUpdate error ${res.status}:`, JSON.stringify(body));
  }
  return body;
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
              <img src="${logoUrl}" alt="TheFirstWord" style="width:200px;height:auto;display:inline-block;" />
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

function buildKitEmail(outputs, recipientName, lang, subscriberId, recipientEmail) {
  const isEn = lang !== 'fr';
  const name = recipientName
    ? recipientName.charAt(0).toUpperCase() + recipientName.slice(1)
    : '';

  // Build the kit URL for "Open My Full Kit" button
  const kitUrl = `https://thefirstword.ca/app.html?returning=true&view=kit&email=${encodeURIComponent(recipientEmail || '')}&lang=${lang}`;

  // Preview: first 300 chars of plain text, strip markdown
  function preview(text) {
    if (!text) return '';
    return text
      .replace(/#{1,3}\s+/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/\n+/g, ' ')
      .trim()
      .slice(0, 300) + (text.length > 300 ? '...' : '');
  }

  function sectionCard(label, emoji, rawText, sectionParam) {
    if (!rawText || !rawText.trim()) return '';
    const sectionUrl = kitUrl + (sectionParam ? `#${sectionParam}` : '');
    const previewText = preview(rawText);
    const readMore = isEn ? 'Read full version →' : 'Lire la version complète →';
    return `
    <table style="width:100%;margin-bottom:20px;border:1px solid #e8e0d8;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:#f5f0eb;padding:10px 20px;border-bottom:1px solid #e8e0d8;">
          <p style="margin:0;font-size:11px;font-weight:700;color:#2A7F7F;letter-spacing:2px;text-transform:uppercase;">${emoji} ${label}</p>
        </td>
      </tr>
      <tr>
        <td style="background:white;padding:16px 20px;">
          <p style="margin:0 0 14px;font-size:14px;color:#3a3330;line-height:1.7;">${previewText}</p>
          <a href="${kitUrl}" style="display:inline-block;border:1.5px solid #2A7F7F;color:#2A7F7F;text-decoration:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;">${readMore}</a>
        </td>
      </tr>
    </table>`;
  }

  const sections = [
    sectionCard(isEn ? 'Intervention Letter' : "Lettre d'intervention", '📄', outputs.letter),
    sectionCard(isEn ? 'Conversation Guide' : 'Guide de conversation', '📋', outputs.guide),
    sectionCard(isEn ? 'SMS Message' : 'Message SMS', '💬', outputs.sms),
    sectionCard(isEn ? 'Spoken Script' : 'Script parlé', '🎭', outputs.script),
    sectionCard('Plan B', '🔄', outputs.planB),
  ].join('');

  // Unsubscribe footer — only if we have a subscriber ID
  const unsubFooter = subscriberId
    ? `<p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:24px;">
        <a href="https://thefirstword.ca/api/unsubscribe?id=${subscriberId}" style="color:#c0b8b0;text-decoration:underline;">
          ${isEn ? 'Unsubscribe from all emails' : 'Se désabonner de tous les courriels'}
        </a>
      </p>`
    : '';

  const content = `
    <p style="font-size:16px;color:#1a1a1a;margin:0 0 6px;font-family:Georgia,serif;">
      ${isEn ? `Hi${name ? ' ' + name : ''},` : `Bonjour${name ? ' ' + name : ''},`}
    </p>
    <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 24px;">
      ${isEn
        ? 'Your personalized intervention kit is ready. Below is a preview of each section.'
        : "Votre kit d'intervention personnalisé est prêt. Voici un aperçu de chaque section."
      }
    </p>

    <!-- BIG OPEN KIT BUTTON -->
    <table style="width:100%;margin-bottom:28px;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="text-align:center;background:#1C2B3A;border-radius:10px;padding:20px 24px;">
          <a href="${kitUrl}" style="display:inline-block;background:#C4622D;color:white;text-decoration:none;padding:16px 36px;border-radius:8px;font-size:17px;font-weight:700;letter-spacing:0.3px;">
            📖 ${isEn ? 'Open My Full Kit →' : 'Ouvrir mon kit complet →'}
          </a>
          <p style="margin:10px 0 0;font-size:12px;color:rgba(255,255,255,0.5);">
            ${isEn ? 'All 5 sections available on the site — works on any device.' : 'Les 5 sections disponibles sur le site — fonctionne sur tous les appareils.'}
          </p>
        </td>
      </tr>
    </table>

    ${sections}

    ${unsubFooter}
  `;

  return emailWrapper(content, lang);
}

// ─── WEEKLY EMAIL TEMPLATES ────────────────────────────────────────────────────

function buildWeeklyEmail(weekNumber, recipientName, lang, subscriberId, recipientEmail) {
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
          <a href="https://thefirstword.ca/app.html?returning=true&email=${encodeURIComponent(recipientEmail || '')}&lang=${lang}" style="display:inline-block;background:#2A7F7F;color:white;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:700;">
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

// ─── INVOICE PDF GENERATOR ────────────────────────────────────────────────────

const PLAN_PRICES = {
  starter:   { en: 'Starter',   fr: 'Débutant',  price: '$9.00',  desc_en: 'Intervention Letter + Conversation Guide', desc_fr: "Lettre d'intervention + Guide de conversation" },
  essential: { en: 'Essential', fr: 'Essentiel',  price: '$19.00', desc_en: 'Letter + Guide + SMS + Spoken Script',     desc_fr: 'Lettre + Guide + SMS + Script parlé' },
  complete:  { en: 'Complete',  fr: 'Complet',    price: '$29.00', desc_en: 'Letter + Guide + SMS + Script + Plan B',   desc_fr: 'Lettre + Guide + SMS + Script + Plan B' },
  monthly:   { en: 'Premium',   fr: 'Premium',    price: '$19.00', desc_en: 'Premium — Monthly Subscription',           desc_fr: 'Premium — Abonnement mensuel' },
};

function generateInvoicePDF(email, name, plan, lang) {
  return new Promise((resolve, reject) => {
    try {
      const isEn = lang !== 'fr';
      const planInfo = PLAN_PRICES[plan] || PLAN_PRICES.essential;
      const invoiceNum = 'TFW-' + Date.now();
      const dateStr = new Date().toLocaleDateString(isEn ? 'en-CA' : 'fr-CA', {
        year: 'numeric', month: 'long', day: 'numeric'
      });

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── HEADER ──────────────────────────────────────────────────────────────
      // Brand name
      doc.font('Helvetica-Bold').fontSize(22).fillColor('#1C2B3A').text('TheFirstWord', 50, 50);
      doc.font('Helvetica').fontSize(10).fillColor('#2A7F7F').text('thefirstword.ca', 50, 76);
      doc.font('Helvetica').fontSize(10).fillColor('#5a6a7a').text('hello@thefirstword.ca', 50, 90);

      // Invoice label (top right)
      doc.font('Helvetica-Bold').fontSize(28).fillColor('#C4622D')
        .text(isEn ? 'INVOICE' : 'FACTURE', 350, 50, { align: 'right', width: 195 });

      // Divider line
      doc.moveTo(50, 120).lineTo(545, 120).strokeColor('#E8E2D9').lineWidth(1).stroke();

      // ── INVOICE DETAILS ──────────────────────────────────────────────────────
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'INVOICE NUMBER' : 'NUMÉRO DE FACTURE', 50, 140);
      doc.font('Helvetica').fontSize(11).fillColor('#1C2B3A').text(invoiceNum, 50, 155);

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'DATE' : 'DATE', 220, 140);
      doc.font('Helvetica').fontSize(11).fillColor('#1C2B3A').text(dateStr, 220, 155);

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'PAYMENT STATUS' : 'STATUT DU PAIEMENT', 390, 140);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#2A7F7F')
        .text(isEn ? '✓ PAID' : '✓ PAYÉ', 390, 155);

      // ── BILLED TO ────────────────────────────────────────────────────────────
      doc.moveTo(50, 185).lineTo(545, 185).strokeColor('#E8E2D9').lineWidth(0.5).stroke();

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'BILLED TO' : 'FACTURÉ À', 50, 200);
      if (name) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2B3A').text(name, 50, 215);
        doc.font('Helvetica').fontSize(11).fillColor('#5a6a7a').text(email, 50, 231);
      } else {
        doc.font('Helvetica').fontSize(11).fillColor('#1C2B3A').text(email, 50, 215);
      }

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'SOLD BY' : 'VENDU PAR', 350, 200);
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#1C2B3A').text('TheFirstWord', 350, 215);
      doc.font('Helvetica').fontSize(11).fillColor('#5a6a7a').text('Québec, Canada', 350, 231);

      // ── LINE ITEMS TABLE ─────────────────────────────────────────────────────
      const tableTop = 280;

      // Table header background
      doc.rect(50, tableTop, 495, 28).fill('#1C2B3A');

      doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
        .text(isEn ? 'DESCRIPTION' : 'DESCRIPTION', 62, tableTop + 9)
        .text(isEn ? 'PLAN' : 'PLAN', 340, tableTop + 9)
        .text(isEn ? 'AMOUNT' : 'MONTANT', 460, tableTop + 9);

      // Table row
      doc.rect(50, tableTop + 28, 495, 40).fill('#F7F4EF');

      const planLabel = isEn ? planInfo.en : planInfo.fr;
      const planDesc = isEn ? planInfo.desc_en : planInfo.desc_fr;

      doc.font('Helvetica').fontSize(10).fillColor('#1C2B3A')
        .text(planDesc, 62, tableTop + 37, { width: 265 });
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#1C2B3A')
        .text(planLabel, 340, tableTop + 37);
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#C4622D')
        .text(planInfo.price, 460, tableTop + 37);

      // ── TOTALS ───────────────────────────────────────────────────────────────
      const totTop = tableTop + 88;

      doc.moveTo(350, totTop).lineTo(545, totTop).strokeColor('#E8E2D9').lineWidth(0.5).stroke();

      doc.font('Helvetica').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'Subtotal' : 'Sous-total', 350, totTop + 10)
        .text(planInfo.price, 490, totTop + 10, { align: 'right', width: 55 });

      doc.font('Helvetica').fontSize(10).fillColor('#5a6a7a')
        .text(isEn ? 'QST / GST' : 'TVQ / TPS', 350, totTop + 28)
        .text(isEn ? 'N/A' : 'S/O', 490, totTop + 28, { align: 'right', width: 55 });

      doc.moveTo(350, totTop + 48).lineTo(545, totTop + 48).strokeColor('#1C2B3A').lineWidth(1).stroke();

      doc.font('Helvetica-Bold').fontSize(13).fillColor('#1C2B3A')
        .text(isEn ? 'TOTAL' : 'TOTAL', 350, totTop + 56)
        .text(planInfo.price, 490, totTop + 56, { align: 'right', width: 55 });

      // ── NOTE ─────────────────────────────────────────────────────────────────
      doc.rect(50, totTop + 100, 495, 36).fill('#e8f4f4');
      doc.font('Helvetica').fontSize(9).fillColor('#2A7F7F')
        .text(
          isEn
            ? 'Payment processed securely by Stripe. TheFirstWord is not currently registered for QST/GST. No tax applies to this transaction.'
            : 'Paiement traité de façon sécurisée par Stripe. TheFirstWord n\'est pas actuellement inscrit aux fins de la TVQ/TPS. Aucune taxe ne s\'applique à cette transaction.',
          62, totTop + 111, { width: 471 }
        );

      // ── FOOTER ───────────────────────────────────────────────────────────────
      doc.font('Helvetica').fontSize(9).fillColor('#9b9390')
        .text(
          isEn
            ? 'Thank you for using TheFirstWord. This receipt confirms your purchase. For any questions: thefirstword.ca@gmail.com'
            : 'Merci d\'utiliser TheFirstWord. Ce reçu confirme votre achat. Pour toute question : thefirstword.ca@gmail.com',
          50, 720, { align: 'center', width: 495 }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ─── RESEND HELPER ────────────────────────────────────────────────────────────

async function sendEmail(to, subject, html, attachments = []) {
  const resendKey = process.env.RESEND_API_KEY;
  const payload = {
    from: "TheFirstWord <hello@thefirstword.ca>",
    reply_to: "thefirstword.ca@gmail.com",
    to: [to],
    subject,
    html,
  };
  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${resendKey}`,
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

// ─── RATE LIMITING (in-memory, no package needed) ────────────────────────────

const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;       // max requests
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // per hour

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// Clean up old entries every hour to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now - entry.start > RATE_LIMIT_WINDOW) rateLimitMap.delete(ip);
  }
}, RATE_LIMIT_WINDOW);

// ─── API: GENERATE ────────────────────────────────────────────────────────────

app.post("/api/generate", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: "Too many requests. Please wait before trying again." });
  }

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
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    if (data.content?.[0]?.text) {
      res.json({ letter: data.content[0].text });
    } else {
      // Notify operator of unexpected AI response
      try {
        await sendEmail('thefirstword.ca@gmail.com', '⚠️ TheFirstWord — AI generation error', emailWrapper(`
          <p style="font-size:15px;color:#1a1a1a;margin:0 0 12px;">An /api/generate call returned an unexpected response from the Anthropic API.</p>
          <p style="font-size:13px;color:#6b6460;">Response: <code>${JSON.stringify(data).slice(0, 500)}</code></p>
          <p style="font-size:13px;color:#6b6460;margin-top:8px;">Time: ${new Date().toISOString()}</p>
        `, 'en'));
      } catch(e) { /* non-blocking */ }
      res.status(500).json({ error: "Unexpected response from AI. Please try again." });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to connect to AI. Please try again." });
  }
});

// ─── API: CHAT WIDGET ──────────────────────────────────────────────────────────
// Bilingual support/screening chatbot. Separate rate limiter from /api/generate
// so kit generation and chat usage don't compete for the same quota.

const chatRateLimitMap = new Map();
const CHAT_RATE_LIMIT_MAX = 20;        // max messages
const CHAT_RATE_LIMIT_WINDOW = 60 * 60 * 1000; // per hour

function checkChatRateLimit(ip) {
  const now = Date.now();
  const entry = chatRateLimitMap.get(ip);
  if (!entry || now - entry.start > CHAT_RATE_LIMIT_WINDOW) {
    chatRateLimitMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= CHAT_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of chatRateLimitMap.entries()) {
    if (now - entry.start > CHAT_RATE_LIMIT_WINDOW) chatRateLimitMap.delete(ip);
  }
}, CHAT_RATE_LIMIT_WINDOW);

const CHAT_SYSTEM_PROMPT_EN = `You are the support chat assistant on TheFirstWord (thefirstword.ca), a bilingual platform that helps families start a conversation with a loved one struggling with addiction.

Your role has two parts:

1. PRODUCT SUPPORT: Answer questions about how TheFirstWord works, pricing ($9 Starter, $19 Essential, $29 Complete one-time, $19/month Premium), what the kits contain (personalized letter, conversation guide, SMS message, spoken script, Plan B strategy, weekly support emails for Premium), privacy, and how to get started. When relevant, encourage the person to start their kit. When you do, ALWAYS use this exact markdown link format so it renders as a clickable button in the chat: [Start your kit](/app.html) — never write "app.html" as plain text, and never invent a different URL.

2. PATTERN REFLECTION (NOT DIAGNOSIS): When someone describes a loved one's behavior and asks whether it's "really" addiction, help them think it through using well-known behavioral indicators used in the addiction field — for example: impact on work or finances, strain on relationships, increased tolerance, failed attempts to cut back, loss of interest in other activities, using to cope with stress, secrecy or lying about use, withdrawal symptoms, continuing despite negative consequences. Ask a few clarifying questions if helpful, and reflect back what they describe in relation to these patterns.

CRITICAL RULES — NEVER BREAK THESE:
- You are NOT a doctor, therapist, or addiction counselor. NEVER diagnose. NEVER say "your loved one is an addict" or "this is definitely addiction." Instead say things like "what you're describing — especially X and Y — is a pattern that's commonly associated with substance use concerns" and let them draw their own conclusion.
- Always make clear, at least once per conversation, that you cannot provide a diagnosis and that a doctor, addiction counselor, or treatment professional can give a real assessment.
- If the person mentions anything suggesting danger — suicidal thoughts, self-harm, violence, a medical emergency, or that someone is in immediate danger — STOP the product/screening conversation immediately and tell them clearly to contact emergency services (911 in Canada) or a crisis line right away. Mention the resources already on this page: Drogue Aide et Référence 1-800-265-2626 (FR) or the Drug and Alcohol Helpline 1-800-565-8603 (EN), both free and available 24/7. Do not continue normal conversation until you've addressed this.
- Never give specific medical advice (dosing, withdrawal management, medication interactions). Redirect to a medical professional.
- Keep responses concise — 2-4 short paragraphs max. This is a chat widget, not an essay.
- Be warm, direct, and human. No corporate jargon, no therapy-speak clichés, no excessive hedging.
- If asked something totally unrelated to addiction or the product, gently redirect to what you're here to help with.
- Never claim to remember the person between sessions or know personal details they haven't told you in this conversation.

Respond in English.`;

const CHAT_SYSTEM_PROMPT_FR = `Tu es l'assistant de clavardage sur TheFirstWord (thefirstword.ca), une plateforme bilingue qui aide les familles à entamer une conversation avec un proche aux prises avec une dépendance.

Ton rôle a deux volets :

1. SOUTIEN PRODUIT : Réponds aux questions sur le fonctionnement de TheFirstWord, les prix (9$ Starter, 19$ Essential, 29$ Complete paiement unique, 19$/mois Premium), le contenu des kits (lettre personnalisée, guide de conversation, message texte, script parlé, stratégie Plan B, courriels de suivi hebdomadaires pour Premium), la confidentialité, et comment commencer. Quand c'est pertinent, encourage la personne à commencer son kit. Quand tu le fais, utilise TOUJOURS exactement ce format de lien markdown pour qu'il s'affiche comme un bouton cliquable dans le clavardage : [Commencer votre kit](/app.html) — n'écris jamais "app.html" comme texte brut, et n'invente jamais une autre URL.

2. REFLET DE PATTERNS (PAS UN DIAGNOSTIC) : Quand quelqu'un décrit le comportement d'un proche et demande si c'est "vraiment" de la dépendance, aide-le à y réfléchir en utilisant des indicateurs comportementaux reconnus dans le domaine de la dépendance — par exemple : impact sur le travail ou les finances, tension dans les relations, tolérance accrue, tentatives infructueuses de réduire, perte d'intérêt pour d'autres activités, consommation pour gérer le stress, secret ou mensonges au sujet de la consommation, symptômes de sevrage, poursuite malgré les conséquences négatives. Pose quelques questions de clarification si utile, et reflète ce qu'on te décrit en lien avec ces patterns.

RÈGLES CRITIQUES — À NE JAMAIS ENFREINDRE :
- Tu n'es PAS un médecin, thérapeute ou intervenant en dépendance. Ne diagnostique JAMAIS. Ne dis JAMAIS « votre proche est dépendant » ou « c'est définitivement de la dépendance ». Dis plutôt des choses comme « ce que vous décrivez — surtout X et Y — est un pattern souvent associé à des préoccupations liées à la consommation » et laisse la personne tirer ses propres conclusions.
- Précise clairement, au moins une fois dans la conversation, que tu ne peux pas fournir de diagnostic et qu'un médecin, un intervenant en dépendance ou un professionnel du traitement peut faire une vraie évaluation.
- Si la personne mentionne quoi que ce soit suggérant un danger — idées suicidaires, automutilation, violence, urgence médicale, ou que quelqu'un est en danger immédiat — ARRÊTE immédiatement la conversation sur le produit ou le dépistage et dis clairement de contacter les services d'urgence (911 au Canada) ou une ligne de crise sans attendre. Mentionne les ressources déjà présentes sur cette page : Drogue Aide et Référence 1-800-265-2626 (FR) ou la Drug and Alcohol Helpline 1-800-565-8603 (EN), gratuites et disponibles 24h/24, 7j/7. Ne reprends pas la conversation normale avant d'avoir adressé ceci.
- Ne donne jamais de conseil médical précis (dosage, gestion du sevrage, interactions médicamenteuses). Redirige vers un professionnel de la santé.
- Garde les réponses concises — 2 à 4 courts paragraphes maximum. C'est un widget de clavardage, pas un essai.
- Sois chaleureux, direct et humain. Pas de jargon corporatif, pas de clichés de style thérapeutique, pas d'hésitation excessive.
- Si on te demande quelque chose de totalement hors sujet par rapport à la dépendance ou au produit, redirige gentiment vers ce pour quoi tu es là.
- Ne prétends jamais te souvenir de la personne entre les sessions ni connaître des détails personnels qu'elle ne t'a pas donnés dans cette conversation.

Réponds en français, dans un français naturel et québécois, pas traduit de l'anglais.`;

app.post("/api/chat", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!checkChatRateLimit(ip)) {
    return res.status(429).json({ error: "Too many messages. Please wait a bit before continuing." });
  }

  const { message, history, lang } = req.body;
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Missing message" });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: "Message too long" });
  }

  const useLang = lang === "fr" ? "fr" : "en";
  const systemPrompt = useLang === "fr" ? CHAT_SYSTEM_PROMPT_FR : CHAT_SYSTEM_PROMPT_EN;

  // Build message history: last 6 messages max, validated shape
  let messages = [];
  if (Array.isArray(history)) {
    const trimmed = history.slice(-6);
    for (const m of trimmed) {
      if (
        m && typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 && m.content.length <= 2000
      ) {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }
  messages.push({ role: "user", content: message });

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
        max_tokens: 600,
        system: systemPrompt,
        messages: messages,
      }),
    });

    const data = await response.json();
    if (data.content?.[0]?.text) {
      res.json({ reply: data.content[0].text });
    } else {
      console.error("Unexpected chat API response:", JSON.stringify(data).slice(0, 500));
      res.status(500).json({
        error: useLang === "fr"
          ? "Désolé, une erreur est survenue. Veuillez réessayer."
          : "Sorry, something went wrong. Please try again."
      });
    }
  } catch (err) {
    console.error("Chat API error:", err);
    res.status(500).json({
      error: useLang === "fr"
        ? "Impossible de se connecter au service. Veuillez réessayer."
        : "Failed to connect to the service. Please try again."
    });
  }
});

// ─── API: SEND KIT EMAIL + SAVE TO SUPABASE ───────────────────────────────────

app.post("/api/send-email", async (req, res) => {
  const { email, name, lang, outputs, plan, answers: clientAnswers } = req.body;
  if (!email || !outputs) return res.status(400).json({ error: "Missing email or outputs." });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });

  try {
    // 1. SEND EMAIL FIRST — use exactly what client sent, no DB lookup
    // This guarantees the email always reflects the current session's data
    const html = buildKitEmail(outputs, name, lang, null, email);
    const subject = lang === 'fr'
      ? "Votre kit d'intervention personnalisé — TheFirstWord"
      : "Your personalized intervention kit — TheFirstWord";

    // Generate invoice PDF — non-blocking: if it fails, email still sends
    let invoiceAttachments = [];
    try {
      const invoicePdf = await generateInvoicePDF(email, name, plan || 'essential', lang || 'en');
      const invoiceFilename = lang === 'fr' ? 'facture-thefirstword.pdf' : 'invoice-thefirstword.pdf';
      invoiceAttachments = [{
        filename: invoiceFilename,
        content: invoicePdf.toString('base64'),
        type: 'application/pdf',
      }];
    } catch (invoiceErr) {
      console.error('Invoice generation failed (non-blocking):', invoiceErr.message);
    }

    const emailResult = await sendEmail(email, subject, html, invoiceAttachments);

    if (!emailResult.id) {
      console.error("Resend error:", JSON.stringify(emailResult));
      return res.status(500).json({ error: `Email failed: ${emailResult.message || emailResult.name || JSON.stringify(emailResult)}` });
    }

    // 2. SAVE TO SUPABASE AFTER — non-blocking, email already sent
    let subscriberId = null;
    if (SUPABASE_KEY) {
      try {
        const isMonthly = plan === 'monthly';

        // Check existing record to preserve signed_up_at and week flags
        let existingRecord = null;
        try {
          const existing = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(email)}&select=id,signed_up_at,week1_sent,week2_sent,week3_sent,week4_sent,active&limit=1`);
          if (Array.isArray(existing) && existing[0]?.id) existingRecord = existing[0];
        } catch(e) { /* non-blocking */ }

        const kit_outputs = {
          letter: outputs.letter || '',
          guide: outputs.guide || '',
          sms: outputs.sms || '',
          script: outputs.script || '',
          planB: outputs.planB || ''
        };

        const rowData = {
          email,
          name: name || '',
          lang: lang || 'en',
          plan: plan || 'starter',
          signed_up_at: existingRecord ? existingRecord.signed_up_at : new Date().toISOString(),
          active: isMonthly ? true : (existingRecord ? existingRecord.active : false),
          week1_sent: (isMonthly && !existingRecord) ? false : (existingRecord ? existingRecord.week1_sent : false),
          week2_sent: (isMonthly && !existingRecord) ? false : (existingRecord ? existingRecord.week2_sent : false),
          week3_sent: (isMonthly && !existingRecord) ? false : (existingRecord ? existingRecord.week3_sent : false),
          week4_sent: (isMonthly && !existingRecord) ? false : (existingRecord ? existingRecord.week4_sent : false),
          // Always overwrite with current session data
          relationship: (clientAnswers && clientAnswers.relationship) || '',
          substance: (clientAnswers && clientAnswers.substance) || '',
          duration: (clientAnswers && clientAnswers.duration) || '',
          treatment: (clientAnswers && clientAnswers.treatment) || '',
          attitude: (clientAnswers && clientAnswers.attitude) || '',
          tone: (clientAnswers && clientAnswers.tone) || '',
          situation: (clientAnswers && clientAnswers.situation) || '',
          patient_name: (clientAnswers && clientAnswers.patientName) || '',
          kit_outputs
        };

        const result = await supabaseUpsert('subscribers', rowData);
        if (Array.isArray(result) && result[0]?.id) {
          subscriberId = result[0].id;
        } else if (existingRecord?.id) {
          subscriberId = existingRecord.id;
        }

        // Explicit PATCH to guarantee kit_outputs saves
        if (subscriberId) {
          await supabaseUpdate('subscribers', subscriberId, { kit_outputs, name: name || '', patient_name: (clientAnswers && clientAnswers.patientName) || '', lang: lang || 'en', plan: plan || 'starter' });
          console.log(`Saved: ${email} id=${subscriberId}`);
        }
      } catch (dbErr) {
        console.error("Supabase save error:", dbErr);
        // Non-blocking — email already sent successfully
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
            // Pass sub.email as the 5th param so week 4 Plan B button URL is correct
            const { subject, html } = buildWeeklyEmail(check.week, sub.name, sub.lang, sub.id, sub.email);
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
  const { id, type, lang } = req.query;
  if (!id) return res.status(400).send('Missing id');
  if (!SUPABASE_KEY) return res.status(500).send('Database not configured');
  const fr = lang === 'fr';
  try {
    if (type === 'lead') {
      await supabaseUpdate('leads', id, { unsubscribed: true });
    } else {
      await supabaseUpdate('subscribers', id, { active: false });
    }
    const h2 = fr ? "Vous êtes désinscrit(e)." : "You've been unsubscribed.";
    const p = fr ? "Vous ne recevrez plus de courriels de TheFirstWord. Nous vous souhaitons le meilleur, à vous et votre famille." : "You won't receive any more emails from TheFirstWord. We wish you and your family well.";
    const btn = fr ? "Retour à TheFirstWord" : "Return to TheFirstWord";
    res.send(`<!DOCTYPE html><html lang="${fr ? 'fr' : 'en'}"><body style="font-family:Georgia,serif;max-width:500px;margin:80px auto;text-align:center;padding:20px;">
      <h2 style="color:#1a1a1a;margin-bottom:12px;">${h2}</h2>
      <p style="color:#6b6460;line-height:1.7;">${p}</p>
      <a href="https://thefirstword.ca" style="display:inline-block;margin-top:24px;background:#2A7F7F;color:white;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">${btn}</a>
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
        signedUpAt: sub.signed_up_at,
        kitOutputs: sub.kit_outputs || null,
        answers: {
          relationship: sub.relationship || '',
          substance: sub.substance || '',
          duration: sub.duration || '',
          treatment: sub.treatment || '',
          attitude: sub.attitude || '',
          tone: sub.tone || '',
          situation: sub.situation || '',
          patientName: sub.patient_name || ''
        }
      });
    } else {
      res.json({ found: false });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// ─── API: LOG KIT OPENED (for refund-eligibility verification) ───────────────
// Called from the browser the moment a kit is actually displayed on screen —
// NOT when the email is sent. Only sets kit_opened_at if it isn't already set,
// so refreshing or reopening the kit never overwrites the original open time.
// This is what lets us verify a 7-day refund request's "kit not yet opened"
// condition instead of just taking the customer's word for it.
app.post("/api/log-kit-opened", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Missing email" });
  if (!SUPABASE_KEY) return res.status(200).json({ logged: false }); // non-blocking — never breaks kit viewing

  try {
    const rows = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(email)}&select=id,kit_opened_at&limit=1`);
    if (Array.isArray(rows) && rows[0]?.id) {
      const sub = rows[0];
      if (!sub.kit_opened_at) {
        await supabaseUpdate('subscribers', sub.id, { kit_opened_at: new Date().toISOString() });
      }
    }
    res.status(200).json({ logged: true });
  } catch (err) {
    console.error('log-kit-opened error (non-blocking):', err);
    res.status(200).json({ logged: false }); // never block kit display on this failing
  }
});

// ─── API: TESTIMONIALS ────────────────────────────────────────────────────────

app.get("/api/testimonials", async (req, res) => {
  if (!SUPABASE_KEY) return res.json([]);
  try {
    const rows = await supabaseQuery('testimonials', 'approved=eq.true&select=*&order=created_at.desc');
    res.json(Array.isArray(rows) ? rows : []);
  } catch(err) {
    console.error(err);
    res.json([]);
  }
});

app.post("/api/testimonial", async (req, res) => {
  const { name, relationship, message, lang, rating } = req.body;
  if (!name || !message) return res.status(400).json({ error: "Missing required fields" });

  try {
    if (SUPABASE_KEY) {
      await supabaseInsert('testimonials', {
        name, relationship: relationship || '', message, lang: lang || 'en',
        rating: rating || 5, approved: false, created_at: new Date().toISOString()
      });
    }

    const notifyHtml = emailWrapper(`
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 16px;">New testimonial submitted:</p>
      <div style="background:#f5f0eb;border-radius:10px;padding:20px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Name:</strong> ${name}</p>
        <p style="margin:0;font-size:14px;"><strong>Message:</strong> ${message}</p>
      </div>
      <p style="font-size:13px;color:#6b6460;margin-top:16px;">Go to Supabase to approve: set approved=true in the testimonials table.</p>
    `, 'en');

    await sendEmail('thefirstword.ca@gmail.com', 'New testimonial — TheFirstWord', notifyHtml);
    res.json({ success: true });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save testimonial" });
  }
});

// ─── API: SEND PLAN B EMAIL ───────────────────────────────────────────────────

app.post("/api/send-planb-email", async (req, res) => {
  const { email, name, lang, outputs, answers, plan } = req.body;
  if (!email || !outputs?.planB) return res.status(400).json({ error: "Missing email or Plan B content." });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: "Email service not configured." });

  try {
    const isEn = lang !== 'fr';
    const senderName = name || '';
    const patientName = answers?.patientName || '';

    // Fetch subscriber ID for unsubscribe link
    let subscriberId = null;
    if (SUPABASE_KEY) {
      try {
        const rows = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
        if (Array.isArray(rows) && rows[0]?.id) subscriberId = rows[0].id;
      } catch(e) { /* non-blocking */ }
    }

    function mdToHtml(text) {
      if (!text) return '';
      text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const lines = text.split('\n');
      let html = '';
      let inList = false;
      for (let line of lines) {
        line = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        line = line.replace(/\*(.+?)\*/g, '<em>$1</em>');
        if (/^#{1,3}\s+/.test(line)) {
          if (inList) { html += '</table>'; inList = false; }
          const txt = line.replace(/^#{1,3}\s+/, '');
          html += `<p style="margin:18px 0 6px;font-size:15px;font-weight:700;color:#1a1a1a;border-bottom:1px solid #e8e0d8;padding-bottom:4px;">${txt}</p>`;
        } else if (/^(\d+\.|-|•|\*)\s+/.test(line)) {
          if (!inList) { html += '<table style="width:100%;margin:6px 0;" cellpadding="0" cellspacing="0">'; inList = true; }
          const txt = line.replace(/^(\d+\.|-|•|\*)\s+/, '');
          html += `<tr><td style="width:16px;font-size:14px;color:#c4622d;vertical-align:top;padding:3px 0;">•</td><td style="font-size:14px;color:#3a3330;line-height:1.7;padding:3px 0;">${txt}</td></tr>`;
        } else if (line.trim() === '') {
          if (inList) { html += '</table>'; inList = false; }
          html += '<div style="height:8px;"></div>';
        } else {
          if (inList) { html += '</table>'; inList = false; }
          html += `<p style="margin:0 0 8px;font-size:14px;line-height:1.8;color:#3a3330;">${line}</p>`;
        }
      }
      if (inList) html += '</table>';
      return html;
    }

    const unsubFooter = subscriberId
      ? `<p style="font-size:11px;color:#c0b8b0;text-align:center;margin-top:24px;"><a href="https://thefirstword.ca/api/unsubscribe?id=${subscriberId}" style="color:#c0b8b0;text-decoration:underline;">${isEn ? 'Unsubscribe from all emails' : 'Se désabonner de tous les courriels'}</a></p>`
      : '';

    // Context summary for the email
    const contextLine = [
      answers?.relationship ? (isEn ? `Relationship: ${answers.relationship}` : `Relation: ${answers.relationship}`) : '',
      answers?.substance ? (isEn ? `Substance: ${answers.substance}` : `Substance: ${answers.substance}`) : '',
      patientName ? (isEn ? `For: ${patientName}` : `Pour: ${patientName}`) : '',
    ].filter(Boolean).join(' · ');

    const content = `
      <p style="font-size:16px;color:#1a1a1a;margin:0 0 6px;font-family:Georgia,serif;">
        ${isEn ? `Hi${senderName ? ' ' + senderName : ''},` : `Bonjour${senderName ? ' ' + senderName : ''},`}
      </p>
      <p style="font-size:14px;color:#3a3330;line-height:1.7;margin:0 0 20px;">
        ${isEn
          ? `The first attempt didn't land the way you hoped. That's not failure — that's information. Here is your Plan B strategy${patientName ? ' for ' + patientName : ''}, built on what happened and what comes next.`
          : `La première tentative ne s'est pas passée comme vous l'espériez. Ce n'est pas un échec — c'est une information. Voici votre stratégie Plan B${patientName ? ' pour ' + patientName : ''}, construite sur ce qui s'est passé et ce qui vient ensuite.`
        }
      </p>

      ${contextLine ? `<p style="font-size:11px;color:#9b9390;margin:0 0 24px;letter-spacing:1px;text-transform:uppercase;">${contextLine}</p>` : ''}

      <table style="width:100%;margin-bottom:24px;border:1px solid #f0d4b0;border-radius:10px;border-collapse:separate;border-spacing:0;overflow:hidden;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="background:#fff8f0;padding:12px 20px;border-bottom:1px solid #f0d4b0;">
            <p style="margin:0;font-size:11px;font-weight:700;color:#c4622d;letter-spacing:2px;text-transform:uppercase;">🔄 ${isEn ? 'Plan B Strategy' : 'Stratégie Plan B'}</p>
          </td>
        </tr>
        <tr>
          <td style="background:white;padding:20px 24px;">
            ${mdToHtml(outputs.planB)}
          </td>
        </tr>
      </table>

      <table style="width:100%;background:#f0f7f7;border-left:4px solid #2A7F7F;border-radius:0 8px 8px 0;margin-bottom:8px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:16px 20px;">
            <p style="margin:0 0 4px;font-size:13px;color:#2A7F7F;font-weight:700;">${isEn ? 'Keep going.' : 'Continuez.'}</p>
            <p style="margin:0;font-size:13px;color:#3a3330;line-height:1.6;">
              ${isEn
                ? 'Intervention is rarely a single conversation. The fact that you\'re here, trying again, is what matters most.'
                : 'Une intervention est rarement une seule conversation. Le fait que vous soyez là, qui essayez encore, est ce qui compte le plus.'
              }
            </p>
          </td>
        </tr>
      </table>

      ${unsubFooter}
    `;

    const subject = isEn
      ? `Your Plan B strategy${patientName ? ' for ' + patientName : ''} — TheFirstWord`
      : `Votre stratégie Plan B${patientName ? ' pour ' + patientName : ''} — TheFirstWord`;

    const html = emailWrapper(content, lang);
    const emailResult = await sendEmail(email, subject, html);

    if (!emailResult.id) {
      console.error("Resend error:", emailResult);
      return res.status(500).json({ error: "Failed to send email." });
    }

    // Update kit_outputs in Supabase to include the new Plan B
    if (SUPABASE_KEY && subscriberId) {
      try {
        const rows = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(email)}&select=kit_outputs&limit=1`);
        if (Array.isArray(rows) && rows[0]) {
          const existing = rows[0].kit_outputs || {};
          existing.planB = outputs.planB;
          await supabaseUpdate('subscribers', subscriberId, { kit_outputs: existing });
        }
      } catch(e) { /* non-blocking */ }
    }

    res.json({ success: true, id: emailResult.id });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send Plan B email." });
  }
});

// ─── LEAD CAPTURE & NURTURE ───────────────────────────────────────────────────

const leadRateMap = new Map();
function checkLeadRate(ip) {
  const now = Date.now();
  const entry = leadRateMap.get(ip);
  if (!entry || now - entry.start > 60 * 60 * 1000) {
    leadRateMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of leadRateMap.entries()) {
    if (now - entry.start > 60 * 60 * 1000) leadRateMap.delete(ip);
  }
}, 60 * 60 * 1000);

function leadEmailHtml(lang, bodyHtml, ctaText, ctaUrl, leadId) {
  const fr = lang === 'fr';
  const unsubUrl = `https://thefirstword.ca/api/unsubscribe?id=${leadId}&type=lead&lang=${fr ? 'fr' : 'en'}`;
  const unsubText = fr ? 'Se désinscrire' : 'Unsubscribe';
  const footer = fr
    ? 'TheFirstWord · thefirstword.ca · Vous recevez ce courriel parce que vous avez demandé notre guide gratuit.'
    : 'TheFirstWord · thefirstword.ca · You are receiving this email because you requested our free guide.';
  return `<!DOCTYPE html><html lang="${fr ? 'fr' : 'en'}"><body style="margin:0;padding:0;background:#F7F4EF;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;font-family:Georgia,'Times New Roman',serif;">
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:2px;color:#C4622D;margin-bottom:24px;">THEFIRSTWORD</div>
    <div style="background:#FFFFFF;border:1px solid #E8E2D9;border-radius:14px;padding:32px 28px;color:#1C2B3A;font-size:16px;line-height:1.7;">
      ${bodyHtml}
      ${ctaText ? `<div style="text-align:center;margin-top:28px;"><a href="${ctaUrl}" style="display:inline-block;background:#C4622D;color:#FFFFFF;text-decoration:none;padding:14px 32px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-weight:bold;font-size:15px;">${ctaText}</a></div>` : ''}
    </div>
    <div style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#5a6a7a;margin-top:24px;line-height:1.6;">
      ${footer}<br><a href="${unsubUrl}" style="color:#5a6a7a;">${unsubText}</a>
    </div>
  </div></body></html>`;
}

const LEAD_EMAILS = {
  fr: {
    e1: {
      subject: "Votre guide est ici — Les 5 erreurs qui ferment la conversation",
      body: (pdfUrl) => `<p style="margin:0 0 16px;">Le voici, comme promis :</p>
        <p style="margin:0 0 16px;"><a href="${pdfUrl}" style="color:#2A7F7F;font-weight:bold;">→ Les 5 erreurs qui ferment la conversation avant qu'elle commence (PDF)</a></p>
        <p style="margin:0 0 16px;">C'est une lecture de cinq minutes. Chaque erreur vient avec quoi faire à la place — des phrases concrètes, pas de la théorie.</p>
        <p style="margin:0;">Et quand vous serez prêt(e) à passer du « quoi éviter » au « quoi dire exactement », TheFirstWord construit votre lettre et votre script personnalisés en moins de 60 secondes.</p>`,
      cta: "Lire le guide (PDF)"
    },
    e2: {
      subject: "L'erreur qui fait le plus de dégâts (et la phrase qui la remplace)",
      body: () => `<p style="margin:0 0 16px;">Des cinq erreurs du guide, il y en a une qui revient dans presque toutes les familles : poser un diagnostic au lieu de décrire un fait.</p>
        <p style="margin:0 0 16px;">« T'as un problème » ferme la porte. « J'ai remarqué que tu bois plus souvent au souper depuis quelques mois » la laisse ouverte. La différence n'est pas dans l'intention — elle est dans les mots.</p>
        <p style="margin:0 0 16px;">Mais voici la vraie difficulté : la bonne phrase pour VOTRE situation dépend de qui est cette personne pour vous, de ce qu'elle consomme, de ce qui s'est déjà passé entre vous. Un guide générique s'arrête là où votre situation commence.</p>
        <p style="margin:0;">TheFirstWord prend votre histoire — en huit questions — et construit la lettre, le guide de conversation et le script exact pour votre situation. En moins de 60 secondes.</p>`,
      cta: "Créer mon script personnalisé"
    },
    e3: {
      subject: "Les mots exacts, pour votre situation",
      body: () => `<p style="margin:0 0 16px;">Vous avez téléchargé le guide il y a quelques jours. Si la conversation n'a pas encore eu lieu, ce n'est pas par manque de volonté — c'est parce que savoir quoi éviter n'est pas la même chose que savoir quoi dire.</p>
        <p style="margin:0 0 16px;">Voici ce que TheFirstWord construit pour vous, à partir de vos réponses à huit questions :</p>
        <p style="margin:0 0 16px;">— Une lettre d'intervention personnalisée<br>— Un guide de conversation étape par étape<br>— Un script mot à mot, dans vos mots à vous<br>— Un message texte prêt à envoyer<br>— L'outil Plan B, si la première tentative ne fonctionne pas</p>
        <p style="margin:0;">À partir de 9 $, avec une garantie de remboursement de 7 jours. La conversation que vous repoussez depuis des mois peut commencer ce soir.</p>`,
      cta: "Commencer maintenant"
    }
  },
  en: {
    e1: {
      subject: "Your guide is here — The 5 Mistakes That Shut Down the Conversation",
      body: (pdfUrl) => `<p style="margin:0 0 16px;">Here it is, as promised:</p>
        <p style="margin:0 0 16px;"><a href="${pdfUrl}" style="color:#2A7F7F;font-weight:bold;">→ The 5 Mistakes That Shut Down the Conversation Before It Starts (PDF)</a></p>
        <p style="margin:0 0 16px;">It's a five-minute read. Every mistake comes with what to do instead — concrete phrases, not theory.</p>
        <p style="margin:0;">And when you're ready to go from "what to avoid" to "exactly what to say," TheFirstWord builds your personalized letter and script in under 60 seconds.</p>`,
      cta: "Read the guide (PDF)"
    },
    e2: {
      subject: "The mistake that does the most damage (and the sentence that replaces it)",
      body: () => `<p style="margin:0 0 16px;">Of the five mistakes in the guide, one shows up in almost every family: diagnosing instead of describing.</p>
        <p style="margin:0 0 16px;">"You have a problem" closes the door. "I've noticed you've been drinking more at dinner these past few months" leaves it open. The difference isn't in the intention — it's in the words.</p>
        <p style="margin:0 0 16px;">But here's the real difficulty: the right sentence for YOUR situation depends on who this person is to you, what they're using, and what's already happened between you. A generic guide stops exactly where your situation begins.</p>
        <p style="margin:0;">TheFirstWord takes your story — through eight questions — and builds the letter, the conversation guide, and the exact script for your situation. In under 60 seconds.</p>`,
      cta: "Build my personalized script"
    },
    e3: {
      subject: "The exact words, for your situation",
      body: () => `<p style="margin:0 0 16px;">You downloaded the guide a few days ago. If the conversation hasn't happened yet, it's not a lack of will — it's that knowing what to avoid isn't the same as knowing what to say.</p>
        <p style="margin:0 0 16px;">Here's what TheFirstWord builds for you, from your answers to eight questions:</p>
        <p style="margin:0 0 16px;">— A personalized intervention letter<br>— A step-by-step conversation guide<br>— A word-for-word spoken script, in your own words<br>— A ready-to-send text message<br>— The Plan B tool, if the first attempt doesn't land</p>
        <p style="margin:0;">From $9, with a 7-day money-back guarantee. The conversation you've been putting off for months can start tonight.</p>`,
      cta: "Start now"
    }
  }
};

function leadPdfUrl(lang) {
  return lang === 'fr'
    ? 'https://thefirstword.ca/les-5-erreurs.pdf'
    : 'https://thefirstword.ca/the-5-mistakes.pdf';
}

app.post("/api/capture-lead", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
  if (!checkLeadRate(ip)) return res.status(429).json({ error: "Too many requests" });
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured" });

  const { email, lang, source, website } = req.body || {};

  // Honeypot: real users never fill this hidden field. Pretend success for bots.
  if (website) return res.json({ ok: true });

  const cleanEmail = (email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail) || cleanEmail.length > 254) {
    return res.status(400).json({ error: "Invalid email" });
  }
  const cleanLang = lang === 'en' ? 'en' : 'fr';
  const cleanSource = String(source || '').slice(0, 100);

  try {
    // Idempotent: if this email already exists, don't resend or reset anything.
    const existing = await supabaseQuery('leads', `email=eq.${encodeURIComponent(cleanEmail)}&select=id,email1_sent_at`);
    if (Array.isArray(existing) && existing.length > 0 && existing[0].email1_sent_at) {
      return res.json({ ok: true });
    }

    const rows = await supabaseUpsert('leads', { email: cleanEmail, lang: cleanLang, source: cleanSource });
    const leadRow = Array.isArray(rows) ? rows[0] : rows;
    if (!leadRow || !leadRow.id) {
      console.error('capture-lead: unexpected upsert response', JSON.stringify(rows));
      return res.status(500).json({ error: "Could not save" });
    }

    const t = LEAD_EMAILS[cleanLang].e1;
    const html = leadEmailHtml(cleanLang, t.body(leadPdfUrl(cleanLang)), t.cta, leadPdfUrl(cleanLang), leadRow.id);
    const sent = await sendEmail(cleanEmail, t.subject, html);
    if (sent && sent.id) {
      await supabaseUpdate('leads', leadRow.id, { email1_sent_at: new Date().toISOString() });
    } else {
      console.error('capture-lead: email send failed', JSON.stringify(sent));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('capture-lead error:', err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.post("/api/send-nurture-batch", async (req, res) => {
  const authHeader = req.headers['x-cron-secret'];
  if (authHeader !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured." });

  try {
    const now = new Date();
    const results = { email2_sent: 0, email3_sent: 0, failed: 0 };
    const leads = await supabaseQuery('leads', 'unsubscribed=eq.false&select=*');
    if (!Array.isArray(leads)) {
      console.error('send-nurture-batch: unexpected query response', JSON.stringify(leads));
      return res.status(500).json({ error: "Query failed" });
    }

    for (const lead of leads) {
      if (!lead.email1_sent_at) continue; // never got the guide; skip
      const daysSince = Math.floor((now - new Date(lead.created_at)) / (1000 * 60 * 60 * 24));
      const lang = lead.lang === 'en' ? 'en' : 'fr';

      let toSend = null; // send at most one email per lead per run
      if (daysSince >= 2 && !lead.email2_sent_at) {
        toSend = { t: LEAD_EMAILS[lang].e2, stamp: 'email2_sent_at', counter: 'email2_sent' };
      } else if (daysSince >= 5 && lead.email2_sent_at && !lead.email3_sent_at) {
        toSend = { t: LEAD_EMAILS[lang].e3, stamp: 'email3_sent_at', counter: 'email3_sent' };
      }
      if (!toSend) continue;

      const appUrl = `https://thefirstword.ca/app.html?lang=${lang}`;
      const html = leadEmailHtml(lang, toSend.t.body(), toSend.t.cta, appUrl, lead.id);
      const sent = await sendEmail(lead.email, toSend.t.subject, html);
      if (sent && sent.id) {
        await supabaseUpdate('leads', lead.id, { [toSend.stamp]: new Date().toISOString() });
        results[toSend.counter]++;
      } else {
        results.failed++;
        console.error(`send-nurture-batch: failed for lead ${lead.id}`, JSON.stringify(sent));
      }
    }

    res.json({ ok: true, ...results });
  } catch (err) {
    console.error('send-nurture-batch error:', err.message);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// ─── API: ADMIN STATS ─────────────────────────────────────────────────────────

app.get("/api/admin/stats", async (req, res) => {
  const { secret } = req.query;
  // Uses its own ADMIN_SECRET, separate from CRON_SECRET (which authorizes the
  // GitHub Actions weekly email job). Keeping these separate means rotating
  // one credential — e.g. if a team member with admin access changes — never
  // breaks the other system, and a leak of one doesn't compromise the other.
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!SUPABASE_KEY) return res.status(500).json({ error: "Database not configured" });

  try {
    // All subscribers
    const all = await supabaseQuery('subscribers', 'select=*&order=signed_up_at.desc');
    const subs = Array.isArray(all) ? all : [];

    // Total kits
    const total = subs.length;

    // Last 30 days
    const thirty = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const last30Days = subs.filter(s => s.signed_up_at > thirty).length;

    // Weekly active (monthly plan + active=true)
    const weeklyActive = subs.filter(s => s.plan === 'monthly' && s.active).length;

    // Plan counts
    const planCounts = { starter: 0, essential: 0, complete: 0, monthly: 0 };
    subs.forEach(s => { if (planCounts[s.plan] !== undefined) planCounts[s.plan]++; });

    // Language counts
    const langCounts = { en: 0, fr: 0 };
    subs.forEach(s => { if (s.lang === 'fr') langCounts.fr++; else langCounts.en++; });

    // Substance counts
    const substanceCounts = {};
    subs.forEach(s => {
      if (s.substance) substanceCounts[s.substance] = (substanceCounts[s.substance] || 0) + 1;
    });

    // Relationship counts
    const relationshipCounts = {};
    subs.forEach(s => {
      if (s.relationship) relationshipCounts[s.relationship] = (relationshipCounts[s.relationship] || 0) + 1;
    });

    // Daily signups — last 14 days
    const dailySignups = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailySignups[key] = 0;
    }
    subs.forEach(s => {
      if (s.signed_up_at) {
        const key = s.signed_up_at.split('T')[0];
        if (dailySignups[key] !== undefined) dailySignups[key]++;
      }
    });

    // Recent 25 subscribers
    const recent = subs.slice(0, 25);

    // Testimonials (all, approved and pending)
    let testimonials = [];
    try {
      const tRows = await supabaseQuery('testimonials', 'select=*&order=created_at.desc&limit=20');
      testimonials = Array.isArray(tRows) ? tRows : [];
    } catch(e) { /* non-blocking */ }

    res.json({
      total,
      last30Days,
      weeklyActive,
      planCounts,
      langCounts,
      substanceCounts,
      relationshipCounts,
      dailySignups,
      recent,
      testimonials
    });

  } catch(err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

// ─── ROBOTS.TXT ───────────────────────────────────────────────────────────────

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send(`User-agent: *
Allow: /
Disallow: /api/

Sitemap: https://thefirstword.ca/sitemap.xml`);
});

// ─── SITEMAP.XML ──────────────────────────────────────────────────────────────

app.get("/sitemap.xml", (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  res.type("application/xml");
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://thefirstword.ca/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://thefirstword.ca/app.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://thefirstword.ca/privacy.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
  <url>
    <loc>https://thefirstword.ca/terms.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.3</priority>
  </url>
</urlset>`);
});

// ─── STRIPE ───────────────────────────────────────────────────────────────────

const Stripe = require('stripe');
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
// Used specifically for webhook signature verification via stripe.webhooks.constructEvent,
// which handles raw-body HMAC comparison correctly (constant-time, proper header parsing,
// timestamp tolerance) — replacing a hand-rolled implementation that proved unreliable.
// All other Stripe interactions in this file continue using direct fetch() calls, unchanged.
const stripeClient = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

const PRICE_MAP = {
  starter:   process.env.STRIPE_PRICE_STARTER,
  essential: process.env.STRIPE_PRICE_ESSENTIAL,
  complete:  process.env.STRIPE_PRICE_COMPLETE,
  monthly:   process.env.STRIPE_PRICE_PREMIUM,
};

// Create Stripe Checkout Session
app.post("/api/create-checkout-session", async (req, res) => {
  const { plan, lang } = req.body;
  if (!plan || !PRICE_MAP[plan]) {
    return res.status(400).json({ error: "Invalid plan." });
  }
  if (!STRIPE_SECRET) {
    return res.status(500).json({ error: "Stripe not configured." });
  }

  const priceId = PRICE_MAP[plan];
  const isMonthly = plan === 'monthly';
  const successUrl = `https://thefirstword.ca/app.html?session_id={CHECKOUT_SESSION_ID}&lang=${lang || 'en'}`;
  const cancelUrl = `https://thefirstword.ca/app.html?cancelled=true&lang=${lang || 'en'}`;

  try {
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'mode': isMonthly ? 'subscription' : 'payment',
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1',
        'success_url': successUrl,
        'cancel_url': cancelUrl,
        'metadata[plan]': plan,
        'metadata[lang]': lang || 'en',
        'allow_promotion_codes': 'true',
      }).toString()
    });

    const session = await response.json();
    if (session.error) {
      console.error('Stripe session error:', session.error);
      return res.status(500).json({ error: session.error.message });
    }
    res.json({ url: session.url, sessionId: session.id });
  } catch(err) {
    console.error('Stripe create session error:', err);
    res.status(500).json({ error: "Failed to create checkout session." });
  }
});

// Verify Stripe Session (called on return from Stripe)
app.get("/api/verify-session", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: "Missing session_id." });
  if (!STRIPE_SECRET) return res.status(500).json({ error: "Stripe not configured." });

  try {
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${session_id}`, {
      headers: { 'Authorization': `Bearer ${STRIPE_SECRET}` }
    });
    const session = await response.json();

    if (session.error) {
      return res.status(400).json({ error: "Invalid session." });
    }

    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) {
      return res.status(402).json({ error: "Payment not completed." });
    }

    const plan = session.metadata?.plan || 'essential';
    const lang = session.metadata?.lang || 'en';
    // Stripe's hosted checkout page collects the customer's email by default,
    // even though we never explicitly request it via customer_email or metadata.
    // It's available here on customer_details.email.
    const customerEmail = session.customer_details?.email || null;

    // Create a minimal subscriber record right now, immediately after payment,
    // rather than waiting for the customer to click "Send to my email" on the
    // kit screen. Previously, a customer who paid and viewed their kit but never
    // clicked that button had NO database record at all — meaning they were
    // invisible to admin stats and to refund-eligibility (kit_opened_at) tracking.
    // This is non-blocking: if it fails, payment verification still succeeds and
    // the later /api/send-email call will still create/complete the record as before.
    if (customerEmail && SUPABASE_KEY) {
      try {
        const existing = await supabaseQuery('subscribers', `email=eq.${encodeURIComponent(customerEmail)}&select=id&limit=1`);
        if (!Array.isArray(existing) || existing.length === 0) {
          await supabaseUpsert('subscribers', {
            email: customerEmail,
            plan,
            lang,
            signed_up_at: new Date().toISOString(),
            active: plan === 'monthly',
          });
        }
      } catch (dbErr) {
        console.error('verify-session: non-blocking pre-record creation failed:', dbErr);
      }
    }

    res.json({
      success: true,
      plan,
      lang,
      sessionId: session.id,
      email: customerEmail,
    });
  } catch(err) {
    console.error('Stripe verify error:', err);
    res.status(500).json({ error: "Verification failed." });
  }
});

// Stripe Webhook (for reliable payment confirmation + email backup)
app.post("/api/stripe-webhook", express.raw({ type: 'application/json' }), async (req, res) => {
  // SECURITY: fail CLOSED, not open. If the webhook secret isn't configured,
  // we cannot verify the request actually came from Stripe — so we reject it
  // rather than silently accepting an unverified payload as a valid event.
  if (!STRIPE_WEBHOOK_SECRET || !stripeClient) {
    console.error('Stripe webhook called but STRIPE_WEBHOOK_SECRET/STRIPE_SECRET_KEY is not configured — rejecting unverifiable request.');
    return res.status(500).send('Webhook not configured');
  }

  const sig = req.headers['stripe-signature'];
  if (!sig) {
    return res.status(400).send('Missing signature');
  }

  let event;

  try {
    // Use Stripe's official SDK for signature verification rather than hand-rolled
    // HMAC comparison. The SDK correctly handles raw-body byte comparison, constant-time
    // comparison (avoids timing attacks), and the exact signature header parsing format —
    // a hand-rolled version of this previously failed verification in production despite
    // looking correct on inspection, which is exactly the failure mode official docs warn
    // hand-rolled implementations are prone to.
    event = stripeClient.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch(err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  // Handle events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log(`Payment confirmed via webhook: ${session.id} plan=${session.metadata?.plan}`);
  }

  res.status(200).json({ received: true });
});

// ─── CATCH ALL ────────────────────────────────────────────────────────────────

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TheFirstWord running on port ${PORT}`));
