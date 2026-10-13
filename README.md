# Devre Simülatörü

Fizik bölümü öğrencileri için tarayıcıda çalışan, şematik görünümlü, Türkçe bir devre kurma ve
simülasyon aracı. Arayüz ve çalışma mantığı derslerde kullanılan şematik simülatörlerden ilham
alır; görseller, adlar ve kod bu projeye özgüdür. Sunucu ya da veritabanı yoktur: `npm run build`
çıktısı (`dist/`) herhangi bir statik hostinge yüklenebilir.

**Yayındaki adres:** <https://yigitkasap.github.io/devre-simulatoru/>

> Sitenin adı tek bir yerde tanımlıdır: [`src/config.ts`](src/config.ts).

## Özellikler

- **Parçalar:** pil (iç dirençli), AC kaynak (sinüs/kare/üçgen), toprak, direnç, kondansatör,
  diyot, zener diyot, LED (kırmızı/yeşil/mavi), NPN ve PNP transistör, N ve P kanallı JFET,
  N ve P kanallı MOSFET, anahtar, voltmetre, ampermetre (DC/AC kipi), iki kanallı osiloskop.
- **Şematik editör:** ızgaralı tuval, sürükle-bırak ya da seç-tıkla yerleştirme, pinden pine kablo,
  T bağlantısı, taşıma (kablolar esner), döndürme, seçim kutusu, geri alma/yineleme, özellik
  penceresi (SI önekli değer girişi), zigzag ya da kutu (IEC) direnç sembolü.
- **Simülasyon:** Oynat / Duraklat / Durdur, ×0,01 … ×1 hız, çalışırken değer değiştirme ve
  anahtara tıklama.
- **Eğitsel görünüm:** akım noktaları (geleneksel akım ya da elektron akışı), gerilime göre kablo
  rengi, LED parlaklığı ve yanması, kondansatör dolma çubuğu, ölçü aleti ekranları, V/I/P bilgi
  kutusu (Ohm yasası kontrolü), kısa devre uyarısı, mesaj paneli.
- **Osiloskop:** iki kanal (A, B) ortak uca göre; Y-t ve X-Y kipi (karakteristik eğrileri),
  B kanalını ters çevirme, volt/bölme, zaman/bölme, kanal konumu, otomatik tetikleme, "Oto" ayar;
  ekranın altında tepe-tepe, etkin değer ve frekans.
- **Örnekler:** üst çubuktaki "Örnekler" penceresinde 10 grupta 22 hazır devre (temel devreler,
  diyot karakteristiği, doğrultucular, kenetleyici ve katlayıcı, kırpıcılar, FET karakteristikleri,
  FET/BJT/MOSFET yükselteçleri, transistörün anahtar olarak kullanılması); her birinde tahmin
  sorusu, cevap simülasyon çalışınca açılır.
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

| İşlem | Nasıl |
|---|---|
| Parça ekle | Kütüphaneden sürükleyip bırak ya da seçip tuvale tıkla (Shift + tıkla: art arda) |
| Kablo çek | Bir pinin ucuna tıkla, ara tıklamalar köşe olur, bir pine ya da kabloya tıklayarak bitir; çift tık: boşta bitir |
| Kablo aracı | W (boş noktadan ya da bir kablonun üzerinden başlatmak için) |
| Döndür | R: 90° döndürür, bağlı kablolar pinleri izler (yerleştirirken de çalışır) |
| Ters çevir | F: yönlü parçanın (diyot, LED, pil, voltmetre, ampermetre) uçlarını yer değiştirir, kablolar yerinde kalır; sağ tık → Ters çevir |
| Sil | Delete / Backspace |
| Geri al / yinele | Ctrl+Z / Ctrl+Y (ya da Ctrl+Shift+Z) |
| Tümünü seç | Ctrl+A |
| İptal | Esc |
| Özellikler | Parçaya çift tıkla ya da sağ tıkla → Özellikler |
| Yakınlaştır / kaydır | Fare tekerleği / boşluk tuşu + sürükle ya da orta tuş; telefonda iki parmak |
| Simülasyon | Alttaki Oynat / Duraklat / Durdur; çalışırken anahtara tıklayınca açılır/kapanır |
| Örnekler | Üst çubuktaki "Örnekler" düğmesi: gruplanmış örnek devreler penceresi |
| Yanmış LED | Sağ tıkla → Onar ya da Durdur |
| Telefon / tablet | Kütüphanede parçaya dokun: parça görünen alanın ortasına eklenir · sürükle: taşı · pin ucuna dokun: kablo (üstteki İptal ile vazgeç) · çift dokun: özellikler · basılı tut: menü (Döndür, Ters çevir, Sil, Onar) · boşluğa dokun: seçimi kaldır · iki parmak: yakınlaştır · simülasyonda seçili parçanın V/I/P bilgisi yanında görünür |

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
    Simulator.tsx    kök bileşen: durum, yükleme, döndürme, mesajlar
    Canvas.tsx       SVG tuval ve tüm fare/dokunma etkileşimleri
    useSimulation.ts simülasyon döngüsü (requestAnimationFrame)
    readouts.ts      V/I/P bilgi kutusu ve ölçü aleti ekranı metinleri
    ...              kütüphane, özellik penceresi, mesaj paneli, örnek kartı, simgeler
  examples/          hazır örneklerin JSON dosyaları
  i18n/tr.ts         arayüzdeki tüm metinler (Türkçe)
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

`npm test` 164 test çalıştırır: görev tanımının 8. bölümündeki tüm devreler (gerilim bölücü,
voltmetre ve ampermetre etkisi, LED karakteristiği ve yanması, diyot, RC dolma, kısa devre,
topoloji, birim ayrıştırma), sayısal sağlamlık, şema modeli, kablo akımları, V/I/P metinleri,
AC kaynak (dalga biçimleri, doğrultmaç, kare dalgalı RC), ölçü aletlerinin DC/AC kipi,
osiloskop kaydı ve ekranı (tetikleme, X-Y, ölçümler, Oto ayar), zener ve transistörlerin el
hesabıyla bilinen çalışma noktaları (`tests/transistor.test.ts`), bütün hazır örneklerin
cevapları (`tests/examples.test.ts`, `tests/examples-lab.test.ts`) ve paylaşım bağlantısı. Dokunmatik/iOS kontrol listesi ayrıca `npm run ios-kontrol` ile çalışır.

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
- **Ek uyarı:** Toprağa hiçbir bileşen üzerinden bağlı olmayan devre parçaları için
  "toprağa bağlı olmayan parça" uyarısı verilir (gerilimleri yalnızca gmin belirler).
- **Değer girişi:** Görevdeki önekler dışında `K` (kilo) ve `4k7` yazımı da kabul edilir.
  Rakamlar arasındaki boşluk hata sayılır ("1 2").

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
- **Dokunmatik ekran ve iOS Safari:** Birincil işaretçi parmaksa (`pointer: coarse`):
  - Kütüphanede parçaya dokunmak onu görünen alanın ortasındaki boş bir yere ekler; imleci izleyen
    önizleme olmadığı için masaüstündeki "seç, sonra tuvale tıkla" akışı ve HTML sürükle-bırak
    kullanılmaz. Kütüphane önizlemesi yalnızca gerçek fareyle değişir (iOS, dokunuşun ürettiği
    "üzerine gelme" olayı sayfayı değiştirirse ilk dokunuşta tıklamayı göndermez).
  - Parçanın gövdesi her yöne 12 px geniş sayılır ve gövdenin içindeyken pin ancak 12 px
    yakınsa seçilir; böylece küçük parçalar da parmakla tutulup taşınabilir.
  - iOS'ta çift tıklama ve sağ tık olayları güvenilir gelmediği için çift dokunuş (özellikler) ve
    uzun basış (0,55 s, menü) ayrıca algılanır. Uzun basıştan sonra parmak kıpırdarsa menü kapanır
    ve parça taşınır; yani "basılı tutup sürükleme" de çalışır.
  - Boşluğa dokunmak seçimi kaldırır; kablo çizerken üstte bir "İptal" düğmesi çıkar (Esc yok).
    Simülasyon sırasında seçili parçanın V/I/P bilgisi yanında gösterilir (üzerine gelme yok).
  - Tuvalin tüm çizimi olay almaz (`pointer-events: none`); hedef her zaman SVG'dir. Dokunmatikte
    işaretçi dokunulan öğeye örtük olarak yakalandığı için, yeniden çizilen bir alt öğe sürüklemeyi
    koparabilirdi.
  - WebKit, `touch-action: none` verilmiş tuvalin dokunma bölgesini üstüne binen katmanlara da
    uygulayabiliyor; bu yüzden kütüphane çekmecesi ya da bir pencere açıkken tuvalin
    `touch-action` değeri kaldırılır (aksi halde çekmece parmakla kaydırılamıyordu).
  - iOS Safari dokunuşları sayfaya yalnızca o olay türünü dinleyen bir öğenin alanında iletir.
    React dinleyicilerini Astro'nun kutusuz (`display: contents`) `astro-island` öğesine bağladığı
    için bu alan boş kalabiliyor ve tuvale hiçbir işaretçi olayı gelmiyordu (düğmeler tıklama
    olayıyla ayrı yoldan çalışıyordu). Bu yüzden belgeye boş ve pasif dokunma/işaretçi dinleyicileri
    bağlanır; SVG'ye de doğrudan, varsayılanı engelleyen `touchstart`/`touchmove` dinleyicileri
    bağlanır (Safari'nin kendi kaydırma/yakınlaştırma hareketi işaretçi akışını kesmesin diye).
  - Birincil işaretçi her basıldığında eski işaretçi kayıtları silinir; kaçırılmış bir `pointerup`
    yüzünden tek parmağın iki parmak sanılıp tuvalin kıstırma kipinde takılması önlenir.
  - **Kontrol listesi:** Tuvale, çekmeceye, pencerelere ya da olay işleyicilerine dokunan her
    değişiklikten sonra `npm run dev` açıkken `npm run ios-kontrol` çalıştırılır
    (`scripts/ios-kontrol.mjs`; yayındaki siteyi denemek için adresi ver:
    `npm run ios-kontrol -- https://yigitkasap.github.io/devre-simulatoru/`). Chromium'un iPhone
    öykünmesiyle 28 madde dener ve bir madde kalırsa hata koduyla çıkar. Öykünme yukarıdaki dokunma
    alanı hatasını göremiyordu (bütün davranış maddeleri yine geçiyordu); bu yüzden listenin ilk
    bölümü bu kuralların yerinde durduğunu doğrudan denetler. `playwright-core` bu projeye kurulu
    değildir; yolu `PLAYWRIGHT_CORE` ortam değişkeniyle verilir. Dokunmatik davranışı değiştiren
    işler ayrıca gerçek bir iPhone'da denenmelidir.
  - Giriş alanlarının yazısı dokunmatikte 16 px'tir (iOS daha küçük yazılı alana odaklanınca
    sayfayı yakınlaştırıp öyle bırakır). Arayüzde çift dokunuşla sayfa yakınlaşmaz
    (`touch-action: manipulation`), sayfa esneyip kaymaz (`overscroll-behavior: none`).
- **Parça bilgi kartı:** Kütüphanede fareyle üzerine gelinen (ya da yerleştirilmekte olan) parçanın
  sembolü ve açıklaması masaüstünde tuvalin sağ altında gösterilir; telefonda gösterilmez
  (kullanıcı isteği; kütüphanede yer kaplıyordu).
- **Yükleme:** Örnek açmak, JSON içe aktarmak, paylaşım bağlantısı açmak ve "Yeni devre"
  mevcut devrenin yerine geçer ama geri alma geçmişine girer; Ctrl+Z ile önceki devreye dönülür.
  Bu yüzden onay sorulmaz, kısa bir bildirim gösterilir.

### Simülasyon ve animasyon

- **Yapı değişikliği:** Parça ya da kablo eklemek, silmek, taşımak ya da döndürmek
  simülasyonu durdurur. Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz;
  kondansatör gerilimleri ve yanmış LED'ler korunarak devre yeniden derlenir.
- **Hız:** Kaydırıcı logaritmiktir (×0,01 … ×1) ve ×1, ×0,5, ×0,1, ×0,05, ×0,01
  değerlerine yapışır. Bir karede en fazla 6000 adım atılır; bilgisayar yetişemezse
  simülasyon gerçek zamandan geri kalır (donmaz).
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
  (+Vmax). Vmax, devredeki en büyük pil gerilimidir. Devreye bağlı olmayan kablolar gri.
- **Kondansatör çubuğu:** |V| / Vmax oranında dolar; kırmızı: + ucu yüksek, mavi: ters
  yönde dolu. Dikey kondansatörde aşağıdan yukarı dolar.

### Ölçü aletleri ve eğitsel özellikler

- **Ölçü aleti ekranı:** Otomatik ölçekli (V/mV/µV, A/mA/µA), 4 anlamlı basamak; yuvarlama
  bir basamak eklerse (9,9999 → 10,00) basamak sayısı korunur. Voltmetre v(+) − v(−),
  ampermetre + uçtan giren akımı gösterir; ters bağlanırsa değer eksi çıkar. Ekran yatay
  alette üstte, dikey alette sağdadır; o tarafta başka bir parça varsa karşı tarafa açılır.
- **V/I/P kutusu:** Simülasyon çalışırken ya da duraklatılmışken parçanın üzerine gelince
  çıkar. Pasif bileşenlerde gerilim ve akım büyüklük olarak (yönü noktalar gösterir), pilde
  ve ölçü aletlerinde işaretiyle yazılır. Dirençte Ohm yasası, iç dirençli pilde
  V = E − I·Riç kontrolü, kondansatörde depolanan enerji, ölçü aletlerinde iç direncin
  etkisi gösterilir.
- **Mesaj paneli:** Topoloji kontrolleri devre her değiştiğinde (simülasyon durdurulmuşken
  de) çalışır. Panel, kurulum sırasında sık çıkan "boşta uç" uyarılarıyla kendiliğinden
  açılmaz; simülasyon hatası ya da yeni bir çalışma uyarısı (kısa devre, yanan LED) gelince
  açılır. Simülasyon başlatılamazsa hatanın parçaları vurgulanır. Vurgulanan parça ekran
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
  Frekans en fazla 1 kHz'tir.
- **Zaman adımı:** AC kaynaklı devre kondansatörsüz de olsa adım adım çözülür; en büyük adım
  50 µs ile en kısa periyodun 1/100'ünden küçük olanıdır (1 kHz'te 10 µs).
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
- **Panelin yeri:** Masaüstünde tuvalin sağ altında (380 px); telefonda tuvalin altında ve
  küçültülmüş başlar. Ayarlar parçanın özelliklerinde saklanır (kaydedilir, paylaşılır, geri
  alınabilir; simülasyonu durdurmaz). Devre sığdırılırken panelin ve örnek kartının o anki
  (açık/küçük) yeri boş bırakılır; panel ya da kart açılıp kapanınca devre yeniden sığdırılır.

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

### Örnekler

- **Örnekler penceresi (kullanıcı isteği):** Örnekler sol panelden kaldırıldı; üst çubuktaki
  "Örnekler" düğmesi gruplanmış bir pencere açar. Gruplar ve sıraları
  [`src/examples/index.ts`](src/examples/index.ts) içindedir; iOS kuralı gereği pencere açıkken
  tuvalin `touch-action` değeri kaldırılır (pencere parmakla kaydırılabilsin).
- **Gruplar:** Temel devreler (görevdeki beş örnek, "Ampermetrenin etkisi", "Kare dalga ile RC");
  kullanıcının listesindeki deneyler: diyot karakteristiği (X-Y), doğrultucular (yarım dalga,
  orta uçlu tam dalga, köprü + filtre), kenetleyici ve gerilim ikileyici, kırpıcılar
  (öngerilimli paralel, çift yönlü zener), FET çıkış ve transfer karakteristikleri (X-Y), JFET,
  BJT ve MOSFET yükselteçleri, BJT ve MOSFET ile anahtarlama.
- **Karakteristik eğrileri:** Laboratuvardaki gibi gerilim üçgen dalgayla taranır, akım küçük
  bir ölçme direncinin geriliminden okunur ve osiloskop X-Y kipinde çizer. Ölçme direnci
  toprak tarafında olduğundan gerilimi ters işaretlidir; B kanalı ters çevrilir.
- **Orta uçlu transformatör** yerine seri iki AC kaynak kullanılır (transformatör parçası yok).
  Köprü doğrultmaçta kaynak yüzer olduğundan osiloskobun yalnızca A kanalı kullanılır.
- **Yükselteçlerde** kuplaj ve köprüleme kondansatörlerinin başlangıç gerilimi DC çalışma
  noktasına ayarlıdır; Oynat'a basınca uzun bir dolma beklemeden kararlı çalışma görülür.
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
