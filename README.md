# SHIT COIN ONLINE

Gerçek zamanlı ortak piyasa kullanan Socket.IO çok oyunculu demo.

## Yerelde çalıştırma
1. Node.js 18 veya daha yenisini yükle.
2. Bu klasörde terminal aç.
3. `npm install`
4. `npm start`
5. Tarayıcıda `http://localhost:3000` aç.

Aynı Wi-Fi ağındaki diğer cihazlar, sunucunun yerel IP adresiyle (ör. `http://192.168.1.20:3000`) bağlanabilir.

## Günlük piyasa ayarı
Varsayılan `DAY_INTERVAL_MS=86400000` yani 24 saatte bir ortak fiyat hareketidir.
Test için:
- Windows PowerShell: `$env:DAY_INTERVAL_MS=60000; npm start`
- macOS/Linux: `DAY_INTERVAL_MS=60000 npm start`

Bu test ayarı piyasayı her 60 saniyede bir ilerletir. Her piyasa hareketinde yönün yükseliş/düşüş olasılığı %50/%50'dir. Fiyat her turda sabit 1.00 USD artar veya azalır (fiyat 0.01 USD altına inmez). Falcı 500 USD karşılığında bir sonraki gün için tahmin verir; tahminin doğru olma olasılığı %80'dir ve oyuncu başına her gün bir tahmin alınabilir.

## İnternete yayınlama
Bu uygulama bir Node.js sunucusu gerektirir; yalnızca HTML dosyasını göndermek multiplayer yapmaz.
Projeyi Node.js destekleyen bir hostinge (Render, Railway, VPS vb.) yükleyip `npm install` ve `npm start` komutlarıyla çalıştırın. WebSocket bağlantılarını destekleyen bir servis seçin. `data.json` dosyasının kalıcı diskte tutulduğundan emin olun; geçici dosya sistemi yeniden başlatmada oyuncu verilerini silebilir.

## Önemli
Bu bir oyun demosudur, gerçek kripto para veya yatırım hizmeti değildir. Üretim ortamı için HTTPS, güçlü hesap politikası, hız sınırlama, yedekleme, kalıcı veritabanı ve yönetim araçları eklenmelidir. Şifreler bcrypt ile hashlenir; sunucu bakiye ve işlemleri doğrular.

Başlangıç coin fiyatı: **1.00 USD**.
