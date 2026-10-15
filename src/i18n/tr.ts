// Arayüzdeki TÜM metinler. Dil şimdilik yalnızca Türkçe.
//
// Yazım notları:
//   - Fizik terimleri: "gerilim" (voltaj değil), "akım", "iç direnç", "toprak", "kısa devre", "ön direnç".
//   - Bileşen adlarına (R1, B1...) ek, okunuşa göre i18n/ek.ts ile getirilir (R1’in, R2’nin, R6’yı);
//     uzun cümlelerde "R1 direncinin", "B1 pilinin" gibi yapılar da kullanılır.
//   - Sayılar src/sim/units.ts ile Türkçe biçimde (4,7 kΩ) yazılır.
//   - Formüllerdeki alt simgeler `_{...}` ile işaretlenir (R_{iç}); ekranda editor/Rich.tsx
//     bunları gerçek alt simge (<sub>) olarak çizer.

import { SITE_NAME } from '../config';
import type { Diagnostic } from '../sim/diagnostics';
import type { ExampleGroupId, ExampleId } from '../examples';
import type { DeviceType } from '../sim/netlist';
import { formatSI } from '../sim/units';
import { ek, toDative } from './ek';

export interface DiagnosticContext {
  /** Bileşenin tuvaldeki adı (R1, B2...). */
  label(id: string): string;
  /** Bileşenin türü. */
  type(id: string): DeviceType | undefined;
}

const DEVICE_NAMES: Record<DeviceType, string> = {
  battery: 'Pil',
  acsource: 'AC kaynak',
  funcgen: 'Fonksiyon üreteci',
  dcsupply: 'DC güç kaynağı',
  ground: 'Toprak',
  resistor: 'Direnç',
  capacitor: 'Kondansatör',
  diode: 'Diyot',
  zener: 'Zener diyot',
  led: 'LED',
  npn: 'NPN transistör',
  pnp: 'PNP transistör',
  njfet: 'N kanallı JFET',
  pjfet: 'P kanallı JFET',
  nmos: 'N kanallı MOSFET',
  pmos: 'P kanallı MOSFET',
  switch: 'Anahtar',
  voltmeter: 'Voltmetre',
  ammeter: 'Ampermetre',
  oscilloscope: 'Osiloskop',
};

/** "R1 direnci", "B1 pili" gibi tamlamalar için tür adının küçük harfli, belirtme durumlu hali. */
const DEVICE_GENITIVE: Record<DeviceType, string> = {
  battery: 'pilinin',
  acsource: 'AC kaynağının',
  funcgen: 'fonksiyon üretecinin',
  dcsupply: 'güç kaynağının',
  ground: 'toprak sembolünün',
  resistor: 'direncinin',
  capacitor: 'kondansatörünün',
  diode: 'diyotunun',
  zener: 'zener diyotunun',
  led: 'LED’inin',
  npn: 'transistörünün',
  pnp: 'transistörünün',
  njfet: 'JFET’inin',
  pjfet: 'JFET’inin',
  nmos: 'MOSFET’inin',
  pmos: 'MOSFET’inin',
  switch: 'anahtarının',
  voltmeter: 'voltmetresinin',
  ammeter: 'ampermetresinin',
  oscilloscope: 'osiloskobunun',
};

const PIN_NAMES: Record<DeviceType, readonly string[]> = {
  battery: ['+ ucu', '− ucu'],
  acsource: ['+ ucu', '− ucu'],
  funcgen: ['çıkış (OUT) ucu', 'TTL darbe çıkışı', 'ortak ucu (COM)'],
  dcsupply: ['1. çıkışının + ucu', '1. çıkışının − ucu', '2. çıkışının + ucu', '2. çıkışının − ucu'],
  ground: ['ucu'],
  resistor: ['1. ucu', '2. ucu'],
  capacitor: ['+ ucu', '− ucu'],
  diode: ['anot ucu', 'katot ucu'],
  zener: ['anot ucu', 'katot ucu'],
  led: ['anot ucu', 'katot ucu'],
  npn: ['kollektör (C) ucu', 'baz (B) ucu', 'emetör (E) ucu'],
  pnp: ['kollektör (C) ucu', 'baz (B) ucu', 'emetör (E) ucu'],
  njfet: ['drain (D) ucu', 'gate (G) ucu', 'source (S) ucu'],
  pjfet: ['drain (D) ucu', 'gate (G) ucu', 'source (S) ucu'],
  nmos: ['drain (D) ucu', 'gate (G) ucu', 'source (S) ucu'],
  pmos: ['drain (D) ucu', 'gate (G) ucu', 'source (S) ucu'],
  switch: ['1. ucu', '2. ucu'],
  voltmeter: ['+ ucu', '− ucu'],
  ammeter: ['+ ucu', '− ucu'],
  oscilloscope: ['A kanalı', 'B kanalı', 'ortak ucu (COM)'],
};

/** Bağla kipinde uç hedeflerinin üstündeki kısa etiketler (tasarım: P03). */
const PIN_TAGS: Record<DeviceType, readonly string[]> = {
  battery: ['+', '−'],
  acsource: ['+', '−'],
  funcgen: ['OUT', 'TTL', 'COM'],
  dcsupply: ['1+', '1−', '2+', '2−'],
  ground: ['⏚'],
  resistor: ['1', '2'],
  capacitor: ['+', '−'],
  diode: ['A', 'K'],
  zener: ['A', 'K'],
  led: ['A', 'K'],
  npn: ['C', 'B', 'E'],
  pnp: ['C', 'B', 'E'],
  njfet: ['D', 'G', 'S'],
  pjfet: ['D', 'G', 'S'],
  nmos: ['D', 'G', 'S'],
  pmos: ['D', 'G', 'S'],
  switch: ['1', '2'],
  voltmeter: ['+', '−'],
  ammeter: ['+', '−'],
  oscilloscope: ['A', 'B', 'COM'],
};

/** Uçların yalın adları ("Başlangıç: R1 · 2. uç"). */
const PIN_SHORT: Record<DeviceType, readonly string[]> = {
  battery: ['+ uç', '− uç'],
  acsource: ['+ uç', '− uç'],
  funcgen: ['OUT', 'TTL', 'COM'],
  dcsupply: ['1+', '1−', '2+', '2−'],
  ground: ['uç'],
  resistor: ['1. uç', '2. uç'],
  capacitor: ['+ uç', '− uç'],
  diode: ['anot', 'katot'],
  zener: ['anot', 'katot'],
  led: ['anot', 'katot'],
  npn: ['kollektör', 'baz', 'emetör'],
  pnp: ['kollektör', 'baz', 'emetör'],
  njfet: ['drain', 'gate', 'source'],
  pjfet: ['drain', 'gate', 'source'],
  nmos: ['drain', 'gate', 'source'],
  pmos: ['drain', 'gate', 'source'],
  switch: ['1. uç', '2. uç'],
  voltmeter: ['+ uç', '− uç'],
  ammeter: ['+ uç', '− uç'],
  oscilloscope: ['A girişi', 'B girişi', 'COM'],
};

function list(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} ve ${labels[labels.length - 1]}`;
}

function describeDiagnostic(d: Diagnostic, ctx: DiagnosticContext): { title: string; detail: string } {
  const labels = d.elementIds.map((id) => ctx.label(id));
  const first = d.elementIds[0];
  const firstLabel = labels[0] ?? '';
  const p = d.params ?? {};
  switch (d.code) {
    case 'no-ground':
      return {
        title: 'Devrede toprak yok',
        detail: 'Devrede toprak (0 V referansı) yok. Bir toprak sembolü ekleyip devreye bağla.',
      };
    case 'ground-unconnected':
      return {
        title: 'Toprak bağlı değil',
        detail: 'Toprak sembolü devreye bağlı değil. Toprağın ucunu bir kabloyla devreye bağla.',
      };
    case 'voltage-loop':
      return {
        title: 'Direnç içermeyen döngü',
        detail:
          d.elementIds.length === 1
            ? `${firstLabel} kaynağının iki ucu doğrudan kabloyla birleştirilmiş ve iç direnci yok. ` +
              'Akımı sınırlayan hiçbir şey olmadığı için devre çözülemez. Pile iç direnç ver ya da araya bir direnç ekle.'
            : `${list(labels)} yalnızca ideal kaynaklar ve kablolardan oluşan, hiç direnç içermeyen bir döngü kuruyor. ` +
              'Böyle bir döngüde gerilimler çelişir ya da akım belirsiz kalır; devre çözülemez. ' +
              'Kaynaklardan birine iç direnç ver ya da döngüye bir direnç ekle.',
      };
    case 'floating-pin': {
      const type = first ? ctx.type(first) : undefined;
      const owner = type ? `${firstLabel} ${DEVICE_GENITIVE[type]}` : firstLabel;
      const pin = type && d.pin !== undefined ? (PIN_NAMES[type][d.pin] ?? 'bir ucu') : 'bir ucu';
      return { title: 'Boşta uç', detail: `${owner} ${pin} hiçbir yere bağlı değil.` };
    }
    case 'floating-island':
      return {
        title: 'Toprağa bağlı olmayan parça',
        detail: `${list(labels)} toprağa bağlı değil. Bu parçadaki gerilimler belirsizdir; parçayı bir kabloyla toprağa bağla.`,
      };
    case 'ammeter-parallel': {
      const source = d.elementIds[1] && ctx.type(d.elementIds[1]) === 'acsource' ? 'AC kaynağının' : 'pilinin';
      return {
        title: 'Ampermetre paralel bağlanmış',
        detail:
          `${labels[0] ?? ''} ampermetresi doğrudan ${labels[1] ?? ''} ${source} iki ucuna bağlanmış. ` +
          'Ampermetre seri bağlanır; iç direnci çok küçük olduğu için paralel bağlanınca kısa devre olur.',
      };
    }
    case 'short-circuit': {
      const r = p.internalResistance ?? 0;
      const ac = first !== undefined && ctx.type(first) === 'acsource';
      return {
        title: 'Kısa devre',
        detail:
          (ac
            ? `${firstLabel} AC kaynağından tepe değeri ${formatSI(p.current ?? 0, 'A')} olan bir akım çekiliyor. `
            : `${firstLabel} pilinden ${formatSI(p.current ?? 0, 'A')} akım çekiliyor. `) +
          (r > 0
            ? `Dış devrenin direnci ${ac ? 'kaynağın' : 'pilin'} iç direncinden (${formatSI(r, 'Ω', { trim: true })}) küçük. `
            : 'Dış devrenin direnci neredeyse sıfır. ') +
          (ac ? 'Gerçek bir kaynak bu durumda aşırı ısınır ya da sigortası atar.' : 'Gerçek bir pil bu durumda hızla ısınır ve boşalır.'),
      };
    }
    case 'led-burned':
      return {
        title: 'LED yandı',
        detail:
          `${firstLabel}: LED’den ${formatSI(p.current ?? 0, 'A')} geçti, ama bu LED en fazla ` +
          `${formatSI(p.maxCurrent ?? 0, 'A', { trim: true })}’e dayanabilir. ` +
          'Seri bir ön direnç ekle: R = (V_{kaynak} − V_{f}) / I. ' +
          `(Bu LED için V_{f} ≈ ${formatSI(p.forwardVoltage ?? 0, 'V', { trim: true })}, I için 20 mA seçebilirsin.)`,
      };
    case 'nr-failed':
      return {
        title: 'Çözüm yakınsamadı',
        detail:
          'Newton-Raphson yöntemi en küçük zaman adımında (1 ns) da yakınsamadı. ' +
          (labels.length > 0 ? `Sorun çıkaran bileşenler: ${list(labels)}. ` : '') +
          'Bu bileşenlerin bağlantılarını ve değerlerini kontrol et.',
      };
    case 'singular-matrix':
      return {
        title: 'Devre denklemleri çözülemedi',
        detail:
          'Denklem sisteminin matrisi tekil çıktı (sıfır pivot). Genellikle şu durumlarda olur: ideal kaynaklar birbirine ' +
          'doğrudan bağlanmıştır, ya da çok küçük ve çok büyük değerler (ör. 1 nΩ ile 1 GΩ) aynı devrede kullanılmıştır. ' +
          (labels.length > 0 ? `İlgili bileşenler: ${list(labels)}.` : ''),
      };
  }
}

const DEVICE_DESCRIPTIONS: Record<DeviceType, string> = {
  battery: 'Uçları arasında sabit bir gerilim tutan doğru akım kaynağı; iç direnci ayarlanabilir.',
  acsource:
    'Yönü zamanla değişen gerilim üreten alternatif akım kaynağı: sinüs, kare ya da üçgen dalga; tepe gerilimi ve frekansı ayarlanır.',
  funcgen:
    'Laboratuvardaki fonksiyon üreteci (GFG-8015G benzeri): sinüs, kare, üçgen; 0,2 Hz – 2 MHz, genlik, DC offset, simetri, −20 dB, 50 Ω çıkış, TTL darbe çıkışı. COM ucu şebeke toprağına bağlıdır.',
  dcsupply:
    'İki çıkışlı laboratuvar DC güç kaynağı: her çıkışın gerilimi (0–30 V) ve akım sınırı ayarlanır; çıkışlar topraktan yalıtılmıştır, seri bağlanabilir.',
  ground: 'Devrenin 0 V referans noktası; her devrede en az bir tane olmalı.',
  resistor: 'Üzerinden geçen akımla orantılı bir gerilim düşümü oluşturur: V = I · R.',
  capacitor: 'Yük depolar; bir direnç üzerinden zamanla dolar ya da boşalır.',
  diode: 'Akımı yalnızca bir yönde, anottan katoda geçirir; ileri yönde yaklaşık 0,6 V düşürür. Föydeki 1N4001 olarak gelir.',
  zener: 'Ters yönde, kırılma (zener) geriliminde iletime geçen diyot; gerilimi sınırlamak ve kırpmak için kullanılır.',
  led: 'Işık yayan diyot; fazla akım geçerse yanar, bu yüzden seri bir ön direnç gerekir.',
  npn: 'Küçük bir baz akımıyla büyük kollektör akımını kontrol eder (IC = β · IB); yükselteç ve anahtar olarak kullanılır. Föydeki BC107 olarak gelir.',
  pnp: 'NPN’in ters kutuplusu: akım emetörden girer, kollektörden çıkar; baz emetörden düşük gerilimde olunca iletir.',
  njfet: 'Drain akımını kapı-kaynak gerilimi (VGS) kontrol eder; kapı neredeyse akım çekmez. VGS = 0’da en büyük akım (IDSS) akar. Föydeki BF245A olarak gelir.',
  pjfet: 'N kanallı JFET’in ters kutuplusu: kapıya pozitif gerilim verildikçe akım azalır.',
  nmos: 'Kapısı yalıtılmış alan etkili transistör; VGS eşik gerilimini (VT) aşınca iletime geçer. Anahtar ve yükselteç olarak kullanılır. Föydeki IRF510 olarak gelir.',
  pmos: 'P kanallı MOSFET: kapı kaynaktan yeterince düşük olunca (VGS < VT < 0) iletime geçer.',
  switch: 'Devreyi açar ya da kapatır; simülasyon sırasında üzerine tıklayarak değiştirilir.',
  voltmeter: 'İki nokta arasındaki gerilimi ölçer; ölçülen parçaya paralel bağlanır.',
  ammeter: 'İçinden geçen akımı ölçer; devreye seri bağlanır.',
  oscilloscope:
    'Gerilimin zamanla nasıl değiştiğini çizer; iki kanal (A, B) ortak uca göre, DC/AC/GND kuplaj, ADD, INV ve X-Y. Girişi 1 MΩ, COM ucu şebeke toprağına bağlıdır.',
};

/** Özellik penceresindeki alan adları (tür + özellik anahtarı). */
function fieldLabel(type: DeviceType, key: string): string {
  if ((type === 'voltmeter' || type === 'ammeter') && key === 'resistance') return 'İç direnç';
  if (type === 'voltmeter' && key === 'ideal') return 'İdeal voltmetre (iç direnç ∞)';
  if (type === 'ammeter' && key === 'ideal') return 'İdeal ampermetre (iç direnç 0 Ω)';
  if (type === 'funcgen' && key === 'amplitude') return 'Genlik (tepe-tepe, açık devre)';
  if (type === 'funcgen' && key === 'offset') return 'DC offset (açık devre)';
  const labels: Record<string, string> = {
    model: 'Model',
    mode: 'Ölçüm kipi',
    duty: 'Simetri (DUTY)',
    attenuate: '−20 dB zayıflatıcı (çıkış 10’da 1)',
    earthed: 'COM şebeke toprağına bağlı (gerçek cihazdaki gibi)',
    input: 'Giriş',
    voltage1: '1. çıkış gerilimi',
    currentLimit1: '1. çıkış akım sınırı',
    voltage2: '2. çıkış gerilimi',
    currentLimit2: '2. çıkış akım sınırı',
    beta: 'Akım kazancı β (hFE)',
    idss: 'Doyma akımı IDSS (VGS = 0)',
    pinchOff: 'Kısılma gerilimi VP',
    threshold: 'Eşik gerilimi VT',
    k: 'İletkenlik katsayısı k',
    zenerVoltage: 'Zener gerilimi (20 mA’de)',
    waveform: 'Dalga biçimi',
    amplitude: 'Tepe gerilimi',
    frequency: 'Frekans',
    offset: 'DC kayma',
    voltage: 'Gerilim',
    internalResistance: 'İç direnç',
    resistance: 'Direnç',
    capacitance: 'Kapasite',
    initialVoltage: 'Başlangıç gerilimi',
    color: 'Renk',
    closed: 'Anahtar kapalı (akım geçirir)',
  };
  return labels[key] ?? key;
}

/** Seçmeli özelliklerin seçenek adları. */
const OPTION_LABELS: Record<string, Record<string, string>> = {
  color: { red: 'Kırmızı', green: 'Yeşil', blue: 'Mavi' },
  waveform: { sine: 'Sinüs', square: 'Kare', triangle: 'Üçgen' },
  mode: { dc: 'DC (ortalama)', ac: 'AC (etkin değer)' },
  input: { real: '1 MΩ ‖ 25 pF (gerçek)', ideal: 'İdeal (akım çekmez)' },
  model: {
    genel: 'Genel (basit)',
    BC547B: 'BC547B (basit)',
    '2N5457': '2N5457 (basit)',
    '2N7000': '2N7000 (basit)',
  },
};

function optionLabel(key: string, option: string): string {
  return OPTION_LABELS[key]?.[option] ?? option;
}

export interface ExampleTexts {
  readonly title: string;
  /** Devrenin kurulumu (cevabı vermeden). */
  readonly description: string;
  /** Simülasyonu başlatmadan önce öğrencinin tahmin etmesi için soru. */
  readonly question: string;
  /** Simülasyon çalıştırılınca gösterilen cevap ve deneme önerisi. */
  readonly answer: string;
}

const EXAMPLES: Record<ExampleId, ExampleTexts> = {
  'led-on-direnc': {
    title: 'LED ve ön direnç',
    description:
      'İdeal 5 V’luk pil, 330 Ω’luk ön direnç ve kırmızı bir LED seri bağlı; ampermetre devreden geçen akımı ölçüyor. Ön direnç, LED’den geçen akımı sınırlar.',
    question: 'Ampermetre kaç mA gösterir? LED’in üzerinde yaklaşık 1,8 V düştüğünü düşünerek önce hesapla, sonra Oynat’a bas.',
    answer:
      'Yaklaşık 9,7 mA: I = (5 V − 1,8 V) / 330 Ω. Ön direnci 100 Ω’a düşürürsen akım 30 mA’i aşar ve LED yanar; dene ve açıklamayı oku.',
  },
  'gerilim-bolucu': {
    title: 'Gerilim bölücü',
    description:
      'İki eşit direnç (1 kΩ + 1 kΩ) ideal 9 V’luk bir pile seri bağlı. Voltmetre, dirençlerin birleştiği orta noktanın gerilimini ölçüyor.',
    question: 'Voltmetre kaç volt gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      '4,5 V: V_{çıkış} = V · R_{2} / (R_{1} + R_{2}) = 9 V · 1 kΩ / 2 kΩ. Dirençlerden birinin değerini değiştirip çıkış geriliminin nasıl değiştiğine bak.',
  },
  'voltmetre-yukleme': {
    title: 'Voltmetrenin yükleme etkisi',
    description:
      '12 V’luk ideal kaynağa seri bağlı 200 kΩ’luk direnç, iç direnci büyük bir sensörü temsil ediyor. Çıkışı iç direnci 1 MΩ olan bir voltmetreyle ölçüyoruz.',
    question: 'Voltmetre kaç volt gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      'Voltmetre 12 V yerine 10 V gösterir: voltmetre de devrenin bir parçasıdır ve 200 kΩ ile bir gerilim bölücü kurar, V = 12 V · R_{V} / (200 kΩ + R_{V}) = 10 V. Voltmetrenin iç direncini 20 MΩ’a çıkarıp farkı gör.',
  },
  'ampermetre-etkisi': {
    title: 'Ampermetrenin etkisi',
    description: '12 V’luk ideal kaynak, 100 Ω’luk direnç ve seri bağlı, iç direnci 1 Ω olan bir ampermetre.',
    question: 'Ampermetre kaç mA gösterir? Önce hesapla, sonra Oynat’a bas.',
    answer:
      'Ampermetre 120 mA yerine 118,8 mA gösterir: ampermetrenin iç direnci de akıma karşı koyar, I = 12 V / (100 Ω + R_{A}) = 12 V / 101 Ω. İdeal ampermetreye geçip farkı gör.',
  },
  'rc-dolma': {
    title: 'RC dolma',
    description:
      '10 V’luk pil, anahtar, 1 kΩ’luk direnç ve 100 µF’lık kondansatör seri bağlı; voltmetre kondansatörün gerilimini ölçüyor. Zaman sabiti τ = R · C = 0,1 s; t = τ anında kondansatör yaklaşık %63 dolar.',
    question:
      'Anahtarı kapattıktan 0,1 s sonra voltmetre kaç volt gösterir? Önce hesapla; sonra hızı ×0,1’e çek, Oynat’a bas ve anahtara tıkla.',
    answer:
      'Yaklaşık 6,3 V: V = 10 V · (1 − e⁻¹), yani 10 V’un %63’ü. 5τ = 0,5 s sonra kondansatör neredeyse tamamen dolar (≈ 9,9 V). Anahtarı açınca kondansatör yükünü korur; yalnızca voltmetrenin 10 MΩ’luk iç direnci üzerinden çok yavaş boşalır.',
  },
  'diyot-yonu': {
    title: 'Diyot yönü',
    description: 'İdeal 5 V’luk pil, 1 kΩ’luk direnç, ileri yönde bağlı bir silisyum diyot ve seri bir ampermetre.',
    question:
      'Ampermetre kaç mA gösterir? Diyotun üzerinde yaklaşık 0,65 V düştüğünü düşünerek önce hesapla, sonra Oynat’a bas.',
    answer:
      'Yaklaşık 4,35 mA: I = (5 V − 0,65 V) / 1 kΩ. Şimdi diyotu seçip F’ye bas (ya da sağ tıklayıp “Ters çevir”i seç) ve yeniden Oynat’a bas: akım neredeyse sıfıra düşer, çünkü ters yönde diyot yalnızca çok küçük bir sızıntı akımı geçirir.',
  },
  'rc-kare-dalga': {
    title: 'Kare dalga ile RC',
    description:
      'AC kaynak 0 V ile 10 V arasında gidip gelen 1 Hz’lik kare dalga veriyor (5 V tepe + 5 V DC kayma). 1 kΩ’luk direnç üzerinden 100 µF’lık kondansatör dolup boşalıyor; A kanalı kaynağı, B kanalı kondansatörün gerilimini gösteriyor. Zaman sabiti τ = R · C = 0,1 s.',
    question:
      'Kare dalganın her yarım periyodu (0,5 s) kaç τ eder? B kanalındaki eğri yarım periyodun sonunda kaç volta ulaşır? Önce tahmin et, sonra Oynat’a bas.',
    answer:
      'Yarım periyot 5τ’dur: kondansatör her yarım periyotta ≈ %99,3 dolar (≈ 9,93 V) ve sonraki yarıda neredeyse tamamen boşalır. B kanalı üstel dolma ve boşalma eğrilerini çizer. Kaynağın frekansını 5 Hz’e çıkar (yarım periyot = τ): kondansatör artık tam dolup boşalamaz, eğri 10 V ile 0 V’a hiç ulaşmaz.',
  },
  'toprak-tuzagi': {
    title: 'Toprak tuzağı: köprüde prob toprağı',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe) dört diyotlu bir köprüyü besliyor; yük 100 kΩ. Osiloskobun A ucu yükün + ucunda, prob toprağı (COM) yükün − ucunda. Laboratuvardaki gibi hem üretecin hem osiloskobun COM ucu şebeke toprağına bağlı.',
    question: 'Osiloskopta tam dalga mı, yarım dalga mı görürsün? Neden? Önce tahmin et, sonra Oynat’a bas.',
    answer:
      'Yarım dalga! İki cihazın COM ucu şebeke toprağı üzerinden birbirine bağlıdır. Prob toprağı yükün − ucuna takılınca D4 kısa devre olur; negatif yarıda üretecin çıkışı D3 üzerinden toprağa kısa devre olur ve yükten akım geçmez. Doğru ölçüm: COM’u üretecin COM’una (sağdaki düğüm) taşı, A’yı yükün + ucuna, B’yi − ucuna bağla; panelde B ters (INV) ve A + B (ADD) seç: ekranda A − B, yani yükün gerilimi (tam dalga, tepe ≈ 3,6 V) görünür. Osiloskobun özelliklerinden toprak bağlantısını kaldırmak (yalıtılmış osiloskop) da sorunu çözer.',
  },
  'diyot-dc': {
    title: '1N4001: doğru akımda akım-gerilim ölçümü',
    description:
      'Laboratuvar güç kaynağının 1. çıkışı (5 V), 1 kΩ’luk direnç üzerinden bir 1N4001 diyodunu ileri yönde besliyor. Ampermetre devreden geçen akımı, voltmetre diyodun gerilimini ölçüyor.',
    question:
      'Diyodun gerilimi ve devreden geçen akım kaç olur? Diyot gerilimini ≈ 0,6 V alarak akımı hesapla, sonra Oynat’a bas.',
    answer:
      'V_{D} ≈ 0,56 V, I ≈ 4,4 mA: I = (5 V − 0,56 V) / 1 kΩ. Kaynağın gerilimini değiştirip föydeki tabloyu doldur: 0,5 V’ta I ≈ 0,13 mA (V_{D} ≈ 0,37 V), 1 V’ta ≈ 0,55 mA (0,45 V), 2 V’ta ≈ 1,5 mA (0,50 V), 10 V’ta ≈ 9,4 mA (0,60 V). Akım on kat artınca diyodun gerilimi yalnızca ≈ 0,12 V artar: karakteristik üsteldir. Diyodu ters çevirince (F) akım 1 µA’in altına düşer.',
  },
  'diyot-karakteristigi': {
    title: '1N4001: X-Y’de akım-gerilim eğrisi',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe sinüs), 1 kΩ’luk direnç ile 1N4001’i seri besliyor. Osiloskop X-Y kipinde; COM ucu diyot ile direncin birleştiği noktada. A (yatay, 1 V/bölme) diyodun gerilimini, ters çevrilmiş B (dikey, 1 V/bölme = 1 mA) direncin gerilimini yani akımı gösteriyor. İki cihazın COM’u farklı noktalarda olduğu için üreteç topraktan yalıtılmış (COM’u şebeke toprağına bağlı değil).',
    question:
      'Eğri hangi gerilimden sonra dikleşir, en büyük akım kaç mA olur? Sonra üretecin frekansını 10 kHz, 100 kHz ve 1 MHz yap: eğri nasıl değişir?',
    answer:
      'Akım ≈ 0,4 V’tan sonra belirginleşir; en büyük akım ≈ 4,2 mA, o anda V_{D} ≈ 0,56 V: I = (5 V − 0,56 V) / (1 kΩ + 50 Ω). Ters yönde akım yok denecek kadar azdır. Frekans artınca 1N4001’in ileri yönde depoladığı yük, diyot ters kutuplanınca bir süre ters akım geçirir (ters toparlanma): 10 kHz’te ≈ −1,3 mA, 100 kHz’te ≈ −4,8 mA’lik ters akım görünür ve eğri ilmek açar. 1 MHz’te diyot artık doğrultmaz. Osiloskobun hızını Oto ile ayarla. Üretecin COM’unu şebeke toprağına bağlarsan (özelliklerinden) direnç iki toprak arasında kısa devre olur: B sıfır çizgisinde kalır ve diyottan ≈ 86 mA geçer.',
  },
  'zener-karakteristigi': {
    title: 'Zener diyot (5,6 V): X-Y’de karakteristik',
    description:
      'Aynı düzenek; diyodun yerinde 5,6 V’luk bir zener (1N4734A gibi), üreteç 20 V tepe-tepe. A 2 V/bölme, B 1 V/bölme = 1 mA. Föy zenerin değerini vermiyor: laboratuvardaki zenerin değeri farklıysa özelliklerinden değiştir.',
    question:
      'Ters yönde zener hangi gerilimde iletime geçer, o anda kaç mA geçer? İleri yönde eğri sıradan bir diyottan farklı mı?',
    answer:
      'Ters yönde ≈ −5,4 V’ta kırılır; en büyük ters akım ≈ 4,4 mA: I = (10 V − 5,4 V) / 1,05 kΩ. V_{Z} 20 mA için tanımlıdır; birkaç mA’de biraz daha düşüktür. İleri yönde sıradan bir diyot gibi ≈ 0,7 V’ta iletir (en büyük akım ≈ 8,9 mA). Zener gerilimini 3,3 V ya da 9,1 V yapıp kırılmanın nasıl kaydığına bak: 9,1 V’ta ±10 V’luk sinüs kırılmayı ancak gösterir (≈ 0,9 mA).',
  },
  'led-karakteristigi': {
    title: 'LED: X-Y’de karakteristik',
    description:
      'Aynı düzenek; diyodun yerinde kırmızı bir LED, üreteç 10 V tepe-tepe. A 1 V/bölme, B 1 V/bölme = 1 mA.',
    question:
      'LED hangi gerilimde iletime geçer, en büyük akım kaç mA olur? 1N4001 ile karşılaştır.',
    answer:
      'Kırmızı LED ≈ 1,5–1,7 V’ta iletir; en büyük akım ≈ 3,1 mA, o anda V_{F} ≈ 1,69 V. Eşik, silisyum diyodun yaklaşık üç katıdır çünkü LED’in yarı iletkeninin yasak enerji aralığı daha büyüktür. LED’in rengini yeşil ya da mavi yapıp eşiğin nasıl kaydığına bak. Ters yönde akım geçmez; gerçek LED’ler ≈ 5 V’tan büyük ters gerilime dayanamaz.',
  },
  'yarim-dalga': {
    title: 'Yarım dalga doğrultmaç',
    description:
      'Fonksiyon üreteci (50 Hz, 20 V tepe-tepe sinüs) bir 1N4001 üzerinden 1 kΩ’luk yükü besliyor. S1, S2 ve S3 anahtarları yüke 1 µF, 22 µF ve 470 µF’lık filtre kondansatörlerini bağlar. Osiloskobun A kanalı girişi, B kanalı yükün gerilimini gösteriyor; voltmetre yükün DC (ortalama) gerilimini ölçüyor.',
    question:
      'Filtresiz durumda yükteki tepe gerilim ve voltmetrenin gösterdiği ortalama kaç olur? Sonra anahtarları sırayla kapat: dalgalanma nasıl değişir?',
    answer:
      'Filtresiz tepe ≈ 9,0 V (üretecin 50 Ω’unda ve diyotta ≈ 1 V düşer), ortalama ≈ 2,8 V ≈ V_{tepe} / π. 1 µF’ta (RC = 1 ms, periyot 20 ms) neredeyse fark yoktur. 22 µF’ta (RC = 22 ms) çıkış ≈ 4,2 V ile 8,5 V arasında dalgalanır, ortalama ≈ 6,2 V. 470 µF’ta dalgalanma ≈ 0,2 V’a iner, ortalama ≈ 7,0 V. Peki tepe neden ≈ 7,1 V’a düştü? Kondansatör her periyotta kısa bir anda dolar; bu büyük akım üretecin 50 Ω’luk çıkış direncinde gerilim düşürür (A kanalının tepesine bak). Diyodu ters çevirirsen (F) negatif yarılar geçer.',
  },
  'kopru-dogrultmac': {
    title: 'Köprü tipi tam dalga doğrultmaç',
    description:
      'Dört 1N4001’lik köprü, fonksiyon üretecinden (50 Hz, 20 V tepe-tepe) 100 kΩ’luk yükü besliyor. Yükün iki ucu da topraktan farklı gerilimde olduğu için osiloskop yükü iki kanalla ölçüyor: A yükün + ucunda, B − ucunda; B ters çevrilmiş ve ADD açık (ekranda A − B). Prob toprağı toprakta, yani üretecin COM’uyla aynı noktada (ikisi de şebeke toprağına bağlı).',
    question:
      'Yükün tepe gerilimi kaç volt olur, çıkışın frekansı kaç Hz’dir? Prob toprağını yükün − ucuna takarsan ne olur?',
    answer:
      'Tepe ≈ 9,3 V: her yarım periyotta iki diyot iletir. 100 kΩ’da akım küçük olduğundan her 1N4001’de yalnızca ≈ 0,35 V düşer. Çıkış her yarım periyotta tekrarlar: 100 Hz. Prob toprağını yükün − ucuna takarsan bu nokta şebeke toprağı üzerinden üretecin COM’uyla birleşir ve bir diyodu kısa devre eder: ekranda tam dalga yerine yarım dalga görülür (Laboratuvar cihazları grubundaki “Toprak tuzağı” örneği).',
  },
  'negatif-kenetleyici': {
    title: 'Negatif kenetleyici',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe sinüs), 2,2 µF’lık kondansatör üzerinden 10 kΩ’luk yüke bağlı; 1N4001 yüke paralel, anodu çıkışta. Osiloskobun A kanalı girişi, B kanalı çıkışı gösteriyor (ikisi de DC kuplaj, 5 V/bölme).',
    question:
      'Çıkışın en büyük ve en küçük değeri ne olur? Tepe-tepe değeri değişir mi?',
    answer:
      'Çıkış ≈ +0,56 V ile ≈ −9,1 V arasında salınır. Kondansatör pozitif tepede ≈ 4,4 V’a dolar ve bütün dalgayı aşağı kaydırır; dalganın biçimi ve tepe-tepe değeri (≈ 9,6 V) neredeyse aynı kalır. RC = 22 ms periyottan (1 ms) çok büyük olduğu için kondansatör bir periyotta pek boşalmaz. Üreteci kare dalgaya al: çıkış ≈ +0,5 V ile −9,5 V arasında olur. B kanalını AC kuplaja alırsan kayma kaybolur; kenetlemeyi görmek için DC kuplaj gerekir.',
  },
  'pozitif-kenetleyici': {
    title: 'Pozitif kenetleyici',
    description:
      'Negatif kenetleyicinin aynısı; yalnızca 1N4001 ters bağlı, katodu çıkışta. Üreteç 1 kHz, 10 V tepe-tepe sinüs; C = 2,2 µF, yük 10 kΩ.',
    question:
      'Çıkış hangi gerilimler arasında salınır?',
    answer:
      'Çıkış ≈ −0,56 V ile ≈ +9,1 V arasında salınır: dalga yukarı kayar, en alt noktası diyot gerilimi kadar sıfırın altındadır. Kare dalgada ≈ −0,5 V ile +9,5 V. Diyoda seri bir DC kaynak eklersen kenetleme seviyesi o kadar kayar (öngerilimli kenetleyici).',
  },
  'gerilim-katlayici': {
    title: 'Gerilim katlayıcı (ikileyici)',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe yani 5 V tepe sinüs), iki 1N4001 ve iki 10 µF’lık kondansatörden oluşan yarım dalga gerilim ikileyiciyi besliyor. C1 ile D1 bir kenetleyici, D2 ile C2 bir tepe dedektörüdür. Osiloskobun A kanalı girişi, B kanalı çıkışı (C2) gösteriyor.',
    question:
      'Çıkıştaki DC gerilim kaç volt olur? Kaç milisaniyede dolar?',
    answer:
      'Çıkış ≈ 9,1 V ≈ 2 · 5 V − 2 · V_{D}: D1 girişi yukarı kenetler (≈ 0 ile 9,5 V arası), D2 bu dalganın tepesini C2’ye yükler. C2 ilk 5 ms’de ≈ 4,9 V’a, 50 ms’de ≈ 8,7 V’a ulaşır. Çıkışa bir yük direnci (ör. 10 kΩ) bağla: gerilim düşer ve dalgalanmaya başlar.',
  },
  'paralel-kirpici': {
    title: 'Öngerilimli paralel kırpıcı (4 V)',
    description:
      'Fonksiyon üreteci (1 kHz, 20 V tepe-tepe sinüs) 10 kΩ üzerinden çıkışa bağlı. 1N4001’in anodu çıkışta, katodu DC güç kaynağının 4 V’luk 1. çıkışında. Osiloskobun A kanalı girişi, B kanalı çıkışı gösteriyor.',
    question:
      'Çıkış hangi gerilimde kırpılır? Negatif yarı nasıl görünür?',
    answer:
      'Pozitif tepeler ≈ 4,45 V’ta kırpılır: 4 V + V_{D} (akım ≈ 0,55 mA olduğundan V_{D} ≈ 0,45 V). Negatif yarı olduğu gibi geçer (≈ −9,9 V). Föydeki öbür kırpıcıları bu devreden kurabilirsin. Diyodu ters çevirirsen (F) çıkış ≈ 3,55 V’un altına inemez. Kaynağı 3 V ya da 2 V yaparsan kırpma seviyesi o kadar kayar. Kaynağın uçlarını değiştirirsen seviye negatife geçer.',
  },
  'cift-kirpici': {
    title: 'Çift yönlü kırpıcı (3 V ve 2 V)',
    description:
      'Fonksiyon üreteci (1 kHz, 20 V tepe-tepe sinüs), 10 kΩ’luk seri direnç ve iki 1N4001. D1’in katodu DC güç kaynağının 3 V’luk 1. çıkışında. D2’nin anodu 2. çıkışın − ucunda; bu çıkışın + ucu toprakta, yani D2’nin anodu −2 V’ta.',
    question:
      'Çıkış hangi iki gerilim arasında kalır?',
    answer:
      'Çıkış ≈ +3,46 V ile ≈ −2,47 V arasında kalır: pozitif tepelerde D1 iletir (3 V + V_{D}), negatif tepelerde D2 iletir (−2 V − V_{D}). Güç kaynağının çıkışları topraktan yalıtılmış olduğundan bir çıkışı ters bağlayıp negatif gerilim elde edebilirsin.',
  },
  'jfet-karakteristik': {
    title: 'BF245A: çıkış ve transfer karakteristiği',
    description:
      'DC güç kaynağının 1. çıkışı (V_{DD} = 10 V) ampermetre üzerinden BF245A’nın drain’ini besliyor. 2. çıkış ters bağlı: + ucu toprakta (source), − ucu kapıda; böylece V_{GS} = −V_{GG}. V1, V_{DS}’yi; V2, V_{GS}’yi ölçüyor. Başlangıçta V_{GG} = 0.',
    question:
      'V_{GS} = 0’da drain akımı (≈ I_{DSS}) kaç mA olur? V_{GS} = −0,2 V ve −0,4 V’ta?',
    answer:
      'V_{DS} = 10 V’ta I_{D} ≈ 4,1 mA (V_{GS} = 0), ≈ 3,2 mA (−0,2 V) ve ≈ 2,5 mA (−0,4 V). Doyumda I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})² · (1 + λV_{DS}); bu BF245A’da I_{DSS} ≈ 3,5 mA, V_{P} ≈ −1,74 V, λ ≈ 0,018 V⁻¹ (akım V_{DS} ile biraz artar). Çıkış eğrisi için V_{DD}’yi 0–15 V arasında değiştir: V_{DS} < V_{GS} − V_{P} iken akım hızla artar (omik bölge), sonra neredeyse sabittir (doyum). V_{GG}’yi akım sıfırlanana kadar artır: kısılma gerilimi ≈ 1,74 V. Kendi transistöründe ölçtüğün I_{DSS} ve V_{P}’yi özelliklerinden yazabilirsin.',
  },
  'fet-yukseltec': {
    title: 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)',
    description:
      'Föydeki tasarım ödevinin bir çözümü: kapı R_{G} = 1 MΩ ile toprağa bağlı (V_{GS} = 0, I_{D} ≈ I_{DSS}), V_{DD} = 15 V, R_{D} = 2,7 kΩ. Giriş 1 µF ile kuplajlı: 1 kHz, 0,5 V tepe-tepe sinüs. Osiloskobun A kanalı çıkışı (drain; AC kuplaj, 2 V/bölme), B kanalı girişi (kapı; 0,2 V/bölme) gösteriyor.',
    question:
      'Kazanç kaç olur? Giriş ile çıkış arasında faz farkı var mı?',
    answer:
      'Kazanç ≈ −10: A_{v} = −g_{m} · (R_{D} ∥ r_{o}). Burada g_{m} = 2 · I_{D} / |V_{P}| ≈ 4,4 mS (I_{D} ≈ 3,8 mA) ve r_{o} ≈ 1 / (λ · I_{DSS}) ≈ 16 kΩ. Çıkış girişle ters fazlıdır (180°). Çalışma noktası V_{DS} ≈ 4,7 V. Girişi 2 V tepe-tepeye çıkar: çıkış bozulur (≈ 1,2 V ile 14,5 V arası). Negatif yarıda transistör kesime yaklaşır; pozitif yarıda kapı-kaynak eklemi iletmeye başlar ve kare yasası dalgayı eğer. Kendi tasarımın için R_{D}’yi değiştirip kazancı karşılaştır.',
  },
  'bjt-yukseltec': {
    title: 'BC107 ile ortak emetörlü yükselteç',
    description:
      'Föydeki tasarımın bir çözümü: V_{CC} = 12 V, R_{B} = 2,2 MΩ (sabit baz akımı), R_{C} = 5,6 kΩ, β = 200. Üreteç 1 kHz sinüs, −20 dB zayıflatıcıyla 20 mV tepe-tepe; girişte 10 µF’lık kuplaj kondansatörü var. Osiloskobun A kanalı çıkışı (kollektör; AC, 1 V/bölme), B kanalı girişi (baz; AC, 5 mV/bölme) gösteriyor.',
    question:
      'Çalışma noktası (I_{C}, V_{CE}) ve kazanç ne olur? Frekansı 100 kHz, 1 MHz ve 2 MHz yap: kazanç değişir mi?',
    answer:
      'I_{B} = (12 V − 0,63 V) / 2,2 MΩ ≈ 5,2 µA ve I_{C} ≈ β · I_{B} ≈ 1,1 mA (Early etkisiyle biraz fazla). V_{CE} ≈ 5,9 V olduğundan çıkış iki yöne de salınabilir. Kazanç ≈ −215: A_{v} ≈ −g_{m} · R_{C}, g_{m} = I_{C} / V_{T} ≈ 42 mS. 100 kHz’e kadar kazanç sabittir; 1 MHz’te ≈ 150’ye, 2 MHz’te ≈ 100’e düşer. Bunun nedeni, BC107’nin kollektör-baz kapasitesi ile osiloskobun 25 pF’lık girişinin R_{C} ile alçak geçiren süzgeç oluşturmasıdır. Girişi 100 mV tepe-tepeye çıkar: çıkış doyumla (≈ 0,1 V) ve kesimle (≈ 11,6 V) kırpılır. Kare dalgayı da dene. β’yı değiştirince çalışma noktası kayar: sabit baz akımlı öngerilim β’ya bağlıdır.',
  },
  'mosfet-yukseltec': {
    title: 'IRF510 ile ortak kaynaklı yükselteç',
    description:
      'V_{DD} = 15 V, R_{D} = 10 kΩ, R_{S} = 1 kΩ. Kapıyı fonksiyon üreteci doğrudan sürüyor: 4,55 V DC offset üzerine 1 kHz, 0,1 V tepe-tepe sinüs. IRF510’un eşiği ≈ 3,8 V olduğundan offset, transistörü küçük bir akımla iletime sokar. Osiloskobun A kanalı çıkışı (drain; AC, 0,5 V/bölme), B kanalı girişi (kapı; AC, 50 mV/bölme) gösteriyor.',
    question:
      'Kazanç kaç olur, giriş ile çıkış arasında faz farkı kaç derece? Girişi 1 V tepe-tepeye çıkarınca ne olur?',
    answer:
      'I_{D} ≈ 0,70 mA, V_{GS} ≈ 3,85 V (eşiğin yalnızca ≈ 20 mV üstünde), V_{DS} ≈ 7,3 V. Kazanç ≈ −9,7: A_{v} ≈ −R_{D} / (R_{S} + 1 / g_{m}), g_{m} = 2 · √(k · I_{D}) ≈ 59 mS. Çıkış girişle 180° ters fazlıdır. 1 V tepe-tepe girişte çıkış ≈ 3,2 V ile 12,9 V arasında salınır: kare yasası yüzünden iki yarı eşit değildir. Offset’i değiştirip çalışma noktasının ne kadar hassas olduğuna bak: IRF510’un eşiği parçadan parçaya 2–4 V arasında değişir. Frekansı 1 MHz yapınca kazanç ≈ 2,3’e düşer (C_{GD} ve osiloskop girişi).',
  },
  'bjt-anahtar': {
    title: 'Transistör anahtar: LED kollektörde',
    description:
      'Fonksiyon üretecinin TTL (darbe) çıkışı 1 Hz’lik 0/5 V kare dalga veriyor; R_{1} = 10 kΩ BC107’nin bazını sürüyor. Kollektörde R_{2} = 1 kΩ ve kırmızı LED, V_{CC} = 12 V’a bağlı. Osiloskobun A kanalı kollektörü (V_{CE}), B kanalı girişi gösteriyor.',
    question:
      'Giriş 5 V iken transistör doyumda mı? LED’den kaç mA geçer, V_{CE} kaç volt olur? Giriş 0 V’ta ne olur?',
    answer:
      'I_{B} = (5 V − 0,7 V) / 10 kΩ ≈ 0,43 mA. β · I_{B} ≈ 86 mA olurdu, ama kollektör akımı en fazla (12 V − 1,8 V) / 1 kΩ ≈ 10 mA olabilir. β · I_{B} bundan çok büyük olduğu için transistör doyumdadır: V_{CE} ≈ 0,04 V, LED’den ≈ 10 mA geçer. Giriş 0 V’ta baz akımı yoktur: transistör kesimde, LED sönük, V_{CE} ≈ 12 V − V_{LED}. Küçük bir baz akımı büyük bir akımı açıp kapatır.',
  },
  'bjt-anahtar-emetor': {
    title: 'Transistör anahtar: LED emetörde',
    description:
      'Aynı parçalar; bu kez kollektör doğrudan 12 V’ta, LED ve R_{2} = 1 kΩ emetör ile toprak arasında. Baz yine TTL çıkışından R_{1} = 10 kΩ ile sürülüyor.',
    question:
      'Giriş 5 V iken LED’den kaç mA geçer? Transistör doyumda mı? Kollektördeki devreyle karşılaştır.',
    answer:
      'LED’den yalnızca ≈ 2,6 mA geçer ve LED sönük yanar. Transistör doyuma girmez, aktif bölgededir (V_{CE} ≈ 7,8 V). Emetör, bazın ≈ 0,65 V altını izler (emetör izleyici): I_{E} ≈ (5 V − 0,65 V − V_{LED}) / (R_{2} + R_{1} / β) ≈ 2,5 mA. Akımı V_{CC} değil, giriş gerilimi belirler. Anahtar olarak kullanmak için yük kollektörde olmalıdır.',
  },
};

export const tr = {
  site: {
    name: SITE_NAME,
  },
  app: {
    noScript: `${SITE_NAME} tarayıcıda JavaScript ile çalışır. Lütfen JavaScript’i etkinleştir.`,
    loading: 'Yükleniyor…',
  },
  devices: {
    names: DEVICE_NAMES,
    pins: PIN_NAMES,
    pinTags: PIN_TAGS,
    pinShort: PIN_SHORT,
    descriptions: DEVICE_DESCRIPTIONS,
    ledColors: OPTION_LABELS.color!,
    waveforms: OPTION_LABELS.waveform!,
  },
  library: {
    title: 'Parçalar',
    search: 'Parça ara…',
    searchLabel: 'Parça ara',
    noResults: 'Bu aramayla eşleşen parça yok.',
    categories: {
      sources: 'Kaynaklar',
      passive: 'Pasif',
      semiconductors: 'Yarı iletkenler',
      transistors: 'Transistörler',
      instruments: 'Laboratuvar cihazları',
      switches: 'Anahtarlar',
      meters: 'Ölçü aletleri',
    },
    hint: 'Sürükleyip tuvale bırak ya da seçip tuvale tıkla.',
    close: 'Kütüphaneyi kapat',
    collapse: 'Kütüphaneyi daralt',
    open: 'Parça kütüphanesini aç',
    recent: 'Son',
    recentLabel: 'Son kullanılan parçalar',
    listLabel: 'Parça listesi (oklarla gez, Enter: tuvalin ortasına ekle)',
    add: (name: string) => `${name} ekle`,
  },
  toolbar: {
    library: 'Parça kütüphanesi',
    select: 'Seç',
    selectTitle: 'Seç ve taşı',
    wire: 'Kablo',
    wireTitle: 'Kablo çek (W)',
    rotate: 'Döndür',
    rotateTitle: 'Döndür (R)',
    flip: 'Ters çevir',
    flipTitle: 'Ters çevir (F)',
    remove: 'Sil',
    removeTitle: 'Seçileni sil (Delete)',
    undo: 'Geri al',
    undoTitle: 'Geri al (Ctrl+Z)',
    redo: 'Yinele',
    redoTitle: 'Yinele (Ctrl+Y)',
    zoomIn: 'Yakınlaştır',
    zoomOut: 'Uzaklaştır',
    fit: 'Devreyi ekrana sığdır',
    settings: 'Ayarlar',
    tools: 'Araç',
    view: 'Görünüm',
    zoom: 'Yakınlık',
    saved: 'Tarayıcıda kaydedildi',
    saveFailed: 'Kaydedilemedi',
    saveFailedTitle:
      'Bu tarayıcı devreyi saklamıyor (gizli pencere ya da kapalı site verisi). Devreyi korumak için Dosya → JSON olarak dışa aktar.',
  },
  settings: {
    title: 'Ayarlar',
    resistorStyle: 'Direnç sembolü',
    zigzag: 'Zigzag',
    iec: 'Kutu (IEC)',
    wireScale: 'Kablo gerilimi renkleri',
    classic: 'Klasik',
    colorblind: 'Renk körlüğüne uygun',
    stored: 'Bu tarayıcıda saklanır',
    nodeVoltages: 'Düğüm gerilimlerini yaz',
    nodeVoltagesNote: 'Her düğümün yanında küçük değer etiketi',
    currentSection: 'Akım ve görünüm',
    currentDots: 'Akım noktalarını göster',
    welcome: 'İlk açılış turunu göster',
    shortcuts: 'Kısayollar (?)',
  },
  canvas: {
    label: 'Devre şeması',
    empty: 'Başlamak için soldaki kütüphaneden bir parça sürükle.',
    emptyAction: 'Örneklerden başla',
    emptyMobile: 'Parça eklemek için alttaki **Parça** düğmesine dokun.',
    wiringActive: 'Kablo çiziliyor: bir pine ya da kabloya dokun',
    cancelWire: 'İptal',
  },
  sim: {
    play: 'Oynat',
    pause: 'Duraklat',
    stop: 'Durdur',
    stopTitle: 'Durdur: LED’ler onarılır, kondansatörler başlangıç gerilimine döner',
    time: 'Zaman',
    speed: 'Hız',
    speedTitle: 'Gerçek 1 saniyede simülasyonda ne kadar zaman geçer',
    speedDialog: 'Simülasyon hızı',
    realtime: 'gerçek zaman',
    speedNote: (time: string) => `1 s’de ${time}`,
    speedPresets: {
      realtime: 'Gerçek zaman',
      slow: 'Yavaş',
      verySlow: 'Çok yavaş',
      slowMotion: 'Ağır çekim',
      scope: 'Osiloskoba göre',
    },
    scopeSweep: 'tarama ≈ 0,2 s',
    scopeSweepMissing: 'devrede osiloskop yok',
    fineSpeed: 'İnce ayar',
    speedSentence: (time: string) => `Gerçek 1 saniyede simülasyonda **${time}** geçer.`,
    region: 'Simülasyon',
    electronFlow: 'Elektron akışını göster',
    electronNote: 'Elektronlar, geleneksel akım yönünün tersine hareket eder.',
    conventionalNote: 'Noktalar geleneksel akım yönünü gösterir: dış devrede + uçtan − uca.',
    stoppedByEdit: 'Devrenin yapısı değiştiği için simülasyon durduruldu.',
    lagging:
      'Bu hızda simülasyon gerçek zamana yetişemiyor (yüksek frekans). Hızı düşür ya da osiloskopta Oto’ya bas.',
    cannotRun: 'Simülasyon başlamadı:',
    status: { running: 'Çalışıyor', paused: 'Duraklatıldı', stopped: 'Durduruldu' },
    legend: 'Kablo gerilimi',
    legendRms: 'Kablo gerilimi · etkin',
    legendTitle: 'Gösterim',
    legendConventional: 'Akım · geleneksel yön',
    legendElectron: 'Akım · elektron yönü',
  },
  readout: {
    voltage: 'Gerilim',
    current: 'Akım',
    power: 'Güç',
    powerUsed: 'Harcanan güç',
    terminalVoltage: 'Uç gerilimi',
    outputCurrent: 'Verdiği akım',
    powerDelivered: 'Verdiği güç',
    internalLoss: 'İç dirençte kaybolan güç',
    energy: 'Depolanan enerji (½CV²)',
    forwardVoltage: 'Gerilim (anot − katot)',
    brightness: 'Parlaklık',
    state: 'Durum',
    open: 'Açık',
    closed: 'Kapalı',
    burned: 'Yanmış',
    voltageAcross: 'Uçları arasındaki gerilim',
    reading: 'Gösterge',
    drawnCurrent: 'Devreden çektiği akım',
    voltageDrop: 'Üzerindeki gerilim düşümü',
    charging: 'Kondansatör doluyor.',
    discharging: 'Kondansatör boşalıyor.',
    steady: 'Akım yok: kondansatörün gerilimi değişmiyor.',
    forwardBiased: 'İleri yönde kutuplanmış: akım anottan katoda geçer.',
    reverseBiased: 'Ters yönde kutuplanmış: yalnızca çok küçük bir sızıntı akımı geçer.',
    burnedNote: 'Yanmış LED açık devredir. Durdur’a bas ya da sağ tıklayıp “Onar”ı seç.',
    ledLimits: (vf: string, max: string) => `20 mA’de ileri gerilim ≈ ${vf}; en fazla ${max}.`,
    switchClosedNote: (r: string) => `Kapalı anahtar ${r} değerinde bir dirençtir.`,
    switchOpenNote: 'Açık anahtar akım geçirmez; uçları arasındaki gerilim devrenin geri kalanına bağlıdır.',
    idealVoltmeter: 'İdeal voltmetre devreden hiç akım çekmez.',
    realVoltmeter: (r: string, i: string) => `İç direnci ${r}: ölçtüğü devreden ${i} çekiyor.`,
    idealAmmeter: 'İdeal ampermetrenin direnci sıfırdır; üzerinde gerilim düşmez.',
    realAmmeter: (r: string, drop: string) => `İç direnci ${r}: devrede ${drop} gerilim düşümüne yol açıyor.`,
    instant: 'Anlık değer',
    dcMode: 'DC kipi: son periyottaki ortalama değer.',
    acMode: 'AC kipi: etkin değer, √(ortalama v²).',
    instantVoltage: 'Anlık gerilim',
    peakVoltage: 'Tepe gerilimi',
    rmsVoltage: 'Etkin değer',
    frequency: 'Frekans',
    period: 'Periyot',
    acFormula: {
      sine: 'v(t) = V_{m} · sin(2π · f · t); etkin değer V_{m} / √2.',
      square: 'Kare dalga: yarım periyot +V_{m}, yarım periyot −V_{m}; etkin değer V_{m}.',
      triangle: 'Üçgen dalga: gerilim doğrusal artıp azalır; etkin değer V_{m} / √3.',
    } as Record<string, string>,
    withOffset: (offset: string) => `DC kayma ${offset}: bütün dalga bu kadar yukarı kayar.`,
    outputVoltage: 'Çıkış gerilimi (OUT − COM)',
    openCircuit: 'Açık devre genliği',
    output: (n: number) => `${n}. çıkış`,
    cc: 'akım sınırında (CC)',
    cv: 'sabit gerilim (CV)',
    funcgenNote:
      'Çıkış direnci 50 Ω: yük akımı arttıkça çıkış gerilimi düşer (50 Ω’luk yükte genlik yarıya iner).',
    funcgenEarthed: ' COM ucu şebeke toprağına bağlı: devrenin toprağıyla aynı noktadır.',
    dcsupplyNote:
      'Yük, akım sınırını aşmaya çalışınca kaynak sabit akıma (CC) geçer ve çıkış gerilimi düşer; kısa devrede akım sınırda kalır.',
    scopeInput: (real: boolean, earthed: boolean) =>
      `${real ? 'Giriş 1 MΩ ‖ 25 pF: devreden çok küçük bir akım çeker.' : 'İdeal giriş: devreden akım çekmez.'}${
        earthed ? ' COM şebeke toprağına bağlı: devrenin toprağıyla aynı noktadır.' : ''
      }`,
    collectorCurrent: 'Kollektör akımı I_{C}',
    baseCurrent: 'Baz akımı I_{B}',
    vce: 'V_{CE}',
    vbe: 'V_{BE}',
    gain: 'I_{C} / I_{B}',
    drainCurrent: 'Drain akımı I_{D}',
    vds: 'V_{DS}',
    vgs: 'V_{GS}',
    region: 'Bölge',
    regions: {
      cutoff: 'Kesim',
      active: 'Aktif',
      saturation: 'Doyum',
      ohmic: 'Omik (doğrusal)',
    } as Record<string, string>,
    bjtNotes: {
      cutoff: 'Kesim: B-E eklemi iletimde değil; transistör açık bir anahtar gibi, I_{C} ≈ 0.',
      active: 'Aktif bölge: I_{C} ≈ β · I_{B}; transistör yükselteç gibi çalışır.',
      saturation: 'Doyum: transistör kapalı bir anahtar gibi; I_{C} artık β · I_{B}’den küçüktür ve dış devre belirler.',
    } as Record<string, string>,
    fetNotes: {
      cutoff: 'Kesim: kanal kapalı, I_{D} ≈ 0.',
      ohmic: 'Omik bölge: kanal V_{GS} ile değişen bir direnç gibi davranır (anahtar kapalı).',
      saturation: 'Doyum (sabit akım) bölgesi: I_{D} neredeyse yalnızca V_{GS}’ye bağlıdır; yükselteç burada çalışır.',
    } as Record<string, string>,
    zenerBreakdown: 'Kırılma bölgesinde: uçlarındaki gerilim ≈ V_{Z} ve akımla çok az değişir.',
    zenerOff: 'Kırılma geriliminin altında: ters yönde yalnızca çok küçük bir sızıntı akımı geçer.',
    channel: (c: string) => `Kanal ${c}`,
    scopeNote: 'Ekran, tuvalin köşesindeki osiloskop panelinde çizilir.',
  },
  scope: {
    title: 'Osiloskop',
    collapse: 'Osiloskop panelini küçült',
    expand: 'Osiloskop panelini aç',
    screen: 'Osiloskop ekranı',
    timePerDiv: 'Zaman/bölme',
    voltsPerDiv: 'Volt/bölme',
    up: 'Yukarı kaydır',
    down: 'Aşağı kaydır',
    trigger: 'Tetik',
    auto: 'Oto',
    autoTitle: 'Bölme ayarlarını sinyale göre seç',
    channel: (c: string) => `Kanal ${c}`,
    notConnected: 'bağlı değil',
    stopped: 'Ekranı görmek için Oynat’a bas.',
    rolling: 'Tetiklenmiyor; ekran kayıyor.',
    peakToPeak: 'Tepe-tepe',
    rms: 'Etkin',
    frequency: 'f',
    perDiv: '/b',
    mode: 'Kip',
    modes: { yt: 'A ve B (Y-t)', add: 'A + B (ADD)', xy: 'X-Y (A yatay, B dikey)' } as Record<string, string>,
    invertB: 'B ters (INV)',
    inverted: 'ters',
    coupling: 'Kuplaj',
    couplings: { dc: 'DC', ac: 'AC', gnd: 'GND' } as Record<string, string>,
    sum: (inverted: boolean) => (inverted ? 'A − B' : 'A + B'),
  },
  examples: {
    section: 'Örnekler',
    button: 'Örnekler',
    dialogTitle: 'Örnek devreler',
    dialogHint: 'Bir örneğe tıkla: devre açılır; açıklaması ve tahmin sorusu sağdaki Örnek sekmesinde çıkar.',
    dialogClose: 'Örnekler penceresini kapat',
    groups: {
      temel: 'Temel devreler',
      aletler: 'Laboratuvar cihazları',
      'diyot-karakteristigi': 'Deney 1 · Diyot karakteristikleri',
      dogrultucu: 'Deney 2 · Doğrultucular',
      kenetleyici: 'Deney 3 · Kenetleyici ve gerilim katlayıcı',
      kirpici: 'Deney 4 · Kırpıcılar',
      'fet-karakteristigi': 'Deney 5 · FET karakteristikleri',
      'fet-yukseltec': 'Deney 6 · JFET’li yükselteç',
      'bjt-yukseltec': 'Deney 7 · BJT’li yükselteç',
      'mosfet-yukseltec': 'Deney 8 · MOSFET’li yükselteç',
      anahtar: 'Deney 9 · Transistörün anahtar olarak kullanılması',
    } as Record<ExampleGroupId, string>,
    texts: EXAMPLES,
    badge: 'Örnek',
    predict: 'Tahmin et',
    answer: 'Cevap',
    answerHidden: 'Cevabı görmek için Oynat’a bas.',
    loaded: 'Örnek yüklendi.',
    tabBadge: (group: string) => `Örnek · ${group}`,
    predictionLabel: 'Tahminin (isteğe bağlı)',
    predictionShown: 'Tahminin:',
    previous: '← Önceki',
    next: 'Sonraki →',
    previousLabel: 'Önceki örnek',
    nextLabel: 'Sonraki örnek',
    closeExample: 'Örneği kapat',
    noneTitle: 'Açık örnek yok',
    noneText: 'Örnekler penceresinden bir devre açınca açıklaması, tahmin sorusu ve cevabı burada çıkar.',
    browse: 'Örneklere göz at',
  },
  rack: {
    title: 'Cihaz rafı',
    countSide: (n: number) => `${n} cihaz · yan yana`,
    layout: 'Raf düzeni',
    side: 'Yan yana',
    single: 'Tek tek',
    collapse: 'Rafı küçült',
    expand: 'Rafı aç',
    resize: 'Raf yüksekliği (sürükle ya da ↑/↓)',
    increase: (label: string) => `${label} artır`,
    decrease: (label: string) => `${label} azalt`,
    typeHint: 'Değeri yazmak için tıkla; tekerlek ve ↑/↓ tuşları da değiştirir.',
    lampOn: '(yanıyor)',
    lampOff: '(sönük)',
    jack: (name: string) => `${name} ucunu tuvalde göster`,
    divShort: 'b',
    triggered: 'Tetikleniyor',
    inputReal: 'Giriş 1 MΩ ‖ 25 pF',
    inputIdeal: 'İdeal giriş (akım çekmez)',
    input: 'Giriş',
    inputRealShort: '1 MΩ ‖ 25 pF',
    inputIdealShort: 'İdeal',
    earthed: 'COM şebeke toprağına bağlı',
    modeAndTime: 'Kip ve zaman',
    modes: { yt: 'A ve B', add: 'A + B', xy: 'X-Y' } as Record<string, string>,
    invert: 'B ters',
    triggerA: 'Tetik A',
    xyAxisA: 'A · yatay (X)',
    xyAxisB: 'B · dikey (Y)',
    xyTimeUnused: 'X-Y’de kullanılmaz',
    badgeAdd: (inverted: boolean) => (inverted ? 'A + B · B ters → A − B' : 'A + B'),
    badgeXy: 'X-Y · A yatay, B dikey',
    position: 'Konum',
    moveUp: (c: string) => `${c} kanalını yukarı al`,
    moveDown: (c: string) => `${c} kanalını aşağı al`,
    moveLeft: (c: string) => `${c} kanalını sola al`,
    moveRight: (c: string) => `${c} kanalını sağa al`,
    funcgen: 'Fonksiyon üreteci',
    frequency: 'Frekans',
    amplitude: 'Genlik',
    amplitudePanel: 'AMPL · tepe-tepe',
    offset: 'Kayma',
    duty: 'Simetri',
    attenuator: 'Zayıflatıcı (−20 dB)',
    dcsupply: 'DC güç kaynağı',
    output: (n: number) => `${n}. çıkış`,
    voltage: 'Gerilim',
    currentLimit: 'Akım sınırı',
    ccNote: (set: string, actual: string) => `Akım sınırında: çıkış ${set} yerine ${actual} veriyor.`,
    notConnected: 'Bağlı değil · çıkışlar topraktan yalıtılmış',
    measureHint:
      '**Ölç düzeni:** kütüphane ve inceleme paneli şeride indi, raf büyüdü. Kur düzenine dönmek için bir parça sürükle ya da şeritteki düğmeye bas.',
    measureHintExample: '**Ölç düzeni:** raf büyüdü. Kur düzenine dönmek için bir parça sürükle ya da Durdur’a bas.',
    settingsInRack: 'Bu cihazın bütün ayarları cihaz rafındaki ön panelinde.',
    showInRack: 'Rafta göster',
    autoDone: (parts: string) => `Oto: ${parts}`,
    autoSpeed: (speed: string) => `hız ${speed}`,
  },
  inspector: {
    label: 'İnceleme paneli',
    collapsedLabel: 'İnceleme paneli (daraltılmış)',
    open: 'İnceleme panelini aç',
    tabs: { inspect: 'İncele', example: 'Örnek', devices: 'Cihazlar', messages: 'Mesajlar' },
    emptyTitle: 'Henüz parça yok',
    emptyText: 'Bir parçayı seçince canlı ölçümleri, formül notunu ve özelliklerini burada görürsün.',
    steps: [
      { title: 'Kur', text: 'Parçaları yerleştir, uçlarından kablo çek.' },
      { title: 'Tahmin et, Oynat', text: 'Sonucu önce kafanda hesapla, sonra Oynat’a bas.' },
      { title: 'İncele', text: 'Bir parçaya tıkla; gerilim, akım ve gücü gör, değerini çalışırken değiştir.' },
    ],
    noSelectionTitle: 'Parça seçilmedi',
    noSelectionText: 'Tuvalde ya da aşağıdaki listede bir parça seç; canlı ölçümleri, formül notunu ve özelliklerini burada görürsün.',
    circuit: 'Devre',
    meters: 'Göstergeler',
    live: 'Canlı ölçüm',
    liveBadge: 'canlı',
    pausedBadge: 'duraklatıldı',
    playHint: 'Oynat’a basınca değerler burada canlı görünür.',
    why: 'Neden bu değer?',
    properties: 'Özellikler',
    whatItDoes: 'Bu parça ne yapar?',
    applyNote: 'Değişiklikler Enter’la ya da alandan çıkınca uygulanır. Geri almak için [[Ctrl+Z]].',
    liveApplyNote:
      'Değer, ad ve anahtar değişiklikleri simülasyonu durdurmaz; kondansatör gerilimleri korunur. Parça eklemek, silmek, taşımak ya da döndürmek durdurur.',
    liveApplied: 'Canlı uygulanır · simülasyon durmaz',
    invalidKept: (old: string) => `Geçersiz değer uygulanmaz; tuvalde ${old} kalır.`,
    presets: 'Sık kullanılan değerler',
    selectedItems: (n: number) => `${n} öğe seçili`,
    selectedHint: 'Birden çok öğe seçiliyken özellikler gösterilmez; döndürebilir ya da silebilirsin.',
    wire: 'Kablo',
    wireVoltage: 'Gerilim (toprağa göre)',
    wireHint: 'Kablonun bağlı olduğu noktanın toprağa göre gerilimi. Kablonun her yerinde aynıdır.',
    repair: 'Onar',
  },
  file: {
    menu: 'Dosya',
    newCircuit: 'Yeni devre',
    exportJson: 'JSON olarak dışa aktar',
    importJson: 'JSON dosyası içe aktar…',
    share: 'Paylaşım bağlantısı…',
    newCircuitNote: 'Önceki devrene Geri al (Ctrl+Z) ile dönebilirsin.',
    exportNote: 'Devreyi .json dosyası olarak indir.',
    importNote: 'Bilgisayarındaki bir devre dosyasını aç.',
    shareNote: 'Devreyi bağlantının içine yaz, kopyala.',
    autosaveNote:
      'Devren her değişiklikten sonra bu tarayıcıya kendiliğinden kaydedilir. Kaydet düğmesi gerekmez; başka bilgisayara taşımak için dışa aktar ya da bağlantı paylaş.',
    fileName: 'devre',
    newDone: 'Yeni devre açıldı.',
    imported: 'Devre içe aktarıldı.',
    importError: 'Bu dosya geçerli bir devre dosyası değil (sürüm 1 JSON bekleniyor).',
    sharedLoaded: 'Paylaşılan devre açıldı.',
    sharedError: 'Paylaşım bağlantısındaki devre okunamadı. Bağlantı eksik kopyalanmış olabilir; gönderenden yeniden iste.',
  },
  shareDialog: {
    title: 'Paylaşım bağlantısı',
    description:
      'Devre bu bağlantının içine sıkıştırılarak yazıldı; bir sunucuya gönderilmedi. Bağlantıyı açan kişi aynı devreyi görür.',
    copy: 'Kopyala',
    copied: 'Kopyalandı',
    copyFailed: 'Kopyalanamadı; bağlantıyı seçip elle kopyala.',
    close: 'Kapat',
    length: (n: number) => `${n} karakter`,
  },
  messages: {
    title: 'Mesajlar',
    errors: (n: number) => `${n} hata`,
    warnings: (n: number) => `${n} uyarı`,
    none: 'Sorun yok',
    hint: 'Bir mesajı seçince ilgili parça tuvalde vurgulanır.',
    counts: (errors: number, warnings: number) => `${errors} hata · ${warnings} uyarı`,
    /** "2 hata", "1 hata, 1 uyarı", "3 uyarı". */
    summary: (errors: number, warnings: number) =>
      [errors > 0 ? `${errors} hata` : '', warnings > 0 ? `${warnings} uyarı` : ''].filter(Boolean).join(', '),
    stripBlocked: (summary: string) =>
      `**${summary}.** Hata düzelmeden simülasyon başlamaz; uyarılar başlamasına engel değildir.`,
    stripRuntime: (summary: string) =>
      `**${summary}.** Sağdaki listeden bir mesaja tıkla: ilgili parça vurgulanır ve görünüm oraya kayar.`,
    earthTrapTitle: 'Toprak tuzağı',
    earthTrap: (scope: string, generator: string, shorted: string) =>
      `${scope} ve ${generator} COM uçları şebeke toprağıyla birleşiyor; ${shorted} kısa devre oldu. Prob toprağını ${generator} COM ile aynı noktaya bağla.`,
    earthTrapGeneric: (instruments: string, shorted: string) =>
      `${instruments} şebeke toprağıyla birleşiyor; ${shorted} kısa devre oldu. Toprağa bağlı uçları aynı noktaya bağla ya da cihazın şebeke toprağı bağlantısını kaldır.`,
    repair: 'Onar',
    setResistor: (label: string, value: string) => `${ek(label, 'i')} ${value} yap`,
    severity: { error: 'Hata', warning: 'Uyarı' },
    circuitTarget: 'devre',
    noneDetail: 'Devrede şu an hata ya da uyarı yok.',
  },
  contextMenu: {
    properties: 'Özellikler…',
    rotate: 'Döndür',
    flip: 'Ters çevir',
    remove: 'Sil',
    repair: 'Onar',
    menu: (label: string) => `${label} menüsü`,
  },
  balloon: {
    repair: 'Onar',
    close: 'Kapat',
    why: 'Neden?',
    burnTitle: (label: string) => `${label} yandı`,
    burnDetail: (current: string, max: string) => `Üzerinden ≈ ${current} geçti; en fazla ${max}’e dayanır.`,
  },
  noGround: {
    title: 'Simülasyon başlamadı: devrede toprak yok',
    text: 'Gerilimler bir referansa göre ölçülür. Toprak sembolü ekle.',
    where: {
      battery: 'Pilin − ucu iyi bir yer.',
      acsource: 'AC kaynağın − ucu iyi bir yer.',
      dcsupply: 'Güç kaynağının − ucu iyi bir yer.',
    } as Record<string, string>,
    fix: (label: string) => `${ek(label, 'in')} − ucuna toprak ekle`,
    fixGeneric: 'Önerilen yere toprak ekle',
    myself: 'Kendim eklerim',
    close: 'Kapat',
    suggested: 'önerilen toprak',
  },
  earthLine: 'şebeke toprağı (cihazlarda)',
  hints: {
    // Tuvalin altındaki ipucu şeridi: **kalın**, [[tuş]].
    simulating:
      '**Simülasyon sırasında:** anahtarı açıp kapatmak için üzerine tıkla · değeri sağdaki panelden değiştir · parça eklemek ya da taşımak simülasyonu durdurur',
    empty: 'Parça sürükle ya da tıklayıp tuvale tıkla · [[W]] kablo · [[R]] döndür',
    select:
      'Kablo çekmek için bir parçanın ucuna tıkla · seçince özellikler sağda açılır · [[R]] döndür · [[F]] ters çevir · [[Delete]] sil · [[Boşluk]] + sürükle: kaydır',
    example: 'Örnek açık: önce sağdaki soruyu yanıtla, sonra **Oynat**’a bas.',
    exampleUndo: 'Önceki devrene dönmek için [[Ctrl+Z]]',
    allShortcuts: 'Tüm kısayollar: [[?]]',
    place: (name: string) =>
      `**${name}:** yerleştirmek için tuvale bırak ya da tıkla · [[R]] döndür · [[F]] ters çevir · [[Shift]] + tıkla: birden çok · [[Esc]] iptal`,
    wireIdle: '**Kablo:** başlamak için bir uca, kabloya ya da boş bir noktaya tıkla · [[Esc]] seçme aracına dön',
    wiring: '**Kablo çiziliyor:** köşe için tıkla · bitirmek için bir uca ya da kabloya tıkla · çift tık: boşta bitir · [[Esc]] iptal',
    selected: (count: number) => `**${count} öğe seçili** · [[R]] döndür · [[F]] ters çevir · [[Delete]] sil · [[Ctrl+Z]] geri al`,
  },
  status: {
    zoom: 'Yakınlık',
  },
  properties: {
    title: (label: string, type: string) => `${label} · ${type}`,
    name: 'Ad',
    ok: 'Tamam',
    cancel: 'İptal',
    fieldLabel,
    optionLabel,
    unitHint: 'SI önekleri: p, n, µ (ya da u), m, k, M, G. Büyük M mega, küçük m mili demektir.',
    notes: {
      battery: 'İç direnç, pilin verebileceği akımı sınırlar: kısa devrede I = V / R_{iç}.',
      capacitor: 'Başlangıç gerilimi, simülasyon başladığında (ve Durdur’dan sonra) kondansatörün + ucu ile − ucu arasındaki gerilimdir.',
      diode: 'Genel amaçlı silisyum diyot: 1 mA’de ≈ 0,60 V, 20 mA’de ≈ 0,70 V ileri gerilim. Ters yönde yalnızca çok küçük bir sızıntı akımı geçer.',
      voltmeter:
        'Gerçek voltmetrelerin iç direnci sonludur. Ölçtüğün kaynağın iç direnci büyükse voltmetre gerçek değerden düşük okur (yükleme etkisi).',
      ammeter:
        'Gerçek ampermetrelerin de küçük bir iç direnci vardır; seri bağlandığı devrenin akımını biraz azaltır.',
      oscilloscope:
        'Kanallar ortak uca (COM) göre gerilimi ölçer. Gerçek girişte her kanal COM’a 1 MΩ ‖ 25 pF ile bağlıdır (laboratuvardaki osiloskoplar gibi). COM şebeke toprağına bağlıysa devrenin toprağıyla aynı noktadır: köprü doğrultmaçta prob toprağını yük tarafına takmak bir diyodu kısa devre eder. Bölme, kuplaj, ADD ve INV ayarları tuvalin köşesindeki panelde.',
      funcgen:
        'GFG-8015G benzeri: 0,2 Hz – 2 MHz, açık devrede en fazla 20 V tepe-tepe, ±10 V offset, %10–90 simetri, −20 dB zayıflatıcı, 50 Ω çıkış direnci. TTL çıkışı aynı frekansta 0/5 V darbe verir. Yüksek frekansta simülasyon hızını düşür (osiloskopta Oto).',
      dcsupply:
        'Her çıkış, akım sınırı aşılana kadar ayarlanan gerilimi verir (CV); aşılınca akım sınırda kalır (CC) ve sembolde CC yanar. Çıkışlar topraktan yalıtılmıştır: seri bağlayıp 3 V + 2 V gibi gerilimler elde edebilirsin.',
      zener:
        '1N4733A benzeri. Kırılma bölgesinde uçlarındaki gerilim akımla çok az değişir: 20 mA’de tam V_{Z}, 1 mA’de ≈ %3 daha düşük. İleri yönde sıradan bir diyot gibi ≈ 0,65 V düşer.',
      npn:
        'BC547B benzeri: I_{S} ≈ 2,4·10⁻¹⁴ A (1 mA’de V_{BE} ≈ 0,63 V), Early gerilimi ≈ 63 V. Aktif bölgede I_{C} ≈ β · I_{B}; doyumda V_{CE} ≈ 0,1–0,2 V. BC547B için β 200–450 arasıdır.',
      pnp:
        'BC557B benzeri, NPN ile aynı parametreler; bütün gerilim ve akımların yönü terstir (V_{EB} ≈ 0,63 V).',
      njfet:
        '2N5457 benzeri (veri sayfası: I_{DSS} 1–5 mA, V_{P} −0,5…−6 V). Doyumda I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})²; kanal boyu modülasyonu λ = 0,01 V⁻¹.',
      pjfet:
        'N kanallı JFET ile aynı denklemler; V_{P} pozitiftir, gerilim ve akımların yönü terstir.',
      nmos:
        '2N7000 benzeri (V_{GS(th)} tipik 2,1 V). Doyumda I_{D} = k · (V_{GS} − V_{T})², omik bölgede I_{D} = k · (2(V_{GS} − V_{T})V_{DS} − V_{DS}²); λ = 0,01 V⁻¹.',
      pmos:
        'N kanallı MOSFET ile aynı denklemler; V_{T} negatiftir, gerilim ve akımların yönü terstir.',
    } as Partial<Record<DeviceType, string>>,
    /** Parça modelinin notu (genel modellerde türün notu kullanılır). */
    modelNotes: {
      '1N4001':
        '1N4001: 1 A, 50 V doğrultucu diyot. İleri gerilim 10 mA’de ≈ 0,60 V, 100 mA’de ≈ 0,72 V (Vishay veri sayfası). Eklem kapasitesi (0 V’ta ≈ 30 pF) ve ters toparlanma (τ_{T} ≈ 5,8 µs) de hesaplanır: frekans arttıkça diyot ters yönde de bir süre akım geçirir; 1 MHz’te neredeyse doğrultmaz.',
      genel: 'Genel amaçlı silisyum diyot: 1 mA’de ≈ 0,60 V, 20 mA’de ≈ 0,70 V ileri gerilim. Ters yönde yalnızca çok küçük bir sızıntı akımı geçer; kapasitesi yoktur, her frekansta anında iletir ya da keser.',
      BC107:
        'BC107: 2 mA’de h_{FE} 110–450 (modelde β; ölçtüğün değeri yazabilirsin), V_{BE} ≈ 0,65 V, f_{T} ≈ 300 MHz. Eklem kapasiteleri (C_{je} ≈ 14 pF, C_{jc} ≈ 3,7 pF) hesaplanır: yükseltecin kazancı yüksek frekansta düşer. BC547 ile aynı yonga ailesidir.',
      BC547B:
        'BC547B benzeri basit model: I_{S} ≈ 2,4·10⁻¹⁴ A (1 mA’de V_{BE} ≈ 0,63 V), Early gerilimi ≈ 63 V, kapasitesiz. Aktif bölgede I_{C} ≈ β · I_{B}; doyumda V_{CE} ≈ 0,1–0,2 V.',
      BF245A:
        'BF245A (NXP modeli): I_{DSS} ≈ 3,5 mA, V_{P} ≈ −1,74 V (veri sayfası: I_{DSS} 2–6,5 mA; kendi ölçtüğün değerleri yazabilirsin). Doyumda I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})² · (1 + λV_{DS}), λ = 0,018 V⁻¹. Kapı kapasiteleri ≈ 2,2 pF.',
      '2N5457':
        '2N5457 benzeri basit model (veri sayfası: I_{DSS} 1–5 mA, V_{P} −0,5…−6 V), kapasitesiz. Doyumda I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})²; λ = 0,01 V⁻¹.',
      IRF510:
        'IRF510: 100 V, 5,6 A güç MOSFET’i. V_{GS(th)} 2–4 V (modelde V_{T} = 3,83 V), k = 1,24 A/V²: birkaç mA’de V_{GS} eşiğin yalnızca birkaç on mV üstündedir. Kapasiteleri büyüktür (25 V’ta C_{iss} ≈ 180 pF, C_{oss} ≈ 81 pF, C_{rss} ≈ 15 pF); drain direnci büyükse kazanç birkaç yüz kHz’te düşmeye başlar.',
      '2N7000':
        '2N7000 benzeri basit model (V_{GS(th)} tipik 2,1 V), kapasitesiz. Doyumda I_{D} = k · (V_{GS} − V_{T})², omik bölgede I_{D} = k · (2(V_{GS} − V_{T})V_{DS} − V_{DS}²); λ = 0,01 V⁻¹.',
    } as Record<string, string>,
    meterModeNote:
      'AC kaynaklı devrede DC kipi bir periyottaki ortalamayı, AC kipi etkin değeri (√(ortalama v²)) gösterir; gösterge her periyotta bir güncellenir.',
    acSpec: (rms: string, period: string) =>
      `Etkin değer ≈ ${rms} · periyot T = 1 / f = ${period}. Türkiye’de şebeke gerilimi 230 V etkin değerli (tepe ≈ 325 V), 50 Hz’liktir.`,
    ledSpec: (vf: string, max: string) => `20 mA’de ileri gerilim ≈ ${vf}; en fazla ${max} akıma dayanır.`,
    errors: {
      empty: 'Bir değer yaz.',
      invalid: 'Bu bir sayı değil. Örnekler: 4,7k · 100µ · 2,2M · 0,5',
      wrongUnit: (unit: string) => `Bu alanın birimi ${unit}.`,
      positive: 'Değer sıfırdan büyük olmalı.',
      max: (limit: string) => `Değer en fazla ${limit} olabilir.`,
      nonNegative: 'Değer negatif olamaz.',
      labelEmpty: 'Bir ad yaz.',
      labelTaken: 'Bu ad başka bir parçada kullanılıyor.',
    },
  },
  phone: {
    defaultName: 'Devrem',
    emptyName: 'Yeni devre',
    fileButton: (title: string) => `Dosya ve örnekler: ${title}`,
    more: 'Daha fazla: görünüm, ayarlar, yardım, paylaş',
    nodeVoltages: 'Düğüm gerilimleri',
    modes: { kur: 'Kur', bagla: 'Bağla', olc: 'Ölç', pause: 'Duraklatıldı' },
    modeLabel: (mode: string) => `Kip: ${mode}`,
    issues: (n: number) => `Mesajlar: ${n} sorun`,
    bar: 'Eylemler',
    parts: 'Parça',
    connect: 'Bağla',
    undo: 'Geri al',
    panel: 'Panel',
    value: 'Değer',
    valueButton: (value: string) => `Değer: ${value}. Değiştirmek için dokun`,
    items: (n: number) => `${n} öğe`,
    wire: 'Kablo',
    rotate: 'Döndür',
    flip: 'Çevir',
    remove: 'Sil',
    measurements: 'Ölçümler',
    devices: 'Cihazlar',
    speed: 'Hız',
    speedButton: (speed: string) => `Hız ${speed}`,
    stop: 'Durdur',
    play: 'Oynat',
    pause: 'Duraklat',
    resume: 'Devam et',
    done: 'Bitti',
    // Bağla kipi (P03)
    connectFirst: 'İlk uca dokun',
    connectSecond: 'İkinci uca dokun',
    connectEnlarged: 'Uçlar büyütüldü',
    connectFrom: (label: string, pin: string) => `Başlangıç: ${label} · ${pin}`,
    connectFromWire: 'Başlangıç: kablo üzerinde',
    connectCardIdle:
      'Uçlar büyütüldü. Kablonun başlayacağı uca dokun, sonra bağlanacağı uca. Bir kablonun ortasına dokunursan T bağlantısı olur.',
    connectCardStart: (who: string) =>
      `Uçlar büyütüldü. **${who}** seçili; şimdi bağlanacağı uca dokun. Bir kablonun ortasına dokunursan T bağlantısı olur.`,
    connectCardWire: 'Kablo üzerindeki nokta seçili; şimdi bağlanacağı uca dokun.',
    pinOf: (label: string, pin: string) => `${ek(label, 'in')} ${pin}`,
    legendStart: 'başlangıç',
    legendFree: 'boş uç',
    legendConnected: 'bağlı uç',
    pinTarget: (label: string, pin: string, connected: boolean) => `${label} · ${pin}${connected ? ' (bağlı)' : ''}`,
    connectCanvas: 'Devre şeması, Bağla kipi',
    // Alt sayfa
    sheetHandle: 'Sayfanın boyunu değiştir',
    sheetSizes: { peek: 'küçük', half: 'yarım', full: 'tam' } as Record<string, string>,
    close: 'Kapat',
    // Parça ekle (P02)
    addTitle: 'Parça ekle',
    favorites: 'Sık kullanılan',
    chain: (pinOf: string) => `**Zincirle ekle:** ${toDative(pinOf)} bağlanır`,
    chainOff: 'Zincirle eklemeyi kapat',
    addFooter: 'Dokun: ekle · Basılı tutup sürükle: istediğin yere bırak',
    added: (name: string) => `${name} eklendi`,
    // Parça sayfası (P04)
    showAll: 'Tümü ▴',
    showAllLabel: 'Tüm özellikler',
    showLess: 'Daha az ▾',
    showLessLabel: 'Yalnızca değer',
    stepDown: 'Bir alt değer',
    stepUp: 'Bir üst değer',
    stepDownOf: (name: string) => `${name}: bir adım azalt`,
    stepUpOf: (name: string) => `${name}: bir adım artır`,
    editValue: (name: string, value: string) => `${name} ${value}, düzenle`,
    e12Hint: '− / + E12 dizisinde bir adım değiştirir.',
    stepHint: '− / + bir adım değiştirir.',
    instrumentHint: 'Bu cihazın bütün ayarları Cihazlar sayfasında.',
    openDevices: 'Cihaz panelini aç',
    // Ölç kipi (P05)
    live: 'canlı',
    paused: 'duraklatıldı',
    liveApplied: 'Canlı uygulanır',
    tapPart: 'Bir parçaya dokun: ölçümleri burada görünür.',
    lock: 'Devre kilitli · dokun: incele',
    lockClose: 'Bilgiyi kapat',
    olcCanvas: 'Devre şeması, Ölç kipi, yapı kilitli',
    stopToEdit: 'Düzenlemek için durdurulsun mu?',
    stopToEditText: 'Ölç kipinde devrenin yapısı kilitli. Durdurunca Kur kipine dönersin.',
    stopAndEdit: 'Durdur ve düzenle',
    cancel: 'Vazgeç',
    lod: (percent: number) => `%${percent} · değerler gizli`,
    legendButton: 'Gösterim: kablo gerilimi ölçeği',
    // Panel sekmeleri
    tabs: { example: 'Örnek', circuit: 'Devre', measure: 'Ölçümler', messages: 'Mesajlar' },
    tabsLabel: 'Sayfa',
    // Simülasyon başlamadı (P11)
    blockedTitle: 'Simülasyon başlamadı',
    noGroundLead: 'Devrede toprak yok.',
    noGroundText: 'Gerilimler bir referansa göre ölçülür; bir toprak ekle.',
    fixAndPlay: (label: string) => `${ek(label, 'in')} − ucuna toprak ekle ve oynat`,
    notBlocking: 'Başlamaya engel değil.',
    // Cihazlar (P08, P09)
    devicesTitle: 'Cihazlar',
    devicesClose: 'Cihazları kapat',
    backToCircuit: 'Devreye dönmek için dokun',
    backToCircuitLabel: 'Devreye dön',
    circuit: 'Devre',
    deviceShort: { oscilloscope: 'Osiloskop', funcgen: 'Üreteç', dcsupply: 'Güç kaynağı' } as Record<string, string>,
    deviceTabs: 'Cihaz',
    waveform: 'Dalga biçimi',
    freqRange: '0,2 Hz – 2 MHz',
    freqDiv10: 'Frekansı 10’a böl',
    freqTimes10: 'Frekansı 10 ile çarp',
    amplitudeNote: 'tepe-tepe, açık devre',
    attenuator: '−20 dB zayıflatıcı',
    attenuatorNote: '(çıkış 10’da 1)',
    earthedNote: 'Gerçek cihazdaki gibi; kapatırsan çıkış yalıtılır',
    output: (v: string) => `Çıkış (OUT − COM) **${v}** · çıkış direnci 50 Ω: yük akımı arttıkça çıkış gerilimi düşer.`,
    outputStopped: 'Çıkış direnci 50 Ω: yük akımı arttıkça çıkış gerilimi düşer.',
    jacks: 'Uçlar (dokun: tuvalde göster)',
    // Dosya (P13) ve ⋯ (P14)
    fileTitle: 'Dosya',
    autosaved: 'Bu tarayıcıda kendiliğinden kaydedildi',
    notSaved: 'Bu tarayıcı devreyi saklamıyor; dışa aktar ya da bağlantı paylaş.',
    newNote: 'Öncekine Geri al ile dönebilirsin',
    shareLink: 'Paylaşım bağlantısı',
    shareSystem: 'Paylaş…',
    moreTitle: 'Daha fazla',
    fit: 'Ekrana sığdır',
    share: 'Paylaş',
    // Seçici (P15)
    pickerTitle: (n: number) => `Burada ${n} öğe var`,
    pickerLabel: (n: number) => `Burada ${n} öğe var, birini seç`,
    pickPart: (name: string) => `${name} · parçayı seç`,
    pickPin: 'Buradan kablo başlat',
    pickWire: (ends: string) => (ends ? `${ends} · kabloyu seç` : 'kabloyu seç'),
    pickerClose: 'Seçiciyi kapat',
    // Örnekler (P12)
    examplesSearch: 'Örnek ara…',
    examplesSearchLabel: 'Örnek ara',
    examplesHint: 'Bir örneğe dokun: devre açılır, tahmin sorusu alttaki sayfada çıkar.',
    exampleOpen: 'Açık',
    examplesNone: 'Bu aramayla eşleşen örnek yok.',
  },
  help: {
    title: 'Yardım',
    open: 'Yardım',
    openTitle: 'Yardım ve kısayollar (?)',
    subtitleBefore: 'Bu pencereyi her yerde',
    subtitleAfter: 'ile açabilirsin.',
    tour: 'Kısa turu başlat',
    tourAgain: 'Kısa turu yeniden başlat',
    close: 'Yardımı kapat',
    or: 'ya da',
    tabs: { keys: 'Klavye kısayolları', pointer: 'Fare ve dokunma', symbols: 'Simgeler ve renkler', lab: 'Laboratuvar ipuçları' },
    keyGroups: [
      {
        title: 'Araçlar',
        rows: [
          ['Seçme aracı', 'Esc'],
          ['Kablo aracı', 'W'],
          ['Tuvali kaydır', 'Boşluk+sürükle'],
          ['Tuvale atla (sayfa başındaki bağlantı)', 'Tab'],
        ],
      },
      {
        title: 'Düzen',
        rows: [
          ['Geri al', 'Ctrl+Z'],
          ['Yinele', 'Ctrl+Y ya da Ctrl+Shift+Z'],
          ['İptal (yerleştirme, kablo)', 'Esc'],
        ],
      },
      {
        title: 'Seçili öğe',
        rows: [
          ['Döndür (90°)', 'R'],
          ['Ters çevir (yönlü parçalar)', 'F'],
          ['Sil', 'Delete ya da Backspace'],
          ['Değer alanına git', 'Enter'],
          ['Tümünü seç', 'Ctrl+A'],
          ['En yakın parçaya geç', 'oklar'],
          ['Seçili parçayı kaydır', 'Shift+oklar'],
          ['Panelden tuvale dön', 'Esc'],
        ],
      },
      {
        title: 'Görünüm ve simülasyon',
        rows: [
          ['Yakınlaştır / uzaklaştır', 'tekerlek ya da + ya da −'],
          ['Devreyi ekrana sığdır', 'Shift+1'],
          ['Oynat / Duraklat', 'P'],
          ['Panel sekmesine geç', 'Alt+1…3'],
          ['Yardım', '?'],
        ],
      },
    ] as ReadonlyArray<{ title: string; rows: ReadonlyArray<readonly [string, string]> }>,
    keysNote: 'Kısayollar odak tuvaldeyken çalışır; bir alana yazarken harf tuşları yazıya gider. Türkçe Q klavyede de aynı tuşlar.',
    mouse: 'Fare',
    touch: 'Dokunma (telefon, tablet)',
    mouseRows: [
      ['Kütüphaneden sürükle', 'Parçayı tuvale bırakır (ya da parçaya tıkla, sonra tuvale tıkla).'],
      ['Tıkla', 'Seçer; özellikler sağdaki İncele sekmesinde.'],
      ['Shift + tıkla', 'Seçime ekler ya da çıkarır.'],
      ['Uca tıkla', 'Kablo başlar; köşeler için tıkla, bir uca ya da kabloya tıklayınca biter.'],
      ['Çift tık', 'İlk değer alanına odaklanır.'],
      ['Sağ tık', 'Menü: Özellikler, Döndür, Ters çevir, Sil.'],
      ['Boşlukta sürükle', 'Seçim kutusu.'],
      ['Tekerlek', 'İmlecin olduğu yere yakınlaştırır.'],
      ['Boşluk + sürükle', 'Tuvali kaydırır (orta tuş da).'],
    ] as ReadonlyArray<readonly [string, string]>,
    touchRows: [
      ['Parçaya dokun', 'Seçer; alttaki çubuk o parçanın eylemlerine döner.'],
      ['Parçayı basılı tutup sürükle', 'Taşır (150 ms bekleme). Hızlı kaydırma tuvali kaydırır.'],
      ['Uca dokun', 'Bağla kipini o uçtan başlatır; ikinci uca dokununca kablo çizilir.'],
      ['Basılı tut', 'Menü ve büyüteç: Değer, Döndür, Ters çevir, Sil.'],
      ['Kalabalık yere dokun', '“Burada N öğe var” seçicisi çıkar.'],
      ['Ölç’te parçaya dokun', 'Ölçümleri gösterir; anahtara dokunmak açıp kapatır.'],
      ['İki parmak', 'Yakınlaştırır ve kaydırır.'],
    ] as ReadonlyArray<readonly [string, string]>,
    symbols: {
      wire: 'Kablo gerilimi',
      wireText: 'Kablonun rengi toprağa göre gerilimini gösterir; ölçeğin uçları devredeki en yüksek gerilimdir.',
      unknown: 'Kesikli gri kablo',
      unknownText: 'Gerilimi belirsiz: bu kısım toprağa bağlı değil.',
      dots: 'Akım noktaları',
      dotsText: 'Akımın yönünü gösterir; noktalar hızlandıkça akım büyür.',
      error: 'Hata',
      errorText: 'Parça zarar gördü ya da simülasyon başlamadı (dolu daire).',
      warning: 'Uyarı',
      warningText: 'Boşta uç, toprak tuzağı gibi; çalışmayı engellemez (üçgen).',
      pin: 'Boşta uç',
      pinText: 'Hiçbir yere bağlı olmayan uç.',
      junction: 'Bağlantı noktası',
      junctionText: 'Üç ya da daha fazla kablonun birleştiği nokta.',
      selection: 'Seçim',
      selectionText: 'Seçili parça kesikli mavi çerçeveyle gösterilir.',
      earth: 'Şebeke toprağı',
      earthText: 'Topraklı cihazların COM uçları şebeke toprağıyla birleşir.',
    },
    labTips: [
      ['Önce Oto', 'Osiloskopta Oto, zaman/bölme, volt/bölme ve simülasyon hızını birlikte ayarlar.'],
      ['Prob toprağı', 'Osiloskobun COM ucu şebeke toprağına bağlıdır. Köprü doğrultmaçta COM’u yükün − ucuna takmak bir diyodu kısa devre eder; COM’u fonksiyon üretecinin COM’u ile aynı noktaya bağla.'],
      ['Voltmetre paralel, ampermetre seri', 'Ampermetre paralel bağlanınca iç direnci çok küçük olduğu için kısa devre olur.'],
      ['LED’e ön direnç', 'Ön direnç olmadan LED yanar: R = (V_{kaynak} − V_{f}) / I.'],
      ['Yüksek frekans', 'KHz–MHz sinyalleri izlemek için hızı düşür (×10⁻³ … ×10⁻⁶) ya da osiloskopta Oto’ya bas.'],
      ['Üretecin çıkış direnci', 'Fonksiyon üretecinin 50 Ω çıkış direnci vardır: yük akımı arttıkça çıkış gerilimi düşer.'],
      ['Yükleme etkisi', 'Gerçek voltmetrenin iç direnci sonludur; büyük dirençli devrelerde gerçekten düşük okur.'],
      ['Değeri çalışırken değiştir', 'Değer ve ad değişiklikleri simülasyonu durdurmaz; parça eklemek, taşımak ya da silmek durdurur.'],
    ] as ReadonlyArray<readonly [string, string]>,
    phoneGroups: [
      {
        mode: 'kur',
        title: 'Devre kurarken',
        rows: [
          ['Parçaya dokun', 'Seçer; alttaki çubuk o parçanın eylemlerine döner.'],
          ['Parçayı sürükle', 'Taşır; bağlı kablolar esner.'],
          ['Uca dokun', 'Bağla kipini o uçtan başlatır.'],
          ['Basılı tut', 'Menü ve büyüteç: Değer, Döndür, Sil.'],
        ],
      },
      {
        mode: 'bagla',
        title: 'Kablo çekerken',
        rows: [['İki uca dokun', 'Kablo kendiliğinden çizilir. Kablonun ortası: T bağlantısı.']],
      },
      {
        mode: 'olc',
        title: 'Simülasyon çalışırken',
        rows: [
          ['Parçaya dokun', 'Ölçümleri gösterir; değeri −/+ ile değiştirebilirsin.'],
          ['Anahtara dokun', 'Açar ya da kapatır.'],
          ['Her yerde', 'Tek parmak kaydırır, iki parmak yakınlaştırır.'],
        ],
      },
    ] as ReadonlyArray<{ mode: string; title: string; rows: ReadonlyArray<readonly [string, string]> }>,
  },
  welcome: {
    title: `${SITE_NAME}’ne hoş geldin`,
    subtitle: 'Şemayı çiz, Oynat’a bas, devrenin neden öyle davrandığını gör. Devren bu tarayıcıda kendiliğinden kaydedilir.',
    examples: 'Örnekle başla',
    examplesText: 'Hazır bir devre aç; önce tahmin et, sonra Oynat’la doğrula.',
    blank: 'Boş tuvalde kur',
    blankText: 'Kütüphaneden parça sürükle, uçlarından kablo çek.',
    blankTextTouch: 'Parça ekle, iki dokunuşla bağla.',
    tour: 'Kısa tur',
    tourText: '4 adımda arayüzü tanı. Yaklaşık 1 dakika.',
    firstTry: 'İlk deneme için',
    reopen: 'Bu pencereyi Ayarlar → İlk açılış turunu göster ile yeniden açabilirsin.',
    skip: 'Atla',
  },
  tour: {
    label: 'Kısa tur',
    step: (n: number, total: number) => `Adım ${n} / ${total}`,
    next: 'İleri',
    end: 'Turu bitir',
    finish: 'Bitti',
    close: 'Turu kapat',
    done: 'Tur bitti. Yardım her zaman ? ile ya da üst çubuktaki Yardım düğmesiyle açılır.',
    steps: [
      {
        title: 'Parça ekle',
        desktop: 'Soldaki kütüphaneden bir parçayı tuvale **sürükle** ya da parçaya tıklayıp tuvale tıkla.',
        phone: 'Alttaki **Parça** düğmesine dokun ve bir parça seç.',
        tablet: 'Soldaki **Parça** düğmesine dokun ve bir parça seç.',
      },
      {
        title: 'Kablo çek',
        desktop: 'Bir parçanın **ucuna** tıkla, sonra bağlanacağı uca tıkla. Köşe için aradaki boşluğa tıkla.',
        phone: '**Bağla**’ya ya da bir uca dokun; sonra iki uca sırayla dokun.',
        tablet: '**Bağla**’ya ya da bir uca dokun; sonra iki uca sırayla dokun.',
      },
      {
        title: 'Oynat',
        desktop: 'Devreyi çalıştırmak için **Oynat**’a bas. Devrede toprak yoksa tek tıkla eklenir.',
        phone: 'Devreyi çalıştırmak için **Oynat**’a dokun. Devrede toprak yoksa tek dokunuşla eklenir.',
        tablet: 'Devreyi çalıştırmak için **Oynat**’a dokun. Devrede toprak yoksa tek dokunuşla eklenir.',
      },
      {
        title: 'İncele',
        desktop: 'Bir parçaya tıkla: gerilim, akım ve gücü sağdaki panelde gör; değerini çalışırken değiştir.',
        phone: 'Bir parçaya dokun: ölçümler alttaki sayfada; değeri **−/+** ile canlı değiştir.',
        tablet: 'Bir parçaya dokun: ölçümler sağdaki panelde; değeri **−/+** ile canlı değiştir.',
      },
    ] as ReadonlyArray<{ title: string; desktop: string; phone: string; tablet: string }>,
  },
  toast: {
    undo: 'Geri al',
    deleted: (what: string) => `${what} silindi.`,
    adjustSpeed: 'Hızı ayarla',
  },
  a11y: {
    skip: 'Tuvale atla',
    canvasKeys:
      'Ok tuşları: en yakın parçaya geç. Shift ve ok: seçili parçayı kaydır. Enter: değer alanı. R döndür, F ters çevir, Delete sil, Esc seçimi kaldır.',
    selected: (what: string) => `${what} seçili`,
    partList: 'Devredeki parçalar',
    pinList: 'Uçlar (Bağla kipi)',
    pin: (label: string, pin: string, connected: boolean) => `${label}, ${pin}${connected ? ', bağlı' : ''}`,
  },
  tablet: {
    tools: 'Araçlar',
    locked: 'Ölç’te kapalı',
    empty: 'Parça eklemek için soldaki **Parça** düğmesine dokun.',
    hintSelect: '**Parçaya dokun:** seç · **uca dokun:** kablo · **basılı tut:** menü · iki parmak: yakınlaştır',
    hintSelected: '**Parçayı 150 ms basılı tutup sürükle:** taşı · değerini sağdaki panelden değiştir',
    rack: (label: string) => `Cihaz rafı · ${label}`,
    rackLabel: (label: string) => `Cihazlar sekmesini aç: ${label}`,
  },
  diagnostics: {
    describe: describeDiagnostic,
    severity: { error: 'Hata', warning: 'Uyarı' } as const,
  },
};

export type Translations = typeof tr;
