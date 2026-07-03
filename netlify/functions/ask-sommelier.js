// AI Sommelier — recommends ONLY wines that exist in the catalogue.
// 1) pull candidate wines from the DB that relate to the question,
// 2) let the model pick & explain from that shortlist,
// 3) return the prose + full wine records (image, live price, variety, region, pairing, notes).
//
// Netlify env: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY (SUPABASE_URL optional).

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (o, s = 200) => ({ statusCode: s, headers, body: JSON.stringify(o) });

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'for', 'to', 'of', 'my', 'me', 'i', 'what', 'which', 'is', 'are', 'some', 'good', 'nice', 'best', 'you', 'recommend', 'suggest', 'wine', 'wines', 'goes', 'go', 'pair', 'pairs', 'pairing', 'have', 'want', 'looking', 'something', 'please', 'can', 'that', 'this', 'under', 'below', 'around', 'about', 'cheap', 'bottle']);

function keywords(q) {
  return [...new Set(q.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 6);
}
function maxPrice(q) {
  const m = q.toLowerCase().match(/(?:under|below|less than|max|cheaper than|<)\s*r?\s*(\d+)/);
  return m ? Number(m[1]) : null;
}
const priceOf = (w) => {
  const sp = w.selling_price != null ? Number(w.selling_price) : null;
  const promo = w.promo_price != null ? Number(w.promo_price) : null;
  return (promo != null && (sp == null || promo < sp)) ? promo : sp;
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const { question, prefs } = body;
  if (!question) return json({ error: 'question required' }, 400);

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return json({ answer: 'The Sommelier is not configured yet.' });
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  // ---- 1) candidate wines from the catalogue ----
  let candidates = [];
  if (sbKey) {
    const cols = 'id,name,producer,varietal,region,country,selling_price,promo_price,image_url,food_pairings,tasting_notes,serving_temp,avg_rating';
    const sb = (qs) => fetch(`${SUPABASE_URL}/rest/v1/wines?${qs}`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }).then((r) => r.json()).catch(() => []);
    const kws = keywords(question);
    if (kws.length) {
      const searchCols = ['name', 'varietal', 'region', 'tasting_notes', 'food_pairings', 'producer'];
      const ors = [];
      for (const k of kws) for (const c of searchCols) ors.push(`${c}.ilike.*${encodeURIComponent(k)}*`);
      candidates = await sb(`select=${cols}&or=(${ors.join(',')})&limit=60`);
    }
    if (!Array.isArray(candidates) || candidates.length < 4) {
      const top = await sb(`select=${cols}&order=avg_rating.desc.nullslast&limit=24`);
      const seen = new Set((candidates || []).map((w) => w.id));
      candidates = [...(Array.isArray(candidates) ? candidates : []), ...(Array.isArray(top) ? top : []).filter((w) => !seen.has(w.id))];
    }
    candidates = (candidates || []).filter((w) => w.active !== false);
    const cap = maxPrice(question);
    if (cap) { const inb = candidates.filter((w) => priceOf(w) != null && priceOf(w) <= cap); if (inb.length >= 3) candidates = inb; }
    candidates = candidates.slice(0, 40);
  }

  // If we have no catalogue, fall back to a plain answer.
  if (!candidates.length) {
    const ans = await plain(apiKey, question, prefs);
    return json({ answer: ans });
  }

  // ---- 2) let the model pick from the shortlist ----
  const list = candidates.map((w) => {
    const p = priceOf(w);
    return `${w.id} | ${w.name}${w.varietal ? ' · ' + w.varietal : ''}${w.region ? ' · ' + w.region : ''}${p != null ? ' · R' + p : ''}${w.tasting_notes ? ' — ' + String(w.tasting_notes).slice(0, 70) : ''}`;
  }).join('\n');
  const sys = [
    'You are the Tops Cellar Selection Sommelier — elegant, warm, knowledgeable. South African English.',
    'Recommend ONLY wines from the CANDIDATES list (they are the ones in stock). Never invent wines or prices.',
    'Pick the 1–3 best matches for the member. Keep the intro to 1–2 warm sentences; do not list prices in the intro (the app shows the cards).',
    prefs ? `Member preferences: ${prefs}.` : '',
    'Return STRICT JSON only: {"intro": string, "picks": [wine_id, ...]}. picks are ids copied exactly from the list.',
  ].filter(Boolean).join('\n');

  let data;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', max_tokens: 400, system: sys,
        messages: [{ role: 'user', content: `Question: ${question}\n\nCANDIDATES:\n${list}` }],
      }),
    });
    data = await res.json();
  } catch (e) { return json({ answer: `Sorry, I'm unavailable right now.` }); }
  if (data.type === 'error') return json({ answer: `Sorry, I'm unavailable right now.` });

  const text = (data.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let parsed; try { parsed = JSON.parse(text.replace(/```json|```/g, '').trim()); } catch { parsed = { intro: text.trim(), picks: [] }; }
  const byId = new Map(candidates.map((w) => [String(w.id), w]));
  const wines = (parsed.picks || []).map((id) => byId.get(String(id))).filter(Boolean).slice(0, 3);
  return json({ answer: parsed.intro || 'Here are a couple you might love.', wines });
};

async function plain(apiKey, question, prefs) {
  const sys = [
    'You are the Tops Cellar Selection Sommelier — elegant, knowledgeable, warm. South African English. Rand prices as "R89.99".',
    'Keep answers to 2–4 sentences.', prefs ? `Member preferences: ${prefs}.` : '',
  ].filter(Boolean).join('\n');
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, system: sys, messages: [{ role: 'user', content: question }] }),
    });
    const d = await res.json();
    return (d.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('') || 'I could not answer that just now.';
  } catch { return `Sorry, I'm unavailable right now.`; }
}
