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
  const { request, env } = context;
  const url = new URL(request.url);
  const acceptHeader = request.headers.get('Accept') || '';
  const endpoint = url.pathname.replace('/api/', '').split('/')[0];

  // ==========================================
  // 1. TIKTOK, DISCORD, INSTAGRAM (Mevcut Kodlar)
  // ==========================================
  // ... (TikTok, Discord ve Instagram kodları aynen kalacak, yer kaplamaması için buraya yapıştırmıyorum) ...

  // ==========================================
  // 2. OSINT: IP SORGULAMA (Ücretsiz, Anahtarsız)
  // ==========================================
  if (endpoint === 'ip_lookup') {
    const ip = url.searchParams.get('ip');
    if (!ip) return jsonResponse({ success: false, error: 'Lütfen ?ip=... girin.' }, 400);

    try {
      const res = await fetch(`https://api.ipquery.io/${ip}`);
      if (!res.ok) throw new Error(`IP sorgusu başarısız. (HTTP ${res.status})`);
      const data = await res.json();

      const ipData = {
        'IP': data.ip || ip,
        'ÜLKE': data.location?.country || 'Bilinmiyor',
        'ŞEHİR': data.location?.city || 'Bilinmiyor',
        'ISP': data.isp?.isp || 'Bilinmiyor',
        'ORGANİZASYON': data.isp?.org || 'Bilinmiyor',
        'ASN': data.isp?.asn || 'Bilinmiyor',
        'VPN/PROXY': data.risk?.is_vpn ? 'Evet (Riskli)' : 'Hayır',
        'TOR': data.risk?.is_tor ? 'Evet' : 'Hayır'
      };

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin IP Sorgu', ipData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: ipData });

    } catch (error) {
      if (acceptHeader.includes('text/html')) return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 3. OSINT: ŞİFRE İHLALİ KONTROLÜ (HIBP, Ücretsiz)
  // ==========================================
  if (endpoint === 'password_check') {
    const password = url.searchParams.get('password');
    if (!password) return jsonResponse({ success: false, error: 'Lütfen ?password=... girin.' }, 400);

    try {
      const msgBuffer = new TextEncoder().encode(password);
      const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
      
      const prefix = hashHex.substring(0, 5);
      const suffix = hashHex.substring(5);

      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`);
      if (!res.ok) throw new Error('HIBP API isteği başarısız.');

      const text = await res.text();
      const lines = text.split('\n');
      let pwnedCount = 0;

      for (const line of lines) {
        const [lineSuffix, count] = line.split(':');
        if (lineSuffix === suffix) {
          pwnedCount = parseInt(count);
          break;
        }
      }

      const pwdData = {
        'DURUM': pwnedCount > 0 ? '⚠️ ŞİFRE SIZMIŞ' : '✅ ŞİFRE TEMİZ',
        'SIZMA SAYISI': pwnedCount.toLocaleString('tr-TR'),
        'ÖNLEM': pwnedCount > 0 ? 'Bu şifreyi kullanmayın!' : 'Güvenle kullanabilirsiniz.'
      };

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin Şifre Kontrolü', pwdData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: pwdData });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 4. OSINT: SHERLOCK KULLANICI ADI TARAMASI (Apify)
  // ==========================================
  if (endpoint === 'sherlock') {
    const username = url.searchParams.get('username');
    if (!username) return jsonResponse({ success: false, error: 'Lütfen ?username=... girin.' }, 400);
    if (!env.APIFY_TOKEN) return jsonResponse({ success: false, error: 'APIFY_TOKEN ortam değişkeni tanımlı değil.' }, 500);

    try {
      const res = await fetch(`https://api.apify.com/v2/actors/misceres~sherlock/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usernames: [username] })
      });

      if (!res.ok) throw new Error(`Sherlock API hatası (HTTP ${res.status}).`);
      const data = await res.json();

      const results = data.map(item => ({
        'SİTE': item.site || 'Bilinmiyor',
        'DURUM': item.status || 'Bilinmiyor',
        'URL': item.url || ''
      })).filter(r => r.DURUM === 'Claimed' || r.DURUM === 'Available');

      if (acceptHeader.includes('text/html')) {
        let bodyHtml = `╭━━━━━━━ Gözlerin Sherlock ━━━━━━━<br>`;
        bodyHtml += `┃➥ <span style="color:#4fc3f7">KULLANICI:</span> ${username}<br>`;
        results.forEach(r => {
            bodyHtml += `┃➥ <span style="color:#4fc3f7">${r.SİTE}:</span> ${r.DURUM}<br>`;
        });
        bodyHtml += `╰━━━━━━━ Gözlerin Sherlock ━━━━━━━`;
        return new Response(baseHtml(bodyHtml), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 5. OSINT: HOLEHE E-POSTA TARAMASI (Apify)
  // ==========================================
  if (endpoint === 'holehe') {
    const email = url.searchParams.get('email');
    if (!email) return jsonResponse({ success: false, error: 'Lütfen ?email=... girin.' }, 400);
    if (!env.APIFY_TOKEN) return jsonResponse({ success: false, error: 'APIFY_TOKEN ortam değişkeni tanımlı değil.' }, 500);

    try {
      const res = await fetch(`https://api.apify.com/v2/acts/datacach~holehe-email-osint-scraper/run-sync-get-dataset-items?token=${env.APIFY_TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      });

      if (!res.ok) throw new Error(`Holehe API hatası (HTTP ${res.status}).`);
      const data = await res.json();

      const results = data.map(item => ({
        'SİTE': item.site || 'Bilinmiyor',
        'KAYITLI': item.registered ? 'Evet' : 'Hayır',
        'KATEGORİ': item.category || 'Diğer'
      }));

      if (acceptHeader.includes('text/html')) {
        let bodyHtml = `╭━━━━━━━ Gözlerin Holehe ━━━━━━━<br>`;
        bodyHtml += `┃➥ <span style="color:#4fc3f7">E-POSTA:</span> ${email}<br>`;
        results.forEach(r => {
            if (r.KAYITLI === 'Evet') {
                bodyHtml += `┃➥ <span style="color:#4fc3f7">${r.SİTE}:</span> Kayıtlı<br>`;
            }
        });
        bodyHtml += `╰━━━━━━━ Gözlerin Holehe ━━━━━━━`;
        return new Response(baseHtml(bodyHtml), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 6. OSINT: WHATSMYNAME KULLANICI ADI TARAMASI (Ücretsiz)
  // ==========================================
  if (endpoint === 'username_search') {
    const username = url.searchParams.get('username');
    if (!username) return jsonResponse({ success: false, error: 'Lütfen ?username=... girin.' }, 400);

    try {
      const dataRes = await fetch('https://raw.githubusercontent.com/WebBreacher/WhatsMyName/main/wmn-data.json');
      const wmnData = await dataRes.json();
      const sites = wmnData.sites || [];

      const checks = sites.slice(0, 5).map(async (site) => {
        try {
          let checkUrl = site.uri_check.replace('{account}', username);
          const res = await fetch(checkUrl, { method: 'HEAD' });
          const found = res.status === 200 && !(await res.text()).includes(site.e_string || '');
          return { site: site.name, found, url: site.uri_pretty.replace('{account}', username) };
        } catch (e) {
          return { site: site.name, found: false, url: '' };
        }
      });

      const results = (await Promise.all(checks)).filter(r => r.found);

      if (acceptHeader.includes('text/html')) {
        let bodyHtml = `╭━━━━━━━ Gözlerin WhatsMyName ━━━━━━━<br>`;
        bodyHtml += `┃➥ <span style="color:#4fc3f7">KULLANICI:</span> ${username}<br>`;
        if (results.length === 0) bodyHtml += `┃➥ <span style="color:#ffaa00">İlk 5 sitede bulunamadı.</span><br>`;
        results.forEach(r => {
            bodyHtml += `┃➥ <span style="color:#4fc3f7">${r.site}:</span> ${r.url}<br>`;
        });
        bodyHtml += `╰━━━━━━━ Gözlerin WhatsMyName ━━━━━━━`;
        return new Response(baseHtml(bodyHtml), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 7. NÜFUS / LOG API'LERİ (Mevcut Kod)
  // ==========================================
  const route = ROUTES[endpoint];
  if (!route) return jsonResponse({ error: 'Gecersiz endpoint' }, 404);

  const upstream = new URL(`${UPSTREAM_BASE}/${route.file}`);
  for (const p of route.params) {
    const val = url.searchParams.get(p);
    if (val) upstream.searchParams.set(p, val);
  }

  try {
    const res = await fetch(upstream.toString());
    const text = await res.text();

    let data;
    try { data = JSON.parse(text); }
    catch {
      return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain', 'Access-Control-Allow-Origin': '*' } });
    }

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

    if (acceptHeader.includes('text/html')) return new Response(renderNufusHtml(cleanData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    return jsonResponse(cleanData, res.status);
  } catch (err) {
    return jsonResponse({ error: 'Upstream sunucuya ulaşılamadı.' }, 500);
  }
}

// ==========================================
// YARDIMCI FONKSİYONLAR
// ==========================================

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}

function renderNufusHtml(data) {
  let records = [];
  if (Array.isArray(data.veri)) records = data.veri;
  else if (data.veri && typeof data.veri === 'object') records = [data.veri];
  else if (typeof data === 'object' && data !== null) records = [data];
  
  records = records.filter(r => r && typeof r === 'object');
  if (!records.length) return renderErrorHtml('Sonuç bulunamadı.');

  let bodyHtml = '';
  records.forEach((rec, idx) => {
    if (idx > 0) bodyHtml += '<br><br>';
    bodyHtml += `╭━━━━━━━ Gözlerin ━━━━━━━<br>`;
    for (const [k, label] of Object.entries(FIELD_MAP)) {
      if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') {
        bodyHtml += `┃➥ <span style="color:#4fc3f7">${label}:</span> ${rec[k]}<br>`;
      }
    }
    for (const [k, v] of Object.entries(rec)) {
      if (!FIELD_MAP[k] && v !== undefined && v !== null && v !== '') {
        bodyHtml += `┃➥ <span style="color:#4fc3f7">${k}:</span> ${v}<br>`;
      }
    }
    bodyHtml += `╰━━━━━━━ Gözlerin ━━━━━━━`;
  });
  return baseHtml(bodyHtml);
}

function renderGenericHtml(title, dataObj) {
  let bodyHtml = `╭━━━━━━━ ${title} ━━━━━━━<br>`;
  for (const [k, v] of Object.entries(dataObj)) {
    bodyHtml += `┃➥ <span style="color:#4fc3f7">${k}:</span> ${v}<br>`;
  }
  bodyHtml += `╰━━━━━━━ ${title} ━━━━━━━`;
  return baseHtml(bodyHtml);
}

function renderErrorHtml(message) {
  return baseHtml(`<span style="color:#ff3333">Hata: ${message}</span>`);
}

function baseHtml(content) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>API Sonucu</title>
<style>
  body { background-color: #050000; color: #00ff88; font-family: 'Courier New', monospace; padding: 20px; font-size: 15px; line-height: 1.6; white-space: nowrap; display: flex; justify-content: center; }
  .container { background: rgba(10, 0, 0, 0.8); border: 1px solid #ff3333; padding: 20px; border-radius: 8px; box-shadow: 0 0 20px rgba(255, 0, 0, 0.2); overflow-x: auto; max-width: 100%; }
</style>
</head>
<body><div class="container">${content}</div></body></html>`;
}
