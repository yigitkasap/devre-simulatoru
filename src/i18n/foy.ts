// Föyün (Fizik 2. sınıf Elektronik Laboratuvarı, Deney 1–9) deney kartlarındaki metinler.
//
// Yazım notları:
//   - Deney adları, şekil numaraları, formüller ve adım numaraları föydeki gibidir. Föydeki
//     soruların metni föyden kısa alıntıdır (yazım hataları düzeltildi); amaç, teorik bilgi, adım
//     açıklamaları ve cevaplar föyün anlamını ve sayılarını koruyarak yeniden yazıldı.
//   - Cevaplardaki sayılar simülasyonda ölçüldü ve tests/foy-deney.test.ts'te sınanır.
//   - Formüllerdeki alt simgeler `_{...}` ile işaretlenir (bkz. tr.ts).

import { labExperiment, type ExampleGroupId, type ExampleId, type LabExperimentNo } from '../examples';

/** Teorik bilginin bir parçası: paragraf ya da (föydeki denklem numarasıyla) formül. */
export type LabTheory = { readonly text: string } | { readonly formula: string; readonly eq?: number };

/** Deneyde kullanılan transistörün bacak bağlantısı (föydeki şekil). */
export interface LabPinout {
  readonly part: string;
  readonly figure: string;
  /** 1., 2. ve 3. bacağın uç adı. */
  readonly legs: readonly [string, string, string];
  /** Bacakların nasıl sayılacağı. */
  readonly note: string;
}

/** Deney bilgisi: deneyin bütün kartlarında aynı. */
export interface LabExperiment {
  /** Föydeki adı (cümle düzeninde). */
  readonly title: string;
  /** Amaç: tek satır; klasörde grup başlığının altında da çıkar. */
  readonly aim: string;
  readonly theory: readonly LabTheory[];
  readonly pinout?: LabPinout;
}

/** Föydeki bir adım: numarası (föydeki gibi; numarasız adımda ''), ne yapılacağı ve simülasyonda nasıl yapılacağı. */
export interface LabStep {
  readonly no: string;
  readonly text: string;
  readonly sim: string;
}

/** Föydeki bir soru (adım numarasıyla), föyden kısa alıntı ve simülasyonda ölçülen sayılarla cevabı. */
export interface LabQuestion {
  readonly step: string;
  readonly question: string;
  readonly answer: string;
  /** Cevabın altında açılacak başka bir örnek (ör. sorunun çözümü olan ek devre). */
  readonly link?: ExampleId;
}

/** Föydeki bir şeklin kartı: hangi deneyin hangi şekli, o şekle ait adımlar ve sorular. */
export interface LabFigure {
  readonly experiment: LabExperimentNo;
  readonly figure: string;
  readonly steps: readonly LabStep[];
  readonly questions: readonly LabQuestion[];
}

export const LAB_EXPERIMENT_TEXTS: Partial<Record<LabExperimentNo, LabExperiment>> = {
  1: {
    title: 'Diyot karakteristiklerinin incelenmesi',
    aim: 'Diyotların akım-gerilim karakteristiklerini incelemek.',
    theory: [
      {
        text: 'Diyot akımı tek yönde geçirir. Anot katottan pozitifken (ileri besleme) akım kolayca geçer; tersinde (ters besleme) yalnızca çok küçük bir sızıntı akımı geçer. Föydeki Şekil-1’deki akım-gerilim eğrisi bu iki bölgeden oluşur; ileri yönde akım gerilimle üstel olarak artar:',
      },
      { formula: 'I = I_{S} · [exp(V_{D} / (n · V_{T})) − 1]' },
      {
        text: 'Burada I_{S} ters doyma akımı, n ideallik çarpanı (1–2), V_{T} = kT / q ≈ 26 mV ısıl gerilimdir. Akımın belirgin biçimde artmaya başladığı gerilime eşik gerilimi (V_{eşik}) denir: silisyumda ≈ 0,5–0,7 V, germanyumda ≈ 0,2–0,3 V. Şekil-2 ve Şekil-3’te 1 kΩ’luk direncin gerilimi akımla orantılıdır, bu yüzden akım bir gerilim olarak ölçülür:',
      },
      { formula: 'I = V_{R} / R' },
      {
        text: 'Zener diyot ters yönde belirli bir gerilimde (V_{Z}) iletime geçer ve bu gerilimi akım değişse de neredeyse sabit tutar. LED de bir diyottur; ileri yönde iletirken ışık yayar ve eşiği silisyum diyodunkinden büyüktür.',
      },
    ],
  },
  2: {
    title: 'Doğrultucular',
    aim: 'Diyotla yarım dalga ve tam dalga doğrultmaç kurup çalışmalarını incelemek.',
    theory: [
      {
        text: 'Doğrultmaç alternatif akımı (AC) tek yönlü akıma (DC) çevirir. Yarım dalga doğrultmaçta (Şekil-4) diyot yalnızca girişin pozitif yarısında iletir: çıkış pozitif yarılardan oluşur, negatif yarılarda sıfırdır. V_{T} girişin tepe değeri olmak üzere ideal diyotta çıkışın ortalaması (DC değeri):',
      },
      { formula: 'V_{DC} = V_{T} / π  (yarım dalga)' },
      {
        text: 'Köprü tipi tam dalga doğrultmaçta (Şekil-5) dört diyot girişin iki yarısını da aynı yöne çevirir: her yarıda karşılıklı iki diyot iletir ve akım yükten hep aynı yönde geçer. Çıkış girişin iki katı frekansta tekrarlar, ortalaması da iki katına çıkar:',
      },
      { formula: 'V_{DC} = 2V_{T} / π  (tam dalga)' },
      {
        text: 'Gerçek diyotta her iletim yolunda bir diyot gerilimi (V_{D} ≈ 0,3–0,7 V, akıma göre) kaybolur: çıkışın tepesi yarım dalgada ≈ V_{T} − V_{D}, köprüde ≈ V_{T} − 2V_{D}. Yüke paralel bağlanan kondansatör tepelerde dolar, aralarda yükü besler; çıkış dalgalanan bir DC olur. f çıkıştaki tepelerin frekansı olmak üzere dalgalanma (tepe-tepe) yaklaşık:',
      },
      { formula: 'ΔV ≈ V_{DC} / (f · R_{L} · C)' },
    ],
  },
  3: {
    title: 'Kenetleyici ve gerilim katlayıcılar',
    aim: 'Kenetleyici ve gerilim katlayıcı devreler kurup özelliklerini incelemek.',
    theory: [
      {
        text: 'Kenetleyici (Şekil-6) bir kondansatör, bir diyot ve bir dirençten oluşur; çıkış diyodun uçlarından alınır. Girişe V_{1} ile −V_{2} arasında değişen bir kare dalga uygulansın. Giriş V_{1}’deyken diyot iletir, çıkış ≈ 0 olur ve kondansatör diyodun küçük direnci üzerinden çok çabuk V_{1}’e dolar (τ = R_{d} · C ≈ 0). Giriş −V_{2}’ye inince diyot kesime gider; kondansatör artık yalnızca R üzerinden boşalabilir (τ = R · C) ve gerilimini korur. Çıkış:',
      },
      { formula: 'V_{ç} = V_{g} − V_{C},  V_{C} ≈ V_{1}  →  V_{ç}: 0 ile −(V_{1} + V_{2}) arası' },
      {
        text: 'R · C, dalganın yarım periyodundan çok büyükse kondansatör pek boşalmaz ve çıkış negatif bölgeye “kenetlenir” (Şekil-7b): dalganın biçimi ve tepe-tepe değeri değişmez, yalnızca DC seviyesi kayar. Diyot ters bağlanırsa dalga pozitif bölgeye kenetlenir (pozitif kenetleyici).',
      },
      {
        text: 'Gerilim katlayıcıda (Şekil-8) girişin pozitif yarısında D1 iletir ve C1 girişin tepe değerine (V_{T}) dolar; negatif yarısında D2 iletir ve C2 de V_{T}’ye dolar. D1 kesimde olduğu için C1 bu sırada boşalamaz; iki kondansatörün gerilimi seri toplanır:',
      },
      { formula: 'V_{ç} = V_{C1} + V_{C2} = 2V_{T}' },
      { text: 'Çıkıştan akım çekilirse kondansatörler aralarda boşalır: gerilim 2V_{T}’yi koruyamaz ve DC’nin üstüne bir AC bileşen (dalgalanma) biner.' },
    ],
  },
  4: {
    title: 'Kırpıcı devreler',
    aim: 'Kırpıcı devrelerin özelliklerini incelemek.',
    theory: [
      {
        text: 'Kırpıcı, girişin belirli bir seviyenin üstündeki ya da altındaki kısmını keser. Kesme seviyesi diyodun yönüne, devredeki DC kaynağın gerilimine ve devrenin biçimine bağlıdır. Şekil-11’de diyoda seri bir V_{G} kaynağı var; girişe tepe değeri V_{T} olan bir sinüs uygulansın (Şekil-12a). İdeal diyot yalnızca υ_{g} > V_{G} iken iletir:',
      },
      { formula: 'υ_{ç} = υ_{g} − V_{G}  (υ_{g} > V_{G}),   υ_{ç} = 0  (υ_{g} < V_{G})' },
      {
        text: 'Çıkış, girişin V_{G}’nin üstünde kalan kısmıdır; tepesi V_{T} − V_{G} (Şekil-12b; föyde çıkış υ_{ç} = υ_{T} − υ_{G} olarak yazılmış, bu çıkışın tepe değeridir). Kare dalga da aynı biçimde kırpılır (Şekil-12c, d).',
      },
      {
        text: 'Şekil-13b–d’de diyot çıkışa paralel, sinyal 10 kΩ üzerinden gelir. Diyot iletince çıkışı bağlı kaynağın gerilimine (bir diyot gerilimi farkla) tutar ve çıkış o seviyeyi aşamaz; fazla gerilim 10 kΩ’un üzerine düşer. Gerçek diyotta kesme seviyesi V_{D} ≈ 0,5 V kadar kayar:',
      },
      { formula: 'V_{kesme} ≈ V_{kaynak} ± V_{D}' },
    ],
  },
  5: {
    title: 'FET karakteristiklerinin incelenmesi',
    aim: 'Eklem FET’i (JFET) tanımak, karakteristik eğrilerini çizip özelliklerini incelemek.',
    theory: [
      {
        text: 'Eklem FET’te (JFET) drain ile source arasındaki yarı iletken kanaldan geçen I_{D} akımını hem V_{DS} hem de kapı ile source arasındaki ters gerilim V_{GS} denetler: V_{GS} eksildikçe kanal daralır. Şekil-14’te n kanallı JFET’in I_{D}–V_{DS} eğrileri var. V_{DS} küçükken kanal bir direnç gibidir ve I_{D} V_{DS} ile artar. V_{DS} belirli bir değeri aşınca (doyum bölgesi) kanal kısılır ve I_{D} artık neredeyse yalnızca V_{GS}’ye bağlıdır:',
      },
      { formula: 'i_{d} = I_{DSS} · (1 − υ_{GS} / V_{P})²,   V_{DS} ≥ V_{GS} − V_{P}' },
      {
        text: 'I_{DSS}, V_{GS} = 0’daki doyum akımıdır; V_{P} kısılma gerilimidir (n kanalda eksi). V_{GS}, V_{P}’den daha eksi olunca kanal tamamen kapanır ve I_{D} = 0. Gerçek JFET’te doyum bölgesinde de akım V_{DS} ile hafifçe artar (kanal boyu modülasyonu, i_{d}’nin (1 + λ · V_{DS}) ile çarpılması). Kapı-kanal eklemi ters kutuplu olduğundan kapıdan akım geçmez (I_{G} ≈ 0), bu yüzden R_{G} üzerinde gerilim düşmez.',
      },
    ],
    pinout: {
      part: 'BF245A',
      figure: 'Şekil-16',
      legs: ['Kapı (G)', 'Source (S)', 'Drain (D)'],
      note: 'Föydeki numaralama Philips’in BF245A kataloğundakinden farklı: katalogda 1 drain, 2 source, 3 kapı. İkisinde de ortadaki bacak source’tur; BF245A simetrik olduğu için drain ile source yer değiştirse de çalışır, önemli olan kapıyı doğru bulmaktır. Takmadan önce elindeki parçanın kataloğuna bak. Katalog sınırları: V_{DS} en çok ±30 V, P_{tot} 300 mW.',
    },
  },
};

export const LAB_FIGURE_TEXTS: Partial<Record<ExampleId, LabFigure>> = {
  'diyot-dc': {
    experiment: 1,
    figure: 'Şekil-2',
    steps: [
      {
        no: '1',
        text: 'Şekil-2’deki devreyi kur. V_{i}’yi 0–1 V arasında 0,1 V, 1–5 V arasında 1 V adımlarla artır; her adımda devreden geçen akımı ve V_{o}’yu oku. Verilerden I-V eğrisini çiz ve diyodun hangi yarı iletkenden yapıldığını belirle.',
        sim: 'Devre kurulu: V_{i} güç kaynağının (PS1) 1. çıkışı, A1 akımı, V1 1 kΩ’un uçlarındaki V_{o}’yu gösteriyor. Oynat’a bas; cihaz rafında PS1’in 1. çıkış gerilimini adım adım değiştir ve her adımda A1 ile V1’i oku. Diyodun gerilimi V_{D} = V_{i} − V_{o}.',
      },
    ],
    questions: [
      {
        step: '1',
        question: 'Elde ettiğiniz verilerden akım-gerilim karakteristik eğrisini (I-V) grafik kağıdına çiziniz ve diyotun hangi yarıiletkenden yapıldığını belirleyiniz.',
        answer:
          'Simülasyonda ölçülen tablo (V_{i} → I, V_{D}): 0,2 V → 4 µA, 0,20 V; 0,5 V → 0,13 mA, 0,37 V; 1 V → 0,55 mA, 0,45 V; 2 V → 1,50 mA, 0,50 V; 5 V → 4,44 mA, 0,56 V. Akım V_{D} ≈ 0,3–0,4 V’a kadar yok denecek kadar küçüktür; sonra hızla artar ve V_{D} 0,5–0,6 V civarında kalır. Bu eşik silisyuma özgüdür (germanyumda ≈ 0,2–0,3 V olurdu): 1N4001 silisyum diyottur. Kaynağı ters bağlarsan (diyodu ters çevir) 5 V’ta akım 1 µA’in altında kalır.',
      },
    ],
  },
  'diyot-karakteristigi': {
    experiment: 1,
    figure: 'Şekil-3',
    steps: [
      {
        no: '2a',
        text: 'Şekil-3’teki devrede girişe 5 V genlikli sinüs uygula. Osiloskobu X-Y kipine al: 1. kanal (X) giriş sinyalini, 2. kanal (Y) direncin üzerindeki gerilimi göstersin. Ekranda akım-gerilim eğrisini elde et ve 1. adımdaki sonuçlarla karşılaştır.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik). Osiloskop X-Y kipinde; 1. kanal A (X, 1 V/bölme) girişte, 2. kanal B (Y, 1 V/bölme) 1 kΩ’un üst ucunda, COM alt hatta. Oynat’a bas.',
      },
      {
        no: '2b',
        text: 'Giriş sinyalinin frekansını 1 kHz ile 1 MHz arasında değiştir; diyodun eşik geriliminde ve I-V eğrisinde değişiklik olup olmadığına bak. Değişiklik varsa nedenini açıkla.',
        sim: 'Cihaz rafında FG1’in frekansını sırayla 10 kHz, 100 kHz ve 1 MHz yap; X-Y ekranında sol (ters) kolun aşağı inmesine ve eğrinin ilmek açmasına bak.',
      },
      {
        no: '2c',
        text: 'Osiloskobun düşey ekseninin (2. kanal) devreden geçen akımı nasıl gösterdiğini düşün.',
        sim: 'B’nin volt/bölmesi 1 V: 1 kΩ’da 1 V, 1 mA demektir; ekranda düşeyde bir bölme 1 mA.',
      },
    ],
    questions: [
      {
        step: '2a',
        question: 'İlk kısımda elde ettiğiniz sonuçlarla osiloskopta gözlenen eğriyi karşılaştırınız.',
        answer:
          'X-Y’de yatay eksen diyodun değil girişin gerilimini gösterir: V_{i} = V_{D} + V_{R}. Bu yüzden eğri tablodakinden farklı görünür: akım girişin ≈ 0,5 V’undan sonra başlar, sonra neredeyse doğru olarak yükselir (eğimi 1 kΩ’un belirlediği 1 mA/V). Akım 1 mA’e V_{i} ≈ 1,5 V’ta ulaşır; o anda diyotta ≈ 0,47 V vardır, tablodaki değerlerle aynı (1 V’ta 0,55 mA’de 0,45 V, 2 V’ta 1,50 mA’de 0,50 V). En büyük akım ≈ 4,23 mA; tablodaki 5 V’ta ölçülen 4,44 mA’den biraz küçük, çünkü üretecin 50 Ω’luk çıkış direnci de seridir: (5 V − 0,56 V) / 1050 Ω ≈ 4,23 mA. Diyodun kendi eğrisi için her noktada V_{D} = V_{A} − V_{B} hesaplanır.',
      },
      {
        step: '2b',
        question: 'Giriş sinyalinin frekansını 1 kHz ile 1 MHz arasında değiştirerek diyotun V_{eşik} geriliminde ve I-V eğrisinde değişiklik olup olmadığını kontrol ediniz. Değişiklikler varsa nedenini açıklayınız.',
        answer:
          '1 kHz’te eğri tek bir çizgidir; ters yönde en çok ≈ −0,07 mA geçer. Frekans artınca sol (ters) kol aşağı iner ve eğri ilmek açar: ters tepe akımı 10 kHz’te ≈ −1,4 mA, 100 kHz’te ≈ −4,9 mA, 1 MHz’te ≈ −5,1 mA; ileri tepe 4,2–4,4 mA arasında kalır. Akımın 1 mA’i geçtiği giriş gerilimi de küçülür (1 kHz’te ≈ 1,48 V, 1 MHz’te ≈ 1,19 V): eşik düşmüş gibi görünür. Nedeni diyodun yük depolamasıdır: ileri yönde iletirken eklemde azınlık taşıyıcı yükü birikir (1N4001’in modelinde geçiş süresi ≈ 5,8 µs). Giriş ters dönünce bu yük boşalana kadar diyot ters yönde de iletir (ters toparlanma). Periyot bu süreyle karşılaştırılabilir olunca (100 kHz’te 10 µs) diyot kesime gidemez. 1N4001 şebeke frekansı için yapılmış yavaş bir diyottur; yüksek frekansta hızlı ya da Schottky diyot kullanılır.',
      },
      {
        step: '2c',
        question: 'Osiloskobun düşey ekseninin (2. kanal) devreden geçen akımı nasıl gösterdiğini düşününüz.',
        answer:
          'Osiloskop yalnızca gerilim ölçer. 2. kanal (B) 1 kΩ’luk direncin üst ucuna, COM alt ucuna bağlı; ekrandaki gerilim V_{R} = I · R. R = 1 kΩ olduğundan 1 V, 1 mA demektir: 1 V/bölmede düşeyde her bölme 1 mA. En büyük akım ≈ 4,23 mA, yani B’nin tepesi ≈ 4,2 bölme. Akım ekseni direncin değerine bağlıdır: 1 kΩ değişirse bölmenin akım karşılığı da değişir.',
      },
    ],
  },
  'zener-karakteristigi': {
    experiment: 1,
    figure: 'Şekil-3',
    steps: [
      {
        no: '3',
        text: 'Diyodun yerine zener diyot ve LED tak; akım-gerilim eğrilerini elde et. Eğrileri osiloskobun normal (Y-t) ve X-Y kipinde inceleyerek zener olayını gözle.',
        sim: 'Devre kurulu: diyodun yerinde 5,6 V’luk zener (föy değerini vermiyor; laboratuvardakinin değeri farklıysa Z1’in zener gerilimini değiştir). FG1 20 V tepe-tepe: föydeki 5 V genlik bu zeneri kırmaya yetmez (nedeni soruda). Osiloskop X-Y kipinde, A ve B 2 V/bölme; normal kip için kipi “A ve B (Y-t)” yap.',
      },
    ],
    questions: [
      {
        step: '3',
        question: 'Diyotu, Zener diyot ve Işıklı diyot (LED) ile değiştirerek bunların akım-gerilim eğrilerini elde ediniz. Aynı eğrileri osiloskobun normal ve xy modunda inceleyerek zener olayını gözleyiniz.',
        answer:
          'Föydeki 5 V genlik bu zeneri kırmaya yetmez: kırılma için ters yönde 5,6 V gerekir, üreteç ise en çok 5 V verir. Simülasyonda ters yönde en çok ≈ 4,87 V düşer ve yalnızca ≈ 0,12 mA geçer; X-Y’de sol kol neredeyse yatay kalır, sıradan bir diyottan farkı görülmez. Bu yüzden bu örnekte üreteç 20 V tepe-tepe (10 V genlik): ters yönde gerilim ≈ −5,37 V’ta sabitlenir ve ≈ 4,41 mA geçer; X-Y’de solda dik inen kol zener olayıdır. İleri yönde zener sıradan bir diyot gibidir: ≈ 0,68 V’ta ≈ 8,9 mA. Normal (Y-t) kipte B kanalı (1 kΩ’un gerilimi, yani akım) pozitif yarıda ≈ 8,9 V’a, negatif yarıda yalnızca ≈ −4,4 V’a ulaşır: negatif yarının fazlası zenerin üstünde kalır.',
      },
    ],
  },
  'led-karakteristigi': {
    experiment: 1,
    figure: 'Şekil-3',
    steps: [
      {
        no: '3',
        text: 'Diyodun yerine zener diyot ve LED tak; akım-gerilim eğrilerini elde et. Eğrileri osiloskobun normal (Y-t) ve X-Y kipinde inceleyerek zener olayını gözle.',
        sim: 'Devre kurulu: diyodun yerinde kırmızı LED, FG1 10 V tepe-tepe (5 V genlik). Osiloskop X-Y kipinde, A ve B 1 V/bölme. LED1’in rengini yeşil ya da mavi yapıp eşiği karşılaştır.',
      },
    ],
    questions: [
      {
        step: '3',
        question: 'Diyotu, Zener diyot ve Işıklı diyot (LED) ile değiştirerek bunların akım-gerilim eğrilerini elde ediniz. Aynı eğrileri osiloskobun normal ve xy modunda inceleyerek zener olayını gözleyiniz.',
        answer:
          'LED’in eğrisi diyodunkiyle aynı biçimdedir ama eşiği daha büyüktür: akım 0,1 mA’i ≈ 1,45 V’ta, 1 mA’i ≈ 1,61 V’ta geçer (1N4001’de 1 mA ≈ 0,47 V’ta). X-Y’de akım girişin ≈ 1,6 V’undan sonra başlar; en büyük akım ≈ 3,15 mA, o anda LED’in gerilimi ≈ 1,69 V. Ters yönde 5 V’ta akım geçmez: LED’de zener olayı görülmez (gerçek LED’lere ≈ 5 V’tan büyük ters gerilim uygulanmaz). Eşiğin büyük olmasının nedeni LED’in yarı iletkeninin yasak enerji aralığının silisyumunkinden büyük olmasıdır; aralığı geçen elektron bir foton yayar.',
      },
    ],
  },
  'yarim-dalga': {
    experiment: 2,
    figure: 'Şekil-4a',
    steps: [
      {
        no: '1',
        text: 'Diyotu (1N4001) ve R_{L} = 1 kΩ’u kullanarak Şekil-4a’daki yarım dalga doğrultmacı kur ve girişe 3 V genlikli sinüs uygula. Girişi ve çıkışı osiloskopta birlikte izlerken frekansı 1 kHz’ten 1 MHz’e yavaşça artır; değişimleri ve nedenlerini belirle. Aynısını 5 V genlik için yap.',
        sim: 'Devre kurulu: FG1 1 kHz, 6 V tepe-tepe (3 V genlik); S4 kapalı (R_{L} bağlı), S1–S3 açık. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta, ikisi de 1 V/bölme. Oynat’a bas; cihaz rafında FG1’in frekansını 10 kHz, 100 kHz ve 1 MHz yap, her seferinde Oto’ya bas. 5 V genlik için tepe-tepe değeri 10 V yap.',
      },
      {
        no: '2',
        text: 'Çıkışa, R_{L}’ye paralel olarak 1 µF, 22 µF ve 470 µF’lık elektrolitik kondansatörleri sırayla bağla; girişi ve çıkışı birlikte izle. R_{L} olmadan (R_{L} = ∞) ne olduğuna bak ve sonuçları yorumla.',
        sim: 'S1, S2 ve S3 sırasıyla 1 µF, 22 µF ve 470 µF’ı R_{L}’ye paralel bağlar: birini kapat, öbürlerini açık bırak. R_{L} = ∞ için S4’ü aç. 470 µF’ın dolması birkaç saniye sürer; dalgalanmayı görmek için B’yi AC kuplaja ve 10 mV/bölmeye al.',
      },
    ],
    questions: [
      {
        step: '1',
        question: 'Giriş ve çıkış dalga şekillerini osiloskopta aynı anda gözleyip frekansı 1 kHz’ten 1 MHz’e kadar yavaşça artırarak oluşan değişimleri belirleyiniz ve nedenlerini belirtiniz. Aynı işlemi 5V’luk giriş gerilimi için tekrarlayınız.',
        answer:
          '3 V genlikte, 1 kHz’te çıkış yalnızca pozitif yarılardan oluşur: tepe ≈ 2,36 V (girişin 3 V’undan diyotta ve üretecin 50 Ω’unda ≈ 0,64 V düşer), negatif yarılarda ≈ 0 V; ortalaması ≈ 0,69 V (ideal formül V_{T} / π tepeden ≈ 0,75 V verir; fark, diyodun eşiği aşılana kadar akım geçmemesinden). Frekans artınca her negatif yarının başında çıkış eksiye iner: 10 kHz’te ≈ −0,79 V, 100 kHz’te ≈ −2,91 V, 1 MHz’te ≈ −3,11 V. Ortalama 100 kHz’te ≈ 0,34 V’a, 1 MHz’te ≈ 0,05 V’a düşer: 1 MHz’te diyot artık doğrultmaz, giriş iki yönde de geçer. Nedeni Deney 1’deki ters toparlanmadır: iletimde biriken yük boşalana kadar (1N4001’in modelinde ≈ 5,8 µs) diyot ters yönde de iletir; yarım periyot bu süreye yaklaşınca (100 kHz’te 5 µs) negatif yarının çoğu geçer. 5 V genlikte de aynı: 1 kHz’te tepe ≈ 4,23 V, ortalama ≈ 1,28 V; ters tepe 10 kHz’te ≈ −1,41 V, 100 kHz’te ≈ −4,88 V, 1 MHz’te ≈ −5,07 V; 1 MHz’te ortalama ≈ 0,10 V.',
      },
      {
        step: '2',
        question: 'R_{L} direnci olmadan (R_{L} = ∞) ne olduğunu inceleyiniz. Sonuçları yorumlayınız.',
        answer:
          'Kondansatör tepelerde dolar, aralarda yükü besler; çıkış dalgalanan bir DC olur (1 kHz, 3 V genlik, R_{L} = 1 kΩ). Kondansatörsüz çıkışın ortalaması ≈ 0,69 V. 1 µF’ta çıkış 1,03–2,20 V arasında dalgalanır: R_{L} · C = 1 ms periyotla aynı, kondansatör aralarda epey boşalır. 22 µF’ta 1,75–1,81 V (dalgalanma ≈ 0,06 V; ΔV ≈ V_{DC} / (f · R_{L} · C) ≈ 0,08 V), 470 µF’ta ≈ 1,78 V’ta, dalgalanma ≈ 3 mV. Ortalama tepeden (2,36 V) küçüktür, çünkü kondansatör yalnızca tepelerin çevresinde kısa ve büyük akım darbeleriyle dolar ve bu darbeler diyotta ve üretecin 50 Ω’unda daha çok gerilim düşürür. R_{L} = ∞’da (S4 açık) kondansatörü boşaltacak yük yoktur: çıkış ≈ 2,6–2,7 V’ta neredeyse düz kalır, dalgalanma kaybolur ve akım çok küçük olduğundan çıkış tepeye daha yakındır. Yorum: kondansatör büyüdükçe ve yük akımı küçüldükçe çıkış düzgünleşir ve tepeye yaklaşır; güç kaynaklarında filtre kondansatörü bu yüzden büyük seçilir.',
      },
    ],
  },
  'kopru-dogrultmac': {
    experiment: 2,
    figure: 'Şekil-5a',
    steps: [
      {
        no: '3',
        text: 'Şekil-5a’daki köprü tipi tam dalga doğrultmacı 1N4001’lerle ve R_{L} = 100 kΩ ile kur. Girişe 5 V genlikli sinüs uygula; girişi ve çıkışı osiloskopta birlikte izleyip değerlendir.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik), diyotlar föydeki numaralarla (D1–D4). Yükün iki ucu da topraktan farklı gerilimde: A yükün + ucunda, B − ucunda, COM üretecin COM’unda. Kip “A + B (ADD)”, B ters (INV): ekranda A − B, yani çıkış. Kipi “A ve B (Y-t)” yaparsan A ile B’yi ayrı ayrı görürsün.',
      },
    ],
    questions: [
      {
        step: '3',
        question: 'Girişe 5V genlikte sinüs sinyali uygulayınız. Giriş ve çıkışı osiloskopta aynı anda gözleyip değerlendiriniz.',
        answer:
          'Giriş ±5 V salınır; çıkış iki yarıda da pozitiftir. Pozitif yarıda D1 ile D3, negatif yarıda D2 ile D4 iletir; akım R_{L}’den hep aynı yönde geçer. Çıkışın tepesi ≈ 4,36 V: her yarıda iki diyot iletir ve 100 kΩ’da akım ≈ 44 µA kadar küçük olduğundan her biri ≈ 0,32 V düşürür. Çıkış her yarım periyotta tekrarlar: frekansı 2 kHz, girişinkinin iki katı. Ortalaması ≈ 2,63 V (ideal formül 2V_{T} / π tepeden ≈ 2,77 V verir; sıfır geçişlerinde giriş iki diyodun eşiğini aşana kadar çıkış 0’da kalır). Yükün iki ucu da topraktan farklı gerilimde olduğu için osiloskobun COM’u yükün bir ucuna bağlanamaz (COM şebeke toprağında); yük iki kanalla ölçülür. Y-t’de A (yükün + ucu) pozitif yarıda ≈ 4,68 V’a çıkar, B (− ucu) negatif yarıda ≈ −4,68 V’a iner; her biri öbür yarıda bir diyot gerilimi kadar sıfırdan ayrılır.',
      },
    ],
  },
  'negatif-kenetleyici': {
    experiment: 3,
    figure: 'Şekil-9a',
    steps: [
      {
        no: '1',
        text: 'Şekil-9’daki devreleri kur; girişlerine 1 kHz’lik önce sinüs, sonra kare dalga uygula. Giriş ve çıkış sinyallerini osiloskopta birlikte izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe sinüs; C = 2,2 µF, 1N4001’in anodu çıkışta, R = 10 kΩ. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta, ikisi de DC kuplaj, 5 V/bölme; zaman/bölme 0,5 ms. Oynat’a bas; kare dalga için cihaz rafında FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '1',
        question: 'Girişlerine 1KHz frekanslı önce sinüs daha sonra kare dalga uygulayınız. Giriş ve çıkış sinyallerini osiloskopta aynı anda gözleyerek ölçekli olarak çiziniz.',
        answer:
          'Sinüste (10 V tepe-tepe) giriş ±5 V salınırken çıkış ≈ +0,57 V ile ≈ −9,11 V arasında salınır: biçim ve tepe-tepe değer (≈ 9,7 V) aynı, dalga yalnızca aşağı kaymıştır (ortalaması ≈ −4,16 V). Pozitif tepede diyot iletir ve kondansatör girişin tepesine yakın bir gerilime dolar; bu gerilim girişe seri bir pil gibi bütün dalgayı aşağı taşır. Üst seviye 0 değil ≈ +0,57 V’tur: diyodun iletim gerilimi. Oynat’a bastıktan sonra kenetleme birkaç periyotta oturur (ilk periyotta alt tepe ≈ −8,49 V). Kare dalgada (±5 V) çıkış ≈ +0,52 V ile ≈ −9,52 V arasında bir kare dalgadır: föydeki Şekil-7b’deki gibi 0 ile −(V_{1} + V_{2}) = −10 V arası, diyot gerilimi kadar yukarıda. Alt seviyede kondansatör 10 kΩ üzerinden biraz boşalır: yarım periyotta ≈ 0,2 V yükselir. R · C = 22 ms, yarım periyottan (0,5 ms) çok büyük olduğu için bu eğim küçüktür. 5 V/bölmede çıkış sıfırın hemen üstünden yaklaşık iki bölme aşağıya uzanır.',
      },
    ],
  },
  'pozitif-kenetleyici': {
    experiment: 3,
    figure: 'Şekil-9b',
    steps: [
      {
        no: '1',
        text: 'Şekil-9’daki devreleri kur; girişlerine 1 kHz’lik önce sinüs, sonra kare dalga uygula. Giriş ve çıkış sinyallerini osiloskopta birlikte izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: negatif kenetleyicinin aynısı, 1N4001’in katodu çıkışta. Kutup notu: föydeki Şekil-9b’de kondansatörün + işareti giriş tarafında çizilmiş; bu devrede kondansatör çıkış tarafı + olacak şekilde dolar, bu yüzden elektrolitiğin + ucu çıkış tarafında (simülasyondaki yön doğru). Osiloskop A girişte, B çıkışta, 5 V/bölme; kare dalga için FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '1',
        question: 'Girişlerine 1KHz frekanslı önce sinüs daha sonra kare dalga uygulayınız. Giriş ve çıkış sinyallerini osiloskopta aynı anda gözleyerek ölçekli olarak çiziniz.',
        answer:
          'Negatif kenetleyicinin aynası: sinüste çıkış ≈ −0,57 V ile ≈ +9,11 V arasında salınır (ortalaması ≈ +4,16 V); dalga yukarı kaymıştır, en alt noktası bir diyot gerilimi kadar sıfırın altındadır. Negatif tepede diyot iletir ve kondansatör dolar; kondansatörün çıkış tarafı + olur. Kare dalgada (±5 V) çıkış ≈ −0,52 V ile ≈ +9,53 V arasında bir kare dalgadır; üst seviyede kondansatör 10 kΩ üzerinden biraz boşalır, yarım periyotta ≈ 0,2 V düşer. Diyoda seri bir DC kaynak eklenirse kenetleme seviyesi o kadar kayar (öngerilimli kenetleyici).',
      },
    ],
  },
  'gerilim-katlayici': {
    experiment: 3,
    figure: 'Şekil-10',
    steps: [
      {
        no: '2',
        text: 'Şekil-10’daki gerilim katlayıcıyı kur (elektrolitik kondansatörlerin kutuplarına dikkat). Girişe 5 V’luk sinüs uygulayıp çıkışı izle. V_{ç}’yi, kondansatörlerin V_{p} gerilimlerini ayrı ayrı ölçerek belirle; sonuçlarını açıkla.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik); C1 ve C2 10 µF elektrolitik (C1’in + ucu üst çıkışta, C2’nin − ucu alt çıkışta). Osiloskobun COM’u ortada (kondansatörlerin birleştiği düğümde): A üst çıkışı (+V_{p}), B alt çıkışı (−V_{p}) gösterir, 2 V/bölme. V_{ç} için kipi “A + B (ADD)” yap ve B’yi ters çevir (INV): ekranda A − B = V_{ç}.',
      },
    ],
    questions: [
      {
        step: '2',
        question: 'Vç gerilimini kondansatörler üzerindeki Vp gerilimlerini ayrı ayrı ölçerek belirleyiniz. Sonuçlarınızı açıklayınız.',
        answer:
          'Her kondansatör girişin tepesine yakın bir gerilime dolar: üst çıkış (A) ≈ +4,63 V, alt çıkış (B) ≈ −4,63 V, yani V_{p} ≈ 4,63 V ve V_{ç} = A − B ≈ 9,25 V ≈ 2V_{p}. V_{p}, girişin 5 V’luk tepesinden bir diyot gerilimi kadar (≈ 0,37 V; akım çok küçük olduğu için az) küçüktür. Pozitif yarıda D1 iletir ve C1’i, negatif yarıda D2 iletir ve C2’yi doldurur; D1 kesimdeyken C1 boşalamaz, iki gerilim seri toplanır. Kondansatörler bir anda dolmaz: V_{p} 5 ms’de ≈ 3,64 V, 20 ms’de ≈ 4,37 V, 0,1 s’de ≈ 4,58 V; tepeye yaklaştıkça diyot her periyotta ancak tepenin kısa bir anında iletir. Çıkışta osiloskoptan başka yük olmadığı için dalgalanma görülmez; çıkıştan akım çekilirse, föyde belirtildiği gibi gerilim düşer ve DC’nin üstüne AC bileşen biner.',
      },
    ],
  },
  'seri-kirpici': {
    experiment: 4,
    figure: 'Şekil-13a',
    steps: [
      {
        no: '',
        text: 'Şekil-13’teki devreleri kur; girişlere sinüs ve kare dalga uygula. Çıkışları osiloskopta izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: 1N4001’in katodu üreteçte, anodu çıkışta; 10 kΩ çıkıştan alt hatta. A ve B 5 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için cihaz rafında FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '',
        question: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        answer:
          'Diyot sinyalin yolunda seri durur ve yalnızca giriş negatifken iletir. Sinüste çıkış girişin negatif yarısıdır: ≈ −9,47 V’a iner (girişin −10 V’undan diyotta ≈ 0,5 V düşer); pozitif yarıda çıkış ≈ 0 V’ta kalır (10 kΩ onu sıfıra çeker). Kare dalgada çıkış negatif yarıda ≈ −9,47 V, pozitif yarıda 0 V. Girişin −10 V’tan +10 V’a sıçradığı anda çıkışta ≈ +10,4 V’a çıkan, ≈ 3–4 µs süren dar bir sivri görülür: iletimde biriken yük boşalana kadar diyot ters yönde de iletir (Deney 1’deki ters toparlanma). 0,5 ms/bölmede bu sivri ince bir çizgi gibidir; görmek için zaman/bölmeyi 2 µs’ye indir.',
      },
    ],
  },
  'paralel-kirpici': {
    experiment: 4,
    figure: 'Şekil-13b',
    steps: [
      {
        no: '',
        text: 'Şekil-13’teki devreleri kur; girişlere sinüs ve kare dalga uygula. Çıkışları osiloskopta izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; 1N4001’in anodu çıkışta, katodu DC güç kaynağının 4 V’luk 1. çıkışında. A ve B 5 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için cihaz rafında FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '',
        question: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        answer:
          'Çıkış 4 V + V_{D}’yi geçmeye çalışınca diyot iletir ve fazla gerilim 10 kΩ’un üzerine düşer: pozitif tepeler ≈ 4,45 V’ta düz kesilir (diyottan ≈ 0,55 mA geçtiği için V_{D} ≈ 0,45 V). Negatif yarı olduğu gibi geçer: ≈ −9,90 V (osiloskobun 1 MΩ’luk girişi 10 kΩ ile küçük bir bölücü oluşturur). Kare dalgada çıkış iki seviyelidir: ≈ +4,45 V ve ≈ −9,90 V.',
      },
    ],
  },
  'cift-kirpici': {
    experiment: 4,
    figure: 'Şekil-13c',
    steps: [
      {
        no: '',
        text: 'Şekil-13’teki devreleri kur; girişlere sinüs ve kare dalga uygula. Çıkışları osiloskopta izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; D1’in anodu çıkışta, katodu 3 V’luk pilin + ucunda; D2’nin katodu çıkışta, anodu 2 V’luk pilin − ucunda (pillerin öbür uçları alt hatta). A 5 V/bölme, B 2 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için cihaz rafında FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '',
        question: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        answer:
          'İki yönde de kırpar: çıkış 3 V + V_{D}’yi geçince D1, −(2 V + V_{D})’nin altına inince D2 iletir. Sinüs ≈ +3,46 V ile ≈ −2,46 V arasında, üstü ve altı düz kesilmiş bir dalgaya dönüşür; kare dalgada çıkış ≈ +3,46 V ve ≈ −2,46 V seviyeli bir kare dalgadır. Seviyeler kaynakların gerilimine bir diyot gerilimi (≈ 0,46 V) eklenerek bulunur.',
      },
    ],
  },
  'alt-kirpici': {
    experiment: 4,
    figure: 'Şekil-13d',
    steps: [
      {
        no: '',
        text: 'Şekil-13’teki devreleri kur; girişlere sinüs ve kare dalga uygula. Çıkışları osiloskopta izleyip ölçekli olarak çiz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; iki diyodun da katodu çıkışta: D1’in anodu 3 V’luk pilin + ucunda, D2’nin anodu 2 V’luk pilin − ucunda. A 5 V/bölme, B 2 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için cihaz rafında FG1’in dalga biçimini Kare yap.',
      },
    ],
    questions: [
      {
        step: '',
        question: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        answer:
          'İki diyot da katotla çıkışa bağlı: çıkış anotlarından birinin bir diyot gerilimi altına inince o diyot iletir. D1’in anodu +3 V’ta olduğundan çıkış ≈ +2,51 V’un (3 V − V_{D}) altına inemez; D2’nin anodu −2 V’ta, eşiği çok aşağıda kalır ve hiç iletmez. Üst tarafta kırpma yoktur: çıkış ≈ +2,51 V ile ≈ +9,90 V arasında salınır, sinüsün yalnızca üst kısmı geçer. Kare dalgada çıkış ≈ +9,90 V ile ≈ +2,51 V arasındadır.',
      },
    ],
  },
  'jfet-karakteristik': {
    experiment: 5,
    figure: 'Şekil-15',
    steps: [
      {
        no: '1',
        text: 'Şekil-15’teki devreyi kur.',
        sim: 'Devre kurulu: PS1’in 1. çıkışı V_{DD}; R_{D} = 100 Ω ve A1 üzerinden drain’i besler, source ortak hatta. 2. çıkış ters bağlı: − ucu R_{G} = 10 kΩ üzerinden kapıda, böylece V_{GS} = −V_{GG} (2. çıkışın göstergesi). V1 V_{DS}’yi, A1 I_{D}’yi gösterir. Oynat’a bas.',
      },
      {
        no: '2',
        text: 'V_{GS}’yi 0 V yap. V_{DS}’yi 0’dan 8 V’a kadar 0,2 V, 8–15 V arasında 1 V adımlarla artır ve her adımda I_{D}’yi oku. Transistörün zarar görmemesi için V_{DS}, I_{D} ve V_{DS} · I_{D} kataloğundaki sınırları aşmamalı.',
        sim: 'PS1’in 2. çıkışı 0 V (V_{GS} = 0). Cihaz rafında PS1’in 1. çıkışını (V_{DD}) artırarak V1’de istenen V_{DS}’yi bul, A1’de I_{D}’yi oku. V_{DD} = V_{DS} + I_{D} · 100 Ω: 15 V’luk V_{DS} için V_{DD} ≈ 15,45 V.',
      },
      {
        no: '3',
        text: 'V_{GS} = −0,2 V ve V_{GS} = −0,4 V için deneyi tekrarla.',
        sim: 'PS1’in 2. çıkışını 0,2 V, sonra 0,4 V yap (V_{GS} = −0,2 V ve −0,4 V) ve 2. adımı tekrarla.',
      },
      {
        no: '4',
        text: 'I_{D}’yi sıfır yapan V_{GS}’yi (= V_{P}) ölç.',
        sim: 'V_{DD}’yi 10 V’ta bırak; PS1’in 2. çıkışını A1 sıfır gösterene kadar artır. V_{P} = −V_{GG}.',
      },
      {
        no: '5',
        text: 'Sonuçlarla transistörün akım-gerilim eğrilerini grafik kâğıdına çiz; grafikten I_{DSS} ile V_{P}’yi bul.',
        sim: '2. ve 3. adımdaki tablolardan her V_{GS} için I_{D}–V_{DS} eğrisini çiz. I_{DSS} ile V_{P}’yi bulmanın yolu soruda.',
      },
    ],
    questions: [
      {
        step: '2',
        question: 'V_{GS} gerilimini sıfır volt alınız. V_{DS} gerilimini sıfır volttan başlayarak 8 V’a kadar 0,2 V aralıklarla, 8–15 V arasında da 1 V aralıklarla arttırınız ve her adımda I_{D}’yi okuyunuz.',
        answer:
          'Simülasyonda V_{GS} = 0 için (V_{DS} → I_{D}): 0,2 V → 0,77 mA; 0,4 V → 1,44 mA; 0,6 V → 2,03 mA; 1 V → 2,93 mA; 1,4 V → 3,47 mA; 1,8 V → 3,63 mA; 2 V → 3,64 mA; 4 V → 3,77 mA; 8 V → 4,02 mA; 10 V → 4,14 mA; 15 V → 4,45 mA. V_{DS} ≈ 1,7 V’a kadar I_{D} hızla artar (kanal direnç gibi); sonra eğri yataylaşır (doyum): 2 V’tan 15 V’a akım yalnızca ≈ %22 artar. Kırılma noktası V_{DS} = V_{GS} − V_{P} = 1,74 V. Güvenlik: en büyük güç 15 V · 4,45 mA ≈ 67 mW; BF245A’nın kataloğunda P_{tot} 300 mW, V_{DS} en çok 30 V, yani sınırların çok altında.',
      },
      {
        step: '3',
        question: 'V_{GS} gerilimini V_{GS} = −0,2 V ve V_{GS} = −0,4 V alarak yukarıdaki deneyi her bir V_{GS} değeri için tekrarlayınız.',
        answer:
          'V_{GS} = −0,2 V (V_{DS} → I_{D}): 0,2 V → 0,67 mA; 1 V → 2,46 mA; 2 V → 2,85 mA; 8 V → 3,15 mA; 15 V → 3,49 mA. V_{GS} = −0,4 V: 0,2 V → 0,58 mA; 1 V → 1,99 mA; 2 V → 2,16 mA; 8 V → 2,38 mA; 15 V → 2,64 mA. V_{GS} eksildikçe eğriler aşağı iner ve doyum daha küçük V_{DS}’de başlar (V_{GS} − V_{P}: −0,2 V’ta 1,54 V, −0,4 V’ta 1,34 V). Kapıdan akım geçmez (≈ 10 pA), bu yüzden V_{GS} kaynağın gösterdiği değere tam eşittir.',
      },
      {
        step: '4',
        question: 'I_{D} akımını sıfır yapan V_{GS} (= V_{P}) değerini ölçünüz.',
        answer:
          'V_{DD} = 10 V’ta I_{D}, V_{GS} = −1,5 V’ta ≈ 79 µA, −1,6 V’ta ≈ 27 µA, −1,7 V’ta ≈ 2,2 µA, −1,72 V’ta ≈ 0,55 µA; −1,74 V’ta sıfırdır. V_{P} ≈ −1,74 V. Akım V_{P}’ye yaklaşırken karesel olarak sıfıra indiğinden, ampermetrenin çözünürlüğüne göre okunan değer biraz daha az eksi çıkabilir (1 µA çözünürlükte ≈ −1,72 V).',
      },
      {
        step: '5',
        question: 'Elde ettiğiniz sonuçlarla transistörün akım-gerilim karakteristik eğrisini grafik kağıdına çiziniz. Grafikten faydalanıp, transistör parametreleri I_{DSS} ve V_{P}’yi bulunuz.',
        answer:
          'I_{DSS}: V_{GS} = 0 eğrisinin doyum bölgesi düz değil, hafif eğimlidir (2 V’ta 3,64 mA, 15 V’ta 4,45 mA). Bu doğruyu V_{DS} = 0’a uzatınca I_{DSS} ≈ 3,52 mA bulunur (eğim ≈ 0,062 mA/V). V_{P}: 4. adımda doğrudan ≈ −1,74 V. Eğrilerden de bulunur: aynı V_{DS}’de (8 V) I_{D}(−0,2 V) / I_{D}(0) = 3,15 / 4,02 ≈ 0,78; formülden 1 − 0,2 / |V_{P}| = √0,78 → V_{P} ≈ −1,74 V. −0,4 V eğrisi de aynı sonucu verir. Bu değerler simülasyondaki BF245A modelinin I_{DSS} = 3,52 mA ve V_{P} = −1,74 V değerleriyle aynı; katalogda BF245A için I_{DSS} 2–6,5 mA.',
      },
    ],
  },
};

/** Örneğin föydeki şekli; föy deneyi olmayan ve ek örneklerde null. */
export function labFigure(id: ExampleId): LabFigure | null {
  return LAB_FIGURE_TEXTS[id] ?? null;
}

/** Deney grubunun amacı (klasörde grup başlığının altında); föy deneyi olmayan gruplarda null. */
export function labAim(group: ExampleGroupId): string | null {
  const n = labExperiment(group);
  return n === null ? null : (LAB_EXPERIMENT_TEXTS[n]?.aim ?? null);
}
