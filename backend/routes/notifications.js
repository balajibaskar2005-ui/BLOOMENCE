const express = require('express');
const router = express.Router();
const { sendEmail } = require('../utils/mailer');
const User = require('../models/User');
const Result = require('../models/Result');

router.post('/register', async (req, res) => {
  try {
    const { uid } = req.user; // from auth middleware
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ message: 'email required' });

    const existing = await User.findOne({ firebaseUid: uid });
    if (existing) {
      await User.updateOne({ firebaseUid: uid }, { $set: { email, name }, $setOnInsert: { registeredAt: new Date() } });
      try {
        const io = req.app.get('io');
        if (io) io.to(uid).emit('notifications:registered', { email, name, existed: true });
      } catch (_) { }
      return res.json({ message: 'Profile updated' });
    }
    

    // New user -> create and send welcome once
    await User.create({ firebaseUid: uid, email, name, registeredAt: new Date(), lastSeen: new Date() });

    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const html = `
      <div style="font-family: Arial, sans-serif; background:#f7f9fc; padding:20px;">
        <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
          <div style="text-align:center;font-size:28px;">🌿 <span style="color:#10b981; font-weight:700;">Bloomence</span></div>
          <h2 style="color:#111827;">Welcome, ${name || 'there'}!</h2>
          <p style="color:#374151;">You're all set — your account was created successfully.</p>
          <p style="color:#374151;">Start your journey with Bloomence by taking a quick check-in.</p>
          <div style="margin-top:16px;">
            <a href="${appUrl}" style="background:#10b981;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;">Start your journey</a>
          </div>
          <p style="color:#6b7280;margin-top:24px;">With care,<br/>Bloomence Team</p>
        </div>
      </div>`;

    await sendEmail(email, 'Welcome — Start your journey with Bloomence', html);
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(uid).emit('email:sent', { kind: 'register', to: email });
        io.to(uid).emit('notifications:registered', { email, name, existed: false });
      }
    } catch (_) { }

    res.json({ message: 'Welcome email sent' });
  } catch (e) {
    console.error('register email error', e);
    res.status(500).json({ message: 'failed to process registration' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { uid } = req.user;
    const user = await User.findOneAndUpdate(
      { firebaseUid: uid },
      { $set: { lastSeen: new Date() } },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'user not found' });

    // First-login success email (send once if enabled)
    if (user.emailPrefs?.loginEmails !== false && !user.firstLoginEmailedAt) {
      try {
        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const html = `
          <div style="font-family: Arial, sans-serif; background:#f7f9fc; padding:20px;">
            <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
              <div style="text-align:center;font-size:28px;">🌿 <span style="color:#10b981; font-weight:700;">Bloomence</span></div>
              <h2 style="color:#111827;">You successfully logged in, ${user.name || 'there'}!</h2>
              <p style="color:#374151;">Welcome aboard. Keep your streak going with a quick check-in.</p>
              <div style="margin-top:16px;">
                <a href="${appUrl}" style="background:#10b981;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open Bloomence</a>
              </div>
              <p style="color:#6b7280;margin-top:24px;">With care,<br/>Bloomence Team</p>
            </div>
          </div>`;
        await sendEmail(user.email, 'Login successful — Welcome to Bloomence', html);
        await User.updateOne({ firebaseUid: uid }, { $set: { firstLoginEmailedAt: new Date() } });
      } catch (_) { }
    }
    // Send welcome-back email on login (throttled once per 24h). If scores exist, include them.
    try {
      const now = Date.now();
      const lastScoreAt = user.lastScoreEmailAt ? new Date(user.lastScoreEmailAt).getTime() : 0;
      const THROTTLE_MS = 24 * 60 * 60 * 1000;
      if (now - lastScoreAt >= THROTTLE_MS) {
        const latestPHQ = await Result.findOne({ firebaseUid: uid, questionnaireType: 'PHQ-9' }).sort({ createdAt: -1 }).lean();
        const latestGAD = await Result.findOne({ firebaseUid: uid, questionnaireType: 'GAD-7' }).sort({ createdAt: -1 }).lean();
        const appUrl = process.env.APP_URL || 'http://localhost:5173';
        const phqScore = latestPHQ ? latestPHQ.totalScore : null;
        const gadScore = latestGAD ? latestGAD.totalScore : null;
        const phqIcon = phqScore == null ? '' : (phqScore >= 15 ? '🌧️' : phqScore >= 10 ? '🌥️' : '🌤️');
        const gadIcon = gadScore == null ? '' : (gadScore >= 15 ? '🌧️' : gadScore >= 10 ? '🌥️' : '🌤️');
        const hasScores = phqScore != null || gadScore != null;

        const headerTitle = hasScores ? 'Your latest scores' : `Welcome back, ${user.name || 'there'}!`;
        const subtitle = hasScores
          ? 'Here is a quick summary from your recent check-ins.'
          : 'Great to see you again. Continue your journey with a quick check-in.';

        const scoresBlock = hasScores ? `
          <div style="display:flex;gap:12px;align-items:center;margin:12px 0;">
            ${phqScore != null ? `<div style=\"flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:12px;\"><div style=\"font-weight:600;color:#111827;\">PHQ‑9</div><div style=\"font-size:24px;\">${phqIcon} <b>${phqScore}</b></div></div>` : ''}
            ${gadScore != null ? `<div style=\"flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:12px;\"><div style=\"font-weight:600;color:#111827;\">GAD‑7</div><div style=\"font-size:24px;\">${gadIcon} <b>${gadScore}</b></div></div>` : ''}
          </div>` : '';

        const html = `
          <div style="font-family: Arial, sans-serif; background:#f7f9fc; padding:20px;">
            <div style="max-width:600px;margin:auto;background:#ffffff;border-radius:12px;padding:24px;border:1px solid #e5e7eb;">
              <div style="text-align:center;font-size:28px;">🌿 <span style="color:#10b981; font-weight:700;">Bloomence</span></div>
              <h2 style="color:#111827;">${headerTitle}</h2>
              <p style="color:#374151;">${subtitle}</p>
              ${scoresBlock}
              <div style="margin-top:16px;">
                <a href="${appUrl}" style="background:#10b981;color:#ffffff;padding:10px 16px;border-radius:8px;text-decoration:none;">Open Bloomence</a>
              </div>
              <p style="color:#6b7280;margin-top:24px;">With care,<br/>Bloomence Team</p>
            </div>
          </div>`;

        await sendEmail(user.email, hasScores ? 'Your latest Bloomence scores' : 'Welcome back to Bloomence', html);
        await User.updateOne({ firebaseUid: uid }, { $set: { lastScoreEmailAt: new Date() } });
        try {
          const io = req.app.get('io');
          if (io) io.to(uid).emit('email:sent', { kind: hasScores ? 'loginScores' : 'welcomeBack', to: user.email });
        } catch (_) { }
      }
    } catch (e) {
      console.error('login combined score email error', e);
    }

    try {
      const io = req.app.get('io');
      if (io) io.to(uid).emit('auth:login', { when: Date.now() });
    } catch (_) { }

    res.json({ message: 'Login recorded' });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ message: 'failed to record login' });
  }
});

// mark seen (frontend can call on app open)
router.post('/seen', async (req, res) => {
  try {
    const { uid } = req.user;
    await User.updateOne({ firebaseUid: uid }, { $set: { lastSeen: new Date() } });
    res.json({ message: 'Seen recorded' });
  } catch (e) {
    console.error('seen error', e);
    res.status(500).json({ message: 'failed to record seen' });
  }
});

// Diagnostic: send a test email directly using the authenticated user, bypassing DB lookups
router.post('/test', async (req, res) => {
  try {
    const { to, subject, html, text } = req.body || {};
    if (!to) return res.status(400).json({ message: 'to is required' });

    const safeSubject = subject || 'Bloomence test email';
    const safeHtml = html || '<b>Hello from Bloomence /api/notifications/test</b>';
    const info = await sendEmail(to, safeSubject, safeHtml, text);

    // Realtime notify
    try {
      const io = req.app.get('io');
      if (io) io.to(req.user.uid).emit('email:sent', { kind: 'test', to });
    } catch (_) { }

    res.json({ message: 'Test email sent', id: info && (info.messageId || undefined) });
  } catch (e) {
    console.error('test email error', e);
    res.status(500).json({ message: 'failed to send test email' });
  }
});

module.exports = router;
