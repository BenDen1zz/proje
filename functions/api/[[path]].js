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
  log:      { file: 'log.php',      params: ['url'] }
};

const FIELD_MAP = {
  YAKINLIK: 'YAKINLIK DURUMU', TC: 'TC', ADI: 'ADI', SOYADI: 'SOYADI', GSM: 'GSM',
  BABAADI: 'BABA ADI', BABATC: 'BABA TC', ANNEADI: 'ANNE ADI', ANNETC: 'ANNE TC',
  DOGUMTARIHI: 'DOĞUM TARİHİ', OLUMTARIHI: 'ÖLÜM TARİHİ', DOGUMYERI: 'DOĞUM YERİ',
  NUFUSIL: 'NUFUS İL', NUFUSILCE: 'NUFUS İLÇE', MEMLEKETIL: 'MEMLEKET İL', MEMLEKETILCE: 'MEMLEKET İLÇE', MEMLEKETKOY: 'MEMLEKET KÖY',
  ADRESIL: 'ADRES İL', ADRESILCE: 'ADRES İLÇE', AILESIRANO: 'AİLE SIRA NO',
  BIREYSIRANO: 'BİREY SIRA NO', MEDENIHAL: 'MEDENİ HAL', CINSIYET: 'CİNSİYET', UYRUK: 'UYRUK',
};

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const acceptHeader = request.headers.get('Accept') || '';

  const endpoint = url.pathname.replace('/api/', '').split('/')[0];
  const route = ROUTES[endpoint];

  if (!route) return jsonResponse({ error: 'Gecersiz endpoint' }, 404);

  const upstream = new URL(`${UPSTREAM_BASE}/${route.file}`);
  for (const p of route.params) {
    const val = url.searchParams.get(p);
    if (val) upstream.searchParams.set(p, val);
  }

  const res = await fetch(upstream.toString());
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); }
  catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // auth alanlarını temizle
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

  const cleanData = clean(data);

  // EĞER TARAYICIDAN GİRİLDİYSE HTML (KUTULU TASARIM) DÖN
  if (acceptHeader.includes('text/html')) {
    return new Response(renderHtml(cleanData), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }

  // EĞER KOD İLE ÇEKİLİYORSA JSON DÖN
  return jsonResponse(cleanData, res.status);
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function renderHtml(data) {
  let records = [];
  if (Array.isArray(data.veri)) records = data.veri;
  else if (data.veri && typeof data.veri === 'object') records = [data.veri];
  else if (typeof data === 'object' && data !== null) records = [data];
  
  records = records.filter(r => r && typeof r === 'object');

  if (!records.length) {
    return `<html><body style="background:#050000;color:#ff3333;font-family:monospace;padding:20px;">Sonuç bulunamadı veya boş döndü.</body></html>`;
  }

  let bodyHtml = '';
  records.forEach((rec, idx) => {
    if (idx > 0) bodyHtml += '<br><br>';
    bodyHtml += `╭━━━━━━━ Gözlerin ━━━━━━━<br>`;
    for (const [k, label] of Object.entries(FIELD_MAP)) {
      if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
        bodyHtml += `┃➥ <span style="color:#4fc3f7">${label}:</span> ${rec[k]}<br>`;
      }
    }
    // Eşleşmeyen diğer alanlar (log sonuçları vs. için)
    for (const [k, v] of Object.entries(rec)) {
      if (!FIELD_MAP[k] && v !== undefined && v !== null && v !== '') {
        bodyHtml += `┃➥ <span style="color:#4fc3f7">${k}:</span> ${v}<br>`;
      }
    }
    bodyHtml += `╰━━━━━━━ Gözlerin ━━━━━━━`;
  });

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Sonucu</title>
<style>
  body {
    background-color: #050000;
    color: #00ff88;
    font-family: 'Courier New', monospace;
    padding: 20px;
    font-size: 15px;
    line-height: 1.6;
    white-space: nowrap;
    display: flex;
    justify-content: center;
  }
  .container {
    background: rgba(10, 0, 0, 0.8);
    border: 1px solid #ff3333;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(255, 0, 0, 0.2);
    overflow-x: auto;
    max-width: 100%;
  }
</style>
</head>
<body>
<div class="container">${bodyHtml}</div>
</body>
</html>`;
}
