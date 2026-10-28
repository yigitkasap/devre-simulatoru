# Devre Simülatörü

Fizik bölümü öğrencileri için tarayıcıda çalışan, şematik görünümlü, Türkçe bir devre kurma ve
simülasyon aracı. Arayüz ve çalışma mantığı derslerde kullanılan şematik simülatörlerden ilham
alır; görseller, adlar ve kod bu projeye özgüdür. Sunucu ya da veritabanı yoktur: `npm run build`
çıktısı (`dist/`) herhangi bir statik hostinge yüklenebilir.

**Yayındaki adres:** <https://yigitkasap.github.io/devre-simulatoru/>

> Sitenin adı tek bir yerde tanımlıdır: [`src/config.ts`](src/config.ts).

## Özellikler

- **Parçalar:** pil (iç dirençli), AC kaynak (sinüs/kare/üçgen), toprak, direnç (güç sınırlı),
  kondansatör (elektrolitik ya da seramik/film), bobin (sargı direnci ve sargı kapasitesiyle; akımı
  kesilince Lenz uyarısı), transformatör (karşılıklı indüktans, galvanik yalıtım), diyot, zener diyot, LED (kırmızı/sarı/yeşil/mavi), NPN ve PNP transistör, N ve P kanallı JFET,
  N ve P kanallı MOSFET, anahtar, röle (elektromıknatıs, çekme/bırakma histerezisi), DC motor
  (zıt EMK, yük torku, jeneratör olarak çalışma), potansiyometre (kaydırıcıyla canlı), LDR, NTC
  termistör (öz ısınmalı), akkor lamba (filaman ısınması, ilk an akımı, aşırı gerilimde kopma),
  hoparlör ve aktif buzzer (sesi tarayıcıda gerçekten çalınır), sigorta (I²t ile atar), işlemsel
  yükselteç (741: kazanç-bant genişliği, eğim hızı, beslemeye bağlı doyum), 555 zamanlayıcı, voltmetre, ampermetre (DC/AC kipi), su haznesi (dört problu
  seviye sensörü; elle ya da Doldur/Boşalt ile). Diyot, NPN, N kanallı JFET
  ve N kanallı MOSFET'te föydeki parçaların modelleri (1N4001, BC107, BF245A, IRF510; eklem
  kapasiteleri ve ters toparlanma dahil) ya da eski basit modeller seçilir.
- **Arduino Uno:** ATmega328P işlemcisi avr8js ile komut komut, gerçek zamanlamayla çalışır;
  11 örnek program önceden derlenir (Blink, düğme, sayaç, trafik ışığı, PWM, potansiyometre, LDR,
  NTC termometre, PWM süzgeci, melodi, röle). Pinler devreye gerçek elektriksel modelle bağlıdır
  (25 Ω çıkış, 35 kΩ çekme, Schmitt eşikleri, 10 bit ADC); Seri ekran ve kod İnceleme panelinde.
- **3B tezgâh:** "Şema | 3B" ile aynı devre bir masada, parçalar breadboard'a takılı (yerleşim
  şemadan otomatik: şeritler, raylar, jumper'lar); bütün parçaların ve Arduino'nun gerçek
  ölçülere yakın 3B modelleri, ağ renkli atlama kabloları; LED, lamba, motor, cihaz ekranları ve
  osiloskop izleri simülasyonla canlı; anahtar ve potansiyometre 3B'de de kullanılır.
- **Laboratuvar cihazları:** fonksiyon üreteci (GFG-8015G benzeri: 0,2 Hz – 2 MHz, 50 Ω, offset,
  simetri, −20 dB, TTL çıkışı), iki çıkışlı akım sınırlamalı DC güç kaynağı (CV/CC), iki kanallı
  osiloskop. Üretecin ve osiloskobun COM ucu laboratuvardaki gibi şebeke toprağına bağlıdır.
- **Şematik editör:** ızgaralı tuval, sürükle-bırak ya da seç-tıkla yerleştirme, uçtan uca kablo,
  T bağlantısı, taşıma (kablolar esner), döndürme, seçim kutusu, geri alma/yineleme, sağda İnceleme
  paneli (canlı ölçüm, "Neden bu değer?" notu, SI önekli değer girişi), zigzag ya da kutu (IEC)
  direnç sembolü.
- **Arayüz:** masaüstü (kütüphane, tuval, cihaz rafı, İnceleme paneli), tablet (araç şeridi,
  dokunmatik panel) ve telefon (Kur / Bağla / Ölç kipleri, alt çubuk ve tek alt sayfa; yatayda yan
  panel). Yazı tipi IBM Plex Sans ve Mono (projeyle birlikte gelir, OFL).
- **İlk açılış ve yardım:** hoş geldin penceresi, 4 adımlı kısa tur, Yardım penceresi (klavye
  kısayolları, fare ve dokunma, simgeler ve renkler, laboratuvar ipuçları).
- **Simülasyon:** Oynat / Duraklat / Durdur, ×10⁻⁶ … ×1 hız (MHz'lik sinyaller için), çalışırken
  değer değiştirme ve anahtara tıklama. Kondansatör ve eklem yükleri ikinci dereceden (yamuk
  kuralı) ve yerel kesme hatası denetimli, uyarlanır zaman adımıyla çözülür; kare dalga kenarları
  adımın tam üstüne denk gelir.
- **Eğitsel görünüm:** akım noktaları (geleneksel akım ya da elektron akışı), gerilime göre kablo
  rengi (klasik ya da renk körlüğüne uygun ölçek), düğüm gerilimi etiketleri, LED parlaklığı ve
  yanması, kondansatör dolma çubuğu, ölçü aleti ekranları, İnceleme panelinde canlı V/I/P ve Ohm
  yasası notu, hata ve uyarı rozetleri, toprak isteğe bağlı (toprak yokken sıfır noktasında
  "0 V" işareti), toprak noktaları arasında kesikli "toprak hattı" (üstünde akım noktaları) ve
  akım bu hattan dönünce mesaj, toprak tuzağı uyarısı, yanan LED için önerilen ön direnç, veri
  sayfası sınırları (LED ve 1N4001'in ters gerilimi, direncin güç sınırı ve ısınması, elektrolitik
  kondansatörün ters gerilimi).
- **Manyetik alan:** Ayarlar'da "Manyetik alanı göster" açıkken kabloların çevresinde ⊙/⊗ (sağ el
  kuralı, yoğunluk akımla artar), bobin ve röle sargısında alan çizgileri ve N/S kutupları,
  transformatörün çekirdeğinde akı okları.
- **Klavye ve erişilebilirlik:** "Tuvale atla" bağlantısı, tuvalde oklarla parçadan parçaya geçiş,
  kısayollar, görünür odak, ekran okuyucu için parça listesi ve seyreltilmiş canlı duyurular.
- **Osiloskop:** iki kanal (A, B) ortak uca göre; DC/AC/GND kuplaj, A ve B, ADD (A + B; INV ile
  A − B) ve X-Y kipi, B'yi ters çevirme (INV), gerçek giriş (1 MΩ ‖ 25 pF) ya da ideal giriş,
  volt/bölme, zaman/bölme (0,1 µs … 1 s), kanal konumu, otomatik tetikleme, "Oto" ayar (hızı da
  ayarlar); ekranın altında tepe-tepe, etkin değer ve frekans.
- **Örnekler:** üst çubuktaki "Örnekler" penceresinde 16 grupta 51 hazır devre: temel devreler,
  laboratuvar cihazları (köprüde toprak tuzağı), elektromanyetizma (transformatör, röle, DC motor),
  ayarlı parçalar ve sensörler (potansiyometre, LDR, NTC, akkor lamba), ses ve koruma (hoparlör,
  buzzer, sigorta), entegreler (işlemsel yükselteç, 555), Elektronik Laboratuvarı föyünün dokuz deneyi
  (diyot karakteristikleri, doğrultucular, kenetleyici ve katlayıcı, kırpıcılar, FET
  karakteristikleri, JFET/BJT/MOSFET yükselteçleri, transistörün anahtar olarak kullanılması) ve
  baraj su seviyesi uyarısı projesi. Her birinin yanında devrenin ne işe yaradığı (dayandığı fizik
  yasası ve simülasyonda görülen sayılarla) ve günlük hayatta nerede kullanıldığı anlatılır.
- **Baraj sayfası:** <https://yigitkasap.github.io/devre-simulatoru/baraj/>: transistörlerle su
  seviyesi uyarısı (su yükseldikçe yeşil → sarı → kırmızı), derste projeksiyonla kullanılacak düzen:
  numaralı problar ve ışık kulesi, canlı Durum tablosu (prob → transistör → LED), seviye bantlı şema,
  tek kumanda (Su akışı, Kuru / Seviye 1–3), Soru, klavye ve sunum kumandası; çubuk gösterge
  (3 transistör) ya da tek ışık (5 transistör).
- **Kaydetme ve paylaşma:** tarayıcıya otomatik kayıt, JSON dışa/içe aktarma, paylaşım bağlantısı.

## Kurulum ve komutlar

Node.js 22.12 ya da üstü gerekir.

```bash
npm install        # bağımlılıkları kur
npm run dev        # geliştirme sunucusu: http://localhost:4321/devre-simulatoru/
npm test           # testler (Vitest): çözücü, birimler, model, örnekler, ngspice karşılaştırması
npm run test:spice # yalnızca ngspice ile çapraz doğrulama (tests/spice; aşağıya bak)
npm run build      # tür denetimi (astro check) + statik derleme → dist/
npm run preview    # derlenmiş siteyi yerelde aç: http://localhost:4321/devre-simulatoru/
npm run ios-kontrol  # iOS/dokunmatik kontrol listesi (dev sunucusu açıkken; aşağıya bak)
npm run arduino:derle  # Arduino örnek kodlarını derle (src/arduino/sketches → *.gen.ts; aşağıya bak)
npm run tarama:performans:motor  # performans taraması (Node): örnek başına hesap süresi
npm run tarama:performans:site -- <adres>  # performans ve hata taraması (tarayıcı) + rapor
```

Adresteki `/devre-simulatoru/`, GitHub Pages için ayarlanan `base` değeridir (aşağıya bak).

**ngspice (yalnızca testler):** `npm run test:spice` aynı devreleri bizim çözücümüzle ve ngspice
ile çözüp karşılaştırır. ngspice, `npm install` ile gelen `eecircuit-engine` geliştirme
bağımlılığıdır (ngspice'ın WebAssembly derlemesi, MIT; sürüm 1.8.0'a sabit): ayrıca bir şey
kurmak gerekmez, siteye girmez. Paket kurulu değilse karşılaştırmalar atlanır (`describe.skip`)
ve nedeni test çıktısında yazar; öbür testler etkilenmez. `SPICE_RAPOR=dosya.txt npm run
test:spice` her karşılaştırmayı dosyaya yazar.

## Yayın

### GitHub Pages (şu anki yayın)

Site, `main` dalına her push'ta [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) ile
derlenip yayımlanır. İş akışı Astro'nun resmî GitHub Pages rehberindekidir: `withastro/action`
bağımlılıkları `package-lock.json`'dan kurar (`npm ci`), `npm run build` çalıştırır (tür denetimi
dahil) ve `dist/`'i GitHub Pages'e yükler. Depo ayarlarında **Settings → Pages → Source: GitHub
Actions** seçilidir. Yayının durumu deponun **Actions** sekmesinden izlenir; iş akışı elle de
(**Run workflow**) çalıştırılabilir.

Adres `https://<kullanıcı>.github.io/<depo>/` biçiminde olduğu için `astro.config.mjs` içinde
`site: 'https://yigitkasap.github.io'` ve `base: '/devre-simulatoru'` ayarlıdır. Depo adı değişirse
`base` da değişmelidir.

### Hostinger ya da başka bir statik hosting

Site tamamen statiktir; PHP, veritabanı ya da Node.js sunucusu gerekmez. Bir alan adının **kök
dizinine** yüklemek için önce `astro.config.mjs` içindeki `base` satırını sil ve `site` değerini
alan adınla değiştir (ör. `site: 'https://alanadi.com'`). Bir **alt klasöre** (ör.
`alanadi.com/devre/`) yüklemek için `base: '/devre'` yaz ve `dist` içeriğini `public_html/devre/`
altına çıkart. Sayfadaki tüm yollar ve paylaşım bağlantıları `base`'e göre kurulur.

1. **Derle:** `npm run build`. Sonuç `dist/` klasöründedir: `index.html`, `favicon.svg` ve
   `_astro/` (JavaScript ve CSS dosyaları).
2. **Paketle:** `dist` klasörünün **içindekileri** (klasörün kendisini değil) zip'le. PowerShell'de:

   ```powershell
   Compress-Archive -Path dist\* -DestinationPath devre-simulatoru.zip -Force
   ```

3. **hPanel → Web Siteleri → Yönet → Dosyalar → Dosya Yöneticisi** ile `public_html` klasörünü aç.
   Hostinger'ın yeni sitelerde koyduğu `default.php` dosyası varsa sil.
4. Zip dosyasını `public_html` içine yükle, sağ tıklayıp **Çıkart (Extract)** de ve zip'i sil.
   `index.html` doğrudan `public_html` altında olmalı (`public_html/dist/index.html` değil).
5. Alan adını tarayıcıda aç. SSL kapalıysa **hPanel → Güvenlik → SSL** bölümünden aç; paylaşım
   bağlantısını panoya kopyalama düğmesi tarayıcıda yalnızca HTTPS'te çalışır.
6. **Güncelleme:** Adımları tekrarla. Eski `_astro/` dosyaları zararsızdır ama yer kaplamasın diye
   yüklemeden önce `public_html` içindeki eski `index.html`, `favicon.svg` ve `_astro/` silinebilir.

## Kullanım

Tam liste uygulamada **Yardım** penceresinde (`?`).

| İşlem | Masaüstü |
|---|---|
| Parça ekle | Kütüphaneden sürükleyip bırak ya da seçip tuvale tıkla (Shift + tıkla: art arda); klavyede listede oklar, Enter: tuvalin ortasına |
| Kablo çek | Bir parçanın ucuna tıkla, ara tıklamalar köşe olur, bir uca ya da kabloya tıklayarak bitir; çift tık: boşta bitir |
| Kablo aracı | W (boş noktadan ya da bir kablonun üzerinden başlatmak için) |
| Döndür / ters çevir | R: 90° döndürür, kablolar uçları izler · F: yönlü parçanın uçlarını yer değiştirir |
| Sil | Delete / Backspace |
| Geri al / yinele | Ctrl+Z / Ctrl+Y (ya da Ctrl+Shift+Z); örnek, yeni devre, içe aktarma ve silme bildirimlerinde Geri al düğmesi |
| Özellikler | Parçayı seç: sağdaki İncele sekmesi; çift tık ya da Enter: ilk değer alanı |
| Tuvalde gezinme | "Tuvale atla" (ilk Tab), oklar: en yakın parça, Shift + ok: kaydır, Esc: panelden tuvale dön |
| Görünüm | Tekerlek ya da + / −, Shift+1: sığdır, Boşluk + sürükle ya da orta tuş: kaydır |
| Tam ekran | Üst çubukta yakınlığın yanındaki düğme: tarayıcı tam ekranı, yalnızca devre şeması; sol ve sağ panel çubuğun iki ucundaki düğmelerle açılır; Esc ya da aynı düğme: çık |
| Simülasyon | Oynat / Duraklat / Durdur (P: oynat/duraklat); çalışırken anahtara tıklayınca açılır/kapanır |
| Panel | Alt+1 … 3: İncele, Örnek, Mesajlar |
| Örnekler | Üst çubuktaki "Örnekler" düğmesi |

| Telefon | |
|---|---|
| Kur kipi | Alttaki **Parça** ile ekle (seçili parçanın boş ucuna "zincirle ekle"); parçaya dokun: seç, alt çubuk Değer / Döndür / Çevir / Sil olur; parçayı 150 ms basılı tutup sürükle: taşı; basılı tut: menü ve büyüteç |
| Bağla kipi | **Bağla** ya da bir uca dokun; uçlar 44 pt etiketli hedeflere dönüşür; iki uca dokun: kablo; kablonun ortası: T bağlantısı; Bitti ya da boşluğa çift dokunuş: çık |
| Ölç kipi | Oynat'tan sonra yapı kilitli: dokun: ölçümler alttaki sayfada, sürükle: kaydır, anahtara dokun: aç/kapat, −/+ ile değer canlı değişir; Cihazlar: osiloskop, üreteç, güç kaynağı |
| Kalabalık yer | "Burada N öğe var" seçicisi ve büyüteç |
| Tablet | Soldaki şeritte Parça (tuvalin üstünde kart) ve Bağla; tuvalde telefonla aynı kipler; cihazlar İnceleme panelinin Cihazlar sekmesinde |

## Dosya biçimi ve paylaşım bağlantısı

Dışa aktarılan JSON (sürüm 1). Koordinatlar ızgara birimindedir (1 birim = 10 piksel);
noktalar `[x, y]` dizisidir. Değerler SI temel birimlerindedir (Ω, V, F).

```json
{
  "version": 1,
  "parts": [
    { "id": "p1", "type": "battery", "label": "B1", "x": 0, "y": 0, "rotation": 90,
      "props": { "voltage": 9, "internalResistance": 1 } },
    { "id": "p2", "type": "resistor", "label": "R1", "x": 8, "y": -8, "rotation": 0,
      "props": { "resistance": 1000 } }
  ],
  "wires": [{ "id": "w1", "points": [[0, -4], [0, -8], [4, -8]] }]
}
```

Paylaşım bağlantısı bu JSON'un `lz-string` ile sıkıştırılmış halini adresin `#d=` kısmına yazar.
`#` sonrası tarayıcıdan sunucuya gönderilmez; devre yalnızca bağlantının kendisindedir. Bağlantı
açılınca devre yüklenir ve adresten `#d=` kaldırılır (yenileyince kullanıcının kendi devresi
otomatik kayıttan gelir).

## Mimari

```
src/
  config.ts          site adı ve açıklaması (tek yer)
  sim/               saf TypeScript çözüm motoru (React'ten bağımsız)
    netlist.ts       çözücünün girdisi: bileşenler, pinlerin ağları, kablo bağlantıları
    compile.ts       union-find ile düğüm numaralama, iç düğümler, akım bilinmeyenleri
    topology.ts      toprak, boşta uç, direnç içermeyen döngü, kopuk parça, paralel ampermetre
    mna.ts           MNA sistemi (A·x = z) ve stamp yardımcıları
    lu.ts            kısmi pivotlamalı yoğun LU ayrıştırması
    engine.ts        zaman adımı, Newton-Raphson, LU önbelleği, LED yanması, kısa devre
    units.ts         SI önekli değer ayrıştırma ve Türkçe sayı biçimi
    devices/         her bileşenin stamp ve durum kodu ayrı dosyada
  model/             şema belgesi (React'ten bağımsız)
    types.ts         belge, parça, kablo (sürüm 1)
    catalog.ts       parça kataloğu: pinler, kapladığı alan, özellik alanları
    connectivity.ts  geometriden netlist'e: pin, köşe, T bağlantısı
    flow.ts          kablo parçalarındaki akım (animasyon için)
    docOps.ts        ekleme, taşıma (kablo esnetme), döndürme, silme
    serialize.ts     JSON biçimi ve doğrulaması
    share.ts         paylaşım bağlantısı (lz-string)
  editor/            React arayüzü
    Simulator.tsx    kök bileşen: durum, yükleme, düzenler (masaüstü, tablet, telefon)
    Canvas.tsx       SVG tuval; fare, klavye ve dokunma (Kur / Bağla / Ölç) etkileşimleri
    useSimulation.ts simülasyon döngüsü (requestAnimationFrame)
    useLayout.ts     düzen seçimi (kırılma noktaları, yatay telefon, tablet)
    TopBar, Library, SimBar, HintStrip, Inspector (+ InspectTab, ExampleTab, MessagesTab)
                     masaüstü kabuğu ve İnceleme paneli
    DeviceRack, ScopeFace, InstrumentFaces, RackControls   cihaz rafı ve ön paneller
    Phone*.tsx, BottomSheet.tsx, phoneTools.ts             telefon: üst şerit, alt çubuk, alt sayfa,
                     cihazlar, dosya/⋯ sayfaları, zincirle ekleme ve kablo yolu
    TabletChrome.tsx tablet araç şeridi, alt çubuk, parça kartı
    HelpDialog.tsx, Welcome.tsx   Yardım, hoş geldin ve kısa tur
    messages.ts      Mesajlar: tanılamalar, toprak tuzağı, önerilen ön direnç
    readouts.ts      canlı ölçüm satırları ve ölçü aleti ekranı metinleri
  assets/fonts/      IBM Plex Sans ve Mono (woff2; lisans public/fonts/OFL.txt)
  examples/          hazır örneklerin JSON dosyaları
  i18n/tr.ts         arayüzdeki tüm metinler (Türkçe); i18n/ek.ts: R1’in, R2’nin gibi ekler
  layouts/, pages/   Astro sayfaları; simülatör tek bir React adası: <Simulator client:only="react" />
tests/               Vitest testleri
```

**Veri akışı:** Editör belgeyi (`model/types.ts`) değiştirir → `connectivity.ts` belgeden netlist
üretir → `sim/` netlist'i derler ve çözer → `useSimulation.ts` her animasyon karesinde motoru
ilerletip gerilimleri, akımları ve durumları tuvale aktarır. Arayüz motoru yalnızca
[`src/sim/index.ts`](src/sim/index.ts) üzerinden kullanır. Çözücü metin üretmez; hata ve uyarıları
kod + sayısal parametre olarak döndürür, Türkçe metinler `tr.ts`'tedir.

**Yeni bileşen eklemek** (ör. transistör, op-amp, AC kaynak):
1. `sim/netlist.ts` → `DeviceType` birleşimine türü ekle.
2. `sim/devices/` altına `Device` sınıfını (stamp fonksiyonları başında denklem yorumuyla) ve
   `DeviceModel`'i yaz; `sim/devices/index.ts` tablosuna ekle. Doğrusal olmayan bileşenler
   `stampNonlinear` + `updateIterate`, zamana bağlı olanlar `stampStep` + `accept` kullanır.
3. `model/catalog.ts` → pinler, alan, varsayılan değerler, özellik alanları; yönlü bir parçaysa
   `polarized: true` (Ters çevir komutu yalnızca bunlarda çalışır).
4. `editor/symbols.tsx` → sembol çizimi; `i18n/tr.ts` → ad, açıklama, alan adları.
5. `tests/` altına sonucu bilinen bir devreyle test ekle.

İçerik sayfaları (birimler, dönüşümler, formüller) `src/pages/` altına `BaseLayout` kullanan
`.astro` ya da `.md` sayfaları olarak eklenebilir; simülatörden bağımsızdırlar.

## Testler

`npm test` 600 test çalıştırır: görev tanımının 8. bölümündeki tüm devreler (gerilim bölücü,
voltmetre ve ampermetre etkisi, LED karakteristiği ve yanması, diyot, RC dolma, kısa devre,
topoloji, birim ayrıştırma), sayısal sağlamlık, şema modeli, kablo akımları, V/I/P metinleri,
AC kaynak (dalga biçimleri, doğrultmaç, kare dalgalı RC), ölçü aletlerinin DC/AC kipi,
osiloskop kaydı ve ekranı (tetikleme, X-Y, ölçümler, Oto ayar), zener ve transistörlerin el
hesabıyla bilinen çalışma noktaları (`tests/transistor.test.ts`), föy parça modelleri (1N4001,
BC107, BF245A, IRF510: veri sayfası noktaları, ters toparlanma, frekansla kazanç düşmesi;
`tests/models.test.ts`), su haznesi (ıslak/kuru prob, doldurma ve boşaltma; `tests/tank.test.ts`), laboratuvar cihazları
(50 Ω çıkış, offset, simetri, TTL, CV/CC, 1 MΩ giriş, AC kuplaj, toprak tuzağı ve ADD ile doğru
ölçüm; `tests/instruments.test.ts`), bütün hazır örneklerin
metinlerindeki sayılar (`tests/examples.test.ts`, `tests/examples-lab.test.ts`), örnek şemalarının
kalitesi (`tests/examples-sema.test.ts`: dik kablolar, gövdeden geçmeyen kablolar, ayrık parçalar,
tek toprak sembolü, akımın kablodan dönmesi, kesişme sınırı), paylaşım bağlantısı, mesajlar
(toprak tuzağı, ön direnç önerisi), renk ölçekleri ve telefon yardımcıları (ekler, zincirle ekleme,
kablo yolu; `tests/phone.test.ts`), toprak isteğe bağlı (`tests/toprak.test.ts`), açık devrede tam 0
akım (`tests/acik-devre.test.ts`), toprak hattı (`tests/toprak-hatti.test.ts`) ve zaman adımı
doğruluğu (`tests/zaman-adimi.test.ts`: küçük τ, RC süzgeçte genlik ve faz, kondansatörde faz,
kare dalga kenarları), gerçek dünya sınırları (`tests/sinirlar.test.ts`: her uyarı için "çıkar"
ve "çıkmaz"), bobin (`tests/bobin.test.ts`: RL dolma, enerji, reaktans, faz, LC salınımı, seri RLC
rezonansı, açılan anahtar ve serbest geçiş diyodu, iki örnek), transformatör (`tests/transformator.test.ts`), röle (`tests/role.test.ts`), DC motor (`tests/motor.test.ts`), sensörler ve lamba (`tests/sensorler.test.ts`), ses ve sigorta (`tests/ses.test.ts`), işlemsel yükselteç (`tests/opamp.test.ts`), 555 (`tests/timer555.test.ts`), manyetik alan gösterimi (`tests/manyetik.test.ts`) ve ngspice ile çapraz doğrulama
(`tests/spice/`: DC, geçici durum — RL ve LC dahil — ve AC). Arayüz kontrol listesi ayrıca `npm run ios-kontrol` ile çalışır
(aşağıya bak).

**Fizik denetimi** (`tests/fizik-denetimi.test.ts`): 71 kontrol, her biri analitik olarak hesaplanan
değerle karşılaştırılır: Ohm, iç direnç, seri/paralel, KCL ve KVL (dengesiz köprü), enerji korunumu
(Tellegen), süperpozisyon, Thévenin/Norton, en büyük güç aktarımı, ölçü aleti yüklemesi, açık/kapalı
devre ve toprak, RC dolma/boşalma ve enerji, seri/paralel kondansatör, yük paylaşımı, AC etkin değer,
güç, reaktans ve faz, RC süzgeç, doğrultucu, diyot/LED/zener/BJT/MOSFET çalışma noktaları, güç
kaynağının akım sınırı ve osiloskop toprak döngüsü. `FIZIK_RAPOR=dosya.txt npx vitest run
tests/fizik-denetimi.test.ts` her kontrolün beklenen ve bulunan değerini dosyaya yazar.

## Kararlar

Görev tanımında açık bırakılan, sonradan istenen ya da ortamdan kaynaklanan kararlar.

### Araçlar ve sürümler

- **Astro 6.4.8 (7 değil).** Geliştirme bilgisayarında Windows *Smart App Control* açık ve
  Astro 7'nin derleyicisinin yerel modülünü (`@astrojs/compiler-binding-*.node`) engelliyor.
  Astro 6 derleyicisi WebAssembly olduğu için engellenmiyor. Smart App Control kapalı bir
  ortamda Astro 7'ye geçmek, `astro` ve `@astrojs/react` sürümlerini yükseltmekten ibaret.
- **Rollup'ın WebAssembly sürümü.** Aynı nedenle `package.json` içindeki `overrides` ile
  `rollup`, resmî `@rollup/wasm-node` paketine yönlendirildi. Ayrıca `esbuild` ve `sharp`
  güvenlik düzeltmesi içeren sürümlere, `vite` ise tek sürüme (7.x) sabitlendi.
- `npm audit`, Astro 6 için hâlâ uyarı gösteriyor: bunlar sunucu tarafı (SSR) çalışma,
  görünüm geçişleri (view transitions) ve görsel optimizasyonu ile ilgili. Bu site statik,
  kullanıcı içeriği işlemiyor ve bu özellikleri kullanmıyor; uyarılar burada tetiklenmez.
- **TypeScript 6.** `@astrojs/check`, TypeScript 7'yi henüz desteklemiyor.
- **Ek kütüphane:** yalnızca `lz-string` (paylaşım bağlantısı). Simgeler projeye özel çizildi.

### Çözücü

- **Pil:** İç direnç > 0 ise ideal kaynak + seri direnç (bir iç düğüm). Yapının değer
  değişikliklerinde sabit kalması için iç düğüm ve akım satırı her zaman ayrılır; iç direnç 0
  ise iç düğüm yalnızca gmin ile toprağa bağlı kalır.
- **İdeal pilde kısa devre eşiği:** Görevdeki kural (akım > V / (2·Riç)) iç direnç 0 iken
  tanımsız. Bu durumda dış yük 0,1 Ω'un altına düşerse kısa devre uyarısı verilir.
- **Ampermetre:** İdeal/gerçek geçişinde yapı değişmesin diye akım satırı her zaman ayrılır;
  gerçek ampermetrede bu satır kullanılmaz (A[k][k] = 1, z[k] = 0).
- **Diyot:** 1 mA'de 0,60 V ve 20 mA'de 0,70 V ⇒ N ≈ 1,29, Is ≈ 1,6·10⁻¹¹ A.
- **LED parametreleri** (Is, 20 mA'de veri sayfası ileri gerilimini verecek şekilde hesaplanır):

  | Renk    | Vf (20 mA) | Mutlak en büyük | N   | Rs   | Is (hesaplanan) |
  |---------|-----------:|----------------:|----:|-----:|----------------:|
  | Kırmızı | 1,85 V     | 30 mA           | 2,6 | 2 Ω  | ≈ 4·10⁻¹⁴ A     |
  | Yeşil   | 2,2 V      | 25 mA           | 3,0 | 3 Ω  | ≈ 2·10⁻¹⁴ A     |
  | Mavi    | 3,3 V      | 30 mA           | 4,4 | 5 Ω  | ≈ 1·10⁻¹⁴ A     |

- **LED parlaklığı:** (I / 20 mA)^(1/2,2), en fazla 1.
- **LED yanması anlıktır:** Akım mutlak en büyük değeri bir adımda bile aşarsa LED yanar ve o
  adım LED açık devre olarak yeniden çözülür.
- **Newton-Raphson gerilim sınırlaması:** Görevdeki formül (Vold > 0 iken) aynen uygulanır.
  Vold ≤ 0 iken Vnew = N·VT·ln(Vnew/(N·VT)) kullanılır; ters kutuplanmış bir eklemin
  0,3 V'luk adımlarla tırmanmasını önler. Yakınsama için düğüm gerilimlerine ek olarak eklem
  akımının doğrusal tahmine yakınlığı da kontrol edilir.
- **DC yedeği:** Kondansatörsüz devrede zaman adımı küçültülemeyeceği için NR yakınsamazsa
  kaynak adımlama (%10, %20 … %100) denenir.
- **Zaman ilerletme:** Adım uyarlanır (ayrıntı aşağıda, "Fizik 4"). Kare süresine sığmayan
  adım bir sonraki kareye aktarılır; simülasyon zamanı kaymaz. Testlerdeki `runUntil` son adımı
  istenen ana tam denk getirir.
- **Toprak isteğe bağlı:** ayrıntı aşağıda, "Fizik 1". Toprak varken toprağa bağlı olmayan devre
  parçaları kendi sıfır noktasını alır; Mesajlar'da bilgi olarak gösterilir.
- **Değer girişi:** Görevdeki önekler dışında `K` (kilo) ve `4k7` yazımı da kabul edilir.
  Rakamlar arasındaki boşluk hata sayılır ("1 2").

### Fizik denetimi ve düzeltmeler (2026-10)

Çözücü 71 kontrolle denetlendi (commit 3d9bc92; `tests/fizik-denetimi.test.ts`). 62 kontrol doğru
çıktı; 9 kontrol eksik gösterdi ve testte `it.fails` ile işaretlendi: toprak zorunluluğu (Aşama 1),
açık devrede gmin kaçak akımı (Aşama 2), iki toprak sembolü üzerinden görünmez kapanma (Aşama 3),
küçük zaman sabitinde ve RC süzgeçte zaman adımı hatası (Aşama 4), LED ters gerilimi, direnç gücü ve
kutuplu kondansatör sınırları (Aşama 5). Hepsi düzeldi ve normal teste çevrildi: 71 kontrolün 71'i
geçiyor. Aşamaların kararları aşağıda.

**Fizik 1: toprak isteğe bağlı, her ada için otomatik sıfır noktası.**

- *Gerekçe:* Fizikte gerilim iki nokta arasındaki farktır; toprak yalnızca sıfır noktasının
  seçimidir. Pille çalışan bir devre gerçekte toprağa bağlı değildir ve yine de çalışır. Eskiden
  toprak sembolü yoksa `no-ground` hatası verilip simülasyon başlatılmıyordu; bu hata kaldırıldı.
- *Ada:* kablolarla ve bileşenlerin içinden birbirine bağlanan pinler (`couplingPins`). Yalnızca
  matrise kesinlikle hiçbir şey eklemeyen bağlantılar adaları ayırır: açık anahtar, ideal voltmetre,
  osiloskobun ideal girişi ya da GND kuplajı, DC güç kaynağının birbirinden yalıtılmış iki çıkışı.
  Ötekiler (kondansatör, su haznesi dahil) iki yanını aynı ada sayar.
- *Sıfır noktası seçimi* (`compile.ts`, `chooseReferences`): toprağa (toprak sembolü ya da topraklı
  cihaz) bağlı olmayan her ada için önce adadaki bir kaynağın − ucu (pil, AC kaynak, DC güç
  kaynağının çıkışı, topraksız fonksiyon üretecinin COM'u), yoksa adanın ilk pini. Sıra bileşen ve
  pin sırasıdır; devre değişmedikçe aynı nokta seçilir. Seçilen pin derlemede toprak ağına katılır
  (tam 0 V; sayısal olarak iyi koşullu).
- *Neden adalar arasında akım yolu oluşmaz:* her ada çözücünün referansına tek bir noktadan bağlanır;
  bu bağlantılar ağaç biçimindedir, döngü yoktur. Bir adaya yalnızca bir noktadan girilebildiği için
  o noktadan geçen net akım 0'dır (KCL). Bu yüzden adayı fazla geniş tutmak güvenlidir, bir iletken
  yolu iki referansa bölmek değildir. Testte iki ada arasındaki akım ölçülür (`tests/toprak.test.ts`).
- *Uyarılar:* toprak varken toprağa bağlı olmayan ada artık "gerilimler anlamsız" uyarısı değil,
  bilgidir: "Bu devre parçası toprağa bağlı değil; gerilimler kendi sıfır noktasına göre
  gösteriliyor." Hiçbir şeye bağlı olmayan toprak sembolü (`ground-unconnected`) hata değil
  uyarıdır. Tanılamalara `info` önem düzeyi eklendi (tuvalde rozet almaz, sayaçlara girmez).
- *Arayüz:* otomatik seçilen sıfır noktasında, toprak sembolüyle karışmasın diye mavi bir "0 V"
  etiketi ve pinde halka (yalnızca kaynak içeren ve en az iki parçalı adalarda; tek başına duran
  parçada, ör. güç kaynağının kullanılmayan ikinci çıkışında, işaret kalabalık yapar). Etiket ekran ölçüsündedir (yakınlaştırmayla küçülmez); dokunmatikte hedefi
  44 px. Dokununca ya da tıklayınca kısa açıklama açılır. Eski "devrede toprak yok" afişi ve tek
  tıkla toprak ekleme kaldırıldı.

**Fizik 2: açık devrede akım tam sıfır.**

- *Sorun:* her düğümden toprağa 1 TΩ (gmin = 1e-12 S) ekleniyordu; bu, açık devreyi toprak üzerinden
  kapatıyordu. Kablosu eksik devrede ampermetre 3,56·10⁻¹¹ A ("35,6 pA") gösteriyordu; KCL ve enerji
  korunumu artıkları 10⁻⁹ mertebesindeydi.
- *gmin yalnızca gerekli yerde* (`engine.ts`, `floatingNodes`): her bileşen hangi düğümlerini iletken
  bir yolla bağladığını söyler (`conductiveGroups`). Direnç, kapalı anahtar, gerilim kaynakları,
  gerçek ölçü aletleri, ideal ampermetre, diyot/LED/zener eklemleri ve transistörler (eklemlerdeki
  paralel gmin sayesinde), geçici çözümde (h > 0) kondansatör iletken yol sayılır; açık anahtar,
  ideal voltmetre, osiloskobun ideal girişi, yanmış LED, MOSFET'in yalıtılmış kapısı (doğru akımda)
  ve iç direnci 0 olan pilin kullanılmayan iç düğümü sayılmaz. Su haznesinin probları, seviye
  yapıyı değiştirmeden değiştiği için iletken sayılmaz (fazladan gmin zararsızdır). Referansa (toprak
  ya da otomatik sıfır noktası) iletken yolu olmayan her düğüm grubuna gmin **tek bir düğümden**
  eklenir: matris tekil olmaz, ve tek noktadan bağlı bir gruptan net akım geçemeyeceği için gmin hiçbir
  yerde kaçak oluşturmaz. Eklemlerin içindeki gmin (Newton-Raphson yakınsaması için) değişmedi.
- *Köprü kenarları tam 0* (`findZeroPins`): iletken çizgide (düğümler ve bileşenler; çok uçlu
  bileşen sanal bir düğüme yıldız) köprü olan bir kenar kesilince çizge ikiye ayrılır; iki yan
  arasında başka yol olmadığından köprüden geçen net akım KCL gereği 0'dır. Bu uçların akımı
  (ölçüm, uç akımları, kablo animasyonu, ampermetre okuması) çözümün yuvarlama artığı (≈ 10⁻¹⁵ A)
  yerine tam 0 verilir. Köprüler Tarjan'ın algoritmasıyla, her derlemede ve zaman adımı değişince
  bulunur (O(düğüm + kenar)). Burada "iletebilecek" her yol sayılır (su haznesinin probları dahil):
  bir yolu eksik saymak gerçek bir akımı sıfırlardı.
- *Doğru akım çözümünde bir Newton adımı daha:* Newton-Raphson'un yakınsama ölçütü düğüm gerilimine
  göredir (|ΔV| < 1e-3·|V| + 1 µV, SPICE'taki RELTOL/VNTOL); bu, transistörlü devrede 10⁻⁸
  mertebesinde bir KCL artığı bırakıyordu. Doğru akım çözümü devre değişince bir kez yapıldığı için
  yakınsamadan sonra bir yineleme daha yapılır (maliyeti yok); artık 10⁻¹⁵'e iner.
- *Sonuç (Ek A):* kablosu eksik devre 2,66·10⁻¹¹ A → 0; açık devrede ampermetre 3,56·10⁻¹¹ A → 0
  (ekranda "0,000 A"); köprüde KCL artığı 4,7·10⁻⁹ → 2,7·10⁻¹⁶, enerji korunumu 3,7·10⁻⁹ →
  2,1·10⁻¹⁶; BJT devresinde KCL 8,5·10⁻⁸ → 2,3·10⁻¹⁵. Föy, baraj ve transistörlü örneklerde yakınsama
  sorunu çıkmadı (bütün testler geçiyor).

**Fizik 3: görünür toprak hattı ve toprak üzerinden dönen akım.**

- *Karar:* toprak sembolleri ve topraklı cihazların (osiloskop, fonksiyon üreteci) COM uçları
  birbirine bağlı sayılmaya devam eder (Proteus ve SPICE gibi); gerçekte de binanın toprak hattıyla
  bağlıdırlar. Eksik olan bu bağlantının görünmemesiydi.
- *Toprak noktası:* toprak sembolü ya da topraklı COM içeren kablo adası (aynı kabloya bağlı iki
  toprak sembolü tek noktadır). Her noktadan toprak hattına geçen akım, o adadaki bileşen uçlarının
  akımlarından KCL ile bulunur (`engine.ts`, `groundLineCurrents`); `flow.ts` aynı akımı kablo
  adalarındaki dengesizlikten bulur ve canlandırır. Osiloskobun kendi giriş akımı (1 MΩ ‖ 25 pF,
  birkaç µA) sayılmaz: cihazın ölçüm akımıdır; sayılsaydı doğru bağlanmış her topraklı prob mesaj
  verirdi.
- *Çizim ve yol seçimi:* iki ya da daha fazla toprak noktası varsa her kablo adasından bir temsilci
  (toprak sembolünün ortası ya da COM ucu) seçilir ve temsilciler **en kısa kapsayan ağaçla** (Prim,
  düz uzaklık) birleştirilir: n nokta için n − 1 çizgi, en az mürekkep; şema kalabalıklaşmaz. Her
  parça kesikli ve aşağı doğru hafifçe sarkan bir eğridir (sarkma uzunluğun %15'i, 1–3 ızgara
  birimi). Kablolar hep dik açılı olduğu için eğri kabloyla karışmaz ve aynı hizadaki bir kablonun
  üstüne binmez (düz çizgi toprak tuzağı örneğinde kablonun üstüne biniyordu). Renk toprak yeşili,
  1,5 px (vurguda 2,2 px), parçaların altında; "toprak hattı" etiketi en uzun parçanın ortasında,
  eğrinin hemen dışında, bir kez (telefonda uzaklaştırınca gizlenir). Hattaki akım kablolardaki
  gibi akım noktalarıyla canlandırılır. Tek toprak noktası varsa ne çizgi ne mesaj var (KCL gereği
  hattan akım geçmez). Eski "şebeke toprağı (cihazlarda)" çizgisinin (COM uçlarından devrenin altına
  inen) yerini aldı.
- *Mesaj ve eşik:* bir noktadan hatta geçen akım 1 µA'i, en büyük kaynak akımının %1'ini ve
  osiloskop girişlerinden geçen akımın iki katını aşarsa: "Akım toprak hattı üzerinden dönüyor: G1
  ile G2 binanın toprak hattıyla birbirine bağlıdır. Şemada aralarında kablo olmasa da toprak
  hattından … geçiyor." Topraklı cihazda cihazın adı kullanılır ("OSC1 osiloskobunun COM ucu").
  1 µA, föy devrelerindeki anlamlı akımların (en küçüğü µA'ler mertebesindeki baz akımları)
  altında, sayısal artıkların (10⁻¹⁵ A) çok üstündedir; %1 oranı büyük akımlı devrelerde önemsiz
  sızıntıları ayıklar. AC devrede tepe değer bir periyot boyunca tutulur (sıfır geçişinde mesaj
  yanıp sönmez). Mesaja tıklayınca ilgili toprak noktaları ve toprak hattı vurgulanır.
- *Önem düzeyi (görev tanımından ayrılan yer):* tanım bu durumda "uyarı" istiyor; ama föyün
  yükselteç, kırpıcı ve anahtar devreleri ortak toprağı ayrı toprak sembolleriyle çizer (ders
  kitaplarındaki gibi) ve devre akımı (0,56–10,6 mA) bu sembollerin arasından döner. Hepsinde uyarı
  çıkması gereksiz olurdu. Bu yüzden yalnızca toprak sembolleri arasında dönen akım **bilgi**dir
  (Mesajlar'da görünür, toprak hattı çizilir; rozet, sayaç ve kendiliğinden sekme değişimi yok).
  Topraklı bir cihazın COM ucu (toprak sembolü olmadan) akım taşıyorsa **uyarı**dır: gerçek toprak
  döngüsü (Ek A F'de R2 kısa devre olur). Toprak tuzağı mesajı varsa aynı durumu çözümüyle anlattığı
  için toprak hattı mesajı ayrıca gösterilmez.
- *Örneklerde:* toprak tuzağında uyarı (toprak tuzağı mesajı). Örnek şemaları 2026-10-17'de
  yeniden çizildi (bkz. "Örnekler"): her devrede tek toprak sembolü var ve dönüş akımı kablodan
  döner, bu yüzden öteki örneklerde toprak hattı da mesaj da yok (önceden ayrı toprak sembolleriyle
  çizilen föy ve baraj devrelerinde 0,56–10,6 mA "bilgi" olarak toprak hattından dönüyordu). Bilgi sorun olmadığı için Mesajlar sekmesinin rozeti ve ipucu şeridi
  yalnızca hata ve uyarıları sayar.

**Fizik 4: zaman adımı doğruluğu (yamuk kuralı, LTE denetimli uyarlanır adım).**

- *Sorun:* geri Euler (birinci dereceden) ve sabit adım (50 µs ya da AC periyodunun 1/50'si).
  τ = 10 µs'lik RC'de v(τ) 0 V çıkıyordu (ilk adım τ'yu atlıyordu), v(5τ) 8,33 V; RC süzgeçte
  |H| 0,6861 (beklenen 0,7071), kondansatörde faz 89,55°.
- *Yöntem: yamuk (trapez) kuralı.* SPICE'ın varsayılanı; Gear-2'ye (BDF2) göre hata katsayısı
  küçük (h³/12 ile 2h³/9) ve kayıpsızdır: LC devresinde enerjiyi korur. Gear-2 periyotta 40 adımda
  (10 mH, 10 µF ve 50 µs adım) enerjinin %1,1'ini sayısal olarak söndürür; bobin aşamasındaki %1
  koşulunu tutmazdı. Yamuk kuralının bilinen kusuru, süreksizlikten sonra sönmeyen salınımdır
  (sert bir kipte çarpan −1'e yaklaşır). Bu yüzden ilk adım ve her süreksizlikten (kare dalga ve
  TTL kenarı, üçgenin köşesi, anahtar ya da değer değişimi, LED'in yanması, Newton-Raphson'un
  yakınsamaması) sonraki adım geri Euler'dir; geri Euler sert kipleri bir adımda söndürür.
  Kondansatör: i(n+1) = 2C/h·(v(n+1) − v(n)) − i(n); eklem yükleri aynı biçimde
  (`ChargeState`). Osiloskobun 25 pF'lık giriş kapasitesi ölçü aletinin kendi yüküdür; sert
  (50 Ω'luk üreteçte τ ≈ 1 ns) olduğu için geri Euler ile çözülür ve hata denetimine girmez.
- *Yerel kesme hatası (LTE):* durum değişkenleri kondansatör gerilimleri ve yük modeli olan
  eklemlerin gerilimleridir (bobin akımı da girecek); bunlar süreksizlikte de süreklidir, kaynak
  düğümleri gibi sıçrayan büyüklükler hata ölçüsüne girmez. Tahmin öngörücü-düzeltici
  (Milne) yöntemiyle: son kabul edilmiş p + 1 noktadan geçen polinom yeni ana uzatılır (yamukta
  p = 2) ve çözümle farkı LTE'ye çevrilir: LTE ≈ |x − x_öngörücü|·C_d/(C_d + C_ö) (eşit adımda
  yamukta 1/13, geri Euler'de 1/3). Tolerans SPICE'tadır: |LTE| ≤ TRTOL·(RELTOL·|x| + VNTOL),
  RELTOL = 10⁻³, VNTOL = 1 µV, TRTOL = 7. Oran 1'i aşarsa adım reddedilir ve
  0,9·oran^(−1/(p+1)) kadar küçülür (en az yarıya, en fazla onda bire); kabul edilen adımdan sonra
  aynı formülle büyür (en fazla 2 kat, en büyük adıma kadar). En küçük adım 1 ns, en büyük adım
  50 µs (ya da AC periyodunun 1/50'si) aynı kaldı. Geçmiş olmayan başlangıçta (simülasyonun ilk
  adımı, devre değişince) ilk adım en büyük adımın on binde biridir (5 ns; Fizik 7'de 50 ns'den
  indirildi) ve her adımda iki katına çıkar; hata denetimi üç nokta birikince başlar, o zamana
  kadar adımlar geri Euler'dir.
- *Kırılma noktaları:* kaynaklar bir sonraki süreksizliği verir (`nextBreakpoint`): kare dalganın
  iki kenarı, üçgenin köşeleri, simetri %50 değilse bükülmüş sinüsün kırıkları ve fonksiyon
  üretecinin TTL kenarları (yalnızca TTL ucu bir yere bağlıysa). Adım tam kenara denk getirilir;
  o adımda kaynak kenarın hemen öncesindeki değerle çözülür (sol limit), kenar bir sonraki geri
  Euler adımının başında olur. Kenardan sonra öngörücü eski eğilimi taşıdığından hata büyük
  çıkar ve adım hızlı geçiş çözülene kadar küçülür; yavaş devrede (τ ≫ adım) küçülmez.
- *TRTOL seçimi:* TRTOL = 1 ile doğruluk biraz daha iyi (küçük τ'da %0,12) ama kırpıcılarda adım
  sayısı 3,6 katına çıkıyordu; TRTOL = 7 ile hedefler rahatça tutuyor: τ = 10 µs'de v(τ) 6,3427 V
  (%0,34), v(5τ) %0,13; RC süzgeçte |H| %0,001 (kilitlemeli ölçüm; AC voltmetre 0,7066, %0,07), faz −44,999°; kondansatörde faz 90,000°; üreteçle
  kare dalgada (τ = 10,5 µs) v(τ) salınımın %0,12'si kadar sapıyor. Ek A'nın C ve D bölümleri
  geçmeye devam ediyor.
- *Hız (önce → sonra; Node, 60 Hz karelerle 1 s simülasyon; simülasyon saniyesi başına adım ve
  süre):* RC dolma 20 000 → 20 000 adım, 11 → 23 ms; kare dalgalı RC 20 000 → 20 002, 14 → 40 ms;
  toprak tuzağı 50 000 → 49 999, 179 → 222 ms; 1N4001 X-Y 50 000 → 69 041, 115 → 255 ms; zener
  50 000 → 49 999, 124 → 139 ms; LED 50 000 → 49 999, 95 → 125 ms; yarım dalga 20 000 → 20 156,
  49 → 77 ms; köprü 20 000 → 20 301, 61 → 95 ms; negatif kenetleyici 50 000 → 71 944, 102 → 283 ms;
  pozitif kenetleyici 50 000 → 72 673, 103 → 271 ms; katlayıcı 50 000 → 51 007, 160 → 216 ms;
  paralel kırpıcı 50 000 → 76 666, 247 → 544 ms; çift kırpıcı 50 000 → 99 715, 320 → 847 ms;
  JFET yükselteç 50 000 → 50 000, 319 → 422 ms; BJT yükselteç 50 000 → 50 000, 327 → 380 ms;
  MOSFET yükselteç 50 000 → 50 000, 318 → 388 ms; BJT anahtar 20 000 → 20 154, 61 → 138 ms;
  emetörde LED 20 000 → 20 047, 54 → 117 ms; baraj çubuk 20 000 → 20 000, 106 → 139 ms; baraj tek
  ışık 20 000 → 20 000, 139 → 184 ms. Adımlar diyotların iletime girip çıktığı anlarda toplanır
  (1N4001'in ters toparlanması µs ölçeğindedir; periyotta dört olay, olay başına 25–70 deneme).
  Tarayıcıda (Edge, ×1 hız) ölçüm sırasında bütün föy ve baraj örnekleri önce ve sonra gerçek
  zamanı tutuyordu (4 s'de simülasyon/gerçek zaman oranı 0,999–1,002), gecikme uyarısı yoktu.
- *Sonradan yapılan eşleştirilmiş ölçüm (Aşama 7'den sonra, makine daha yüklüyken; önce = Aşama 3
  sürümü, sonra = son sürüm, aynı oturumda):* çift yönlü kırpıcı Node'da 382 → 1636 ms/sim-s, paralel
  kırpıcı 305 → 983 ms/sim-s, BJT yükselteç 594 → 826 ms/sim-s. Tarayıcıda aynı yükte canlı site
  (eski çözücü) çift yönlü kırpıcıda 85 fps ve gerçek zamanda; yeni çözücü 14 fps ve gerçek zamanın
  %79'unda kalıyor ("gerçek zamana yetişemiyor" uyarısı çıkıyor). Öteki bütün örnekler gerçek zamanı
  tutuyor (paralel kırpıcı 45 fps). Neden: iki 1N4001'in ters toparlanması (τ_T = 5,76 µs) SPICE
  toleranslarında her diyot geçişinde 25–70 deneme istiyor (periyotta dört geçiş); adım sayısı 2,
  Newton-Raphson yinelemesi ≈ 1,5 kat. Yamuk adımında Newton-Raphson'u son iki çözümden doğrusal
  öngörüyle başlatmak yinelemeyi %17–25 azalttı (JFET yükselteçte süre %10 kısaldı); büyüme
  güvenlik çarpanını değiştirmek kazandırmadı. Görev tanımı gereği bu durum raporlandı.
- *Sonra hızlandırma (kullanıcı onayıyla):* CPU profilinde zamanın ≈ %10'u statik matrisin önbellek
  anahtarını her denemede metin olarak kurmaya gidiyordu; anahtar sayısal karşılaştırmaya çevrildi
  (LU önbelleği hazırlık sıra numarasıyla). Yakınsamayan her Newton yinelemesinde yalnızca hata
  mesajı için kurulan dizi, döngü bitince bir kez kuruluyor; adım bağlamı nesnesi yayma (spread)
  olmadan oluşturuluyor. Adım sayıları ve sonuçlar aynı; Node'da çift yönlü kırpıcı 1080 → 709,
  paralel kırpıcı 579 → 406, BJT yükselteç 366 → 258 ms/sim-s. Tarayıcıda (aynı yükte) çift yönlü
  kırpıcı gerçek zamanı tutuyor (0,999; 83 fps, eski çözücü 85 fps), paralel kırpıcı 180 fps. Kalan
  sürenin büyüğü yoğun LU ayrıştırması ve model hesapları (üstel, akım sınırlayıcının tanh'ı).
- *Testler:* `tests/zaman-adimi.test.ts` (küçük τ, RC süzgeçte genlik ve faz, kondansatörde faz,
  kare dalga kenarları, salınımsızlık, kullanılmayan TTL); adım sayısını sabit 50 µs'ye bağlayan
  iki eski test "en az 2000, en fazla 2015" (başlangıçtaki ≈ 14 küçük adım) olarak güncellendi;
  fizik denetiminde örnekleme aralığı olarak çözücünün adımı yerine `maxTimeStep` kullanılıyor.

**Fizik 5: ters gerilim, güç ve kutup sınırları.**

Sınır aşılınca yalnızca uyarı verilir (Mesajlar sekmesi, parça vurgusu ve rozeti); bozulmanın ne
zaman ve nasıl olacağına dair veri sayfalarında dayanak olmadığı için yanma ya da bozulma
modellenmez. AC devrede ters gerilimin bir periyotluk tepesine, direnç gücünün bir periyotluk
ortalamasına bakılır (ısınma ortalama güçle olur; uyarı yarım periyotta yanıp sönmez). Değerler
[`src/sim/ratings.ts`](src/sim/ratings.ts) içinde, kaynaklarıyla:

| Sınır | Değer | Kaynak |
|---|---|---|
| LED ters gerilimi | 5 V (bütün renkler) | Kingbright 5 mm (T-1 3/4) LED'ler, L-53 serisi veri sayfası ve katalog: "Absolute Maximum Ratings — Reverse Voltage V_R = 5 V" |
| 1N4001 ters gerilimi | V_RRM = 50 V | Vishay General Semiconductor 1N4001–1N4007 veri sayfası (1N4004: 400 V) |
| Elektrolitik kondansatör ters gerilimi | 1 V | Nippon Chemi-Con, "Guidelines for Using Aluminum Electrolytic Capacitors": "Generally, an intermittent reverse voltage of 1 volt DC is allowed." Nichicon hiç ters gerilim uygulanmamasını, Cornell Dubilier en fazla 1,5 V'u söyler; en sıkı sayısal sınır seçildi. |
| Direnç güç sınırı | varsayılan 1/4 W; seçenekler 1/8, 1/4, 1/2, 1, 2, 5 W | Föy ve README dirençlerin güç sınıfını vermiyor; öğrenci laboratuvarlarında en yaygın 1/4 W karbon film dirençler varsayıldı (görev tanımının önerisi). |

- *LED:* uyarı metni "LED ters yönde X V görüyor; gerçek bir LED en fazla 5 V'a dayanır ve
  bozulabilir." (görev tanımındaki gibi). *1N4001:* benzer metin, V_RRM ile. Genel (basit) diyot
  modelinin bir veri sayfası yok: sınırı da yok. Zenerin ters yönü normal çalışmasıdır.
- *Direnç:* `powerRating` özelliği (İnceleme panelinde "Güç sınırı"). Sınır aşılınca direnç
  tuvalde ısınıyormuş gibi çizilir: sınırda turuncu, iki katında ve ötesinde kırmızı, çevresinde
  hafif kızıllık. Eski kayıtlı devreler varsayılanı (1/4 W) kullanır.
- *Kondansatör:* `kind` özelliği ("Tür"): elektrolitik (kutuplu, sembolde + işareti) ya da
  seramik/film (kutupsuz, + işaretsiz). Yeni yerleştirilen kondansatör elektrolitiktir (varsayılan
  100 µF; gerçekte bu değer elektrolitiktir). Türü kayıtlı olmayan eski devreler kutupsuz sayılır:
  eskiden ters gerilim uyarısı yoktu, eski devreler yeni uyarı vermesin (sembolden + işareti
  kalkar, davranış aynı). Kondansatör artık "ters çevrilebilir" bir parçadır (F; elektrolitikte
  + ucunu çevirmek için).
- *Örnekler:* kutbu hiç terslenmeyen kondansatörler elektrolitik (RC dolma, kare dalgalı RC,
  yarım dalga filtreleri 1/22/470 µF, negatif kenetleyici, BJT yükseltecin 10 µF kuplajı,
  katlayıcının C2'si, baraj devrelerinin 10 µF'ları). Pozitif kenetleyicinin kondansatörü
  çizimde ters duruyordu (hep −4,25…0 V): çevrildi ve elektrolitik oldu (+ ucu yüksek gerilim
  tarafında; gerilim artık +). Gerilimi sıfır çevresinde salınan ya da 1 V'tan fazla terslenen
  kondansatörler kutupsuz: JFET yükseltecin 1 µF kuplajı, katlayıcının C1'i (başlangıçta −1,3 V).
  "Ampermetrenin etkisi"ndeki 100 Ω'luk direnç 12 V'ta 1,44 W harcar: 2 W'lık yapıldı (açıklamada
  da yazar). Testte bütün örnekler (anahtarlı durumlar ve dolu hazne dahil) sınır uyarısı vermez.
- *Testler:* `tests/sinirlar.test.ts` (14): her uyarı için "çıkar" ve "çıkmaz", AC'de uyarının her
  karede durması, AC'de ortalama güç (10 V tepe, 220 Ω: ortalama 0,227 W, tepe 0,45 W, uyarı yok),
  eski kayıtların varsayılanları, örnekler. Bir eski test ("dış yük iç dirençten büyükse uyarı
  yok") artık yalnızca kısa devre uyarısının olmadığını denetliyor: o devrede 10 Ω'a 6,7 W düşer ve
  güç uyarısı fiziksel olarak doğrudur.

**Fizik 6: ngspice ile çapraz doğrulama (yalnızca testlerde).**

- *Çalıştırma yolu:* geliştirme bilgisayarında ngspice komut satırı sürümü kurulu değildi
  (`where ngspice` boş; Program Files'ta yok). İkinci yol olarak ngspice'ın WebAssembly derlemesi
  `eecircuit-engine` 1.8.0 Node'da (Vitest içinde) çalıştırılır; tek örnek başlatılır (≈ 0,3 s),
  devreler sırayla çözülür. Bu derleme netlist'te ASCII olmayan bir karakter görünce takılıyor:
  metin ngspice'a ASCII'ye çevrilerek verilir (yalnızca başlık satırlarında Türkçe harf vardı).
- *Dönüştürücü* (`tests/spice/netlist.ts`): `Netlist` → SPICE. Parametreler modelimizden aynen
  alınır: diyotta IS, N (1N4001'de CJO, VJ, M, TT, FC = 0,5 de); LED, seri dirençli diyot (IS, N,
  RS); zener, bizdeki yapıyla aynı (1 Ω + ileri diyot + ters "kırılma" diyodu); BJT, Gummel-Poon
  (eski modellerde IS, BF, BR, VAF: Early'li Ebers-Moll taşıma modelimizin aynı denklemleri; BC107'de
  kartın tamamı: ISE, NE, ISC, NC, IKF, IKR, VAR, NF, NR); MOSFET, LEVEL 1 (KP = 2β, VTO, LAMBDA, W = L, gövde source'ta). Sıcaklık 300 K
  (TEMP = TNOM = 26,85 °C; ngspice'ın varsayılanı 27 °C, VT'de %0,05 fark yaratırdı). ngspice'ın
  kendi toleransı karşılaştırmayı bozmasın diye `.op`'ta RELTOL = 10⁻⁶, `.tran`'da 10⁻⁵ ve küçük
  en büyük adım kullanılır.
- *Sonuçlar* (en büyük fark; sınır DC %0,1, geçici ve AC %1):

  | Devre | Karşılaştırılan | ngspice | Bizim | Fark |
  |---|---|---|---|---|
  | Wheatstone köprüsü | V(B), V(C), I(R5) | 6,580645 V; 5,935484 V; 129,0323 µA | aynı | %0,0000 |
  | Süperpozisyon | V(m) | 6,818182 V | 6,818182 V | %0,0000 |
  | Diyot 1N4001 (5 V, 1 kΩ) | V_D, I | 0,5577133 V; 4,442287 mA | 0,5577134 V; 4,442287 mA | %0,0000 |
  | Diyot genel | V_D, I | 0,6490825 V; 4,350918 mA | 0,6490827 V; 4,350917 mA | %0,0000 |
  | LED kırmızı / sarı / yeşil / mavi (9 V, 470 Ω) | V_LED | 1,822411 / 2,064875 / 2,159019 / 3,206578 V | 1,822412 / 2,064876 / 2,159020 / 3,206579 V | %0,0000 |
  | Zener 5,1 V (12 V, 330 Ω) | V_Z | 5,106436 V | 5,106438 V | %0,0000 |
  | BJT aktif (R_B = 430 kΩ) | V_B, V_C, I_C | 0,6672881 V; 4,866789 V; 4,133211 mA | 0,6672883 V; 4,866789 V; 4,133211 mA | %0,0000 |
  | BJT doyum (R_B = 10 kΩ) | V_B, V_CE(sat) | 0,7035564 V; 25,26656 mV | 0,7035566 V; 25,26657 mV | %0,0000 |
  | MOSFET IRF510 doyum / omik | V_D | 8,326879 V / 41,95908 mV | aynı | %0,0000 |
  | RC τ = 0,1 s | v_C (25 nokta, 0,5 s) | t = 40 ms: 3,296799 V | 3,296800 V | %0,0000 |
  | RC τ = 10 µs | v_C (60 nokta, 60 µs) | t = 12 µs: 6,988058 V | 6,990686 V | %0,026 |
  | Yük paylaşımı (100 µF 10 V, 10 Ω, 100 µF) | v_C1, v_C2 (5 ms) | t = 0,5 ms: 6,839398 / 3,160602 V | 6,838003 / 3,161997 V | %0,028 |
  | Yarım dalga (50 Hz, 10 V, 1N4001, 1 kΩ) | 160 nokta; tepe; ortalama | tepe 9,403207 V; ortalama 2,907909 V | 9,403207 V; 2,907900 V | %0,007 |
  | RC süzgeç, f_c = 1 kHz | \|H\|, faz | 0,7071178; −44,99911° | 0,7071105; −44,99918° | %0,001 |

  Geçici durumda fark, dalganın ölçeğine (en büyük |değer|) oranlanır: sıfırdan geçen dalgada
  noktasal oran anlamsızdır. Hiçbir karşılaştırma toleransı aşmadı; analitik hakemliğe gerek
  kalmadı (RC'de ikisi de e^(−t/τ)'ya %0,03 içinde). AC'de bizim değerimiz zaman uzayında, oturmuş
  dalga üzerinde kilitlemeli ölçümle bulunur (bizde ayrı bir küçük sinyal analizi yok).
- *Eklenen bağımlılık:* `eecircuit-engine` 1.8.0 (`devDependencies`, sürüm sabit; 2026-09-05'te
  yayımlandı; bağımlılığı yok). `npm audit`'in bildirdiği kritik açık bu paketle ilgili değil,
  Astro 6.4.8'in kendisinde (düzeltmesi Astro 7'ye geçiş istiyor; bu aşamanın kapsamı dışında).

**Fizik 7: bobin, Faraday ve Lenz yasaları.**

- *Parça:* "Bobin" (pasif parçalar, etiket öneki L). Özellikler: endüktans (varsayılan 10 mH) ve
  sargı direnci (varsayılan 12 Ω). Varsayılanlar gerçek bir bobinden: **Bourns RLB1314-103KL**
  radyal bobin, 10 mH ±%10, DC direnci en fazla 12 Ω, I_dc 100 mA, öz rezonans frekansı (SRF)
  0,53 MHz (üretici veri sayfası değerleri; Farnell ve RS listeleri). 10 V / 100 Ω'luk RL devresinin
  100 mA'i bu bobinin akım sınırıdır.
- *Model* ([`inductor.ts`](src/sim/devices/inductor.ts)): uç 0 ── R_dc ── L ── uç 1, MNA'da akım
  bilinmeyeniyle (dal satırı v_L − R_eş·i = sağ taraf). Yamukta R_eş = 2L/h, sağ taraf
  −R_eş·i(n) − v(n); geri Euler'de R_eş = L/h; doğru akımda kısa devre. Aşama 4'ün integrasyonu
  ve LTE denetimi (bobin akımı bir durum değişkenidir, akım toleransıyla). Sembol dört sarım
  (yarım daire), çizgi kalınlığı öbür sembollerle aynı. İnceleme panelinde endüktans, akım, uç
  gerilimi ve ½LI²; not, akımın arttığını ya da azaldığını L'nin kendi geriliminin işaretinden
  söyler.
- *Lenz yasası ve açılan anahtar (görev tanımından ayrılan yer):* tanım örnek olarak açık anahtara
  kaçak direnci ve kapasite koymayı öneriyor; ama bu, Fizik 2'deki "açık devrede akım tam 0"
  kuralını bozardı (açık anahtarlı devrede ampermetre 0 göstermezdi). Bunun yerine gerçek
  bobinin kendi **sargı kapasitesi** modellenir: C_p = 1/((2π·SRF)²·L) ≈ 9,0 pF (RLB1314-103KL'nin
  SRF'sinden; her endüktans için aynı alınır), uçlar arasında. Anahtar açılınca bobin akımı
  C_p'ye akar; gerilim enerji korunumuyla ≈ I·√(L/C_p)'ye çıkar (89 mA'de ≈ 3 kV; gerçekte bu
  gerilimde kontaklar arasında ark oluşur, ark modellenmez) ve SRF'de salınarak söner. Sonlu,
  NaN yok; açık anahtardan akım yine tam 0. C_p parazit ve serttir (100 Ω'da τ ≈ 1 ns): yamuk
  kuralı onda sönmeyen bir akım salınımı bırakıyordu, bu yüzden geri Euler ile çözülür
  (osiloskobun 25 pF'ı gibi); geri Euler'in sönümü ilk tepeyi ≈ %10 düşürür (2,70 kV; ideal
  2,98 kV) ve salınımı birkaç periyotta söndürür (gerçek bobinin SRF'deki çekirdek kayıplarına
  benzer). Anahtar açılınca başlayan hızlı salınımı baştan izleyebilmek için başlangıç adımı en
  büyük adımın on binde birine (5 ns) indirildi ve hata denetimi devreye girene kadar (geçmişte
  üç nokta) geri Euler kullanılır (yamuk kuralı denetimsiz başlangıç adımlarında diyot ekleminde
  ≈ %8'lik bir aşma yapıyordu).
- *Uyarı:* "Bobin akımı aniden kesildi: yüksek gerilim sıçraması (Lenz yasası)…". Bobin, devre
  değiştiği anda (ör. anahtar açıldı) akım taşıyorduysa kurulur ve o andan sonraki en büyük uç
  gerilimini tutar; bu, devredeki kaynakların ve kondansatörlerin başlangıç gerilimlerinin iki
  katını (en az 20 V) aşarsa uyarı çıkar ve devre yeniden değişene kadar kalır. Böylece seri
  RLC rezonansındaki yüksek gerilim ya da LC salınımı uyarı vermez. Serbest geçiş diyodu bağlıysa
  akım diyottan dolaşır, sıçrama bir diyot gerilimiyle (≈ −0,6 V) sınırlanır, uyarı çıkmaz.
- *Testler* (`tests/bobin.test.ts`, analitik değerlerle): RL dolma (10 V, 100 Ω, 10 mH) i(τ) =
  63,2 mA, i(5τ) %1 içinde; kararlı durumda ½LI² = 50 µJ; 50 Hz'te X_L = 3,1416 Ω ve etkin akım
  %1 içinde; bobinde gerilim akımdan 90° önde (1° içinde); LC (10 µF 10 V'ta, 10 mH ideal)
  periyot 1,987 ms (%0,5), tepe akım 0,316 A (%1), enerji bir periyotta en fazla %1 kayıp (yamuk
  kuralı enerjiyi korur); seri RLC'de akım f₀ = 503,3 Hz'te V/R ve komşu frekanslarda küçük;
  açılan anahtar: sıçrama sonlu, ideal değerin %85–100'ü, NaN yok, uyarı var; serbest geçiş
  diyoduyla tepe 1 V'un altında, uyarı yok; iki örneğin cevap metnindeki sayılar. ngspice
  karşılaştırmasına RL dolma (%0,007) ve LC salınımı (iki periyotta %0,36: yamuk kuralının
  50 µs'lik adımdaki küçük faz kayması) eklendi.
- *Örnekler:* "RL devresi" (10 V, anahtar, 100 Ω / 1 W, ideal ampermetre, 10 mH bobin, bobine
  voltmetre; τ = L/(R + R_L) ≈ 89 µs, son akım ≈ 89 mA) ve "Bobin ve serbest geçiş diyotu" (aynı
  devre, bobine ters paralel 1N4001).

### Yeni parçalar 1: transformatör (2026-10-17)

Kullanıcı simülatöre dört grup parça eklenmesini istedi (elektromanyetizma, ayarlı parçalar ve
sensörler, ses ve koruma, entegreler); sekiz aşama, her biri ayrı commit. Bu 1. aşama.

- *Parça:* "Transformatör" (pasif parçalar, etiket öneki T). Dört uç: birincil • ve birincil
  (solda), ikincil • ve ikincil (sağda); noktalı uçlar aynı anda aynı işaretli gerilimdedir.
  Özellikler: sarım oranı N₁ / N₂, birincil endüktansı L₁, kuplaj k (en fazla 0,999: k = 1'de
  endüktans matrisi tekil), birincil ve ikincil sargı dirençleri. Sembol: iki sargı (dört sarım),
  ortada demir çekirdek (iki çizgi), polarite noktaları.
- *Model* ([`transformer.ts`](src/sim/devices/transformer.ts)): iki sargı, her biri "sargı direnci
  + endüktans", MNA'da iki akım bilinmeyeniyle; v_L₁ = L₁·di₁/dt + M·di₂/dt, v_L₂ = M·di₁/dt +
  L₂·di₂/dt, M = k·√(L₁L₂), L₂ = L₁ / n². Yamuk kuralı ve LTE denetimi bobindeki gibi (dal
  satırlarına −cs·[[L₁, M], [M, L₂]]). Doğru akımda sargılar kısa devredir, ikincilde gerilim
  yoktur. Sargı kapasiteleri (C₁ = 100 pF, C₂ = C₁·n²; birincilin öz rezonansı ≈ 3 kHz, küçük
  şebeke transformatörlerindeki kHz mertebesi; veri sayfasında yok) akımı kesilen sargının
  gerilimini sonlu tutar ve geri Euler ile çözülür. Akımı aniden kesilince bobindeki Lenz uyarısı
  transformatöre de verilir (kendi metniyle). Çekirdek kaybı ve doyma modellenmez.
- *Varsayılanlar gerçek bir parçadan:* **RS PRO 504-464** (3 VA, 230 V → 12 + 12 V, baskı devre
  tipi; RS veri sayfası). Birincil sargı direnci 1167 Ω, ilk ikincil sargısı 14,8 Ω. Birincil
  endüktansı veri sayfasının kayıplarından: tam yükte bakır kaybı 1,05 W, ikincillerin payı
  (2 × 125 mA, 14,8 + 17,3 Ω) 0,50 W, birincilin akımı ≈ 21,7 mA; yükün yansıyan akımı (15,6 mA)
  çıkınca mıknatıslanma akımı ≈ 15 mA (veri sayfasının en büyük değeri 30 mA), L₁ = 230 V /
  (2π·50 Hz·15,1 mA) ≈ 48,5 H. Sarım oranı 16: yüksüz ≈ 14,2 V, sargı başına tam yükte (125 mA)
  ≈ 11,8 V, düzenleme ≈ %20 (veri sayfası: tipik < %22). Kuplaj 0,99 (küçük EI
  transformatörlerinde kaçak endüktans ≈ %1).
- *Galvanik yalıtım:* İki sargı ayrı iletken gruplar ve ayrı adalardır (`couplingPins`). Topraksız
  ikincil devre kendi sıfır noktasını alır (Mesajlar'da bilgi). Önce dört uç tek ada sayılıyordu:
  topraksız köprü doğrultmaçta dört diyot birden kesime girince ikincil tarafın ortak gerilimini
  yalnızca GMIN belirliyordu ve Newton-Raphson yakınsamıyordu. Örnek testleri artık yalnızca hata
  ve uyarıları "sorun" sayar (bilgi olabilir).
- *Testler* (`tests/transformator.test.ts`, 9 test): yüksüz ve 96 Ω yükte akım, gerilim ve faz
  fazör (karmaşık sayı) çözümüyle %0,5 ve 1° içinde; enerji korunumu (giriş gücü = yük gücü +
  sargı kayıpları, %0,5); neredeyse ideal transformatörde V₂ / V₁ = N₂ / N₁ (2, 10 ve 0,5 ile
  yükseltme); doğru akımda Faraday: anahtar kapanınca ∫ε dt = M·ΔI₁ (%1), kararlı durumda ikincilde
  gerilim yok; galvanik yalıtım (iki taraf arasındaki 100 V'luk farktan ortalama akım geçmez);
  üç örneğin metnindeki sayılar. ngspice karşılaştırmasına transformatör eklendi (iki bobin ve K
  bağlaşımı; açılıştan itibaren iki periyot, en büyük fark %0,0003).
- *Örnekler* (yeni grup "Elektromanyetizma"): "Transformatör: şebekeden 12 V" (230 V, 96 Ω yük,
  AC kipte ölçü aletleri; 11,8 V, 123 mA, birincilde 16,4 mA, verim ≈ %73), "Adaptör:
  transformatör, köprü ve filtre" (470 µF, 470 Ω: 15,8 V DC, 0,47 V dalgalanma, yüksüz 19,1 V),
  "Transformatörde doğru akım (Faraday)" (12 V ve anahtar; kapanışta ikincilde ≈ 0,74 V'tan
  τ = L₁/R₁ ≈ 42 ms ile sönen darbe, açılışta ≈ −270 V ve Lenz uyarısı).

### Yeni parçalar 2: röle (2026-10-17)

- *Parça:* "Röle" (anahtarlar, etiket öneki K). Beş uç: solda sargının iki ucu, sağda kontak:
  NK (normalde kapalı) ve NA (normalde açık) üstte, ortak uç C altta. Bu sıra, sargı ve kontak
  devrelerinin (kendini tutma, transistörlü sürücü) kablo kesişmeden çizilebilmesi için seçildi.
  Özellikler: sargı direnci, sargı endüktansı (palet açıkken), çekme ve bırakma gerilimi. Sembol:
  IEC röle sargısı (dikdörtgen, palet çekiliyken hafifçe dolu), kesikli çizgiyle bağlı değiştirme
  kontağı; dil bırakılmışken NK'ya, çekiliyken NA'ya değer. Kullanılmayan NA ya da NK boşta
  kalabilir (uyarı yok).
- *Model* ([`relay.ts`](src/sim/devices/relay.ts)): sargı bobindeki gibi (R + L, sargı kapasitesi
  100 pF), kontak C ile kapalı uç arasında 30 mΩ. Sargının akımı |i| çekme akımına (V_ç / R)
  ulaşınca palet çekilir, bırakma akımının (V_b / R) altına inince bırakılır (kuvvet akımın
  karesiyle orantılı: yön önemsiz). Palet çekilince hava aralığı kapanır, endüktans 1,15 H'den
  2,29 H'e çıkar; palet anında hareket eder ve akı bağı λ = L·i korunur: çekme anında akım yarıya
  düşer (gerçek rölelerdeki "akım çukuru"), bırakmada iki katına çıkar. Bu yüzden bırakma akımı
  çekme akımının en fazla 0,45 katı olabilir (yoksa palet aynı anda geri çekilirdi). Dal satırının
  sağ tarafı akı bağıyla yazılır (yamukta v_L − cs·L·i = −cs·λ(n) − v_L(n)). Paletin hareket süresi
  ve kontak sıçraması modellenmez. Akımı aniden kesilen sargıya bobindeki Lenz uyarısı (kendi
  metniyle) verilir; uyarı devre değişmeden de (transistör kesince) çıkar.
- *Eşik olayları (motor):* `Device.switching`, `eventFraction` ve `switchState`. Bir adımın
  çözümünde eşik aşılıyorsa (son kabul edilen adımdan doğrusal aradeğerle) adım, geçişin en fazla
  10 ns sonrasına kısaltılır (`EVENT_RESOLUTION`); geçiş adımın sonuna gelince bileşenin durumu
  değişir ve adım yeni durumla yeniden çözülür (LED'in yanması gibi), sonraki adım geri Euler'dir.
  Geçişten önceki çözüm de hata (LTE) denetiminden geçer: yoksa akımı kesilen sargının salınımı
  tek bir kaba adımla geçiliyor, sıçramanın tepesi adımlamaya göre 2 kV ile 5 kV arasında
  değişiyordu. Çekme anı analitik değerle 2 µs içinde.
- *Varsayılanlar gerçek bir röleden:* **Omron G2R-1, 12 V DC** (Omron veri sayfası; Farnell
  1648376): sargı 275 Ω ±%10 (43,6 mA, 0,53 W), endüktans (referans değer) palet açıkken 1,15 H,
  çekiliyken 2,29 H; çekme gerilimi en fazla %70 (8,4 V), bırakma gerilimi en az %15 (1,8 V);
  kontak direnci en fazla 30 mΩ. Eşikler veri sayfasının garanti sınırlarıdır. Anma geriliminde
  çekme süresi τ·ln(1/0,3) ≈ 5,0 ms (veri sayfası: en fazla 15 ms), diyotsuz bırakma µs'ler
  içinde (en fazla 5 ms); serbest geçiş diyoduyla ≈ 14 ms (diyodun bırakmayı geciktirdiği bilinir).
  Güncel G2R veri sayfasında endüktans satırı yok; değerler Farnell'deki eski Omron sayfasından.
- *Testler* (`tests/role.test.ts`, 9 test): çekme anı −τ·ln(1 − 0,7) ≈ 5,035 ms (2 µs içinde);
  çekmede akının korunması (akım L₁/L₂ oranında düşer) ve ardından τ = L_ç/R ile yükselme (%0,2);
  kontak akımları (NK 50 mA, NA 100 mA) ve sargıdan yalıtım; histerezis (8,3 V'ta çekmez, 8,5 V'ta
  çeker, 1,9 V'ta tutar, 1,7 V'ta bırakır); diyotsuz açılışta µs'de bırakma ve kilovoltluk sıçrama;
  serbest geçiş diyoduyla bırakma süresi (L·di/dt = −(R·i + V_D) tahmininin %15'i içinde) ve
  bırakmada akımın sıçraması; üç örneğin metnindeki sayılar.
- *Örnekler* ("Elektromanyetizma" grubuna): "Röle: yalıtılmış bir devreyi anahtarlamak" (12 V,
  anahtar, ampermetre, serbest geçiş diyodu; kontakta ayrı 9 V'luk pil, NA'da yeşil, NK'da kırmızı
  LED; ≈ 5 ms'de çeker, akım ≈ 15 mA'e düşüp 43,6 mA'e çıkar, ≈ 14 ms'de bırakır), "Röle sürücüsü:
  transistör ve serbest geçiş diyodu" (TTL 1 Hz, 4,7 kΩ, BC107; S2 ile diyot çıkarılınca
  kollektörde ≈ 5 kV ve Lenz uyarısı), "Kendini tutma (mühürleme) devresi" (BAŞLAT S1 ile NA
  kontağı paralel, DUR S2 seri).

### Yeni parçalar 3: DC motor (2026-10-17)

- *Parça:* "DC motor" (yeni kütüphane grubu "Çıkış elemanları"; etiket öneki M). İki uç (+ solda;
  akım + uçtan girince ileri döner), yönlü (ters çevrilebilir). Özellikler: yük torku (mN·m;
  canlı değiştirilebilir), sargı direnci ve endüktansı, tork sabiti k (mN·m/A), rotor ataleti J
  (g·cm²), sürtünme torku (mN·m); birimler veri sayfalarındaki gibi. Sembol: daire içinde M
  (IEC); dairedeki nokta milin dönüşünü gerçek hızın 1/100'üyle gösterir (simülasyon zamanıyla
  ilerler, ters dönüşte ters döner). Bilgi kutusu: hız (dev/dk), zıt EMK, akım, motor torku,
  yüke verilen güç; notu duruma göre (dönüyor, durmuş, jeneratör/frenleme).
- *Model* ([`motor.ts`](src/sim/devices/motor.ts)): elektriksel eşdeğer devre, ayrı bir mekanik
  çözücü yok. Mil denklemi J·dω/dt = k·i − T zıt EMK e = k·ω ile yazılınca (J/k²)·de/dt = i − T/k
  olur: sargının (R + L) akımı bir C_m = J/k² kapasitesini doldurur (kinetik enerji ½Jω² =
  ½C_m·e²). Sürtünme ve yük torku dönmeye karşı koyan doğrusal olmayan bir akım:
  (T/k)·tanh(ω/ω_s), ω_s = 0,1 rad/s (Newton-Raphson ile; durgun motorda yön değişimini
  yumuşatır, sürünme en fazla birkaç dev/dk). Uçlar arasında 1 nF (sargı ve fırça kapasitesi; veri
  sayfasında yok). Akımı kesilen motor boşta döner ve uçlarında zıt EMK görülür (jeneratör); kısa
  devre edilince akım ters döner ve motor frenlenir. Lenz uyarısı motora da (kendi metniyle).
- *Aşırı yük:* sargının bakır kaybı (R·I²) ısıl zaman sabitiyle (13 s, veri sayfası) ortalanır;
  sürekli çalışma sınırını (1,08 A, 2,4 W) aşınca "Motor zorlanıyor" uyarısı (`motor-overload`).
  Durmuş motorda (5,8 A) ≈ 0,5 s sonra çıkar; kalkıştaki kısa akım darbesi çıkarmaz.
- *Varsayılanlar gerçek bir motordan:* **maxon A-max 26 (110937; 12 V, 11 W, grafit fırçalı)**,
  maxon veri sayfası: R = 2,07 Ω, L = 0,227 mH, k = 13,9 mN·m/A, J = 13,6 g·cm², boşta 57 mA
  (sürtünme k·I₀ = 0,792 mN·m). Model veri sayfasını tutturuyor: boşta 8163 dev/dk (8190),
  kalkış ≈ 5,8 A (5,79 A), durma torku ≈ 79,8 mN·m (80,2), mekanik zaman sabiti 14,6 ms (14,6 ms),
  hız/tork eğimi 102 dev/dk/mN·m (103), 10 mN·m'de verim %80 (en yüksek verim %81).
- *Testler* (`tests/motor.test.ts`, 11 test): boşta hız ve akım; kalkış akımı ve τ_m'de %63,2; yük
  altında akım I₀ + T/k ve hız düşümü; enerji korunumu (pilin verdiği = bakır kaybı + sürtünme ve
  yük işi + ½Jω² + ½LI², %0,5); durma ve aşırı yük uyarısı; jeneratör olarak boşta dönme (hız
  sürtünmeyle doğrusal azalır, J·ω₀/T ≈ 1,47 s'de durur); 1 Ω'la dinamik frenleme (akım ters,
  τ = (R + 1 Ω)·J/k²); diyotsuz açılışta yüzlerce voltluk sıçrama, diyotla yok; üç örneğin
  metnindeki sayılar. ngspice karşılaştırmasına motor eklendi (R, L, C_m, uç kapasitesi ve
  sürtünme için B kaynağı; 12 V, 1 Ω seri, 5 mN·m yük, kalkıştan 60 ms: en büyük fark %0,07).
- *Örnekler* ("Elektromanyetizma" grubuna): "DC motor: kalkış akımı, zıt EMK ve yük" (12 V, S1,
  ampermetre, voltmetre; ≈ 5,6 A kalkış, boşta 57 mA ve 11,88 V zıt EMK, 10 mN·m'de 7130 dev/dk ve
  0,78 A, 100 mN·m'de durma ve uyarı), "Motor jeneratör olur: boşta dönme ve frenleme" (serbest
  geçiş diyodu, S2 ile 33 Ω fren direnci; boşta ≈ 1,5 s'de, frenle ≈ 0,5 s'de durur, akım ters
  ≈ 0,34 A), "Motorun yönü: H köprüsü" (dört anahtar; ileri/geri, dönerken yön değişince ≈ 11 A,
  aynı kolun iki anahtarı kısa devre).

### Yeni parçalar 4: manyetik alanı göster (2026-10-17)

- *Ayar:* Ayarlar → Akım → "Manyetik alanı göster" (varsayılan kapalı; tarayıcıda saklanır).
  Simülasyon çalışırken açılır; gösterimde (sol alt) ⊙ ve ⊗ açıklanır.
- *Kablolar* ([`MagneticField.tsx`](src/editor/MagneticField.tsx)): akım taşıyan her kablo
  parçasının iki yanında (9 px) ⊙ (alan sayfadan dışarı) ve ⊗ (sayfaya doğru) işaretleri;
  B = I·dl × r̂ (sağ el kuralı): akıma bakınca solda ⊙, sağda ⊗. Saat yönünde dönen bir akım
  halkasının içi hep ⊗ olur. Büyüklük akımın logaritmasıyla (1 µA'de görünmez, 1 mA'de yarı, 1 A'de
  tam): işaretler sıklaşır (40 px'ten 18 px'e) ve koyulaşır. Alan geleneksel akımdan çizilir
  (elektron akışı seçeneğinden bağımsız). AC devrede kablo renkleri ve akım noktaları gibi karenin
  ortalamasından: gerçek zamanda 50 Hz'in alanı ortalamada sönük görünür, yavaş çekimde yön
  değiştirdiği görülür.
- *Bobinler:* bobin ve röle sargısında, sargının içinden eksen boyunca geçen ve dışarıdan dönen
  kesikli alan çizgileri, oklar ve N, S kutupları (harfler parça dönse de dik). Sembolde sargı yönü
  belirsiz olduğu için sağ el kuralına uyan sargı varsayılır: alan sargının içinde akımın girdiği
  uçtan çıktığı uca doğrudur (N, akımın çıktığı uçta). Transformatörde çekirdeğin iki yanında akı
  okları; yönü ve büyüklüğü birincile indirgenmiş mıknatıslanma akımından (i₁ + i₂ / n).
- *Testler* (`tests/manyetik.test.ts`, 3 test): sağa akan akımın üstünde ⊙, altında ⊗, akım ters
  dönünce yer değiştirir; aşağı akan akımda ⊙ sağda (−ŷ × x̂ = +ẑ); yoğunluk akımla artar.

### Yeni parçalar 5: potansiyometre, LDR, NTC, akkor lamba (2026-10-17)

- *Kaydırıcı:* sayısal özelliğin altında kaydırıcı (`NumberPropDef.slider`; [`PropSlider.tsx`](src/editor/PropSlider.tsx)):
  potansiyometrenin konumu (%0–100), LDR'nin aydınlığı (0,1–100 000 lüks, logaritmik), NTC'nin
  sıcaklığı (−40…125 °C). Masaüstünde sürüklerken değer canlı uygulanır ve geçmişe yazılmaz
  (düzenleyicinin `preview` eylemi); bırakınca sürüklemeden önceki belge geçmişe eklenir (tek geri
  alma adımı). Telefonda bırakınca uygulanır.
- *Potansiyometre* (pasif parçalar, P; üç uç: 1. uç, sürgü, 3. uç): **Bourns PTV09A** 10 kΩ doğrusal
  (±%20, artık direnç en fazla %1, 0,05 W). R₁₂ = R_a + (R − 2R_a)·p, R₂₃ = R − R₁₂. Sembolde ok
  gövdeye konuma göre değer. Güç sınırı izin her bölümüne boyu oranında (en az %10) dağıtılır;
  aşılınca direncinki gibi uyarı (kendi metniyle).
- *LDR* (sensörler): **GL5528** (Senba GL55 veri sayfası): 10 lükste 10–20 kΩ (15 kΩ), karanlıkta
  en az 1 MΩ, γ = 0,6: R = R₁₀·(E/10 lx)^(−γ), karanlık direnciyle paralel. Tepki süresi (20/30 ms)
  modellenmez. Sembolde ışık okları aydınlıkla koyulaşır.
- *NTC termistör* (sensörler): **Vishay NTCLE100E3103** (10 kΩ, B₂₅/₈₅ = 3977 K); direnç
  üreticinin bu malzeme için verdiği R(T)/R₂₅ = exp(A + B/T + C/T² + D/T³) eğrisinden (veri sayfası
  tablosunu −40…100 °C'ta %0,2 içinde tutturur). Öz ısınma: δ = 7 mW/K, ısıl zaman sabiti 15 s.
  Isıl düğüm ortamın üstündeki ısınmadır: ortam sıcaklığı değişince termistör hemen uyar (gerçekte
  havada ≈ 15 s; simülasyonda beklememek için).
- *Akkor lamba* (çıkış elemanları, LP): 12 V 0,1 A minyatür lamba. Filaman sıcaklığı MNA'da bir iç
  düğüm (ısıl devre benzetmesi; [`thermal.ts`](src/sim/devices/thermal.ts)): C·dT/dt + P_kayıp(T) =
  V²/R(T), elektrikle birlikte Newton-Raphson ile; NTC aynı çözümü kullanır. Veri sayfaları soğuk
  direnci ve ısıl zaman sabitini vermediği için tungstenden türetildi: ρ ∝ T^1,215 (Desai ve diğ.
  1984), anma sıcaklığı 2500 K (uzun ömürlü vakumlu lamba) → soğukken 8,9 Ω, sıcakken 120 Ω (13,5
  kat); ışınımla kayıp k·(T⁴ − T₀⁴); ısı sığası filamanın kütlesinden (anma değerlerini verecek tel:
  ≈ 16 µm, 35 mm; salım oranı 0,3, 0,15 J/(g·K)) ≈ 2,1·10⁻⁵ J/K, ısıl zaman sabiti ≈ 11 ms. Işık ∝
  (T/T_n)^8,9 (Φ ∝ V^3,4); sembolde akkor rengiyle parlar. 3695 K'de filaman erir: lamba yanar
  (açık devre, `lamp-burned`, Onar ile düzelir). LED'e özel "Onar" yerleri genelleştirildi.
- *Testler* (`tests/sensorler.test.ts`, 16 test): potansiyometrenin yüksüz ve yüklü bölücüsü, güç
  uyarısı; LDR'nin 10 lüks, γ ve karanlık direnci; NTC eğrisinin veri sayfası tablosu (−40, 0, 50,
  100 °C) ve B değeri, bölücüde ortam değişimi, öz ısınmanın zaman sabiti; lambanın anma akımı ve
  sıcaklığı, soğuk direnci, ilk an akımı (≈ 1,35 A), enerji korunumu (pil = ışınım + C·ΔT, %0,5),
  6 V'ta akım (V ∝ T^2,6), 36 V'ta kopma, 18 V'ta kopmama; dört örneğin metnindeki sayılar.
- *Örnekler* (yeni grup "Ayarlı parçalar ve sensörler"): "Potansiyometre: ayarlı gerilim bölücü"
  (9 V; sürgüde voltmetre ve 4,7 kΩ + LED; yükleme: %50'de 4,5 V yerine 3,57 V), "LDR ile gece
  lambası" (100 kΩ + LDR bölücüsü, BC107; ≈ 40 lüksün altında yanar), "NTC ile termometre" (5 V,
  10 kΩ; −20 °C'ta 0,47 V … 100 °C'ta 4,68 V), "Akkor lamba: ilk an akımı" (1 Ω ölçme direnci ve
  osiloskop; ≈ 1,21 A'den ≈ 6 ms'de 0,2 A'in altına).

### Yeni parçalar 6: hoparlör, buzzer, sigorta (2026-10-17)

- *Ses* ([`audio.ts`](src/editor/audio.ts), npm bağımlılığı yok): WebAudio ile. Her karede
  simülasyonun ilerlediği aralığın sesi hazırlanıp ≈ 90 ms gecikmeyle çalma sırasına eklenir
  (AudioBufferSource parçaları). Hoparlörün sesi adım adım kaydedilen zar ivmesidir (ses kartının
  hızına doğrusal aradeğerle); aktif buzzerin osilatörü simülasyonda olmadığından ses 2400 Hz'lik
  ton olarak üretilir (genlik uç gerilimiyle, ≈ 3 V'un altında sessiz). Yumuşak kırpma (tanh). Ses
  yalnızca ×1 hızda ve simülasyon yetişirken çalar; ses bağlamı Oynat'a basınca açılır (tarayıcı
  kuralı). Ayarlar → "Sesi çal (hoparlör, buzzer)" (varsayılan açık).
- *Hoparlör* (çıkış elemanları, HP): **Visaton FRS 5 (8 Ω)** veri sayfası: R_dc 7,2 Ω, L 0,2 mH,
  f_s 290 Hz, Q_ms 3,19, Q_es 1,81, 5 W, 84 dB (1 W, 1 m). Thiele-Small elektriksel eşdeğeri: R_e +
  L_e ile seri, paralel C_mes = Q_es/(2πf_sR_e) ≈ 138 µF (kütle), L_ces ≈ 2,18 mH (askı), R_es =
  R_e·Q_ms/Q_es ≈ 12,7 Ω (kayıplar). Ses basıncı C_mes'in akımıyla (zarın ivmesi) orantılı; ses
  düzeyi (1 m) bundan: 1 kHz'te 1 W'ta 84 dB. Empedans rezonansta ≈ 19,9 Ω. Ortalama güç (2 s ısıl
  ortalama) anma gücünü aşınca uyarı (doğru akım da bobini ısıtır). Bilgi kutusu: gerilim, akım,
  ortalama güç, ses basıncı (1 m). Sembol: mıknatıs ve koni; çalarken üstünde ses dalgaları.
- *Aktif buzzer* (çıkış elemanları, BZ; kutuplu): **Same Sky (CUI) CMI-1295IC-0585T**: 5 V'ta
  30 mA, 4–7 V, 2400 Hz, 10 cm'de 85 dB. Elektriksel model: iç sürücünün eklemi (diyot) + seri
  direnç: ters bağlanınca akım geçmez. Ses basıncı 85 dB + 20·log(V/5 V).
- *Sigorta* (anahtarlar ve koruma, F): **Littelfuse 217, 1 A hızlı** (ürün sayfası: soğuk direnç
  0,09635 Ω, erime I²t 1,042 A²s). Telin ısınması τ·dθ/dt = (I/I_min)² − θ (θ = 1'de erir), τ =
  I²t/I_min², en küçük eritme akımı I_min = 1,8·I_n: IEC 60127-2 hızlı sigorta noktalarını tutar
  (2,75·I_n'de 0,18 s, 4·I_n'de 73 ms, 10·I_n'de 10,6 ms; 1,5·I_n'de atmaz). Erime anı motorun
  eşik olaylarıyla bulunur; atan sigorta açık devredir (`fuse-blown`, Onar ile yenisi). Sigortalı
  dirençli bir devre de zamanla çözülür (telin ısısı bir durumdur).
- *Testler* (`tests/ses.test.ts`, 9 test): hoparlörün empedansı 290 Hz ve 1 kHz'te fazör çözümüyle
  (%1, 1°), 1 W'ta ses örneklerinin ölçeği, doğru akımın ses vermemesi ve aşırı güç uyarısı;
  buzzerin 5 V'ta 30 mA ve 85 dB'i, 2,5 V'ta sessizliği, ters bağlantıda akımsızlığı; sigortanın
  atma süreleri (ısıl denklemle %3 içinde) ve 1,5 A'de atmaması, Onar; üç örneğin sayıları.
- *Örnekler* (yeni grup "Ses ve koruma"): "Hoparlör: elektrikten ses" (fonksiyon üreteci 440 Hz;
  ≈ 79 dB, rezonansta ≈ 83 dB, 100 Hz'te ≈ 57 dB), "Sıcaklık alarmı: NTC ve buzzer" (≈ 54 °C'ın
  üstünde öter), "Sigorta: kısa devrede devreyi açar" (12 V akü, 6 W lamba; kısa devrede ≈ 76 A,
  0,17 ms'de atar; lambanın ≈ 5,7 A'lik ilk an akımı attırmaz).

### Yeni parçalar 7: işlemsel yükselteç (2026-10-17)

- *Parça:* "İşlemsel yükselteç" (yeni kütüphane grubu "Entegreler"; etiket öneki U). Beş uç: eviren
  (−) giriş sol üstte, evirmeyen (+) sol altta, çıkış sağda, V+ üstte, V− altta; besleme uçları
  bağlanmalıdır. Sembol: üçgen, içinde "741"; ad sağ üst köşede (üstte V+, sağda çıkış kablosu var).
- *Değerler* **TI LM741** veri sayfasından (±15 V, tipik): A = 200 V/mV, giriş 2 MΩ, yükselme süresi
  0,3 µs → birim kazanç bant genişliği 0,35/0,3 µs ≈ 1,17 MHz (veri sayfasının formülü), eğim hızı
  0,5 V/µs, kısa devre akımı 25 mA, besleme akımı 1,7 mA, salınım 10 kΩ'da ±14 V, 2 kΩ'da ±13 V. Bu
  iki salınım noktasından raylara uzaklık H ≈ 0,73 V ve çıkış direnci ≈ 196 Ω. (TI'ın 2026'da
  yayımladığı yeni µA741 veri sayfası başka bir yongayı anlatıyor: 540 GΩ giriş, ±14,95 V salınım;
  okullardaki klasik bipolar 741 için LM741 alındı.) Giriş kayma gerilimi (1 mV) ve kutuplama akımı
  (80 nA) modellenmez.
- *Model* ([`opamp.ts`](src/sim/devices/opamp.ts), davranışsal, tek kutuplu): kazanç düğümü y (iç
  düğüm) τ·dy/dt = A·v_d − y, τ = A/(2π·GBW) ≈ 27 ms (baskın kutup ≈ 5,8 Hz); dy/dt yumuşak olarak
  eğim hızıyla sınırlı (S·tanh(u/(S·τ))): giriş katı v_d ≈ 70 mV'ta doyar, 1 mV'luk farkla çıkış
  eğim hızıyla değil 2π·GBW·v_d ≈ 7 V/ms ile değişir (gerçek 741 gibi). y raylardan 1 V'tan fazla
  uzaklaşamaz (doyumdan çabuk çıkış). Çıkış katı: y raylar arasına (V− + H, V+ − H) yumuşakça
  kırpılır (köşe genişliği 50 mV), akım I_ks·tanh(ΔV/(R_o·I_ks)); verilen akım V+ ucundan, çekilen
  V− ucundan gelir (beslemenin akımı doğru). Girişler arasında 2 MΩ, besleme uçları arasında
  1,7 mA'lik yük. Hepsi Newton-Raphson ile birlikte çözülür. Bilgi kutusu: giriş farkı, çıkış
  gerilimi ve akımı, durum (doğrusal, pozitif/negatif doyum, eğim sınırı, akım sınırı) ve duruma
  göre not.
- *Testler* (`tests/opamp.test.ts`, 10 test): evirmeyen (×11; hata ≈ kazanç/A) ve eviren (×−10,
  sanal toprak < 100 µV) yükselteç; 10 kΩ'da +14 V, 2 kΩ'da +13 V doyum (veri sayfası); eğim hızı
  (%5) ve küçük farkta 2π·GBW·v_d; 100 kHz'te kazanç 11/√(1 + (11f/GBW)²) (%3); kısa devrede 25 mA
  ve akımın V+'tan çekilmesi; üç örneğin sayıları.
- *Örnekler* (yeni grup "Entegreler"; şemalarda uç sırası yüzünden iki zorunlu kesişme): "Evirmeyen
  yükselteç (741, ×11)" (fonksiyon üreteci, AC voltmetreler: 0,354 V → 3,889 V; 3 V t-t'de ±14,2 V'ta
  kırpılma; 20 kHz'te eğim sınırı), "Eviren yükselteç ve sanal toprak" (1,5 V → −8,40 V; R2 = 100 kΩ'da
  doyum), "Karşılaştırıcı: LDR ile ışık eşiği" (7,5 V eşik, ≈ 19,7 lüks; ters paralel yeşil/kırmızı LED,
  çıkış LED yüküyle ±12,2 V).

### Yeni parçalar 8: 555 zamanlayıcı (2026-10-17)

- *Parça:* "555 zamanlayıcı" (Entegreler, U). Sekiz uç veri sayfasının sırasıyla (GND, TRIG, OUT,
  RESET, CONT, THRES, DISCH, VCC); sembolde solda DISCH, THRES, TRIG (zamanlama kolu sırasıyla),
  sağda OUT, üstte VCC ve RESET, altta GND ve CV; kutuda uç adları ve "555"; çıkış yüksekken OUT'un
  yanında sarı nokta.
- *Model* ([`timer555.ts`](src/sim/devices/timer555.ts)), **TI NE555** veri sayfası (SLFS022K):
  VCC–CONT–iç düğüm–GND arasında üç 5 kΩ (eşikler 2/3 ve 1/3 V_CC), RESET 0,7 V; flip-flop: TRIG <
  1/3·V_CC → yüksek (öncelikli), THRES > CONT → düşük, RESET → düşük. Çıkış yüksekte V_CC − 0,9 V
  arkasında 8 Ω (100 mA'de V_CC − 1,7 V, 200 mA'de − 2,5 V), düşükte 0,025 V arkasında 7,5 Ω (10 mA'de
  0,1 V, 50 mA'de 0,4 V); deşarj anahtarı 19 Ω (8 mA'de 0,15 V); besleme akımı bölücü + 1,67 kΩ (15 V'ta
  10 mA, 5 V'ta 3 mA). Geçişler motorun eşik olaylarıyla 10 ns içinde bulunur (zamanlama doğru);
  çıkışın 100 ns'lik yükselme süresi ve girişlerin nA'lik akımları modellenmez. Deşarj anahtarının
  gerilimi gerçekteki gibi düşük süreyi uzatır: R_A = 1 kΩ, 9 V'ta ≈ 0,17 V, düşük süre ln2·R_B·C
  yerine (R_B + R_ds)·C·ln((2V/3 − V_d)/(V/3 − V_d)) (%4 uzun; 1 kHz'lik devre 1008 değil ≈ 990 Hz).
- *Testler* (`tests/timer555.test.ts`, 8 test): astabilde ilk yüksek süre RC·ln3, yüksek ve düşük
  süre (%1), 1 kHz'lik devrenin frekansı, kondansatörün 1/3–2/3 V_CC arasında salınması, RESET;
  monostabil süresi RC·ln3; 15 V'ta çıkış seviyeleri (100 mA'de 13,3 V, 10 mA'de 0,1 V) ve besleme
  akımı (10 mA); üç örneğin sayıları.
- *Örnekler* ("Entegreler"): "555 ile yanıp sönen LED (astabil)" (1 kΩ, 68 kΩ, 10 µF; ≈ 1 Hz,
  kondansatörde voltmetre 3–6 V), "555 ile zamanlayıcı (monostabil)" (S1 ile tetik, 100 kΩ ve 47 µF:
  5,16 s), "555 ile ses (hoparlör)" (1 kΩ, 10 kΩ, 68 nF; ≈ 990 Hz, 100 µF ve 47 Ω üzerinden hoparlöre;
  1 s'lik simülasyon ≈ 0,2 s'de: ses kesintisiz çalar).

### Editör

- **Bağlantı kuralları:** Aynı noktadaki pinler ve kablo köşeleri bağlıdır. Bir kablonun ucu
  başka bir kablonun ortasına denk gelirse bağlanır (T bağlantısı, dolu nokta). Köşesiz
  kesişen kablolar ve bir kablonun ortasından geçtiği pinler bağlı değildir. Bağlanmamış
  pinler ve kablo uçları küçük halkayla gösterilir.
- **Kablo çekme:** Pinden pine tıklanır; araya yatay/dikey (L biçimli) yol otomatik çizilir.
  Kablo aracında (W) boş bir noktadan ya da bir kablonun üzerinden de başlanabilir.
- **Yerleştirme:** Kütüphaneden seçilen parça bir kez yerleştirilir ve seçme aracına
  dönülür; Shift + tıklama ile art arda yerleştirilir.
- **Taşıma:** Parçaya bağlı kablolar esner; esneyen kablo parçasına T ile bağlı kablolar da
  onu izler. Seçili bir kablo parçası sürüklenince kendine dik yönde kayar.
- **Döndürme ve ters çevirme (kullanıcı kararı):** R parçayı her basışta 90° döndürür ve bağlı
  kablolar pinleri izler; bağlantı hiçbir zaman değişmez. Kablonun parçanın yakınındaki kuyruğu
  atılır ve ondan önceki ilk köşeden yeni pine, parçanın gövdesinden geçmeyen yatay/dikey bir
  yol çizilir (yalnızca ucu kaydırmak 180°'de kabloyu gövdenin üstünden geçirip parçayı kısa
  devre edebilirdi). Dört dönüşten sonra kablolar başlangıçtaki haline döner. Yönlü parçalarda (diyot, LED, pil,
  voltmetre, ampermetre) ayrı bir **Ters çevir** komutu (F, sağ tık menüsü) vardır: parça 180° döner,
  uçları yer değiştirir ve kablolar yerinde kalır; böylece ör. diyot devrede gerçekten ters bağlanır.
  Kondansatör de + ucu işaretli olduğu için yönlüdür ama istenen listede olmadığından ters
  çevrilemez (gerekirse `catalog.ts` → `polarized: true`).
- **Otomatik kayıt (kullanıcı isteğiyle Aşama 3'e alındı):** Devre her değişiklikten 0,4 s
  sonra ve sayfa kapanırken `localStorage` içine (`devre-simulatoru:devre`) yazılır; açılışta
  okunur. Bozuk ya da tanınmayan veri sessizce yok sayılır. Ayarlar ayrı anahtarda tutulur.
- **Dokunmatik ekran ve iOS Safari:**
  - Telefonda (< 900 px) ve tablette (dokunmatik, ≥ 900 px) tuvalde üç kip vardır: **Kur** (dokun:
    seç; parçayı 150 ms basılı tutup sürükle: taşı, daha önce kayarsa tuval kayar; uca dokun: Bağla;
    basılı tut: menü ve büyüteç), **Bağla** (uçlar 44 pt etiketli hedefler; iki dokunuş kablo; yol,
    iki L seçeneğinden parçaların gövdesinden daha az geçenidir) ve **Ölç** (yapı kilitli).
    Kalabalık bir noktada parmağın altında birden çok "sahip" varsa (bir uca bağlanan kablo o
    parçayla aynı sahip sayılır) "Burada N öğe var" seçicisi açılır.
  - Telefonda tek alt sayfa vardır (peek / yarım / tam). Sayfa tuvalin üstüne binmez: tuval sayfanın
    üst kenarında biter ve devre kalan alana yeniden sığar (kullanıcı yakınlaştırdıysa yalnızca
    seçili parça görünür tutulur). Tutamaçtan ya da başlık satırından çekilen sayfa parmağı izler,
    bırakınca en yakın boya oturur (en küçüğün altına çekilirse kapanır); çekerken tuval yeniden
    sığdırılmaz. Parça ekle sayfası pencerenin ≈ %60'ı kadar açılır ve yukarı çekilince tam boy
    olur (kullanıcı isteği); kategori çiplerinin kaydırma çubuğu gizlidir, sağ kenar solar.
    Boş tuval ipucu ("Örneklerden başla") telefonda ekranın ortasına sabittir: sayfa açılıp
    çekildikçe yeri ve boyu değişmez, sayfa üstüne biner (kullanıcı isteği); tam boy sayfada gizlenir. Karartmalı sayfalar (Dosya, ⋯, Örnekler) açıkken tuvalin
    `touch-action` değeri kaldırılır; WebKit, `touch-action: none` bölgesini üstüne binen katmanlara
    da uygulayabiliyor.
  - Tuvalin tüm çizimi olay almaz (`pointer-events: none`); hedef her zaman SVG'dir. Dokunmatikte
    işaretçi dokunulan öğeye örtük olarak yakalandığı için, yeniden çizilen bir alt öğe sürüklemeyi
    koparabilirdi.
  - iOS Safari dokunuşları sayfaya yalnızca o olay türünü dinleyen bir öğenin alanında iletir.
    React dinleyicilerini Astro'nun kutusuz (`display: contents`) `astro-island` öğesine bağladığı
    için bu alan boş kalabiliyor ve tuvale hiçbir işaretçi olayı gelmiyordu. Bu yüzden belgeye boş ve
    pasif dokunma/işaretçi dinleyicileri bağlanır; SVG'ye de doğrudan, varsayılanı engelleyen
    `touchstart`/`touchmove` dinleyicileri bağlanır. Parça sayfasında basılı tutup sürüklerken
    listenin `touchmove`'u da etkin bir dinleyiciyle engellenir.
  - Birincil işaretçi her basıldığında eski işaretçi kayıtları silinir; kaçırılmış bir `pointerup`
    yüzünden tek parmağın iki parmak sanılıp tuvalin kıstırma kipinde takılması önlenir.
  - Dokunma hedefleri en az 44 px, giriş alanlarının yazısı 16 px'tir (iOS daha küçük yazılı alana
    odaklanınca sayfayı yakınlaştırır). Arayüzde çift dokunuşla sayfa yakınlaşmaz
    (`touch-action: manipulation`), sayfa esneyip kaymaz (`overscroll-behavior: none`); güvenli
    alanlar (`viewport-fit=cover`, `env(safe-area-inset-*)`) gözetilir.
  - **Kontrol listesi:** Tuvale, alt sayfalara, pencerelere ya da olay işleyicilerine dokunan her
    değişiklikten sonra `npm run dev` (ya da `npm run build && npm run preview`) açıkken
    `npm run ios-kontrol` çalıştırılır (`scripts/ios-kontrol.mjs`; yayındaki siteyi denemek için
    adresi ver: `npm run ios-kontrol -- https://yigitkasap.github.io/devre-simulatoru/`). Chromium'un
    iPhone öykünmesiyle telefon (390×844, 375×667, yatay 844×390), tablet ve masaüstünde 140 madde
    dener ve bir madde kalırsa hata koduyla çıkar. Öykünme yukarıdaki dokunma alanı hatasını
    göremiyordu; bu yüzden listenin ilk bölümü bu kuralların yerinde durduğunu doğrudan denetler.
    `playwright-core` bu projeye kurulu değildir; yolu `PLAYWRIGHT_CORE` ortam değişkeniyle verilir.
    Dokunmatik davranışı değiştiren işler ayrıca gerçek bir iPhone'da denenmelidir.
- **Kütüphanenin bilgi alanı:** Masaüstünde kütüphanenin altında, fareyle üzerine gelinen (ya da
  yerleştirilmekte olan, seçili) parçanın açıklaması gösterilir; telefonda yoktur.
- **Sabit boyutlar (kullanıcı isteği, 2026-10-17):** Yazısı değişen bileşenler yazıyla büyüyüp
  küçülmez, çünkü değişen boy yanındaki öğeleri kaydırıyor ve fareyle gezinmeyi bozuyordu.
  Kütüphanenin bilgi kutusunda bütün açıklamalar aynı ızgara hücresinde üst üste durur (görünmeyenler
  gizli): kutu en uzun açıklama kadardır ve sabit kalır; ekran okuyucu için ayrı bir canlı bölge
  vardır. Hız penceresinin alt cümlesi iki satırlık sabit yükseklikte, hız düğmesindeki değer ve not
  sabit genişlikte; simülasyon çubuğu sabit yükseklikte (darda iki satır), iletisi tek satır (tamamı
  ipucunda) ve yanında düğme olsa da olmasa da 32 px yüksekliğinde, zaman göstergesi sabit
  genişlikte; baraj Durum tablosunun satırları sabit yükseklikte. Denetim: tarayıcıda her öğenin
  yüksekliği izlenir (ResizeObserver); kütüphanede bütün parçaların üzerinde gezinme, hız sürgüsü,
  29 örneğin çalıştırılması ve baraj seviyeleri boyunca boyu değişen öğe kalmaz. ios-kontrol'de iki
  madde (bilgi kutusu ve hız penceresi).
- **Yükleme:** Örnek açmak, JSON içe aktarmak, paylaşım bağlantısı açmak ve "Yeni devre"
  mevcut devrenin yerine geçer ama geri alma geçmişine girer. Bu yüzden onay sorulmaz; bildirimde
  5 saniye Geri al düğmesi durur (Ctrl+Z ve alt çubuktaki Geri al da çalışır).

### Simülasyon ve animasyon

- **Yapı değişikliği:** Parça ya da kablo eklemek, silmek, taşımak ya da döndürmek
  simülasyonu durdurur. Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz;
  kondansatör gerilimleri ve yanmış LED'ler korunarak devre yeniden derlenir.
- **Hız:** Kaydırıcı logaritmiktir (×10⁻⁶ … ×1) ve ×1, ×0,5, ×0,1, ×0,05, ×0,01, ×10⁻³ …
  ×10⁻⁶ değerlerine yapışır. Bir karede en fazla 6000 adım atılır; bilgisayar yetişemezse
  simülasyon gerçek zamandan geri kalır (donmaz) ve alt çubukta "gerçek zamana yetişemiyor"
  uyarısı çıkar (son karelerin yarısından çoğu adım sınırına takıldıysa).
- **Kablo akımları:** Çözücü kabloları tek düğümde birleştirdiği için kablo parçası
  başına akım ayrıca bulunur: pinlerin akımları bir kapsayan ağaç üzerinde toplanır, toprak
  sembolleri kendi kablo adasındaki dengesizliği karşılar. Kablolar kendi aralarında döngü
  oluşturuyorsa döngüyü kapatan parçada nokta gösterilmez.
- **Akım noktalarının hızı:** 8 + 22·log₁₀(I / 1 µA) piksel/s, 4 ile 150 arasında
  sınırlı (1 µA ≈ 8, 1 mA ≈ 74, 1 A ≈ 140). 10 nA'in altında noktalar hareketsizdir:
  ters diyot sızıntısı ve gmin kaynaklı 10⁻¹¹ A düzeyindeki akımlar gösterilmez, 10 MΩ'luk
  voltmetrenin çektiği µA düzeyindeki akım gösterilir (kullanıcı kararı). Nokta hızı
  simülasyon hızı ayarından bağımsızdır; yalnızca akımın büyüklüğünü gösterir (kullanıcı kararı).
- **Kablo rengi:** Ton (hue) üzerinden mavi (−Vmax) → yeşil (0 V) → sarı/turuncu → kırmızı
  (+Vmax). Vmax, devredeki en büyük pil gerilimidir. Gerilimi belirsiz (toprağa bağlı olmayan)
  kablolar gri ve kesiklidir. Ayarlardan renk körlüğüne uygun ölçek (mavi – gri – turuncu)
  seçilebilir.
- **Kondansatör çubuğu:** |V| / Vmax oranında dolar; kırmızı: + ucu yüksek, mavi: ters
  yönde dolu. Dikey kondansatörde aşağıdan yukarı dolar.

### Ölçü aletleri ve eğitsel özellikler

- **Ölçü aleti ekranı:** Otomatik ölçekli (V/mV/µV, A/mA/µA), 4 anlamlı basamak; yuvarlama
  bir basamak eklerse (9,9999 → 10,00) basamak sayısı korunur. Voltmetre v(+) − v(−),
  ampermetre + uçtan giren akımı gösterir; ters bağlanırsa değer eksi çıkar. Ekran yatay
  alette üstte, dikey alette sağdadır; o tarafta başka bir parça varsa karşı tarafa açılır.
- **Canlı ölçüm (İnceleme paneli, telefonda alt sayfa):** Simülasyon çalışırken ya da
  duraklatılmışken seçili parçanın değerleri gösterilir. Pasif bileşenlerde gerilim ve akım büyüklük olarak (yönü noktalar gösterir), pilde
  ve ölçü aletlerinde işaretiyle yazılır. Dirençte Ohm yasası, iç dirençli pilde
  V = E − I·Riç kontrolü, kondansatörde depolanan enerji, ölçü aletlerinde iç direncin
  etkisi gösterilir.
- **Mesajlar sekmesi:** Topoloji kontrolleri devre her değiştiğinde (simülasyon durdurulmuşken
  de) çalışır. Sekme, kurulum sırasında sık çıkan "boşta uç" uyarılarıyla kendiliğinden öne
  gelmez; simülasyon hatası ya da yeni bir çalışma uyarısı (kısa devre, yanan LED) gelince öne
  gelir (odak alınmaz). Tuvaldeki rozetler yalnızca simülasyon çalışırken ya da başlayamayınca
  çıkar. Simülasyon başlatılamazsa hatanın parçaları vurgulanır. Vurgulanan parça ekran
  dışındaysa görünüm ona kaydırılır.
- **Yanmış LED:** Yanında açıklama balonu çıkar (Kapat / Onar). Sağ tık menüsünde "Onar"
  vardır; Durdur da onarır. Devre değişmediyse onarılan LED yeniden yanar.
- **Sağ tık menüsü:** Parçalarda Özellikler, Döndür, Ters çevir (yönlü parçalarda), Sil (ve
  yanmış LED'de Onar).
- **Formüllerde alt simge (kullanıcı isteği):** Metinlerde alt simge `_{...}` ile işaretlenir
  (`R_{iç}`, `V_{f}`) ve ekranda gerçek alt simge (`<sub>`) olarak çizilir
  ([`editor/Rich.tsx`](src/editor/Rich.tsx)).

### AC kaynak, osiloskop ve DC/AC kipi

- **AC kaynak:** e(t) = kayma + tepe · dalga(f · t); sinüs, kare ve üçgen t = 0'da ilk yarım
  periyodun başındadır. İç yapı pil ile aynıdır (iç direnç, iç düğüm). Kaynağın matris katkısı
  sabittir, yalnızca sağ taraf her adımda değişir; doğrusal devrelerde LU yine bir kez yapılır.
  Frekans en fazla 2 MHz'tir.
- **Zaman adımı:** AC kaynaklı devre kondansatörsüz de olsa adım adım çözülür; en büyük adım
  50 µs ile en kısa periyodun 1/50'sinden küçük olanıdır (1 kHz'te 20 µs, 1 MHz'te 20 ns). Bu bir
  üst sınırdır; kondansatörlü ve yük modelli devrelerde adım bunun altında uyarlanır (Fizik 4).
  Periyot başına 50 adım düzgün bir dalga ve doğru tepe değerleri için yeterlidir; 1 kHz'i
  gerçek zamanda izlemek saniyede 50 000 adım ister (dört diyotlu köprüde motor ≈ 180 000
  adım/s atabiliyor). Kare ortalamaları (renkler, noktalar) her adımda değil, periyot başına
  ≈ 25 örnekle alınır.
- **Ölçü aletlerinin kipi (kullanıcı kararı):** Voltmetre ve ampermetrede DC (ortalama) ve AC
  (etkin değer, √(ortalama v²), DC bileşen dahil) kipi vardır. AC kaynaklı devrede gösterge
  devredeki AC kaynakların en uzun periyodu üzerinden hesaplanır ve her periyotta bir
  güncellenir (rakamlar sinyalle titremez). AC kaynak yoksa gösterge anlık değerdir (AC kipinde
  büyüklüğü); eski devreler aynı davranır. AC kipinde değerin sonuna "~" eklenir (7,071 V~).
- **AC'de tuvaldeki çizim:** Kablo renkleri, akım noktaları ve kondansatör çubuğu her animasyon
  karesindeki ortalamadan çizilir; anlık değer kare hızında örneklenince titrer ya da yanıltıcı
  biçimde yavaş dalgalanırdı. LED parlaklığı ayrıca 60 ms'lik bir yumuşatmadan geçer (göz hızlı
  yanıp sönmeyi ortalama parlaklık olarak görür); simülasyon yavaşlatılınca LED'in yanıp söndüğü
  görülür. Kısa devre uyarısı AC kaynakta son periyodun tepe akımına bakar.
- **Osiloskop (kullanıcı kararı: ayrı panel, iki kanal + ortak uç):** Girişleri idealdir (akım
  çekmez); kullanılmayan A ya da B kanalı uyarı vermez, boşta ortak uç verir. Kayıt ekran
  çözünürlüğünde kovalara (bir ekran = 500 kova) bölünür, her kovada en küçük/en büyük/son değer
  tutulur; ekrandan hızlı sinyal bant olarak görünür. Dört ekranlık geçmiş saklanır.
- **Tetikleme:** Tetik kanalının orta seviyesi ((en küçük + en büyük) / 2), %10'luk ölü bantla
  yukarı yönde kesildiği en son an, ardından tam bir ekranlık kayıt varsa ekranın sol kenarıdır;
  kesim yoksa ekran kayar. Frekans, kayıttaki ardışık kesimlerden ölçülür.
- **Oto ayar:** Ekranda ≈ 2,5 periyot görünecek zaman/bölme ve sinyalin ±3,5 bölmeye sığacağı
  volt/bölme (1-2-5 dizisi); kayıt yoksa devredeki AC kaynağın frekansı ve kaynak gerilimleri.
- **Ön panelin yeri:** Masaüstünde tuvalin altındaki cihaz rafında (yan yana ya da tek tek,
  tutamaçtan büyütülür), tablette İnceleme panelinin Cihazlar sekmesinde, telefonda Cihazlar alt
  sayfasında. Ayarlar parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri alınabilir;
  simülasyonu durdurmaz). Raf ya da sayfa açılıp kapanınca devre kalan alana yeniden sığdırılır.

### Laboratuvar cihazları (föy için 1. aşama)

Fizik 2. sınıf Elektronik Laboratuvarı föyündeki dokuz deney ve laboratuvardaki cihazlar
(Protek 6502A / Matrix MOS-620CH osiloskop, GW Instek GFG-8015G fonksiyon üreteci, DC güç
kaynağı) esas alındı.

- **Şebeke toprağı:** Bir cihaz modeli `earthPin` ile bir ucunu (COM) şebeke toprağına
  bağlayabilir: derleyici bu ucu devrenin toprak düğümüne birleştirir. Topraklı bir cihaz varsa
  devrede toprak sembolü gerekmez; akım çizgesinde bu uç toprak hattının bir ucudur (Fizik 3). Bu sayede
  laboratuvardaki **toprak tuzağı** gerçekten oluşur: köprü doğrultmaçta prob toprağını yükün
  eksi ucuna takmak, üretecin COM'u ile birleşip bir diyodu kısa devre eder ve ekranda yarım
  dalga görülür. Doğru ölçüm iki kanal + B INV + ADD (A − B) ya da topraksız (yalıtılmış)
  osiloskopla yapılır ("Toprak tuzağı" örneği).
- **Fonksiyon üreteci:** COM ─ ideal kaynak ─ 50 Ω ─ OUT; TTL çıkışı aynı yapıda 0/5 V.
  Genlik açık devre tepe-tepe değeridir (ön paneldeki gibi), 50 Ω'luk yükte yarıya iner.
  Simetri (%10–90) fazı büker: kare dalgada darbe genişliği, üçgende testere dişi, sinüste eğik
  sinüs. −20 dB zayıflatıcı bütün çıkışı (offset dahil) 10'da 1'e indirir.
- **DC güç kaynağı:** İki yüzer çıkış; her biri ideal kaynak + akım sınırlayıcıdır:
  I = I_sınır · tanh(v / 10 mV). Küçük akımda neredeyse kısa devre (CV, 12 mA'de ≈ 1 mV düşüm),
  yük sınırı aşmaya çalışınca akım sınırda kalır (CC) ve sembolde CC lambası yanar.
- **Osiloskop girişi:** Gerçek girişte her kanal COM'a 1 MΩ ‖ 25 pF ile bağlıdır (GND
  kuplajında giriş kesik). AC kuplaj, kaydedilen değere 10 Hz'lik birinci dereceden yüksek
  geçiren süzgeç olarak uygulanır (kuplaj kondansatörü + 1 MΩ; analog osiloskoplarda tipik alt
  sınır). **Geriye uyumluluk:** Bu özellikler eklenmeden önce kaydedilmiş devrelerde osiloskop
  ideal girişli ve topraksız kalır; yeni yerleştirilen osiloskop gerçek girişli ve topraklıdır.
- **ADD:** Tek çizgi A + B (B ters çevrilmişse A − B), A'nın volt/bölme ve konumuyla; tetik ve
  ölçümler bu toplamdan.
- **Oto ve hız:** Oto, devrede bir üreteç ya da AC kaynak varsa frekansı oradan alır (kayıtta
  frekans değişikliğinden önceki sinyal kalabilir); ayrıca simülasyon hızını bir ekran taraması
  ≈ 0,2 s sürecek biçimde ayarlar (en fazla ×1): 1 MHz'te 0,5 µs/bölme ve ×2,5·10⁻⁵.

### Yarı iletken modelleri

Parametreler yaygın parçaların veri sayfalarına ve SPICE modellerine göre seçildi; özellik
penceresinden değiştirilebilir. Her model `tests/transistor.test.ts` ile el hesabına karşı
doğrulanır.

- **Zener diyot (1N4733A benzeri, V_Z = 5,1 V):** İleri yönde genel amaçlı diyot; ters yönde
  ayrı bir kırılma eklemi ve 1 Ω seri direnç. Kırılma ekleminin üssü V_Z / (N·VT) = 40 olacak
  biçimde seçilir (düşük gerilimli zenerlerin yumuşak dizi), Is'i 20 mA'de uçlar arası gerilim
  tam V_Z olacak biçimde hesaplanır (LED'lerdeki 20 mA kuralı gibi). 20 mA'deki dinamik direnç
  ≈ 7 Ω (veri sayfası Z_ZT ≤ 7 Ω).
- **BJT (BC547B / BC557B benzeri; BC107 için Gummel-Poon, aşağıdaki ngspice bölümü):** Ebers-Moll taşıma modeli, Early etkisiyle:
  I_CT = (I_F − I_R)·(1 − V_BC/V_A), I_C = I_CT − I_R/β_R, I_B = I_F/β_F + I_R/β_R.
  Is = 2,39·10⁻¹⁴ A, β_R = 7,9, V_A = 63 V (NXP BC547B SPICE modeli); β_F varsayılanı 200
  (veri sayfası 200–450). PNP aynı denklemlerin ters işaretlisidir. İki eklemin gerilim adımı
  diyottaki gibi sınırlanır; bölge (kesim/aktif/doyum) bilgi kutusunda gösterilir.
- **JFET (2N5457 benzeri):** Shichman-Hodges kare yasası, β = I_DSS / V_P², λ = 0,01 V⁻¹;
  I_DSS = 3 mA, V_P = −1,5 V (veri sayfası 1–5 mA ve −0,5…−6 V). Kapı-kanal eklemleri
  Is = 10⁻¹⁴ A'lik diyotlardır (kapı ileri kutuplanırsa akım çeker). Kanal simetriktir.
- **MOSFET (2N7000 benzeri, kanal oluşturmalı):** I_D = k·(V_GS − V_T)²·(1 + λV_DS) doyumda,
  k·(2(V_GS − V_T)V_DS − V_DS²)·(1 + λV_DS) omik bölgede; V_T = 2,1 V, k = 50 mA/V²
  (V_GS = 4,5 V'ta I_D(on) ≈ 0,29 A, veri sayfası en az 75 mA), λ = 0,01 V⁻¹. Kapı yalıtılmıştır.
  Gövde diyodu (gövde source'a bağlı; IS = 10⁻¹⁴ A, ngspice MOS1 varsayılanı) V_DS < 0'da
  ≈ −0,8 V'ta iletir; adımı eklem gibi (pnjlim) sınırlanır.
- **Newton-Raphson:** Üç uçlu bileşenler uçlarına giren akımları iki kontrol geriliminin
  (V_BE, V_BC ya da V_GS, V_DS) fonksiyonu olarak verir ve bunların Jacobian'ıyla doğrusallaştırılır
  ([`sim/devices/threeTerminal.ts`](src/sim/devices/threeTerminal.ts)). FET'lerde V_GS adımı 1 V,
  V_DS adımı 5 V ile sınırlanır. Kablo akımları için her bileşen uçlarına giren akımları verir.

### Su haznesi ve sarı LED (baraj projesi, A aşaması)

İsmail Hoca'nın istediği baraj su seviyesi uyarısı için. Proje ayrı bir sayfada olacak
(`/baraj`, sonraki aşamalar); parçalar ana simülatörde de kullanılabilir.

- **Sarı LED:** 20 mA'de ≈ 2,1 V (kırmızı 1,85 V ile yeşil 2,2 V arası), en fazla 30 mA.
- **Su haznesi (kütüphanede "Sensörler"):** Dört prob sağ kenarda: ortak prob dipte (%12,5),
  Seviye 1, 2, 3 (%37,5, %62,5, %87,5) — uçların sembolde durduğu yükseklik. Her ıslak prob
  suya (iç düğüm) R_su / 2 ile bağlanır; iki ıslak prob arası R_su (varsayılan 5 kΩ, musluk suyu
  için birkaç kΩ). Kuru prob açık devre. Su yüzeyi probu ±%1'lik aralıkta yumuşakça ıslatır:
  iletkenlik birden atlamaz.
- **Seviye:** Başlangıç seviyesi (kaydırıcı) ve su akışı (Boşalt / Dur / Doldur). Doldur'da
  seviye boştan doluya "dolma süresi"nde artar (simülasyon zamanıyla); Durdur'dan sonra
  başlangıç seviyesine döner (kondansatörün başlangıç gerilimi gibi). Çalışırken akış ya da
  süre değişince seviye kaldığı yerden sürer; kaydırıcı bırakılınca yeni seviye geçerlidir.
  Seviye zamanla değişirken devre adım adım çözülür; iletkenlik seviyeye bağlı olduğu için hazne
  Newton-Raphson iterasyonunda yeniden eklenir (`stampNonlinear`).
- **Denetimler:** Cihaz rafında ve telefonun Cihazlar sayfasında aynı bileşen
  ([`TankControls.tsx`](src/editor/TankControls.tsx)): seviye göstergesi, ıslak prob lambaları,
  kaydırıcı, su akışı, dolma süresi, su direnci, jaklar. Sembolde su canlı yükselir.
- **Suda akımı iyonlar taşır (kullanıcı isteği, 2026-10-17):** Prob kuruyken devre açıktır; su
  gelince devreyi su tamamlar, çünkü içinde çözünmüş iyonlar (Ca²⁺, Mg²⁺, Na⁺, Cl⁻, HCO₃⁻…) vardır.
  Simülasyon çalışırken hazne sembolünde ve baraj sahnesinde iyonlar çizilir
  ([`ions.ts`](src/editor/ions.ts)): prob akımları anot → katot kanallarına ayrılır (her anodun
  akımı katotlara, katot akımlarıyla orantılı; toplamlar korunur), her kanalda üç alan çizgisi
  boyunca katyonlar (turuncu, +) akım yönünde, anyonlar (mor, −) ters yönde sürüklenir; arada
  başka bir prob varsa çizgi onun ucunun solundan kavis yapar. Hız, kablolardaki akım
  noktalarının ölçeğidir (gerçek sürüklenme µm/s düzeyindedir) ve "elektron akışı" seçeneğinden
  bağımsızdır: iki iyon türü de gerçekten hareket eder. Akım taşımayan su da iyon doludur:
  birkaç iyon yerinde kıpırdar (ısıl hareket). Akım taşıyan probun ucunda gaz kabarcıkları çıkar
  (katotta H₂; anotta, aynı yük için yarısı kadar O₂), sayısı akımla artar. Tuvalin gerilim
  göstergesine "Suda iyonlar · + akım yönünde, − ters" satırı, baraj sahnesinin altına tek
  satırlık açıklama eklenir; sahnenin ekran okuyucu etiketi de iyonları söyler.
- **Elektrot polarizasyonu (elektroliz; kullanıcı isteği, 2026-10-17):** Yük metal ile su arasında
  ancak kimyasal tepkimeyle geçer: anotta su yükseltgenir (O₂) ya da metal çözünür, katotta H₂
  çıkar. Bunun için suyun ayrışma gerilimi (tersinir 1,23 V) ve aşırı gerilimler gerekir. Her ıslak
  prob dalı artık "elektrot arayüzü + R_su / 2" seridir; arayüz Butler–Volmer biçiminde
  (α = 0,5): i = 2·i₀·sinh(η / b), b = 2·V_T ≈ 52 mV (Tafel eğimi ≈ 119 mV/onlu). Tersinir gerilim
  ve aşırı gerilimler bu tek terime toplandı; i₀ = 3·10⁻¹¹ A, bir anot ile bir katodun toplamı
  0,1 mA'de 1,55 V, 0,4 mA'de 1,70 V, 1 mA'de 1,79 V olacak biçimde seçildi (suyun elektrolizinde
  gözlenen 1,5–2 V); 1 V'luk çiftte akım 1 µA'in altındadır. Dalın akımı, η + R·i(η) = V'nin kökü
  olarak Newton ile çözülür (f artan ve dışbükey; önceki çözümden başlar), Newton-Raphson'a
  türeviyle eklenir; yakınsama denetiminde çözülen dal bir sonraki doğrusallaştırmada yeniden
  kullanılır. Çift katmanın kapasitesi modellenmez. İnceleme panelinde "Elektrotlarda
  (elektroliz)" satırı bu gerilimi gösterir.
  - *Sonuçlar:* musluk suyunda (5 kΩ) Seviye 1'in baz akımı 0,55 → 0,43 mA (I_B ≈ (9 − 0,65 −
    1,7) V / 15 kΩ); transistör yine doyumda, LED'ler aynı anlarda yanar (3,4 / 8,4 / 13,4 s).
    Saf suda (1 MΩ) LED akımı 0,48 → 0,25 mA. Su direnci büyüdükçe devre polarizasyon yüzünden
    daha erken çalışmaz olur (100 kΩ'da transistör aktif bölgeye iner).
  - *Hız:* baraj örnekleri Node'da aynı oturumda eski modele göre ≈ %8 (dolarken) ile %15–30
    (hazne doluyken) yavaş; tarayıcıda gerçek zamanı tutar.
  - *Testler:* `tests/tank.test.ts` (polarizasyon eğrisi, dalın simetrisi ve tekdüzeliği, 9 V /
    10 kΩ devresinde 9 = I·15 kΩ + polarizasyon(I), Kirchhoff), baraj testlerinde yeni sayılar.
  - *Gerçekte de:* doğru akım elektrotları aşındırır (Faraday'ın elektroliz yasası: 0,5 mA'lik
    sürekli akım bir yılda ≈ 5 g bakır çözer); gerçek sensörlerde paslanmaz çelik ya da grafit
    prob, alternatif akım ya da kısa aralıklı ölçüm kullanılır. Bu, örnek metinlerinde ve baraj
    sayfasının Soru cevabında anlatılır.

### Baraj su seviyesi uyarısı devreleri (B aşaması)

Örnekler penceresinde "Proje · Baraj su seviyesi uyarısı" grubu: iki devre, aynı hazne
(%20'den Doldur, 20 s'lik dolma süresi: %37,5 / %62,5 / %87,5'e 3,4 / 8,4 / 13,4 s'de ulaşır).

- **Çubuk gösterge (3 transistör):** Her seviye için prob → 10 kΩ → BC107 bazı (10 µF ve 100 kΩ
  toprağa: dalgalı yüzeyde titremeyi önler, LED yumuşak yanar) ; kollektörde LED + 470 Ω, +9 V.
  Ortak prob +9 V'ta. Seviye 1'de I_B ≈ (9 − 0,65) / (5 kΩ + 10 kΩ) ≈ 0,55 mA, transistör
  doyumda, LED ≈ 14,5 mA. Su direnci 1 MΩ olunca (çok saf su) LED'den yalnızca ≈ 0,5 mA geçer.
- **Tek ışık (5 transistör):** Ek iki susturma transistörü: Q4 Seviye 2'den, Q5 Seviye 3'ten
  sürülür; kollektörleri yeşilin ve sarının baz düğümünü toprağa çeker (yeşil = Seviye 1 VE
  Seviye 2 DEĞİL). Aynı anda tek LED yanar.
- **Yerleşim:** Satırlar haznedeki probların sırasıyla (üstte kırmızı, altta yeşil): prob
  kabloları kesişmez. Susturma transistörü satırın sol üstünde, kollektör kablosu etiketinin
  sağından baz düğümüne iner. Devreler, uç konumlarını katalogdan hesaplayıp kabloları doğrulayan
  bir üreticiyle kuruldu (föy örnekleri gibi).
- Testler (`tests/examples-lab.test.ts`): LED'lerin yanma anları ve sırası, doyum/kesim,
  baz akımı, saf su, boşaltırken ışığın geri dönüşü. Devreler yavaş olduğu için testte 2 ms adım.

### Baraj sayfası (ders düzeni)

Ayrı sayfa: `/baraj/` (`src/pages/baraj.astro` → `src/baraj/BarajSayfasi.tsx`). Örnekler
penceresinde baraj grubunun altındaki bağlantıdan ve baraj örneklerinin "Örnek" sekmesinden açılır.
Tasarım `docs/tasarim/baraj/` altında (B00–B07 ekranları, bağlayıcı belge BN). Derste projeksiyonla
kullanılır: öğretmen tek elle yönetir, sınıf barajı, devreyi ve durumu aynı anda görür; anlatım metni
yok, ekrandaki her şey ya bir ölçüm ya bir düğme.

- **Tek kumanda** (`useBarajKumanda.ts`): ayrı Oynat / Duraklat yok. Açılışta örnek yüklenir, tankın
  `mode`'u `stop` yapılır (örnek dosyasında `fill`), simülasyon kendiliğinden başlar; su %20'de durur.
  Su akışı (Boşalt / Durdur / Doldur) tankın `mode` özelliğini değiştirir; yalnızca değer değiştiği
  için simülasyon durumunu korur, seviye kaldığı yerden sürer. %100'de (Doldur) ya da %0'da (Boşalt)
  kendiliğinden Durdur. Kuru / Seviye 1 / 2 / 3 düğmeleri hedef tutar (%25 / 50 / 75 / 95), doldurarak
  ya da boşaltarak gider, hedefi geçince durur (su atlamaz). Sahnedeki tutamak ve kumandadaki kaydırıcı
  sürüklenirken akış durur ve önizleme gösterilir; bırakınca `level` uygulanır. Motor, `level`
  özelliği değişmezse anlık seviyeyi korur (`adoptState`); aynı seviye yeniden istenirse özellik
  görünmez bir payla (1e-9) değiştirilir. Başa al: %20, Durdur, zaman 0; su direnci ve dolma süresi
  korunur. Devre değişince yeni dokümanda tankın `level`'ı anlık seviye olur, akış ve ayarlar taşınır;
  yapı değiştiği için simülasyon yeniden başlatılır ("düzenleme yüzünden durdu" bildirimi gösterilmez),
  açık cevap gizlenir.
- **Sahne** (`BarajSahnesi.tsx`, SVG): baraj kesiti, haznedeki su, ölçü iskelesi, numaralı problar
  (renkli rozet ve "Seviye n"; ortak prob "+" rozeti ve "Ortak +9 V"), lambaların içinde numara.
  İskelenin solunda seviye etiketi ve sürükleme tutamağı (`role="slider"`, çizimle aynı görünüm
  kutusunda ayrı bir SVG katmanı; oklar, Sayfa tuşları, Home/End). Sol üstte uyarı rozeti, simge ve
  metinle: Uyarı yok (boş daire), Normal (yeşil onay), Dikkat: su yüksek (sarı üçgen), Tehlike: su
  taşmak üzere (kırmızı sekizgen); uyarı lambalara bakar (`alertOf`). Görünüm kutusu düzene göre
  kırpılır (geniş, tablet, telefon `240 40 552 400`, yatay telefon); yazılar sahnenin ekrandaki
  ölçeğine göre istenen px boyunda (masaüstü ≈ 14,7, tablet ve telefon 13, projeksiyon 16,7).
  Telefonda lambaların yan yazıları yok.
- **Durum tablosu** (`DurumTablosu.tsx`, `seviye.ts`): satırlar Seviye 3, 2, 1; Prob (ıslak / kuru,
  damla simgesiyle), Transistör (Qn ve kesim / aktif / doyum), LED (nokta, yanıyor / sönük / çok zayıf /
  sönüyor, akım). Veri karede: tankın `wetProbes`'u, Qn'nin `region`'u, LED'in parlaklığı ve akımı.
  Parlaklık 0,3'ün üstünde yanıyor; 0,02–0,3 arası azalıyorsa sönüyor, değilse çok zayıf. Tek ışıkta
  Q1 kesimde ve Q4 doyumdaysa "Q4 susturuyor" (Q2 için Q5); prob kuru ama Qn kesimde değilse "Cn
  boşalıyor". Çalışan katın satırı seviye renginin açık tonuyla boyanır. "Gizle" tabloyu kaldırır
  (tercih `localStorage`'da, okuma ve yazma try/catch içinde).
- **Şema:** `CircuitView`'in isteğe bağlı `underlay` katmanında her katın bandı (RBn, Cn, RPn, Qn,
  LEDn, RCn'nin sınır kutusu): çalışan kat açık ton ve kenarlık, kesimdeki kat kesik gri kenarlık,
  sol altta "Seviye n · renk". Ana simülatör etkilenmez.
- **Soru:** kapalı açılır; masaüstü ve tablette başlığın altında şerit ("Tahmin et" ve soru; "Cevabı
  göster" ya da açılmış cevap ve "Cevabı gizle"), telefonda alt sayfa (sahne ve kumanda açık kalır).
  Soru ve cevaplar `tr.baraj.questions` altında; cevaplarda saniye yerine seviye.
- **Ayarlar:** su ön ayarı (Musluk suyu 5 kΩ / Saf su 1 MΩ), su direnci ("iki ıslak prob arası") ve
  dolma süresi ("boştan doluya") adımlayıcıları (sınırlar `TANK_LIMITS`, adımlar 1-2-5), Varsayılanlara
  dön; masaüstünde "Tek tuş kısayolları" anahtarı. Masaüstü ve tablette kumandanın üstüne açılan kart,
  telefonda alt sayfa; dışarı dokununca ya da Esc ile kapanır.
- **Klavye ve sunum kumandası:** ↑ Doldur, ↓ Boşalt, Boşluk Durdur ↔ son akışı sürdür, 0–3 seviyeye
  git, Sayfa Aşağı bir üst seviyeye doldur, Sayfa Yukarı bir alt seviyeye boşalt, R Başa al, T devre
  değiştir, S Soru, F tam ekran. Odak bir giriş alanında, kaydırıcıda ya da açık kartta iken çalışmaz;
  odak bir düğmedeyken Boşluk ve Enter o düğmeye basar, radyo gruplarında oklar seçimi değiştirir.
- **Erişilebilirlik:** "Kumandaya atla" bağlantısı; odak sırası başlık → soru → sahne (tutamak) → durum
  tablosu → devre (tek durak) → kumanda; canlı duyuru (`aria-live="polite"`) yalnızca seviye bandı ya
  da yanan lambalar değişince ("Su Seviye 2’ye ulaştı. Yeşil ve sarı yanıyor."); seviye numarası her
  yerde, uyarı simgesi biçimle, transistör durumu yazıyla; dokunmatikte hedefler en az 44 px; sayfa
  kaymaz, paneller kendi içinde kayar; güvenli alanlar.
- **Düzenler:** masaüstü (≥ 1100 px): başlık (Devre seçimi, Soru, Tam ekran, Simülatörde aç), soru
  şeridi, iki kart (sahne + Durum | devre şeması ve lejant), altta kumanda şeridi (Su akışı, seviye ve
  yön, 1-2-3 işaretli kaydırıcı, Kuru / Seviye 1–3, Başa al, Ayarlar). Tablet (< 1100 px): aynısı,
  kaydırıcısız. Telefon dikey: başlık (Soru, ⋯: Simülatörde aç, Ayarlar, Tam ekran), devre seçimi,
  sahne, Durum | Devre sekmeleri, altta kumanda. Telefon yatay: sahne solda, sekmeler sağda, kumanda
  tek satır. Tam ekranda (projeksiyon) sahne yazıları, tablo değerleri ve düğmeler en az 16 px,
  kumandadaki klavye ipuçları gizli.
- "Simülatörde aç", devrenin o anki hâlini (anlık seviye, akış, su direnci, dolma süresi) paylaşım
  bağlantısıyla (`#d=…`) ana simülatörde açar. Raftaki `TankControls` ana simülatörde aynen kalır.
- Testler: `tests/baraj-sayfa.test.ts` (bant, hedefler, LED durumu, Durum satırları gerçek
  simülasyonla, şema bantları). `npm run ios-kontrol` baraj sayfası için 15 madde içerir (telefonda
  açılış, Seviye 1, 44 px hedefler, devre değişimi, Soru alt sayfası, ⋯ → Ayarlar, tutamak
  sürükleme; yatay telefon; masaüstünde düzen ve bantlar, Ayarlar ve Esc, klavye, Soru şeridi, Durum
  Gizle, projeksiyon yazı boyu, Simülatörde aç).

### Föy parça modelleri (föy için 2. aşama)

Diyot, NPN, N kanallı JFET ve N kanallı MOSFET'te İnceleme panelinde bir **Model** seçimi var.
Yeni yerleştirilen parça föydeki modelle gelir; `model` özelliği olmayan (bu aşamadan önce
kaydedilmiş) devreler yukarıdaki genel modellerle aynen çalışır (`PartDef.legacyProps`). Model
değişince o modelin parametreleri de gelir (`modelPresets`; ör. BF245A'da I_DSS ve V_P);
parametreler sonra yine değiştirilebilir (öğrencinin ölçtüğü β ya da I_DSS).

| Model | Kaynak | Doğru akım | Yük depolama |
|---|---|---|---|
| 1N4001 | Vishay 1N4001 veri sayfası (tipik eğriler); τ_T LTspice'ın 1N4001 kartı | 10 mA'de 0,60 V, 100 mA'de 0,72 V (N ≈ 2,0, Is ≈ 1·10⁻⁷ A) | C_j0 = 30 pF, V_J = 0,4 V, M = 0,33; τ_T = 5,76 µs |
| BC107 | Central BC107 veri sayfası; kapasiteler NXP BC547B kartı (aynı yonga ailesi) | V_BE(2 mA) ≈ 0,65 V, β = 200 (110–450) | C_je = 13,6 pF, C_jc = 3,7 pF, τ_F = 0,44 ns (f_T ≈ 300 MHz) |
| BF245A | NXP SPICE kartı | I_DSS = 3,52 mA, V_P = −1,74 V, λ = 0,0177 | C_GS = C_GD = 2,2 pF, PB = 0,78 V |
| IRF510 | Yaygın MODPEX kartı (V_T, k); Vishay veri sayfası (kapasiteler, 25 V) | V_T = 3,83 V, k = 1,24 A/V², λ = 0,003 (varsayım) | C_GS = 165 pF; C_GD 25 V'ta 15 pF, C_DS 25 V'ta 66 pF (eklem biçiminde) |

- **Yük depolama:** SPICE'taki gibi boşluk yükü Q = C_j0·V_J/(1 − M)·(1 − (1 − V/V_J)^(1−M))
  (V > V_J/2'de doğrusal uzatma) ve difüzyon yükü Q = τ·I. Zaman adımında yamuk kuralıyla
  i = 2(Q(v) − Q_önceki)/h − i_önceki, iletkenliği 2C(v)/h (ilk adımda ve süreksizliklerden sonra
  geri Euler: i = (Q(v) − Q_önceki)/h; Fizik 4); bu katkı `stampNonlinear(sys, ctx)` içinde
  Newton-Raphson'a girer ([`junction.ts`](src/sim/devices/junction.ts) → `ChargeState`).
  Doğru akım çözümünde (h = 0) yük akımı yoktur: kondansatörsüz devreler eskisi gibi tek
  çözümle kalır. Ölçülen akımlar son adımın yük akımlarını da içerir.
- **Sonuçları (testler: `tests/models.test.ts`):** 1N4001'de ±5 V kare dalga ters dönünce
  ≈ 3 µs boyunca ≈ −5,4 mA ters akım akar (genel modelde hiç akmaz); 1 MHz'te diyot doğrultmaz.
  BC107'li ortak emetörlü yükselteçte (10 kΩ'dan sürülen baz) kazanç 1 kHz'te ≈ 63 (Gummel-Poon
  kartıyla eski modelden ≈ %5 düşük), 100 kHz'te ≈ %25, 1 MHz'te ≈ %90 düşer (Miller etkisi). IRF510'lu kaynak dirençli
  yükselteçte (R_D = 10 kΩ, R_S = 1 kΩ) kazanç 1 kHz'te ≈ 9,8; C_GD yüzünden kutup ≈ 420 kHz
  (R_S transistörü akım kaynağı gibi yaptığından C_DS'in etkisi neredeyse yoktur).
- **İhmal edilenler:** 1N4001'in seri direnci (≈ 0,05 Ω; föy devrelerinde akım 10 mA'i
  geçmez) ve ters kırılması (50 V); BF245A kartının 9 Ω'luk drain/source dirençleri; IRF510'un
  iç dirençleri (≈ 0,5 Ω). Bunlar için parçaya iç düğüm
  eklemek gerekir; föydeki akımlarda fark ölçüm belirsizliğinin çok altında.

### Yeniden tasarım (2026-10)

Arayüz `docs/tasarim/` altındaki tasarıma göre 9 aşamada yeniden yazıldı; hesap ve veri mantığı
(`src/sim`, `src/model`), otomatik kayıt, paylaşım bağlantısı ve JSON sürüm 1 değişmedi.

- **Düzenler:** < 900 px telefon (yükseklik < 500 px ise yatay telefon: yan panel ve dikey çubuk),
  ≥ 900 px dokunmatik tablet, fareyle 900–1279 px sıkışık masaüstü (kütüphane şerit), ≥ 1280 px
  masaüstü. Dokunmatik ve kısa (< 500 px) ekranda genişlik 900 px'i aşsa da telefon düzeni.
- **Devrenin adı:** açık örneğin adı, yoksa "Devrem" (boş devrede "Yeni devre"); yalnızca arayüzde,
  JSON'a ve bağlantıya girmez.
- **Ölç düzeni (masaüstü):** Oynat'tan sonra rafta cihaz varsa raf büyür; kütüphane ve İnceleme
  paneli olduğu gibi açık kalır (Oynat panelleri kapatmaz).
- **Osiloskop kipleri:** modeldeki üç kip (A ve B, A + B, X-Y); tasarımdaki tek kanal kipleri yok.
- **Hatalar:** yanan LED ve kısa devre arayüzde hata olarak gösterilir; "R1'i … yap" önerisi
  yalnızca LED'e tek direnç seri bağlıysa (arada ampermetre olabilir) çıkar. Önerilen değer
  (V − V_f) / 20 mA'nın bir üst E24 değeridir.
- **Telefon:** panel sekmeleri (Örnek / Devre ya da Ölçümler / Mesajlar) yarım boyda görünür;
  zincirle ekleme saat yönünde döner (pil → direnç → LED); −/+ direnç ve sığada E12, gerilimde
  0,5 V (2 V'un altında 0,1 V), diğerlerinde 1-2-5 adımıdır.
- **Tablet:** cihazlar İnceleme panelinin Cihazlar sekmesindedir; tuvaldeki "Cihaz rafı" düğmesi
  o sekmeyi açar.
- **Ayarlar:** düğüm gerilimleri, akım noktaları, elektron akışı, renk ölçeği, direnç sembolü.
  Koyu tema ve projeksiyon kipi sonraki işlere bırakıldı.
- **Tam ekran (kullanıcı isteği, masaüstü ve tablet):** köşeli simgeli düğme artık devreyi
  sığdırmaz; tarayıcıyı tam ekrana alır (F11 gibi, Fullscreen API; `src/editor/fullscreen.ts`) ve
  yalnızca devre şeması kalır: sol (kütüphane; tablette Parça / Bağla şeridi) ve sağ (İnceleme
  paneli) gizlenir. Üst çubuğun iki ucunda çıkan düğmeler (basılı = açık) panelleri istenince
  açar; Alt+1…3 ve tabletteki "Cihaz rafı" düğmesi sağ paneli kendiliğinden açar. Girmeden önce
  devre sığdırılır, böylece genişleyen tuvale yeniden sığar. Esc (tarayıcının çıkışı) ya da aynı
  düğme kipi kapatır, paneller geri gelir. Üst çubuk, raf ve simülasyon çubuğu yerinde kalır.
  Tarayıcı tam ekranı desteklemiyorsa yalnızca paneller gizlenir. Sığdırma ayrı düğmeye
  (çerçeve içinde kutu simgesi) taşındı, Shift+1 aynı. Telefonda değişiklik yok (iPhone Safari
  sayfaları tam ekrana almaz; ⋯ menüsündeki "Ekrana sığdır" kaldı).

### Örnekler

- **Örnekler penceresi (kullanıcı isteği):** Örnekler sol panelden kaldırıldı; üst çubuktaki
  "Örnekler" düğmesi gruplanmış bir pencere açar (telefonda tam ekran, aramalı ve açılır gruplu
  liste). Açılan örneğin açıklaması, "Ne işe yarar?" ve "Günlük hayatta" bölümleri İnceleme
  panelinin Örnek sekmesinde (telefonda alt sayfada). Gruplar ve sıraları
  [`src/examples/index.ts`](src/examples/index.ts) içindedir; iOS kuralı gereği pencere açıkken
  tuvalin `touch-action` değeri kaldırılır (pencere parmakla kaydırılabilsin).
- **Gruplar:** Temel devreler (görevdeki beş örnek, "Ampermetrenin etkisi", "Kare dalga ile RC",
  "RL devresi", "Bobin ve serbest geçiş diyotu"),
  Laboratuvar cihazları ("Toprak tuzağı") ve Fizik 2. sınıf Elektronik Laboratuvarı föyünün
  dokuz deneyi (föy 3. aşama; eski genel laboratuvar örneklerinin yerine), en sonda "Proje · Baraj
  su seviyesi uyarısı" (iki devre; bkz. baraj bölümleri). Föy örneklerinde
  föydeki parçalar (1N4001, BC107, BF245A, IRF510, föydeki direnç ve kondansatör değerleri) ve
  laboratuvar cihazları (fonksiyon üreteci, iki çıkışlı DC güç kaynağı, osiloskop) kullanılır:

  | Deney | Örnekler |
  |---|---|
  | 1 Diyot karakteristikleri | 1N4001 doğru akımda (güç kaynağı, ampermetre, voltmetre); 1N4001, 5,6 V zener ve LED X-Y'de |
  | 2 Doğrultucular | Yarım dalga + 1 / 22 / 470 µF filtre (anahtarlarla); dört 1N4001'lik köprü, 100 kΩ |
  | 3 Kenetleyici ve katlayıcı | Negatif ve pozitif kenetleyici (2,2 µF, 10 kΩ); iki 1N4001 + iki 10 µF ikileyici |
  | 4 Kırpıcılar | 4 V öngerilimli paralel kırpıcı (güç kaynağı); 3 V ve −2 V çift yönlü kırpıcı (iki pil; laboratuvarda güç kaynağının iki çıkışı) |
  | 5 FET karakteristikleri | BF245A: V_DD ve V_GG güç kaynağından, I_D ampermetreyle |
  | 6–8 Yükselteçler | BF245A (R_D = 2,7 kΩ, kazanç ≈ 10), BC107 (R_B = 2,2 MΩ, R_C = 5,6 kΩ), IRF510 (R_D = 10 kΩ, R_S = 1 kΩ) |
  | 9 Transistör anahtar | BC107, R1 = 10 kΩ, R2 = 1 kΩ, LED kollektörde ve emetörde; üretecin TTL çıkışı, 1 Hz |

- **Föyden çıkarılamayan ayrıntılarda varsayımlar** (föyün tam metni elimizde değil; deney
  listesi ve parça değerleri biliniyor):
  - **Zener:** Föy değerini vermiyor. Düzeni en çok benzeyen föyler (Bilecik ve Bandırma: 1N4001,
    LED ve zener, 1 kΩ) 5,6 V (1N4734A) kullanıyor; ±10 V'luk üreteçle kırılma da net görünüyor.
  - **X-Y düzeneği:** Klasik akım-gerilim çizici: osiloskobun COM'u eleman ile 1 kΩ'un
    birleşiminde, B ters çevrilmiş; bu yüzden üreteç topraktan yalıtılmış. Üreteç topraklıysa
    direnç iki toprak arasında kısa devre olur (metinde anlatılır).
  - **Doğrultucularda 50 Hz:** 1 / 22 / 470 µF ile 1 kΩ, RC = 1 / 22 / 470 ms verir; 20 ms'lik
    periyotla "filtre yok – orta – iyi" sırası en anlamlı bu frekansta.
  - **Genlikler tepe-tepe:** Föydeki "0,5 V", "0,1 V" gibi giriş değerleri üretecin ön
    panelindeki gibi tepe-tepe alındı; JFET'te 2 V'ta bozulma, MOSFET'te 1 V'ta belirgin
    olmayan bozulma föydeki anlatımla tutuyor.
  - **MOSFET yükselteci:** "IRF510, 10 kΩ, 1 kΩ" R_D = 10 kΩ, R_S = 1 kΩ olarak yorumlandı (kazanç
    ≈ R_D / R_S ≈ 10); kapı, üretecin DC offset'iyle (4,55 V) sürülür.
  - **Tasarım ödevleri** (JFET'te R_D, BJT'de R_B ve R_C) için birer çözüm konuldu; "Ne işe
    yarar?" metni tasarım formülünü verir.
- **Yükselteçlerde** BJT'nin kuplaj kondansatörünün başlangıç gerilimi çalışma noktasındaki
  V_BE'dir (2,2 MΩ üzerinden dolması 22 s sürerdi); Oynat'a basınca kararlı çalışma görülür.
- **Kullanılmayan cihaz çıkışları:** Üretecin kullanılmayan OUT ya da TTL çıkışı ve güç
  kaynağının iki ucu da boş olan çıkışı "boşta uç" uyarısı vermez (tek ucu bağlı çıkış uyarır).
- **Osiloskobun AC kuplajı** artık girişte 1 MΩ ile seri ≈ 16 nF'lık kuplaj kondansatörü gibi
  davranır: doğru akım çekmez. Önceden AC kuplajda da 1 MΩ doğru akımda devreyi yüklüyordu;
  sabit öngerilimli BJT'nin bazına bağlanan prob baz akımının ≈ %12'sini çalıyordu.
- Devreler `src/examples/*.json` dosyalarında, metinleri (başlık, açıklama, ne işe yarar, günlük
  hayatta) `i18n/tr.ts` içindedir; böylece arayüz metinlerinin tamamı tek dosyada kalır.
- **Ne işe yarar ve günlük hayatta (kullanıcı isteği, 2026-10-17):** Örneklerdeki tahmin sorusu,
  isteğe bağlı tahmin alanı ve Oynat'la açılan cevap kaldırıldı. Örnek sekmesinde kurulum
  açıklamasının altında iki bölüm var: "Ne işe yarar?" (devrenin işlevi, dayandığı yasa — Ohm,
  Kirchhoff, Faraday ve Lenz, diyot denklemi vb. —, simülasyonda görülen sayılar ve denenecek
  değişiklikler) ve "Günlük hayatta" (devrenin gerçek cihazlarda nerede kullanıldığı). Şeritteki
  yönlendirme "Örnek açık: ne işe yaradığı Örnek sekmesinde; çalıştırmak için Oynat'a bas" oldu ve
  ilk Oynat'ta kalkar. Baraj sayfasının kendi "Soru" şeridi ders düzeninin parçası olduğu için kaldı.
- **Şemalar sıfırdan yeniden çizildi (kullanıcı isteği, 2026-10-17):** Eski şemalarda föy ve baraj
  devrelerinin çoğunda devre başına 3–9 toprak sembolü vardı; dönüş akımı aralarındaki kesikli
  "toprak hattı" üzerinden, şemada görünmeden dönüyordu (köprü doğrultmaçta osiloskobun COM'u
  yalnızca bir toprak sembolüne bağlıydı). Yeni kurallar:
  - Her akımın dönüş yolu kablodur ve her devrede kapalı döngüler görünür (Kirchhoff yasaları);
    devre başına **tek toprak sembolü**, ortak dönüş hattında. Toprak hattı yalnızca, bilerek iki
    cihaz toprağı arasında kurulan "Toprak tuzağı"nda çizilir.
  - Cihazların COM uçları ortak hatta kabloyla bağlanır (prob toprak klipsi devrenin ortağına
    takılır); güç kaynağının − ucu ortak hatta döner.
  - Osiloskopta **A kanalı giriş, B kanalı çıkış** (yükselteçlerde ve transistör anahtarda önceden
    tersiydi; volt/bölme ve tetik buna göre değişti).
  - Kablolar dik; kablo bir parçanın gövdesinden geçmez, parçalar üst üste binmez, yazılar kablolara
    değmez. **Kesişme** yalnızca topolojik olarak kaçınılmaz olduğu yerde: yükselteçlerde ve
    transistör anahtarda osiloskobun giriş kablosu besleme hattını keser (transistör, osiloskop ve
    besleme giriş, çıkış ve ortak düğümün üçüne birden bağlıdır: K3,3, düzlemde kesişmesiz
    çizilemez); JFET karakteristiğinde güç kaynağının uç sırası yüzünden ortak hat kapı kablosunu
    keser; barajda her seviye bandı hazneden V_CC rayına uzanan bir duvar olduğundan ortak bara iki
    RC bağlantısını keser (tek ışıkta susturma transistörlerinin beslemesi de birer prob kablosunu).
    Bu örneklerin açıklaması "Dolu nokta olmayan kablo kesişmeleri bağlı değildir" der.
  - X-Y ölçümünde ve köprü doğrultmaçta osiloskop döngünün içindedir: üç prob kablosunun sırası
    (A, B, COM) ancak böyle kesişmesiz bağlanır. Köprüde üretecin COM'u köprünün altından dolaşıp
    sağ kolun ortasına gelir.
  - Çift yönlü kırpıcıda güç kaynağı yerine iki pil (3 V ve ters bağlı 2 V): iki çıkışlı güç
    kaynağının uç sırası (1+, 1−, 2+, 2−) bu kırpıcıyı kesişmesiz çizdirmiyor; açıklama
    laboratuvardaki karşılığını söyler.
  - Föy değerleri, parça adları (baraj sayfası RBn, Cn, RPn, Qn, LEDn, RCn ile bantları bulur) ve
    bütün sayısal sonuçlar aynı kaldı; fizik testlerinin hepsi yeni şemalarla geçti. Baraj
    şemaları dikeyde sıkıştırıldı (bantlar 26 birim arayla, pil ve toprak sağ altta).
  - Kalıcı denetim: `tests/examples-sema.test.ts`. Eski şemalarla çalıştırıldığında 29 örneğin
    19'unda hata bulur (çoklu toprak, toprak hattından dönen akım), yenilerde geçer. Tarayıcıda
    (Edge, ×1 hız) bütün örnekler gerçek zamanı tutar; çift yönlü kırpıcı aynı oturumda eski
    şemayla 15–23, yenisiyle 44–51 fps (çözücünün adım sayısı aynı).
- Elle hesabın temiz çıkması için örneklerdeki pillerin iç direnci 0'dır (açıklamada "ideal"
  yazar). Her örneğin metnindeki sayılar `tests/examples.test.ts` ve `tests/examples-lab.test.ts`
  ile simülasyona karşı doğrulanır.
- Örnek yüklenince görünüm, sol üstteki örnek kartının kapladığı alan boş kalacak şekilde
  devreye sığdırılır (telefonda kartın altına).

## Lisans notu

Bu projenin kodu sıfırdan yazıldı. Falstad CircuitJS1 (GPL) ve PhET Circuit Construction Kit
(GPL) kaynak kodlarından hiçbir şey kopyalanmadı ya da uyarlanmadı. Sitede başka bir simülatörün
adı, logosu ya da ekran görüntüsü kullanılmaz.

### ngspice karşılaştırması (2026-10-27)

ngspice'ın kaynak kodu (açık kaynak, 2026-10-26 sürümü) motorla ve aygıt modelleriyle satır satır
karşılaştırıldı; bulunan hatalar düzeltildi (testler: `tests/ngspice-karsilastirma.test.ts`,
`tests/scope-yakalama.test.ts`, `tests/canli-olcum.test.ts`):

- **MOSFET gövde diyodu** yoktu (`mos1load.c`'de bulk diyotları hep var): V_DS < 0'da kanal
  açılıyordu (IRF510, −5 V / 10 Ω: −4,1 V ve 90 mA yerine şimdi −0,81 V ve 0,42 A).
- **Ters aktif BJT** "kesim" görünüyordu; artık "Ters aktif" bölgesi var.
- **exp sınırının ötesinde iletkenlik** (üs > 80) akımın türevinden (1 + üs − 80) kat büyüktü
  (`safeExpSlope`); sonuç aynı, Newton daha hızlı yakınsar.
- **Osiloskop, küçük zaman/bölmede** (≤ 100 µs/b) tetiklenemiyor, birkaç noktadan düz çizgi
  çiziyor ve her adımda 2000 kovayı yeniden yazdığı için kare hızını düşürüyordu. Kayıt artık
  tetik sinyalini her ölçümde izler; tetik kenarı motorun olay mekanizmasıyla adımın içinde
  bulunur ve bir ekran ince adımlarla (ekranın 1/250'si) yakalanır. Arayüz kaydı karede bir
  yeniden kurar. Frekans tetik kesimlerinden ölçülür.
- **Canlı ölçümler** kare anındaki anlık değerdi; AC'de ve salınan devrelerde okunamıyordu.
  Motor gösterilen parçaların ölçüm ve durum yapraklarını her adımda tümler (`sim/watch.ts`);
  arayüz 0,4 s'lik pencerelerde salınan değeri "≈" ile etkin değer ya da ortalama olarak, gidip
  gelen durumu "Yüksek ⇄ Düşük" olarak gösterir (`editor/liveReadout.ts`). NaN ve sonsuz değer
  "hesaplanamıyor" yazar.

Kalan dört fark da ele alındı (2026-10-27; testler `tests/ngspice-karsilastirma.test.ts`,
`tests/gummel-poon.test.ts`, `tests/dc-homotopi.test.ts`; kıyas `scripts/tarama/qrr.tarama.ts`):

- **Kırılma noktasından sonra adım** (`dctran.c`): kenara denk gelen adımdan sonraki ilk adım
  0,1·min(önceki adım, sonraki kenara kalan süre); kenardan önceki son iki adım eşitlenir.
  1N4001, ±5 V 10 kHz kare: ters toparlanma yükü −%7,2 yerine −%3,1 (sıkı toleranslı ngspice'a
  göre; varsayılan ayarlı ngspice'ın kendi tümleme noktalarıyla aynı ölçüt +%138), RC'de
  reddedilen adım 93 → 0.
- **Eklem yükünün hata denetimi** (`cktterr.c`): uygulandı ve ölçüldü, **benimsenmedi**. Kare
  dalgada ters toparlanma yükünü −%3,1'den −%0,5'e getiriyor, sinüste fark yok (≈ %6; ngspice
  varsayılanı %9,4); örneklerde doğruluk değişmiyor (katlayıcı, kenetleyici zaten %0,01–0,06)
  ama toplam süre %6,6, gerilim katlayıcıda adım sayısı 2 kat artıyor. Örneklerde hızlı kare
  dalgayla sürülen 1N4001 olmadığı için gerilim tabanlı denetim kaldı.
- **BJT Gummel-Poon** (`bjtload.c`): BC107 kartın tam doğru akım modeliyle (ISE/NE, ISC/NC,
  IKF/IKR, VAR, NF/NR; FC = 0,9579). 2 mA'de h_FE ≈ β, 100 mA'de ≈ %30 düşük; ters Early
  gerilimi taşıma akımını ≈ %2,5 azaltır. BC107 yükselteç örneği: I_C 1,1 → 1,05 mA, kazanç
  215 → 204, 1 MHz'te 150 → 127 (FC ileri kutuplu C_je'yi büyütür). ngspice çapraz testi artık
  BC107'yi tam kartla karşılaştırır. Eski BC547B ve PNP modeli değişmedi (kayıtlar aynı sonucu
  verir). Seri dirençler (RB, RE, RC) iç düğüm gerektirdiği için yok.
- **DC çalışma noktası** (`cktop.c`): doğrudan Newton yakınsamazsa dinamik gmin adımlama (her
  düğüme 1e-3 S'ten gmin'e, başarısız adımda geri dönüp çarpanı küçülterek), o da olmazsa
  uyarlanır kaynak adımlama (%10'dan, başarısızlıkta artış yarıya). Bilinen zor devrelerin
  (mandal, 20 LED / 100 V, Darlington / 1000 V, diyot köprüsü / 1000 V) hepsi düz Newton'la da
  yakınsıyor; yollar güvenlik ağıdır ve tek başına aynı çözümü bulduğu sınanır.

### Hata taraması ve optimizasyon (2026-10-27)

İki tarama betiği (olağan testlerle çalışmaz; uzun sürer, rapor yazar):

- `npm run tarama:motor` (`scripts/tarama/motor.tarama.ts`): 51 örneğin her biri arayüz gibi kare
  kare 2 s çalıştırılır; sonra her parçanın her sayısal özelliği uçlara (kaydırıcı aralığı ya da
  değerin 1/1000'i ve 1000 katı) çekilip devre yeniden çalıştırılır (626 çalıştırma). Aranan:
  istisna, Newton'un yakınsamaması, NaN/∞, "hesaplanamıyor" yazan bilgi kutusu, çalışma anı
  uyarısı, gerçek zamana yetişemeyen kare; örnek başına iş yükü (motor sayaçları: kabul, ret,
  Newton yinelemesi, olay). `TARAMA_HIZLI=1` yalnızca profil, `TARAMA_ORNEK=a,b` seçili örnekler.
- `npm run tarama:site -- <adres> <klasör>` (`scripts/tarama/site-tarama.mjs`): iki sayfa
  masaüstü ve telefonda; 51 örnek oynatılıp her parçası seçilir. Konsol/sayfa hatası, başarısız
  istek, sayfa kayması ve yatay taşma, adsız denetim, telefonda 44 px'ten küçük dokunma alanı,
  bilgi kutusunda NaN/∞/"—"/"hesaplanamıyor", tetiklenmeyen osiloskop, kare hızı.
- `scripts/tarama/kiyas.ts`: optimizasyonun öncesi/sonrası (paketlenip Node'da, tarayıcı yükü
  olmadan; eski sürüm `git worktree` ile).

**Bulunan ve düzeltilen hatalar:** uç değerlerde 21 Newton çöküşü (hepsi ilk adımda). Güç
kaynağının tanh akım sınırlayıcısı CV ile CC arasında döngüye giriyordu (tanh değişimi
yinelemede 0,5 ile sınırlı); op-amp'ın iki tanh katı doyumda ±1600 V'luk ikili döngüye giriyordu
(doğrusallaştırma noktası kısaltılır; ters dönen salınım penceresi rayların ortasında birleşir).
Kalan 2 çöküş gerçekçi olmayan değerlerde (325 kV şebeke, 5 kV buzzer beslemesi). Site
taramasında hata yok (atlama bağlantıları odakta 44 px yapıldı).

**Optimizasyon** (51 örnek, 3 s, kare kare; simülasyon saniyesi başına hesap süresi):

| | önce | sonra |
|---|---|---|
| toplam (51 örnek) | 7220 ms | 4827 ms (−%33) |
| hoparlör | 1405 ms | 62 ms |
| 555 ile ses | 1060 ms | 152 ms |
| buzzer ve sıcaklık | 248 ms | 41 ms |
| çift yönlü kırpıcı | 618 ms | 476 ms |
| gerçek zamana yetişemeyen örnek | 2 | 0 |

- Ses örnek tamponu her adımda baştan kırpılıyordu (O(n²)); toplu kırpma.
- Ret eşiği ve küçültme ngspice gibi (`ckttrunc.c`): öngörülen adım 0,9·h'den küçükse ret,
  reddedilen adım öngörülen boyuta (yarıya değil).
- LU ayrıştırması seyrek (pivot satırının sıfır olmayan sütunları; sonuç aynı).
- Topoloji (asılı düğümler, köprü uçları) iletken grupların imzası değişmedikçe yeniden
  hesaplanmaz (555'in her olayında Tarjan yapılıyordu).
- Arayüzde kare bütçesi adım sayısıyla değil hesap süresiyle (10 ms): küçük adım isteyen devre,
  bilgisayar yetiştirdikçe "yetişemiyor" uyarısı almaz.

### Arduino Uno (2026-10-27)

learn-arduino-red.vercel.app ve learnarduino.vercel.app/lab incelendi (kaynak kodu yayında değil,
lisanssız; kod alınmadı). İkisinde de devre çözücü yok: her ders için elle yazılmış formüller
(ör. LED akımı (5 − V_f) / R), kod paneli yalnızca satır vurgular. Burada işlemci gerçekten koşar
ve pinleri devre çözümüne bağlıdır.

- **Derleme** (`npm run arduino:derle`, `scripts/arduino/derle.mjs`): `src/arduino/sketches/*.ino`,
  avr-gcc'nin WebAssembly derlemesiyle (`@horang-corp/avr-gcc-wasm`, geliştirme bağımlılığı; GCC
  ve binutils GPL'dir, yalnızca bu makinede çalışır, siteye girmez) Arduino AVR çekirdeği 1.8.7'ye
  karşı `-Os` ile derlenir. Çıktı iki üretilmiş dosya: `src/arduino/programs.gen.ts` (kod metni,
  boyut) ve `src/sim/arduino/firmware.gen.ts` (flash görüntüsü, `delay()`'in adresi ELF'ten).
  Site derlenirken derleyici gerekmez. Kullanıcı şimdilik kod yazamaz (sunucusuz site; ileride
  tarayıcıda ya da Cloudflare'de derleme).
- **İşlemci** (`src/sim/arduino/mcu.ts`): avr8js (Wokwi, MIT): zamanlayıcı 0/1/2, B/C/D portları,
  ADC, USART. Tembel yüklenir (`runtime.ts`): ilk açılışta indirilmez, devrede Arduino varken önceden
  yüklenir (28 KB gzip).
- **Pin modeli** (`src/sim/devices/arduino.ts`, ATmega328P veri sayfası, 5 V): çıkış 0/5 V
  arkasında 25 Ω (20 mA'de 4,5 V), giriş yüksek empedans, INPUT_PULLUP 35 kΩ, Schmitt eşikleri
  2,6 / 2,15 V, ADC 10 bit (referans 5 V), 5V ucu 0,2 Ω (USB), 3V3 ucu 1 Ω; iki GND (kart üstünde
  10 mΩ). Bir pinden 40 mA'den fazla çekilirse uyarı.
- **Eşgüdüm:** işlemci analog çözümün en fazla 50 µs önünde koşar. Bir çıkış değişince durur;
  değişim anı bir kırılma noktasıdır, analog adım tam o ana denk gelir. `analogRead`'de işlemci
  dönüşümün başladığı anda bekler, gerilim o anda okunur. `digitalRead`'in gecikmesi en çok 50 µs.
- **Boşta atlama:** `delay()`'in bekleme döngüsü (yalnızca `micros()` okur), zamanlayıcıların bir
  sonraki olayına (taşma, karşılaştırma: kesme ya da PWM kenarı) ve seri port/ADC olayına kadar
  ileri sarılır (en çok 1000 çevrim, iki `micros()` okuması arasında bir kez). Kesmeler ve PWM
  kenarları tam zamanında kalır; `delay()` en çok 125 µs geç döner (500 ms'de %0,025). İşlemcinin
  hesap payı simülasyon saniyesi başına 450–920 ms'den 70–166 ms'ye indi.
- **Örnekler:** "Arduino" grubunda 11 devre; metinlerdeki sayılar simülasyondan ve testli
  (`tests/arduino.test.ts`): Blink 13 mA, potansiyometre %50 → 511, gece lambası 744/413/154,
  termometre 25,0/59,7/0,7 °C (0 °C'taki fark B denkleminin yaklaşıklığı), PWM süzgeci 1,253 /
  2,512 V, röle sargısı 43,5 mA.

### 3B tezgâh (2026-10-27)

- **Görünüm:** tuvalin sol üstünde (telefonda sol altta) "Şema | 3B". Devre şemada kurulur; 3B
  izlenir ve oynanır. Seçim iki görünümde ortaktır. Görünüm tarayıcıda hatırlanır (dosyaya girmez).
- **Modeller** (`src/bench3d`): three ile kodla üretilir; dış model dosyası yok. Birim 2,54 mm;
  parçalar gerçek ölçülere yakın (direnç 6,3 mm, renk halkaları değerden; LED 5 mm; TO-92; DIP-8
  modül kartında; Arduino 68,6 × 53,3 mm, başlık sırası gerçek kart gibi). Parçanın yeri şemadaki
  yerinin 1,5 katı (yer açılsın diye). Kablolar uçtan uca atlama kablosu; pin olmayan birleşme
  noktasında klemens; ağ başına renk (toprak siyah, besleme kırmızı).
- **Canlı:** LED/lamba ışıması ve parıltı, motor pervanesi, röle modülü LED'i, hoparlör/buzzer
  titreşimi, sigortanın teli, su seviyesi, multimetre/güç kaynağı/üreteç ekranları ve osiloskop
  izleri (tuval dokusu, en çok saniyede 10 kez), Arduino ON/L/TX.
- **Etkileşim:** yörünge kamerası (fareyle sol tuş kaydırır, orta ve sağ tuş döndürür, tekerlek
  yakınlaştırır; dokunmatikte bir parmak döndürür, iki parmak kaydırır ve yakınlaştırır); tıkla seç; Oynat'tayken anahtar ve potansiyometre. Sığdır ve Üstten; kullanıcı
  kamerayı oynatmadıysa alan değişince (cihaz rafı) yeniden sığdırılır.
- **Performans:** yalnızca değişince çizilir; değişmeyen alt nesneler malzemeye göre birleştirilir
  (vitrinde 35 parça türü: 238 çizim çağrısı, 27 700 üçgen, kare 2,7 ms). three yalnızca 3B
  açılınca yüklenir (158 KB gzip). Şema ↔ 3B geçişinde sızıntı yok (geometri ve doku sayısı sabit).
- **iOS:** tuvalde touchstart/touchmove preventDefault (pasif değil), touch-action none; çekmece
  açıkken auto. ios-kontrol'de 3 madde (düğme 44 px ve sol altta, tek parmakla döndürme ve sayfa
  kaymıyor, Şema'ya dönüş).

### Performans ve hata taraması (2026-10-27)

- `npm run tarama:performans:motor` (`scripts/tarama/performans-motor.tarama.ts`): her örnek,
  arayüz gibi 1/60 s'lik dilimlerle; simülasyon saniyesi başına hesap süresi (3 tekrarın
  ortancası), Arduino'da işlemci payı. Bulgu: bütçenin (500 ms, yani hesap gerçek zamanın yarısı)
  üstü. Bu makinede ölçümler gürültülü: aynı tarama yük altında 2 kat yavaş çıkabiliyor.
- `npm run tarama:performans:site -- <adres>` (`scripts/tarama/performans-site.mjs`): paketler
  (ham, gzip; ilk açılışta indirilen JS; three'nin tembel yüklendiği), şema ve 3B'de kare hızı,
  gerçek zamana yetişme oranı, uzun görevler, 3B çizim çağrısı/üçgen/kare süresi, 35 parçalık
  vitrin, Şema ↔ 3B ×8 bellek sızıntısı, konsol hataları. Rapor: `tarama-performans/performans.md`.

İlk rapor 15 bulgu, son rapor 3 bulgu:

| | önce | sonra |
|---|---|---|
| Arduino örnekleri, hesap / simülasyon saniyesi | 630–1090 ms | 200–450 ms |
| bunun işlemci payı | 450–920 ms | 70–166 ms |
| Arduino'lu örnek, bütçeyi aşan | 11 | 0 |
| ilk açılış JS (gzip) | 305 KB | 277 KB |
| şema ve 3B, ×1'de gerçek zamana yetişme | ölçülmüyordu | %100 (bütün senaryolar) |

Kalan bulgular: ilk açılış JS'i 277 KB (sınır 250 KB; Arduino ve 3B'den önce de tahminen ≈ 263 KB'tı).
Sonraki adım örnek devrelerin (10 KB) ve örnek metinlerinin (24 KB) tembel yüklenmesi. Çift yönlü
kırpıcı (89 000 adım/s) bu işten önce de sınırdaydı (önceki taramada 476 ms).

### Breadboard (2026-10-28)

3B tezgâhta parçalar breadboard'a takılı durur. Yerleşim şemadan otomatik çıkarılır
(`src/bench3d/breadboard.ts`, three'siz saf hesap):

- **Breadboard:** sütunların üst (a–e) ve alt (f–j) yarıları beşer delikli şeritlerdir; üstte ve
  altta + (kırmızı) ve − (mavi) raylar. Devre 28 sütuna sığarsa yarım boy (30 sütun, 400 delik), yoksa
  tam boy (63 sütun, 830 delik); o da yetmezse ikinci bir breadboard.
- **Breadboard'a takılanlar:** direnç, diyot, zener, sigorta, anahtar (iki bacak aynı satırda);
  kondansatör, bobin, LED, LDR, NTC, buzzer (dik); transistörler ve potansiyometre (üç ardışık
  sütun); 741 ve 555 (DIP-8, orta kanalın üstünde, 1. bacak sol altta).
- **Masadakiler:** Arduino, pil ve AC kaynak solda; cihazlar (güç kaynağı, üreteç, osiloskop,
  multimetreler) arkada, jakları breadboard'a dönük; lamba, motor, hoparlör, röle modülü,
  transformatör, hazne önde. Uçlarından breadboard'a dupont uçlu kablolar. Toprak sembolü fiziksel
  bir parça değildir (− rayı).
- **Ağlar:** her ağın bir ya da birkaç şeridi olur, şeritler jumper'larla birleştirilir. Toprak ağı
  − rayına, ana besleme (Arduino 5V, pil +, güç kaynağı +) + rayına bağlanır. Parçalar şemadaki
  soldan sağa sırasıyla yerleşir; ardışık iki parçanın ortak ağı varsa aynı şeridi paylaşır
  (direnç → LED zinciri jumper'sız). Bir şeride en çok 3 bacak; kalan delikler jumper'lara.
- **Doğrulama** (`tests/breadboard.test.ts`, 62 örnek): breadboard'daki şerit, ray ve jumper
  bağlantıları şemayla aynı devreyi kurar: her ağın bütün pinleri tek elektriksel düğümde, iki ağ
  hiçbir yerde birleşmiyor (kısa devre yok), bir deliğe tek bacak. Tek bir jumper silinince 57 örnek
  kalıyor (test bağlantıları gerçekten denetliyor).
- **Kamera:** parçalara, kablolara ve breadboard'un kullanılan bölümüne sığdırılır (yarım boyda
  kartın tamamı).

### Lehim rehberi (2026-10-28)

3B tezgâhta "Lehim rehberi" (`src/bench3d/guide.ts`, `src/editor/SolderGuide.tsx`): breadboard
yerleşimi, breadboard düzenindeki bir delikli plakete (ör. Adafruit Perma-Proto: aynı sütun
numaraları, a–j satırları ve raylar) aktarılır.

- Üstten şema (delikler, parçalar, ağ renkli jumper'lar, dışarı giden tellerin delikleri).
- Malzeme listesi: direnç renk kodu (4 halka), LED rengi, kondansatör türü, transistör modeli,
  DIP-8 soket, jumper teli sayısı.
- Takma sırası: alçaktan yükseğe (jumper, direnç ve diyot, soket, transistör, kondansatör, LED,
  potansiyometre, dışarı giden teller). Yön notları: LED anodu, diyot bandı, elektrolitiğin −
  bacağı, entegrenin çentiği ve 1. bacağı, transistörün soldan sağa bacakları (BC547B, BC557B ve
  2N7000'de düz yüzün yönü; öbürlerinde veri sayfasına bakılması).
- Uyarılar: şebeke (transformatör, AC kaynak) karta bağlanmaz; ölçü aletleri lehimlenmez.
- Yazdırılabilir (yalnızca rehber basılır). Arduino'nun iki GND ucu kartın içinde aynı bakır olduğu
  için yerleşimde tek ağ sayılır.
- Testler: `tests/guide.test.ts` (62 örnekte her parça, jumper ve tel tek adım; delik adları
  geçerli; renk kodu). ios-kontrol'de telefon maddesi (pencere içinde kayar, sayfa kaymaz).

### PCB olarak üretim: KiCad aktarımı (2026-10-28)

Lehim rehberinin sonundaki "PCB olarak üret (KiCad)" bölümü (`src/bench3d/kicad.ts`) devreyi bir
baskı devre tasarımı olarak indirir: `devre-<tarih>-kicad.zip` içinde `.kicad_pro`, `.kicad_pcb`
(KiCad 7 biçimi, sürüm 20221018; KiCad 8 ve 9 açıp yükseltir), `malzeme-listesi.csv` ve Türkçe
`OKU.txt` (yol çizme, tasarım kuralı denetimi, Gerber, gümrük notu).

- Yerleşim breadboard yerleşiminden çıkar: delik ızgarası (2,54 mm) gerçek kılıfların bacak
  aralığıyla aynıdır (direnç 10,16 mm, LED 2,54 mm, DIP-8 sıraları 7,62 mm). Breadboard'da yan
  yana satırlara düşen gövdeler kartta çakışacağından her kılıf, büyükten küçüğe, en yakın boş yere
  (2,54 mm ızgarada) kaydırılır; kılıflar arasında en az 0,8 mm kalır.
- Kılıflar dosyanın içindedir (kitaplığa bağımlı değil); açıklamalarında eşdeğer standart KiCad
  kılıfı yazar. Ped numaraları o kılıfla aynıdır (diyot ve LED'de 1 = katot, entegrede bacak no.),
  kılıf standart olanla değiştirilirse ağlar yerinde kalır.
- Karttan dışarı giden bağlantılar (pil, kaynak, lamba, motor, hoparlör, röle, hazne: 5,08 mm
  vidalı klemens; Arduino, ölçü aletleri, fonksiyon üreteci: 2,54 mm pin başlık) kartın üst
  kenarında, pin adları serigrafide. Ampermetre seri olduğundan ölçüm yokken köprü takılmalıdır
  (OKU.txt'de yazar).
- 555'e (8–1) ve 741'e (7 ve 4 → GND) 100 nF dekuplaj kondansatörü eklenir. Ağ adları GND, VCC ve
  `Net-(R1-Pad2)`; proje dosyasında güç ağları 0,8 mm (IPC-2221'e göre 1 oz bakırda ≈ 2 A),
  öbürleri 0,3 mm yol, 0,25 mm aralık. Dört M3 montaj deliği, kenar payı 6 mm.
- Yollar çizilmez (otomatik yönlendirme yok): KiCad'de elle ya da Freerouting ile.
- Şebekeli devre (transformatör) aktarılmaz.
- Zip yazıcı bağımlılıksız (`src/bench3d/zip.ts`, sıkıştırmasız, CRC-32). Lehim rehberi penceresi
  ve aktarım tembel yüklenir (ilk yüklenen JS büyümez).
- Testler: `tests/kicad.test.ts` (her örnekte dosya küçük bir S-ifadesi okuyucusuyla okunur; ağ
  kodları ardışık; her pinin pedi breadboard yerleşimindeki ağda; dışarı giden her tel bir bağlantı
  pedi; pedler kartın içinde; farklı ağların pedleri arasında ≥ 0,25 mm; gövdeler çakışmaz; zip
  CRC'si doğru, aynı devre aynı bayt). ios-kontrol'de telefonda indirme maddesi.

### PCB: otomatik yollar ve üretim dosyaları (2026-10-28)

Lehim rehberinin sonundaki bölüm ("Baskı devre (PCB) olarak üret", `src/editor/PcbPanel.tsx`)
kartın üstten görünüşünü (pedler, üst yüz kırmızı, alt yüz mavi yollar, serigrafi) gösterir ve iki
zip verir: üreticiye doğrudan yüklenen **üretim zip'i** (`devre-<tarih>-uretim.zip`) ve yolları
çizilmiş **KiCad projesi**.

- Yol çizici `src/bench3d/router.ts`: 0,635 mm ızgarada A* (45°'lik yollar; üst yüzde yatay, alt
  yüzde dikey tercih; via yalnızca gerektiğinde). THT pedleri iki yüzde de bakır olduğundan yol
  pede bir yüzden girip öbüründen çıkabilir. Ağlar en kısa ağaç (Prim) sırasıyla; önce güç ağları,
  sonra kısadan uzuna; çizilemeyen ağlar öne alınıp hepsi yeniden çizilir (en çok 6 tur). Yollar
  sinyal 0,3 mm, GND/VCC 0,8 mm (sığmazsa 0,5 mm); via 0,8/0,4 mm.
- Tasarım kuralı denetimi (`checkPcb`) kesin geometriyle: farklı ağlar arası ≥ 0,25 mm, kart kenarı
  ve montaj deliği ≥ 0,5 mm, her ağ tek bakır adası. Çizilemeyen bağlantı ya da kural hatası
  varsa üretim zip'i verilmez (KiCad zip'i verilir).
- Üretim dosyaları `src/bench3d/gerber.ts`: Gerber RS-274X (X2 öznitelikleri, 4.6 mm) üst/alt
  bakır, üst/alt lehim maskesi (via'lar kapalı), üst serigrafi (`strokeFont.ts` çizgi yazı tipi,
  1 mm), kart kenarı; Excellon kaplamalı (ped + via) ve kaplamasız (montaj) delik dosyaları. Adlar
  KiCad'in Protel uzantılı adları (`-F_Cu.gtl` …), üreticiler katmanı addan tanır.
- Bağımsız denetim: dosyalar açık kaynak `pcb-stackup` / `whats-that-gerber` ile (projeye eklenmeden)
  okundu; sekiz katman da doğru tanındı, kart iki yüzden doğru çizildi.
- Örneklerin hepsinde (61) bütün bağlantılar çizilir; en büyüğü (baraj tek ışık, 39 bağlantı) ≈ 60 ms.
- Testler: `tests/router.test.ts` (her örnekte çizilemeyen yok, DRC temiz, tek ada, aynı kart aynı
  yollar), `tests/gerber.test.ts` (küçük Gerber/Excellon okuyucusuyla: sözdizimi, açıklıklar, her ped
  ve via bir kez, yollar katmanındaki kadar çizgi, delikler pedlerle aynı yerde ve çapta). ios-kontrol'de
  telefonda Gerber indirme maddesi.

PCB araştırması ve sonraki aşamalar: `docs/pcb/arastirma.md`.


### Arayüz v3: "Defter" düzeni (2026-10-28, sürüyor)

Brif ve çizimler `docs/tasarim-v3/` (önerilen sıradaki 9 adım; motor, model, örnekler ve 3B
modellerin görünüşü değişmez). Yapılanlar ve kararlar:

1. **Defter** (`src/editor/Notebook.tsx`, `notebookOrder.ts`): sağdaki panelde her parça bir kart;
   açık kart seçimle aynı şey. Sıra: önce laboratuvar cihazları ve Arduino, sonra etiket sırası;
   aynı türden 3+ parça tek satırda. 20'den fazla parçalı devrelerde de aynı kural (açık soruya
   karar: yeni başlık ya da arama kutusu eklenmez; gruplama listeyi kısaltır, kapalı başlar).
   Kapalı kartların ölçümleri 250 ms'de bir güncellenir. İzleme (salınan değerlerin kararlı
   gösterimi) pahalıdır: bütün parçalar izlenince 3B baraj örneği 115 → 26 fps. Bu yüzden zamanla
   değişen kaynağı olan devrede yalnızca kaynaklar, LED'ler, ölçü aletleri ve seçim izlenir (öbür
   kapalı kartlar değerini gösterir); DC devrede kapalı kartlar anlık değeri izlemeden gösterir.
2. **Masaüstü kabuğu**: 60 px üst çubuk (`DeskTopBar`: devrenin adı ▾ Dosya, Örnekler; Geri al,
   Kur kipinde İleri al ve kayıt durumu, Yardım, Ayarlar; çalışırken durum ve süre, Hız; Oynat ya da
   Duraklat + Durdur). Alt simülasyon çubuğu ve ipucu şeridi kalktı; elektron akışı Ayarlar'da.
   Tuvalin sağ altında uzaklaştır, yakınlaştır, sığdır, tam ekran ve 3B (`CanvasControls.tsx`).
   Kablo aracı düğmesi kalktı (W kısayolu ve uçtan sürükleme duruyor); sürüklerken bırakılacak uç
   vurgulanıp adıyla etiketlenir, sol altta "Uca bırak: bağla · Esc vazgeç". Parça kütüphanesi ve
   cihaz rafı, yerlerini alan adımlara (4: parça ekleme satırı, 5: cihaz kartları) kadar durur.
