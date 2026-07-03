// Netlify Function: "Generate post" — turns the manager's rough line (and optional
// photo) into polished, on-brand copy for a post/poster. Auto-deploys with the site.
//
// Requires Netlify env vars:
//   ANTHROPIC_API_KEY  (secret)
//   ADMIN_TOKEN        (secret) — gates this function; must match the admin passphrase
//
// Body: { postType, photoBase64?, photoMediaType?, rawText? }
// Returns: { headline, subhead, body, price, price_found }
// GUARDRAIL: never invents a price.

const MODEL = 'claude-sonnet-4-6';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
function json(obj, statusCode = 200) { return { statusCode, headers, body: JSON.stringify(obj) }; }

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken) return json({ error: 'ADMIN_TOKEN not configured in Netlify.' }, 500);
  if ((event.headers['x-admin-token'] || '') !== adminToken) return json({ error: 'Unauthorised' }, 401);

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured.' }, 500);

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { postType = 'Member Special', photoBase64, photoMediaType = 'image/jpeg', rawText = '' } = payload;

  const sys = [
    'You write short, premium, on-brand copy for the Tops Cellar Selection, a luxury wine-magazine-style members club in South Africa.',
    'Voice: elegant, warm, confident, never salesy or shouty. South African English. Rand prices as "R89.99".',
    'CRITICAL RULES:',
    '- NEVER invent or guess a price. Use only a price the manager typed or one clearly legible in the photo.',
    '- If no price is available, set price to null and price_found to false.',
    '- No health claims. Age-appropriate (18+ liquor).',
    'Return STRICT JSON only, no markdown, no preamble, with keys: headline, subhead, body, price, price_found.',
    'headline: 2-4 words. subhead: a short kicker like "This weekend only". body: 1-2 sentences. price: string like "R89.99" or null.',
  ].join('\n');

  const content = [];
  if (photoBase64) content.push({ type: 'image', source: { type: 'base64', media_type: photoMediaType, data: photoBase64 } });
  content.push({ type: 'text', text: `Post type: ${postType}\nManager note (may be blank or rough): "${rawText}"\nWrite the post.` });

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system: sys, messages: [{ role: 'user', content }] }),
    });
    const data = await res.json();
    if (data.type === 'error') return json({ error: `Anthropic error: ${data.error?.message || 'unknown'}` }, 400);
    const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(clean); }
    catch { parsed = { headline: '', subhead: '', body: clean, price: null, price_found: false }; }
    return json(parsed);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
};
