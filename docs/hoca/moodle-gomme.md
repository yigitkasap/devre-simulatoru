# Devre simülatörünü Moodle'a gömme

Bu tarif, simülatördeki bir devreyi Moodle ders sayfasına koymak içindir: öğrenci sayfadan ayrılmadan
devreyi çalıştırır, anahtarı açıp kapar, ölçü aletlerini okur. Simülatör Moodle'a not göndermez.
Not vermek için aynı derse ayrıca bir sınav ya da ödev eklenir.

Köşeli parantezli **[doğrulanmadı]** işaretli adımlar, Moodle'ın Türkçe arayüzünde ya da sizin
üniversitenizin Moodle ayarlarında farklı olabilir. Hepsini bir Moodle'da tek tek denemedik.

## 1. Gömme kodunu al

1. Simülatörü açın: <https://yigitkasap.github.io/devre-simulatoru/>
2. Devreyi kurun ya da **Örnekler**'den birini açın.
3. Devrenin adına tıklayın (telefonda ⋯ → Dosya) → **Paylaş…** → **Sayfaya göm** sekmesi.
4. Ayarları seçin:
   - **Görünüm:** *Sade: yalnız tezgâh* (önerilen; ince bir üst şerit ve devre) ya da *Tam uygulama*
     (simülatörün bütün menüleriyle).
   - **Salt okunur** (varsayılan açık): öğrenci parçaları ve kabloları değiştiremez. Anahtar,
     potansiyometre, LDR, NTC gibi kullanma denetimleri ve ölçü aletlerinin ayarları yine çalışır.
   - **Oynat ve Başa al:** üst şeritteki düğmeler. *Başa al* simülasyonu durdurur ve devreyi ilk hâline
     döndürür (açılmış anahtarlar dahil).
   - **Defter paneli:** parçaların değerleri ve canlı ölçümler. Dar sayfada devrenin altına iner.
   - **Tam ekranda aç bağlantısı:** üst şeritte, devreyi yeni sekmede tam simülatörde açan simge.
   - **Yükseklik:** piksel olarak (320–1200; varsayılan 560).
5. **Kodu kopyala**'ya basın.

Kod şuna benzer:

```html
<iframe src="https://yigitkasap.github.io/devre-simulatoru/embed/?ornek=rc-dolma&salt-okunur=1"
  width="100%" height="560" style="border: 0"
  allow="fullscreen" loading="lazy"
  title="Devre simülatörü: RC dolma"></iframe>
```

Hazır bir örnek değiştirilmeden gömülürse adres kısa olur (`?ornek=rc-dolma`). Kendi devreniz ya da
değiştirdiğiniz bir örnek adresin `#d=…` kısmına sıkıştırılarak yazılır; kod bu yüzden uzar. Bu kısım
tarayıcıda kalır, sunucuya gönderilmez.

Adresteki ayarlar elle de değiştirilebilir:

| Parametre | Anlamı |
| --- | --- |
| `ornek=rc-dolma` | Hazır örneğin adı |
| `salt-okunur=1` | Salt okunur (yoksa öğrenci devreyi değiştirebilir) |
| `gorunum=tam` | Tam uygulama (yoksa sade görünüm) |
| `oynat=0` | Oynat ve Başa al gizli |
| `defter=1` | Defter paneli açık |
| `tam-ekran=0` | "Simülatörde aç" simgesi gizli |

## 2. Moodle'da Sayfa ekle

1. Derse girin, **düzenleme modunu** açın. [doğrulanmadı: Moodle 4'te sağ üstte "Düzenleme modu"
   anahtarı; eski sürümlerde "Düzenlemeyi aç" düğmesi.]
2. İlgili haftada **Etkinlik ya da kaynak ekle** → **Sayfa**. [doğrulanmadı: Türkçe arayüzde
   düğmenin tam adı.]
3. Ad ve isterseniz açıklama yazın.
4. **Sayfa içeriği** alanındaki düzenleyicide HTML / kaynak kodu görünümüne geçin:
   - TinyMCE (Moodle 4.3 ve sonrası öntanımlı): **Araçlar → Kaynak kodu**. [doğrulanmadı: menünün
     Türkçe adı; Moodle'ın İngilizce belgesinde "Tools → View source code".]
   - Atto (eski düzenleyici): araç çubuğunu genişletip **HTML** düğmesi. [doğrulanmadı]
5. Kopyaladığınız kodu yapıştırın; isterseniz üstüne yönerge yazın (ör. "Anahtar kapandıktan 100 ms
   sonra C1'in gerilimini önce tahmin et, sonra Oynat'a basıp voltmetreden oku.").
6. **Kaydet ve göster**.

Moodle'ın Sayfa kaynağı içeriği gösterirken HTML temizliği yapmaz (Moodle 4.4 kaynak kodu,
`mod/page/view.php`: `noclean = true`); iframe bu yüzden Sayfa'da korunur. Moodle'ın genel HTML
temizleyicisi ise iframe'e izin vermez: aynı kodu forum iletisine, sınav sorusunun metnine ya da
etiket (metin ve medya alanı) gibi temizlenen yerlere koyarsanız iframe silinebilir. [doğrulanmadı:
hangi alanların temizlendiği sitenin "güvenilir içerik" ayarına ve rolünüzün izinlerine bağlıdır.]
Bu yüzden simülatörü **Sayfa** kaynağına koymanızı öneririz.

## 3. Görünmezse

- Sayfada boş bir kutu ya da hiçbir şey görünmüyorsa: kodun düzenleyicide HTML / kaynak kodu
  görünümünde yapıştırıldığından emin olun (normal görünümde yapıştırılırsa yazı olarak kalır).
- Kod kaydedildikten sonra kaybolduysa sitenin düzenleyici ya da içerik ayarları iframe'i siliyor
  olabilir: site yöneticisinden `yigitkasap.github.io` için iframe izni isteyin.
  [doğrulanmadı: üniversiteden üniversiteye değişir.]
- Simülatörün sitesi (GitHub Pages) çerçeve içinde gösterilmeyi engelleyen bir başlık göndermez
  (2026-10-30'da denetlendi: `X-Frame-Options` ve `Content-Security-Policy` yok).
- Adres eksik kopyalanırsa gömülü görünüm "Gömülü devre bulunamadı" der; kodu yeniden kopyalayın.

## 4. Not vermek

Simülatör not vermez ve Moodle'a hiçbir bilgi göndermez. Not için aynı derse bir **Sınav** ya da
**Ödev** ekleyin. [doğrulanmadı: Türkçe arayüzde etkinliklerin adı.]

- Sınav: öğrenci devreden okuduğu değeri (ör. 100 ms'deki gerilim) sayısal yanıt olarak girer.
- Ödev: öğrenci simülatörün **Görev** kartındaki **Teslim dosyası (.json)**'nı yükler. Görev, Dosya →
  **Görev oluştur** ile hazırlanır; hedefler bağlantının içinde olduğu için öğrenci görebilir.
  Görev alıştırma ve ön hazırlık içindir, notlu sınav için değildir.

## Gizlilik

- Simülatör öğrenci verisi toplamaz: hesap, giriş, çerez, ölçüm ya da reklam yoktur. Devreler yalnızca
  öğrencinin tarayıcısında kalır.
- Gömülü görünüm hiçbir şey kaydetmez: öğrencinin yaptığı değişiklikler sayfa yenilenince gider ve
  öğrencinin simülatörde kendi kaydettiği devreye dokunulmaz.
- Barındırma hizmeti GitHub Pages, siteyi ziyaret eden herkesin IP adresini güvenlik amacıyla kaydeder
  ve saklar (GitHub'ın belgesi: "What is GitHub Pages?", *Data collection*;
  <https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages>).
