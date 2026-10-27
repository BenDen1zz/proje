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

  // Endpoint'i al: /api/tc -> "tc", /api/tiktok_user -> "tiktok_user"
  const endpoint = url.pathname.replace('/api/', '').split('/')[0];

  // --- 1. TIKTOK SORGULARI ---
  if (endpoint === 'tiktok_user' || endpoint === 'tiktok_id') {
    const username = url.searchParams.get('username');
    const userId = url.searchParams.get('user_id');

    if (!username && !userId) {
      return jsonResponse({ success: false, error: 'Lütfen ?username=... veya ?user_id=... girin.' }, 400);
    }

    try {
      const targetUrl = username 
        ? `https://www.tiktok.com/@${username.replace('@', '')}` 
        : `https://www.tiktok.com/@i/AM/${userId}`;

      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
        }
      });

      if (!res.ok) throw new Error(`TikTok sayfası yüklenemedi. Durum: ${res.status}`);

      const html = await res.text();
      const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);
      
      if (!match || !match[1]) throw new Error('Profil verisi bulunamadı. Hesap gizli veya silinmiş olabilir.');

      const rawData = JSON.parse(match[1]);
      const userData = rawData?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user;
      
      if (!userData) throw new Error('Kullanıcı verisi ayrıştırılamadı (TikTok yapısı değişmiş olabilir).');

      const cleanData = {
        success: true,
        data: {
          id: userData.id,
          sec_uid: userData.secUid,
          username: userData.uniqueId,
          nickname: userData.nickname,
          avatar: userData.avatarLarger,
          bio: userData.signature,
          verified: userData.verified,
          private_account: userData.privateAccount,
          region: userData.region,
          stats: {
            follower_count: userData.stats?.followerCount || 0,
            following_count: userData.stats?.followingCount || 0,
            heart_count: userData.stats?.heartCount || 0,
            video_count: userData.stats?.videoCount || 0
          }
        }
      };

      // Tarayıcıdan girildiyse HTML dön
      if (acceptHeader.includes('text/html')) {
        return new Response(renderTikTokHtml(cleanData.data), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return jsonResponse(cleanData);

    } catch (error) {
      if (acceptHeader.includes('text/html')) {
        return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // --- 2. NÜFUS / DİĞER API'LER ---
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

    if (acceptHeader.includes('text/html')) {
      return new Response(renderNufusHtml(cleanData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    return jsonResponse(cleanData, res.status);
  } catch (err) {
    return jsonResponse({ error: 'Upstream sunucuya ulaşılamadı.' }, 500);
  }
}

// --- YARDIMCI FONKSİYONLAR ---

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

  if (!records.length) return renderErrorHtml('Sonuç bulunamadı veya boş döndü.');

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

function renderTikTokHtml(d) {
  let bodyHtml = `╭━━━━━━━ TIKTOK ━━━━━━━<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">ID:</span> ${d.id}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">KULLANICI ADI:</span> @${d.username}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">AD SOYAD:</span> ${d.nickname}<br>`;
  if (d.bio) bodyHtml += `┃➥ <span style="color:#4fc3f7">BİYOGRAFİ:</span> ${d.bio}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">TAKİPÇİ:</span> ${d.stats.follower_count}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">TAKİP EDİLEN:</span> ${d.stats.following_count}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">BEĞENİ:</span> ${d.stats.heart_count}<br>`;
  bodyHtml += `╰━━━━━━━ TIKTOK ━━━━━━━`;
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
