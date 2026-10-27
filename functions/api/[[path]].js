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
  // 1. TIKTOK SORGULARI
  // ==========================================
  if (endpoint === 'tiktok_user' || endpoint === 'tiktok_id') {
    const username = url.searchParams.get('username');
    const userId = url.searchParams.get('user_id');

    if (!username && !userId) return jsonResponse({ success: false, error: 'Lütfen ?username=... veya ?user_id=... girin.' }, 400);

    try {
      const targetUrl = username 
        ? `https://www.tiktok.com/@${username.replace('@', '')}` 
        : `https://www.tiktok.com/share/user/${userId}`;

      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
        },
        redirect: 'follow'
      });

      if (!res.ok) throw new Error(`TikTok sayfası yüklenemedi. Durum: ${res.status}`);
      const html = await res.text();
      
      const matchUniversal = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);
      const matchSigi = html.match(/<script id="SIGI_STATE" type="application\/json">(.*?)<\/script>/);
      
      let rawData = null;
      if (matchUniversal && matchUniversal[1]) rawData = JSON.parse(matchUniversal[1]);
      else if (matchSigi && matchSigi[1]) rawData = JSON.parse(matchSigi[1]);

      if (!rawData) throw new Error('Profil verisi bulunamadı. TikTok bot koruması devrede olabilir.');
      
      let userData = rawData?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user || rawData?.UserModule?.users?.[username] || rawData?.userInfo?.user || rawData?.user;

      if (!userData || !userData.id) throw new Error('Kullanıcı verisi ayrıştırılamadı.');

      const cleanData = {
        success: true,
        data: {
          id: userData.id,
          sec_uid: userData.secUid,
          username: userData.uniqueId,
          nickname: userData.nickname,
          bio: userData.signature,
          verified: userData.verified,
          region: userData.region || 'Bilinmiyor',
          language: userData.language || 'Bilinmiyor',
          stats: {
            follower_count: userData.stats?.followerCount || 0,
            following_count: userData.stats?.followingCount || 0,
            heart_count: userData.stats?.heartCount || 0,
            video_count: userData.stats?.videoCount || 0
          }
        }
      };

      if (acceptHeader.includes('text/html')) return new Response(renderTikTokHtml(cleanData.data), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse(cleanData);
    } catch (error) {
      if (acceptHeader.includes('text/html')) return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 2. DISCORD SORGULARI (ID & TOKEN)
  // ==========================================
  if (endpoint.startsWith('discord_')) {
    let discordData = {};
    let title = '';

    try {
      if (endpoint === 'discord_id') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('Lütfen ?id=... girin.');
        title = 'Discord ID Sorgu';
        
        const snowflake = BigInt(id);
        const discordEpoch = 1420070400000n; 
        const timestampMs = Number((snowflake >> 22n) + discordEpoch);
        const createdAtDate = new Date(timestampMs);
        const createdAt = !isNaN(createdAtDate.getTime()) ? createdAtDate.toLocaleString('tr-TR') : 'Hesaplanamadı';
        
        const part1 = btoa(id);
        const part2 = btoa(Math.floor((timestampMs - discordEpoch) / 1000).toString());

        const res = await fetch(`https://japi.rest/discord/v1/user/${id}`);
        if (!res.ok) throw new Error('Kullanıcı bulunamadı veya API limiti aşıldı.');
        const data = await res.json();
        if (!data.data) throw new Error('Veri bulunamadı.');
        
        const u = data.data;

        discordData = {
          ID: u.id,
          'KULLANICI ADI': u.username,
          'GÖRÜNEN AD': u.global_name || 'Yok',
          TAG: u.discriminator !== '0' ? u.discriminator : 'Yeni Sistem',
          'HESAP OLUŞTURMA': createdAt,
          'BOT MU': u.bot ? 'Evet' : 'Hayır',
          'BANNER RENGİ': u.banner_color || 'Yok',
          'BANNER URL': u.banner_url || 'Yok',
          '--- TOKEN PARÇALARI ---': '',
          'PART 1 (User ID)': part1,
          'PART 2 (Timestamp)': part2,
          'PART 3 (İmza)': 'ID üzerinden üretilemez, sadece token\'da bulunur.'
        };

      } else if (endpoint === 'discord_token') {
        const token = url.searchParams.get('token');
        if (!token) throw new Error('Lütfen ?token=... girin.');
        title = 'Discord Token Çözücü & Sorgu';

        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Geçersiz Discord Token formatı. (3 parça olmalı)');

        let userId = '';
        try { userId = atob(parts[0]); } catch(e) { userId = 'Çözülemedi'; }
        
        let timestamp = 'Çözülemedi';
        try {
          const hex = atob(parts[1]).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          let unixTs = parseInt(hex, 16);
          if (unixTs < 1293840000) unixTs += 1293840000;
          timestamp = new Date(unixTs * 1000).toLocaleString('tr-TR');
        } catch(e) { timestamp = 'Hesaplanamadı'; }
        
        const signature = parts[2];

        let isValid = false;
        let userInfo = {};
        try {
          const valRes = await fetch('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: token }
          });
          if (valRes.ok) {
            isValid = true;
            const u = await valRes.json();
            userInfo = {
              'KULLANICI ADI': u.username,
              'GÖRÜNEN AD': u.global_name || 'Yok',
              'EMAIL': u.email || 'Gizli (Email yetkisi yok)',
              'TELEFON': u.phone || 'Yok',
              'DOĞRULANMIŞ': u.verified ? 'Evet' : 'Hayır',
              'MFA AKTİF': u.mfa_enabled ? 'Evet' : 'Hayır'
            };
          }
        } catch (e) { /* Token geçersiz */ }

        discordData = {
          'DURUM': isValid ? '✅ TOKEN GEÇERLİ' : '❌ TOKEN GEÇERSİZ / PATLAMIŞ',
          'USER ID (Part 1)': userId,
          'OLUŞTURULMA ZAMANI (Part 2)': timestamp,
          'İMZA (Part 3)': signature.substring(0, 20) + '...',
          ...userInfo
        };
      }

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml(title, discordData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, endpoint, data: discordData });

    } catch (error) {
      if (acceptHeader.includes('text/html')) return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 3. INSTAGRAM SORGUSU
  // ==========================================
  if (endpoint === 'instagram') {
    const username = url.searchParams.get('username');
    if (!username) return jsonResponse({ success: false, error: 'Lütfen ?username=... girin.' }, 400);

    try {
      const res = await fetch(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username.replace('@', '')}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
          'x-ig-app-id': '936619743392459',
          'Accept': '*/*',
          'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
        }
      });

      if (!res.ok) {
        if (res.status === 401) throw new Error('Instagram, Cloudflare sunucularından gelen istekleri engelliyor (401).');
        throw new Error(`Profil bulunamadı veya gizli. (HTTP ${res.status})`);
      }
      
      const data = await res.json();
      const user = data.data?.user;
      if (!user) throw new Error('Instagram verisi ayrıştırılamadı. Hesap gizli olabilir.');

      const igData = {
        'ID': user.id,
        'KULLANICI ADI': '@' + user.username,
        'AD SOYAD': user.full_name,
        'BİYOGRAFİ': user.biography || 'Yok',
        'TAKİPÇİ': user.edge_followed_by.count,
        'TAKİP EDİLEN': user.edge_follow.count,
        'GÖNDERİ SAYISI': user.edge_owner_to_timeline_media.count,
        'DOĞRULANMIŞ': user.is_verified ? 'Evet' : 'Hayır',
        'GİZLİ HESAP': user.is_private ? 'Evet' : 'Hayır'
      };

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin Instagram', igData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: igData });

    } catch (error) {
      if (acceptHeader.includes('text/html')) return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 4. OSINT: IP SORGULAMA
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
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 5. OSINT: ŞİFRE İHLALİ KONTROLÜ
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
  // 6. OSINT: SHERLOCK
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

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin Sherlock', { 'KULLANICI': username, 'BULUNAN': results.length }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 7. OSINT: HOLEHE
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

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin Holehe', { 'E-POSTA': email, 'KAYITLI SİTE SAYISI': results.filter(r=>r.KAYITLI==='Evet').length }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 8. OSINT: WHATSMYNAME
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

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin WhatsMyName', { 'KULLANICI': username, 'BULUNAN': results.length }), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: results });

    } catch (error) {
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 9. NÜFUS / LOG API'LERİ
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

function renderTikTokHtml(d) {
  let bodyHtml = `╭━━━━━━━ Gözlerin Tiktok ━━━━━━━<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">ID:</span> ${d.id}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">KULLANICI ADI:</span> @${d.username}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">AD SOYAD:</span> ${d.nickname}<br>`;
  if (d.bio) bodyHtml += `┃➥ <span style="color:#4fc3f7">BİYOGRAFİ:</span> ${d.bio}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">BÖLGE (REGION):</span> ${d.region}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">DİL (LANGUAGE):</span> ${d.language}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">TAKİPÇİ:</span> ${d.stats.follower_count}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">TAKİP EDİLEN:</span> ${d.stats.following_count}<br>`;
  bodyHtml += `┃➥ <span style="color:#4fc3f7">BEĞENİ:</span> ${d.stats.heart_count}<br>`;
  bodyHtml += `╰━━━━━━━ Gözlerin Tiktok ━━━━━━━`;
  return baseHtml(bodyHtml);
}

function renderGenericHtml(title, dataObj) {
  let bodyHtml = `╭━━━━━━━ ${title} ━━━━━━━<br>`;
  for (const [k, v] of Object.entries(dataObj)) {
    if (k === '--- TOKEN PARÇALARI ---') {
        bodyHtml += `┃ <span style="color:#ffaa00">${k}</span><br>`;
    } else {
        bodyHtml += `┃➥ <span style="color:#4fc3f7">${k}:</span> ${v}<br>`;
    }
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
