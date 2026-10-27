// ... (Üst kısımdaki ROUTES ve FIELD_MAP aynı kalacak) ...

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const acceptHeader = request.headers.get('Accept') || '';
  const endpoint = url.pathname.replace('/api/', '').split('/')[0];

  // ==========================================
  // 1. TIKTOK SORGULARI (Değişiklik yok)
  // ==========================================
  if (endpoint === 'tiktok_user' || endpoint === 'tiktok_id') {
    // ... (TikTok kodları aynen kalacak) ...
  }

  // ==========================================
  // 2. DISCORD SORGULARI (ID & TOKEN) - DÜZELTİLDİ
  // ==========================================
  if (endpoint.startsWith('discord_')) {
    let discordData = {};
    let title = '';

    try {
      if (endpoint === 'discord_id') {
        const id = url.searchParams.get('id');
        if (!id) throw new Error('Lütfen ?id=... girin.');
        title = 'Discord ID Sorgu';
        
        const res = await fetch(`https://japi.rest/discord/v1/user/${id}`);
        if (!res.ok) throw new Error('Kullanıcı bulunamadı veya API limiti aşıldı.');
        const data = await res.json();
        if (!data.data) throw new Error('Veri bulunamadı.');
        
        const u = data.data;
        // "Invalid Date" hatasını önlemek için kontrol
        let createdAt = 'Bilinmiyor';
        if (u.created_at && !isNaN(new Date(u.created_at).getTime())) {
            createdAt = new Date(u.created_at).toLocaleDateString('tr-TR');
        }

        discordData = {
          ID: u.id,
          'KULLANICI ADI': u.username,
          'GÖRÜNEN AD': u.global_name || 'Yok',
          TAG: u.discriminator !== '0' ? u.discriminator : 'Yeni Sistem',
          'HESAP OLUŞTURMA': createdAt,
          'BOT MU': u.bot ? 'Evet' : 'Hayır',
          'BANNER RENGİ': u.banner_color || 'Yok',
          'BANNER URL': u.banner_url || 'Yok',
          'ROZETLER': u.public_flags_array ? u.public_flags_array.join(', ') : 'Yok'
        };

      } else if (endpoint === 'discord_token') {
        const token = url.searchParams.get('token');
        if (!token) throw new Error('Lütfen ?token=... girin.');
        title = 'Discord Token Çözücü & Sorgu';

        const parts = token.split('.');
        if (parts.length !== 3) throw new Error('Geçersiz Discord Token formatı. (3 parça olmalı)');

        // 1. Part: User ID (Base64 decode)
        let userId = '';
        try { userId = atob(parts[0]); } catch(e) { userId = 'Çözülemedi'; }
        
        // 2. Part: Timestamp (Base64 decode + akıllı epoch kontrolü)
        let timestamp = 'Çözülemedi';
        try {
          const tsBase64 = parts[1];
          // Base64'ü hex'e çevirip BigInt ile sayıya dönüştürüyoruz (daha güvenli)
          const hex = atob(tsBase64).split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
          let unixTs = parseInt(hex, 16);
          
          // Eski token'lar için Discord Epoch eklemesi (1293840000)
          if (unixTs < 1293840000) {
              unixTs += 1293840000;
          }
          timestamp = new Date(unixTs * 1000).toLocaleString('tr-TR');
        } catch(e) { timestamp = 'Hesaplanamadı'; }
        
        // 3. Part: Signature
        const signature = parts[2];

        // Token Doğrulama
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
          'İMZA (Part 3 - Kısaltılmış)': signature.substring(0, 20) + '...',
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
  // 3. INSTAGRAM SORGUSU (Hata mesajı iyileştirildi)
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
        if (res.status === 401) {
            throw new Error('Instagram, güvenlik nedeniyle oturum açmadan sorguları engelliyor (401). Bu, ev interneti gibi temiz bir IP adresinden denenmelidir. Bulut sunucuları genellikle engellenir.');
        }
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
        'GİZLİ HESAP': user.is_private ? 'Evet' : 'Hayır',
        'PROFİL FOTOĞRAFI': user.profile_pic_url_hd
      };

      if (acceptHeader.includes('text/html')) return new Response(renderGenericHtml('Gözlerin Instagram', igData), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: true, data: igData });

    } catch (error) {
      if (acceptHeader.includes('text/html')) return new Response(renderErrorHtml(error.message), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }

  // ==========================================
  // 4. NÜFUS / LOG API'LERİ (Değişiklik yok)
  // ==========================================
  // ... (Nüfus API kodları aynen kalacak) ...
}
