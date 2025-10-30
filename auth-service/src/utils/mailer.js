const nodemailer = require('nodemailer');

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '0', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !port || !user || !pass) {
    console.warn('[mailer] SMTP env vars missing. Emails will be logged to console only.');
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
}

const transporter = createTransport();

async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    console.log('[mailer:dev] sendMail mock:', { to, subject, text, html });
    return { messageId: 'mock-message-id' };
  }
  const from = process.env.SMTP_FROM || `No Reply <no-reply@localhost>`;
  return transporter.sendMail({ from, to, subject, text, html });
}

async function sendVerificationEmail(to, verifyLink) {
  const subject = 'Verifica tu correo';
  const text = `Hola,\n\nPor favor verifica tu correo haciendo clic en el siguiente enlace:\n${verifyLink}\n\nSi no fuiste tú, ignora este mensaje.`;
  const html = `
    <p>Hola,</p>
    <p>Por favor verifica tu correo haciendo clic en el siguiente enlace:</p>
    <p><a href="${verifyLink}">Verificar correo</a></p>
    <p>Si no fuiste tú, ignora este mensaje.</p>
  `;
  return sendMail({ to, subject, text, html });
}

module.exports = { sendMail, sendVerificationEmail };
