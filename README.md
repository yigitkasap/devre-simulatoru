# Devre Simülatörü

Fizik bölümü öğrencileri için tarayıcıda çalışan, şematik görünümlü, Türkçe bir devre kurma ve
simülasyon aracı. Arayüz ve çalışma mantığı derslerde kullanılan şematik simülatörlerden ilham
alır; görseller, adlar ve kod bu projeye özgüdür. Sunucu ya da veritabanı yoktur: `npm run build`
çıktısı (`dist/`) herhangi bir statik hostinge yüklenebilir.

**Yayındaki adres:** <https://yigitkasap.github.io/devre-simulatoru/>

> Sitenin adı tek bir yerde tanımlıdır: [`src/config.ts`](src/config.ts).

## Özellikler

- **Parçalar:** pil (iç dirençli), AC kaynak (sinüs/kare/üçgen), toprak, direnç, kondansatör,
  diyot, zener diyot, LED (kırmızı/sarı/yeşil/mavi), NPN ve PNP transistör, N ve P kanallı JFET,
  N ve P kanallı MOSFET, anahtar, voltmetre, ampermetre (DC/AC kipi), su haznesi (dört problu
  seviye sensörü; elle ya da Doldur/Boşalt ile). Diyot, NPN, N kanallı JFET
  ve N kanallı MOSFET'te föydeki parçaların modelleri (1N4001, BC107, BF245A, IRF510; eklem
  kapasiteleri ve ters toparlanma dahil) ya da eski basit modeller seçilir.
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
  değer değiştirme ve anahtara tıklama.
- **Eğitsel görünüm:** akım noktaları (geleneksel akım ya da elektron akışı), gerilime göre kablo
  rengi (klasik ya da renk körlüğüne uygun ölçek), düğüm gerilimi etiketleri, LED parlaklığı ve
  yanması, kondansatör dolma çubuğu, ölçü aleti ekranları, İnceleme panelinde canlı V/I/P ve Ohm
  yasası notu, hata ve uyarı rozetleri, toprak isteğe bağlı (toprak yokken sıfır noktasında
  "0 V" işareti), toprak tuzağı uyarısı, yanan LED için önerilen ön direnç.
- **Klavye ve erişilebilirlik:** "Tuvale atla" bağlantısı, tuvalde oklarla parçadan parçaya geçiş,
  kısayollar, görünür odak, ekran okuyucu için parça listesi ve seyreltilmiş canlı duyurular.
- **Osiloskop:** iki kanal (A, B) ortak uca göre; DC/AC/GND kuplaj, A ve B, ADD (A + B; INV ile
  A − B) ve X-Y kipi, B'yi ters çevirme (INV), gerçek giriş (1 MΩ ‖ 25 pF) ya da ideal giriş,
  volt/bölme, zaman/bölme (0,1 µs … 1 s), kanal konumu, otomatik tetikleme, "Oto" ayar (hızı da
  ayarlar); ekranın altında tepe-tepe, etkin değer ve frekans.
- **Örnekler:** üst çubuktaki "Örnekler" penceresinde 12 grupta 27 hazır devre: temel devreler,
  laboratuvar cihazları (köprüde toprak tuzağı), Elektronik Laboratuvarı föyünün dokuz deneyi
  (diyot karakteristikleri, doğrultucular, kenetleyici ve katlayıcı, kırpıcılar, FET
  karakteristikleri, JFET/BJT/MOSFET yükselteçleri, transistörün anahtar olarak kullanılması) ve
  baraj su seviyesi uyarısı projesi; her birinde tahmin sorusu, cevap simülasyon çalışınca açılır.
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
npm test           # testler (Vitest): çözücü, birimler, model, örnekler
npm run build      # tür denetimi (astro check) + statik derleme → dist/
npm run preview    # derlenmiş siteyi yerelde aç: http://localhost:4321/devre-simulatoru/
npm run ios-kontrol  # iOS/dokunmatik kontrol listesi (dev sunucusu açıkken; aşağıya bak)
```

Adresteki `/devre-simulatoru/`, GitHub Pages için ayarlanan `base` değeridir (aşağıya bak).

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

`npm test` 306 test çalıştırır (8'i fizik denetiminde bilinen ve sonraki aşamalarda düzelecek eksikler; `it.fails`): görev tanımının 8. bölümündeki tüm devreler (gerilim bölücü,
voltmetre ve ampermetre etkisi, LED karakteristiği ve yanması, diyot, RC dolma, kısa devre,
topoloji, birim ayrıştırma), sayısal sağlamlık, şema modeli, kablo akımları, V/I/P metinleri,
AC kaynak (dalga biçimleri, doğrultmaç, kare dalgalı RC), ölçü aletlerinin DC/AC kipi,
osiloskop kaydı ve ekranı (tetikleme, X-Y, ölçümler, Oto ayar), zener ve transistörlerin el
hesabıyla bilinen çalışma noktaları (`tests/transistor.test.ts`), föy parça modelleri (1N4001,
BC107, BF245A, IRF510: veri sayfası noktaları, ters toparlanma, frekansla kazanç düşmesi;
`tests/models.test.ts`), su haznesi (ıslak/kuru prob, doldurma ve boşaltma; `tests/tank.test.ts`), laboratuvar cihazları
(50 Ω çıkış, offset, simetri, TTL, CV/CC, 1 MΩ giriş, AC kuplaj, toprak tuzağı ve ADD ile doğru
ölçüm; `tests/instruments.test.ts`), bütün hazır örneklerin
cevapları (`tests/examples.test.ts`, `tests/examples-lab.test.ts`), paylaşım bağlantısı, mesajlar
(toprak tuzağı, ön direnç önerisi), renk ölçekleri ve telefon yardımcıları (ekler, zincirle ekleme,
kablo yolu; `tests/phone.test.ts`). Arayüz kontrol listesi ayrıca `npm run ios-kontrol` ile çalışır
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
- **Zaman ilerletme:** Kare süresi h'nin katı değilse kalan süre bir sonraki kareye aktarılır;
  böylece LU ayrıştırması her karede yeniden yapılmaz ve simülasyon zamanı kaymaz.
- **Toprak isteğe bağlı:** ayrıntı aşağıda, "Fizik 1". Toprak varken toprağa bağlı olmayan devre
  parçaları kendi sıfır noktasını alır; Mesajlar'da bilgi olarak gösterilir.
- **Değer girişi:** Görevdeki önekler dışında `K` (kilo) ve `4k7` yazımı da kabul edilir.
  Rakamlar arasındaki boşluk hata sayılır ("1 2").

### Fizik denetimi ve düzeltmeler (2026-10)

Çözücü 71 kontrolle denetlendi (commit 3d9bc92; `tests/fizik-denetimi.test.ts`). 62 kontrol doğru
çıktı; 9 kontrol, sırasıyla düzeltilecek eksikleri gösteriyor ve testte `it.fails` ile işaretli:
toprak zorunluluğu (Aşama 1), açık devrede gmin kaçak akımı (Aşama 2), iki toprak sembolü üzerinden
görünmez kapanma (Aşama 3), küçük zaman sabitinde ve RC süzgeçte zaman adımı hatası (Aşama 4), LED
ters gerilimi, direnç gücü ve kutuplu kondansatör sınırları (Aşama 5). Her aşamada düzelen kontroller
normal teste çevrilir. Aşamaların kararları aşağıda.

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
  etiketi ve pinde halka (yalnızca kaynak içeren adalarda; tek başına duran parçada işaret
  kalabalık yapar). Etiket ekran ölçüsündedir (yakınlaştırmayla küçülmez); dokunmatikte hedefi
  44 px. Dokununca ya da tıklayınca kısa açıklama açılır. Eski "devrede toprak yok" afişi ve tek
  tıkla toprak ekleme kaldırıldı.

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
    iPhone öykünmesiyle telefon (390×844, 375×667, yatay 844×390), tablet ve masaüstünde 134 madde
    dener ve bir madde kalırsa hata koduyla çıkar. Öykünme yukarıdaki dokunma alanı hatasını
    göremiyordu; bu yüzden listenin ilk bölümü bu kuralların yerinde durduğunu doğrudan denetler.
    `playwright-core` bu projeye kurulu değildir; yolu `PLAYWRIGHT_CORE` ortam değişkeniyle verilir.
    Dokunmatik davranışı değiştiren işler ayrıca gerçek bir iPhone'da denenmelidir.
- **Kütüphanenin bilgi alanı:** Masaüstünde kütüphanenin altında, fareyle üzerine gelinen (ya da
  yerleştirilmekte olan, seçili) parçanın açıklaması gösterilir; telefonda yoktur.
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
  50 µs ile en kısa periyodun 1/50'sinden küçük olanıdır (1 kHz'te 20 µs, 1 MHz'te 20 ns).
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
  devrede toprak sembolü gerekmez; akım çizgesinde bu uç toprak gibi davranır. Bu sayede
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
- **BJT (BC547B / BC557B benzeri):** Ebers-Moll taşıma modeli, Early etkisiyle:
  I_CT = (I_F − I_R)·(1 − V_BC/V_A), I_C = I_CT − I_R/β_R, I_B = I_F/β_F + I_R/β_R.
  Is = 2,39·10⁻¹⁴ A, β_R = 7,9, V_A = 63 V (NXP BC547B SPICE modeli); β_F varsayılanı 200
  (veri sayfası 200–450). PNP aynı denklemlerin ters işaretlisidir. İki eklemin gerilim adımı
  diyottaki gibi sınırlanır; bölge (kesim/aktif/doyum) bilgi kutusunda gösterilir.
- **JFET (2N5457 benzeri):** Shichman-Hodges kare yasası, β = I_DSS / V_P², λ = 0,01 V⁻¹;
  I_DSS = 3 mA, V_P = −1,5 V (veri sayfası 1–5 mA ve −0,5…−6 V). Kapı-kanal eklemleri
  Is = 10⁻¹⁴ A'lik diyotlardır (kapı ileri kutuplanırsa akım çeker). Kanal simetriktir.
- **MOSFET (2N7000 benzeri, kanal oluşturmalı):** I_D = k·(V_GS − V_T)²·(1 + λV_DS) doyumda,
  k·(2(V_GS − V_T)V_DS − V_DS²)·(1 + λV_DS) omik bölgede; V_T = 2,1 V, k = 50 mA/V²
  (V_GS = 4,5 V'ta I_D(on) ≈ 0,29 A, veri sayfası en az 75 mA), λ = 0,01 V⁻¹. Kapı yalıtılmıştır;
  gövde diyodu modellenmez.
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
  (V > V_J/2'de doğrusal uzatma) ve difüzyon yükü Q = τ·I. Zaman adımında geri Euler ile
  i = (Q(v) − Q_önceki)/h, iletkenliği C(v)/h; bu katkı `stampNonlinear(sys, ctx)` içinde
  Newton-Raphson'a girer ([`junction.ts`](src/sim/devices/junction.ts) → `ChargeState`).
  Doğru akım çözümünde (h = 0) yük akımı yoktur: kondansatörsüz devreler eskisi gibi tek
  çözümle kalır. Ölçülen akımlar son adımın yük akımlarını da içerir.
- **Sonuçları (testler: `tests/models.test.ts`):** 1N4001'de ±5 V kare dalga ters dönünce
  ≈ 3 µs boyunca ≈ −5,4 mA ters akım akar (genel modelde hiç akmaz); 1 MHz'te diyot doğrultmaz.
  BC107'li ortak emetörlü yükselteçte (10 kΩ'dan sürülen baz) kazanç 1 kHz'te eski modelle
  aynı, 100 kHz'te ≈ %25, 1 MHz'te ≈ %90 düşer (Miller etkisi). IRF510'lu kaynak dirençli
  yükselteçte (R_D = 10 kΩ, R_S = 1 kΩ) kazanç 1 kHz'te ≈ 9,8; C_GD yüzünden kutup ≈ 420 kHz
  (R_S transistörü akım kaynağı gibi yaptığından C_DS'in etkisi neredeyse yoktur).
- **İhmal edilenler:** 1N4001'in seri direnci (≈ 0,05 Ω; föy devrelerinde akım 10 mA'i
  geçmez) ve ters kırılması (50 V); BF245A kartının 9 Ω'luk drain/source dirençleri; IRF510'un
  iç dirençleri (≈ 0,5 Ω) ve gövde diyodunun doğru akım davranışı. Bunlar için parçaya iç düğüm
  eklemek gerekir; föydeki akımlarda fark ölçüm belirsizliğinin çok altında.

### Yeniden tasarım (2026-10)

Arayüz `docs/tasarim/` altındaki tasarıma göre 9 aşamada yeniden yazıldı; hesap ve veri mantığı
(`src/sim`, `src/model`), otomatik kayıt, paylaşım bağlantısı ve JSON sürüm 1 değişmedi.

- **Düzenler:** < 900 px telefon (yükseklik < 500 px ise yatay telefon: yan panel ve dikey çubuk),
  ≥ 900 px dokunmatik tablet, fareyle 900–1279 px sıkışık masaüstü (kütüphane şerit), ≥ 1280 px
  masaüstü. Dokunmatik ve kısa (< 500 px) ekranda genişlik 900 px'i aşsa da telefon düzeni.
- **Devrenin adı:** açık örneğin adı, yoksa "Devrem" (boş devrede "Yeni devre"); yalnızca arayüzde,
  JSON'a ve bağlantıya girmez.
- **Ölç düzeni (masaüstü):** Oynat'tan sonra rafta cihaz varsa kütüphane ve İnceleme paneli şeride
  iner, raf büyür; örnek açıkken paneller açık kalır.
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
  liste). Açılan örneğin açıklaması, tahmin sorusu ve cevabı İnceleme panelinin Örnek sekmesinde
  (telefonda alt sayfada). Gruplar ve sıraları
  [`src/examples/index.ts`](src/examples/index.ts) içindedir; iOS kuralı gereği pencere açıkken
  tuvalin `touch-action` değeri kaldırılır (pencere parmakla kaydırılabilsin).
- **Gruplar:** Temel devreler (görevdeki beş örnek, "Ampermetrenin etkisi", "Kare dalga ile RC"),
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
  | 4 Kırpıcılar | 4 V öngerilimli paralel kırpıcı; 3 V ve −2 V çift yönlü kırpıcı (güç kaynağının iki çıkışı) |
  | 5 FET karakteristikleri | BF245A: V_DD ve V_GG güç kaynağından, I_D ampermetreyle |
  | 6–8 Yükselteçler | BF245A (R_D = 2,7 kΩ, kazanç ≈ 10), BC107 (R_B = 2,2 MΩ, R_C = 5,6 kΩ), IRF510 (R_D = 10 kΩ, R_S = 1 kΩ) |
  | 9 Transistör anahtar | BC107, R1 = 10 kΩ, R2 = 1 kΩ, LED kollektörde ve emetörde; üretecin TTL çıkışı, 1 Hz |

- **Föyden çıkarılamayan ayrıntılarda varsayımlar** (föyün tam metni elimizde değil; deney
  listesi ve parça değerleri biliniyor):
  - **Zener:** Föy değerini vermiyor. Düzeni en çok benzeyen föyler (Bilecik ve Bandırma: 1N4001,
    LED ve zener, 1 kΩ) 5,6 V (1N4734A) kullanıyor; ±10 V'luk üreteçle kırılma da net görünüyor.
  - **X-Y düzeneği:** Klasik akım-gerilim çizici: osiloskobun COM'u eleman ile 1 kΩ'un
    birleşiminde, B ters çevrilmiş; bu yüzden üreteç topraktan yalıtılmış. Üreteç topraklıysa
    direnç iki toprak arasında kısa devre olur (cevapta anlatılır).
  - **Doğrultucularda 50 Hz:** 1 / 22 / 470 µF ile 1 kΩ, RC = 1 / 22 / 470 ms verir; 20 ms'lik
    periyotla "filtre yok – orta – iyi" sırası en anlamlı bu frekansta.
  - **Genlikler tepe-tepe:** Föydeki "0,5 V", "0,1 V" gibi giriş değerleri üretecin ön
    panelindeki gibi tepe-tepe alındı; JFET'te 2 V'ta bozulma, MOSFET'te 1 V'ta belirgin
    olmayan bozulma föydeki anlatımla tutuyor.
  - **MOSFET yükselteci:** "IRF510, 10 kΩ, 1 kΩ" R_D = 10 kΩ, R_S = 1 kΩ olarak yorumlandı (kazanç
    ≈ R_D / R_S ≈ 10); kapı, üretecin DC offset'iyle (4,55 V) sürülür.
  - **Tasarım ödevleri** (JFET'te R_D, BJT'de R_B ve R_C) için birer çözüm konuldu; cevap
    metni tasarım formülünü verir.
- **Yükselteçlerde** BJT'nin kuplaj kondansatörünün başlangıç gerilimi çalışma noktasındaki
  V_BE'dir (2,2 MΩ üzerinden dolması 22 s sürerdi); Oynat'a basınca kararlı çalışma görülür.
- **Kullanılmayan cihaz çıkışları:** Üretecin kullanılmayan OUT ya da TTL çıkışı ve güç
  kaynağının iki ucu da boş olan çıkışı "boşta uç" uyarısı vermez (tek ucu bağlı çıkış uyarır).
- **Osiloskobun AC kuplajı** artık girişte 1 MΩ ile seri ≈ 16 nF'lık kuplaj kondansatörü gibi
  davranır: doğru akım çekmez. Önceden AC kuplajda da 1 MΩ doğru akımda devreyi yüklüyordu;
  sabit öngerilimli BJT'nin bazına bağlanan prob baz akımının ≈ %12'sini çalıyordu.
- Devreler `src/examples/*.json` dosyalarında, metinleri (başlık, açıklama, tahmin sorusu,
  cevap) `i18n/tr.ts` içindedir; böylece arayüz metinlerinin tamamı tek dosyada kalır.
- **Tahmin sorusu (kullanıcı isteği):** Örnek kartında önce açıklama ve soru görünür; cevap,
  örnek yüklendikten sonra Oynat'a basılınca açılır. Görevde açıklamada verilen sonuç cümleleri
  (ör. "Voltmetre 12 V yerine 10 V gösterir…") cevabı önceden söylememek için cevap bölümüne
  taşındı.
- Elle hesabın temiz çıkması için örneklerdeki pillerin iç direnci 0'dır (açıklamada "ideal"
  yazar). Her örneğin cevabı `tests/examples.test.ts` ve `tests/examples-lab.test.ts` ile
  simülasyona karşı doğrulanır.
- Örnek yüklenince görünüm, sol üstteki örnek kartının kapladığı alan boş kalacak şekilde
  devreye sığdırılır (telefonda kartın altına).

## Lisans notu

Bu projenin kodu sıfırdan yazıldı. Falstad CircuitJS1 (GPL) ve PhET Circuit Construction Kit
(GPL) kaynak kodlarından hiçbir şey kopyalanmadı ya da uyarlanmadı. Sitede başka bir simülatörün
adı, logosu ya da ekran görüntüsü kullanılmaz.
