// Web Push relay for the Tasks PWA.
//
// The PWA registers its push subscription here (/subscribe). The Siri / Apple Watch
// Shortcut calls /notify after writing an idea, and every registered device gets a
// notification. Both calls carry a Firebase ID token for the timetracker project, so
// only a signed-in user can subscribe or trigger a push.
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

const cors = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
});

async function verify(req, env) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    return payload.sub || null;
  } catch { return null; }
}

async function subKey(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return 'sub:' + [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendAll(env, message) {
  const vapid = { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY };
  const { keys } = await env.SUBS.list({ prefix: 'sub:' });
  let sent = 0;
  await Promise.all(keys.map(async ({ name }) => {
    const sub = await env.SUBS.get(name, 'json'); if (!sub) return;
    const payload = await buildPushPayload({ data: JSON.stringify(message), options: { ttl: 86400, urgency: 'high' } }, sub, vapid);
    const res = await fetch(sub.endpoint, payload);
    if (res.status === 404 || res.status === 410) await env.SUBS.delete(name); // device unsubscribed
    else if (res.ok) sent++;
  }));
  return sent;
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') === env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : 'null';
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

    const uid = await verify(req, env);
    if (!uid) return json({ error: 'unauthorised' }, 401);

    const path = new URL(req.url).pathname;
    const body = await req.json().catch(() => ({}));

    if (path === '/subscribe') {
      if (!body.endpoint?.startsWith('https://') || !body.keys?.p256dh || !body.keys?.auth) return json({ error: 'bad subscription' }, 400);
      await env.SUBS.put(await subKey(body.endpoint), JSON.stringify({ endpoint: body.endpoint, expirationTime: null, keys: body.keys }));
      return json({ ok: true });
    }
    if (path === '/unsubscribe') {
      if (body.endpoint) await env.SUBS.delete(await subKey(body.endpoint));
      return json({ ok: true });
    }
    if (path === '/notify') {
      const text = String(body.title || body.text || '').trim().slice(0, 300);
      if (!text) return json({ error: 'missing title' }, 400);
      const sent = await sendAll(env, { title: String(body.heading || '💡 Added from watch').slice(0, 80), body: text });
      return json({ ok: true, sent });
    }
    return json({ error: 'not found' }, 404);
  },
};
