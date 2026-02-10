require('dotenv').config();
const { sendEmail } = require('./utils/mailer');

function buildCardHtml({ title, subtitle, ctaLabel = 'Open Bloomence', appUrl, name }) {
  return `
    <div style="font-family: Arial, sans-serif; background:#f7f9fc; padding:20px;">
      <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
        <div style="text-align:center;font-size:28px;">🌿 <span style="color:#10b981; font-weight:700;">Bloomence</span></div>
        <h2 style="color:#111827;">${title}</h2>
        <p style="color:#374151;">${subtitle}</p>
        <div style="margin-top:16px;">
          <a href="${appUrl}" style="background:#10b981;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;">${ctaLabel}</a>
        </div>
        <p style="color:#6b7280;margin-top:24px;">With care,<br/>Bloomence Team</p>
      </div>
    </div>`;
}

(async () => {
  try {
    console.log('SMTP host/port from .env:', process.env.SMTP_HOST, process.env.SMTP_PORT);
    const to = process.argv[2] || process.env.TEST_EMAIL_TO;
    const subjectArg = process.argv[3];
    const name = process.argv[4] || 'there';
    const mode = (process.argv[5] || 'welcome').toLowerCase(); // 'welcome' | 'welcomeBack'
    if (!to) {
      console.error('Usage: node send_test_email.js <recipient_email> [subject] [name] [welcome|welcomeBack]');
      console.error('Or set TEST_EMAIL_TO in .env and run without args');
      process.exit(1);
    }
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const isWelcomeBack = mode === 'welcomeback';
    const title = isWelcomeBack ? `Welcome back, ${name}!` : `Welcome, ${name}!`;
    const subtitle = isWelcomeBack
      ? 'Great to see you again. Continue your journey with a quick check-in.'
      : "You're all set — your account was created successfully. Start your journey with a quick check-in.";
    const html = buildCardHtml({ title, subtitle, appUrl, name });
    const subject = subjectArg || (isWelcomeBack ? 'Welcome back to Bloomence' : 'Welcome — Start your journey with Bloomence');

    const info = await sendEmail(to, subject, html);
    console.log('Email sent:', info && (info.messageId || info.response || JSON.stringify(info)));
  } catch (e) {
    console.error('Send failed:', e);
    process.exit(1);
  }
})();
