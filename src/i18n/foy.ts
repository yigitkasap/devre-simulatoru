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
