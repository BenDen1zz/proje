export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  
  const username = url.searchParams.get('username'); // Örn: d9wqq
  const userId = url.searchParams.get('user_id'); // Örn: 75869304178408169

  if (!username && !userId) {
    return json({ error: 'Lütfen ?username=d9wqq veya ?user_id=... şeklinde bir parametre girin.' }, 400);
  }

  try {
    // Eğer kullanıcı adı verildiyse, TikTok profil sayfasını çek
    const targetUrl = username 
      ? `https://www.tiktok.com/@${username.replace('@', '')}` 
      : `https://www.tiktok.com/@i/AM/${userId}`; // TikTok'un ID yönlendirme linki

    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8'
      }
    });

    if (!response.ok) {
      throw new Error(`TikTok sayfası yüklenemedi. Durum: ${response.status}`);
    }

    const html = await response.text();
    
    // TikTok'un sayfaya gömdüğü gizli JSON verisini bul
    const match = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">(.*?)<\/script>/);
    
    if (!match || !match[1]) {
      throw new Error('Profil verisi bulunamadı. Hesap gizli veya silinmiş olabilir.');
    }

    const rawData = JSON.parse(match[1]);
    
    // TikTok veri yapısı değişebileceği için olası yolları kontrol ediyoruz
    const userData = rawData?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user || 
                     rawData?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo?.user;
    
    if (!userData) {
      throw new Error('Kullanıcı verisi ayrıştırılamadı (TikTok yapısı değişmiş olabilir).');
    }

    // İşimize yarayacak temiz veriyi dön
    return json({
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
    });

  } catch (error) {
    return json({ success: false, error: error.message }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
