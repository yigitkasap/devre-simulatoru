// Föyün (Fizik 2. sınıf Elektronik Laboratuvarı, Deney 1–9) deney kartlarındaki metinler.
//
// Yazım notları:
//   - Deney adları, şekil numaraları, formüller ve adım numaraları föydeki gibidir. Adımların metni
//     föyden alıntıdır (yazım hataları düzeltildi); amaç, teorik bilgi, “Simülasyonda:” satırları ve
//     cevaplar föyün anlamını ve sayılarını koruyarak yeniden yazıldı.
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

/**
 * Föydeki bir adım (2a, 2b gibi alt maddeler ayrı adım): numarası (föydeki gibi; numarasız adımda
 * ''), föydeki metni (alıntı), simülasyonda nasıl yapılacağı ve adımın sorusu varsa cevabı.
 */
export interface LabStep {
  readonly no: string;
  readonly text: string;
  readonly sim: string;
  /** Simülasyonda ölçülen sayılarla cevap (kartta "Cevabı göster" ile açılır). */
  readonly answer?: string;
  /** Cevabın altında açılacak başka bir örnek (ör. sorunun çözümü olan ek devre). */
  readonly link?: ExampleId;
}

/** Föydeki bir şeklin kartı: hangi deneyin hangi şekli ve o şekle ait adımlar (soruların cevaplarıyla). */
export interface LabFigure {
  readonly experiment: LabExperimentNo;
  readonly figure: string;
  readonly steps: readonly LabStep[];
}

/** BF245A’nın bacak bağlantısı (föydeki Şekil-16; Deney 5 ve 6). */
const BF245A: LabPinout = {
  part: 'BF245A',
  figure: 'Şekil-16',
  legs: ['Kapı (G)', 'Source (S)', 'Drain (D)'],
  note: 'Föydeki numaralama Philips’in BF245A kataloğundakinden farklı: katalogda 1 drain, 2 source, 3 kapı. İkisinde de ortadaki bacak source’tur; BF245A simetrik olduğu için drain ile source yer değiştirse de çalışır, önemli olan kapıyı doğru bulmaktır. Takmadan önce elindeki parçanın kataloğuna bak. Katalog sınırları: V_{DS} en çok ±30 V, P_{tot} 300 mW.',
};

/** BC107’nin bacak bağlantısı (föydeki Şekil-19; Deney 7 ve 9). */
const BC107: LabPinout = {
  part: 'BC107',
  figure: 'Şekil-19',
  legs: ['Emetör (E)', 'Baz (B)', 'Kollektör (C)'],
  note: 'Metal kılıf (TO-18). Şekil-19a’daki gibi kılıfın tırnağına en yakın bacak 1 (emetör), ortadaki 2 (baz), öbür uçtaki 3 (kollektör); Central’ın BC107 kataloğundaki numaralama da aynı. Katalog sınırları: V_{CEO} 45 V, I_{C} 200 mA, P_{D} 600 mW.',
};

export const LAB_EXPERIMENT_TEXTS: Record<LabExperimentNo, LabExperiment> = {
  1: {
    title: 'Diyot karakteristiklerinin incelenmesi',
    aim: 'Diyodun akımının gerilimle nasıl değiştiğini (I-V eğrisini) ölçüp incelemek.',
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
    aim: 'Alternatif akımı diyotlarla yarım ve tam dalga doğrultup çıkışı incelemek.',
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
    aim: 'Diyot ve kondansatörle dalgayı kaydıran ve gerilimi katlayan devreleri incelemek.',
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
    aim: 'Kırpıcı devrelerin sinyali hangi seviyede ve nasıl kestiğini incelemek.',
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
    aim: 'Eklem FET’in (JFET) akım-gerilim eğrilerini ölçüp çizmek ve parametrelerini bulmak.',
    theory: [
      {
        text: 'Eklem FET’te (JFET) drain ile source arasındaki yarı iletken kanaldan geçen I_{D} akımını hem V_{DS} hem de kapı ile source arasındaki ters gerilim V_{GS} denetler: V_{GS} eksildikçe kanal daralır. Şekil-14’te n kanallı JFET’in I_{D}–V_{DS} eğrileri var. V_{DS} küçükken kanal bir direnç gibidir ve I_{D} V_{DS} ile artar. V_{DS} belirli bir değeri aşınca (doyum bölgesi) kanal kısılır ve I_{D} artık neredeyse yalnızca V_{GS}’ye bağlıdır:',
      },
      { formula: 'i_{d} = I_{DSS} · (1 − υ_{GS} / V_{P})²,   V_{DS} ≥ V_{GS} − V_{P}' },
      {
        text: 'I_{DSS}, V_{GS} = 0’daki doyum akımıdır; V_{P} kısılma gerilimidir (n kanalda eksi). V_{GS}, V_{P}’den daha eksi olunca kanal tamamen kapanır ve I_{D} = 0. Gerçek JFET’te doyum bölgesinde de akım V_{DS} ile hafifçe artar (kanal boyu modülasyonu, i_{d}’nin (1 + λ · V_{DS}) ile çarpılması). Kapı-kanal eklemi ters kutuplu olduğundan kapıdan akım geçmez (I_{G} ≈ 0), bu yüzden R_{G} üzerinde gerilim düşmez.',
      },
    ],
    pinout: BF245A,
  },
  6: {
    title: 'FET yükselteci',
    aim: 'JFET’li bir yükselteci kazancı 10 olacak biçimde tasarlayıp çalışmasını incelemek.',
    theory: [
      { text: 'JFET’te i_{d} akımını kapıya uygulanan gerilim denetler. I_{DSS} ve V_{P} transistörün parametreleri, υ_{GS} kapı ile source arasındaki gerilim olmak üzere:' },
      { formula: 'i_{d} = I_{DSS} · (1 − υ_{GS} / V_{P})²', eq: 1 },
      { text: 'Şekil-17’nin giriş katında kapıdan akım geçmez (i_{g} = 0), R_{g} üzerinde gerilim düşmez; kapının gerilimi girişin gerilimidir:' },
      { formula: 'υ_{GS} = υ_{s}', eq: 2 },
      { text: 'Çıkış katında drain’in gerilimi:' },
      { formula: 'υ_{DS} = V_{DD} − i_{d} · R_{d}', eq: 3 },
      { text: 'Bu üç ifadeden çıkış, A sabit bir gerilim ve K_{υ} gerilim kazancı olmak üzere:' },
      { formula: 'υ_{DS} = A − K_{υ} · υ_{s}', eq: 4 },
      { formula: 'K_{υ} = −2 · I_{DSS} · R_{d} / V_{P}', eq: 5 },
      {
        text: 'Çıkış, A gibi bir DC gerilimin üstüne K_{υ} kat büyütülerek binmiş giriş sinyalidir; (4)’teki eksi işareti çıkışın girişe göre 180° faz kaydığını gösterir. (5), υ_{GS} = 0 çalışma noktasındaki küçük işaret kazancıdır (V_{P} eksi olduğundan K_{υ} artıdır). Büyük sinyalde (1) karesel olduğu için iki yarı eşit büyümez ve çıkış bozulur.',
      },
    ],
    pinout: BF245A,
  },
  7: {
    title: 'BJT’li temel yükselteç',
    aim: 'BJT ile temel bir yükselteç kurup kazancını ve davranışını incelemek.',
    theory: [
      {
        text: 'BJT akım kazancı sağlar: küçük bir i_{b} baz akımı, kollektör ile emetör arasındaki çok daha büyük bir akımı denetler. Akım kazancı:',
      },
      { formula: 'β = i_{c} / i_{b},   i_{e} = i_{b} + i_{c}' },
      {
        text: 'Transistörlerin β’sı 10 ile 1000 arasında değişir; i_{b}’deki küçük bir değişim i_{c}’de β kat büyük bir değişime yol açar. Gerilim yükselteci olarak kullanılınca (Şekil-18) giriş gerilimi R_{B} üzerinden baz akımına, kollektör akımı da R_{C} üzerinden gerilime dönüştürülür; böylece υ_{s} ile υ_{ce} denetlenir. A bir sabit olmak üzere:',
      },
      { formula: 'K_{υ} = β · R_{c} / R_{b}', eq: 6 },
      { formula: 'υ_{ç} = A − K_{υ} · υ_{s}', eq: 7 },
      {
        text: 'Eksi işaret çıkışın girişe göre 180° ters fazlı olduğunu gösterir. (6), bazın kendi direncini (r_{π} = β · V_{T} / I_{C}, V_{T} ≈ 26 mV) R_{B}’nin yanında ihmal eder; daha doğru hesap K_{υ} ≈ β · R_{C} / (R_{B} + r_{π}). Çalışma noktası, çıkış iki yöne eşit salınabilsin diye V_{CE} ≈ V_{CC} / 2 seçilir; Şekil-18’de kuplaj kondansatörü olmadığından bazın DC akımını üretecin DC kayması (ofset) verir.',
      },
    ],
    pinout: BC107,
  },
  8: {
    title: 'MOSFET’li yükselteç devresi',
    aim: 'MOSFET’li bir yükselteci tasarlayıp kazancını, fazını ve bozulmasını incelemek.',
    theory: [
      { text: 'MOSFET’te drain akımını kapının gerilimi denetler; kapı ince bir oksitle yalıtıldığından kapıdan DC akım geçmez. Şekil-20’deki yükseltecin çıkışı, A sabit bir gerilim olmak üzere:' },
      { formula: 'υ_{DS} ≅ A − K_{υ} · υ_{S}', eq: 8 },
      { text: 'K_{υ} gerilim kazancıdır:' },
      { formula: 'K_{υ} = −2K · R_{d} · V_{T}', eq: 9 },
      {
        text: 'V_{T}, altında drain akımı geçmeyen kapı gerilimidir (eşik; föyde “I_{DSS} akımını sıfır yapan” diye geçiyor, doğrusu I_{D}). K transistörün yapısına bağlı bir katsayıdır; µ taşıyıcıların hareketliliği (mobilite), ε yalıtkanın dielektrik sabiti, ω, T ve L kanalın geometrik büyüklükleri olmak üzere:',
      },
      { formula: 'K = µ · ε · ω / (2 · T · L)', eq: 10 },
      {
        text: '(9), kapısı υ_{GS} = 0’da kutuplanan, V_{T}’si eksi (azaltmalı tip) bir MOSFET içindir. IRF510 çoğaltmalı tiptir (V_{T} ≈ 3,83 V > 0): doyum bölgesinde I_{D} = K · (V_{GS} − V_{T})², kapı V_{T}’nin biraz üstünde kutuplanır ve kazanç aşağıdaki gibidir; iki ifade V_{GS} = 0’da aynıdır. R_{S} olmadığından çalışma noktasını yalnızca kapının DC gerilimi kurar.',
      },
      { formula: 'K_{υ} = 2K · (V_{GS} − V_{T}) · R_{d} = 2 · √(K · I_{D}) · R_{d}' },
    ],
    pinout: {
      part: 'IRF510',
      figure: 'Şekil-22',
      legs: ['Kapı (G)', 'Drain (D)', 'Source (S)'],
      note: 'TO-220 kılıf: yazılı yüz sana bakarken, bacaklar aşağıdayken soldan sağa 1 kapı, 2 drain, 3 source (Vishay kataloğunda da G D S). Metal sırt drain’e bağlıdır (Şekil-22a). Katalog sınırları: V_{DS} 100 V, V_{GS} ±20 V, I_{D} 5,6 A, P_{D} 43 W (kılıf 25 °C’ta).',
    },
  },
  9: {
    title: 'Transistörlerin anahtar olarak kullanılması',
    aim: 'Transistörün bir LED’i açıp kapatan anahtar olarak çalışmasını incelemek.',
    theory: [
      {
        text: 'Transistör, kollektör ile emetör arasından geçen büyük akımı bazına verilen küçük bir akımla açıp kapatabildiği için anahtar olarak kullanılır. Şekil-23’te baz akımı sıfırken transistör C ile E arasında çok büyük bir direnç gibidir; V_{CC}’den gelen akımın hepsi R_{2}’den ve LED’den geçer ve LED yanar. Baz akımı verilince C-E direnci küçülür, akımın bir kısmı transistörden geçer ve C noktasının gerilimi düşer; bu gerilim LED’in eşiğinin altına inince LED’den akım geçmez ve LED söner. Baz akımı:',
      },
      { formula: 'I_{B} = (V_{S} − V_{BE}) / R_{1}' },
      {
        text: 'Kollektör devresinin verebileceği en büyük akım I_{C,doyum} ≈ (V_{CC} − V_{CE,doyum}) / R_{2}’dir. β · I_{B} bundan büyükse transistör doyuma girer: kapalı bir anahtar gibidir, V_{CE} ≈ 0,1 V’un altına iner.',
      },
      { formula: 'doyum: β · I_{B} > I_{C,doyum}' },
      {
        text: 'LED, Şekil-25’teki gibi emetöre seri bağlanırsa mantık tersine döner: transistörden akım geçerken LED yanar, geçmezken söner.',
      },
    ],
    pinout: BC107,
  },
};

export const LAB_FIGURE_TEXTS: Partial<Record<ExampleId, LabFigure>> = {
  'diyot-dc': {
    experiment: 1,
    figure: 'Şekil-2',
    steps: [
      {
        no: '1',
        text: 'Şekil-2’deki devreyi kurunuz. V_{i} giriş gerilimini 0–1 V (DC) aralığında 0,1 V ve 1–5 V aralığında 1 V’luk adımlarla arttırarak devreden geçen akım ve V_{o} çıkış gerilimlerini okuyunuz. Elde ettiğiniz verilerden akım-gerilim karakteristik eğrisini (I-V) grafik kağıdına çiziniz ve diyotun hangi yarıiletkenden yapıldığını belirleyiniz.',
        sim: 'Devre kurulu: V_{i} güç kaynağının (PS1) 1. çıkışı, A1 akımı, V1 1 kΩ’un uçlarındaki V_{o}’yu gösteriyor. Oynat’a bas; defterde PS1’in kartını aç (masaüstünde sağdaki Defter, telefonda şemanın altı), 1. çıkışın gerilimini adım adım değiştir ve her adımda A1 ile V1’i oku. Diyodun gerilimi V_{D} = V_{i} − V_{o}.',
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
        text: 'Şekil-3’teki devrede V_{i} giriş gerilimi olarak 5 V genlikli sinüs sinyali uygulayınız. Osiloskobu xy moduna getirerek 1. kanal x (giriş sinyali) ve 2. kanal y (direnç üzerindeki potansiyel fark) olacak şekilde devreye bağlayarak akım-gerilim eğrisini elde ediniz. İlk kısımda elde ettiğiniz sonuçlarla osiloskopta gözlenen eğriyi karşılaştırınız.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik). Osiloskop X-Y kipinde; 1. kanal A (X, 1 V/bölme) girişte, 2. kanal B (Y, 1 V/bölme) 1 kΩ’un üst ucunda, COM alt hatta. Oynat’a bas.',
        answer:
          'X-Y’de yatay eksen diyodun değil girişin gerilimini gösterir: V_{i} = V_{D} + V_{R}. Bu yüzden eğri tablodakinden farklı görünür: akım girişin ≈ 0,5 V’undan sonra başlar, sonra neredeyse doğru olarak yükselir (eğimi 1 kΩ’un belirlediği 1 mA/V). Akım 1 mA’e V_{i} ≈ 1,5 V’ta ulaşır; o anda diyotta ≈ 0,47 V vardır, tablodaki değerlerle aynı (1 V’ta 0,55 mA’de 0,45 V, 2 V’ta 1,50 mA’de 0,50 V). En büyük akım ≈ 4,23 mA; tablodaki 5 V’ta ölçülen 4,44 mA’den biraz küçük, çünkü üretecin 50 Ω’luk çıkış direnci de seridir: (5 V − 0,56 V) / 1050 Ω ≈ 4,23 mA. Diyodun kendi eğrisi için her noktada V_{D} = V_{A} − V_{B} hesaplanır.',
      },
      {
        no: '2b',
        text: 'Giriş sinyalinin frekansını 1 kHz ile 1 MHz arasında değiştirerek diyotun V_{eşik} geriliminde ve I-V eğrisinde değişiklik olup olmadığını kontrol ediniz. Değişiklikler varsa nedenini açıklayınız.',
        sim: 'Defterdeki FG1 kartında frekansı sırayla 10 kHz, 100 kHz ve 1 MHz yap; X-Y ekranında sol (ters) kolun aşağı inmesine ve eğrinin ilmek açmasına bak.',
        answer:
          '1 kHz’te eğri tek bir çizgidir; ters yönde en çok ≈ −0,07 mA geçer. Frekans artınca sol (ters) kol aşağı iner ve eğri ilmek açar: ters tepe akımı 10 kHz’te ≈ −1,4 mA, 100 kHz’te ≈ −4,9 mA, 1 MHz’te ≈ −5,1 mA; ileri tepe 4,2–4,4 mA arasında kalır. Akımın 1 mA’i geçtiği giriş gerilimi de küçülür (1 kHz’te ≈ 1,48 V, 1 MHz’te ≈ 1,19 V): eşik düşmüş gibi görünür. Nedeni diyodun yük depolamasıdır: ileri yönde iletirken eklemde azınlık taşıyıcı yükü birikir (1N4001’in modelinde geçiş süresi ≈ 5,8 µs). Giriş ters dönünce bu yük boşalana kadar diyot ters yönde de iletir (ters toparlanma). Periyot bu süreyle karşılaştırılabilir olunca (100 kHz’te 10 µs) diyot kesime gidemez. 1N4001 şebeke frekansı için yapılmış yavaş bir diyottur; yüksek frekansta hızlı ya da Schottky diyot kullanılır.',
      },
      {
        no: '2c',
        text: 'Osiloskobun düşey ekseninin (2. kanal) devreden geçen akımı nasıl gösterdiğini düşününüz.',
        sim: 'B’nin volt/bölmesi 1 V: 1 kΩ’da 1 V, 1 mA demektir; ekranda düşeyde bir bölme 1 mA.',
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
        text: 'Diyotu, Zener diyot ve Işıklı diyot (LED) ile değiştirerek bunların akım-gerilim eğrilerini elde ediniz. Aynı eğrileri osiloskobun normal ve xy modunda inceleyerek zener olayını gözleyiniz.',
        sim: 'Devre kurulu: diyodun yerinde 5,6 V’luk zener (föy değerini vermiyor; laboratuvardakinin değeri farklıysa Z1’in zener gerilimini değiştir). FG1 20 V tepe-tepe: föydeki 5 V genlik bu zeneri kırmaya yetmez (nedeni soruda). Osiloskop X-Y kipinde, A ve B 2 V/bölme; normal kip için kipi “A ve B (Y-t)” yap.',
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
        text: 'Diyotu, Zener diyot ve Işıklı diyot (LED) ile değiştirerek bunların akım-gerilim eğrilerini elde ediniz. Aynı eğrileri osiloskobun normal ve xy modunda inceleyerek zener olayını gözleyiniz.',
        sim: 'Devre kurulu: diyodun yerinde kırmızı LED, FG1 10 V tepe-tepe (5 V genlik). Osiloskop X-Y kipinde, A ve B 1 V/bölme. LED1’in rengini yeşil ya da mavi yapıp eşiği karşılaştır.',
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
        text: 'Diyot (1N4001) ve R_{L} direncini 1 kΩ alarak Şekil-4a’da verilen yarım dalga doğrultucusunu kurunuz. Girişe genliği 3 V olan sinüs sinyali uygulayınız. Giriş ve çıkış dalga şekillerini osiloskopta aynı anda gözleyip frekansı 1 kHz’ten 1 MHz’e kadar yavaşça artırarak oluşan değişimleri belirleyiniz ve nedenlerini belirtiniz. Aynı işlemi 5 V’luk giriş gerilimi için tekrarlayınız.',
        sim: 'Devre kurulu: FG1 1 kHz, 6 V tepe-tepe (3 V genlik); S4 kapalı (R_{L} bağlı), S1–S3 açık. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta, ikisi de 1 V/bölme. Oynat’a bas; defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) frekansı 10 kHz, 100 kHz ve 1 MHz yap, her seferinde OSC1 kartındaki Oto’ya bas. 5 V genlik için tepe-tepe değeri 10 V yap.',
        answer:
          '3 V genlikte, 1 kHz’te çıkış yalnızca pozitif yarılardan oluşur: tepe ≈ 2,36 V (girişin 3 V’undan diyotta ve üretecin 50 Ω’unda ≈ 0,64 V düşer), negatif yarılarda ≈ 0 V; ortalaması ≈ 0,69 V (ideal formül V_{T} / π tepeden ≈ 0,75 V verir; fark, diyodun eşiği aşılana kadar akım geçmemesinden). Frekans artınca her negatif yarının başında çıkış eksiye iner: 10 kHz’te ≈ −0,79 V, 100 kHz’te ≈ −2,91 V, 1 MHz’te ≈ −3,11 V. Ortalama 100 kHz’te ≈ 0,34 V’a, 1 MHz’te ≈ 0,05 V’a düşer: 1 MHz’te diyot artık doğrultmaz, giriş iki yönde de geçer. Nedeni Deney 1’deki ters toparlanmadır: iletimde biriken yük boşalana kadar (1N4001’in modelinde ≈ 5,8 µs) diyot ters yönde de iletir; yarım periyot bu süreye yaklaşınca (100 kHz’te 5 µs) negatif yarının çoğu geçer. 5 V genlikte de aynı: 1 kHz’te tepe ≈ 4,23 V, ortalama ≈ 1,28 V; ters tepe 10 kHz’te ≈ −1,41 V, 100 kHz’te ≈ −4,88 V, 1 MHz’te ≈ −5,07 V; 1 MHz’te ortalama ≈ 0,10 V.',
      },
      {
        no: '2',
        text: 'Devre çıkışına, R_{L} direncine paralel olarak 1 µF, 22 µF ve 470 µF’lık elektrolitik kondansatörleri sıra ile bağlayarak giriş ve çıkış dalga şekillerini aynı anda gözlemleyiniz. R_{L} direnci olmadan (R_{L} = ∞) ne olduğunu inceleyiniz. Sonuçları yorumlayınız.',
        sim: 'S1, S2 ve S3 sırasıyla 1 µF, 22 µF ve 470 µF’ı R_{L}’ye paralel bağlar: birini kapat, öbürlerini açık bırak. R_{L} = ∞ için S4’ü aç. 470 µF’ın dolması birkaç saniye sürer; dalgalanmayı görmek için B’yi AC kuplaja ve 10 mV/bölmeye al.',
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
        text: 'Şekil-5a’daki köprü tipi tam dalga doğrultucusunu 1N4001 diyotları ve R_{L} = 100 kΩ kullanarak kurunuz. Girişe 5 V genlikte sinüs sinyali uygulayınız. Giriş ve çıkışı osiloskopta aynı anda gözleyip değerlendiriniz.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik), diyotlar föydeki numaralarla (D1–D4). Yükün iki ucu da topraktan farklı gerilimde: A yükün + ucunda, B − ucunda, COM üretecin COM’unda. Kip “A + B (ADD)”, B ters (INV): ekranda A − B, yani çıkış. Kipi “A ve B (Y-t)” yaparsan A ile B’yi ayrı ayrı görürsün.',
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
        text: 'Şekil-9’daki devreleri kurunuz ve girişlerine 1 kHz frekanslı önce sinüs daha sonra kare dalga uygulayınız. Giriş ve çıkış sinyallerini osiloskopta aynı anda gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe sinüs; C = 2,2 µF, 1N4001’in anodu çıkışta, R = 10 kΩ. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta, ikisi de DC kuplaj, 5 V/bölme; zaman/bölme 0,5 ms. Oynat’a bas; kare dalga için defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) dalga biçimini Kare yap.',
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
        text: 'Şekil-9’daki devreleri kurunuz ve girişlerine 1 kHz frekanslı önce sinüs daha sonra kare dalga uygulayınız. Giriş ve çıkış sinyallerini osiloskopta aynı anda gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: negatif kenetleyicinin aynısı, 1N4001’in katodu çıkışta. Kutup notu: föydeki Şekil-9b’de kondansatörün + işareti giriş tarafında çizilmiş; bu devrede kondansatör çıkış tarafı + olacak şekilde dolar, bu yüzden elektrolitiğin + ucu çıkış tarafında (simülasyondaki yön doğru). Osiloskop A girişte, B çıkışta, 5 V/bölme; kare dalga için FG1’in dalga biçimini Kare yap.',
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
        text: 'Şekil-10’daki gerilim katlayıcı devreyi kurunuz (elektrolitik sığaların üzerindeki kutup işaretlerine dikkat ediniz). Devre girişine 5 V’luk sinüs sinyali uygulayarak çıkışı gözleyiniz. V_{ç} gerilimini kondansatörler üzerindeki V_{p} gerilimlerini ayrı ayrı ölçerek belirleyiniz. Sonuçlarınızı açıklayınız.',
        sim: 'Devre kurulu: FG1 1 kHz, 10 V tepe-tepe (5 V genlik); C1 ve C2 10 µF elektrolitik (C1’in + ucu üst çıkışta, C2’nin − ucu alt çıkışta). Osiloskobun COM’u ortada (kondansatörlerin birleştiği düğümde): A üst çıkışı (+V_{p}), B alt çıkışı (−V_{p}) gösterir, 2 V/bölme. V_{ç} için kipi “A + B (ADD)” yap ve B’yi ters çevir (INV): ekranda A − B = V_{ç}.',
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
        text: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: 1N4001’in katodu üreteçte, anodu çıkışta; 10 kΩ çıkıştan alt hatta. A ve B 5 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) dalga biçimini Kare yap.',
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
        text: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; 1N4001’in anodu çıkışta, katodu DC güç kaynağının 4 V’luk 1. çıkışında. A ve B 5 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) dalga biçimini Kare yap.',
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
        text: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; D1’in anodu çıkışta, katodu 3 V’luk pilin + ucunda; D2’nin katodu çıkışta, anodu 2 V’luk pilin − ucunda (pillerin öbür uçları alt hatta). A 5 V/bölme, B 2 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) dalga biçimini Kare yap.',
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
        text: 'Şekil-13’teki devreleri kurarak girişlere sinüs ve kare dalga uygulayınız. Çıkışları osiloskopta gözleyerek ölçekli olarak çiziniz.',
        sim: 'Devre kurulu: 10 kΩ üreteçten çıkışa; iki diyodun da katodu çıkışta: D1’in anodu 3 V’luk pilin + ucunda, D2’nin anodu 2 V’luk pilin − ucunda. A 5 V/bölme, B 2 V/bölme. Föy genliği vermiyor; kırpma seviyelerini aşsın diye FG1 1 kHz, 20 V tepe-tepe (±10 V) sinüs. Osiloskop “A ve B (Y-t)” kipinde: A girişte, B çıkışta. Oynat’a bas; kare dalga için defterdeki FG1 kartında (masaüstünde sağdaki Defter, telefonda şemanın altı) dalga biçimini Kare yap.',
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
        text: 'Şekil-15’teki devreyi kurunuz.',
        sim: 'Devre kurulu: PS1’in 1. çıkışı V_{DD}; R_{D} = 100 Ω ve A1 üzerinden drain’i besler, source ortak hatta. 2. çıkış ters bağlı: − ucu R_{G} = 10 kΩ üzerinden kapıda, böylece V_{GS} = −V_{GG} (2. çıkışın göstergesi). V1 V_{DS}’yi, A1 I_{D}’yi gösterir. Oynat’a bas.',
      },
      {
        no: '2',
        text: 'V_{GS} gerilimini sıfır volt alınız. V_{DS} gerilimini sıfır volttan başlayarak 8 V’a kadar 0,2 V aralıklarla, 8–15 V arasında da 1 V aralıklarla arttırınız ve her adımda I_{D}’yi okuyunuz. Transistörünüzün zarar görmemesi için V_{DS} ve I_{D}’nin maksimum değerleri ile V_{DS} · I_{D} çarpımı transistör kataloğunda belirtilen limitleri aşmamalıdır.',
        sim: 'PS1’in 2. çıkışı 0 V (V_{GS} = 0). Defterdeki PS1 kartında 1. çıkışı (V_{DD}) artırarak V1’de istenen V_{DS}’yi bul, A1’de I_{D}’yi oku. V_{DD} = V_{DS} + I_{D} · 100 Ω: 15 V’luk V_{DS} için V_{DD} ≈ 15,45 V.',
        answer:
          'Simülasyonda V_{GS} = 0 için (V_{DS} → I_{D}): 0,2 V → 0,77 mA; 0,4 V → 1,44 mA; 0,6 V → 2,03 mA; 1 V → 2,93 mA; 1,4 V → 3,47 mA; 1,8 V → 3,63 mA; 2 V → 3,64 mA; 4 V → 3,77 mA; 8 V → 4,02 mA; 10 V → 4,14 mA; 15 V → 4,45 mA. V_{DS} ≈ 1,7 V’a kadar I_{D} hızla artar (kanal direnç gibi); sonra eğri yataylaşır (doyum): 2 V’tan 15 V’a akım yalnızca ≈ %22 artar. Kırılma noktası V_{DS} = V_{GS} − V_{P} = 1,74 V. Güvenlik: en büyük güç 15 V · 4,45 mA ≈ 67 mW; BF245A’nın kataloğunda P_{tot} 300 mW, V_{DS} en çok 30 V, yani sınırların çok altında.',
      },
      {
        no: '3',
        text: 'V_{GS} gerilimini V_{GS} = −0,2 V ve V_{GS} = −0,4 V alarak yukarıdaki deneyi her bir V_{GS} değeri için tekrarlayınız.',
        sim: 'PS1’in 2. çıkışını 0,2 V, sonra 0,4 V yap (V_{GS} = −0,2 V ve −0,4 V) ve 2. adımı tekrarla.',
        answer:
          'V_{GS} = −0,2 V (V_{DS} → I_{D}): 0,2 V → 0,67 mA; 1 V → 2,46 mA; 2 V → 2,85 mA; 8 V → 3,15 mA; 15 V → 3,49 mA. V_{GS} = −0,4 V: 0,2 V → 0,58 mA; 1 V → 1,99 mA; 2 V → 2,16 mA; 8 V → 2,38 mA; 15 V → 2,64 mA. V_{GS} eksildikçe eğriler aşağı iner ve doyum daha küçük V_{DS}’de başlar (V_{GS} − V_{P}: −0,2 V’ta 1,54 V, −0,4 V’ta 1,34 V). Kapıdan akım geçmez (≈ 11 pA), bu yüzden V_{GS} kaynağın gösterdiği değere tam eşittir.',
      },
      {
        no: '4',
        text: 'I_{D} akımını sıfır yapan V_{GS} (= V_{P}) değerini ölçünüz.',
        sim: 'V_{DD}’yi 10 V’ta bırak; PS1’in 2. çıkışını A1 sıfır gösterene kadar artır. V_{P} = −V_{GG}.',
        answer:
          'V_{DD} = 10 V’ta I_{D}, V_{GS} = −1,5 V’ta ≈ 79 µA, −1,6 V’ta ≈ 27 µA, −1,7 V’ta ≈ 2,2 µA, −1,72 V’ta ≈ 0,55 µA; −1,74 V’ta sıfırdır. V_{P} ≈ −1,74 V. Akım V_{P}’ye yaklaşırken karesel olarak sıfıra indiğinden, ampermetrenin çözünürlüğüne göre okunan değer biraz daha az eksi çıkabilir (1 µA çözünürlükte ≈ −1,72 V).',
      },
      {
        no: '5',
        text: 'Elde ettiğiniz sonuçlarla transistörün akım-gerilim karakteristik eğrisini grafik kağıdına çiziniz. Grafikten faydalanıp, transistör parametreleri I_{DSS} ve V_{P}’yi bulunuz.',
        sim: '2. ve 3. adımdaki tablolardan her V_{GS} için I_{D}–V_{DS} eğrisini çiz. I_{DSS} ile V_{P}’yi bulmanın yolu soruda.',
        answer:
          'I_{DSS}: V_{GS} = 0 eğrisinin doyum bölgesi düz değil, hafif eğimlidir (2 V’ta 3,64 mA, 15 V’ta 4,45 mA). Bu doğruyu V_{DS} = 0’a uzatınca I_{DSS} ≈ 3,52 mA bulunur (eğim ≈ 0,062 mA/V). V_{P}: 4. adımda doğrudan ≈ −1,74 V. Eğrilerden de bulunur: aynı V_{DS}’de (8 V) I_{D}(−0,2 V) / I_{D}(0) = 3,15 / 4,02 ≈ 0,78; formülden 1 − 0,2 / |V_{P}| = √0,78 → V_{P} ≈ −1,74 V. −0,4 V eğrisi de aynı sonucu verir. Bu değerler simülasyondaki BF245A modelinin I_{DSS} = 3,52 mA ve V_{P} = −1,74 V değerleriyle aynı; katalogda BF245A için I_{DSS} 2–6,5 mA.',
      },
    ],
  },
  'fet-yukseltec': {
    experiment: 6,
    figure: 'Şekil-17',
    steps: [
      {
        no: '1',
        text: 'Bir önceki deneyde (Deney 5) I_{DSS} ve V_{P} karakteristiklerini belirlediğiniz JFET’leri kullanarak, gerilim kazancı 10 olacak şekilde bir yükselteç devresi tasarımlayınız. (Şekil-17’deki devrede V_{DD}, R_{D} ve R_{g}’yi devrenin kazancı 10 olacak şekilde belirleyiniz.)',
        sim: 'Devre kurulu (tasarımın bir çözümü): V_{DD} = 15 V (PS1), R_{D} = 2,7 kΩ, R_{g} = 10 kΩ, BF245A (I_{DSS} = 3,52 mA, V_{P} = −1,74 V). Kendi tasarımını denemek için R_{D}’nin direncini ya da PS1’in gerilimini değiştir.',
        answer:
          'Deney 5’te I_{DSS} ≈ 3,52 mA, V_{P} ≈ −1,74 V. (5)’ten K_{υ} = 10 için R_{d} = K_{υ} · |V_{P}| / (2 · I_{DSS}) = 10 · 1,74 V / (2 · 3,52 mA) ≈ 2,47 kΩ; en yakın büyük standart değer 2,7 kΩ (formül ≈ 10,9 verir). V_{GS} = 0’da I_{D} ≈ 3,81 mA (kanal boyu modülasyonu yüzünden I_{DSS}’ten biraz büyük). V_{DD} = 15 V seçilirse V_{DS} = 15 V − 3,81 mA · 2,7 kΩ ≈ 4,70 V: transistör doyum bölgesinde (V_{DS} > V_{GS} − V_{P} = 1,74 V) ve drain’in iki yöne salınacak yeri var. R_{g} = 10 kΩ: kapıdan akım geçmediği için kazancı etkilemez (eş. 2); kapı ileri kutuplanırsa akımı sınırlar. Ölçülen kazanç ≈ 10,1.',
      },
      {
        no: '2',
        text: 'Giriş sinyali olarak küçük genlikli (~0,5 V) sinüs sinyali kullanarak giriş ve çıkış dalga şekillerini aynı anda osiloskopta gözleyiniz.',
        sim: 'FG1 1 kHz, 0,5 V tepe-tepe. Osiloskop “A ve B (Y-t)” kipinde: A girişte (DC, 0,2 V/bölme), B drain’de (AC kuplaj, 1 V/bölme). Oynat’a bas; tepe-tepe değerleri ekranın altındaki ölçümlerden oku.',
      },
      {
        no: '2a',
        text: 'Giriş ve çıkış dalga genliklerini ölçerek gerilim kazancını deneysel olarak belirleyiniz.',
        sim: 'Ekranın altındaki ölçümlerden A’nın (giriş) ve B’nin (çıkış) tepe-tepe değerini oku; kazanç = B / A.',
        answer:
          '0,5 V tepe-tepe girişte drain 2,11 V ile 7,14 V arasında, yani ≈ 5,03 V tepe-tepe salınır: K_{υ} ≈ 5,03 / 0,5 ≈ 10,1 (0,1 V tepe-tepe girişte de ≈ 10,1). Formül (5) ≈ 10,9 verir; ölçülen biraz küçük, çünkü kanal boyu modülasyonu drain’e R_{D}’ye paralel bir r_{o} ≈ 1 / (λ · I_{D}) ≈ 15 kΩ ekler: K_{υ} ≈ g_{m} · (R_{D} ∥ r_{o}). Bu genlikte bozulma küçük: çıkış dinlenme noktasının (4,70 V) ≈ 2,44 V üstüne, ≈ 2,59 V altına uzanır.',
      },
      {
        no: '2b',
        text: 'Çıkış ile giriş sinyalleri arasındaki faz farkını belirleyiniz.',
        sim: 'Zaman/bölmeyi 0,2 ms yap; girişin (A) tepesinin çıkışın (B) çukuruyla aynı anda olduğuna bak.',
        answer:
          '180°: girişin pozitif tepesinde (+0,25 V) drain en alt noktasına (≈ 2,11 V) iner, negatif tepesinde en üste (≈ 7,14 V) çıkar. Kapı gerilimi artınca i_{d} artar, R_{D}’deki düşüm büyür ve drain’in gerilimi düşer; (4)’teki eksi işareti bu terslenmedir.',
      },
      {
        no: '3',
        text: 'Giriş sinyalinin genliğini yavaşça artırarak (~2 V’a kadar) çıkış dalga şeklindeki değişimi gözleyiniz. Nasıl bir değişim olmaktadır, nedenini açıklayınız.',
        sim: 'Defterdeki FG1 kartında tepe-tepe değerini 1 V, 2 V ve 4 V yap; B’yi DC kuplaja ve 5 V/bölmeye al, kırpılmanın hangi gerilimlerde olduğunu gör.',
        answer:
          'Çıkış giderek bozulur ve kazanç düşer. 1 V tepe-tepe girişte çıkış 1,36–9,36 V (8,0 V tepe-tepe, kazanç ≈ 8,0): alt yarı yukarıdakinden kısadır. 2 V tepe-tepe girişte 1,20–12,87 V: altı düzleşir. Nedenleri: (i) girişin pozitif yarısında kapı-source eklemi ileri kutuplanır, kapı ≈ 0,66 V’ta kalır ve R_{g}’den ≈ 34 µA geçer; (ii) drain ≈ 1,2 V’a inince V_{DS} < V_{GS} − V_{P} olur, transistör doyumdan çıkar (omik bölge) ve akım daha fazla artamaz; (iii) negatif yarıda i_{d} karesel olarak azalır, iki yarı eşit büyümez. 4 V tepe-tepe girişte (2 V genlik) üstü de düzleşir: υ_{GS} V_{P}’nin (−1,74 V) altına inince kanal kapanır, i_{d} = 0 ve drain V_{DD}’ye (≈ 14,98 V) çıkar.',
      },
      {
        no: '4',
        text: 'Bir önceki adımda gözlenen sorunları gidermek için Şekil-17’deki devrede nasıl bir değişiklik yapılabilir? Açıklayınız.',
        sim: 'Üretecin DC kayması kapıyı kutuplar: kaymayı −0,5 V, R_{D}’yi 3,3 kΩ yapıp 3. adımı tekrarla. Kuplaj kondansatörlü çözüm cevaptaki ek örnekte.',
        answer:
          'Sorunlar: çalışma noktası υ_{GS} = 0’da (pozitif yarıda kapı iletir), karesel yasa ve çıkışın V_{DD}’ye sığmaması (2 V tepe-tepe × 10 = 20 V tepe-tepe > 15 V). Değişiklikler: (1) Çalışma noktasını V_{GS} < 0’a ve V_{DS} ≈ V_{DD} / 2’ye taşı: source ile ortak hat arasına bir R_{S} (kendiliğinden kutuplama; kazancı korumak için ona paralel bir C_{S}) ya da kapıya eksi bir DC. Simülasyonda üretecin DC kaymasını −0,5 V, R_{D}’yi 3,3 kΩ yapınca V_{DS} ≈ 8,23 V olur, 0,5 V tepe-tepe girişte kazanç ≈ 9,8 kalır ve 2 V tepe-tepe girişte bile kapı akımı ≈ 0,1 µA’de kalır. (2) Girişe bir kuplaj kondansatörü, kapıdan ortak hatta büyük bir direnç (1 MΩ) koy: kapı üretecin DC’sinden ayrılır. Aşağıdaki ek örnek bu biçimdedir; 2 V tepe-tepe girişte kapı-source eklemi kondansatörü doldurup çalışma noktasını kendiliğinden eksiye kaydırır (drain’in ortalaması 4,67 V’tan 7,89 V’a çıkar), ama çıkış yine 1,24–14,49 V arasında kırpılır. (3) Büyük bir girişi bozulmasız yükseltmek için kazancı düşür (R_{S}’yi köprülemeden bırak: K_{υ} ≈ R_{D} / (R_{S} + 1 / g_{m})) ya da V_{DD}’yi büyüt (BF245A’da en çok 30 V); ya da girişi küçük tut: 0,5 V tepe-tepe girişte çıkış bozulmaz.',
        link: 'fet-yukseltec-kuplajli',
      },
    ],
  },
  'bjt-yukseltec': {
    experiment: 7,
    figure: 'Şekil-18',
    steps: [
      {
        no: '1',
        text: 'Transistörünüzün β’sını öğrenerek, Şekil-18’deki yükselteç devresini gerilim kazancı 20 olacak şekilde tasarımlayınız.',
        sim: 'Devre kurulu (tasarımın bir çözümü): V_{CC} = 12 V (PS1), R_{B} = 10 kΩ, R_{C} = 1 kΩ, BC107 (β = 200). β’yı Q1’in özelliklerinden okuyabilir, R_{B}’yi ya da R_{C}’yi değiştirerek kendi tasarımını deneyebilirsin.',
        answer:
          'Föydeki (6) K_{υ} = β · R_{C} / R_{B} formülüyle: BC107’de β = 200, R_{C} = 1 kΩ, R_{B} = 10 kΩ → K_{υ} = 200 · 1 kΩ / 10 kΩ = 20. Çıkış iki yöne eşit salınsın diye V_{CE} ≈ V_{CC} / 2 = 6 V: I_{C} ≈ 6 V / 1 kΩ = 6 mA, I_{B} ≈ 6 mA / 200 = 30 µA, üretecin kayması ≈ V_{BE} + I_{B} · R_{B} ≈ 0,68 V + 0,30 V ≈ 0,98 V. Simülasyonda ölçülen kazanç 16,3 (0,2 V tepe-tepe girişte kollektör 4,43–7,69 V). Fark iki yerden gelir: bazın kendi direnci r_{π} = β_{ac} · V_{T} / I_{C} ≈ 0,8 kΩ, R_{B}’ye seri eklenir; küçük işarette β (β_{ac} ≈ 179) DC β’dan (≈ 203) küçüktür. Düzeltilmiş hesap K_{υ} ≈ β_{ac} · R_{C} / (R_{B} + r_{π} + 50 Ω) ≈ 16,5 (50 Ω üretecin çıkış direnci). Kazancı 20’ye yaklaştırmak için R_{B}’yi küçültüp kaymayı yeniden ayarla: R_{B} = 8,2 kΩ ve kayma 0,928 V’ta V_{CE} = 6,0 V, I_{C} = 6,0 mA; ölçülen kazanç 19,5 (0,2 V tepe-tepe girişte kollektör 4,10–8,00 V).',
      },
      {
        no: '2',
        text: 'Giriş (sinüs dalga) ve çıkış sinyallerini osilatörün DC-ofset düğmesini kullanarak osiloskopta gözleyiniz ve devrenin gerilim kazancını belirleyiniz.',
        sim: 'FG1 1 kHz, 0,2 V tepe-tepe sinüs, DC kayma 0,98 V. Osiloskop “A ve B (Y-t)” kipinde: A girişte (AC, 50 mV/bölme), B kollektörde (AC, 1 V/bölme). Oynat’a bas; tepe-tepe değerleri ekranın altından oku. Çalışma noktasını görmek için B’yi DC kuplaja al ya da Q1’e tıklayıp V_{CE}’yi oku; kaymayı değiştirip V_{CE}’nin nasıl kaydığına bak.',
        answer:
          'Kayma bazın DC akımını, yani çalışma noktasını belirler: 0,98 V’ta V_{CE} ≈ 6,02 V, I_{C} ≈ 5,98 mA, I_{B} ≈ 29,5 µA (β_{DC} ≈ 203). Çalışma noktası kaymaya çok duyarlıdır: 0,9 V’ta V_{CE} ≈ 7,35 V, 1,05 V’ta ≈ 4,90 V; kaymadaki her 0,1 V, V_{CE}’yi ≈ 1,6 V kaydırır (kazanç kadar, çünkü kayma da bir giriş gerilimidir). 0,2 V tepe-tepe girişte kollektör 4,43 V ile 7,69 V arasında, yani 3,26 V tepe-tepe salınır: K_{υ} ≈ 16,3. Çıkış girişle ters fazlıdır (180°): girişin pozitif tepesinde kollektör en alttadır.',
      },
      {
        no: '3',
        text: 'Giriş sinyalinin genliğini ve frekansını arttırarak çıkış sinyalinde, dolayısı ile gerilim kazancındaki, değişimi inceleyiniz.',
        sim: 'Defterdeki FG1 kartında tepe-tepe değerini 0,4 V, 0,6 V, 0,8 V ve 1 V yap; sonra 0,2 V’a dönüp frekansı 10 kHz, 100 kHz, 500 kHz ve 1 MHz yap (her seferinde OSC1 kartındaki Oto’ya bas).',
        answer:
          'Genlik (1 kHz): 0,4 V tepe-tepe girişte kazanç ≈ 16,2, 0,6 V’ta ≈ 15,8 (kollektör 1,50–10,98 V): iki yarı eşit büyümez, çünkü kollektör akımı baz-emetör geriliminin üstel fonksiyonudur. 0,8 V’ta alt tepe ≈ 0,23 V’ta düzleşir (doyum), kazanç ≈ 14,6; 1 V’ta üst tepe de V_{CC}’de (≈ 11,99 V) düzleşir (kesim), kazanç ≈ 11,8. Frekans (0,2 V tepe-tepe): kazanç 10 kHz’te ≈ 16,3, 100 kHz’te ≈ 15,7, 500 kHz’te ≈ 9,7, 1 MHz’te ≈ 5,6. Yüksek frekansta transistörün iç kapasiteleri, özellikle Miller etkisiyle (1 + K_{υ}) kat büyüyen baz-kollektör kapasitesi, bazı R_{B} üzerinden besleyen sinyali azaltır. Kazanç 350 kHz ile 400 kHz arasında 1 kHz’teki değerin 1/√2’sine (≈ 11,5) iner: üst kesim frekansı ≈ 370 kHz.',
      },
      {
        no: '4',
        text: 'Giriş sinyali olarak belirli bir frekansta (örneğin 1 kHz) kare dalga uygulayarak çıkış dalga şeklini gözleyiniz.',
        sim: 'FG1’in dalga biçimini Kare yap (1 kHz, 0,2 V tepe-tepe). Kenarlara yakından bakmak için zaman/bölmeyi 1 µs’ye indir.',
        answer:
          'Çıkış ters çevrilmiş bir kare dalgadır: girişin yüksek yarısında kollektör ≈ 4,43 V, alçak yarısında ≈ 7,69 V (3,26 V tepe-tepe, kazanç yine ≈ 16,3). 1 kHz’te (yarım periyot 0,5 ms) kenarlar dik görünür. Zaman/bölmeyi 1 µs’ye indirince her kenarın ≈ 1 µs’de tamamlandığı görülür (yükselme süresi t_{r}, %10–%90). Bu, yükseltecin bant genişliğinden gelir: t_{r} ≈ 0,35 / f_{üst} ≈ 0,35 / 370 kHz ≈ 0,95 µs. Kare dalga çok sayıda harmonikten oluştuğu için yükseltecin yüksek frekans yanıtını tek bakışta gösterir.',
      },
    ],
  },
  'mosfet-yukseltec': {
    experiment: 8,
    figure: 'Şekil-21',
    steps: [
      {
        no: '1',
        text: 'Şekil-21’deki devreyi kurunuz.',
        sim: 'Devre kurulu: FG1 → 10 kΩ → IRF510’un kapısı; source ortak hatta (R_{S} yok); drain 1 kΩ üzerinden V_{DD} = 15 V’a (PS1). Föydeki şekilde kapının DC kutuplaması yok; burada çalışma noktasını üretecin DC kayması (3,907 V) kurar: V_{DS} ≈ 7,5 V, I_{D} ≈ 7,5 mA. Oynat’a bas.',
      },
      {
        no: '2',
        text: 'Giriş sinyali olarak küçük genlikli (~0,1 V) sinüs sinyali kullanarak giriş ve çıkış dalga şekillerini aynı anda osiloskopta gözleyiniz.',
        sim: 'FG1 1 kHz, 0,1 V tepe-tepe. Osiloskop “A ve B (Y-t)” kipinde: A girişte (AC, 50 mV/bölme), B drain’de (AC, 2 V/bölme). Bozulmasız küçük işaret için tepe-tepe değeri 10 mV yap, A’yı 5 mV/bölmeye, B’yi 0,5 V/bölmeye al.',
      },
      {
        no: '3',
        text: 'Giriş ve çıkış dalga genliklerini ölçerek gerilim kazancını belirleyiniz.',
        sim: 'Tepe-tepe değerleri ekranın altından oku. Frekansın etkisini görmek için FG1’in frekansını 100 Hz yap.',
        answer:
          '10 mV tepe-tepe girişte drain 6,62–8,35 V arasında, yani ≈ 1,72 V tepe-tepe salınır: K_{υ} ≈ 172 ve dalga bozulmaz. Hesap: çalışma noktasında I_{D} ≈ 7,49 mA, g_{m} = 2 · √(K · I_{D}) ≈ 0,193 S, K_{υ} ≈ g_{m} · R_{D} ≈ 193. 100 Hz’te ölçülen kazanç ≈ 191, hesaba çok yakın; 1 kHz’te küçük, çünkü kapının kapasitesi (drain-kapı kapasitesi Miller etkisiyle ≈ (1 + K_{υ}) kat büyür) 10 kΩ üzerinden dolar ve kapıya ulaşan sinyali azaltır. Föydeki 0,1 V tepe-tepe giriş bu kazanç için büyüktür: çıkış ≈ 2,25 V ile 13,97 V arasında salınır ve bozulur (kare yasası iki yarıyı eşit büyütmez; bu genlikte oran ≈ 117). Çalışma noktası da aynı nedenle hassastır: kaymadaki 1 mV, V_{DS}’yi ≈ 0,19 V kaydırır (3,907 V’ta 7,5 V; 3,897 V’ta ≈ 9,3 V; 3,917 V’ta ≈ 5,5 V).',
      },
      {
        no: '4',
        text: 'Çıkış ile giriş sinyalleri arasındaki faz farkını belirleyiniz.',
        sim: 'Zaman/bölmeyi 0,1 ms yap; A’nın tepesi ile B’nin çukuru arasındaki süreyi oku: faz farkı = 180° + Δt / T · 360°.',
        answer:
          '≈ 180°: girişin pozitif tepesinde drain aşağı, negatif tepesinde yukarı gider (10 mV tepe-tepe girişin tepesinde ≈ 6,73 V, çukurunda ≈ 8,29 V). Kapı gerilimi artınca I_{D} artar, R_{D}’deki düşüm büyür ve drain’in gerilimi düşer; (8)’deki eksi işareti bu terslenmedir. Ölçülünce tam 180° değildir: 1 kHz’te drain’in çukuru girişin tepesinden ≈ 27° sonra gelir (faz farkı ≈ 207°); 100 Hz’te bu gecikme ≈ 3°’ye iner. Gecikmeyi 3. adımda anlatılan kapı kapasitesi yapar.',
      },
      {
        no: '5',
        text: 'Giriş sinyalinin genliğini yavaşça artırarak (~1 V’a kadar) çıkış dalga şeklindeki değişimi gözleyiniz. Nasıl bir değişim olmaktadır, nedenini açıklayınız.',
        sim: 'Defterdeki FG1 kartında tepe-tepe değerini 0,2 V, 0,5 V ve 1 V yap; B’yi DC kuplaja ve 5 V/bölmeye al.',
        answer:
          'Genlik büyüdükçe kazanç düşer ve çıkış önce asimetrik bozulur (0,05 V tepe-tepede 3,60–11,40 V, oran ≈ 156; 0,1 V’ta 2,25–13,97 V), sonra iki yandan kırpılır: 0,2 V’ta üst tepe V_{DD}’de düzleşir (0,68–14,99 V), 1 V’ta drain ≈ 0,01 V ile 14,99 V arasında, kare dalgaya benzer (oran ≈ 15). Negatif yarıda kapı eşiğin (≈ 3,83 V) altına iner, transistör kesime girer ve drain V_{DD}’ye çıkar; pozitif yarıda drain akımı R_{D}’nin izin verdiği en büyük değere (≈ 15 mA) ulaşır, transistör omik bölgeye girer ve drain ≈ 0 V’a iner.',
      },
    ],
  },
  'bjt-anahtar': {
    experiment: 9,
    figure: 'Şekil-24',
    steps: [
      {
        no: '1',
        text: 'Şekil-24’te verilen devreyi kurunuz.',
        sim: 'Devre kurulu: V_{CC} = 12 V (PS1) → R_{2} = 1 kΩ → kollektör; LED’in anodu kollektörde, katodu ortak hatta (transistöre paralel); R_{1} = 10 kΩ üretecin TTL ucundan baza; emetör ortak hatta. Oynat’a bas.',
      },
      {
        no: '2',
        text: 'Giriş sinyali olarak sinyal jeneratörünün “output pulse” çıkışından çok düşük frekansta kare dalga uygulayınız.',
        sim: 'R_{1}, FG1’in TTL ucuna (föydeki “output pulse”) bağlı: 0 V ile 5 V arasında, FG1’in frekansında (1 Hz) bir kare dalga. Frekansı 0,5 Hz ya da 2 Hz yaparak yanıp sönmenin hızını değiştir.',
      },
      {
        no: '3',
        text: 'Devredeki LED giriş sinyali hangi durumdayken yanıyor gözlemleyiniz, sonuçları yorumlayınız.',
        sim: 'LED1’in yanıp sönmesine bak; Q1’e tıklayıp bölgesini (Kesim, Doyum) ve akımlarını, LED1’e tıklayıp akımını oku.',
        answer:
          'LED giriş 0 V’tayken yanar, 5 V’tayken söner: devre bir tersleyicidir (DEĞİL kapısı). Giriş 0 V’ta baz akımı yoktur, transistör kesimdedir (C-E çok büyük bir direnç gibi); V_{CC}’den gelen akımın hepsi R_{2}’den ve LED’den geçer: ≈ 10,22 mA, LED’in (ve kollektörün) gerilimi ≈ 1,79 V. Giriş yüksekken (TTL ≈ 4,98 V) I_{B} = (4,98 V − 0,71 V) / 10 kΩ ≈ 0,43 mA. β · I_{B} ≈ 85 mA, kollektör devresinin verebileceği ≈ 12 mA’den çok büyük; transistör doyuma girer: I_{C} ≈ 11,95 mA, V_{CE} ≈ 0,05 V. Kollektörün gerilimi LED’in eşiğinin çok altına indiği için LED’den akım geçmez ve söner. Föydeki açıklamadaki gibi: transistörün direnci azaldıkça C noktasının gerilimi düşer, LED’in eşiğinin altına inince LED söner.',
      },
    ],
  },
  'bjt-anahtar-emetor': {
    experiment: 9,
    figure: 'Şekil-25',
    steps: [
      {
        no: '4',
        text: 'Şekil-25’teki devreyi kurunuz ve bu devre için 1, 2, 3 adımlarını tekrarlayınız.',
        sim: 'Devre kurulu: kollektör doğrudan V_{CC} = 12 V’ta; emetör → R_{2} = 1 kΩ → LED → ortak hat; R_{1} = 10 kΩ FG1’in TTL ucundan baza (1 Hz kare dalga). Oynat’a bas; LED1’in ve Q1’in akımlarını Şekil-24’tekilerle karşılaştır.',
        answer:
          'Bu kez LED giriş 5 V’tayken yanar, 0 V’ta söner: LED transistörle seri, transistör iletince LED’den akım geçer. Ama LED sönük yanar: ≈ 2,55 mA, Şekil-24’teki ≈ 10,22 mA’in dörtte biri kadar. Transistör doyuma girmez, aktif bölgede kalır (V_{CE} ≈ 7,78 V): emetör bazı ≈ 0,66 V geriden izler (emetör izleyici) ve bazın gerilimi girişin 5 V’unu geçemez. Emetör ≈ 4,22 V’ta; akım I ≈ (4,22 V − 1,68 V) / 1 kΩ ≈ 2,55 mA (1,68 V LED’in gerilimi). Baz akımı yalnızca ≈ 12 µA (I_{C} / β). LED’in akımını artırmak için R_{2} küçültülür. Giriş 0 V’ta transistör kesimdedir ve LED’den akım geçmez.',
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
  return n === null ? null : LAB_EXPERIMENT_TEXTS[n].aim;
}
