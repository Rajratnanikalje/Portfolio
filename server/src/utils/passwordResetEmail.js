const nodemailer = require('nodemailer');

async function sendPasswordResetOtp({ to, otp }) {
  const host = process.env.PASSWORD_RESET_EMAIL_HOST;
  const port = Number(process.env.PASSWORD_RESET_EMAIL_PORT || 587);
  const user = process.env.PASSWORD_RESET_EMAIL_USER;
  const pass = process.env.PASSWORD_RESET_EMAIL_PASSWORD;
  const from = process.env.PASSWORD_RESET_EMAIL_FROM;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) {
    throw Object.assign(new Error('Password reset email is not configured'), { code: 'NOT_CONFIGURED' });
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: process.env.PASSWORD_RESET_EMAIL_SECURE === 'true' || port === 465,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  await transport.sendMail({
    from,
    to,
    subject: 'Your Portfolio Admin Password Reset OTP',
    text: `Your password reset OTP is:\n\n${otp}\n\nThis OTP expires in 10 minutes.\n\nIf you did not request a password reset, ignore this email.`,
  });
}

module.exports = { sendPasswordResetOtp };
