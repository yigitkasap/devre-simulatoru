# Devre Simülatörü · arayüz yeniden tasarımı (Ekim 2026)

Bu klasör, uygulamanın arayüzünün yeniden tasarımını içerir. İşlevler aynen kalır; değişen düzen, bileşenler, telefon etkileşimi ve metinlerdir. Kaynak brif: `docs/claude-design-prompt.md`.

## Klasördekiler

- `tokens.css`: Tailwind CSS 4 `@theme` belirteçleri (renk, yazı, aralık, köşe, gölge, koyu tema) ve gerilim → renk formülü.
- `artboards/`: Tasarım tuvalindeki her çizim, `.dc.html` dosyası olarak.
- `artboards/canvas.json`: Çizimlerin listesi, başlıkları ve hangi sayfada oldukları.

## .dc.html dosyaları nasıl okunur?

- Her dosya tek bir ekran ya da tasarım sistemi sayfasıdır. Stiller satır içidir (`style="…"`); renkler ve ölçüler `tokens.css` ile aynıdır.
- `<dc-import name="C-UstCubuk" …>` aynı klasördeki `C-UstCubuk.dc.html` bileşenini gömer; diğer öznitelikler o bileşenin özellikleridir (`tool="kablo"`, `bar="olc"` gibi).
- `{{ad}}` bir şablon değişkenidir. Değeri dosyanın sonundaki `<script type="text/x-dc">` içindeki `renderVals()` fonksiyonunda hesaplanır. `<sc-if>` koşullu gösterim demektir.
- `./support.js` tasarım aracına aittir, projede yoktur. Dosyalar tarayıcıda doğrudan açılınca içe aktarılan parçalar görünmeyebilir. Bu dosyalar çalışan kod değildir; ölçü, renk, yerleşim ve metin için **referans**tır.
- Şema çizimlerindeki ölçüm değerleri (14,45 mA vb.) örnek değerlerdir. Gerilim bölücü dışındaki örneklerin açıklama, soru ve cevap metinleri taslaktır; gerçek metinler korunmalıdır.

## Çizim dizini

**Tasarım sistemi**
- `Main` genel bakış ve düzen haritası
- `DS-Renk` renkler, gerilim ölçeği, hata ve uyarı ayrımı, koyu tema
- `DS-Tipo` yazı ölçeği, sayı ve birim kuralları, aralık, köşe, gölge, kırılma noktaları
- `DS-Token` CSS değişkenleri (`tokens.css` ile aynı)
- `DS-Bilesen` düğme, ikon düğme, araç seçici, sayı alanı, çip, onay kutusu, seçme kutusu, hız denetimi, sekme, rozet, LCD, mesaj satırı, toast, alt sayfa, modal, örnek kartı
- `DS-Sembol` şema sembolleri ve tuval katmanları (seçim, akım noktası, LED yandı, kısa devre, şebeke toprağı vb.)
- `DS-Cihaz` cihaz ön paneli öğeleri (kademeli ayar, kuplaj anahtarı, lambalı düğme, CC/CV lambası, uç jakları)
- Kabuk bileşenleri: `C-UstCubuk`, `C-SimCubugu`, `C-Kutuphane` (masaüstü), `C-TelUst`, `C-TelAlt` (telefon)

**Masaüstü (1440 ve 1280)**
- `M01` ilk açılış ve hoş geldin penceresi
- `M02` parça sürükle-bırak, `M02b` kablo çekme ve tur adımı
- `M03` seçili parça, durmuşken; doğrulama hatası
- `M04` LED ve ön direnç çalışırken; canlı ölçüm ve değer değiştirme
- `M05a`, `M05b` yarım dalga örneği: tahmin, sonra cevap
- `M06a` cihaz rafı: osiloskop, fonksiyon üreteci, DC güç kaynağı (Ölç düzeni)
- `M06b` toprak tuzağı: ADD + INV ile doğru ölçüm
- `M06c` X-Y kipinde diyot karakteristiği
- `M07a` LED yandı ve kısa devre, `M07b` devrede toprak yok ve boşta uç
- `M08` örnekler penceresi, `M09` Dosya menüsü, `M10` paylaşım, `M11` ayarlar, `M12` yardım
- `M13` öneri: deney föyü, tasarım görevi ve ölçüm tablosu

**Tablet:** `T01` (1024×768), `T02` (1180×820)

**Telefon**
- `P00-MobilAnaliz` sorunlar ve yeni etkileşim modeli (önce bunu oku)
- `P01` ilk açılış, `P02` parça ekle (zincirle ekle), `P03` Bağla kipi, `P04` seçili parça
- `P05` Ölç kipi, `P06`/`P07` örnek tahmin ve cevap, `P08` osiloskop, `P09` fonksiyon üreteci
- `P10` LED yandı, `P11` toprak yok, `P12` örnekler, `P13` dosya ve paylaşım, `P14` yardım, `P15` kalabalıkta seçici
- `L01`, `L02` yatay telefon; `S01`, `S02` 375×667

**Notlar:** `N01` etkileşim notları, `N02` odak sırası ve katmanlar, `N03` metin değişiklikleri (eski → yeni)

## Temel kararlar

**Masaüstü**
- Düzen: üst çubuk · solda parça kütüphanesi (256 px, 56 px şeride daralır) · ortada tuval · sağda İnceleme paneli (336 px; sekmeler İncele · Örnek · Mesajlar) · tuvalin altında cihaz rafı (yalnızca devrede cihaz varken) · en altta simülasyon çubuğu.
- Özellik modal penceresi ve üzerine gelince açılan bilgi kutusu kalkar; ikisi İnceleme panelinde birleşir. Değerler Enter’la ya da alandan çıkınca uygulanır; çalışırken simülasyon durmaz.
- Örnek kartı tuvalin üstünden kalkar; İnceleme panelindeki Örnek sekmesine taşınır. Mesajlar da aynı paneldedir.
- Osiloskop, fonksiyon üreteci ve güç kaynağının bütün ayarları kendi ön panelindedir (cihaz rafı). Ayarların iki yere dağılması biter.
- İpucu satırı tuvalin altında ayrı bir şerittir, tuvalin üstüne binmez.

**Telefon**
- Bütün kontroller altta: bağlama göre değişen alt çubuk ve tek bir alt sayfa. Yandan açılan kütüphane çekmecesi kalkar.
- Üst şerit yalnızca devre adı (Dosya menüsü), kip rozeti, sorun sayısı ve ⋯ içerir.
- İki kip vardır:
  - **Kur:** Parça, Bağla, Geri al, Panel.
  - **Ölç:** Oynat’a basınca devrenin yapısı kilitlenir. Dokunmak inceler, sürüklemek tuvali kaydırır, değer değiştirmek serbesttir.
- Parça seçilince alt çubuk o parçanın eylemlerine döner: Değer, Döndür, Çevir, Sil.
- Oynat her ekranda sağ altta, aynı yerdedir.
- Bağla kipi: uçlar 44 pt’lik etiketli hedeflere dönüşür; kablo iki dokunuşla çekilir, yol kendiliğinden çizilir.
- Zincirle ekle: bir uç seçiliyken eklenen parça o uca bağlı olarak yerleşir.
- Kalabalık bir noktaya dokununca büyüteç ve “Burada N öğe var” seçicisi çıkar.
- Alt sayfa en çok ekranın yarısını kaplar; yalnızca Cihazlar, Örnekler ve Yardım tam ekrandır. Sayfa açılıp kapanınca devre kalan alana yeniden sığar.

**Görsel dil**
- Gerilim renk ölçeğinde açıklık ayarlandı (yeşil tonlar kağıtta 3:1’in altındaydı). Ayarlarda renk körlüğüne uygun mavi–gri–turuncu seçeneği var.
- Akım noktalarına koyu kenar eklendi. Oynat yeşili `#1b7d44` oldu (WCAG AA).
- Hata: kesintisiz kırmızı çerçeve ve dolu daire. Uyarı: kesikli amber çerçeve ve üçgen. Renk tek başına anlam taşımaz.

## Önerilen uygulama sırası

1. `tokens.css` ve yazı tipleri; mevcut renk değişkenlerini eşle.
2. Masaüstü kabuğu: üst çubuk, kütüphane, İnceleme paneli, simülasyon çubuğu, ipucu şeridi.
3. Özellik modalını İnceleme paneline taşı (canlı ölçüm, formül notu, özellik alanları).
4. Örnek kartını ve Mesajlar’ı panel sekmelerine taşı.
5. Cihaz rafı ve ön paneller (osiloskop, fonksiyon üreteci, DC güç kaynağı).
6. Telefon: alt çubuk, tek alt sayfa, Kur/Ölç kipleri, Bağla kipi, seçici, zincirle ekle.
7. Yatay telefon ve tablet düzenleri.
8. Metin değişiklikleri (`N03`), ilk açılış rehberi, yardım penceresi, ayarlar.
9. Erişilebilirlik ve odak sırası (`N02`).

Her adımdan sonra mevcut testler çalıştırılmalı; simülasyon motoruna dokunulmamalı.
