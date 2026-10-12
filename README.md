# Devre Simülatörü

Fizik bölümü öğrencileri için tarayıcıda çalışan, şematik görünümlü, Türkçe bir devre kurma ve
simülasyon aracı. Arayüz ve çalışma mantığı derslerde kullanılan şematik simülatörlerden ilham
alır; görseller, adlar ve kod bu projeye özgüdür. Sunucu ya da veritabanı yoktur: `npm run build`
çıktısı (`dist/`) herhangi bir statik hostinge yüklenebilir.

**Yayındaki adres:** <https://yigitkasap.github.io/devre-simulatoru/>

> Sitenin adı tek bir yerde tanımlıdır: [`src/config.ts`](src/config.ts).

## Özellikler (v1)

- **Parçalar:** pil (iç dirençli), toprak, direnç, kondansatör, diyot, LED (kırmızı/yeşil/mavi),
  anahtar, voltmetre, ampermetre.
- **Şematik editör:** ızgaralı tuval, sürükle-bırak ya da seç-tıkla yerleştirme, pinden pine kablo,
  T bağlantısı, taşıma (kablolar esner), döndürme, seçim kutusu, geri alma/yineleme, özellik
  penceresi (SI önekli değer girişi), zigzag ya da kutu (IEC) direnç sembolü.
- **Simülasyon:** Oynat / Duraklat / Durdur, ×0,01 … ×1 hız, çalışırken değer değiştirme ve
  anahtara tıklama.
- **Eğitsel görünüm:** akım noktaları (geleneksel akım ya da elektron akışı), gerilime göre kablo
  rengi, LED parlaklığı ve yanması, kondansatör dolma çubuğu, ölçü aleti ekranları, V/I/P bilgi
  kutusu (Ohm yasası kontrolü), kısa devre uyarısı, mesaj paneli.
- **Örnekler:** 6 hazır devre; her birinde tahmin sorusu, cevap simülasyon çalışınca açılır.
- **Kaydetme ve paylaşma:** tarayıcıya otomatik kayıt, JSON dışa/içe aktarma, paylaşım bağlantısı.

## Kurulum ve komutlar

Node.js 22.12 ya da üstü gerekir.

```bash
npm install        # bağımlılıkları kur
npm run dev        # geliştirme sunucusu: http://localhost:4321/devre-simulatoru/
npm test           # testler (Vitest): çözücü, birimler, model, örnekler
npm run build      # tür denetimi (astro check) + statik derleme → dist/
npm run preview    # derlenmiş siteyi yerelde aç: http://localhost:4321/devre-simulatoru/
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

`npm test` 90 test çalıştırır: görev tanımının 8. bölümündeki tüm devreler (gerilim bölücü,
voltmetre ve ampermetre etkisi, LED karakteristiği ve yanması, diyot, RC dolma, kısa devre,
topoloji, birim ayrıştırma), sayısal sağlamlık, şema modeli, kablo akımları, V/I/P metinleri,
hazır örneklerin cevapları ve paylaşım bağlantısı.

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

### Örnekler

- Altı örnek: görevdeki beş örnek ve kullanıcı isteğiyle eklenen "Ampermetrenin etkisi".
  Devreler `src/examples/*.json` dosyalarında, metinleri (başlık, açıklama, tahmin sorusu,
  cevap) `i18n/tr.ts` içindedir; böylece arayüz metinlerinin tamamı tek dosyada kalır.
- **Tahmin sorusu (kullanıcı isteği):** Örnek kartında önce açıklama ve soru görünür; cevap,
  örnek yüklendikten sonra Oynat'a basılınca açılır. Görevde açıklamada verilen sonuç cümleleri
  (ör. "Voltmetre 12 V yerine 10 V gösterir…") cevabı önceden söylememek için cevap bölümüne
  taşındı.
- Elle hesabın temiz çıkması için örneklerdeki pillerin iç direnci 0'dır (açıklamada "ideal"
  yazar). Her örneğin cevabı `tests/examples.test.ts` ile simülasyona karşı doğrulanır.
- Örnek yüklenince görünüm, sol üstteki örnek kartının kapladığı alan boş kalacak şekilde
  devreye sığdırılır (telefonda kartın altına).

## Lisans notu

Bu projenin kodu sıfırdan yazıldı. Falstad CircuitJS1 (GPL) ve PhET Circuit Construction Kit
(GPL) kaynak kodlarından hiçbir şey kopyalanmadı ya da uyarlanmadı. Sitede başka bir simülatörün
adı, logosu ya da ekran görüntüsü kullanılmaz.
