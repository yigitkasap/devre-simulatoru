# Devre Simülatörü

Fizik bölümü öğrencileri için tarayıcıda çalışan, şematik görünümlü, Türkçe bir devre kurma ve
simülasyon aracı. Sunucu ya da veritabanı yok; `npm run build` çıktısı (`dist/`) herhangi bir statik
hostinge yüklenebilir.

> Sitenin adı tek bir yerde tanımlıdır: [`src/config.ts`](src/config.ts).

## Kurulum ve komutlar

Node.js 22.12 ya da üstü gerekir.

```bash
npm install        # bağımlılıkları kur
npm run dev        # geliştirme sunucusu: http://localhost:4321
npm test           # çözücü testleri (Vitest)
npm run build      # tür denetimi (astro check) + statik derleme → dist/
npm run preview    # derlenmiş siteyi yerelde aç
```

## Mimari (özet)

```
src/
  config.ts       site adı ve açıklaması (tek yer)
  sim/            saf TypeScript çözüm motoru (React'ten bağımsız)
    netlist.ts    çözücünün girdisi: bileşenler + pinlerin bağlı olduğu ağlar + kablolar
    compile.ts    union-find ile düğüm numaralama, iç düğümler, akım bilinmeyenleri
    topology.ts   toprak, boşta uç, direnç içermeyen döngü, kopuk parça kontrolleri
    mna.ts        MNA sistemi (A·x = z) ve stamp yardımcıları
    lu.ts         kısmi pivotlamalı yoğun LU ayrıştırması
    engine.ts     zaman adımı, Newton-Raphson, LU önbelleği, LED yanması
    units.ts      SI önekli değer ayrıştırma ve Türkçe sayı biçimi
    devices/      her bileşenin stamp ve durum kodu ayrı dosyada
  i18n/tr.ts      arayüzdeki tüm metinler
  editor/         React arayüzü (SVG tuval, kütüphane, özellik penceresi...)
  pages/          Astro sayfaları
tests/            Vitest testleri
```

Arayüz motoru yalnızca [`src/sim/index.ts`](src/sim/index.ts) üzerinden kullanır. Çözücü metin
üretmez; hata ve uyarıları kod + sayısal parametre olarak döndürür, Türkçe metinler `tr.ts`'tedir.

## Kararlar

Görev tanımında açık bırakılan ya da ortamdan kaynaklanan kararlar.

### Araçlar ve sürümler

- **Astro 6.4.8 (7 değil).** Bu geliştirme bilgisayarında Windows *Smart App Control* açık ve
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

### Çözücü

- **Pil:** İç direnç > 0 ise ideal kaynak + seri direnç (bir iç düğüm). Yapının değer
  değişikliklerinde sabit kalması için iç düğüm ve akım satırı her zaman ayrılır; iç direnç 0
  ise iç düğüm yalnızca gmin ile toprağa bağlı kalır.
- **İdeal pilde kısa devre eşiği:** Görevdeki kural (akım > V / (2·R_iç)) iç direnç 0 iken
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
- **Otomatik kayıt (Aşama 3'e alındı):** Devre her değişiklikten 0,4 s sonra ve sayfa
  kapanırken `localStorage` içine (`devre-simulatoru:devre`) yazılır; açılışta okunur.
  Bozuk ya da tanınmayan veri sessizce yok sayılır.

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
  V = E − I·R_iç kontrolü, kondansatörde depolanan enerji, ölçü aletlerinde iç direncin
  etkisi gösterilir.
- **Mesaj paneli:** Topoloji kontrolleri devre her değiştiğinde (simülasyon durdurulmuşken
  de) çalışır. Panel, kurulum sırasında sık çıkan "boşta uç" uyarılarıyla kendiliğinden
  açılmaz; simülasyon hatası ya da yeni bir çalışma uyarısı (kısa devre, yanan LED) gelince
  açılır. Simülasyon başlatılamazsa hatanın parçaları vurgulanır. Vurgulanan parça ekran
  dışındaysa görünüm ona kaydırılır.
- **Yanmış LED:** Yanında açıklama balonu çıkar (Kapat / Onar). Sağ tık menüsünde "Onar"
  vardır; Durdur da onarır. Devre değişmediyse onarılan LED yeniden yanar.
- **Sağ tık menüsü:** Parçalarda Özellikler, Döndür, Sil (ve yanmış LED'de Onar).

## Lisans notu

Bu projenin kodu sıfırdan yazıldı. Falstad CircuitJS1 (GPL) ve PhET Circuit Construction Kit
(GPL) kaynak kodlarından hiçbir şey kopyalanmadı ya da uyarlanmadı.
