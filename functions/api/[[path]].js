const UPSTREAM_BASE = 'https://solidarksystems.alwaysdata.net';

const ROUTES = {
  adsoyad:  { file: 'adsoyad.php',  params: ['ad', 'soyad', 'il', 'ilce'] },
  adililce: { file: 'adililce.php', params: ['ad', 'il', 'ilce'] },
  tcgsm:    { file: 'tcgsm.php',    params: ['tc'] },
  gsmtc:    { file: 'gsmtc.php',    params: ['gsm'] },
  adres:    { file: 'adres.php',    params: ['tc'] },
  sgk:      { file: 'sgk.php',      params: ['tc'] },
  isyeri:   { file: 'isyeri.php',   params: ['tc'] },
  vesika:   { file: 'vesika.php',   params: ['tc'] },
  ailepro:  { file: 'ailepro.php',  params: ['tc'] },
  tc:       { file: 'tc.php',       params: ['tc'] },
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  const endpoint = url.pathname.replace('/api/', '').split('/')[0];
  const route = ROUTES[endpoint];

  if (!route) return json({ error: 'Gecersiz endpoint' }, 404);

  const upstream = new URL(`${UPSTREAM_BASE}/${route.file}`);
  for (const p of route.params) {
    const val = url.searchParams.get(p);
    if (val) upstream.searchParams.set(p, val);
  }

  const res = await fetch(upstream.toString());
  const text = await res.text();

  // JSON değilse (vesika resim olabilir) aynen dön
  let data;
  try { data = JSON.parse(text); }
  catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // 🔥 auth / auth_alt alanlarını sil
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    delete obj.auth;
    delete obj.auth_alt;
    if (Array.isArray(obj.veri)) {
      obj.veri = obj.veri.map(v => {
        if (v && typeof v === 'object') { delete v.auth; delete v.auth_alt; }
        return v;
      });
    }
    return obj;
  };

  return json(clean(data), res.status);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
