const TELEGRAM_MESSAGE_LIMIT = 4096;

function splitMessage(message) {
  const chunks = [];
  let remaining = message;
  while (remaining.length > TELEGRAM_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf('\n', TELEGRAM_MESSAGE_LIMIT);
    if (splitAt < TELEGRAM_MESSAGE_LIMIT * 0.6) splitAt = remaining.lastIndexOf(' ', TELEGRAM_MESSAGE_LIMIT);
    if (splitAt < TELEGRAM_MESSAGE_LIMIT * 0.6) splitAt = TELEGRAM_MESSAGE_LIMIT;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

async function sendContactNotification(contact, receivedAt) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!token || !chatId) throw Object.assign(new Error('Telegram notification is not configured'), { code: 'NOT_CONFIGURED' });

  const message = [
    '\u{1F514} New Portfolio Message',
    '',
    `\u{1F464} Name: ${contact.name}`,
    `\u{1F4E7} Email: ${contact.email}`,
    `\u{1F4CC} Subject: ${contact.subject}`,
    '',
    '\u{1F4AC} Message:',
    contact.message,
    '',
    `\u{1F552} Received: ${receivedAt.toISOString()}`,
    '\u{1F310} Rajratna Portfolio',
  ].join('\n');

  for (const text of splitMessage(message)) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(10000),
    });
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok || !result?.ok) {
      const rawDescription = result?.description || `Telegram API returned HTTP ${response.status}`;
      const description = String(rawDescription)
        .split(token).join('[redacted]')
        .replace(/bot\d+:[A-Za-z0-9_-]+/g, '[redacted]')
        .replace(/[\r\n\t]+/g, ' ')
        .slice(0, 300);
      throw Object.assign(new Error(description), {
        code: `TELEGRAM_${result?.error_code || response.status}`,
        telegramDescription: description,
      });
    }
  }
}

module.exports = { sendContactNotification };
