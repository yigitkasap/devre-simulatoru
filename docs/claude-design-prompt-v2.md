# Görev: Devre Simülatörü'nün yeni görsel tasarımı (v2, Ekim 2026)

"Devre Simülatörü"nün bütün sitesi için **yeni bir görsel tasarım** hazırla. Uygulama çalışıyor ve yayında (https://yigitkasap.github.io/devre-simulatoru/). İşlevler aynen kalır; değişecek olan görünüş: renkler, yazı, yüzeyler, bileşenler, ikonlar, tuvalin ve cihazların görsel dili. Son tasarımdan (v1) bu yana iki büyük özellik eklendi ve bunların da tasarlanması gerekiyor: **Arduino Uno** ve **3B tezgâh**.

Önceki brif `docs/claude-design-prompt.md`, önceki tasarım `docs/tasarim/` (README, `tokens.css`, `artboards/*.dc.html`). Bu iki kaynaktaki ürün tanımı, kullanıcılar, kesin kurallar, bölümlerin işlevleri ve metinler **hâlâ geçerli**. Bu belge yalnızca değişenleri ve yenileri anlatıyor. Bugünkü düzen v1 tasarımıdır: o düzeni (panellerin yeri, akışlar) koruyabilir ya da gerekçesiyle iyileştirebilirsin; asıl istenen, görsel dilin yenilenmesi.

---

## 1. Ürün (kısa)

- Türkçe, tarayıcıda çalışan, eğitsel devre simülatörü. Kullanıcılar fizik bölümü 2. sınıf öğrencileri ve araştırma görevlileri (Elektronik Laboratuvarı dersi).
- Devre şemada kurulur. "Oynat"a basınca devre gerçek zamanlı çözülür:
  - kablolar gerilime göre renklenir, akım noktaları akar;
  - LED'ler parlar, ölçü aletleri ve osiloskop değer gösterir.
- Masaüstü, tablet, telefon (dikey ve yatay) ve projeksiyonda kullanılıyor.
- İki sayfa var: simülatör ve baraj su seviyesi uyarısı ders sayfası (`/baraj`).

## 2. Değişmeyen kesin kurallar (özet; ayrıntı v1 brifinde)

1. **Marka:**
   - Proteus, LTspice, Falstad, PhET, Wokwi, Tinkercad görünümü ya da adı kullanılmaz.
   - Cihazlar işlevce gerçek cihazları andırabilir, bir markanın panelini birebir taklit etmez.
   - "Arduino" ve "UNO" adı kartın kendisini anlatmak için kullanılır; Arduino logosu ve marka grafiği kullanılmaz.
2. **Dil:**
   - Arayüz yalnızca Türkçe; ondalık ayırıcı virgül (4,7 kΩ).
   - "Gerilim", "akım", "toprak", "etkin değer" terimleri korunur.
   - Formüllerde gerçek alt simge kullanılır.
3. **Uygulanabilirlik:**
   - Tasarım React + Tailwind CSS 4 ile kodlanır; renkler CSS değişkeni (token) olarak verilir.
   - Şema SVG'dir, semboller kodla çizilir. 3B tezgâh three.js ile kodla üretilir (hazır 3B model dosyası yok).
   - Yeni yazı tipi önerirsen lisansını (OFL vb.) ve dosya boyutunu belirt. Şu an IBM Plex Sans ve Mono kullanılıyor, site içinde barındırılıyor.
4. **Dokunmatik ve iOS Safari:**
   - Hover'a bağlı bilgi yok; dokunma hedefleri en az 44 × 44 px; giriş alanlarında yazı en az 16 px.
   - Sayfanın kendisi hiç kaymaz; yalnızca paneller kendi içinde kayar.
   - Tuvalin üstüne binen öğeler tuval hareketleriyle çakışmamalı. Telefonda tuvalin sol üst köşesi boş kalır: kaydırma için kullanılıyor.
5. **Erişilebilirlik:** WCAG AA kontrast, tam klavye erişimi, ikon düğmelerinde görünmez etiket. Renk tek başına anlam taşımaz (gerilim ölçeğinin açıklaması var).
6. **Düzen kırılma noktaları (korunacak):**
   - < 900 px: telefon;
   - ≥ 900 px ve dokunmatik: tablet;
   - 900–1279 px fareyle: sıkışık masaüstü;
   - ≥ 1280 px: masaüstü;
   - yükseklik < 500 px ve dokunmatik: telefon (yatay).

## 3. Yeni görsel dilden beklenenler

Bunlar öneri; daha iyisini gerekçesiyle getir.

1. **Kimlik:** Laboratuvar defteri ile ölçü aleti arasında, sakin ve güven veren bir görünüm. Şema "kağıt", cihazlar "ön panel", 3B tezgâh "masa": üçü aynı ailenin parçası gibi dursun.
2. **Okunabilirlik:**
   - Sayılar eş genişlikli olsun, birimler ve önekler okunaklı.
   - Canlı ölçümler bakınca hemen anlaşılsın.
   - Projeksiyonda (uzaktan, açık renkli perde) okunur olsun.
3. **Renk:**
   - Gerilim ölçeği, osiloskop kanal renkleri (A sarı, B mavi), hata ve uyarı renkleri ve kablo renkleri birbirinden kolayca ayrılsın (renk körlüğü dahil).
   - Koyu tema ve projeksiyon kipi için de bir öneri ver; uygulaması sonraki iş, belirteçleri şimdiden düşün.
4. **Bileşenler:** v1'deki bütün bileşenler yeni dilde: düğme, ikon düğme, araç seçici, sayı alanı, çip, seçme kutusu, sekme, rozet, LCD, mesaj satırı, toast, alt sayfa, modal, örnek kartı, cihaz ön paneli öğeleri.
5. **İkonlar:** 20 × 20 çizgi ikonlar. Yeni gereken ikonlar şunlar:
   - 3B görünüm;
   - Sığdır;
   - Üstten bakış;
   - Arduino / mikrodenetleyici;
   - Seri ekran;
   - Kod.

## 4. Yeni: Arduino Uno

- **Parça:** Kütüphanede "Entegreler" altında. Seçilen örnek program önceden derlenmiştir ve işlemcide komut komut, gerçek zamanlamayla çalışır.
- **Programlar:** Blink, Düğmeyle LED, Düğme sayacı, Trafik ışığı, Nefes alan LED (PWM), Potansiyometreyle parlaklık, Gece lambası (LDR), Termometre (NTC), PWM'den doğru gerilim, Melodi (tone), Röleyle lamba.
- **Kullanıcı kod yazamaz** (şimdilik). Program bir seçme kutusundan değiştirilir.
- **Şema sembolü:** Uzun bir kart dikdörtgeni.
  - Solda 5V, 3V3, GND ve A0–A5; sağda GND ve D13 … D2 (PWM pinlerinde `~`).
  - Ortada "ARDUINO UNO" yazısı, L (D13) ve TX LED'leri.
  - 22 pin, pinler 20 px arayla.
  - Bugünkü çizim: `src/editor/symbols.tsx` → `Arduino`.
- **İnceleme panelinde Arduino bölümü:**
  - Canlı ölçüm: USB'den çekilen akım, 5V gerilimi, kullanılan her pinin kipi (giriş / giriş (çekme) / DÜŞÜK / YÜKSEK), gerilimi ve akımı.
  - **Seri ekran:** `Serial.print` çıktısı, eş genişlikli yazı, en alta kayar, durmuşken açıklama gösterir.
  - **Kod:** Yüklü programın kodu, renklendirilmiş, salt okunur; başlıkta flash boyutu ("2246 bayt"); altında "önceden derlendi" notu.
  - Bölüm masaüstünde sağ panelde, telefon ve tablette parça sayfasında.
- **Örnekler:** "Arduino" adlı yeni bir örnek grubu (11 devre). Bilgi kartı ve metin düzeni öbür örneklerle aynı.
- **Uyarı:** "Arduino pini aşırı yükleniyor" (bir pinden 40 mA'den fazla).
- **Tasarlanacak:**
  1. Arduino'lu bir örnek çalışırken masaüstü (şema + İnceleme panelinde Arduino bölümü).
  2. Telefonda Arduino seçiliyken (canlı ölçüm, seri ekran, kod).
  3. Sembolün yeni dildeki hali.

## 5. Yeni: 3B tezgâh (Şema | 3B)

- **Ne:** Devre şemada kurulur. "Şema | 3B" düğmesiyle aynı devre bir masanın üstünde 3B görünür:
  - her parça gerçek ölçülerine yakın (1 birim = 2,54 mm), şemadaki yerinde;
  - kablolar uçlardan yukarı kıvrılan atlama kabloları: aynı ağdaki kablolar aynı renk, toprak siyah, besleme kırmızı.
- **Canlı:** Simülasyon çalışırken şunlar değişir:
  - LED'ler ve lamba ışır; motorun pervanesi döner;
  - röle modülünün LED'i yanar; hoparlör ve buzzer titrer; atan sigortanın teli kararır;
  - su haznesi dolar;
  - multimetre, güç kaynağı ve fonksiyon üretecinin ekranları değer gösterir; osiloskop ekranında izler akar;
  - Arduino'nun ON, L ve TX LED'leri yanar.
- **Etkileşim:**
  - Sürükle: döndür; sağ tık sürükle ya da iki parmak: kaydır; tekerlek ya da kıstırma: yakınlaştır.
  - Parçaya tıkla: seç (seçilinin altında mavi halka, İnceleme paneli onu gösterir).
  - Oynat'tayken anahtara tıkla: aç/kapat; potansiyometre düğmesini sürükle: çevir.
  - 3B'de parça eklenmez ve kablo çekilmez; devre şemada kurulur.
- **Bugünkü ekran öğeleri:**
  - tuvalin sol üstünde "Şema | 3B" düğmesi (telefonda sol altta);
  - sağ üstte "Sığdır" ve "Üstten" düğmeleri;
  - altta tek satırlık hareket ipucu (dar alanda gizlenir);
  - yüklenirken "3B tezgâh yükleniyor…".
- **3B için görsel karar istediğim noktalar:**
  - Masanın yüzeyi: bugün açık gri, 2,54 mm ızgaralı kesim altlığı.
  - Arka plan, ışık ve gölge tonu.
  - Kablo renk paleti ve kablo uçları.
  - Seçim gösterimi.
  - Cihaz ekranlarının (LCD) görünümü; şemadaki cihaz ön panelleriyle tutarlı olmalı.
  - Parça modellerinin malzeme dili: gerçekçi mi, biraz sadeleştirilmiş mi?
- **Ekranlar:**
  1. 3B'de Arduino Blink çalışırken.
  2. 3B'de röleli lamba örneği (pil, transistör, röle modülü, lamba).
  3. 3B'de cihazlı bir örnek (osiloskop, fonksiyon üreteci, güç kaynağı); cihaz rafı açıkken alan küçülür.
  4. Telefonda 3B (dikey), alt sayfa açıkken.
- **Bugünkü hali:** Ekran görüntüleri için siteyi aç. Bir örnek seç, tuvalin sol üstündeki "3B"ye bas.

## 6. Teslim edilecekler

v1 ile aynı biçimde, `docs/tasarim/` yerine `docs/tasarim-v2/` klasörüne:

1. **`tokens.css`:**
   - Tailwind CSS 4 `@theme` belirteçleri: renk, yazı, aralık, köşe, gölge;
   - koyu tema ve projeksiyon önerisi;
   - gerilim → renk formülü;
   - 3B için birkaç belirteç: masa, arka plan, kablo paleti, seçim rengi.
2. **`artboards/`:**
   - **Tasarım sistemi:** DS-Renk, DS-Tipo, DS-Token, DS-Bilesen, DS-Sembol (Arduino dahil), DS-Cihaz, DS-3B (3B'nin malzeme ve renk kuralları, kablo ve seçim).
   - **Masaüstü 1440 × 900:**
     - v1 ekranlarının (M01–M12) yeni dildeki halleri;
     - Arduino çalışırken (şema);
     - 3B tezgâh (yukarıdaki 3 ekran).
   - **Tablet 1180 × 820:** Arduino ve 3B ile birer ekran.
   - **Telefon 390 × 844 ve 844 × 390:** v1 telefon ekranlarının yeni halleri; Arduino seçili; 3B.
   - **Baraj sayfası:** Masaüstü ve telefon.
3. **README:** Çizim dizini ve temel kararlar (v1 README'si gibi).
4. **Metin değişiklikleri:** Önerdiğin metin değişiklikleri (eski → yeni) ayrı bir notta.

Belirsiz kaldığın noktaları tahminle doldurma: tasarımda "soru" notu olarak işaretle, uygulamada birlikte karar verelim.
