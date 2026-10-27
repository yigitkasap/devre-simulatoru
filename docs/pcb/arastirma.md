# Simülatördeki devreyi baskı devreye (PCB) dönüştürmek: araştırma (Ekim 2026)

Amaç: Devre Simülatörü'nde kurulan bir devreyi (ör. baraj uyarısı ya da bir Arduino örneği) gerçek
bir karta aktarıp üretmek, lehimlemek ve çalıştırmak. Bu belge işin fiziğini, mühendislik
kurallarını, üretim seçeneklerini ve sitemize nasıl eklenebileceğini toplar. Sayılar kaynaklardan;
hesaplar bu belgede yapıldı. Fiyat, gümrük ve üretici kuralları değişebilir: sipariş öncesi yeniden
doğrulanmalı.

---

## 0. Kısa özet

- **Baskı devre (PCB):** Cam elyaflı epoksi bir levhanın (FR-4, 1,6 mm) yüzeyindeki ince bakır
  yollardır. Breadboard'daki şeritlerin ve jumper'ların yerini bu yollar alır. Fizik aynıdır; tek
  fark, yolların kendisinin de küçük birer direnç (ve çok küçük birer bobin/kondansatör) olmasıdır.
- **Bizim devrelerimiz kolay sınıfta:** Düşük gerilim (≤ 30 V), düşük frekans (≤ 1 MHz), çoğu
  bağlantıda miliamper mertebesinde akım. 2 katmanlı, delikten geçme (THT) parçalı, elle
  lehimlenebilen bir kart yeter.
- **Bir istisna, şebeke:** 230 V'luk devreler (transformatör, adaptör örnekleri) PCB'ye
  aktarılmamalı. Şebeke tarafı için ayrı güvenlik standartları ve sertifika gerekir. Öğrenci
  kartlarında şebeke yerine hazır 12 V adaptör kullanılır.
- **Üretmenin üç yolu:**
  1. **Delikli plaket.** Breadboard düzeninde, lehimlenebilir "Perma-Proto" tipi bir kart. Tasarım
     ve sipariş gerekmez; breadboard'daki yerleşim aynen aktarılır. Türkiye'de satılıyor.
  2. **Türkiye'de PCB üretimi.** Gümrük yok, teklif almak gerekir.
  3. **Çin'de üretim (JLCPCB, PCBWay).** 5 kart ≈ 2 $ + kargo. 6 Şubat 2026'dan beri 30 €
     muafiyeti yok; AB dışından gelen posta ve hızlı kargo gönderisinde vergi ≈ %60 (ürün + kargo
     üzerinden).
- **Önerim, üç aşama:**
  - **A.** Sitemiz breadboard yerleşiminden bir delikli plaket lehim rehberi üretsin (hemen
    yapılabilir).
  - **B.** KiCad projesi olarak dışa aktarsın (parçalar, kılıflar, bağlantılar hazır; yolları KiCad
    çizer).
  - **C.** İsteğe bağlı: tarayıcıda otomatik yerleşim, yönlendirme ve doğrudan üretim dosyası
    (Gerber).

---

## 1. Baskı devre kartı nedir? (fizik)

- **Taban (substrat):** FR-4 cam elyafı ve epoksi; yalıtkan, sert, yanmaya dayanıklı. Standart
  kalınlık 1,6 mm.
- **Bakır katmanları:** Levhanın bir ya da iki yüzüne yapıştırılmış bakır folyo. Kalınlık "ons"
  ile verilir: 1 oz = 1 ft²'ye yayılmış 1 ons bakır ≈ **35 µm**. İstenmeyen bakır kimyasal olarak
  aşındırılır, geriye yollar (iz), pedler ve geniş alanlar (dolgu) kalır.
- **Delikler ve kaplamalı delik (PTH):** Delikler matkapla açılır, iç yüzeyleri bakırla kaplanır.
  Böylece iki yüzdeki bakır birbirine bağlanır. Parça bacağı geçen deliğe **pad**, yalnızca katman
  değiştiren küçük deliğe **via** denir.
- **Lehim maskesi:** Yeşil (ya da başka renk) koruyucu boya. Yolları oksitlenmeye ve lehim
  köprülerine karşı korur; yalnızca pedler açıkta kalır.
- **Serigrafi (silkscreen):** Beyaz yazılar: parça adları (R1, LED1), yön işaretleri, + ve −.
- **Yüzey kaplaması:** Pedlerin lehim tutması için ince kalay (HASL, kurşunsuz) ya da altın
  (ENIG). Elle lehimleme için kurşunsuz HASL yeter.

Breadboard ile karşılaştırma:
- Breadboard'daki bir şerit, PCB'de bir **ağın (net)** yollarıdır.
- Jumper'lar yolların kendisidir.
- Raylar genellikle geniş **besleme ve toprak yolları** ya da toprak **dolgusu** olur.

## 2. Bakır yol bir iletkendir: direnç, ısınma, genişlik

**Direnç:** R = ρ·L / (w·t). Bakır için ρ = 1,72·10⁻⁸ Ω·m, t = 35 µm (1 oz). Bir kare yolun
(L = w) direnci boyutundan bağımsızdır:

> ρ / t = 1,72·10⁻⁸ / 35·10⁻⁶ ≈ **0,49 mΩ / kare**

Örnekler (bu belgede hesaplandı):

| Yol | Kare sayısı | Direnç | 20 mA'de düşüm | 1 A'de düşüm |
|---|---:|---:|---:|---:|
| 0,25 mm × 50 mm | 200 | 0,098 Ω | 2 mV | 98 mV |
| 1 mm × 50 mm | 50 | 0,025 Ω | 0,5 mV | 25 mV |

LED, sensör ve Arduino sinyallerinde (mA mertebesi) yolun direnci önemsizdir. Motor, lamba ve röle
gibi amper mertebesindeki akımlarda yol genişliği önemlidir: hem gerilim düşer hem de yol ısınır
(P = I²R).

**Genişlik hesabı, IPC-2221:** Dış katmanda I = 0,048·ΔT^0,44·A^0,725. A kesit alanı (mil²),
ΔT izin verilen ısınma (°C). Bu belgede 1 oz bakır için hesaplanan en küçük genişlikler:

| Akım | ΔT = 10 °C | ΔT = 20 °C |
|---:|---:|---:|
| 0,1 A | 0,01 mm | 0,01 mm |
| 0,5 A | 0,12 mm | 0,08 mm |
| 1 A | 0,30 mm | 0,20 mm |
| 2 A | 0,78 mm | 0,51 mm |
| 3 A | 1,37 mm | 0,90 mm |

Uygulamadaki kural (üretici sınırlarının rahatça üstünde):
- **Sinyal yolları:** 0,25–0,3 mm.
- **Besleme ve toprak:** en az 0,5 mm.
- **Motor, lamba, röle kontağı (≥ 1 A):** 1–1,5 mm, ya da bakır dolgu.

IPC-2221 kaba ve temkinli bir yaklaşımdır. Yüksek akımda daha ayrıntılı standart IPC-2152 kullanılır.

## 3. Yalıtım aralığı ve güvenlik

- **Düşük gerilim (≤ 50 V):** Yollar arasında 0,15–0,2 mm bile yeter. Üreticinin en küçük aralığı
  (JLCPCB 2 katmanda 0,127 mm) bunun altındadır. Pratikte 0,25 mm bırakılır.
- **Şebeke (230 V):**
  - 230 V'un tepe değeri ≈ 325 V'tur.
  - IPC-2221 tablosu yalnızca işlevsel aralık verir, güvenlik yalıtımı için yetmez.
  - Şebeke yalıtımında aralık ve yüzey kaçağı mesafesi (creepage) IEC 60664-1 ve ürün standardına
    (ör. IEC 62368-1) göre belirlenir; birkaç milimetre olur ve sertifika gerekir.
  - **Karar önerisi:** Transformatörlü ve adaptörlü örneklerimiz PCB'ye aktarılmasın. Kart, hazır
    bir 12 V adaptörün ya da pilin çıkışından başlasın.
- **Lehimleme güvenliği:** Havalandırma (flux dumanı), kurşunsuz lehim ya da kurşunlu lehimden
  sonra el yıkama, göz koruması, havyanın sıcak ucu.

## 4. İyi tasarım kuralları (simülatörün göstermedikleri)

Simülatör ideal bağlantılarla çalışır. Gerçek kartta şu kurallar devrenin aynı davranmasını
sağlar:

1. **Dekuplaj kondansatörleri:** Her entegrenin (555, 741, ATmega328P) besleme ucu ile toprak
   arasına, mümkün olduğunca yakına 100 nF seramik kondansatör konur. Entegre anahtarlarken
   çektiği ani akımı yerelden karşılar. 555 bunu en çok ister, çünkü çıkışı keskin geçer.
   Simülatörde bu kondansatörler yok, karta eklenir.
2. **Toprak:** Toprak yolu kalın tutulur ya da bir yüzün tamamı toprak dolgusu yapılır.
   Yükselteç örneklerinde (BJT, MOSFET, op-amp) giriş toprağı ile yük toprağı tek noktada birleşir
   (yıldız toprak). Böylece büyük akımın toprak yolundaki düşümü girişe karışmaz.
3. **Kısa bağlantılar:**
   - Yüksek empedanslı düğümler (op-amp girişi, BJT bazı, 2,2 MΩ'luk kutuplama) kısa tutulur.
     Uzun yol anten gibi parazit toplar.
   - 1 MHz'te 2 cm'lik yolun endüktansı ve kapasitesi önemsizdir, ama yükseltecin girişinde
     gürültü olarak görünebilir.
4. **Bobinli yükler:** Röle sargısında ve motorda **ters paralel serbest geçiş diyodu** şarttır
   (örneklerimizde var). Diyot sargıya mümkün olduğunca yakın konur.
5. **Isınan parçalar:** Güç sınırına yakın çalışan dirençler (simülatör uyarır) karttan biraz
   yüksekte lehimlenir ya da daha büyük güçlü direnç seçilir. Lamba ve motor kartın kenarına,
   vidalı klemensle bağlanır.
6. **Bağlantılar dış dünyaya:** Pil, adaptör, motor ve hoparlör için vidalı klemens ya da pin
   başlık kullanılır. Kutup işareti (+/−) serigrafiye yazılır.
7. **Test noktaları:** Osiloskop ve multimetreyle ölçülecek düğümler (ör. 555'in kondansatörü,
   yükselteç çıkışı) için açık bir pad ya da pin bırakılır. Föydeki ölçümler kartta da yapılabilir.

## 5. Parçalarımızın gerçek kılıfları (delikten geçme, elle lehimlenebilir)

| Simülatörde | Kılıf (KiCad kitaplık adı örneği) | Bacak aralığı |
|---|---|---|
| Direnç 1/4 W | Eksenel DIN0207, yatık (`R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal`) | 10,16 mm |
| Diyot 1N4001 | DO-41, yatık | 10,16 mm |
| Zener | DO-35, yatık | 7,62 mm |
| LED 5 mm | `LED_D5.0mm` | 2,54 mm |
| Elektrolitik kondansatör | Radyal, Ø5–Ø10 mm | 2,0–5,0 mm |
| Seramik/film kondansatör | Disk, radyal | 2,54–5,08 mm |
| BC547/BC557, 2N7000, 2N5457 | TO-92 sıralı | 1,27 ya da 2,54 mm |
| LM741, NE555 | DIP-8 (+ soket önerilir) | 2,54 mm, sıralar 7,62 mm |
| Potansiyometre PTV09 | Dikey trimpot, 3 bacak | 2,5 mm |
| LDR, NTC | 2 bacak, radyal | 2,54–5 mm |
| Buzzer, hoparlör | Radyal / tellerle klemense | — |
| Röle Omron G2R-1 | Kendi kılıfı | — |
| Pil, adaptör, motor, lamba | 2'li vidalı klemens (5,08 mm) | 5,08 mm |

Tamamı delikten geçme (THT): öğrenciler havyayla rahat lehimler. Yüzey montajlı (SMD) parçalar
daha küçük ve ucuzdur ama elle lehimlemesi zordur; ilk kartlar için gerekmez.

## 6. Tasarım akışı (endüstride)

1. **Şema:** Bizde hazır (simülatör).
2. **Ağ listesi (netlist):** Hangi pin hangi pine bağlı. Bizde hazır (simülatörün çözücüsü
   kullanıyor).
3. **Kılıf ataması:** Her parça için yukarıdaki tablodaki gibi fiziksel kılıf.
4. **Kart boyutu ve yerleşim:** Parçalar kartın üstüne dizilir. Konnektörler kenara, ısınan
   parçalar ferah yere, dekuplaj kondansatörü entegrenin dibine.
5. **Yönlendirme (routing):** Ağların bakır yollarla çizilmesi; 2 katmanda yollar via ile yüz
   değiştirir. Elle ya da otomatik (Freerouting gibi).
6. **Tasarım kuralı denetimi (DRC):** En küçük yol, aralık ve delik üreticinin sınırlarına uyuyor
   mu; bağlanmamış ağ kaldı mı.
7. **Üretim dosyaları:** Gerber, delik dosyası, malzeme listesi (aşağıda).
8. **Sipariş, üretim (1–2 hafta), montaj (lehim), test.**

Araçlar:
- **KiCad:** Ücretsiz, açık kaynak; Türkiye'de üniversitelerde yaygın.
- **EasyEDA:** Tarayıcıda; JLCPCB'nin aracı.
- **Fritzing:** Breadboard → şema → PCB görünümleri. Bizim yaptığımıza en çok benzeyen araç; GPL,
  kodu kopyalanmaz.

## 7. Üreticiye giden dosyalar

- **Gerber (RS-274X; yeni sürümü Gerber X2, Ucamco'nun standardı), katman başına bir dosya:**
  - üst bakır, alt bakır;
  - üst ve alt lehim maskesi;
  - üst serigrafi;
  - kart kenarı (Edge.Cuts).
  - X2, her dosyanın hangi katman olduğunu içine yazar; X1 okuyan üretici de açabilir.
- **Delik dosyası:** Excellon (NC drill). Kaplamalı (PTH) ve kaplamasız (NPTH, montaj delikleri)
  delikler ayrı. Gerber X2 bunun yerini çoğu üreticide tutmaz.
- **Malzeme listesi (BOM):** Parça adları, değerleri, kılıfları, adetleri. Kendi lehimleyeceksen
  alışveriş listesi olur.
- **Dizgi dosyası (CPL, pick-and-place):** Yalnızca üretici parçaları da takacaksa (PCBA).

Bunların hepsi bir zip olarak yüklenir.

## 8. Üretim seçenekleri, maliyet ve gümrük (Ekim 2026)

### 8.1 Delikli plaket (tasarım yok, sipariş yok)
- Adafruit **Perma-Proto** kartları breadboard'un delik düzeniyle birebir aynıdır: aynı 5'li
  şeritler, aynı raylar, aynı numaralar. Breadboard'da çalışan devre aynı deliklere lehimlenir.
- Yarım boyu, sitemizin 3B'de kullandığı 30 sütunlu yarım boy breadboard'a karşılık gelir.
- Türkiye'de direnc.net'te listeli (stok durumu sayfadan bakılmalı).
- Genel amaçlı çift yüzlü delikli plaketler de var; örneğin 5×7 cm ≈ 20 TL + KDV. Bunlarda
  bağlantılar tel ve lehim köprüsüyle yapılır.
- **Artısı:** Hemen yapılır, ucuz, öğretici. **Eksisi:** Görüntüsü "üretilmiş kart" gibi değildir,
  büyük devrede yer kaplar.

### 8.2 Türkiye'de üretim
- Prototip yapan firmalar:
  - Aşık Elektronik: tek ve çift katman prototip, dizgi;
  - İzmir PCB;
  - Odak PCB (İstanbul, büyük üretici).
- Gümrük yok. Fiyat ve süre için teklif gerekir; aramada fiyat listesi çıkmadı.
- Okul ve proje için fatura kesilebilmesi ayrıca bir artı.

### 8.3 Çin'den (JLCPCB, PCBWay)
- **Fiyat:** 2 katmanlı, ≤ 100×100 mm, 5 adet ≈ 2 $.
  - Ekonomik kargo ("Global Standard Direct") ≈ 5–9 $, 1–2 hafta.
  - DHL ≈ 17 $ ve üstü, 3–5 gün.
- **Üretici sınırları (JLCPCB, 1–2 katman):** en küçük yol ve aralık 0,127 mm (5 mil), en küçük via
  deliği 0,3 mm. Bizim 0,25 mm / 0,25 mm kurallarımız rahatça içinde.
- **Gümrük (2026):**
  - 7 Ocak 2026 tarihli Resmî Gazete'de yayımlanan 10813 sayılı Cumhurbaşkanı Kararı ile posta ve
    hızlı kargodaki 30 € muafiyeti kaldırıldı; 6 Şubat 2026'da yürürlüğe girdi.
  - 1500 € ve 30 kg'ın altındaki gönderide basitleştirilmiş usulle vergi: AB'den %30, AB dışından
    (Çin) **%60**. Matrah ürün + kargo.
  - **Örnek hesap:** 2 $ kart + 8 $ kargo = 10 $ ≈ 9 €, vergisi ≈ 5,5 €. Toplam ≈ 15 €.
  - **Risk:** Forumlarda gönderisi ticari ithalat sayılıp müşavirlik ve depolama masrafı çıkan
    kullanıcılar var (bir kullanıcı 43 $'lık sipariş için 370 $ ödediğini yazıyor).
  - Bazı kargo seçenekleri vergiyi sipariş anında alıp kapıya teslim ediyor; bu, ödeme sayfasında
    görülmeli.
  - Kaynaklar birbirini tam tutmuyor: sipariş öncesi Ticaret Bakanlığı'nın güncel duyurusuna
    bakılmalı.

## 9. Montaj (lehimleme) ve test

- **Aletler:**
  - ayarlı havya (≈ 60 W, 320–350 °C), ince uç;
  - lehim teli (kurşunsuz Sn99Cu ya da Sn60Pb40) ve flux;
  - lehim emme teli, yan keski, üçüncü el, multimetre.
- **Sıra:** Önce alçak parçalar (dirençler, diyotlar), sonra soketler ve kondansatörler, en son
  yüksek parçalar ve konnektörler. Entegreler sokete takılır (lehim ısısı ve değiştirilebilirlik
  için).
- **İlk açılış:** Takmadan önce besleme ile toprak arasında kısa devre olmadığı multimetreyle
  denetlenir. Akım sınırlı güç kaynağıyla (ör. 50 mA sınır) açılır. Simülatördeki değerlerle
  karşılaştırılır: kollektör gerilimi, LED akımı, 555 frekansı.

## 10. Arduino'lu devreler

İki yol var:

1. **Shield (kalkan):** Uno'nun üstüne takılan kart. 68,58 × 53,34 mm. Başlıklar 2,54 mm adımlı;
   dijital başlıkların arasındaki 0,16"lik (4,06 mm) kaymış boşluk ünlüdür ve resmî çizimden
   alınmalıdır. Arduino kartı aynen kalır, programlama USB'den yapılır. **Başlangıç için önerim
   bu.**
2. **Tek başına ATmega328P:** Kartın üstünde Arduino'nun kendisi kurulur.
   - 28 bacaklı DIP soketi;
   - 16 MHz kristal ve iki 22 pF kondansatör;
   - RESET'e 10 kΩ çekme direnci;
   - VCC, AVCC ve AREF'e 100 nF;
   - 5 V besleme.
   - Program, önyükleyicili hazır yongayla ya da "Arduino as ISP" ile yüklenir; seri port için
     ayrı bir USB-seri dönüştürücü gerekir.
   - Ucuzdur, kalıcı projeye uygundur, ama bir kademe daha zordur.

## 11. Sitemize nasıl eklenir? (öneri, üç aşama)

| Aşama | Ne yapar | Zorluk | Kullanıcının işi |
|---|---|---|---|
| **A. Lehim rehberi** | 3B breadboard yerleşiminden "Perma-Proto / delikli plaket" rehberi: her parçanın ve jumper'ın deliği (ör. "R1: 3c → 7c"), malzeme listesi, adım adım görsel, yazdırılabilir sayfa | Küçük: yerleşim zaten hazır | Kartı al, lehimle |
| **B. KiCad'e aktar** | Devreden bir KiCad projesi: parçalar ve kılıflar, ağ listesi, kart kenarı, parçalar yerleştirilmiş ve bağlantılar çizgiyle gösterilmiş (ratsnest). Kullanıcı KiCad'de yolları çizer (ya da Freerouting'le otomatik), DRC, Gerber | Orta: dosya biçimini üretmek; kılıf eşlemesi; yerleşim | KiCad'i kurmak, yönlendirme |
| **C. Tarayıcıda Gerber** | Otomatik yerleşim ve 2 katmanlı otomatik yönlendirme (küçük THT devreler için ızgara tabanlı arama), tasarım kuralı denetimi, Gerber X2 + Excellon + BOM zip'i | Büyük: yönlendirme algoritması ve doğrulaması | Zip'i üreticiye yüklemek |

Notlar:
- Breadboard yerleşimimizde "her ağ tek düğümde" denetimi zaten var. Aynı test PCB yerleşimine ve
  yönlendirmesine de uygulanabilir: yönlendirilmiş kartın ağ listesi şemanınkiyle aynı mı.
- KiCad ve Freerouting GPL lisanslıdır; kodları alınmaz. KiCad'in dosya biçimini (S-ifadeleri)
  üretmek ve kılıflara kitaplık adlarıyla başvurmak serbesttir. Resmî biçim belgesi henüz tam
  değil; KiCad'in kaynak kodu ve açık kitaplıklar (kiutils) başvuru olarak kullanılır.
- Şebekeli örnekler (transformatör, adaptör) dışa aktarmada uyarıyla engellenir.
- Simülatörde olmayan ama kartta gereken parçalar (dekuplaj kondansatörleri, konnektörler, montaj
  delikleri) dışa aktarırken otomatik eklenir ve kullanıcıya gösterilir.

## 12. Karar gereken sorular

1. İlk hedef hangisi: delikli plaket rehberi (A), KiCad'e aktarma (B), yoksa doğrudan üretim
   dosyası (C)?
2. İlk kart hangi devre olsun? Adaylar:
   - baraj uyarısı (9 V pil, 3 transistör, LED'ler; okulda gösterilebilir);
   - bir Arduino örneği (shield);
   - föyden bir deney (yükselteç).
3. Üretim nereden: Türkiye'den teklif mi (gümrük yok, faturalı), JLCPCB mi (ucuz, gümrük riski)?
4. Lehimlemeyi kim yapacak? Öğrenciler mi, üretici mi (PCBA)? THT parçalarla öğrenciler yapabilir.

## Kaynaklar

- JLCPCB üretim sınırları: https://jlcpcb.com/capabilities/PCB-capabilities
- JLCPCB maliyet ve kargo deneyimleri: https://highway.hackclub.com/guides/JLC-cost-optimizing ; https://zbotic.in/how-to-order-pcb-from-jlcpcb-and-pcbway-india-cost-guide/
- IPC-2221 iz genişliği: https://www.nextpcb.com/blog/pcb-trace-width-calculator-ipc-2221-guide ; https://pcbsync.com/?p=34352 ; https://www.wevolver.com/article/trace-width-vs-current-in-pcb-design
- Yalıtım aralığı ve şebeke: https://resources.altium.com/p/using-an-ipc-2221-calculator-for-high-voltage-design ; https://atlaspcb.com/blog/pcb-creepage-clearance-ipc-2221b-high-voltage-spacing ; https://incompliancemag.com/circuit-spacings-determining-product-safety-requirements/
- Gerber ve delik dosyaları: https://en.wikipedia.org/wiki/Gerber_format ; https://www.eurocircuits.com/blog/extended-gerber-extended-gerber-x2 ; https://hubble.com/community/guides/gerber-files-and-drill-files-explained-what-your-fab-house-actually-needs/
- KiCad dosya biçimleri: https://kicad.org/help/file-formats/ ; https://pypi.org/project/kiutils/1.1.3
- Freerouting: https://github.com/freerouting/freerouting/ ; https://forum.kicad.info/t/autorouting-autorouter/30875
- Perma-Proto: https://www.pololu.com/blog/386/new-products-perma-proto-breadboard-pcbs-from-adafruit ; https://github.com/adafruit/Adafruit-Perma-Proto-PCB ; https://www.direnc.net/perma-proto-half-sized-breadboard-pcb-single-adafruit-en ; https://www.direnc.net/5x7-epoxy-cift-tarafli-prototip-pcb
- Gümrük 2026: https://webrazzi.com/2026/01/07/yurt-disi-alisverislerde-gumruk-muafiyeti-kaldirildi-30-euro-limiti-tarihe-karisti/ ; https://www.lires.com.tr/post/posta-ve-h%C4%B1zl%C4%B1-kargo-muafiyeti-rehberi-2026 ; https://ticaret.gov.tr/gumruk-islemleri/sikca-sorulan-sorular/bireysel/posta-ve-hizli-kargo-muafiyeti
- JLCPCB ve gümrük deneyimleri (forum): https://mekatronik.org/forum/threads/jlc-pcb-yeni-siparis.6914/ ; https://prototippcb.com.tr/380/jlcpcb-pcbwayden-sipari%C5%9Fleri-t%C3%BCrkiyede-g%C3%BCmr%C3%BCk-i%CC%87%C5%9Flemleri-yap%C4%B1l%C4%B1r
- Türkiye'deki üreticiler: https://ensun.io/search/printed-circuit-board-pcb/turkey ; https://www.bestpcbs.com/blog/2025/12/top-10-pcb-turkey-manufacturer/
- Arduino shield ölçüleri: https://docs.arduino.cc/tutorials/uno-r4-minima/shield-guide ; https://forum.kicad.info/t/arduino-uno-r3-female-pin-headers-spacing/12551
- Tek başına ATmega328P: https://docs.arduino.cc/built-in-examples/arduino-isp/ArduinoToBreadboard/ ; https://gammon.com.au/forum/?id=11109
