# Görev

"Devre Simülatörü" adlı Türkçe, eğitsel, tarayıcıda çalışan devre simülatörü web uygulamasının arayüzünü yeniden tasarla. Uygulama çalışıyor ve yayında; işlevler aynen kalacak. Amaç, hem masaüstünde hem telefonda kullanımı ve **anlamayı** kolaylaştırmak. Aşağıda uygulamanın her bölümünü, her düğmesini, her yazısını ve arkadaki mekanizmaları anlatıyorum; tasarım bunların hepsine yer açmalı, hiçbir özellik kaybolmamalı.

Teslim etmeni istediğim şeyler en sonda ("Teslim edilecekler").

---

## 1. Ürün ve kullanıcılar

- **Ne:** Şematik çizilip anında simüle edilen bir devre simülatörü. Parçalar tuvale yerleştirilir, kablolarla bağlanır, "Oynat"a basılınca devre gerçek zamanlı çözülür. Kablolar gerilime göre renklenir, akım noktaları akar, LED'ler parlar ya da yanar, ölçü aletleri ve osiloskop değer gösterir.
- **Kimler kullanıyor:** Bir üniversitenin fizik bölümündeki 2. sınıf öğrencileri (Elektronik Laboratuvarı dersi) ve araştırma görevlileri. Aynı dönemde Temel Elektronik dersinde Proteus 8 kullanılıyor. Öğrenciler laboratuvarda gerçek osiloskop, fonksiyon üreteci, DC güç kaynağı ve breadboard kullanıyor; simülatör bu deneylere hazırlık ve tekrar için.
- **Kullanım bağlamı:** Ders öncesi evde dizüstü bilgisayarda, laboratuvarda telefonda (iPhone 13 ve benzeri, dikey ve yatay), derste projeksiyonda.
- **En önemli öğrenme hedefleri:** Devrenin neden öyle davrandığını görmek (gerilim, akım, güç), tahmin edip simülasyonla doğrulamak, laboratuvar cihazlarını (osiloskop, fonksiyon üreteci, güç kaynağı) doğru kullanmayı ve tipik ölçüm hatalarını (prob toprağı, AC/DC kuplaj) öğrenmek.
- **Teknik:** Sunucu, oturum açma ya da veritabanı yok; her şey tarayıcıda. Site yalnızca Türkçe.

## 2. Kesin kurallar

1. **Marka:** "Proteus", "LTspice", "Falstad", "PhET" adlarını, logolarını, simgelerini ya da ekran görüntülerini kullanma; bu araçların görünümünü kopyalama. Laboratuvar cihazlarını işlevleriyle andırabilirsin, ama gerçek bir markanın (GW Instek, Matrix, Protek vb.) ön panelini birebir taklit etme.
2. **Dil ve terimler:**
   - Bütün arayüz Türkçe. Fizik terimleri: "gerilim" (voltaj değil), "akım", "iç direnç", "toprak", "kısa devre", "ön direnç", "etkin değer", "tepe-tepe".
   - Ondalık ayırıcı virgüldür: 4,7 kΩ.
   - SI önekleri p, n, µ, m, k, M, G; büyük M mega, küçük m mili.
   - Formüllerde gerçek alt simge kullanılır (R<sub>iç</sub>, V<sub>CE</sub>); alt çizgi değil.
3. **Metin:** Aşağıdaki metinler uygulamadaki gerçek metinlerdir. Daha anlaşılır olacaksa önerebilirsin, ama anlamı ve terimleri koru. Önerdiğin değişiklikleri ayrıca listele.
4. **Uygulanabilirlik:**
   - Tasarım React + Tailwind CSS 4 ile kodlanacak.
   - Renkleri CSS değişkenleri (design token) olarak ver.
   - Şema (tuval) SVG'dir ve semboller kodla çizilir. Sembolleri vektör ve çizgi kalınlığı kurallarıyla tanımla; raster görsel kullanma.
   - Ek yazı tipi yüklemesi gerekiyorsa açıkça belirt; şu an sistem yazı tipi kullanılıyor.
5. **Telefon ve iOS Safari kısıtları (önemli):**
   - **Üzerine gelme (hover) yok:** Hover'a bağlı hiçbir bilgi olmasın; telefonda her bilgiye dokunarak ulaşılmalı.
   - **Dokunma hedefleri:** En az 44×44 pt.
   - **Giriş alanları:** Yazı boyu en az 16 px. Daha küçükse iOS sayfayı yakınlaştırıyor.
   - **Tuval hareketleri:** Tuvalde tek parmakla kaydırma, iki parmakla yakınlaştırma, parçayı sürükleme, uzun basma (menü) ve çift dokunma (özellikler) kullanılıyor. Tuvalin üstüne binen paneller bu hareketlerle çakışmamalı.
   - **Kaydırma:** Kaydırılabilen paneller (çekmece, alt sayfa) kendi içinde kaymalı; sayfanın kendisi kaymamalı.
   - **Güvenli alanlar:** Çentik ve ana ekran çubuğu (safe area) dikkate alınmalı.
6. **Erişilebilirlik:**
   - WCAG AA kontrastı.
   - Klavyeyle her işe ulaşılabilmeli (masaüstü kısayolları aşağıda).
   - İkon-only düğmelerin görünmez etiketleri olmalı.
   - Renk tek başına anlam taşımamalı. Örneğin gerilim renklerinin yanında bir ölçek açıklaması var.

## 3. Bugünkü düzen ve sorunlar

**Masaüstü (1280–1440 px):**
- Üstte araç çubuğu, solda sabit parça kütüphanesi (256 px), ortada tuval.
- Tuvalin üstünde katmanlar:
  - Sol üstte örnek kartı.
  - Sağ üstte gerilim renk ölçeği.
  - Sağ altta osiloskop paneli (380 px).
  - Sol altta ipucu satırı.
  - Sağ altta yakınlık yüzdesi.
- Altta açılır "Mesajlar" paneli; en altta simülasyon çubuğu.

**Telefon (390×844):**
- Üst çubukta yalnızca ikonlar: kütüphane (hamburger), logo, Dosya, Örnekler, Seç, Kablo, Döndür, Sil, Ayarlar. Geri al ve yakınlaştırma düğmeleri telefonda gizli.
- Kütüphane soldan açılan bir çekmece.
- Örnek kartı tuvalin üstünü, osiloskop paneli altını kaplıyor; ikisi küçültülebiliyor.
- Simülasyon çubuğu iki satıra taşıyor.

**Bilinen sorunlar (çözmeni istediklerim):**
1. Telefonda örnek kartı, osiloskop paneli, mesajlar ve simülasyon çubuğu tuvali çok daraltıyor; devre görünmez hale gelebiliyor.
2. Özellikler bir modal pencerede. Simülasyon çalışırken değer değiştirip sonucu aynı anda görmek zor. Çift tık ve çift dokunuş keşfedilmiyor.
3. Ölçülen değerler dağınık:
   - Ölçü aletlerinin ekranları tuvalde küçük.
   - Parçanın gerilim/akım/güç kutusu masaüstünde yalnızca üzerine gelince, telefonda yalnızca parça seçiliyken çıkıyor.
4. Cihaz ayarları iki yerde: osiloskobun ön panel ayarları panelde, giriş tipi ve topraklama özellik penceresinde. Fonksiyon üreteci ve güç kaynağının ayarları yalnızca özellik penceresinde.
5. Telefonda kablo çekmek için küçük pin uçlarını yakalamak zor.
6. Hız kaydırıcısı logaritmik (×10⁻⁶ … ×1) ve anlamı anlaşılmıyor.
7. Klavye kısayolları ve dokunma hareketleri yalnızca küçük bir ipucu satırında yazıyor; ilk kullanımda yönlendirme (onboarding) yok.
8. Mesajlar paneli altta gizli kalıyor; hatanın tuvaldeki yerini bulmak zor olabiliyor.

## 4. Bölümler, düğmeler ve metinler

### 4.1 Üst çubuk
- **Logo:** Koyu kare üzerinde turuncu dalga ikonu ve site adı "Devre Simülatörü".
- **"Dosya" menüsü:**
  - "Yeni devre"
  - "JSON olarak dışa aktar"
  - "JSON dosyası içe aktar…"
  - "Paylaşım bağlantısı…"
- **"Örnekler":** Örnekler penceresini açar.
- **Araçlar** (ikon + metin; telefonda yalnızca ikon):
  - "Seç" (ipucu: "Seç ve taşı")
  - "Kablo" ("Kablo çek (W)")
  - "Döndür" ("Döndür (R)")
  - "Sil" ("Seçileni sil (Delete)")
  - "Geri al" ("Geri al (Ctrl+Z)")
  - "Yinele" ("Yinele (Ctrl+Y)")
- **Görünüm:**
  - "Uzaklaştır"
  - "Yakınlaştır"
  - "Devreyi ekrana sığdır"
- **"Ayarlar":** "Direnç sembolü" seçeneği: "Zigzag" | "Kutu (IEC)".
- **Telefonda ek düğme:** "Parça kütüphanesi" (çekmeceyi açar).

### 4.2 Parça kütüphanesi
- **Başlık ve arama:**
  - Başlık "Parçalar"; arama kutusu "Parça ara…".
  - Arama Türkçe karakterleri sadeleştirir ("kondansator" yazınca "Kondansatör" bulunur).
  - Sonuç yoksa: "Bu aramayla eşleşen parça yok."
- **Parçalar:** Kategoriler bu sırayla, her parçada küçük sembol ve ad:

| Kategori | Parçalar |
|---|---|
| Kaynaklar | Pil · AC kaynak · Toprak |
| Pasif | Direnç · Kondansatör |
| Yarı iletkenler | Diyot · Zener diyot · LED |
| Transistörler | NPN transistör · PNP transistör · N kanallı JFET · P kanallı JFET · N kanallı MOSFET · P kanallı MOSFET |
| Anahtarlar | Anahtar |
| Ölçü aletleri | Voltmetre · Ampermetre |
| Laboratuvar cihazları | Fonksiyon üreteci · DC güç kaynağı · Osiloskop |

- **Parça açıklamaları** (bilgi kartında):
  - **Pil:** "Uçları arasında sabit bir gerilim tutan doğru akım kaynağı; iç direnci ayarlanabilir."
  - **AC kaynak:** "Yönü zamanla değişen gerilim üreten alternatif akım kaynağı: sinüs, kare ya da üçgen dalga; tepe gerilimi ve frekansı ayarlanır."
  - **Toprak:** "Devrenin 0 V referans noktası; her devrede en az bir tane olmalı."
  - **Direnç:** "Üzerinden geçen akımla orantılı bir gerilim düşümü oluşturur: V = I · R."
  - **Kondansatör:** "Yük depolar; bir direnç üzerinden zamanla dolar ya da boşalır."
  - **Diyot:** "Akımı yalnızca bir yönde, anottan katoda geçirir; ileri yönde yaklaşık 0,6-0,7 V düşürür."
  - **Zener diyot:** "Ters yönde, kırılma (zener) geriliminde iletime geçen diyot; gerilimi sınırlamak ve kırpmak için kullanılır."
  - **LED:** "Işık yayan diyot; fazla akım geçerse yanar, bu yüzden seri bir ön direnç gerekir."
  - **NPN transistör:** "Küçük bir baz akımıyla büyük kollektör akımını kontrol eder (IC = β · IB); yükselteç ve anahtar olarak kullanılır."
  - **PNP transistör:** "NPN’in ters kutuplusu: akım emetörden girer, kollektörden çıkar; baz emetörden düşük gerilimde olunca iletir."
  - **N kanallı JFET:** "Drain akımını kapı-kaynak gerilimi (VGS) kontrol eder; kapı neredeyse akım çekmez. VGS = 0’da en büyük akım (IDSS) akar."
  - **P kanallı JFET:** "N kanallı JFET’in ters kutuplusu: kapıya pozitif gerilim verildikçe akım azalır."
  - **N kanallı MOSFET:** "Kapısı yalıtılmış alan etkili transistör; VGS eşik gerilimini (VT) aşınca iletime geçer. Anahtar ve yükselteç olarak kullanılır."
  - **P kanallı MOSFET:** "P kanallı MOSFET: kapı kaynaktan yeterince düşük olunca (VGS < VT < 0) iletime geçer."
  - **Anahtar:** "Devreyi açar ya da kapatır; simülasyon sırasında üzerine tıklayarak değiştirilir."
  - **Voltmetre:** "İki nokta arasındaki gerilimi ölçer; ölçülen parçaya paralel bağlanır."
  - **Ampermetre:** "İçinden geçen akımı ölçer; devreye seri bağlanır."
  - **Fonksiyon üreteci:** "Laboratuvardaki fonksiyon üreteci (GFG-8015G benzeri): sinüs, kare, üçgen; 0,2 Hz – 2 MHz, genlik, DC offset, simetri, −20 dB, 50 Ω çıkış, TTL darbe çıkışı. COM ucu şebeke toprağına bağlıdır."
  - **DC güç kaynağı:** "İki çıkışlı laboratuvar DC güç kaynağı: her çıkışın gerilimi (0–30 V) ve akım sınırı ayarlanır; çıkışlar topraktan yalıtılmıştır, seri bağlanabilir."
  - **Osiloskop:** "Gerilimin zamanla nasıl değiştiğini çizer; iki kanal (A, B) ortak uca göre, DC/AC/GND kuplaj, ADD, INV ve X-Y. Girişi 1 MΩ, COM ucu şebeke toprağına bağlıdır."
- **Yerleştirme:**
  - **Masaüstü:** Parça sürükleyip tuvale bırakılır ya da tıklanıp tuvale tıklanır (Shift + tıkla: art arda yerleştirme; Esc: iptal). Yerleştirirken parçanın hayaleti imleci izler; R ile döndürülür.
  - Masaüstünde fareyle parçanın üzerine gelince tuvalin sağ altında bilgi kartı çıkar: sembol, ad, açıklama ve "Sürükleyip tuvale bırak ya da seçip tuvale tıkla.".
  - **Telefon:** Parçaya dokununca parça görünen alanın ortasındaki boş bir yere eklenir ve çekmece kapanır. İlk seferde şu bildirim çıkar: "Parça eklendi. Sürükle: taşı · pin ucuna dokun: kablo · çift dokun: özellikler · basılı tut: menü (Döndür, Ters çevir, Sil)".

### 4.3 Tuval (şema)
- **Kağıt:**
  - Açık zemin (#fbfbf9), noktalı ızgara (1 birim = 10 px; her 5 birimde bir daha belirgin nokta).
  - Erişilebilir adı "Devre şeması".
  - Boş tuvalde: "Başlamak için soldaki kütüphaneden bir parça sürükle." (telefonda: "Parça eklemek için sol üstteki kütüphane düğmesine dokun.")
- **Parçalar:**
  - Sembol, adı (R1, C1, Q1, OSC1…) ve değeri ("4,7 kΩ", "100 µF", "5 V · 50 Hz", "β = 200").
  - İki uçlu parçalar 8 birim uzunluğunda. Transistörlerde kontrol ucu solda, öbür iki uç sağda üstte ve altta.
  - Cihazlar (osiloskop, fonksiyon üreteci, güç kaynağı) küçük ekranlı kutulardır; uçları kenardadır.
  - Bağlanmamış pin uçları turuncu (#f05a28) küçük halkadır.
  - 3 ya da daha çok bağlantının buluştuğu yerde dolu nokta (birleşim) çizilir.
- **Kablolar:**
  - **Masaüstü:** Bir pinin ucuna tıklayınca kablo başlar; her tıklama bir köşe ekler (yatay/dikey L yolu otomatik). Bir pine ya da kabloya tıklayınca biter, boşlukta çift tıklayınca orada biter, Esc iptal eder.
  - W ile "Kablo" aracına geçilir; boş bir noktadan ya da bir kablonun ortasından kablo başlatılabilir.
  - Bir kablonun ucu başka bir kablonun ortasına değerse T bağlantısı olur; kesişen kablolar bağlanmaz.
  - Kablo parçası sürüklenerek kaydırılır.
  - **Telefon:** Pine dokununca kablo başlar ve üstte şu şerit çıkar: "Kablo çiziliyor: bir pine ya da kabloya dokun" + "İptal".
- **Seçme ve düzenleme:**
  - Tıkla: seç. Shift + tıkla: seçime ekle. Boşlukta sürükle: seçim kutusu (masaüstü).
  - Sürükle: taşı; bağlı kablolar esner.
  - R: 90° döndür; kablolar pinleri izler.
  - F: ters çevir. Yalnızca yönlü parçalarda (diyot, LED, pil, voltmetre, ampermetre, zener, AC kaynak): uçlar yer değiştirir, kablolar yerinde kalır.
  - Delete: sil.
  - Seçili öğe mavi kesikli çerçeveyle gösterilir.
- **Sağ tık / uzun basma menüsü:**
  - "Özellikler…"
  - "Döndür (R)"
  - "Ters çevir (F)"
  - "Sil"
  - Yanmış LED'de ayrıca "Onar".
- **Gezinme:**
  - **Masaüstü:** Fare tekerleği yakınlaştırır. Boşluk + sürükle ya da orta tuşla kaydırılır.
  - **Telefon:** Boşlukta tek parmak kaydırır, iki parmak yakınlaştırır. Boşluğa dokunmak seçimi kaldırır.
  - Sağ altta "Yakınlık %150" göstergesi.
- **İpucu satırı** (tuvalin sol altında, duruma göre değişir):
  - **Seç aracı:** "Kablo çekmek için bir pinin ucuna tıkla. Çift tık: özellikler · R: döndür · F: ters çevir · Delete: sil · Boşluk + sürükle: tuvali kaydır"
  - **Yerleştirme:** "{Parça}: yerleştirmek için tuvale tıkla · R: döndür · F: ters çevir · Shift + tıkla: birden çok · Esc: iptal"
  - **Kablo aracı (boşta):** "Kablo: başlamak için bir pine, kabloya ya da boş bir noktaya tıkla · Esc: seçme aracına dön"
  - **Kablo çizerken:** "Köşe için tıkla · bitirmek için bir pine ya da kabloya tıkla · çift tık: boşta bitir · Esc: iptal"
  - **Seçim varken:** "{n} öğe seçili · R: döndür · F: ters çevir · Delete: sil · Ctrl+Z: geri al"
  - **Simülasyon sırasında:** "Simülasyon sırasında: anahtarı açıp kapatmak için üzerine tıkla · değer değiştirmek için çift tıkla · parça eklemek ya da taşımak simülasyonu durdurur"
- **Masaüstü klavye kısayolları:**

| Kısayol | İşlev |
|---|---|
| W | Kablo aracı |
| R | Döndür |
| F | Ters çevir |
| Delete / Backspace | Sil |
| Ctrl+Z | Geri al |
| Ctrl+Y / Ctrl+Shift+Z | Yinele |
| Ctrl+A | Tümünü seç |
| Esc | İptal |
| Boşluk + sürükle | Tuvali kaydır |

### 4.4 Simülasyon sırasında tuvaldeki görsel dil
- **Kablo rengi:** Gerilime göre renklenir: mavi (−Vmax) → yeşil (0 V) → sarı/turuncu → kırmızı (+Vmax). Ölçek, devredeki en büyük kaynak gerilimidir.
  - Renk ölçeğinin açıklaması: başlık "Kablo gerilimi", altında degrade ve "−5 V · 0 V · +5 V" gibi etiketler. Masaüstünde sağ üstte, telefonda sol altta.
  - Devreye bağlı olmayan kablo gri (#9aa3ad).
- **Akım noktaları:**
  - Sarı (#ffd43b) noktalar kablolar ve parçalar boyunca akar.
  - Hız akımın büyüklüğüne göre logaritmiktir (1 µA yavaş, 1 A hızlı); 10 nA'in altında noktalar durur.
  - Varsayılan geleneksel akım yönüdür. "Elektron akışını göster" açılınca noktalar ters yönde akar.
  - AC devrede renkler, noktalar ve LED parlaklığı kare ortalamasından çizilir (titremez).
- **LED:**
  - Akıma göre kendi renginde (kırmızı/yeşil/mavi) parlar.
  - 20 mA'i aşınca kesikli turuncu halka (aşırı akım) çıkar.
  - En büyük akımı (örn. 30 mA) aşınca yanar: koyu gövde, çatlak ve duman çizilir. Yanında balon çıkar: "Onar" | "Kapat".
- **Kondansatör:** Yanında dolma çubuğu; |V|/Vmax oranında dolar. + uç yüksekse kırmızı, ters doluysa mavi.
- **Ölçü aletleri (voltmetre/ampermetre):**
  - Parçanın üstünde küçük LCD ekran: koyu yeşil (#1e2a25) zemin, nane yeşili (#a6f4bd) eş aralıklı rakam.
  - Örnek değerler "4,500 V", "9,616 mA"; AC kipinde sonuna "~" eklenir ("7,071 V~"). Durmuşken "– – – V".
- **Kısa devre:** Pil ya da AC kaynakta kırmızı, yanıp sönen çerçeve.
- **DC güç kaynağı:** Sembolde iki küçük ekran (ayarlı gerilim) ve her çıkışta "CC" lambası; akım sınırına girince kırmızı yanar.
- **Bilgi kutusu (V/I/P):** Masaüstünde parçanın üzerine gelince, telefonda seçili parçada açılır. Başlık "R1 · Direnç", altında satırlar ve bir açıklama notu. Parça türüne göre içerik:
  - **Direnç:** Gerilim, Akım, Harcanan güç; not: "V = I · R → 4,50 V = 4,50 mA × 1,00 kΩ".
  - **Pil:** Uç gerilimi, Verdiği akım, Verdiği güç, İç dirençte kaybolan güç; not: "V = E − I · R<sub>iç</sub> → …".
  - **AC kaynak:** Anlık gerilim, Verdiği akım, Tepe gerilimi, Etkin değer, Frekans, Periyot; not, dalga biçimine göre formül.
  - **Kondansatör:** Gerilim, Akım, Güç, Depolanan enerji (½CV²); durum notu: "Kondansatör doluyor." / "Kondansatör boşalıyor." / "Akım yok: kondansatörün gerilimi değişmiyor."
  - **Diyot ve LED:** Gerilim (anot − katot), Akım, Harcanan güç, (LED) Parlaklık %; not: "İleri yönde kutuplanmış: akım anottan katoda geçer." ya da "Ters yönde kutuplanmış: yalnızca çok küçük bir sızıntı akımı geçer."
  - **Zener diyot:** Kırılma bölgesindeyse "Kırılma bölgesinde: uçlarındaki gerilim ≈ V<sub>Z</sub> ve akımla çok az değişir."
  - **BJT:** Kollektör akımı I<sub>C</sub>, Baz akımı I<sub>B</sub>, V<sub>CE</sub>, V<sub>BE</sub>, I<sub>C</sub>/I<sub>B</sub>, Bölge (Kesim/Aktif/Doyum) ve bölgeye göre açıklama.
  - **FET:** Drain akımı I<sub>D</sub>, V<sub>DS</sub>, V<sub>GS</sub>, Bölge (Kesim / Omik (doğrusal) / Doyum) ve açıklama.
  - **Anahtar:** Durum Açık/Kapalı, gerilim, akım.
  - **Voltmetre ve ampermetre:** Gösterge, Anlık değer, Devreden çektiği akım / Üzerindeki gerilim düşümü; not, iç direncin etkisi ve DC/AC kipinin anlamı.
  - **Fonksiyon üreteci:** Çıkış gerilimi (OUT − COM), Verdiği akım, Açık devre genliği, Frekans, Periyot; not: "Çıkış direnci 50 Ω: yük akımı arttıkça çıkış gerilimi düşer…"
  - **DC güç kaynağı:** Her çıkış için gerilim · akım · "sabit gerilim (CV)" ya da "akım sınırında (CC)".
  - **Osiloskop:** Kanal A, Kanal B anlık değerleri.

### 4.5 Simülasyon çubuğu (en altta)
- **Düğmeler:**
  - "Oynat" (yeşil, ana eylem).
  - "Duraklat".
  - "Durdur" (ipucu: "Durdur: LED’ler onarılır, kondansatörler başlangıç gerilimine döner").
- **Durum:**
  - Renkli nokta ve metin: "Çalışıyor" (yeşil), "Duraklatıldı" (amber), "Durduruldu" (gri).
  - Zaman göstergesi: "Zaman: 1,594 s".
- **"Hız" kaydırıcısı:**
  - Logaritmik, ×10⁻⁶ … ×1. ×1, ×0,5, ×0,1, ×0,05, ×0,01, ×10⁻³ … ×10⁻⁶ değerlerine yapışır.
  - Etiket "×1", "×0,05", "×2,5·10⁻⁵" gibi.
  - İpucu: "Simülasyon hızı: simülasyon zamanının gerçek zamana oranı". 1 MHz'lik sinyaller yalnızca çok yavaşlatılınca izlenebilir.
- **Onay kutusu:** "Elektron akışını göster".
- **Bilgi/uyarı satırı:**
  - "Noktalar geleneksel akım yönünü gösterir: dış devrede + uçtan − uca."
  - "Elektronlar, geleneksel akım yönünün tersine hareket eder."
  - "Devrenin yapısı değiştiği için simülasyon durduruldu."
  - "Simülasyon çalışamıyor: {hata açıklaması}" (kırmızı)
  - "Bu hızda simülasyon gerçek zamana yetişemiyor (yüksek frekans). Hızı düşür ya da osiloskopta Oto’ya bas." (kırmızı)
- **Simülasyonun sürüp sürmemesi:**
  - Parça ya da kablo eklemek, silmek, taşımak ya da döndürmek simülasyonu durdurur.
  - Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz: kondansatör gerilimleri korunarak devre yeniden derlenir.

### 4.6 Mesajlar paneli
- **Kapalıyken:** "Mesajlar" + özet: "2 hata" / "3 uyarı" / "Sorun yok". Simülasyon hatası ya da yeni bir çalışma uyarısı gelince kendiliğinden açılır.
- **Açıkken:**
  - Liste. Her satırda önem (Hata/Uyarı), başlık ve açıklama; açıklamalarda formüller alt simgeli.
  - Bir mesaja tıklanınca ilgili parçalar ve kablolar tuvalde kırmızı ya da amber vurgulanır; ekran dışındaysa görünüm oraya kayar.
  - İpucu: "Bir mesaja tıklayınca ilgili parça tuvalde vurgulanır."
- **Mesaj başlıkları:**
  - "Devrede toprak yok"
  - "Toprak bağlı değil"
  - "Direnç içermeyen döngü"
  - "Boşta uç" (örn. "R1 direncinin 2. ucu hiçbir yere bağlı değil.")
  - "Toprağa bağlı olmayan parça"
  - "Ampermetre paralel bağlanmış"
  - "Kısa devre"
  - "LED yandı" (açıklamasında ön direnç formülü: R = (V<sub>kaynak</sub> − V<sub>f</sub>) / I)
  - "Çözüm yakınsamadı"
  - "Devre denklemleri çözülemedi"

### 4.7 Osiloskop paneli (devrede osiloskop varken)
- **Yeri:** Masaüstünde tuvalin sağ altında 380 px genişlikte. Telefonda tuvalin altında, küçültülmüş başlar; dokununca açılır. Açılıp kapanınca devre kalan alana yeniden sığdırılır.
- **Başlık:**
  - "Osiloskop" + ad ("OSC1"); birden çok osiloskop varsa seçme kutusu.
  - Durum metni: "Tetiklenmiyor; ekran kayıyor."
  - Küçült/aç düğmesi.
- **Ekran:**
  - Koyu zemin (#0f1713), 10 × 8 bölmeli ızgara, orta eksenlerde ince çentikler.
  - A kanalı sarı (#f2c94c), B kanalı camgöbeği (#56ccf2), X-Y eğrisi yeşil (#9be37a).
  - Her kanalın sıfır seviyesi sol kenarda renkli üçgenle işaretli.
  - Ekranın altında ölçüm şeridi: "A · Tepe-tepe 20,0 V · Etkin 7,07 V · f 50,0 Hz".
  - Durmuşken: "Ekranı görmek için Oynat’a bas."
- **Kanal kontrolleri (A ve B):**
  - Volt/bölme: 1 mV/b … 50 V/b.
  - Kuplaj: DC | AC | GND.
  - Konum yukarı/aşağı (±4 bölme; telefonda gizli).
- **Diğer kontroller:**
  - Kip: "A ve B (Y-t)" | "A + B (ADD)" | "X-Y (A yatay, B dikey)".
  - "B ters (INV)" onay kutusu. ADD ile birlikte A − B verir: köprü doğrultmaçta doğru ölçüm böyle yapılır.
  - "Zaman/bölme": 100 ns/b … 1 s/b.
  - "Tetik": A | B.
  - "Oto" düğmesi: zaman/bölme ≈ 2,5 periyot, volt/bölme sinyal ±3,5 bölmeye sığacak biçimde seçilir. Simülasyon hızı da bir ekran taraması ≈ 0,2 s sürecek şekilde ayarlanır.
- **Mekanizma:**
  - Otomatik tetikleme orta seviyede ve yükselen kenarda; kesim yoksa ekran kayar.
  - Ekrandan hızlı sinyal bant olarak görünür (tepe yakalama).
  - Gerçek giriş 1 MΩ ‖ 25 pF'tır, devreyi yükler. AC kuplaj 10 Hz'lik yüksek geçiren süzgeçtir.
  - COM ucu şebeke toprağına bağlıdır (topraklıysa sembolde yeşil toprak işareti).

### 4.8 Örnekler penceresi
- **Başlık ve açıklama:**
  - Başlık "Örnek devreler".
  - Alt başlık: "Bir örneğe tıkla: devre açılır; açıklaması ve tahmin sorusu tuvalin köşesinde çıkar."
  - Kapat düğmesi.
- **Kartlar:**
  - Gruplar halinde. Her kartta sıra numarası, başlık ve iki satırlık açıklama; açık olan örnek vurgulu.
  - Telefonda tam ekran ve kaydırılabilir; masaüstünde iki sütunlu ızgara.
- **Bugünkü gruplar** (sayı artacak; tasarım 10–15 grup ve 20–40 örneği kaldırmalı):

| Grup | Örnekler |
|---|---|
| Temel devreler | LED ve ön direnç · Gerilim bölücü · Voltmetrenin yükleme etkisi · Ampermetrenin etkisi · RC dolma · Kare dalga ile RC · Diyot yönü |
| Laboratuvar cihazları | Toprak tuzağı: köprüde prob toprağı |
| Diyot karakteristiklerinin incelenmesi | Diyot karakteristiği (akım-gerilim eğrisi) |
| Doğrultucu devreler | Yarım dalga doğrultmaç · Orta uçlu tam dalga doğrultmaç · Köprü doğrultmaç ve filtre kondansatörü |
| Kenetleyici ve gerilim katlayıcı devreler | Pozitif kenetleyici · Gerilim ikileyici (katlayıcı) |
| Kırpıcı devreler | Öngerilimli paralel kırpıcı · Çift yönlü zener kırpıcı |
| FET karakteristiklerinin incelenmesi | JFET çıkış karakteristiği · JFET transfer karakteristiği |
| FET yükselteci | JFET’li yükselteç (ortak kaynak) |
| BJT’li yükselteç | BJT’li yükselteç (ortak emetör) |
| MOSFET’li yükselteç devresi | MOSFET’li yükselteç (ortak kaynak) |
| Transistörlerin anahtar olarak kullanılması | BJT’nin anahtar olarak kullanılması · MOSFET’in anahtar olarak kullanılması |

### 4.9 Örnek kartı (bir örnek açıkken)
- **Başlık satırı:** "Örnek" rozeti, başlık, küçült/aç (başlık çubuğuna dokununca) ve kapat.
- **İçerik:**
  - Açıklama.
  - **"Tahmin et"** kutusu (amber): tahmin sorusu.
  - **"Cevap"** kutusu. Oynat'a basılana kadar gri ve "Cevabı görmek için Oynat’a bas."; basınca yeşil kutuda cevap açılır. Cevaplarda formül ve alt simge var.
- **Örnek metinler (Gerilim bölücü):**
  - Açıklama: "İki eşit direnç (1 kΩ + 1 kΩ) ideal 9 V’luk bir pile seri bağlı. Voltmetre, dirençlerin birleştiği orta noktanın gerilimini ölçüyor."
  - Soru: "Voltmetre kaç volt gösterir? Önce hesapla, sonra Oynat’a bas."
  - Cevap: "4,5 V: V<sub>çıkış</sub> = V · R<sub>2</sub> / (R<sub>1</sub> + R<sub>2</sub>) = 9 V · 1 kΩ / 2 kΩ. Dirençlerden birinin değerini değiştirip çıkış geriliminin nasıl değiştiğine bak."
- **Yerleşim:** Masaüstünde sol üstte 352 px genişlikte, telefonda üstte tam genişlikte. Örnek yüklenince devre, kartın kapladığı alan boş kalacak biçimde sığdırılır.

### 4.10 Özellikler (bugün modal pencere)
- **Başlık:** "R1 — özellikler" + tür adı.
- **Ortak alan:** "Ad" (en fazla 12 karakter, benzersiz).
- **Sayı alanları:** SI önekli yazılır ("4,7k", "100µ", "2,2M", "4k7"); sağda birim (Ω, V, A, F, Hz, %, A/V²).
- **Alt notlar:**
  - Birim ipucu: "SI önekleri: p, n, µ (ya da u), m, k, M, G. Büyük M mega, küçük m mili demektir."
  - Mavi-gri bilgi notu (parçaya özel).
- **Seçmeli alanlar:** Çip (chip) düğmeler. LED renkleri için renk noktası.
- **Düğmeler:** "İptal", "Tamam" (Enter). Arka plana dokunmak ya da Esc kapatır.
- **Hata metinleri** (alanın altında kırmızı):
  - "Bir değer yaz."
  - "Bu bir sayı değil. Örnekler: 4,7k · 100µ · 2,2M · 0,5"
  - "Bu alanın birimi V."
  - "Değer sıfırdan büyük olmalı."
  - "Değer negatif olamaz."
  - "Değer en fazla 2 MHz olabilir."
  - "Bir ad yaz."
  - "Bu ad başka bir parçada kullanılıyor."
- **Parçaya göre alanlar:**
  - **Pil:** Gerilim, İç direnç.
  - **AC kaynak:** Dalga biçimi (Sinüs | Kare | Üçgen), Tepe gerilimi, Frekans, DC kayma, İç direnç. Not, yazarken hesaplanır: "Etkin değer ≈ 3,54 V · periyot T = 1 / f = 20 ms. Türkiye’de şebeke gerilimi 230 V etkin değerli (tepe ≈ 325 V), 50 Hz’liktir."
  - **Direnç:** Direnç.
  - **Kondansatör:** Kapasite, Başlangıç gerilimi.
  - **Diyot:** Alan yok, yalnızca not.
  - **Zener diyot:** Zener gerilimi (20 mA’de).
  - **LED:** Renk (Kırmızı | Yeşil | Mavi); not: "20 mA’de ileri gerilim ≈ 1,85 V; en fazla 30 mA akıma dayanır."
  - **NPN ve PNP:** Akım kazancı β (hFE).
  - **JFET:** Doyma akımı IDSS (VGS = 0), Kısılma gerilimi VP.
  - **MOSFET:** Eşik gerilimi VT, İletkenlik katsayısı k.
  - **Anahtar:** "Anahtar kapalı (akım geçirir)".
  - **Voltmetre ve ampermetre:**
    - Ölçüm kipi: "DC (ortalama)" | "AC (etkin değer)".
    - "İdeal voltmetre (iç direnç ∞)" ya da "İdeal ampermetre (iç direnç 0 Ω)".
    - İç direnç.
  - **Fonksiyon üreteci:** Dalga biçimi, Frekans (0,2 Hz – 2 MHz), Genlik (tepe-tepe, açık devre, en fazla 20 V), DC offset (açık devre, ±10 V), Simetri (DUTY, %10–90), "−20 dB zayıflatıcı (çıkış 10’da 1)", "COM şebeke toprağına bağlı (gerçek cihazdaki gibi)".
  - **DC güç kaynağı:** 1. çıkış gerilimi, 1. çıkış akım sınırı, 2. çıkış gerilimi, 2. çıkış akım sınırı.
  - **Osiloskop:** Giriş ("1 MΩ ‖ 25 pF (gerçek)" | "İdeal (akım çekmez)"), "COM şebeke toprağına bağlı (gerçek cihazdaki gibi)".

### 4.11 Paylaşım penceresi
- **Başlık:** "Paylaşım bağlantısı".
- **Açıklama:** "Devre bu bağlantının içine sıkıştırılarak yazıldı; bir sunucuya gönderilmedi. Bağlantıyı açan kişi aynı devreyi görür."
- **İçerik:**
  - Salt okunur bağlantı alanı ve uzunluk ("595 karakter").
  - "Kopyala" düğmesi → "Kopyalandı". Başarısızsa: "Kopyalanamadı; bağlantıyı seçip elle kopyala."
  - "Kapat".

### 4.12 Bildirimler (toast, altta ortada)
- "Örnek yüklendi. Önceki devrene dönmek için Geri al (Ctrl+Z)."
- "Yeni devre açıldı. Önceki devrene dönmek için Geri al (Ctrl+Z)."
- "Devre içe aktarıldı. Önceki devrene dönmek için Geri al (Ctrl+Z)."
- "Bu dosya geçerli bir devre dosyası değil (sürüm 1 JSON bekleniyor)."
- "Paylaşılan devre açıldı."
- "Paylaşım bağlantısındaki devre okunamadı; bağlantı eksik kopyalanmış olabilir."

## 5. Tasarımı etkileyen mekanizmalar

- **Kaydetme:** Devre her değişiklikten 0,4 s sonra tarayıcıya otomatik kaydedilir; açılışta geri gelir. Kaydet düğmesi yok; bu güven veren bir biçimde hissettirilebilir.
- **Paylaşma ve dosya:** Paylaşım bağlantısı devrenin kendisini adres çubuğunda taşır. JSON dışa ve içe aktarma var.
- **Çözüm:** Gerçek zamanlı. Fonksiyon üreteci 2 MHz'e kadar çıkar; yüksek frekansta hız düşürülür.
- **Gerçekçi parça modelleri:**
  - Diyot, zener ve LED.
  - BJT: BC547/BC107 benzeri.
  - JFET: 2N5457/BF245A benzeri.
  - MOSFET: 2N7000/IRF510 benzeri.
  - Bu modeller sürekli genişliyor; arayüz yeni parçaları ve yeni ayarları kolayca kaldırmalı.
- **Şebeke toprağı ve toprak tuzağı:**
  - Fonksiyon üretecinin ve osiloskobun COM ucu şebeke toprağına bağlıdır; devrede toprak sembolü olmasa da devre topraklanmış sayılır.
  - Bu yüzden laboratuvardaki "toprak tuzağı" simülatörde de oluşur: köprü doğrultmaçta prob toprağı yanlış yere takılırsa bir diyot kısa devre olur.
  - Tasarım bu kavramı görünür kılmalı (topraklı uç işareti, uyarı, açıklama).
- **Tahmin → Oynat → Cevap döngüsü:** Örneklerin öğretim yöntemi. Cevap yalnızca simülasyon başlayınca açılır.
- **Hedef deneyler:** Yakında laboratuvar föyündeki dokuz deney birebir örnek olarak eklenecek:
  1. Diyot karakteristikleri
  2. Doğrultucular
  3. Kenetleyici ve katlayıcı
  4. Kırpıcılar
  5. FET karakteristikleri
  6. JFET yükselteç
  7. BJT yükselteç
  8. MOSFET yükselteç
  9. Transistör anahtar

  Bazı deneylerde öğrenci kendi değerlerini tasarlıyor (örn. "kazanç 10 olacak şekilde RD, Rg, VDD seç") ve ölçüm tablosu dolduruyor. Bu ihtiyaçlara yer açan bir yapı öner.

## 6. Senden beklediğim tasarım yönü

Bunlar öneri; daha iyisini bulursan gerekçesiyle değiştir.

1. **Tuval her zaman başrolde olsun.** Telefonda panellerin tuvali ne kadar kapladığını sınırla. Alt sayfalar (bottom sheet), sekmeler ve tam ekran görünümler arasında net bir düzen kur.
2. **Bağlama duyarlı bir "İnceleme" alanı:**
   - Seçili parçanın özellikleri ve canlı ölçümleri (gerilim, akım, güç, bölge, formül notu) aynı yerde dursun. Masaüstünde sağ panel, telefonda alt sayfa olabilir.
   - Simülasyon çalışırken değer değiştirip sonucu hemen görmek mümkün olsun.
   - Bugünkü modal pencere ve üzerine gelince açılan kutu bu alana dönüşebilir.
3. **Laboratuvar cihazlarına ön panel:**
   - Fonksiyon üreteci, DC güç kaynağı ve osiloskop için gerçek cihazlara işlevce benzeyen (marka taklidi olmayan) ön paneller tasarla.
   - Önerilen öğeler: frekans göstergesi, dalga biçimi düğmeleri, DUTY/OFFSET/AMPL, ATT −20 dB; VOLTS/DIV, TIME/DIV, AC/GND/DC anahtarı, CH1/CH2/DUAL/ADD, INV, X-Y; her çıkış için gerilim ve akım göstergesi, CC lambası.
   - Öğrencinin laboratuvara geçişini kolaylaştırmalı. Birden çok cihaz aynı anda açık olabilir; masaüstünde bir "cihaz rafı" ya da yerleştirilebilir paneller, telefonda sekmeli alt sayfa olabilir.
4. **Kur / Ölç akışı:** Devre kurma ile simülasyonu izleme ve ölçme arasında, özellikle telefonda, açık bir kip ayrımı ya da düzen değişimi olabilir. Oynat düğmesi başparmak bölgesinde, her zaman ulaşılabilir olmalı.
5. **Keşfedilebilirlik:**
   - İlk açılışta kısa ve atlanabilir bir rehber.
   - Kısayollar ve hareketler için bir yardım paneli ("?").
   - Boş tuvalde "Örneklerden başla" önerisi.
   - Kablo çekmeye kolay başlangıç; telefonda pinler büyütülmüş dokunma alanına sahip.
6. **Anlamayı kolaylaştıran görsel dil:**
   - Gerilim renk ölçeği, akım noktaları, ölçü değerleri ve formüller tutarlı bir tipografiyle verilsin: rakamlar eş genişlikli (tabular), birimler ve önekler okunaklı.
   - Hata ve uyarılar tuvalde kendini göstersin.
7. **Hız denetimi:** Logaritmik hızı anlaşılır kıl. Örneğin "1 saniyede 1 ms" gibi bir açıklama ya da hazır seçenekler (Gerçek zaman, Yavaş, Çok yavaş, Osiloskoba göre) ile kaydırıcı birlikte kullanılabilir.
8. **Yatay telefon ve tablet** için de bir düzen öner. Tablet ekranları: iPad 1024×768 ve 1180×820.

## 7. Görsel temel

- **Bugünkü renk belirteçleri:**

| Belirteç | Değer |
|---|---|
| app (uygulama zemini) | #eef0f3 |
| panel | #ffffff |
| line (çizgi) | #dde1e6 |
| ink (metin) | #1d2733 |
| muted (ikincil metin) | #5f6b7a |
| accent (vurgu) | #1f6feb |
| accent-soft | #e6effd |
| danger (hata) | #d92d20 |
| warn (uyarı) | #b54708 |
| warn-soft | #fef6e7 |
| paper (kağıt) | #fbfbf9 |
| grid (ızgara) | #d3d7dc |
| symbol (sembol) | #1d2733 |
| select (seçim) | #1f6feb |
| pin | #f05a28 |
| Oynat yeşili | #1f8a4c |
| Duraklatıldı amber | #e8a317 |
| Durduruldu gri | #9aa3ad |

  Gerilim renkleri HSL tonu üzerinden: 220° (mavi, eksi) → 140° (yeşil, 0) → 0° (kırmızı, artı); doygunluk %75, açıklık %40.
- **Bunları koruyabilir ya da yeni bir palet önerebilirsin.** Ancak gerilim ölçeği, osiloskop kanal renkleri ve hata/uyarı renkleri birbirinden kolayca ayırt edilmeli (renk körlüğü dahil).
- **Yazı tipleri:** Sistem sans-serif (system-ui), rakam ekranları için sistem mono.
- **İkonlar:** 20×20 çizgi ikonlar (projeye özel). Gerekirse yeni ikonlar öner.
- **Şema sembolleri:** IEC/ANSI eğitim konvansiyonları.
  - Direnç zigzag ya da kutu.
  - Pilde uzun ince levha + kutup, kısa kalın levha − kutup.
  - Diyot ve LED üçgen + çizgi; LED'de iki ok, zener katodu Z biçimli.
  - BJT dairede, ok emetörde.
  - JFET'te kanal çubuğu, ok kapıda.
  - MOSFET'te yalıtılmış kapı ve kesik kanal.
  - Toprak üç çizgi.
- **Açık tema şart, koyu tema isteğe bağlı.** Koyu temada şema kağıdı ve gerilim renkleri yeniden düşünülmeli. Projeksiyonda okunabilirlik önemli.

## 8. Teslim edilecekler

1. **Tasarım sistemi:**
   - Renk belirteçleri (açık + isteğe bağlı koyu), tipografi ölçeği, aralık ve köşe yarıçapları, gölgeler.
   - Bileşenler bütün durumlarıyla: düğme, ikon düğme, araç düğmesi, seçme kutusu, çip seçici, sayı alanı (birimli), onay kutusu, kaydırıcı, sekme, alt sayfa, modal, toast, rozet, LCD gösterge, osiloskop ekranı, mesaj satırı, örnek kartı, cihaz ön paneli öğeleri.
   - Tailwind'e aktarılabilecek biçimde CSS değişkenleri.
2. **Ekranlar:** Masaüstü 1440×900 ve 1280×800, tablet 1024×768, telefon 390×844 dikey ve 844×390 yatay, küçük telefon 375×667.
   1. İlk açılış / boş tuval (+ ilk kullanım rehberi).
   2. Parça ekleme ve kablo çekme (masaüstünde sürükle-bırak; telefonda çekmece/sayfa, pin seçimi, kablo şeridi).
   3. Bir parça seçili, özellikleri düzenleniyor (simülasyon durmuşken ve çalışırken).
   4. Simülasyon çalışıyor. Örnek devre "LED ve ön direnç": renkli kablolar, akım noktaları, parlayan LED, ampermetre ekranı, gerilim ölçeği.
   5. Örnek açık. "Yarım dalga doğrultmaç": tahmin sorusu (cevap gizli), sonra Oynat'tan sonra cevap açık.
   6. Osiloskop ve fonksiyon üreteci ön panelleri:
      - Y-t kipinde iki kanal.
      - "Toprak tuzağı" örneğinde ADD + INV ile doğru ölçüm.
      - X-Y kipinde diyot karakteristiği.
   7. Hata ve uyarılar: LED yandı (balon + mesaj), kısa devre (yanıp sönen çerçeve), "Devrede toprak yok" (simülasyon başlamıyor), boşta uç uyarısı.
   8. Örnekler penceresi.
   9. Dosya menüsü ve paylaşım penceresi.
   10. Ayarlar ve yardım/kısayollar.
3. **Etkileşim notları:**
   - Her ekranda dokunma hareketleri, klavye kısayolları, panellerin açılma/kapanma ve tuvalin yeniden sığdırılma davranışı.
   - Odak sırası.
   - Telefonda hangi panelin neyi kapattığı.
4. **Metin değişiklikleri:** Önerdiğin metin değişikliklerinin listesi (eski → yeni).
