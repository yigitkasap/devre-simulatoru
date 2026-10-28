# Devre Simülatörü · arayüz v3: "Defter" düzeni (Ekim 2026)

Bu klasör arayüzün yeni düzenini anlatır. Simülasyon motoru ve işlevler değişmez. Değişen; ekranın nasıl bölündüğü, kontrollerin nerede durduğu ve 3B görünüme eklenen yardımcılardır.

Ana fikir: Solda devre (şema ya da 3B), sağda "defter", yani devredeki her parçanın bir kartı. Parça seçmek, değer değiştirmek, ölçüm okumak, cihaz ayarlamak, uyarı görmek ve parça eklemek tek bir listede olur.

## Klasördekiler

- `artboards/*.dc.html`: Çizimler. Nasıl okunacakları `docs/tasarim/README.md` içindeki ".dc.html dosyaları nasıl okunur?" bölümüyle aynıdır. Çizimlerdeki ölçüm değerleri örnektir.
- D1-Kur: Masaüstü, Kur kipi. Parça ekleme satırı açık, şemada kablo çekiliyor.
- D2-Cihaz: Masaüstü, "Toprak tuzağı" örneği çalışıyor. Uyarı kartı, osiloskop kartı, gruplanmış diyotlar.
- D3-Arduino: Masaüstü, "Arduino: termometre (NTC)" çalışıyor. Arduino kartı, seri ekran, NTC kaydırıcısı.
- DP1-Kur: Telefon, Kur kipi.
- DP2-Bagla: Telefon, tam ekran kablo bağlama.
- DP3-Osiloskop: Telefon, osiloskop kartına odaklanılmış.
- DP4-Arduino: Telefon, Arduino ve NTC.
- E1-3B-Masaustu: Masaüstü, 3B görünüm.
- E3-3B-Telefon: Telefon, 3B görünüm.
- B1-Baraj-Ders: Baraj sayfası, masaüstü, varsayılan (ders) görünümü.
- B2-Baraj-Devre: Baraj sayfası, masaüstü, devre paneli açık.
- B3-Baraj-Telefon: Baraj sayfası, telefon.
- B4-Baraj-TekIsik: Baraj sayfası, "Tek ışık" türü, devre paneli açık, Kat 1 (susturma) seçili.

## Kesin kurallar

1. Simülasyon motoruna, `src/model` içindeki model dosyalarına, örnek devrelere ve örneklerin açıklama metinlerine dokunma. Her adımdan sonra mevcut testleri çalıştır.
2. Renkler, yazı tipleri ve ölçüler `src/styles/global.css` içindeki `@theme` belirteçlerinden gelir. Yeni renk ekleme.
3. Kırılma noktaları korunur: 900 px altı telefon; 900 px ve üstü dokunmatik ise tablet; 900–1279 px fareyle sıkışık masaüstü; 1280 px ve üstü masaüstü; yükseklik 500 px altı ve dokunmatik ise yatay telefon.
4. Arayüz yalnızca Türkçe; ondalık ayırıcı virgül.
5. Dokunma hedefleri en az 44 × 44 px, giriş alanlarında yazı en az 16 px. Sayfanın kendisi kaymaz; yalnızca paneller kendi içinde kayar.
6. 3B modellerin görünüşü değişmez. `src/bench3d` içindeki mevcut modeller, malzemeler, ışık ve masa olduğu gibi kullanılır. E1 ve E3 çizimlerindeki 3B görseller model tasarımı değildir; yalnızca yerleşimi ve eklenecek özellikleri gösterir.
7. Belirsiz kalan bir noktada tahmin etme; dur ve sor. Bilinen açık sorular en altta.

## Masaüstü düzeni (D1, D2, D3)

- Üst çubuk (60 px): logo, devre adı ve açılır ok (Dosya menüsü), Örnekler. Sağda: Geri al, Yardım, Ayarlar; ardından durum (yeşil nokta ve süre), Hız, ana düğme. Ana düğme Kur kipinde yeşil "Oynat", çalışırken koyu "Duraklat" ve yanında "Durdur".
- Sol: şema tuvali ya da 3B. Sağ: 500 px genişliğinde defter. Sıkışık masaüstünde defter 400 px.
- Kalkan öğeler: sol parça kütüphanesi paneli, sağdaki İncele / Örnek / Mesajlar sekmeleri, alttaki cihaz rafı, alttaki simülasyon çubuğu, ipucu şeridi, uyarı şeridi, özellik penceresi. İçerikleri deftere taşınır (aşağıda).
- Tuvalin üstünde yalnızca: sol altta gerilim ölçeği (çalışırken; kablo çekerken onun yerine kısa ipucu), sağ altta uzaklaştır, yakınlaştır, sığdır ve 3B.

## Defter

1. Devredeki her parça bir karttır. Sıra: uyarılar, örnek kartı, cihazlar ve Arduino, ardından diğer parçalar etiket sırasıyla.
2. Kapalı kart (56–60 px): sembol, ad · tür, değer. Çalışırken en önemli ölçüm de görünür (ampermetrede akım büyük yazılır).
3. Açık kart: başlık (döndür, sil); değer ayarı (−/+ adımlayıcı ve sık kullanılan değer çipleri); çalışırken Gerilim, Akım, Güç; parçaya özel bölüm. Seyrek kullanılan özellikler kartın içinde katlı durur.
4. Aynı anda tek kart açıktır ve bu, seçimdir. Şemada parçaya tıklamak kartını açar ve listeyi oraya kaydırır. Kartı açmak şemada parçayı açık mavi dolgu ve mavi çerçeveyle vurgular.
5. Aynı türden 3 ya da daha fazla parça tek satırda toplanır ("Diyotlar · D1, D2, D3, D4"). Satır açılınca parçalar alt satırlarda görünür.
6. Uyarı ve hata kartları listenin en üstündedir. Metinleri mevcut mesajlardır. "D4'ü göster" gibi bir düğme ilgili parçayı seçer. İlgili parçanın kartında rozet, şemada kesikli turuncu halka görünür. Hata ve uyarı ayrımı v1 kurallarıyla aynıdır (renk tek başına anlam taşımaz).
7. Örnek kartı en üstte ve katlıdır: "Örnek · grup adı" ile kısa başlık. Açılınca mevcut açıklama, "Ne işe yarar?", "Günlük hayatta" metinleri ve önceki / sonraki örnek düğmeleri görünür.
8. Parça ekleme: listenin sonunda bir arama satırı. Yazınca eşleşen parçalar ve ilgili örnekler listelenir; Enter ilk parçayı ekler. Seçili bir uç varsa parça o uca bağlı eklenir (mevcut "zincirle ekle"); yoksa görünen alanda boş bir yere. Altındaki "Bütün parçalara göz at (35)" kategorili ızgarayı açar.
9. Kur kipinde bir parçanın boşta ucu varsa kartında "1 uç boşta" rozeti görünür.

## Kablo

- Masaüstü: Parçanın ucundan sürükleyince kablo çekilir; Kablo aracı kalkar (W kısayolu kalabilir). Sürüklerken bırakılabilecek uç vurgulanır ve adıyla etiketlenir ("anot +"). Esc vazgeçer.
- Telefon (DP2): Şemadaki "Kablo bağla" düğmesi tam ekran bağlama görünümünü açar. Uçlar etiketli, en az 44 px'lik hedeflere dönüşür. Birinci dokunuş kaynağı, ikinci dokunuş hedefi seçer; yol kendiliğinden çizilir. Altta "Geri al" ve "Seçimi bırak", üstte "Bitti". Mevcut Bağla kipinin mantığı yeniden kullanılabilir.

## Laboratuvar cihazları (D2, DP3)

- Osiloskop, fonksiyon üreteci ve DC güç kaynağı listedeki kartlardır.
- Açık osiloskop kartı: kart genişliğinde ekran; altında ölçüm satırı (tepe-tepe, etkin, frekans); Kanal A ve Kanal B (V/b adımlayıcı, AC / GND / DC); Zaman (s/b adımlayıcı, kip: A, B / A + B / X-Y). Konum, ters çevirme, tetikleme ve şebeke toprağı "Gelişmiş" altında katlı durur.
- Kapalı üreteç kartı tek satırda ayar özetini gösterir ("Sinüs · 1 kHz · 10 Vpp").
- Telefonda bir karta odaklanınca şema 64 px'lik bir şeride küçülür ("Şema · 8 parça · 1 uyarı · Aç").

## Arduino (D3, DP4)

- Arduino kartı: program seçimi; kullanılan pinlerin canlı değerleri (diğerleri "20 pin ›" altında); seri ekran (koyu zemin, eş genişlikli yazı, en alta kayar, "Temizle"); "Kod" satırı salt okunur kodu açar.
- Çalışırken değiştirilen ayarlar (NTC sıcaklığı, LDR ışığı, potansiyometre konumu) kendi kartında, kart kapalıyken de görünen bir kaydırıcıdır.

## Telefon (DP1–DP4)

- Üst çubuk: logo, devre adı ve altında durum satırı, Geri al, ⋯ menüsü.
- Şema üstte, yaklaşık 270 px. Sağ altında "Kablo bağla" ve tam ekran düğmeleri. Altında defter.
- İki yüzen düğme: sol altta "Parça ekle" (alt sayfada arama ve kategoriler), sağ altta 64 px Oynat / Duraklat.

## 3B (E1, E3)

"Şema | 3B" yalnızca sol alanı değiştirir; defter ve seçim aynı kalır. Düğme tuvalin sol üstündedir. Mevcut 3B sahnesine şunlar eklenir:

1. Etiketler: Her parçanın üstünde kameraya dönük bir etiket; ad · değer, çalışırken canlı ölçüm. Seçili parçanın etiketi mavidir. Sağ üstte "Etiketler" aç / kapa düğmesi. Telefonda yalnızca seçili parçanın ve ölçü aletlerinin etiketi görünür.
2. Seçim: Seçili parçanın altında tahtaya oturan mavi halka. Mevcut seçim halkası varsa o kullanılır.
3. Küçük şema: Sol altta yaklaşık 230 × 150 px; aynı devre, seçili parça vurgulu. Tıklayınca Şema'ya döner. Telefonda yok.
4. Akım noktaları: Çalışırken kabloların üstünde akım yönünde akan noktalar. Sağ üstte "Akım" aç / kapa; şemadaki ayarla aynı ayardır.
5. Kablolar: Parçaların ve etiketlerin üstünü kapatmayacak kadar alçak kavis. Renk kuralı mevcut kuraldır (aynı ağ aynı renk, toprak siyah, besleme kırmızı).
6. Kamera menüsü: Serbest, Üstten, Önden, Seçiliye yaklaş. Açık kartta "3B'de yaklaş" düğmesi.
7. Ölçü aletlerinin değeri etiketlerinde de görünür. Modelleri değişmez.
8. Hareket ipucu tuvalden kalkar, Yardım'a taşınır. Telefonda ilk açılışta tek satır gösterilir.
9. Kutup işaretleri (LED'in uzun bacağı ve düz kenarı, elektrolitik kondansatörün − şeridi, diyot bandı, transistörde E-B-C): Mevcut modelde zaten varsa dokunma. Yoksa mevcut malzeme diliyle ekle. Transistörün E, B, C harfleri yalnızca seçiliyken görünür.

## Baraj sayfası (B1, B2, B3)

Sayfa derste projeksiyonda kullanılır: az metin, tek bakışta anlaşılır. Simülasyon, sahne çizimi ve örnek devreler aynı kalır; değişen sayfanın düzenidir.

1. Varsayılan görünüm yalnızca sahnedir (B1). Devre, üst çubuktaki "Devre" düğmesiyle açılır (B2).
2. Üst çubuk: "← Simülatör", başlık, ortada "Çubuk gösterge | Tek ışık", sağda Devre, Soru, ⋯. Ayarlar, Başa al, Tam ekran ve Simülatörde aç ⋯ menüsüne taşınır.
3. Sahnenin tek cümlesi sol üstteki büyük durum kartıdır: mevcut uyarı metinleri (Uyarı yok / Normal / Dikkat: su yüksek / Tehlike: su taşmak üzere) ve altında son duyuru ("Su Seviye 1'e ulaştı.").
4. Prob numarası ile lamba numarası ve rengi aynıdır. Sahnedeki "Seviye N" yazıları kalkar. Islak prob ucu yeşil halkayla gösterilir.
5. İyonlar ve yüzde ölçeği varsayılan olarak gizlidir; sol alttaki "Göster" çipleriyle açılır. İyon açıklaması yalnızca iyonlar açıkken görünür.
6. Kumanda tek satırdır: solda Boşalt / Durdur / Doldur üçlü düğmesi, ortada seviye kaydırıcısı, sağda yüzde ve "sabit / yükseliyor / iniyor". Kuru, 1, 2, 3 ayrı düğmeler değil, kaydırıcının altındaki duraklardır (%37,5, %62,5, %87,5 eşiklerinde).
7. Durum tablosu kalkar. Yerine "Ne oluyor?" zinciri gelir: her seviye için tek satır, "Prob ıslak → Q1 doyumda → Yeşil yanıyor". Masaüstünde yalnızca devre açıkken sahnenin altında, telefonda her zaman sahnenin altında görünür.
8. Devre paneli (B2) tek katı çizer. Çubuk göstergede üç kat aynı devre olduğu için kat sekmeleri (Kat 1, 2, 3) ve sahnede lambaya tıklamak gösterilen katı seçer. Akım yolu yeşil vurguyla gösterilir; altında baz akımı ve LED akımı yazar. "Tüm devreyi simülatörde aç" bağlantısı tam şemayı açar.
9. "Tek ışık" türü (B4): Devre panelinin üstünde öncelik kuralı tek satırda yazar (Yeşil = 1 VE 2 değil · Sarı = 2 VE 3 değil · Kırmızı = 3). Kat 1'in çiziminde Q4 (Prob 2'den RS4 ile sürülür, kollektörü Q1'in bazında), Kat 2'nin çiziminde Q5 (Prob 3'ten RS5 ile, kollektörü Q2'nin bazında) de vardır; Kat 3 çubuk göstergedeki gibidir. Susturma etkinken "Ne oluyor?" satırında "Q1 kesimde · Q4 susturuyor" yazar (mevcut `silenced` metni), Q1'in baz düğümünde ≈ 0,01 V gösterilir ve susturucunun akım yolu vurgulanır.
10. Telefon (B3): sahne üstte, altında "Ne oluyor?", en altta kaydırıcı ve üçlü düğme. Devre "Devreyi gör" bağlantısıyla tam ekran açılır.

## Önerilen uygulama sırası

1. Defter bileşeni (kapalı ve açık kart), seçim eşlemesi, İncele panelindeki içeriğin kartlara taşınması.
2. Masaüstü kabuğu: yeni üst çubuk; sol kütüphanenin, alt çubukların ve şeritlerin kaldırılması; tuvalin üstündeki kontroller.
3. Uyarı ve örnek kartları; Mesajlar'ın deftere taşınması.
4. Parça ekleme satırı, "Bütün parçalar" ızgarası, zincirle ekleme.
5. Cihaz kartları: mevcut ön panel bileşenleri karta uyarlanır.
6. Arduino kartı.
7. Telefon düzeni ve kablo bağlama ekranı.
8. 3B eklemeleri.
9. Erişilebilirlik: kartlar arasında klavyeyle gezinme, odak sırası, ikon düğmelerinde görünmez etiketler.

## Açık sorular (tahmin etme, sor)

- Telefonda Durdur ve Hız düğmelerinin yeri (çizimlerde yok; öneri: ⋯ menüsü ya da durum satırına dokununca açılan küçük menü).
- Yatay telefon ve tablet düzeni (çizilmedi).
- Çok parçalı devrelerde (20'den fazla) listenin sırası ve gruplanması.