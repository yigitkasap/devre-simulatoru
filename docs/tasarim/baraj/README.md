# Baraj sayfası tasarımı (ders kullanımı)

Kaynak: tasarım kanvasındaki “Baraj sayfası (ders)” sayfası. Aynı 9 kartın PDF’i:
`~/Downloads/Devre Simülatörü — Arayüz Yeniden Tasarımı.pdf`

## Kartlar

- B00-BarajAnaliz: şimdiki sayfanın sorunları, yeni düzen, ders akışı, ilkeler
- B01-BarajCubuk: 1440×900, çubuk gösterge, su %50’de doluyor
- B02-BarajTekSoru: 1440×900, tek ışık, Soru açık ve cevap gösterilmiş (%75)
- B03-BarajSunum: 1280×720 projeksiyon (tam ekran), hazne dolu
- B04-BarajTablet: 1024×768, Ayarlar açık (Saf su, 1 MΩ: su yüksek ama uyarı yok)
- B05-BarajTel: 390×844 telefon, çubuk gösterge
- B06-BarajTelSoru: 390×844 telefon, tek ışık, Soru alt sayfası
- B07-BarajYatay: 844×390 telefon yatay, boşalırken (kondansatör gecikmesi)
- BN-BarajNotlar: kumanda davranışı, klavye ve sunum kumandası, erişilebilirlik,
  metin değişiklikleri (eski → yeni), uygulama notları. Bağlayıcı belge budur.

## Nasıl okunur

- `.dc.html` dosyaları düz HTML + satır içi CSS + SVG’dir. Tasarım `<x-dc>` içindeki
  işaretlemedir; `support.js` ve en alttaki `<script>` yalnızca kanvas içindir.
- Akım, seviye gibi sayılar örnektir; canlı simülasyondan gelecek.
- Sahne ve şema SVG’leri tasarım çizimidir. Sahne için mevcut `src/baraj/BarajSahnesi.tsx`
  güncellenir; şema için mevcut `CircuitView` kullanılır, seviye bantları alt katman olarak eklenir.
- Genel belirteçler: `../tokens.css`. Bu sayfaya özel renkler:
  - Seviye 1: yeşil `#1b7d44`, açık ton `#e8f5ed`
  - Seviye 2: rozet `#ffc107`, yazı `#8a5a00`, açık ton `#fff4d1`
  - Seviye 3: rozet `#d92d20`, yazı `#c4271b`, açık ton `#fdecea`
  - Su: `#2f7fc4`
