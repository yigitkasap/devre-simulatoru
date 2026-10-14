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
  diode: 'Akımı yalnızca bir yönde, anottan katoda geçirir; ileri yönde yaklaşık 0,6-0,7 V düşürür.',
  zener: 'Ters yönde, kırılma (zener) geriliminde iletime geçen diyot; gerilimi sınırlamak ve kırpmak için kullanılır.',
  led: 'Işık yayan diyot; fazla akım geçerse yanar, bu yüzden seri bir ön direnç gerekir.',
  npn: 'Küçük bir baz akımıyla büyük kollektör akımını kontrol eder (IC = β · IB); yükselteç ve anahtar olarak kullanılır.',
  pnp: 'NPN’in ters kutuplusu: akım emetörden girer, kollektörden çıkar; baz emetörden düşük gerilimde olunca iletir.',
  njfet: 'Drain akımını kapı-kaynak gerilimi (VGS) kontrol eder; kapı neredeyse akım çekmez. VGS = 0’da en büyük akım (IDSS) akar.',
  pjfet: 'N kanallı JFET’in ters kutuplusu: kapıya pozitif gerilim verildikçe akım azalır.',
  nmos: 'Kapısı yalıtılmış alan etkili transistör; VGS eşik gerilimini (VT) aşınca iletime geçer. Anahtar ve yükselteç olarak kullanılır.',
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
  'yarim-dalga': {
    title: 'Yarım dalga doğrultmaç',
    description:
      'Tepe değeri 10 V, frekansı 50 Hz olan sinüs veren AC kaynak, bir diyot ve 1 kΩ’luk yük direnci seri bağlı. Osiloskobun A kanalı kaynağın, B kanalı yükün gerilimini gösteriyor; DC kipindeki voltmetre yükteki ortalama gerilimi ölçüyor.',
    question:
      'B kanalında yükün gerilimi nasıl bir şekil çizer, tepe değeri kaç volt olur? Voltmetre ne gösterir? Önce tahmin et, sonra Oynat’a bas.',
    answer:
      'Yalnızca pozitif yarım dalgalar geçer: negatif yarıda diyot ters kutuplanır ve akım kesilir. Tepe değeri ≈ 9,3 V’tur (10 V − diyotta düşen ≈ 0,7 V). Voltmetre bir periyodun ortalamasını gösterir: ≈ 9,3 V / π ≈ 2,9 V. Diyotu seçip F ile ters çevir: bu kez yalnızca negatif yarım dalgalar geçer.',
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
  'diyot-karakteristigi': {
    title: 'Diyot karakteristiği (akım-gerilim eğrisi)',
    description:
      '−5 V ile +5 V arasında gidip gelen 1 Hz’lik üçgen dalga, 1 kΩ’luk direnç üzerinden bir silisyum diyodu sürüyor. Diyodun akımı 100 Ω’luk ölçme direncinin geriliminden okunuyor. Osiloskop X-Y kipinde: yatay eksen diyot gerilimi (A, 0,2 V/bölme), dikey eksen akım (B ters çevrilmiş; 0,1 V = 1 mA).',
    question:
      'Eğri hangi gerilimden sonra hızla yükselir? En büyük akım kaç mA olur ve o anda diyodun gerilimi kaç volttur? Önce tahmin et, sonra Oynat’a bas.',
    answer:
      'Diyot ≈ 0,5–0,6 V’a kadar neredeyse hiç akım geçirmez, sonra akım üstel olarak artar. En büyük akım ≈ 4 mA’dir: I = (5 V − 0,65 V) / (1 kΩ + 100 Ω) ≈ 3,96 mA; o anda V_{D} ≈ 0,65 V. Ters yönde (eğrinin sol kısmı) akım yok denecek kadar küçüktür. Diyodun yerine bir LED koyup A’yı 0,5 V/bölmeye al: eğri ≈ 1,6–1,8 V’ta yükselir.',
  },
  'tam-dalga-orta-uclu': {
    title: 'Orta uçlu tam dalga doğrultmaç',
    description:
      'Orta uçlu bir transformatörün iki yarısı, seri bağlı iki AC kaynakla (her biri 10 V tepe, 50 Hz) gösteriliyor; orta uç toprakta. İki diyot 1 kΩ’luk yükü besliyor. A kanalı üst ucun, B kanalı yükün gerilimini gösteriyor.',
    question: 'B kanalında her periyotta kaç tepe görürsün? Çıkışın frekansı ve tepe değeri ne olur?',
    answer:
      'Pozitif yarıda D1, negatif yarıda D2 iletir; yükten hep aynı yönde akım geçer. Çıkış, girişin iki katı frekansta (100 Hz) tam dalga doğrultulmuş gerilimdir; tepe değeri ≈ 10 V − 0,67 V ≈ 9,3 V. Ortalama (DC) değer ≈ 2 · 9,3 V / π ≈ 5,9 V’tur, yarım dalga doğrultmacın iki katı.',
  },
  'kopru-filtre': {
    title: 'Köprü doğrultmaç ve filtre kondansatörü',
    description:
      '10 V tepe değerli, 50 Hz’lik AC kaynak dört diyotlu bir köprüyü besliyor; 1 kΩ’luk yükün alt ucu toprakta. S1 anahtarı yüke paralel 100 µF’lık filtre kondansatörünü bağlıyor (başta açık). A kanalı yükün gerilimini gösteriyor.',
    question:
      'Anahtar açıkken çıkışın tepe değeri kaç volt olur? Simülasyon çalışırken anahtara tıklayıp kondansatörü bağlayınca çıkış nasıl değişir?',
    answer:
      'Her yarım periyotta seri iki diyot iletir: tepe ≈ 10 V − 2 · 0,67 V ≈ 8,7 V, frekans 100 Hz. Kondansatör bağlanınca çıkış neredeyse düz bir DC olur: tepelerde dolar, aralarda yük üzerinden boşalır. Dalgalanma ≈ 0,7 V tepe-tepedir (yaklaşık formül V_{r} ≈ V_{tepe} / (2 · f · R · C) ≈ 0,86 V biraz fazlasını verir, çünkü kondansatör yarım periyodun tamamında boşalmaz). Kondansatörü büyüttükçe dalgalanma küçülür.',
  },
  'pozitif-kenetleyici': {
    title: 'Pozitif kenetleyici',
    description:
      '5 V tepe değerli, 50 Hz’lik sinüs, seri bir 10 µF’lık kondansatör ve çıkışa paralel bir diyot (anodu toprakta). 100 kΩ’luk yük, kondansatörün bir periyotta boşalmasını önlüyor. A girişi, B çıkışı gösteriyor.',
    question: 'Çıkışın en küçük ve en büyük değeri kaç volt olur? Dalganın tepe-tepe değeri değişir mi?',
    answer:
      'İlk negatif yarıda diyot iletir ve kondansatör ≈ 5 V − 0,6 V ≈ 4,4 V’a dolar; sonra çıkış, girişin bu kadar yukarı kaydırılmış halidir: ≈ −0,6 V ile ≈ 9,4 V arasında gidip gelir. Tepe-tepe değer (10 V) ve dalganın biçimi değişmez; yalnızca DC seviyesi değişir. Diyodu F ile ters çevir: negatif kenetleyici olur.',
  },
  'gerilim-ikileyici': {
    title: 'Gerilim ikileyici (katlayıcı)',
    description:
      '5 V tepe değerli, 50 Hz’lik sinüs; C1 ile D1 bir kenetleyici, D2 ile C2 bir tepe dedektörü oluşturuyor. DC kipindeki voltmetre çıkışı ölçüyor; A girişi, B çıkışı gösteriyor.',
    question: 'Çıkıştaki DC gerilim kaç volt olur? Kaynağın tepe değeriyle karşılaştır.',
    answer:
      'C1 negatif yarıda ≈ 4,4 V’a dolar; pozitif yarıda kaynakla seri bağlanır ve C2’yi kaynağın tepe değerinin yaklaşık iki katına doldurur: V_{çıkış} ≈ 2 · 5 V − 2 · 0,65 V ≈ 8,7 V. C2 birkaç periyotta (≈ 0,2 s) dolar. Devreye bu yüzden gerilim ikileyici denir; benzer basamaklar eklenerek üçleyici, dörtleyici yapılır.',
  },
  'paralel-kirpici': {
    title: 'Öngerilimli paralel kırpıcı',
    description:
      '10 V tepe değerli sinüs, 1 kΩ’luk seri direnç ve çıkışa paralel bir diyot; diyodun katodu 3 V’luk bir pile bağlı. A girişi, B çıkışı gösteriyor.',
    question: 'Çıkış hangi gerilimin üstüne çıkamaz? Negatif yarım dalgada ne olur?',
    answer:
      'Çıkış ≈ 3 V + 0,66 V ≈ 3,7 V’u aşmaya çalışınca diyot iletime geçer; fazlası R1’in üzerinde düşer ve pozitif tepeler kırpılır. Negatif yarıda diyot ters kutuplanır ve çıkış girişi aynen izler (−10 V’a iner). Pilin gerilimini değiştirerek kırpma seviyesini ayarlayabilirsin.',
  },
  'zener-kirpici': {
    title: 'Çift yönlü zener kırpıcı',
    description:
      '10 V tepe değerli sinüs, 1 kΩ’luk seri direnç ve çıkışa paralel, sırt sırta bağlı iki 5,1 V’luk zener diyot. A girişi, B çıkışı gösteriyor.',
    question: 'Çıkış hangi gerilimlerde kırpılır?',
    answer:
      'Pozitif yarıda Z1 kırılmada (≈ 4,9 V; birkaç mA’de zener gerilimi 20 mA’deki değerden biraz düşüktür), Z2 ileri yönde (≈ 0,65 V) iletir: çıkış ≈ +5,5 V’ta kırpılır. Negatif yarıda roller değişir: ≈ −5,5 V. Zenerlerden birinin yerine kablo koyup tek yönlü kırpmayı gör.',
  },
  'fet-cikis-karakteristigi': {
    title: 'JFET çıkış karakteristiği',
    description:
      'N kanallı JFET’in (I_{DSS} = 3 mA, V_{P} = −1,5 V) drain-source gerilimi, 0–10 V arasında gidip gelen 1 Hz’lik üçgen dalgayla taranıyor; V_{GG} pili kapıyı −0,5 V’ta tutuyor. Drain akımı 10 Ω’luk ölçme direncinden okunuyor. Osiloskop X-Y kipinde: yatay V_{DS} (1 V/bölme), dikey I_{D} (B ters; 10 mV = 1 mA).',
    question: 'V_{GS} = −0,5 V iken doyum bölgesindeki drain akımı kaç mA olur? Eğri hangi V_{DS}’de düzleşir?',
    answer:
      'I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})² = 3 mA · (1 − 0,5 / 1,5)² ≈ 1,33 mA; kanal boyu modülasyonu yüzünden V_{DS} = 10 V’ta ≈ 1,47 mA’e çıkar. Eğri V_{DS} ≈ V_{GS} − V_{P} = 1 V’tan sonra düzleşir: solda omik bölge, sağda doyum. V_{GG} pilini 0 V ve 1 V yap: doyum akımı ≈ 3,3 mA ve ≈ 0,37 mA olur; eğri ailesinin öbür üyelerini görürsün.',
  },
  'fet-transfer-karakteristigi': {
    title: 'JFET transfer karakteristiği',
    description:
      'Kapı gerilimi, −2 V ile 0 V arasında gidip gelen 1 Hz’lik üçgen dalgayla taranıyor; drain 10 V’ta. Osiloskop X-Y kipinde: yatay V_{GS} (0,2 V/bölme, sağ kenar 0 V), dikey I_{D} (B ters; 10 mV = 1 mA).',
    question: 'V_{GS} = 0’da ve V_{GS} = −0,75 V’ta drain akımı kaç mA olur? Eğrinin biçimi nasıldır?',
    answer:
      'V_{GS} = 0’da I_{D} = I_{DSS} ≈ 3 mA (V_{DS} = 10 V’ta λ yüzünden ≈ 3,3 mA); V_{GS} = −0,75 V’ta 3 mA · (1 − 0,5)² ≈ 0,75 mA (≈ 0,83 mA). Eğri bir paraboldür (kare yasası) ve V_{GS} = V_{P} = −1,5 V’ta sıfıra iner; kapı daha negatifken transistör kesimdedir.',
  },
  'fet-yukseltec': {
    title: 'JFET’li yükselteç (ortak kaynak)',
    description:
      '12 V besleme, R_{D} = 4,7 kΩ, kendinden öngerilim için R_{S} = 330 Ω (100 µF ile köprülü), R_{G} = 1 MΩ. Girişe 50 mV tepe değerli, 1 kHz’lik sinüs uygulanıyor; çıkış 10 µF ile 100 kΩ’luk yüke aktarılıyor. A girişi, B çıkışı gösteriyor.',
    question:
      'Çalışma noktasında I_{D} kaç mA olur? Gerilim kazancı ve çıkışın tepe değeri ne olur, giriş ile çıkış arasında faz farkı var mı?',
    answer:
      'I_{D} = I_{DSS} · (1 + I_{D} R_{S} / V_{P})² denkleminden I_{D} ≈ 1,45 mA, V_{GS} ≈ −0,48 V. g_{m} = (2 I_{DSS} / |V_{P}|) · (1 − V_{GS} / V_{P}) ≈ 2,8 mS; kazanç A_{v} ≈ −g_{m} · (R_{D} ∥ r_{o} ∥ R_{L}) ≈ −12. Çıkış ≈ 0,6 V tepe değerlidir ve girişle 180° ters fazdadır. C_{S}’yi silersen R_{S} köprülenmez ve kazanç yaklaşık yarıya düşer.',
  },
  'bjt-yukseltec': {
    title: 'BJT’li yükselteç (ortak emetör)',
    description:
      '12 V besleme, gerilim bölücülü öngerilim (R_{1} = 56 kΩ, R_{2} = 12 kΩ), R_{C} = 4,7 kΩ, R_{E} = 1,5 kΩ (100 µF ile köprülü), β = 200. Girişe 5 mV tepe değerli, 1 kHz’lik sinüs; çıkış 100 kΩ’luk yüke aktarılıyor. A girişi (2 mV/bölme), B çıkışı (0,2 V/bölme) gösteriyor.',
    question: 'I_{C} kaç mA olur? Gerilim kazancı ve çıkışın tepe değeri yaklaşık ne olur?',
    answer:
      'V_{B} ≈ 12 V · 12 / 68 ≈ 2,1 V, V_{E} ≈ 2,1 V − 0,63 V ≈ 1,45 V, I_{C} ≈ I_{E} ≈ 1,45 V / 1,5 kΩ ≈ 0,96 mA. g_{m} = I_{C} / V_{T} ≈ 37 mS; kazanç A_{v} ≈ −g_{m} · (R_{C} ∥ r_{o} ∥ R_{L}) ≈ −155. Çıkış ≈ 0,78 V tepe değerlidir ve girişle ters fazdadır. Pozitif ve negatif tepeler biraz farklıdır (≈ 0,75 V ve 0,81 V): üstel karakteristik küçük bir bozulmaya yol açar; girişi 20 mV’a çıkarıp bozulmanın arttığını gör.',
  },
  'mosfet-yukseltec': {
    title: 'MOSFET’li yükselteç (ortak kaynak)',
    description:
      '12 V besleme, gerilim bölücülü öngerilim (R_{G1} = 2,2 MΩ, R_{G2} = 1 MΩ → V_{G} = 3,75 V), R_{D} = 3,3 kΩ, R_{S} = 1 kΩ (100 µF ile köprülü); MOSFET 2N7000 benzeri (V_{T} = 2,1 V, k = 50 mA/V²). Girişe 10 mV tepe değerli, 1 kHz’lik sinüs uygulanıyor. A girişi, B çıkışı gösteriyor.',
    question: 'Çalışma noktasında I_{D} kaç mA olur? Gerilim kazancı yaklaşık ne olur?',
    answer:
      'I_{D} = k · (V_{G} − I_{D} R_{S} − V_{T})² denkleminden I_{D} ≈ 1,48 mA, V_{GS} − V_{T} ≈ 0,17 V. g_{m} = 2k · (V_{GS} − V_{T}) ≈ 18 mS (λ dahil); kazanç A_{v} ≈ −g_{m} · (R_{D} ∥ r_{o} ∥ R_{L}) ≈ −54, çıkış ≈ 0,54 V tepe değerli ve ters fazdadır. Kapı yalıtılmış olduğundan giriş direnci çok büyüktür (R_{G1} ∥ R_{G2} ≈ 690 kΩ).',
  },
  'bjt-anahtar': {
    title: 'BJT’nin anahtar olarak kullanılması',
    description:
      'AC kaynak, 0 V ile 5 V arasında gidip gelen 1 Hz’lik kare dalga veriyor (bir lojik çıkış gibi). NPN transistör 10 kΩ’luk baz direnciyle sürülüyor; kollektörde 390 Ω ve kırmızı LED 9 V’luk beslemeye bağlı. A girişi, B kollektör gerilimini (V_{CE}) gösteriyor.',
    question:
      'Giriş 5 V iken transistör doyumda mı? LED’den kaç mA geçer, V_{CE} kaç volt olur? Giriş 0 V iken ne olur?',
    answer:
      'I_{B} = (5 V − 0,75 V) / 10 kΩ ≈ 0,43 mA; β · I_{B} ≈ 85 mA olurdu, ama kollektör akımı en fazla (9 V − 1,9 V − 0,1 V) / 390 Ω ≈ 18 mA olabilir. β · I_{B} bundan çok büyük olduğu için transistör doyumdadır: V_{CE} ≈ 0,06 V ve LED yanar. Giriş 0 V’ta baz akımı yoktur: transistör kesimde, LED sönük, V_{CE} yüksek. Küçük bir baz akımı büyük bir akımı açıp kapatır.',
  },
  'toprak-tuzagi': {
    title: 'Toprak tuzağı: köprüde prob toprağı',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe) dört diyotlu bir köprüyü besliyor; yük 100 kΩ. Osiloskobun A ucu yükün + ucunda, prob toprağı (COM) yükün − ucunda. Laboratuvardaki gibi hem üretecin hem osiloskobun COM ucu şebeke toprağına bağlı.',
    question: 'Osiloskopta tam dalga mı, yarım dalga mı görürsün? Neden? Önce tahmin et, sonra Oynat’a bas.',
    answer:
      'Yarım dalga! İki cihazın COM ucu şebeke toprağı üzerinden birbirine bağlıdır. Prob toprağı yükün − ucuna takılınca D4 kısa devre olur; negatif yarıda üretecin çıkışı D3 üzerinden toprağa kısa devre olur ve yükten akım geçmez. Doğru ölçüm: COM’u üretecin COM’una (sağdaki düğüm) taşı, A’yı yükün + ucuna, B’yi − ucuna bağla; panelde B ters (INV) ve A + B (ADD) seç: ekranda A − B, yani yükün gerilimi (tam dalga, tepe ≈ 3,6 V) görünür. Osiloskobun özelliklerinden toprak bağlantısını kaldırmak (yalıtılmış osiloskop) da sorunu çözer.',
  },
  'mosfet-anahtar': {
    title: 'MOSFET’in anahtar olarak kullanılması',
    description:
      'N kanallı MOSFET’in (2N7000 benzeri, V_{T} = 2,1 V) drain’inde 390 Ω ve yeşil LED 9 V’luk beslemeye bağlı. S1 anahtarı kapıyı 5 V’a bağlıyor; 100 kΩ’luk direnç anahtar açıkken kapıyı toprağa çekiyor. Voltmetre V_{DS}’yi ölçüyor.',
    question:
      'Oynat’a bas ve anahtara tıkla. Kapı 5 V olunca MOSFET hangi bölgeye geçer, V_{DS} kaç volt olur? Kapı ne kadar akım çeker?',
    answer:
      'V_{GS} = 5 V eşik geriliminden büyük olduğu için kanal oluşur ve LED yanar. Akım LED ve 390 Ω ile ≈ (9 V − 2,2 V) / 390 Ω ≈ 17 mA’de sınırlandığından MOSFET omik bölgededir: R_{DS(on)} ≈ 1 / (2k · (V_{GS} − V_{T})) ≈ 3,4 Ω, V_{DS} ≈ 0,06 V. Kapı yalıtılmıştır, hiç akım çekmez (BJT’de 0,43 mA baz akımı gerekiyordu). Anahtar açılınca kapı toprağa çekilir, MOSFET kesime geçer ve LED söner.',
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
    speedTitle: 'Simülasyon hızı: simülasyon zamanının gerçek zamana oranı',
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
    cannotRun: 'Simülasyon çalışamıyor:',
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
      'diyot-karakteristigi': 'Diyot karakteristiklerinin incelenmesi',
      dogrultucu: 'Doğrultucu devreler',
      kenetleyici: 'Kenetleyici ve gerilim katlayıcı devreler',
      kirpici: 'Kırpıcı devreler',
      'fet-karakteristigi': 'FET karakteristiklerinin incelenmesi',
      'fet-yukseltec': 'FET yükselteci',
      'bjt-yukseltec': 'BJT’li yükselteç',
      'mosfet-yukseltec': 'MOSFET’li yükselteç devresi',
      anahtar: 'Transistörlerin anahtar olarak kullanılması',
    } as Record<ExampleGroupId, string>,
    texts: EXAMPLES,
    badge: 'Örnek',
    predict: 'Tahmin et',
    answer: 'Cevap',
    answerHidden: 'Cevabı görmek için Oynat’a bas.',
    loaded: 'Örnek yüklendi. Önceki devrene dönmek için Geri al (Ctrl+Z).',
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
    tabs: { inspect: 'İncele', example: 'Örnek', messages: 'Mesajlar' },
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
    newDone: 'Yeni devre açıldı. Önceki devrene dönmek için Geri al (Ctrl+Z).',
    imported: 'Devre içe aktarıldı. Önceki devrene dönmek için Geri al (Ctrl+Z).',
    importError: 'Bu dosya geçerli bir devre dosyası değil (sürüm 1 JSON bekleniyor).',
    sharedLoaded: 'Paylaşılan devre açıldı.',
    sharedError: 'Paylaşım bağlantısındaki devre okunamadı; bağlantı eksik kopyalanmış olabilir.',
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
    hint: 'Bir mesaja tıklayınca ilgili parça tuvalde vurgulanır.',
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
    title: (label: string) => `${label} — özellikler`,
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
    more: 'Daha fazla: görünüm, ayarlar, paylaş',
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
  diagnostics: {
    describe: describeDiagnostic,
    severity: { error: 'Hata', warning: 'Uyarı' } as const,
  },
};

export type Translations = typeof tr;
