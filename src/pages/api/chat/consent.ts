import type { APIRoute } from 'astro';
import { CONSENT_COOKIE, CONSENT_ACCEPTED, CONSENT_DECLINED } from '../../../lib/chat/consent';
import { json, readBody } from '../../../lib/chat/server';
import { chatText } from '../../../lib/chat/copy';
export const ALL: APIRoute = async ({ request, url, cookies }) => {
  const lang = request.headers.get('X-Chat-Language') === 'el' ? 'el' : 'en';
  if (request.method !== 'POST') return json({ error: chatText('Method not allowed.', lang) }, 405, { Allow: 'POST' });
  if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: chatText('Request origin rejected.', lang) }, 403);
  let body;
  try { body = await readBody(request); } catch { return json({ error: chatText('Invalid request.', lang) }, 400); }
  if (!body || !['accepted', 'declined'].includes(body.choice)) return json({ error: chatText('Invalid request.', lang) }, 400);
  cookies.set(CONSENT_COOKIE, body.choice === 'accepted' ? CONSENT_ACCEPTED : CONSENT_DECLINED, {
    path: '/', sameSite: 'strict', secure: url.protocol === 'https:', httpOnly: false, maxAge: 180 * 86400,
  });
  if (body.choice === 'declined') {
    cookies.set('__Host-site_chat', '', { path: '/', secure: true, httpOnly: true, sameSite: 'strict', maxAge: 0 });
    cookies.set('site_chat', '', { path: '/', secure: url.protocol === 'https:', httpOnly: true, sameSite: 'strict', maxAge: 0 });
  }
  return json({ choice: body.choice });
};
