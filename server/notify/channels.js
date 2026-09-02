// Delivery channels. Each takes (user, message) and returns { ok, detail }. Push is the
// default; webhook lets people route to ntfy, Slack, Zapier, Home Assistant, etc.; SMS is
// optional via Twilio. The console channel always logs so a dev can see what fired.
import webpush from 'web-push';

let vapidReady = false;
export function configurePush(env = process.env) {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(env.VAPID_SUBJECT || 'mailto:admin@example.com', env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
    vapidReady = true;
  }
  return vapidReady;
}
export function pushEnabled() { return vapidReady; }

export async function sendPush(user, msg, { db, webpushImpl = webpush } = {}) {
  if (!vapidReady) return { ok: false, detail: 'push not configured (no VAPID keys)' };
  const subs = user.channels?.push || [];
  if (!subs.length) return { ok: false, detail: 'no push subscriptions' };
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/', tag: msg.tag || msg.type, type: msg.type });
  const dead = [];
  let sent = 0;
  for (const sub of subs) {
    try { await webpushImpl.sendNotification(sub, payload, { TTL: 3600, urgency: 'high' }); sent++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) dead.push(sub.endpoint); else console.warn('[push] failed', e.statusCode || e.message); }
  }
  if (dead.length && db) {
    user.channels.push = subs.filter((s) => !dead.includes(s.endpoint));
    db.updateUser(user.id, { channels: user.channels });
  }
  return { ok: sent > 0, detail: `${sent} device(s)` };
}

export async function sendWebhook(user, msg, { fetchImpl = fetch } = {}) {
  const url = user.channels?.webhook;
  if (!url) return { ok: false, detail: 'no webhook' };
  try {
    const isNtfy = /ntfy/i.test(url);
    const res = isNtfy
      ? await fetchImpl(url, { method: 'POST', headers: { Title: msg.title, Tags: 'football', Priority: msg.type === 'change' ? 'high' : 'default', ...(msg.url ? { Click: msg.url } : {}) }, body: msg.body })
      : await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: msg.title, body: msg.body, text: `${msg.title}\n${msg.body}`, type: msg.type, url: msg.url || null, gameId: msg.gameId || null }) });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) { return { ok: false, detail: e.message }; }
}

export async function sendSms(user, msg, { env = process.env, fetchImpl = fetch } = {}) {
  const to = user.channels?.sms;
  if (!to) return { ok: false, detail: 'no sms number' };
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_FROM) return { ok: false, detail: 'sms not configured' };
  try {
    const body = new URLSearchParams({ To: to, From: env.TWILIO_FROM, Body: `${msg.title}\n${msg.body}` });
    const res = await fetchImpl(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
      method: 'POST', headers: { authorization: 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' }, body,
    });
    return { ok: res.ok, detail: `HTTP ${res.status}` };
  } catch (e) { return { ok: false, detail: e.message }; }
}

export async function deliver(user, msg, ctx = {}) {
  const results = {};
  const log = ctx.logger || console;
  log.log(`[alert] ${user.id} ${msg.type} :: ${msg.title} — ${msg.body.replace(/\n/g, ' | ')}`);
  results.console = { ok: true };
  if (user.channels?.push?.length) results.push = await sendPush(user, msg, ctx);
  if (user.channels?.webhook) results.webhook = await sendWebhook(user, msg, ctx);
  if (user.channels?.sms) results.sms = await sendSms(user, msg, ctx);
  if (ctx.inbox) ctx.inbox.push({ userId: user.id, at: new Date().toISOString(), ...msg, results });
  return results;
}
