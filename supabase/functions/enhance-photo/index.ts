const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-token',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const expected = Deno.env.get('ADMIN_TOKEN');
  if (!expected || req.headers.get('x-admin-token') !== expected) return json({ error: 'Unauthorised' }, 401);

  try {
    const { imageBase64, imageMediaType = 'image/jpeg', style } = await req.json();
    if (!imageBase64) return json({ error: 'imageBase64 required' }, 400);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 500);

    const bytes = Uint8Array.from(atob(imageBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: imageMediaType });

    const prompt = style === 'cellar'
      ? 'Place this bottle in an elegant wine cellar setting. Stone walls, wooden racks, warm candlelight, dark moody atmosphere. Keep the bottle as the hero centerpiece. Photorealistic luxury product photography.'
      : style === 'marble'
      ? 'Place this bottle on a dark marble surface with soft dramatic side-lighting. Minimalist luxury. Dark background with subtle bokeh. Photorealistic premium product photography.'
      : 'Place this wine or spirit bottle in an elegant luxury lifestyle setting. Moody dramatic lighting, dark rich background, marble or wood surface, premium atmosphere. Keep the bottle prominent and clearly visible. Photorealistic high-end product photography.';

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image[]', blob, 'product.jpg');
    form.append('prompt', prompt);
    form.append('n', '1');
    form.append('size', '1024x1024');

    const res = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: form,
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data.error?.message || 'OpenAI error' }, 500);

    const enhancedBase64 = data.data?.[0]?.b64_json;
    if (!enhancedBase64) return json({ error: 'No image returned from OpenAI' }, 500);

    return json({ enhancedImageBase64: enhancedBase64 });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
