// Optional push notifications through ntfy (https://ntfy.sh, free, no account; works with the ntfy iOS/Android app).
// Users pick a hard-to-guess topic name in Settings; the digest is also published there.
const SERVER = (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/$/, '');

export const validTopic = (t) => /^[A-Za-z0-9_-]{6,64}$/.test(t);

export async function sendPush(topic, { title, message, click }) {
  if (!validTopic(topic)) return false;
  const headers = { Title: title.replace(/[^\x20-\x7E]/g, ''), Priority: '4', Tags: 'credit_card' };
  if (click) headers.Click = click;
  const r = await fetch(`${SERVER}/${topic}`, { method: 'POST', headers, body: message, signal: AbortSignal.timeout(8000) });
  return r.ok;
}
