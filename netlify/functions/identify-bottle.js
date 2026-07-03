// Netlify Function: identify a wine bottle from a photo using Claude Vision,
// match it against the wines database, and optionally upload the image to Supabase Storage.
//
// POST body: { imageBase64: string (JPEG/PNG base64), imageMediaType?: string }
// Headers:   x-admin-token
//
// Returns: { ok, label, best_match, top_matches, image_url }
//   label:       fields Claude read from the bottle ({ brand, wine_name, variety, vintage, size })
//   best_match:  wine record with match_score (0-100), or null
//   top_matches: up to 5 scored matches
//   image_url:   public Supabase Storage URL if upload succeeded, otherwise null
//
// To enable image upload: create a PUBLIC bucket called "wine-images" in your Supabase dashboard.
// If the bucket doesn't exist the function still returns the match — image_url will just be null.
//
// Requires env vars: ANTHROPIC_API_KEY, SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://wwwrrtmuisdgkkwxyjdo.supabase.co').replace(/\/$/, '');

const RESPONSE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, x-admin-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (obj, status = 200) => ({
  statusCode: status,
  headers: RESPONSE_HEADERS,
  body: JSON.stringify(obj),
});

// Common wine abbreviations — expand before comparing so "CAB SAUV" matches "cabernet sauvignon"
const ABBREVS = {
  cab: 'cabernet', sauv: 'sauvignon', sbs: 'sauvignon blanc', bl: 'blanc',
  chard: 'chardonnay', pino: 'pinot', noir: 'noir', gris: 'gris',
  shiraz: 'syrah', merlot: 'merlot', pinotage: 'pinotage', chenin: 'chenin',
  sem: 'semillon', riesling: 'riesling', viognier: 'viognier',
  grenache: 'grenache', gran: 'grenache', zin: 'zinfandel', temp: 'tempranillo',
  ros: 'rose', rose: 'rose', bubb: 'sparkling', mcc: 'sparkling',
  nat: 'natural', sw: 'sweet',
};

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function expand(s) {
  return norm(s).split(' ').map(w => ABBREVS[w] || w).join(' ');
}

function wordOverlap(a, b) {
  const aw = a.split(' ').filter(w => w.length > 2);
  const bw = b.split(' ');
  if (!aw.length) return 0;
  const hits = aw.filter(w => bw.some(bk => bk.includes(w) || w.includes(bk)));
  return hits.length / aw.length;
}

function scoreMatch(wine, label) {
  let s = 0;
  const wName = expand(wine.name || '');
  const wProd = expand(wine.producer || '');
  const wVar = expand(wine.varietal || '');
  const lBrand = expand(label.brand || '');
  const lWine = expand(label.wine_name || '');
  const lVariety = expand(label.variety || '');
  const lVintage = String(label.vintage || '').replace(/\D/g, '').slice(0, 4);

  // --- Producer / brand (35 pts) ---
  if (lBrand) {
    const prodTarget = wProd || wName;
    if (prodTarget.includes(lBrand) || lBrand.includes(prodTarget)) {
      s += 35;
    } else {
      s += Math.round(wordOverlap(lBrand, prodTarget) * 22);
    }
  }

  // --- Wine name / range (40 pts) ---
  if (lWine) {
    const nameTarget = [wName, wProd].join(' ');
    if (nameTarget.includes(lWine) || lWine.includes(nameTarget)) {
      s += 40;
    } else {
      s += Math.round(wordOverlap(lWine, nameTarget) * 35);
    }
  }

  // --- Variety (15 pts) ---
  if (lVariety) {
    const varTarget = [wName, wVar].join(' ');
    if (varTarget.includes(lVariety) || lVariety.includes(wVar)) s += 15;
    else s += Math.round(wordOverlap(lVariety, varTarget) * 10);
  }

  // --- Vintage (5 pts — only enriched wines have this) ---
  if (lVintage && wine.vintage && String(wine.vintage).includes(lVintage)) s += 5;

  return Math.min(100, Math.round(s));
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: RESPONSE_HEADERS, body: '' };
  if (event.httpMethod !== 'POST') return json({ error: 'POST only' }, 405);

  const adminToken = (process.env.ADMIN_TOKEN || '').trim();
  if (!adminToken) return json({ error: 'ADMIN_TOKEN not configured in Netlify.' }, 500);
  if ((event.headers['x-admin-token'] || '') !== adminToken) return json({ error: 'Unauthorised' }, 401);

  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not configured in Netlify.' }, 500);

  const srKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!srKey) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured in Netlify.' }, 500);

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  const { imageBase64, imageMediaType } = payload;
  if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);
  const mediaType = imageMediaType || 'image/jpeg';

  // 1. Call Claude Vision to read the bottle label
  let label = {};
  try {
    const vRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: imageBase64 },
            },
            {
              type: 'text',
              text: 'Read this wine bottle label. Extract the producer/winery name, wine range or product name, grape variety, vintage year, and bottle size. Return ONLY a JSON object — no explanation:\n{"brand":"<winery>","wine_name":"<wine range/product name>","variety":"<grape>","vintage":"<year or empty>","size":"<volume or empty>"}\nIf a field is not visible on the label, use "".',
            },
          ],
        }],
      }),
    });
    const vData = await vRes.json();
    const txt = (vData.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) label = JSON.parse(m[0]);
  } catch (e) {
    return json({ error: `Vision API error: ${e.message}` }, 500);
  }

  // 2. Fetch wines from Supabase for matching
  let wines = [];
  try {
    const dbRes = await fetch(
      `${SUPABASE_URL}/rest/v1/wines?select=id,name,producer,varietal,vintage,size,product_code,image_url&limit=5000&order=name.asc`,
      { headers: { apikey: srKey, Authorization: `Bearer ${srKey}` } },
    );
    const rows = await dbRes.json();
    wines = Array.isArray(rows) ? rows : [];
  } catch (e) {
    return json({ error: `Database error: ${e.message}` }, 500);
  }

  // 3. Score all wines against the label and return top matches
  const scored = wines
    .map(w => ({ ...w, match_score: scoreMatch(w, label) }))
    .filter(w => w.match_score > 5)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 5);

  // 4. Try to upload the image to Supabase Storage (wine-images bucket)
  // Requires a public bucket called "wine-images" in Supabase dashboard.
  // Gracefully falls back to null if the bucket doesn't exist.
  let imageUrl = null;
  try {
    const ext = (mediaType.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const fname = `scan-${Date.now()}.${ext}`;
    const imgBuf = Buffer.from(imageBase64, 'base64');
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/wine-images/${fname}`, {
      method: 'POST',
      headers: {
        apikey: srKey,
        Authorization: `Bearer ${srKey}`,
        'Content-Type': mediaType,
        'x-upsert': 'true',
      },
      body: imgBuf,
    });
    if (upRes.ok) {
      imageUrl = `${SUPABASE_URL}/storage/v1/object/public/wine-images/${fname}`;
    }
  } catch (_) {
    // Storage not configured — image_url stays null; staff can paste a URL manually.
  }

  return json({
    ok: true,
    label,
    best_match: scored[0] || null,
    top_matches: scored,
    image_url: imageUrl,
  });
};
