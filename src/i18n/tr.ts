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
import { formatNumber, formatSI } from '../sim/units';
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
  inductor: 'Bobin',
  transformer: 'Transformatör',
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
  relay: 'Röle',
  motor: 'DC motor',
  potentiometer: 'Potansiyometre',
  ldr: 'LDR (fotodirenç)',
  ntc: 'NTC termistör',
  lamp: 'Akkor lamba',
  opamp: 'İşlemsel yükselteç',
  arduino: 'Arduino Uno',
  timer555: '555 zamanlayıcı',
  speaker: 'Hoparlör',
  buzzer: 'Buzzer (aktif)',
  fuse: 'Sigorta',
  voltmeter: 'Voltmetre',
  ammeter: 'Ampermetre',
  oscilloscope: 'Osiloskop',
  tank: 'Su haznesi',
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
  inductor: 'bobininin',
  transformer: 'transformatörünün',
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
  relay: 'rölesinin',
  motor: 'motorunun',
  potentiometer: 'potansiyometresinin',
  ldr: 'LDR’sinin',
  ntc: 'termistörünün',
  lamp: 'lambasının',
  opamp: 'işlemsel yükseltecinin',
  arduino: 'Arduino kartının',
  timer555: '555 zamanlayıcısının',
  speaker: 'hoparlörünün',
  buzzer: 'buzzerının',
  fuse: 'sigortasının',
  voltmeter: 'voltmetresinin',
  ammeter: 'ampermetresinin',
  oscilloscope: 'osiloskobunun',
  tank: 'su haznesinin',
};

const PIN_NAMES: Record<DeviceType, readonly string[]> = {
  battery: ['+ ucu', '− ucu'],
  acsource: ['+ ucu', '− ucu'],
  funcgen: ['çıkış (OUT) ucu', 'TTL darbe çıkışı', 'ortak ucu (COM)'],
  dcsupply: ['1. çıkışının + ucu', '1. çıkışının − ucu', '2. çıkışının + ucu', '2. çıkışının − ucu'],
  ground: ['ucu'],
  resistor: ['1. ucu', '2. ucu'],
  capacitor: ['+ ucu', '− ucu'],
  inductor: ['1. ucu', '2. ucu'],
  transformer: ['birincil sargının noktalı (•) ucu', 'birincil sargının öbür ucu', 'ikincil sargının noktalı (•) ucu', 'ikincil sargının öbür ucu'],
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
  motor: ['+ ucu', '− ucu'],
  potentiometer: ['1. ucu', 'orta ucu (sürgü)', '3. ucu'],
  ldr: ['1. ucu', '2. ucu'],
  ntc: ['1. ucu', '2. ucu'],
  lamp: ['1. ucu', '2. ucu'],
  arduino: ['5V ucu', '3V3 ucu', 'GND ucu (güç başlığı)', 'A0 analog girişi', 'A1 analog girişi', 'A2 analog girişi', 'A3 analog girişi', 'A4 analog girişi', 'A5 analog girişi', 'D2 pini', 'D3 pini (PWM ~)', 'D4 pini', 'D5 pini (PWM ~)', 'D6 pini (PWM ~)', 'D7 pini', 'D8 pini', 'D9 pini (PWM ~)', 'D10 pini (PWM ~)', 'D11 pini (PWM ~)', 'D12 pini', 'D13 pini (kart üstü L LED’i)', 'GND ucu (dijital başlık)'],
  timer555: ['GND ucu (1)', 'TRIG (tetik) ucu (2)', 'OUT (çıkış) ucu (3)', 'RESET ucu (4)', 'CONT (kontrol) ucu (5)', 'THRES (eşik) ucu (6)', 'DISCH (deşarj) ucu (7)', 'VCC ucu (8)'],
  opamp: ['eviren girişi (−)', 'evirmeyen girişi (+)', 'çıkışı', 'pozitif besleme ucu (V+)', 'negatif besleme ucu (V−)'],
  speaker: ['1. ucu', '2. ucu'],
  buzzer: ['+ ucu', '− ucu'],
  fuse: ['1. ucu', '2. ucu'],
  relay: ['sargısının 1. ucu', 'sargısının 2. ucu', 'kontağının ortak ucu (C)', 'normalde açık kontak ucu (NA)', 'normalde kapalı kontak ucu (NK)'],
  voltmeter: ['+ ucu', '− ucu'],
  ammeter: ['+ ucu', '− ucu'],
  oscilloscope: ['A kanalı', 'B kanalı', 'ortak ucu (COM)'],
  tank: ['ortak probu (dipte)', 'Seviye 1 probu', 'Seviye 2 probu', 'Seviye 3 probu'],
};

/** Bağla kipinde uç hedeflerinin üstündeki kısa etiketler (tasarım: P03). */
const PIN_TAGS: Record<DeviceType, readonly string[]> = {
  battery: ['+', '−'],
  acsource: ['+', '−'],
  funcgen: ['OUT', 'TTL', 'COM'],
  dcsupply: ['1+', '1−', '2+', '2−'],
  tank: ['COM', '1', '2', '3'],
  ground: ['⏚'],
  resistor: ['1', '2'],
  capacitor: ['+', '−'],
  inductor: ['1', '2'],
  transformer: ['P•', 'P', 'S•', 'S'],
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
  relay: ['1', '2', 'C', 'NA', 'NK'],
  motor: ['+', '−'],
  potentiometer: ['1', 'S', '3'],
  ldr: ['1', '2'],
  ntc: ['1', '2'],
  lamp: ['1', '2'],
  opamp: ['−', '+', 'OUT', 'V+', 'V−'],
  arduino: ['5V', '3V3', 'GND', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'GND'],
  timer555: ['GND', 'TRG', 'OUT', 'RST', 'CV', 'THR', 'DIS', 'VCC'],
  speaker: ['1', '2'],
  buzzer: ['+', '−'],
  fuse: ['1', '2'],
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
  tank: ['Ortak', 'Sev. 1', 'Sev. 2', 'Sev. 3'],
  ground: ['uç'],
  resistor: ['1. uç', '2. uç'],
  capacitor: ['+ uç', '− uç'],
  inductor: ['1. uç', '2. uç'],
  transformer: ['birincil •', 'birincil', 'ikincil •', 'ikincil'],
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
  relay: ['sargı 1', 'sargı 2', 'C', 'NA', 'NK'],
  motor: ['+ uç', '− uç'],
  potentiometer: ['1. uç', 'sürgü', '3. uç'],
  ldr: ['1. uç', '2. uç'],
  ntc: ['1. uç', '2. uç'],
  lamp: ['1. uç', '2. uç'],
  opamp: ['− giriş', '+ giriş', 'çıkış', 'V+', 'V−'],
  arduino: ['5V', '3V3', 'GND', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'GND'],
  timer555: ['GND', 'TRIG', 'OUT', 'RESET', 'CONT', 'THRES', 'DISCH', 'VCC'],
  speaker: ['1. uç', '2. uç'],
  buzzer: ['+ uç', '− uç'],
  fuse: ['1. uç', '2. uç'],
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
    case 'ground-unconnected':
      return {
        title: 'Toprak bağlı değil',
        detail:
          'Toprak sembolü devreye bağlı değil, bu yüzden hiçbir etkisi yok. Toprak isteğe bağlıdır; kullanmak istiyorsan ucunu bir kabloyla devreye bağla.',
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
        detail: `Bu devre parçası (${list(labels)}) toprağa bağlı değil; gerilimler kendi sıfır noktasına göre gösteriliyor. Akımlar bundan etkilenmez.`,
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
    case 'ground-return': {
      // Toprak sembolü kendi adıyla, topraklı cihaz "OSC1 osiloskobunun COM ucu" biçiminde.
      const names = d.elementIds.map((id) => {
        const type = ctx.type(id);
        return type && type !== 'ground' ? `${ctx.label(id)} ${DEVICE_GENITIVE[type]} COM ucu` : ctx.label(id);
      });
      const joined = names.length === 2 ? `${names[0]} ile ${names[1]}` : list(names);
      return {
        title: 'Akım toprak hattı üzerinden dönüyor',
        detail:
          `Akım toprak hattı üzerinden dönüyor: ${joined} binanın toprak hattıyla birbirine bağlıdır. ` +
          `Şemada aralarında kablo olmasa da toprak hattından ${formatSI(p.current ?? 0, 'A')} geçiyor.`,
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
    case 'reverse-voltage': {
      const voltage = formatSI(p.voltage ?? 0, 'V', { trim: true });
      if (first !== undefined && ctx.type(first) === 'led') {
        return {
          title: 'LED’e ters gerilim',
          detail:
            `${firstLabel}: LED ters yönde ${voltage} görüyor; gerçek bir LED en fazla ` +
            `${formatSI(p.limit ?? 5, 'V', { trim: true })}’a dayanır ve bozulabilir. LED’i çevir ya da ters gerilimi azalt.`,
        };
      }
      return {
        title: 'Diyoda ters gerilim',
        detail:
          `${firstLabel}: 1N4001 ters yönde ${voltage} görüyor; veri sayfasına göre en fazla ` +
          `${formatSI(p.limit ?? 50, 'V', { trim: true })}’a (V_{RRM}) dayanır ve bozulabilir. Daha yüksek gerilimli bir diyot kullan ` +
          '(aynı ailede 1N4004: 400 V).',
      };
    }
    case 'resistor-overpower':
      if (first !== undefined && ctx.type(first) === 'speaker') {
        return {
          title: 'Hoparlör zorlanıyor',
          detail:
            `${firstLabel} hoparlörüne ortalama ${formatSI(p.power ?? 0, 'W')} veriliyor; anma gücü ${formatSI(p.rating ?? 5, 'W', { trim: true })}. ` +
            'Bobin ısınır, yalıtımı yanabilir; doğru akım zarı bir yana iter ve ses vermeden yalnızca ısıtır. Gerilimi düşür ya da seri bir direnç koy.',
        };
      }
      if (first !== undefined && ctx.type(first) === 'potentiometer') {
        return {
          title: 'Potansiyometre ısınıyor',
          detail:
            `${firstLabel} potansiyometresinin direnç izinin bir bölümünde ${formatSI(p.power ?? 0, 'W')} harcanıyor; o bölümün payına düşen sınır ` +
            `${formatSI(p.rating ?? 0, 'W')} (bütün iz en fazla 0,05 W). Küçük potansiyometreler akım sınırlamak için değil, gerilim ` +
            'bölmek için yapılır: aşırı ısınan karbon iz yanar. Büyük akım geçen yerlerde sabit bir direnç kullan.',
        };
      }
      return {
        title: 'Direnç ısınıyor',
        detail:
          `${firstLabel} direncinde ${formatSI(p.power ?? 0, 'W')} harcanıyor; direncin güç sınırı ` +
          `${String(p.rating ?? 0).replace('.', ',')} W. Gerçek direnç aşırı ısınır, rengi kararır ve bozulabilir. ` +
          'Güç sınırı daha büyük bir direnç seç ya da akımı azalt.',
      };
    case 'fuse-blown':
      return {
        title: 'Sigorta attı',
        detail:
          `${firstLabel} sigortasının teli eridi ve devreyi açtı: içinden ${formatSI(p.current ?? 0, 'A')} geçiyordu (anma akımı ` +
          `${formatSI(p.rating ?? 1, 'A', { trim: true })}). Sigorta kabloları ve parçaları aşırı akımdan korur; kısa devre ya da aşırı yük ` +
          'giderilmeden yenisini takmak onu da attırır. Arızayı giderip “Onar” ile yeni sigorta tak.',
      };
    case 'lamp-burned':
      return {
        title: 'Lamba yandı',
        detail:
          `${firstLabel} lambasının filamanı ${formatNumber(p.temperature ?? 3695, 0)} K’e ısındı ve tungstenin erime sıcaklığını (3695 K) aştı: tel ` +
          `koptu, lamba açık devre oldu. Lambanın anma gerilimi ${formatSI(p.ratedVoltage ?? 12, 'V', { trim: true })}; çok daha yüksek bir gerilim ` +
          'filamanı saniyeden kısa sürede eritir. Gerilimi düşür ya da daha yüksek gerilimli bir lamba seç.',
      };
    case 'motor-overload':
      return {
        title: 'Motor zorlanıyor',
        detail:
          `${firstLabel} motorunun sargısında ortalama ${formatSI(p.power ?? 0, 'W')} ısıya dönüşüyor; sürekli çalışmada en fazla ` +
          `${formatSI(p.limit ?? 0, 'W')} (anma akımı). Motor yükü kaldıramıyor ya da dönmesi engellenmiş: zıt EMK küçük olduğu için akım ` +
          'büyük. Gerçek motorun sargısı ısınır ve yalıtımı yanabilir. Yük torkunu azalt.',
      };
    case 'pin-overcurrent': {
      const pin = p.pin ?? 13;
      return {
        title: 'Arduino pini aşırı yükleniyor',
        detail:
          `${firstLabel}: ${pin >= 14 ? `A${pin - 14}` : `D${pin}`} pininden ${formatSI(p.current ?? 0, 'A')} çekiliyor; ATmega328P'nin bir pini ` +
          `en fazla ${formatSI(p.limit ?? 0.04, 'A', { trim: true })} verebilir (önerilen 20 mA). Pin ve işlemci bozulabilir. LED'e seri direnç ` +
          'koy (5 V ve 20 mA için ≈ 220 Ω); motor, röle ya da lamba gibi büyük yükleri bir transistörle sür.',
      };
    }
    case 'inductor-spike':
      if (first !== undefined && ctx.type(first) === 'motor') {
        return {
          title: 'Motorun akımı aniden kesildi',
          detail:
            `Motorun akımı aniden kesildi: yüksek gerilim sıçraması (Lenz yasası). ${firstLabel} motorunun uçlarında ` +
            `${formatSI(p.voltage ?? 0, 'V')} görüldü. Sargının manyetik enerjisi bir anda kaybolamaz: akımın yolu açılınca sargının ` +
            'küçük kapasitesine boşalır. Gerçekte anahtarda ve fırçalarda kıvılcım oluşur; motoru süren transistör bozulabilir. ' +
            'Motora ters paralel bir diyot (serbest geçiş diyodu: katodu + uca) bağla.',
        };
      }
      if (first !== undefined && ctx.type(first) === 'relay') {
        return {
          title: 'Röle sargısının akımı aniden kesildi',
          detail:
            `Röle sargısının akımı aniden kesildi: yüksek gerilim sıçraması (Lenz yasası). ${firstLabel} rölesinin sargısında ` +
            `${formatSI(p.voltage ?? 0, 'V')} görüldü. Sargının manyetik alanındaki enerji bir anda kaybolamaz: akımın yolu açılınca ` +
            'sargının küçük kapasitesine boşalır. Gerçekte bu gerilim sargıyı süren transistörü bozar ya da anahtarda kıvılcım çıkarır. ' +
            'Sargıya ters paralel bir diyot (serbest geçiş diyodu: katodu + tarafa) bağla; sıçrama bir diyot gerilimiyle sınırlanır.',
        };
      }
      if (first !== undefined && ctx.type(first) === 'transformer') {
        return {
          title: 'Transformatörün akımı aniden kesildi',
          detail:
            `Transformatörün akımı aniden kesildi: yüksek gerilim sıçraması (Lenz yasası). ${firstLabel} transformatörünün sargılarında ` +
            `${formatSI(p.voltage ?? 0, 'V')} görüldü. Çekirdekteki manyetik akı bir anda kaybolamaz: akımın yolu açılınca ` +
            'depolanan enerji sargıların küçük kapasitesine ve ikincildeki yüke boşalır. Gerçekte anahtarın kontaklarında kıvılcım ' +
            'oluşur. Birincile ters paralel bir diyot ya da ikincile bir yük bu sıçramayı sınırlar.',
        };
      }
      return {
        title: 'Bobin akımı aniden kesildi',
        detail:
          `Bobin akımı aniden kesildi: yüksek gerilim sıçraması (Lenz yasası). ${firstLabel} bobininin uçlarında ` +
          `${formatSI(p.voltage ?? 0, 'V')} görüldü. Bobin akımının değişmesine karşı koyar (v = L·di/dt): akımın yolu ` +
          'açılınca depoladığı ½LI² enerjisi sargının küçük kapasitesine boşalır. Gerçekte anahtarın kontaklarında kıvılcım ' +
          '(ark) oluşur. Bobine ters paralel bir diyot (serbest geçiş diyodu) bağlarsan sıçrama bir diyot gerilimiyle sınırlanır.',
      };
    case 'capacitor-reverse':
      return {
        title: 'Elektrolitik kondansatöre ters gerilim',
        detail:
          `${firstLabel}: elektrolitik kondansatör ters yönde ${formatSI(p.voltage ?? 0, 'V', { trim: true })} görüyor; üretici en fazla ` +
          `${formatSI(p.limit ?? 1, 'V', { trim: true })}’a izin verir. Kondansatör ısınır, gaz yapar ve bozulabilir. + ucunu yüksek ` +
          'gerilim tarafına çevir ya da seramik/film (kutupsuz) kondansatör kullan.',
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
  ground: 'Devrenin 0 V referans noktası. İsteğe bağlıdır: yoksa her devre parçası için otomatik bir sıfır noktası seçilir.',
  resistor: 'Üzerinden geçen akımla orantılı bir gerilim düşümü oluşturur: V = I · R.',
  capacitor: 'Yük depolar; bir direnç üzerinden zamanla dolar ya da boşalır.',
  inductor:
    'Akımı manyetik alanında enerji olarak depolar ve akımın değişmesine karşı koyar: v = L · di/dt (Faraday ve Lenz yasaları). Sargısının küçük bir direnci vardır.',
  transformer:
    'Aynı çekirdeğe sarılı iki bobin: birincildeki değişen akım, ikincilde sarım oranıyla orantılı bir gerilim indükler (Faraday). Doğru akımı geçirmez; iki taraf arasında iletken yol yoktur (galvanik yalıtım).',
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
  potentiometer:
    'Ayarlı direnç: üç ucu vardır, orta uç (sürgü) direnç üzerinde kayar. 1. uç ile 3. uç arasındaki direnç sabittir; sürgü onu ikiye böler. Uçlarına gerilim verilince sürgüden ayarlanabilir bir gerilim alınır (gerilim bölücü). Simülasyon sırasında kaydırıcıyla çevrilir.',
  ldr:
    'Işığa duyarlı direnç (kadmiyum sülfür): ışık arttıkça direnci azalır. Karanlıkta ≈ 1 MΩ, oda ışığında birkaç kΩ, güneş altında yüz ohm mertebesindedir. Aydınlık simülasyon sırasında kaydırıcıyla değiştirilir.',
  ntc:
    'Sıcaklığa duyarlı direnç (negatif sıcaklık katsayılı): sıcaklık arttıkça direnci üstel olarak azalır; 25 °C’ta 10 kΩ, 100 °C’ta ≈ 680 Ω. Sıcaklık simülasyon sırasında kaydırıcıyla değiştirilir.',
  arduino:
    'ATmega328P işlemcili geliştirme kartı. Seçtiğin örnek program işlemcide komut komut çalışır (16 MHz): dijital pinler 0 ya da 5 V verir (digitalWrite) ya da gerilimi okur (digitalRead); A0–A5 girişleri 0–5 V’u 0–1023 arası bir sayıya çevirir (analogRead); ~ işaretli pinler (D3, D5, D6, D9, D10, D11) PWM kare dalgası verir (analogWrite). Kart USB’den 5 V ile beslenir; 5V ve 3V3 uçları devreyi besleyebilir. GND, devrenin ortak ucudur.',
  timer555:
    'İki karşılaştırıcı ve bir flip-flop: TRIG 1/3·V_CC’nin altına inince çıkış yüksek olur, THRES 2/3·V_CC’yi geçince düşük olur ve DISCH ucu toprağa bağlanır. Bir kondansatör ve dirençlerle kare dalga üreteci (astabil) ya da süre ölçen zamanlayıcı (monostabil) kurulur.',
  opamp:
    'Çok yüksek kazançlı fark yükselteci (741): çıkış, iki girişin farkının ≈ 200 000 katıdır ve besleme gerilimleriyle sınırlıdır. Çıkıştan eviren girişe geri besleme verilince kazancı yalnızca dirençlere bağlı bir yükselteç olur; geri beslemesiz bir karşılaştırıcıdır. V+ ve V− uçları beslenmelidir.',
  speaker:
    'Elektrik akımını sese çevirir: mıknatısın alanındaki bobinden geçen değişen akım bobini ve ona bağlı zarı (koniyi) titreştirir (F = B·I·L). Sesi tarayıcıda gerçekten duyarsın. Doğru akım ses vermez, yalnızca bobini ısıtır.',
  buzzer:
    'İçinde osilatör olan sesli uyarıcı: doğru gerilim verilince kendiliğinden 2,4 kHz’lik bir ses çıkarır. Kutupludur (+ uç solda); ters bağlanınca çalışmaz. Sesi tarayıcıda gerçekten duyarsın.',
  fuse:
    'İnce bir tel: içinden geçen akım onu ısıtır, akım çok büyürse tel erir ve devreyi açar. Kısa devrede kabloların ısınıp yangın çıkarmasını önler. Atan sigorta Onar ile yenisiyle değiştirilir.',
  lamp:
    'Tungsten telden (filaman) akım geçince tel ≈ 2500 K’e ısınır ve ışık verir. Metallerin direnci sıcaklıkla arttığı için soğuk filamanın direnci sıcağının ≈ 13’te biridir: lamba yakıldığı an çok büyük bir akım çeker. Gerilimi fazla gelirse filaman erir.',
  motor:
    'Elektrik enerjisini dönme hareketine çevirir: mıknatısın alanındaki akım taşıyan sargıya kuvvet etkir (F = I·L·B). Dönen sargıda hızla orantılı bir zıt EMK indüklenir (Lenz) ve akımı sınırlar; bu yüzden motor dururken çok, boşta dönerken az akım çeker. Dışarıdan çevrilince jeneratör olur.',
  relay:
    'Elektromıknatısla çalışan anahtar: sargısından yeterli akım geçince demir paleti çeker ve kontağı değiştirir (C, NK’dan ayrılıp NA’ya değer). Küçük bir akımla, sargıdan yalıtılmış başka bir devreyi açıp kapatır.',
  voltmeter: 'İki nokta arasındaki gerilimi ölçer; ölçülen parçaya paralel bağlanır.',
  ammeter: 'İçinden geçen akımı ölçer; devreye seri bağlanır.',
  tank:
    'Su seviyesi probları olan hazne (baraj). Su bir proba ulaşınca o prob ile dipteki ortak prob arasında suyun direnci oluşur ve akımı sudaki iyonlar taşır; elektrotlarda ≈ 1,5–2 V elektrolize harcanır. Kuru prob açık devredir. Seviye elle ya da Doldur / Boşalt ile zamanla değişir.',
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
  if (type === 'tank' && key === 'mode') return 'Su akışı';
  if (type === 'relay' && key === 'inductance') return 'Sargı endüktansı (palet açıkken)';
  if (type === 'potentiometer' && key === 'resistance') return 'Toplam direnç (1–3 arası)';
  if (type === 'potentiometer' && key === 'position') return 'Sürgünün konumu (1. uçtan)';
  if (type === 'ldr' && key === 'illuminance') return 'Aydınlık (lüks)';
  if (type === 'ldr' && key === 'lightResistance') return '10 lüksteki direnç';
  if (type === 'ldr' && key === 'gamma') return 'γ (log R₁₀ / R₁₀₀)';
  if (type === 'ntc' && key === 'temperature') return 'Ortam sıcaklığı (°C)';
  if (type === 'ntc' && key === 'resistance25') return '25 °C’taki direnç';
  if (type === 'lamp' && key === 'ratedVoltage') return 'Anma gerilimi';
  if (type === 'fuse' && key === 'rating') return 'Anma akımı';
  if (type === 'lamp' && key === 'ratedPower') return 'Anma gücü';
  if (type === 'motor') {
    const motor: Record<string, string> = {
      loadTorque: 'Yük torku (mN·m)',
      armatureResistance: 'Sargı direnci',
      armatureInductance: 'Sargı endüktansı',
      torqueConstant: 'Tork sabiti k (mN·m/A)',
      inertia: 'Rotor ataleti J (g·cm²)',
      frictionTorque: 'Sürtünme torku (mN·m)',
    };
    if (motor[key]) return motor[key];
  }
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
    level: 'Su seviyesi (başlangıç)',
    fillTime: 'Dolma süresi (boştan doluya)',
    waterResistance: 'Su direnci (iki ıslak prob arası)',
    waveform: 'Dalga biçimi',
    amplitude: 'Tepe gerilimi',
    frequency: 'Frekans',
    offset: 'DC kayma',
    voltage: 'Gerilim',
    internalResistance: 'İç direnç',
    resistance: 'Direnç',
    capacitance: 'Kapasite',
    inductance: 'Endüktans',
    dcResistance: 'Sargı direnci (DC)',
    coilResistance: 'Sargı direnci',
    pullInVoltage: 'Çekme gerilimi',
    dropOutVoltage: 'Bırakma gerilimi',
    turnsRatio: 'Sarım oranı N₁ / N₂',
    primaryInductance: 'Birincil endüktansı L₁',
    coupling: 'Kuplaj katsayısı k',
    primaryResistance: 'Birincil sargı direnci',
    secondaryResistance: 'İkincil sargı direnci',
    initialVoltage: 'Başlangıç gerilimi',
    powerRating: 'Güç sınırı',
    kind: 'Tür',
    color: 'Renk',
    program: 'Program',
    closed: 'Anahtar kapalı (akım geçirir)',
  };
  return labels[key] ?? key;
}

/** Seçmeli özelliklerin seçenek adları. */
const OPTION_LABELS: Record<string, Record<string, string>> = {
  color: { red: 'Kırmızı', yellow: 'Sarı', green: 'Yeşil', blue: 'Mavi' },
  powerRating: { '0.125': '1/8 W (0,125 W)', '0.25': '1/4 W (0,25 W)', '0.5': '1/2 W (0,5 W)', '1': '1 W', '2': '2 W', '5': '5 W' },
  kind: { electrolytic: 'Elektrolitik (kutuplu, +)', film: 'Seramik / film (kutupsuz)' },
  waveform: { sine: 'Sinüs', square: 'Kare', triangle: 'Üçgen' },
  mode: { dc: 'DC (ortalama)', ac: 'AC (etkin değer)', stop: 'Dur', fill: 'Doldur', drain: 'Boşalt' },
  input: { real: '1 MΩ ‖ 25 pF (gerçek)', ideal: 'İdeal (akım çekmez)' },
  program: {
    blink: 'Yanıp sönen LED (Blink)',
    dugme: 'Düğmeyle LED',
    sayac: 'Düğme sayacı (Seri ekran)',
    'trafik-isigi': 'Trafik ışığı',
    fade: 'Nefes alan LED (PWM)',
    potansiyometre: 'Potansiyometreyle parlaklık',
    'gece-lambasi': 'Gece lambası (LDR)',
    termometre: 'Termometre (NTC)',
    'pwm-filtre': 'PWM’den doğru gerilim',
    melodi: 'Melodi (tone)',
    role: 'Röleyle lamba',
  },
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
  /** Devrenin kurulumu: parçalar, değerler, ölçü aletlerinin yeri ve ne yapılacağı. */
  readonly description: string;
  /** Devrenin ne işe yaradığı, dayandığı fizik yasası ve simülasyonda görülen sayılar. */
  readonly purpose: string;
  /** Günlük hayatta nerelerde kullanıldığı. */
  readonly everyday: string;
}

/** Şemada kaçınılmaz bir kablo kesişmesi olan örneklerde açıklamanın sonuna eklenir. */
const CROSSING = 'Dolu nokta olmayan kablo kesişmeleri bağlı değildir.';

const EXAMPLES: Record<ExampleId, ExampleTexts> = {
  'ard-blink': {
    title: 'Arduino: yanıp sönen LED',
    description:
      'Arduino Uno’nun D13 pini 220 Ω’luk dirençle kırmızı bir LED’i sürüyor; LED’in katodu dijital pinlerin yanındaki GND’ye bağlı. Kartın “Yanıp sönen LED (Blink)” programı çalışıyor: Oynat’a bas, kodu Arduino panelinde gör.',
    purpose:
      'Bir mikrodenetleyicinin en temel işi: digitalWrite(13, HIGH) pini 5 V’a, LOW 0 V’a bağlar; delay(500) işlemciyi yarım saniye bekletir. Pin, ≈ 25 Ω’luk iç direnciyle bir gerilim kaynağı gibidir: LED yanarken akım (5 V − 1,8 V) / (220 Ω + 25 Ω) ≈ 13 mA. Kartın üstündeki L LED’i de D13’ü izler. Program işlemcide gerçek zamanlamayla çalışır: kenarlar 1 s arayla gelir.',
    everyday:
      'Cihazlardaki durum ışıkları, bisiklet arka lambaları, uyarı flaşörleri: hepsinde bir zamanlayıcı ya da küçük bir mikrodenetleyici bir LED’i belirli aralıklarla açıp kapatır.',
  },
  'ard-dugme': {
    title: 'Arduino: düğmeyle LED',
    description:
      'D2 pinine bir düğme (anahtar) bağlı, düğmenin öbür ucu GND’de; D13’te 220 Ω’luk dirençle bir LED var. Program D2’yi INPUT_PULLUP kipinde okuyor. Anahtara tıklayıp kapat: LED yanar.',
    purpose:
      'Dijital giriş ve çekme direnci: INPUT_PULLUP, pini kartın içindeki ≈ 35 kΩ’luk bir dirençle 5 V’a bağlar. Düğme açıkken pin 5 V’tur (HIGH); basılınca pin GND’ye bağlanır (LOW) ve dirençten 5 V / 35 kΩ ≈ 0,14 mA geçer. Çekme direnci olmasaydı açık düğmede pin boşta kalır, okunan değer rastgele değişirdi. Program basılıyken LED’i yakar (≈ 13 mA).',
    everyday:
      'Kumandaların, klavyelerin, asansör ve zil düğmelerinin hepsi bir pini GND’ye çeken anahtarlardır; mikrodenetleyici pinin LOW’a inişini basış olarak okur.',
  },
  'ard-sayac': {
    title: 'Arduino: düğme sayacı (Seri ekran)',
    description:
      'D2’de GND’ye bağlanan bir düğme var. Program her basışı sayar ve sayıyı Seri ekrana yazar. Oynat’a bas, anahtarı kapatıp aç; Arduino panelindeki Seri ekranda “Basış sayısı” artar.',
    purpose:
      'Kenar algılama: program pinin yalnızca HIGH’dan LOW’a geçtiği anı (düşen kenar) sayar; düğme basılı kaldıkça sayı artmaz. Seri ekran, Arduino’nun USB üzerinden bilgisayara yazdığı metindir (Serial.println, 9600 baud): kodun içini görmenin en kolay yolu. Gerçek düğmeler basılırken birkaç ms titreşir (zıplama); burada anahtar idealdir, bu yüzden 5 ms’lik bekleme yeterlidir.',
    everyday:
      'Turnike ve kapı sayaçları, adımsayarlar, üretim bandındaki parça sayaçları bir sensörün kenarlarını sayar.',
  },
  'ard-trafik-isigi': {
    title: 'Arduino: trafik ışığı',
    description:
      'Kırmızı (D12), sarı (D11) ve yeşil (D10) LED’ler, her biri 220 Ω’luk dirençle bağlı; katotlar üstteki ortak hatla GND’ye dönüyor. Program ışıkları sırayla yakar: kırmızı 3 s, kırmızı + sarı 1 s, yeşil 3 s, sarı 1 s.',
    purpose:
      'Bir durum makinesi: program dört durumu sırayla dolaşır ve her durumda üç pini birden ayarlar. LED renkleri farklı ileri gerilimlere sahiptir, bu yüzden aynı dirençle akımlar biraz farklıdır: kırmızı (≈ 1,8 V) 13,0 mA, sarı (≈ 2,0 V) 12,1 mA, yeşil (≈ 2,1 V) 11,7 mA. Her LED ayrı direnç ister: LED’ler tek dirençle paralel bağlanırsa akımı ileri gerilimi en küçük olan kapar.',
    everyday:
      'Gerçek trafik ışıkları, yaya geçitleri ve demiryolu bariyerleri aynı mantıkla çalışır; bekleme süreleri trafiğe göre ayarlanır.',
  },
  'ard-fade': {
    title: 'Arduino: nefes alan LED (PWM)',
    description:
      'D9’daki LED’in parlaklığını program analogWrite ile yavaşça artırıp azaltıyor. LED 220 Ω’luk dirençle bağlı. Oynat’a bas ve LED’i izle; D9’a bir osiloskop bağlarsan pindeki kare dalgayı görürsün.',
    purpose:
      'PWM (darbe genişlik modülasyonu): Arduino gerçek bir analog gerilim üretemez; analogWrite(9, n) pini 490 Hz’lik bir kare dalgayla açıp kapatır ve n/255 oranında açık tutar. LED saniyede 490 kez yanıp söner; göz bunu ayıramaz ve ortalama akımı parlaklık olarak görür. D3, D5, D6, D9, D10 ve D11 PWM verebilir (~ işaretli pinler).',
    everyday:
      'Telefon ve dizüstü ekranlarının arka ışığı, LED ampullerin kısılması, bilgisayar fanlarının ve küçük motorların hız ayarı PWM ile yapılır.',
  },
  'ard-potansiyometre': {
    title: 'Arduino: potansiyometreyle parlaklık',
    description:
      '10 kΩ’luk potansiyometrenin uçları 5V’a ve GND’ye, sürgüsü A0’a bağlı. Program A0’ı okur, değeri Seri ekrana yazar ve D9’daki LED’in PWM değerini ayarlar. Potansiyometrenin sürgüsünü kaydır.',
    purpose:
      'Analog giriş: analogRead, A0’daki 0–5 V’u 10 bitlik bir sayıya (0–1023) çevirir; bir adım 5 V / 1024 ≈ 4,9 mV’tur. Sürgü ortadayken (%50) 2,50 V → 511; %20’de 1,03 V → 210. map() bu sayıyı PWM’in 0–255 aralığına ölçekler (511 → 127). Potansiyometre bir gerilim bölücüdür: A0 çok küçük akım çektiği için sürgünün gerilimi konumla doğru orantılıdır.',
    everyday:
      'Ses düğmeleri, ışık dimmerleri, oyun kollarının eksenleri, 3B yazıcı ve robotlardaki açı algılayıcıları gerilimi bir ADC’yle okunan potansiyometrelerdir.',
  },
  'ard-gece-lambasi': {
    title: 'Arduino: gece lambası (LDR)',
    description:
      'LDR (üstte, 5V’a) ile 10 kΩ’luk direnç (altta, GND’ye) bir gerilim bölücü kuruyor; orta nokta A0’da. A0’da okunan değer 300’ün altına inince program D13’teki LED’i yakar. LDR’nin aydınlığını kaydırıcıyla azalt.',
    purpose:
      'Sensör + karar: oda ışığında (100 lx) LDR ≈ 3,8 kΩ, A0 ≈ 3,6 V → 744: lamba sönük. Aydınlık 10 lx’e inince LDR büyür, okunan değer 413’e düşer; gece (1 lx) LDR ≈ 60 kΩ, A0 ≈ 0,75 V → 154 < 300: LED yanar. Eşiği koddaki THRESHOLD belirler; karar eşik çevresinde gidip gelmesin diye gerçek ürünlerde iki ayrı eşik (histerezis) kullanılır.',
    everyday:
      'Sokak lambaları, otomatik far sistemleri, telefonların ekran parlaklığı ve gece lambaları ışık algılayıcısıyla kendini açıp kapatır.',
  },
  'ard-termometre': {
    title: 'Arduino: termometre (NTC)',
    description:
      '10 kΩ’luk direnç (üstte, 5V’a) ile 10 kΩ’luk NTC termistör (altta, GND’ye) bir gerilim bölücü; orta nokta A0’da. Program NTC’nin direncini hesaplar, sıcaklığa çevirir ve Seri ekrana yazar. NTC’nin sıcaklığını kaydırıcıyla değiştir.',
    purpose:
      'Ölçümü sayıdan fiziğe çevirmek: önce bölücü formülüyle direnç bulunur, R = 10 kΩ · n / (1023 − n); sonra B parametresi denklemiyle sıcaklık, 1/T = 1/T₂₅ + ln(R / R₂₅) / B (B = 3977 K). 25 °C’ta 9,98 kΩ → 25,0 °C, 60 °C’ta 2,49 kΩ → 59,7 °C; 0 °C’ta 0,7 °C okunur. Fark, B denkleminin üreticinin gerçek R(T) eğrisine ancak yaklaşmasındandır: daha doğru ölçüm için Steinhart-Hart denklemi ya da üreticinin tablosu kullanılır.',
    everyday:
      'Dijital ateş ölçerler, buzdolabı ve klimaların sıcaklık algılayıcıları, 3B yazıcıların ve şarj aletlerinin sıcaklık korumaları NTC ile ölçer.',
  },
  'ard-pwm-filtre': {
    title: 'Arduino: PWM’den doğru gerilim',
    description:
      'D9’un PWM çıkışı 10 kΩ’luk direnç ve 10 µF’lık kondansatörden oluşan bir alçak geçiren süzgece bağlı; voltmetre kondansatörün gerilimini ölçüyor. Program doluluk oranını her 3 saniyede bir değiştirir (64, 128, 192, 255, 0) ve beklenen gerilimi Seri ekrana yazar.',
    purpose:
      'Süzgeç PWM’i ortalamasına çevirir: zaman sabiti τ = R·C = 0,1 s, PWM periyodunun (2 ms) 50 katı; kondansatör her periyotta çok az dolup boşalır. Doluluk 64/255’te voltmetre 1,253 V, 128/255’te 2,512 V gösterir: V ≈ 5 V · n / 255. Kalan dalgalanma birkaç on mV’tur; τ büyütülürse azalır ama gerilim yeni değere daha yavaş oturur.',
    everyday:
      'Ucuz ses ve gerilim çıkışları, motor sürücülerinin referansları ve birçok elektronik cihazdaki “dijitalden analoğa” dönüşüm PWM ve bir RC süzgeciyle yapılır.',
  },
  'ard-melodi': {
    title: 'Arduino: melodi (tone)',
    description:
      'D8, 150 Ω’luk dirençle bir hoparlöre bağlı. Program tone() ile notaları sırayla çalar (Twinkle Twinkle Little Star). Sesi duymak için simülasyon hızı ×1 olmalı.',
    purpose:
      'tone(8, f) pinden f frekanslı bir kare dalga verir: La (A4) 440 Hz, Do (C4) 262 Hz. Hoparlörün bobini her kenarda zarı iter ve çeker. 150 Ω’luk direnç pin akımını sınırlar: 5 V / (150 Ω + 25 Ω + 7,2 Ω) ≈ 27 mA, pinin 40 mA sınırının altında. Direnç olmadan 8 Ω’luk hoparlör pinden ≈ 150 mA çekerdi ve pini bozardı; güçlü ses için bir transistör ya da ses yükselteci kullanılır.',
    everyday:
      'Mikrodalga fırınların, çamaşır makinelerinin, oyuncakların ve alarm saatlerinin bip sesleri ve basit melodileri bir mikrodenetleyicinin kare dalgasıdır.',
  },
  'ard-role': {
    title: 'Arduino: röleyle lamba',
    description:
      'D7, 1 kΩ’luk dirençle bir BC547B transistörünün bazına bağlı. Transistör 12 V’luk rölenin sargısını açıp kapatıyor; sargıya ters paralel bir 1N4001 diyodu bağlı. Rölenin kontağı 12 V’luk lambayı yakar. Program röleyi 2 s çekili, 2 s bırakık tutar.',
    purpose:
      'Arduino’nun pini 5 V ve en çok 40 mA verir; rölenin 12 V’luk sargısı 43,5 mA ister. Transistör anahtar olarak çalışır: pin 4,2 mA’lik baz akımı verir, transistör doyuma girer ve sargıyı 12 V’a bağlar. Röle kontağı ise lambayı Arduino’dan tamamen ayrı bir devrede anahtarlar. Sargının akımı kesildiğinde manyetik enerjisi yüksek bir gerilim sıçraması yapar (Lenz yasası); diyot bu akıma yol vererek transistörü korur.',
    everyday:
      'Akıllı prizler, otomatik sulama sistemleri, ev otomasyonu ve garaj kapısı açıcıları, küçük bir denetleyicinin büyük yükleri (lamba, pompa, motor) röleyle anahtarlamasıdır.',
  },
  'led-on-direnc': {
    title: 'LED ve ön direnç',
    description:
      'İdeal 5 V’luk pil, 330 Ω’luk ön direnç, ampermetre ve kırmızı bir LED tek bir döngüde seri bağlı: akım pilin + ucundan çıkar, LED’den geçer ve alt hattan pilin − ucuna döner.',
    purpose:
      'LED’i güvenli bir akımla yakar. LED iletirken üzerindeki gerilim neredeyse sabittir (kırmızıda ≈ 1,8 V); kalan gerilim ön dirence düşer ve akımı Ohm yasası belirler: I = (5 V − 1,8 V) / 330 Ω ≈ 9,7 mA. Direnç olmasaydı akımı sınırlayan bir şey kalmazdı. Ön direnci 100 Ω’a düşür: akım 30 mA’i aşar ve LED yanar.',
    everyday:
      'Cihazlardaki açık/kapalı ve şarj ışıkları, klavye ve ekran arka ışıkları, araç ve trafik LED’leri: her LED’in önünde akımı sınırlayan bir direnç ya da bir LED sürücüsü vardır.',
  },
  'gerilim-bolucu': {
    title: 'Gerilim bölücü',
    description:
      'İki eşit direnç (1 kΩ + 1 kΩ) ideal 9 V’luk pile seri bağlı. Voltmetre, dirençlerin birleştiği orta nokta ile alt hat arasındaki gerilimi ölçüyor.',
    purpose:
      'Bir gerilimi istenen oranda küçültür. Seri dirençlerden aynı akım geçer (Kirchhoff’un akım yasası), bu yüzden pilin gerilimi dirençlerle orantılı paylaşılır: V_{çıkış} = V · R_{2} / (R_{1} + R_{2}) = 9 V · 1 kΩ / 2 kΩ = 4,5 V. Dirençlerden birinin değerini değiştirip oranın nasıl değiştiğine bak.',
    everyday:
      'Ses ayar düğmesi (potansiyometre) ayarlanabilir bir gerilim bölücüdür. Pil göstergeleri ve şarj devreleri ölçtükleri gerilimi bölücüyle küçültür; ışık ve sıcaklık sensörleri (LDR, termistör) de bir bölücünün içinde çalışır.',
  },
  'voltmetre-yukleme': {
    title: 'Voltmetrenin yükleme etkisi',
    description:
      '12 V’luk ideal kaynağa seri bağlı 200 kΩ’luk direnç, iç direnci büyük bir sensörü temsil ediyor. Çıkışı iç direnci 1 MΩ olan bir voltmetre ölçüyor.',
    purpose:
      'Ölçü aletinin ölçtüğü devreyi nasıl değiştirdiğini gösterir. Voltmetre de bir dirençtir: 200 kΩ ile bir gerilim bölücü kurar ve 12 V yerine 10 V okunur: V = 12 V · R_{V} / (200 kΩ + R_{V}). Voltmetrenin iç direnci, ölçülen devreninkinden çok büyük olmalıdır: 20 MΩ yapınca okuma ≈ 11,88 V’a çıkar.',
    everyday:
      'Dijital multimetrelerin iç direnci 10 MΩ civarındadır; pH metreler ve bazı sensörler için çok daha yüksek dirençli girişler gerekir. Elektronikte sinyali yüklemeden aktaran tampon (buffer) katları bu yüzden kullanılır.',
  },
  'ampermetre-etkisi': {
    title: 'Ampermetrenin etkisi',
    description: '12 V’luk ideal kaynak, 100 Ω’luk (2 W’lık) direnç ve iç direnci 1 Ω olan bir ampermetre seri bağlı.',
    purpose:
      'Ampermetrenin de akıma karşı koyduğunu gösterir. Ampermetre devreye seri girer ve iç direnci toplam dirence eklenir: I = 12 V / (100 Ω + 1 Ω) ≈ 118,8 mA (ideal ölçümde 120 mA olurdu). Ampermetrenin iç direnci, devredeki dirençlerden çok küçük olmalıdır. İdeal ampermetreye geçip farkı gör.',
    everyday:
      'Pens ampermetreler akımı kabloyu kesmeden, telin çevresindeki manyetik alandan ölçer ve devreye hiç direnç eklemez. Güç kaynaklarındaki akım ölçme dirençleri (şönt) bu yüzden miliohm düzeyindedir.',
  },
  'rc-dolma': {
    title: 'RC dolma',
    description:
      '10 V’luk pil, anahtar, 1 kΩ’luk direnç ve 100 µF’lık kondansatör seri bağlı; voltmetre kondansatörün gerilimini ölçüyor. Hızı ×0,1’e çek, Oynat’a bas ve anahtara tıkla.',
    purpose:
      'Kondansatörde yükün zamanla birikmesini gösterir. Kondansatör doldukça gerilimi artar, direnç üzerindeki gerilim ve dolayısıyla akım azalır: v = 10 V · (1 − e^(−t/τ)), τ = R · C = 0,1 s. t = τ’da ≈ 6,3 V (%63), 5τ = 0,5 s’de ≈ 9,9 V. Anahtarı açınca kondansatör yükünü korur; yalnızca voltmetrenin 10 MΩ’luk iç direnci üzerinden çok yavaş boşalır.',
    everyday:
      'Fotoğraf makinesi flaşının kondansatörü, zamanlayıcı devreler (ör. 555 entegresi), cihazların açılışta kendini sıfırlama (reset) devreleri ve düğme sıçramasını bastıran devreler RC zaman sabitine dayanır.',
  },
  'rl-devresi': {
    title: 'RL devresi',
    description:
      '10 V’luk pil, anahtar, 100 Ω’luk (1 W’lık) direnç, ampermetre ve 10 mH’lik bobin (sargı direnci 12 Ω) seri bağlı; voltmetre bobinin uç gerilimini ölçüyor. Hızı ×0,001’e çek, Oynat’a bas, anahtarı kapat, sonra aç.',
    purpose:
      'Bobinin akımdaki değişime karşı koymasını gösterir (Faraday ve Lenz yasaları: v = L · di/dt). Anahtar kapanınca akım hemen yükselmez: ilk anda bütün gerilim bobindedir; akım τ = L / (R + R_{L}) ≈ 89 µs’lik bir üstelle 10 V / 112 Ω ≈ 89 mA’e çıkar ve bobinde yalnızca sargı direncinin payı (≈ 1,07 V) kalır. Manyetik alanda ½LI² ≈ 40 µJ enerji birikir. Anahtar açılınca akımın yolu kesilir, bobin akımı sürdürmeye çalışır ve uçlarında kilovoltlarca bir gerilim sıçraması olur; Mesajlar’da uyarı çıkar.',
    everyday:
      'Arabaların ateşleme bobini bu sıçramayla bujide kıvılcım çakar. Telefon şarj aletleri gibi anahtarlamalı güç kaynakları ve DC-DC dönüştürücüler, bobinin akımı sürdürme eğilimini kullanır. Aynı etki röle ve şalter kontaklarında kıvılcıma ve aşınmaya yol açar.',
  },
  'bobin-serbest-gecis': {
    title: 'Bobin ve serbest geçiş diyotu',
    description:
      'RL devresindeki bobine ters paralel bir 1N4001 bağlı (katodu bobinin üst ucunda): serbest geçiş (flyback) diyodu. Anahtar kapalıyken diyot ters kutuplanmıştır, akım geçirmez. Hızı ×0,001’e çek, anahtarı kapat, sonra aç.',
    purpose:
      'Bobinin akımı kesildiğinde oluşan yüksek gerilimi zararsız hâle getirir. Anahtar açılınca bobin akımı diyot üzerinden dolaşmaya devam eder: bobinin üst ucu yalnızca bir diyot gerilimi kadar (≈ −0,6 V) eksiye iner, kilovoltluk sıçrama olmaz ve uyarı çıkmaz. Akım sargı direnci ve diyot üzerinden yaklaşık bir milisaniyede söner; ½LI² ≈ 40 µJ’lük enerji ısıya dönüşür.',
    everyday:
      'Rölelerin, solenoid valflerin, elektrikli kapı kilitlerinin ve DC motorların sürücülerinde bobine ters paralel bir diyot bağlanır; diyot olmasa sürücü transistör ilk kapanışta bozulabilir. Bilgisayar fanlarının ve araç rölelerinin devre kartlarında bu diyodu görebilirsin.',
  },
  'diyot-yonu': {
    title: 'Diyot yönü',
    description: 'İdeal 5 V’luk pil, 1 kΩ’luk direnç, ileri yönde bağlı bir silisyum diyot ve seri bir ampermetre.',
    purpose:
      'Diyodun akımı yalnızca bir yönde geçirdiğini gösterir. İleri yönde diyot ≈ 0,65 V düşürür ve akım I = (5 V − 0,65 V) / 1 kΩ ≈ 4,35 mA olur. Diyodu seçip F’ye bas (ya da sağ tıklayıp “Ters çevir”i seç) ve yeniden Oynat’a bas: ters yönde yalnızca çok küçük bir sızıntı akımı geçer, ampermetre neredeyse sıfır gösterir.',
    everyday:
      'Pil ters takılınca cihazı korumak için girişe seri bir diyot konur. Şarj cihazlarındaki doğrultmaçlar, güneş panellerindeki bypass diyotları ve araçların alternatöründeki diyotlar akımın yönünü bu şekilde denetler.',
  },
  'rc-kare-dalga': {
    title: 'Kare dalga ile RC',
    description:
      'AC kaynak 0 V ile 10 V arasında gidip gelen 1 Hz’lik kare dalga veriyor (5 V tepe + 5 V DC kayma). 1 kΩ’luk direnç üzerinden 100 µF’lık kondansatör dolup boşalıyor. Osiloskobun A kanalı kaynağı (giriş), B kanalı kondansatörün gerilimini (çıkış) gösteriyor; COM alt hatta.',
    purpose:
      'Kondansatörün dolmasını ve boşalmasını art arda gösterir. Zaman sabiti τ = R · C = 0,1 s; yarım periyot (0,5 s) 5τ olduğu için kondansatör her yarıda ≈ %99,3 dolar (≈ 9,93 V) ve sonraki yarıda neredeyse tamamen boşalır. Kaynağın frekansını 5 Hz’e çıkar: yarım periyot τ’ya eşit olur, kondansatör tam dolup boşalamaz ve eğri 0 V ile 10 V’a hiç ulaşmaz. Devre hızlı değişimleri yumuşatan bir alçak geçiren süzgeçtir.',
    everyday:
      'Ses devrelerindeki tiz ve bas süzgeçleri, LED’lerin yumuşak açılıp kapanması, dijital sinyallerdeki parazitin bastırılması ve PWM sinyalinden ayarlanabilir bir DC gerilim elde etmek RC süzgeçle yapılır.',
  },
  'toprak-tuzagi': {
    title: 'Toprak tuzağı: köprüde prob toprağı',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe) dört diyotlu bir köprüyü besliyor; yük 100 kΩ. Osiloskobun A ucu yükün + ucunda, prob toprağı (COM) yükün − ucunda. Laboratuvardaki gibi hem üretecin hem osiloskobun COM ucu şebeke toprağına bağlı; tuvaldeki kesikli “toprak hattı” bu bağlantıyı gösterir.',
    purpose:
      'Topraklı iki cihazla yapılan yaygın bir ölçüm hatasını gösterir. İki cihazın COM ucu şebeke toprağı üzerinden birbirine bağlıdır. Prob toprağı yükün − ucuna takılınca D4 kısa devre olur; negatif yarıda üretecin çıkışı D3 üzerinden toprağa kısa devre olur ve yükten akım geçmez: ekranda tam dalga yerine yarım dalga görünür, Mesajlar’da uyarı çıkar. Doğru ölçüm “Köprü tipi tam dalga doğrultmaç” örneğindeki gibidir: COM üretecin COM’unda, A yükün + ucunda, B − ucunda; B ters (INV) ve A + B (ADD) seçilince ekranda A − B, yani yükün gerilimi görünür. Osiloskobun özelliklerinden toprak bağlantısını kaldırmak (yalıtılmış osiloskop) da sorunu çözer.',
    everyday:
      'Şebekeye bağlı cihazların kasası ve sinyal toprağı güvenlik için binanın toprak hattına bağlıdır. Doğrultmaç ve motor sürücü gibi güç devrelerinde ölçüm yapan teknisyenler bu yüzden diferansiyel prob ya da yalıtılmış osiloskop kullanır; yanlış yere takılan prob toprağı devreyi kısa devre edip cihazlara zarar verebilir.',
  },
  transformator: {
    title: 'Transformatör: şebekeden 12 V',
    description:
      'Şebeke gerilimi (230 V etkin, 50 Hz) küçük bir transformatörün (RS 504-464 tipi) birincil sargısını besliyor; ikincilde 96 Ω’luk yük var. Ampermetreler ve voltmetreler AC kipte etkin değeri gösteriyor. Toprak yalnızca birincil tarafında: ikincil devre şebekeden yalıtılmış (Mesajlar’da kendi sıfır noktası olduğu yazar).',
    purpose:
      'Alternatif gerilimi küçültür. Birincildeki değişen akım demir çekirdekte değişen bir manyetik akı oluşturur; aynı akı ikincilin her sarımında ε = −dΦ/dt kadar gerilim indükler (Faraday). Bu yüzden gerilimler sarım sayılarıyla orantılıdır: V₂ / V₁ ≈ N₂ / N₁ = 1/16. Yüksüzken ikincilde ≈ 14,2 V, 96 Ω’luk yükte ≈ 11,8 V ve 123 mA; aradaki fark sargıların direncinde düşer. Birincilden ≈ 16 mA çekilir: çekirdeği mıknatıslayan ≈ 15 mA ile yükün birincile yansıyan ≈ 7,7 mA’i (I₁ ≈ I₂ · N₂ / N₁), aralarındaki faz farkı yüzünden toplanmaz. Giriş gücü ≈ 2,0 W, yüke giden ≈ 1,45 W: verim ≈ %73, kayıp sargılarda ısıya dönüşür.',
    everyday:
      'Elektrik şebekesi transformatörlerle kurulur: santralin gerilimi iletim için 380 kV’a yükseltilir (aynı güç için akım küçülür, tellerdeki I²R kaybı azalır), mahalledeki trafoda 230 V’a indirilir. Eski tip adaptörler, kapı zilleri, halojen lamba trafoları ve kaynak makineleri de transformatördür. Banyolardaki tıraş makinesi prizi yalıtım transformatörüyle beslenir: ikincil taraf topraktan yalıtıldığı için tek bir uca dokunmak akım yolu oluşturmaz.',
  },
  adaptor: {
    title: 'Adaptör: transformatör, köprü ve filtre',
    description:
      'Şebeke (230 V, 50 Hz) → transformatör (230 V → 12 V) → dört 1N4001’lik köprü doğrultmaç → 470 µF’lık filtre kondansatörü → 470 Ω’luk yük. Voltmetre DC kipte çıkışı ölçüyor. Çıkış devresi topraktan yalıtılmış.',
    purpose:
      'Şebekenin alternatif gerilimini küçük ve düzgün bir doğru gerilime çevirir; eski tip bir adaptörün içi budur. Transformatör gerilimi düşürür ve devreyi şebekeden yalıtır, köprü iki yarım dalgayı da aynı yöne çevirir, kondansatör tepelerde dolup aralarda yükü besler. Yüksüz çıkış ≈ 19,1 V (ikincilin tepe gerilimi eksi iki diyot gerilimi); 470 Ω’da ≈ 15,8 V DC ve ≈ 0,47 V’luk 100 Hz dalgalanma. Kondansatör yalnızca tepelerde kısa sürede dolduğu için diyotlardan ≈ 144 mA’lik akım darbeleri geçer.',
    everyday:
      'Eski telefon ve modem adaptörleri, oyuncak trenlerin ve ses sistemlerinin güç kaynakları bu yapıdadır. Bugünkü şarj aletleri önce doğrultup sonra onlarca kHz’lik küçük bir transformatör kullanır: frekans yükselince aynı güç için çok daha küçük bir çekirdek yeter.',
  },
  'transformator-dc': {
    title: 'Transformatörde doğru akım (Faraday)',
    description:
      '12 V’luk pil bir anahtarla transformatörün birincilini besliyor; ikincilde 10 kΩ ve osiloskop var (A kanalı, 20 ms/bölme). Toprak ikincil tarafında, osiloskobun ortak ucuyla aynı noktada. Oynat’a bas, anahtarı kapat, sonra aç.',
    purpose:
      'Faraday yasasını gösterir: gerilimi akım değil, akının değişmesi indükler. Anahtar kapanınca birincil akımı τ = L₁ / R₁ ≈ 42 ms’lik bir üstelle 12 V / 1167 Ω ≈ 10,3 mA’e çıkar; akım değiştiği sürece ikincilde ≈ 0,74 V’tan başlayıp sönen bir darbe görülür. Akım sabitlenince ikincil 0 V’a döner: doğru akım transformatörden geçmez. Darbenin alanı akı bağının değişimine eşittir (∫ε dt = M · ΔI₁). Anahtarı açınca akım bir anda kesilir: çekirdekteki enerji ikincilde ≈ −270 V’luk, birincilde kilovoltluk bir sıçrama yapar ve Lenz uyarısı çıkar.',
    everyday:
      'Arabanın ateşleme bobini bir transformatördür: 12 V’luk akım kesilince ikincilde bujide kıvılcım çaktıran on binlerce volt oluşur. Elektrikli çit cihazları ve flaş tetikleyicileri de aynı ilkeyle çalışır.',
  },
  role: {
    title: 'Röle: yalıtılmış bir devreyi anahtarlamak',
    description:
      'Solda sargı devresi: 12 V’luk pil, S1 anahtarı, ampermetre ve röle sargısı (Omron G2R-1 tipi, 12 V); sargıya ters paralel bir 1N4001. Sağda kontak devresi: ayrı bir 9 V’luk pil C ucuna bağlı; NA kontağında yeşil, NK kontağında kırmızı LED. İki devre arasında hiç kablo yok (Mesajlar’da kontak devresinin kendi sıfır noktası olduğu yazar). Oynat’a bas, S1’i kapat, sonra aç. Ayarlar’da “Manyetik alanı göster”i açarsan sargının alanı ve kutupları da çizilir.',
    purpose:
      'Elektromıknatısla anahtarlamayı gösterir. S1 kapanınca sargının akımı τ = L/R ≈ 4,2 ms’lik bir üstelle artar (bobin akımın değişmesine karşı koyar); ≈ 30,5 mA’de (çekme gerilimi 8,4 V / 275 Ω) çekirdek paleti çeker: ≈ 5 ms sonra kırmızı LED söner, yeşil yanar. Palet çekilince hava aralığı kapanır, sargının endüktansı 1,15 H’den 2,29 H’e çıkar ve akım bir anda ≈ 15 mA’e düşer (akı bağı korunur), sonra 43,6 mA’e yükselir. S1 açılınca sargının akımı diyot üzerinden söner; ≈ 14 ms sonra bırakma akımının (1,8 V / 275 Ω ≈ 6,5 mA) altına iner ve palet bırakılır. Çekili paleti tutmak, çekmekten çok daha az akım ister (histerezis).',
    everyday:
      'Arabada marş motoru, korna ve farlar rölelerle çalışır: kontak anahtarındaki küçük akım, yüz amperlik devreleri kalın kablolarla kumanda eder. Çamaşır makinesi, kombi ve klimanın elektronik kartı da şebekedeki motoru ve ısıtıcıyı rölelerle açıp kapatır; kartı şebekeden yalıtan da röledir. Arduino gibi kartlarla kullanılan röle modülleri bu yapıdadır.',
  },
  'role-transistor': {
    title: 'Röle sürücüsü: transistör ve serbest geçiş diyodu',
    description:
      'Fonksiyon üretecinin TTL çıkışı (1 Hz, 0/5 V) 4,7 kΩ üzerinden BC107’yi anahtarlıyor; röle sargısı + 12 V ile kollektör arasında. Sargıya ters paralel bir 1N4001 S2 üzerinden bağlı. Röle çekince NA kontağı yeşil LED’i yakar. Osiloskop (A kanalı, 0,1 s/bölme) kollektör gerilimini gösteriyor. Oynat’a bas; birkaç periyot sonra S2’yi aç.',
    purpose:
      'Bir mikrodenetleyicinin çıkışı (birkaç mA) röle sargısını (43,6 mA) doğrudan süremez; transistör akımı yükseltir: ≈ 0,9 mA’lik baz akımı onu doyuma sokar. TTL yüksekken kollektör ≈ 0,1 V’a iner ve röle ≈ 5 ms sonra çeker. TTL düşünce transistör keser; sargının akımı bir anda kesilemez (Lenz): diyot bu akıma yol açar, kollektör 12 V’un bir diyot gerilimi üstünde kalır ve palet ≈ 14 ms sonra bırakılır. S2’yi açıp diyodu çıkarırsan transistör kestiği anda sargının enerjisi küçük sargı kapasitesine boşalır: kollektörde ≈ 5 kV’luk bir sıçrama olur ve Lenz uyarısı çıkar. Gerçek bir BC107 en fazla 45 V’a dayanır; diyotsuz devrede transistör ilk kesişte bozulur.',
    everyday:
      'Röle süren her devrede sargıya ters paralel bir diyot vardır: Arduino röle modüllerinde, araç elektroniğinde, kombi kartlarında. Diyot paletin bırakmasını geciktirir; hızlı bırakması gereken yerlerde diyoda seri bir zener diyot eklenir (sıçrama zener gerilimiyle sınırlanır, akım daha hızlı söner).',
  },
  'role-muhurleme': {
    title: 'Kendini tutma (mühürleme) devresi',
    description:
      '12 V’luk pil, S2 (DUR, kapalı) üzerinden rölenin C ucunu besliyor. S1 (BAŞLAT, açık) ile rölenin NA kontağı paralel; ikisi de sargıya gider. Sargıya paralel bir yeşil LED (1 kΩ ile) rölenin çektiğini gösteriyor; sargıya ters paralel bir 1N4001. Oynat’a bas; S1’i kapat ve yeniden aç, sonra S2’yi aç ve yeniden kapat.',
    purpose:
      'Rölenin kendi kontağıyla kendini beslemesini, yani bir biti hatırlamasını gösterir. S1 kapanınca röle çeker ve NA kontağı kapanır; bu kontak S1’e paralel olduğu için S1 açılsa da sargı beslenmeye devam eder: röle çekili kalır (mühürlenir). S2’yi açmak sargının beslemesini keser: akım diyot üzerinden söner, palet ≈ 14 ms sonra bırakılır ve NA açılır. S2’yi yeniden kapatmak röleyi çalıştırmaz; yeniden S1’e basmak gerekir.',
    everyday:
      'Fabrikalardaki motorlar, tezgâhlar ve yürüyen merdivenler bu devreyle çalışır (rölenin büyüğüne kontaktör denir): yeşil BAŞLAT düğmesi bırakılınca motor dönmeye devam eder, kırmızı DUR düğmesi onu durdurur. Elektrik kesilip geri gelince makine kendiliğinden çalışmaz; bu bir güvenlik önlemidir.',
  },
  'dc-motor': {
    title: 'DC motor: kalkış akımı, zıt EMK ve yük',
    description:
      '12 V’luk pil, S1 anahtarı ve ampermetre üzerinden bir DC motoru (maxon A-max 26 tipi) besliyor; voltmetre motorun uçlarında. Oynat’a bas, S1’i kapat. Sonra motoru seçip yük torkunu 10 mN·m, ardından 100 mN·m yap. Kalkışı yavaş çekimde görmek için hızı ×0,01’e indir.',
    purpose:
      'Motorun akımını zıt EMK’nın belirlediğini gösterir. Dururken motor yalnızca 2,07 Ω’luk bir dirençtir: S1 kapanınca akım ≈ 5,6 A’e fırlar (kalkış akımı). Mil hızlandıkça dönen sargıda hızla orantılı bir zıt EMK (e = k·ω, Lenz) indüklenir ve akımı azaltır: I = (V − e) / R. Hız τ = R·J/k² ≈ 15 ms’lik bir üstelle artar; boşta ≈ 8160 dev/dk’da zıt EMK 11,88 V’a ulaşır ve akım yalnızca sürtünmeyi yenen 57 mA’dir. 10 mN·m’lik yükte hız ≈ 7130 dev/dk’ya düşer, akım 0,78 A’e çıkar: motor 9,3 W alır, yüke 7,5 W verir (verim ≈ %80). Yük durma torkunu (≈ 80 mN·m) aşarsa motor durur, zıt EMK kalmaz, akım 5,8 A olur ve yarım saniye içinde sargının ısındığı uyarısı çıkar.',
    everyday:
      'Elektrikli süpürge, matkap ve mutfak robotu zorlanınca sesleri kalınlaşır (hız düşer) ve daha çok akım çekerler; sıkışan bir motorun yanması bu yüzdendir. Büyük motorlar kalkışta anma akımlarının birkaç katını çeker: buzdolabının motoru çalışınca ışıkların bir an kısılması bundandır.',
  },
  'motor-jenerator': {
    title: 'Motor jeneratör olur: boşta dönme ve frenleme',
    description:
      '12 V’luk pil S1 üzerinden motoru besliyor (S1 kapalı). Motora ters paralel bir 1N4001, S2 ile bağlanan 33 Ω’luk fren direnci, motorla seri bir ampermetre ve motorun uçlarında bir voltmetre var. Oynat’a bas; motor hızlanınca S1’i aç. Sonra S1’i kapat, motor hızlanınca S1’i aç ve S2’yi kapat.',
    purpose:
      'Elektrik motoru ile jeneratörün aynı makine olduğunu gösterir. S1 açılınca motor ataletiyle dönmeye devam eder ve dönen sargıda zıt EMK indüklenmeye devam eder: voltmetre artık motorun ürettiği gerilimi gösterir (jeneratör). Sürtünme yavaşlattıkça gerilim azalır (0,25 s sonra ≈ 9,9 V, 1 s sonra ≈ 3,8 V) ve motor ≈ 1,5 s’de durur. S2 kapalıyken motor ürettiği akımı 33 Ω’luk dirence verir: ampermetre ters yönde ≈ 0,34 A gösterir. Bu akım mile dönmeye karşı bir tork uygular (Lenz) ve motor ≈ 0,5 s’de durur; rotorun kinetik enerjisi dirençte ısıya dönüşür (dinamik frenleme).',
    everyday:
      'Elektrikli ve hibrit araçlar, tramvaylar ve asansörler fren yaparken motorlarını jeneratör olarak kullanır; üretilen enerji bataryaya ya da şebekeye geri verilir (rejeneratif frenleme). Bisiklet dinamosu, rüzgâr türbini ve hidroelektrik santralinin jeneratörü de dönen bir sargıda gerilim indükler.',
  },
  'motor-h-koprusu': {
    title: 'Motorun yönü: H köprüsü',
    description:
      '12 V’luk pil, dört anahtar (S1–S4) ve ortalarında bir DC motor ile ampermetre; anahtarların hepsi açık. Oynat’a bas; S1 ile S4’ü kapat. Sonra ikisini açıp S2 ile S3’ü kapat.',
    purpose:
      'DC motorun dönme yönünün akımın yönüyle değiştiğini gösterir. S1 ve S4 kapalıyken akım motordan soldan sağa geçer ve motor ileri döner (≈ 8160 dev/dk). S2 ve S3 kapalıyken akım ters yönde geçer: mıknatısın alanındaki sargıya etkiyen kuvvet (F = I·L × B) de ters döner ve motor geri döner (−8160 dev/dk). Motor ileri dönerken yönü değiştirmek, pilin gerilimine zıt EMK’yı da ekler: akım bir an ≈ 11 A’e çıkar (kalkış akımının iki katı). Aynı kolun iki anahtarını (S1 ile S3 ya da S2 ile S4) birlikte kapatmak pili kısa devre eder: Mesajlar’da uyarı çıkar.',
    everyday:
      'Oyuncak arabalar, elektrikli cam ve koltuk motorları, robotlar ve 3B yazıcılar motorlarının yönünü H köprüsüyle değiştirir; anahtarların işini dört transistör yapar (L298N, DRV8833 gibi sürücü entegreleri). Bu entegreler aynı koldaki iki transistörün birlikte iletmesini özellikle engeller.',
  },
  potansiyometre: {
    title: 'Potansiyometre: ayarlı gerilim bölücü',
    description:
      '9 V’luk pil, 10 kΩ’luk bir potansiyometrenin (Bourns PTV09A tipi) iki ucuna bağlı: 1. ucu toprakta, 3. ucu + 9 V’ta. Sürgüden 4,7 kΩ’luk direnç ve yeşil LED besleniyor; voltmetre sürgünün gerilimini ölçüyor. Oynat’a bas, potansiyometreyi seç ve kaydırıcıyı çevir.',
    purpose:
      'Potansiyometre bir gerilim bölücüdür: sürgü direnci ikiye böler ve sürgünün gerilimi konumla artar (%0’da 0,09 V, %100’de 8,8 V; uçlardaki %1’lik artık direnç yüzünden tam 0 ve 9 V olmaz). Sürgüden akım çekilmeseydi gerilim konumla doğru orantılı olurdu (%50’de 4,5 V); LED kolu akım çektiği için sürgünün gerilimi düşer: %50’de 3,57 V (yükleme). LED sürgünün gerilimi ≈ 1,9 V’u geçince yanar ve parlaklığı konumla artar (%100’de 1,45 mA).',
    everyday:
      'Eski radyoların ses düğmesi, ışık dimmerlerinin ayar düğmesi, oyun kumandalarının analog çubukları ve arabaların gaz pedalı konum algılayıcısı potansiyometredir. Ses ayarında kulağın logaritmik duyarlılığı için logaritmik (A tipi) potansiyometre kullanılır.',
  },
  'ldr-gece-lambasi': {
    title: 'LDR ile gece lambası',
    description:
      '9 V’luk pil; 100 kΩ’luk direnç ile LDR (GL5528) bir gerilim bölücü kuruyor, ortası BC107’nin bazına bağlı. Kollektörde 1 kΩ ve sarı LED var. Oynat’a bas, LDR’yi seç ve aydınlığı azalt (100 lüksten 1 lükse).',
    purpose:
      'Işıkla değişen bir direncin bir transistörü anahtarlamasını gösterir. Aydınlıkta LDR’nin direnci küçüktür (100 lükste ≈ 3,8 kΩ): bazın gerilimi ≈ 0,33 V’ta kalır, transistör keser, LED söner. Karardıkça LDR’nin direnci artar (10 lükste 15 kΩ, karanlıkta 1 MΩ), baz gerilimi ≈ 0,65 V’a ulaşınca transistör iletir: ≈ 40 lüksün altında LED yanmaya başlar, 20 lükste ≈ 3,3 mA, 10 lükste ve daha karanlıkta ≈ 6,9 mA’le tam parlar.',
    everyday:
      'Sokak lambaları, bahçedeki güneş enerjili lambalar ve prize takılan gece lambaları akşam kendiliğinden yanar; telefonların ekran parlaklığı ortam ışığına göre ayarlanır. Eski fotoğraf makinelerinin ışık ölçerleri de CdS hücreleriyle çalışırdı.',
  },
  'ntc-termometre': {
    title: 'NTC ile termometre',
    description:
      '5 V’luk pil; NTC termistör (Vishay NTCLE100E3, 25 °C’ta 10 kΩ) üstte, 10 kΩ’luk direnç altta. Voltmetre alttaki direncin gerilimini ölçüyor. Oynat’a bas, NTC’yi seç ve sıcaklığı değiştir.',
    purpose:
      'Sıcaklığın bir gerilime çevrilmesini gösterir. Isındıkça NTC’nin direnci üstel olarak azalır, bölücünün çıkışı artar: −20 °C’ta 0,47 V, 0 °C’ta 1,17 V, 25 °C’ta 2,50 V, 50 °C’ta 3,67 V, 75 °C’ta 4,35 V, 100 °C’ta 4,68 V. Eşit sıcaklık adımları eşit gerilim adımı vermez: en duyarlı bölge, NTC’nin direncinin sabit dirence eşit olduğu 25 °C civarıdır. Bir mikrodenetleyici bu gerilimi ölçüp sıcaklığa çevirir.',
    everyday:
      'Kombi, buzdolabı, çamaşır makinesi ve klimaların sıcaklık algılayıcıları, dijital ateş ölçerler, telefon ve dizüstü bilgisayar bataryalarının sıcaklık koruması NTC kullanır. Arabaların motor soğutma suyu göstergesi de bir NTC’dir.',
  },
  'lamba-ani-akim': {
    title: 'Akkor lamba: ilk an akımı',
    description:
      '12 V’luk pil, S1 anahtarı, 12 V 0,1 A’lik bir akkor lamba ve akımı ölçmek için 1 Ω’luk bir direnç. Osiloskop (A kanalı, 2 ms/bölme, 0,2 V/bölme) bu direncin gerilimini, yani lambanın akımını gösteriyor (1 V = 1 A). Hızı ×0,01’e indir, Oynat’a bas ve S1’i kapat: darbe ekranda yavaşça çizilir.',
    purpose:
      'Metallerin direncinin sıcaklıkla arttığını gösterir. Soğuk tungsten filamanın direnci ≈ 8,9 Ω’dur: anahtar kapandığı an ≈ 1,21 A geçer (anma akımının 12 katı). Filaman ısındıkça direnci artar; akım ≈ 6 ms’de 0,2 A’in altına iner ve filaman ≈ 2490 K’de, akım 0,1 A’de dengelenir (sıcakken ≈ 120 Ω). Lamba en çok yakıldığı anda zorlanır: ampuller çoğunlukla açıldıkları anda patlar.',
    everyday:
      'Akkor ampuller ve halojen lambalar, ısıtıcı teller ve tost makinesinin rezistansı da sıcaklıkla direnci artan metallerdir. Büyük lamba gruplarını süren devreler ilk an akımına göre boyutlandırılır; tiyatro dimmerleri lambaları yavaşça açar.',
  },
  hoparlor: {
    title: 'Hoparlör: elektrikten ses',
    description:
      'Fonksiyon üreteci (440 Hz, 20 V tepe-tepe, sinüs) bir ampermetre (AC kipte) üzerinden 8 Ω’luk bir hoparlörü (Visaton FRS 5) sürüyor; osiloskop hoparlörün gerilimini gösteriyor. Hız ×1’deyken Oynat’a bas: sesi duyarsın (Ayarlar’da ses açık olmalı). Sonra üretecin frekansını 100 Hz, 290 Hz ve 1 kHz yap.',
    purpose:
      'Bobinden geçen değişen akım, mıknatısın alanında zarı ileri geri iter (F = B·I·L); zar havayı titreştirir ve ses olur. Sesin perdesi frekanstan gelir: 440 Hz diyapazonun la sesidir. Akım ≈ 0,12 A (etkin), 1 m’de ses ≈ 79 dB. Küçük hoparlörün zarı ve askısı 290 Hz’de rezonansa girer: bu frekansta empedans ≈ 20 Ω’a çıkar, akım 0,10 A’e düşer ama zar en çok salındığı için ses ≈ 83 dB’e yükselir. 100 Hz’te zar neredeyse hiç ivmelenmez ve ses ≈ 57 dB’e iner: küçük hoparlörler bu yüzden bas sesleri veremez.',
    everyday:
      'Telefonların, kulaklıkların, televizyonların ve arabaların hoparlörleri aynı ilkeyle çalışır; bas hoparlörleri (woofer) düşük bir rezonans frekansı için büyük ve ağır zarlıdır. Dinamik mikrofon aynı yapıyı tersine kullanır: ses zarı titreştirir, mıknatısın alanında hareket eden bobinde gerilim indüklenir.',
  },
  'buzzer-sicaklik': {
    title: 'Sıcaklık alarmı: NTC ve buzzer',
    description:
      '5 V’luk pil; NTC termistör (25 °C’ta 10 kΩ) üstte, 560 Ω altta, ortası BC107’nin bazında. Aktif buzzer (CMI-1295IC) + 5 V ile kollektör arasında. Hız ×1’deyken Oynat’a bas, NTC’yi seç ve sıcaklığı 25 °C’tan 60 °C’a çıkar.',
    purpose:
      'Bir sensörün bir uyarıcıyı sürmesini gösterir. Isındıkça NTC’nin direnci azalır ve bazın gerilimi artar: 25 °C’ta 0,27 V (transistör keser, buzzer sessiz); ≈ 50 °C’ta 0,65 V’a yaklaşınca transistör iletmeye başlar. Buzzerin içindeki osilatör ≈ 3 V’ta çalışır: ≈ 54 °C’ın üstünde öter, 56 °C’ta neredeyse tam gerilimde (4,8 V, 28 mA, ≈ 85 dB). Buzzerin sesini tarayıcıda duyarsın.',
    everyday:
      'Fırınların, ütülerin ve 3B yazıcıların aşırı ısınma uyarıları, ısı algılayıcılı yangın dedektörleri ve arabalardaki motor sıcaklığı uyarısı bu yapıdadır. Gerçek devrelerde eşik bir karşılaştırıcıyla (işlemsel yükselteç) daha keskin yapılır.',
  },
  sigorta: {
    title: 'Sigorta: kısa devrede devreyi açar',
    description:
      '12 V’luk akü (iç direnci 0,05 Ω), 1 A’lik hızlı sigorta (Littelfuse 217), ampermetre ve 12 V 6 W’lık lamba. S2 lambanın iki ucunu kısa devre eder. Oynat’a bas; lamba yanınca S2’yi kapat. Sonra S2’yi açıp sigortayı “Onar” ile değiştir.',
    purpose:
      'Sigortanın teli akımın karesiyle ısınır. Lambanın 0,5 A’i teli erime sıcaklığının ancak %8’ine ısıtır; lamba yakıldığı an çektiği ≈ 5,7 A’lik ilk an akımı da birkaç milisaniye sürdüğü için sigortayı attırmaz. S2 kapanınca akımı yalnızca akünün iç direnci ve sigortanın kendisi sınırlar: ≈ 76 A. Tel 0,17 ms’de erir ve devreyi açar (erime I²t = 1,04 A²s); sigorta olmasaydı bu akım kabloları ısıtıp yangın çıkarabilirdi. Sigorta anma akımının 1,5 katına kadar atmaz, 2,75 katında ≈ 0,18 s’de, 10 katında ≈ 11 ms’de atar.',
    everyday:
      'Arabaların sigorta kutusundaki bıçak sigortalar, cihazların cam sigortaları ve evlerdeki otomatik sigortalar aynı işi görür. Otomatik sigorta erimez: aşırı yükte ısınan bir bimetal, kısa devrede bir elektromıknatıs (röle gibi) kontağı açar; kol kaldırılınca yeniden kurulur.',
  },
  'opamp-evirmeyen': {
    title: 'Evirmeyen yükselteç (741, ×11)',
    description:
      'İki 15 V’luk pil 741’i ±15 V’la besliyor (ortaları toprak). Fonksiyon üreteci (1 kHz, 1 V tepe-tepe) evirmeyen (+) girişe bağlı; R2 = 100 kΩ çıkıştan eviren (−) girişe, R1 = 10 kΩ eviren girişten toprağa. V1 girişi, V2 çıkışı AC kipte ölçüyor. Oynat’a bas; sonra üretecin genliğini 3 V tepe-tepeye, ardından frekansını 20 kHz’e çıkar.',
    purpose:
      'Geri beslemenin kazancı nasıl belirlediğini gösterir. 741’in kendi kazancı ≈ 200 000’dir; çıkışın bir kısmı (R1 / (R1 + R2) = 1/11’i) eviren girişe geri verilince op-amp iki girişini neredeyse eşit tutar ve kazanç yalnızca dirençlere bağlı olur: A = 1 + R2 / R1 = 11. V1 0,354 V, V2 3,889 V (etkin) gösterir; çıkış girişle aynı fazdadır. 3 V tepe-tepede çıkışın ±16,5 V olması gerekir ama besleme yetmez: dalga ±14,2 V’ta kırpılır (doyum). 20 kHz’te çıkış, 741’in en fazla 0,5 V/µs’lik eğim hızına takılır ve üçgenleşir: V2 3,35 V’a düşer.',
    everyday:
      'Mikrofon ve gitar yükselteçlerinin ön katları, sensör sinyallerini (termokupl, basınç algılayıcısı) ölçülebilir seviyeye çıkaran devreler ve tıbbi cihazlar (EKG) işlemsel yükselteçle kurulur. Bugün 741 yerine daha hızlı ve tek beslemeyle çalışan op-amplar kullanılır; ilkeler aynıdır.',
  },
  'opamp-eviren': {
    title: 'Eviren yükselteç ve sanal toprak',
    description:
      '741 ±15 V’la besleniyor. 1,5 V’luk pil R1 = 10 kΩ üzerinden eviren (−) girişe bağlı; R2 = 56 kΩ çıkıştan eviren girişe; evirmeyen (+) giriş toprakta. V2 çıkışı ölçüyor. Oynat’a bas, sonra U1’in üzerine gelip giriş farkına bak; R2’yi 100 kΩ yap.',
    purpose:
      'Eviren yükselteçte kazanç A = −R2 / R1 = −5,6: çıkış −1,5 V × 5,6 = −8,40 V. Op-amp iki girişini eşit tutar; evirmeyen giriş toprakta olduğu için eviren giriş de ≈ 0 V’tadır (sanal toprak; fark yalnızca ≈ 40 µV). R1’den geçen 150 µA op-ampa girmez (giriş direnci 2 MΩ), hepsi R2’den çıkışa akar: V_çıkış = −150 µA × 56 kΩ. R2 = 100 kΩ yapınca çıkışın −15 V olması gerekir ama besleme yetmez: çıkış −14,2 V’ta doyar.',
    everyday:
      'Ses karıştırma masaları (birden çok girişi toplayan eviren yükselteç), sayısaldan analoğa çeviriciler ve ölçü aletlerinin akım-gerilim dönüştürücüleri (fotodiyot yükselteci) sanal toprak ilkesini kullanır.',
  },
  'opamp-karsilastirici': {
    title: 'Karşılaştırıcı: LDR ile ışık eşiği',
    description:
      '741 ±15 V’la besleniyor, geri beslemesi yok. Eviren (−) girişte iki 10 kΩ’luk bölücü 7,5 V’luk eşik veriyor; evirmeyen (+) giriş LDR (GL5528) ile 10 kΩ’luk bölücünün ortasında. Çıkışta 1 kΩ ve ters paralel yeşil ve kırmızı LED. Oynat’a bas, LDR’yi seç ve aydınlığı 100 lüksten 1 lükse indir.',
    purpose:
      'Geri beslemesiz bir op-ampın iki gerilimi karşılaştırmasını gösterir. Kazanç çok yüksek olduğu için girişlerdeki küçük bir fark çıkışı bir uçtan öbürüne sürer: + giriş 7,5 V’un üstündeyken çıkış ≈ +12,2 V (yeşil LED, 10 mA), altındayken ≈ −12,1 V (kırmızı LED). Aydınlıkta LDR’nin direnci küçüktür ve + giriş yüksektir (100 lükste 10,9 V); LDR 10 kΩ’u geçince, yani ≈ 19,7 lüksün altında, çıkış ters döner. Çıkış ±14 V yerine ≈ ±12,2 V’tur: LED’in 10 mA’i op-ampın çıkış direncinde gerilim düşürür.',
    everyday:
      'Alacakaranlık şalterleri, termostatlar, pil gerilimi uyarıları ve analogdan sayısala çeviricilerin içi karşılaştırıcıyla çalışır. Gürültülü sinyallerde çıkışın titrememesi için karşılaştırıcıya küçük bir pozitif geri besleme (histerezis, Schmitt tetikleyici) eklenir.',
  },
  '555-astabil': {
    title: '555 ile yanıp sönen LED (astabil)',
    description:
      '9 V’luk pil; 555’in RESET’i ve VCC’si + 9 V’ta, CONT’u 10 nF’la toprakta. R_A = 1 kΩ ve R_B = 68 kΩ ile 10 µF’lık kondansatör zamanlama kolunu kuruyor; THRES ve TRIG kondansatörde, DISCH iki direncin arasında. Çıkışta 470 Ω ve kırmızı LED; voltmetre kondansatörün gerilimini gösteriyor. Oynat’a bas.',
    purpose:
      '555’in kendi kendine kare dalga üretmesini (astabil çalışma) gösterir. Çıkış yüksekken kondansatör R_A + R_B üzerinden dolar; gerilimi 2/3·V_CC’ye (6 V) ulaşınca çıkış düşer ve deşarj anahtarı kondansatörü R_B üzerinden boşaltır; 1/3·V_CC’ye (3 V) inince çıkış yeniden yükselir. Voltmetre 3 V ile 6 V arasında gidip gelir. Yüksek süre ln2·(R_A + R_B)·C ≈ 0,48 s, düşük süre ≈ 0,49 s (deşarj anahtarının üzerindeki ≈ 0,17 V yüzünden ln2·R_B·C’den biraz uzun): LED saniyede ≈ 1 kez yanıp söner. İlk yüksek süre daha uzundur (0,76 s): kondansatör 0 V’tan başlar.',
    everyday:
      'Yanıp sönen uyarı ışıkları, araçların sinyal lambası devreleri, oyuncakların ışıkları ve basit saat sinyalleri 555 ile yapılır. 1971’den beri üretilen 555, dünyada en çok üretilen entegrelerden biridir.',
  },
  '555-monostabil': {
    title: '555 ile zamanlayıcı (monostabil)',
    description:
      '9 V’luk pil; TRIG 10 kΩ ile + 9 V’a çekili, S1 onu toprağa bağlar. THRES ve DISCH, 100 kΩ ile 47 µF’ın arasında. Çıkışta 470 Ω ve LED. Oynat’a bas; S1’i kapatıp hemen aç ve LED’in ne kadar yandığını izle.',
    purpose:
      'Bir tetikle belirli bir süre açık kalan zamanlayıcıyı (monostabil) gösterir. S1 TRIG’i 1/3·V_CC’nin altına çekince çıkış yükselir ve deşarj anahtarı açılır: kondansatör 100 kΩ üzerinden dolmaya başlar. Gerilimi 2/3·V_CC’ye ulaşınca çıkış düşer ve kondansatör hemen boşaltılır. Süre t = R·C·ln3 ≈ 1,1·R·C = 5,16 s; dirençle ya da kondansatörle ayarlanır. S1 kapalı kalırsa TRIG etkin kalır ve çıkış düşmez.',
    everyday:
      'Merdiven otomatiği (basınca birkaç dakika yanan ışık), mikrodalga ve çamaşır makinelerinin eski zamanlayıcıları, kapı zilleri ve buton tıklamalarındaki sıçramayı süzen devreler monostabil çalışır.',
  },
  '555-ses': {
    title: '555 ile ses (hoparlör)',
    description:
      '9 V’luk pil; 555 astabil: R_A = 1 kΩ, R_B = 10 kΩ, C = 68 nF. Çıkış, 100 µF’lık kondansatör ve 47 Ω üzerinden 8 Ω’luk hoparlöre bağlı. Hız ×1’deyken Oynat’a bas: sesi duyarsın. Sonra R_B’yi 22 kΩ yap.',
    purpose:
      'Zamanlama kondansatörü küçülünce 555 ses frekansında salınır: ≈ 990 Hz (1,44 / ((R_A + 2R_B)·C) formülü 1008 Hz verir; deşarj anahtarının gerilimi düşük süreyi biraz uzatır). 100 µF’lık kondansatör çıkışın doğru gerilimini keser, hoparlöre yalnızca değişen akım gider; 47 Ω akımı sınırlar. Kare dalga temel frekansın yanında tek katlı harmonikler de içerdiği için ses sinüsünkinden daha “sert”tir. R_B’yi büyütünce frekans ve perde düşer.',
    everyday:
      'Alarm sirenleri, kapı zilleri, elektronik oyuncakların sesleri ve eski bilgisayarların bip sesleri bu tür kare dalga üreteçleriyle çıkar. İki 555 birlikte iki tonlu siren (ambulans sesi) yapar.',
  },
  'diyot-dc': {
    title: '1N4001: doğru akımda akım-gerilim ölçümü',
    description:
      'Laboratuvar güç kaynağının 1. çıkışı (5 V), ampermetre ve 1 kΩ’luk direnç üzerinden bir 1N4001 diyodunu ileri yönde besliyor; akım alt hattan kaynağın − ucuna döner. Voltmetre diyodun gerilimini ölçüyor.',
    purpose:
      'Diyodun akım-gerilim ilişkisini nokta nokta ölçmeyi sağlar. 5 V’ta V_{D} ≈ 0,56 V ve I = (5 V − 0,56 V) / 1 kΩ ≈ 4,4 mA. Kaynağın gerilimini değiştirip föydeki tabloyu doldur: 0,5 V’ta I ≈ 0,13 mA (V_{D} ≈ 0,37 V), 1 V’ta ≈ 0,55 mA (0,45 V), 2 V’ta ≈ 1,5 mA (0,50 V), 10 V’ta ≈ 9,4 mA (0,60 V). Akım on kat artınca diyodun gerilimi yalnızca ≈ 0,12 V artar: karakteristik üsteldir (Shockley denklemi). Diyodu ters çevirince (F) akım 1 µA’in altına düşer.',
    everyday:
      '1N4001 gibi doğrultma diyotları adaptörlerde, şarj cihazlarında ve güç kaynaklarında kullanılır. Diyodun ileri gerilimi sıcaklık arttıkça düştüğü için basit sıcaklık sensörleri de bu özelliği kullanır.',
  },
  'diyot-karakteristigi': {
    title: '1N4001: X-Y’de akım-gerilim eğrisi',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe sinüs) 1N4001 ile 1 kΩ’luk direnci seri besliyor. Osiloskop X-Y kipinde ve döngünün içinde: COM ucu diyot ile direncin birleştiği noktada (toprak burası), A (yatay, 1 V/bölme) diyodun gerilimini, ters çevrilmiş B (dikey, 1 V/bölme = 1 mA) direncin gerilimini yani akımı gösteriyor. Üreteç topraktan yalıtılmış (COM’u şebeke toprağına bağlı değil).',
    purpose:
      'Diyodun akım-gerilim eğrisini ekranda tek seferde çizer. Akım ≈ 0,4 V’tan sonra belirginleşir; en büyük akım ≈ 4,2 mA, o anda V_{D} ≈ 0,56 V: I = (5 V − 0,56 V) / (1 kΩ + 50 Ω). Ters yönde akım yok denecek kadar azdır. Frekansı 10 kHz, 100 kHz ve 1 MHz yap: 1N4001 ileri yönde depoladığı yük yüzünden ters kutuplanınca bir süre ters akım geçirir (ters toparlanma; 100 kHz’te ≈ −4,8 mA) ve eğri ilmek açar. Üretecin COM’unu şebeke toprağına bağlarsan direnç iki toprak arasında kısa devre olur: B sıfırda kalır, diyottan ≈ 86 mA geçer.',
    everyday:
      'Yarı iletken üreticileri veri sayfalarındaki karakteristik eğrileri bu yöntemle (eğri izleyici) çıkarır. Hızlı anahtarlama yapan güç kaynaklarında 1N4001 yerine ters toparlanması kısa “hızlı” ya da Schottky diyotların seçilmesinin nedeni de bu deneyde görülür.',
  },
  'zener-karakteristigi': {
    title: 'Zener diyot (5,6 V): X-Y’de karakteristik',
    description:
      'Aynı düzenek; diyodun yerinde 5,6 V’luk bir zener (1N4734A gibi), üreteç 20 V tepe-tepe. A 2 V/bölme, B 1 V/bölme = 1 mA. Föy zenerin değerini vermiyor: laboratuvardaki zenerin değeri farklıysa özelliklerinden değiştir.',
    purpose:
      'Zenerin ters yönde belirli bir gerilimde iletime geçtiğini gösterir. Ters yönde ≈ −5,4 V’ta kırılır; en büyük ters akım ≈ 4,4 mA: I = (10 V − 5,4 V) / 1,05 kΩ (V_{Z} 20 mA için tanımlıdır, birkaç mA’de biraz daha düşüktür). Kırılmadan sonra akım değişse de gerilim neredeyse sabit kalır. İleri yönde sıradan bir diyot gibi ≈ 0,7 V’ta iletir (≈ 8,9 mA). Zener gerilimini 3,3 V ya da 9,1 V yapıp kırılmanın nasıl kaydığına bak.',
    everyday:
      'Zener diyotlar basit gerilim regülatörlerinde (ör. bir sensöre sabit 5,1 V vermek), aşırı gerilim korumasında ve referans gerilimi üreten devrelerde kullanılır. Telefon ve bilgisayar girişlerindeki koruma diyotları (TVS) aynı kırılma ilkesiyle çalışır.',
  },
  'led-karakteristigi': {
    title: 'LED: X-Y’de karakteristik',
    description: 'Aynı düzenek; diyodun yerinde kırmızı bir LED, üreteç 10 V tepe-tepe. A 1 V/bölme, B 1 V/bölme = 1 mA.',
    purpose:
      'LED’in eşik geriliminin silisyum diyodunkinden büyük olduğunu gösterir. Kırmızı LED ≈ 1,5–1,7 V’ta iletir; en büyük akım ≈ 3,1 mA, o anda V_{F} ≈ 1,69 V. LED’in yarı iletkeninin yasak enerji aralığı daha büyüktür ve bu aralığı geçen elektronun yaydığı fotonun enerjisi rengi belirler (E = h · f). Rengi yeşil ya da mavi yap: dalga boyu kısaldıkça foton enerjisi ve eşik büyür. Ters yönde akım geçmez; gerçek LED’ler ≈ 5 V’tan büyük ters gerilime dayanamaz.',
    everyday:
      'LED ampuller, ekranların arka ışığı, uzaktan kumandaların kızılötesi vericisi ve trafik ışıkları. LED sürücüleri LED’i gerilimle değil akımla besler, çünkü eşiğin biraz üstünde akım çok hızlı artar.',
  },
  'yarim-dalga': {
    title: 'Yarım dalga doğrultmaç',
    description:
      'Fonksiyon üreteci (50 Hz, 20 V tepe-tepe sinüs) bir 1N4001 üzerinden 1 kΩ’luk yükü besliyor. S1, S2 ve S3 anahtarları yüke 1 µF, 22 µF ve 470 µF’lık filtre kondansatörlerini bağlar. Osiloskobun A kanalı girişi, B kanalı yükün gerilimini gösteriyor; voltmetre yükün DC (ortalama) gerilimini ölçüyor.',
    purpose:
      'Alternatif akımı tek yönlü akıma çevirir. Diyot yalnızca pozitif yarılarda iletir: filtresiz tepe ≈ 9,0 V (üretecin 50 Ω’unda ve diyotta ≈ 1 V düşer), ortalama ≈ 2,8 V ≈ V_{tepe} / π. Anahtarları sırayla kapat: kondansatör tepelerde dolup aralarda yükü besler. 22 µF’ta (RC = 22 ms) çıkış ≈ 4,2 V ile 8,5 V arasında dalgalanır (ortalama ≈ 6,2 V); 470 µF’ta dalgalanma ≈ 0,2 V’a iner. Diyodu ters çevirirsen (F) negatif yarılar geçer.',
    everyday:
      'Basit adaptörler ve küçük şarj devreleri yarım dalga doğrultmaç kullanır. Filtre kondansatörü bütün güç kaynaklarında vardır; kurumuş bir filtre kondansatörü, hoparlörde duyulan şebeke vızıltısının en yaygın nedenidir.',
  },
  'kopru-dogrultmac': {
    title: 'Köprü tipi tam dalga doğrultmaç',
    description:
      'Dört 1N4001’lik köprü, fonksiyon üretecinden (50 Hz, 20 V tepe-tepe) 100 kΩ’luk yükü besliyor. Yükün iki ucu da topraktan farklı gerilimde olduğu için osiloskop yükü iki kanalla ölçüyor: A yükün + ucunda, B − ucunda, COM üretecin COM’unda (sağ kolun ortası). B ters çevrilmiş ve ADD açık: ekranda A − B.',
    purpose:
      'İki yarım dalgayı da aynı yöne çevirir (tam dalga doğrultma). Pozitif yarıda D1 ile D4, negatif yarıda D2 ile D3 iletir; yükten akım her zaman aynı yönde geçer. Tepe ≈ 9,3 V: her yarıda iki diyot iletir ve 100 kΩ’da akım küçük olduğundan her birinde ≈ 0,35 V düşer. Çıkış her yarım periyotta tekrarlar: 100 Hz. Bu yüzden aynı filtre kondansatörüyle dalgalanma yarım dalga doğrultmacınkinin yarısı kadardır.',
    everyday:
      'Telefon şarj aletlerinin, dizüstü bilgisayar adaptörlerinin ve neredeyse bütün şebeke beslemeli cihazların girişinde köprü doğrultmaç vardır; çoğu zaman dört diyot tek bir küçük paketin içindedir.',
  },
  'negatif-kenetleyici': {
    title: 'Negatif kenetleyici',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe sinüs), 2,2 µF’lık kondansatör üzerinden 10 kΩ’luk yüke bağlı; 1N4001 yüke paralel, anodu çıkışta. Osiloskobun A kanalı girişi, B kanalı çıkışı gösteriyor (ikisi de DC kuplaj, 5 V/bölme).',
    purpose:
      'Dalganın biçimini bozmadan onu aşağı kaydırır. Pozitif tepede diyot iletir ve kondansatör ≈ 4,4 V’a dolar; bu gerilim seri bir pil gibi bütün dalgayı aşağı taşır. Çıkış ≈ +0,56 V ile ≈ −9,1 V arasında salınır, tepe-tepe değeri (≈ 9,6 V) neredeyse aynı kalır. RC = 22 ms periyottan (1 ms) çok büyük olduğu için kondansatör bir periyotta pek boşalmaz. Üreteci kare dalgaya al: ≈ +0,5 V ile −9,5 V. B’yi AC kuplaja alırsan kayma kaybolur.',
    everyday:
      'Televizyon ve video devrelerinde görüntü sinyalinin siyah seviyesini sabitlemek (DC restorer), bir sinyali dönüştürücünün giriş aralığına kaydırmak için kullanılır; gerilim katlayıcıların ilk katı da bir kenetleyicidir.',
  },
  'pozitif-kenetleyici': {
    title: 'Pozitif kenetleyici',
    description:
      'Negatif kenetleyicinin aynısı; yalnızca 1N4001 ters bağlı (katodu çıkışta) ve elektrolitik kondansatörün + ucu çıkış tarafında. Üreteç 1 kHz, 10 V tepe-tepe sinüs; C = 2,2 µF, yük 10 kΩ.',
    purpose:
      'Dalgayı yukarı kaydırır. Negatif tepede diyot iletir, kondansatör dolar ve dalgayı yukarı taşır: çıkış ≈ −0,56 V ile ≈ +9,1 V arasında salınır, en alt noktası bir diyot gerilimi kadar sıfırın altındadır. Kare dalgada ≈ −0,5 V ile +9,5 V. Diyoda seri bir DC kaynak eklersen kenetleme seviyesi o kadar kayar (öngerilimli kenetleyici).',
    everyday:
      'Yalnızca pozitif gerilim ölçebilen bir analog-dijital dönüştürücüye artı-eksi salınan bir sinyali vermek ve analog ses ile görüntü arabirimlerinde sinyal seviyesini ayarlamak için kullanılır.',
  },
  'gerilim-katlayici': {
    title: 'Gerilim katlayıcı (ikileyici)',
    description:
      'Fonksiyon üreteci (1 kHz, 10 V tepe-tepe yani 5 V tepe sinüs), iki 1N4001 ve iki 10 µF’lık kondansatörden oluşan yarım dalga gerilim ikileyiciyi besliyor. Osiloskobun A kanalı girişi, B kanalı çıkışı (C2) gösteriyor.',
    purpose:
      'Girişin tepe geriliminin yaklaşık iki katında bir DC gerilim üretir. C1 ile D1 bir kenetleyicidir: girişi ≈ 0 V ile 9,5 V arasına kaydırır. D2 ile C2 bir tepe dedektörüdür: bu dalganın tepesini C2’ye yükler. Çıkış ≈ 9,1 V ≈ 2 · 5 V − 2 · V_{D}; C2 ilk 5 ms’de ≈ 4,9 V’a, 50 ms’de ≈ 8,7 V’a ulaşır. Çıkışa bir yük direnci (ör. 10 kΩ) bağla: gerilim düşer ve dalgalanır, çünkü katlayıcı ancak küçük akım verebilir.',
    everyday:
      'Mikrodalga fırınların yüksek gerilim beslemesi, lazer yazıcıların ve fotokopi makinelerinin yüksek gerilim katları, sinek öldürücü raketler ve Geiger sayaçları gerilim katlayıcıyla (çok katlı Cockcroft-Walton) yüksek gerilim üretir.',
  },
  'paralel-kirpici': {
    title: 'Öngerilimli paralel kırpıcı (4 V)',
    description:
      'Fonksiyon üreteci (1 kHz, 20 V tepe-tepe sinüs) 10 kΩ üzerinden çıkışa bağlı. 1N4001’in anodu çıkışta, katodu DC güç kaynağının 4 V’luk 1. çıkışında; kaynağın − ucu ortak hatta. Osiloskobun A kanalı girişi, B kanalı çıkışı gösteriyor.',
    purpose:
      'Sinyalin belirli bir seviyenin üstündeki kısmını keser. Çıkış 4 V + V_{D}’yi geçmeye çalışınca diyot iletir ve fazla gerilim 10 kΩ’un üzerine düşer: pozitif tepeler ≈ 4,45 V’ta kırpılır (akım ≈ 0,55 mA olduğundan V_{D} ≈ 0,45 V). Negatif yarı olduğu gibi geçer (≈ −9,9 V). Kaynağı 3 V ya da 2 V yaparsan kırpma seviyesi o kadar kayar; diyodu ters çevirirsen (F) çıkış ≈ 3,55 V’un altına inemez.',
    everyday:
      'Elektronik girişleri aşırı gerilime karşı korumak (ör. bir mikrodenetleyici pinini besleme gerilimiyle sınırlamak), gitar distorsiyon pedallarında sinyali kasıtlı olarak kırpmak ve radyolarda gürültü darbelerini sınırlamak için kullanılır.',
  },
  'cift-kirpici': {
    title: 'Çift yönlü kırpıcı (3 V ve 2 V)',
    description:
      'Fonksiyon üreteci (1 kHz, 20 V tepe-tepe sinüs), 10 kΩ’luk seri direnç ve iki 1N4001. D1’in katodu 3 V’luk B1 pilinin + ucunda; D2’nin anodu ters bağlı 2 V’luk B2 pilinin − ucunda, yani −2 V’ta. Laboratuvarda bu iki kaynak, güç kaynağının topraktan yalıtılmış iki çıkışıdır (2. çıkış ters bağlanır). Osiloskobun A kanalı girişi, B kanalı çıkışı gösteriyor.',
    purpose:
      'Sinyali iki yönden sınırlar ve bir pencerenin içinde tutar. Pozitif tepelerde D1 iletir (3 V + V_{D}), negatif tepelerde D2 iletir (−2 V − V_{D}): çıkış ≈ +3,46 V ile ≈ −2,47 V arasında kalır. Pillerin gerilimini değiştirip pencerenin nasıl kaydığına bak.',
    everyday:
      'Ölçü aletlerinin ve ses kartlarının girişleri bu tür çift diyotla korunur; radyo ve televizyon yayınlarında sinyalin belirli bir genliği aşmaması için sınırlayıcı (limiter) olarak kullanılır.',
  },
  'jfet-karakteristik': {
    title: 'BF245A: çıkış ve transfer karakteristiği',
    description: `DC güç kaynağının 1. çıkışı (V_{DD} = 10 V) ampermetre üzerinden BF245A’nın drain’ini besliyor. 2. çıkış ters bağlı: + ucu source tarafındaki ortak hatta, − ucu kapıda; böylece V_{GS} = −V_{GG}. V1, V_{DS}’yi; V2, V_{GS}’yi ölçüyor. Başlangıçta V_{GG} = 0. Ortak hat kapı kablosunu keserek geçer: ${CROSSING}`,
    purpose:
      'Kapı geriliminin drain akımını nasıl denetlediğini ölçer: JFET gerilimle kontrol edilen bir dirençtir ve kapısından neredeyse hiç akım geçmez. V_{DS} = 10 V’ta I_{D} ≈ 4,1 mA (V_{GS} = 0), ≈ 3,2 mA (−0,2 V) ve ≈ 2,5 mA (−0,4 V). Doyumda I_{D} = I_{DSS} · (1 − V_{GS} / V_{P})² · (1 + λV_{DS}); bu BF245A’da I_{DSS} ≈ 3,5 mA, V_{P} ≈ −1,74 V. Çıkış eğrisi için V_{DD}’yi 0–15 V arasında değiştir: önce omik bölge, sonra doyum. V_{GG}’yi akım sıfırlanana kadar artır: kısılma gerilimi ≈ 1,74 V.',
    everyday:
      'JFET’ler giriş direnci çok yüksek olduğu için gitar ve mikrofon ön yükselteçlerinde, multimetrelerin ve osiloskopların giriş katlarında ve analog anahtarlarda kullanılır.',
  },
  'fet-yukseltec': {
    title: 'BF245A ile ortak kaynaklı yükselteç (kazanç 10)',
    description: `Föydeki tasarım ödevinin bir çözümü: kapı R_{G} = 1 MΩ ile ortak hatta bağlı (V_{GS} = 0, I_{D} ≈ I_{DSS}), V_{DD} = 15 V, R_{D} = 2,7 kΩ. Giriş 1 µF ile kuplajlı: 1 kHz, 0,5 V tepe-tepe sinüs. Osiloskobun A kanalı girişi (kapı; AC kuplaj, 0,2 V/bölme), B kanalı çıkışı (drain; AC, 2 V/bölme) gösteriyor. A’nın kablosu V_{DD} hattını keserek geçer: ${CROSSING}`,
    purpose:
      'Küçük bir gerilim değişimini yaklaşık on kat büyütür. Kapıdaki küçük değişim drain akımını değiştirir; bu akım R_{D} üzerinde büyük bir gerilim değişimi oluşturur. Kazanç ≈ −10: A_{v} = −g_{m} · (R_{D} ∥ r_{o}), g_{m} = 2 · I_{D} / |V_{P}| ≈ 4,4 mS (I_{D} ≈ 3,8 mA). Eksi işareti, çıkışın girişle ters fazlı (180°) olduğunu söyler. Girişi 2 V tepe-tepeye çıkar: çıkış bozulur (≈ 1,2 V ile 14,5 V arası), çünkü transistör doğrusal bölgenin dışına çıkar.',
    everyday:
      'Elektro gitarların ve kondansatör mikrofonların içindeki ilk yükseltme katı çoğu zaman tek bir JFET’tir; radyo alıcılarının anten girişindeki düşük gürültülü yükselteçlerde de JFET kullanılır.',
  },
  'bjt-yukseltec': {
    title: 'BC107 ile ortak emetörlü yükselteç',
    description: `Föydeki tasarımın bir çözümü: V_{CC} = 12 V, R_{B} = 2,2 MΩ (sabit baz akımı), R_{C} = 5,6 kΩ, β = 200. Üreteç 1 kHz sinüs, −20 dB zayıflatıcıyla 20 mV tepe-tepe; girişte 10 µF’lık kuplaj kondansatörü var. Osiloskobun A kanalı girişi (baz; AC, 5 mV/bölme), B kanalı çıkışı (kollektör; AC, 1 V/bölme) gösteriyor. A’nın kablosu V_{CC} hattını keserek geçer (bu devrede bir kesişme kaçınılmazdır): ${CROSSING}`,
    purpose:
      'Küçük bir sinyali iki yüz kattan fazla büyütür. I_{B} = (12 V − 0,63 V) / 2,2 MΩ ≈ 5,2 µA ve I_{C} ≈ β · I_{B} ≈ 1,05 mA; V_{CE} ≈ 6,1 V olduğundan çıkış iki yöne de salınabilir. Kazanç ≈ −204: A_{v} ≈ −g_{m} · R_{C}, g_{m} = I_{C} / V_{T} ≈ 40 mS; çıkış ters fazlıdır. 1 MHz’te kazanç ≈ 127’ye düşer (kollektör-baz kapasitesi ve osiloskobun 25 pF’lık girişi). Girişi 100 mV tepe-tepeye çıkar: çıkış doyumla (≈ 0,1 V) ve kesimle (≈ 11,6 V) kırpılır. β’yı değiştirince çalışma noktası kayar: sabit baz akımlı öngerilim β’ya bağlıdır.',
    everyday:
      'Ortak emetörlü yükselteç radyoların, işitme cihazlarının, mikrofon ön yükselteçlerinin ve sensör devrelerinin temel yapı taşıdır; işlemsel yükselteç entegrelerinin içinde de aynı kat vardır.',
  },
  'mosfet-yukseltec': {
    title: 'IRF510 ile ortak kaynaklı yükselteç',
    description: `V_{DD} = 15 V, R_{D} = 10 kΩ, R_{S} = 1 kΩ. Kapıyı fonksiyon üreteci doğrudan sürüyor: 4,55 V DC offset üzerine 1 kHz, 0,1 V tepe-tepe sinüs. IRF510’un eşiği ≈ 3,8 V olduğundan offset, transistörü küçük bir akımla iletime sokar. Osiloskobun A kanalı girişi (kapı; AC, 50 mV/bölme), B kanalı çıkışı (drain; AC, 0,5 V/bölme) gösteriyor. A’nın kablosu V_{DD} hattını keserek geçer: ${CROSSING}`,
    purpose:
      'MOSFET’le gerilim yükseltir. I_{D} ≈ 0,70 mA, V_{DS} ≈ 7,3 V. Kazanç ≈ −9,7: A_{v} ≈ −R_{D} / (R_{S} + 1 / g_{m}), g_{m} = 2 · √(k · I_{D}) ≈ 59 mS. R_{S} negatif geri besleme yapar: kazancı transistörün dağınık özelliklerinden çok dirençlerin oranı belirler ve çalışma noktası kararlı olur. Çıkış girişle 180° ters fazlıdır. 1 V tepe-tepe girişte çıkış ≈ 3,2 V ile 12,9 V arasında salınır; kare yasası yüzünden iki yarı eşit değildir.',
    everyday:
      'IRF510 gibi güç MOSFET’leri çoğunlukla anahtar olarak motor sürücülerde, LED dimmerlerde ve güç kaynaklarında çalışır; amatör telsizciler onları kısa dalga verici yükselteçlerinde de kullanır. Bilgisayar işlemcilerindeki milyarlarca transistör de MOSFET’tir.',
  },
  'bjt-anahtar': {
    title: 'Transistör anahtar: LED kollektörde',
    description: `Fonksiyon üretecinin TTL (darbe) çıkışı 1 Hz’lik 0/5 V kare dalga veriyor; R_{1} = 10 kΩ BC107’nin bazını sürüyor. Kollektörde R_{2} = 1 kΩ ve kırmızı LED, V_{CC} = 12 V’a bağlı. Osiloskobun A kanalı girişi (TTL), B kanalı kollektörü (V_{CE}) gösteriyor. A’nın kablosu V_{CC} hattını keserek geçer: ${CROSSING}`,
    purpose:
      'Küçük bir baz akımıyla büyük bir yükü açıp kapatır. Giriş 5 V’ta I_{B} = (5 V − 0,7 V) / 10 kΩ ≈ 0,43 mA; β · I_{B} ≈ 86 mA olurdu, ama kollektör akımı en fazla (12 V − 1,8 V) / 1 kΩ ≈ 10 mA olabilir. Transistör doyuma girer: V_{CE} ≈ 0,04 V, LED’den ≈ 10 mA geçer. Giriş 0 V’ta baz akımı yoktur: transistör kesimde, LED sönük. Transistör ya tam açık ya tam kapalı olduğu için üzerinde çok az güç harcanır.',
    everyday:
      'Bir mikrodenetleyicinin (Arduino gibi) pininden röle, motor, buzzer ya da LED şeridi sürmek bu devreyle yapılır. Araçlardaki sinyal lambaları ve bilgisayarların dijital devreleri de transistörü anahtar olarak kullanır.',
  },
  'bjt-anahtar-emetor': {
    title: 'Transistör anahtar: LED emetörde',
    description:
      'Aynı parçalar; bu kez kollektör doğrudan 12 V’ta, LED ve R_{2} = 1 kΩ emetör ile ortak hat arasında. Baz yine TTL çıkışından R_{1} = 10 kΩ ile sürülüyor.',
    purpose:
      'Yük yanlış yerdeyken transistörün anahtar gibi çalışmadığını gösterir. LED’den yalnızca ≈ 2,6 mA geçer ve LED sönük yanar; transistör doyuma girmez, aktif bölgede kalır (V_{CE} ≈ 7,8 V). Emetör bazın ≈ 0,65 V altını izler (emetör izleyici): I_{E} ≈ (5 V − 0,65 V − V_{LED}) / (R_{2} + R_{1} / β) ≈ 2,5 mA. Akımı V_{CC} değil giriş gerilimi belirler; anahtar olarak kullanmak için yük kollektörde olmalıdır.',
    everyday:
      'Emetör izleyici, bir sinyali yüklemeden başka bir devreye aktaran bir tampondur: ses yükselteçlerinin çıkış katları ve doğrusal gerilim regülatörlerinin geçiş transistörü bu bağlantıda çalışır.',
  },
  'baraj-cubuk': {
    title: 'Baraj uyarısı: çubuk gösterge',
    description: `Baraj haznesinin dibinde ortak prob (+9 V) ve üç seviye probu var. Her seviyenin devresi kendi bandında: prob → 10 kΩ’luk baz direnci → BC107; bazda 10 µF ve 100 kΩ, kollektörde LED ve 470 Ω. Bantların ortak hattı sağdaki ortak baradan pilin − ucuna döner; bara iki RC bağlantısını keserek geçer: ${CROSSING} Hazne Doldur kipinde: Oynat’a basınca su %20’den 16 saniyede dolar. Suyun içinde neler olduğunu görmek için hazneye yaklaş.`,
    purpose:
      'Suyun yüksekliğini ışıklı bir çubukla gösterir. Prob kuruyken devre açıktır; su bir proba ulaşınca ortak prob ile o prob arasındaki su devreyi tamamlar. Su, içinde çözünmüş iyonlar (Ca²⁺, Mg²⁺, Na⁺, Cl⁻, HCO₃⁻…) olduğu için iletir: telde akımı elektronlar, suda iyonlar taşır; katyonlar (+) akım yönünde, anyonlar (−) ters yönde sürüklenir (hazneye yaklaşınca görülür). Yük, metal ile su arasında ancak elektrolizle geçer: + uçta (ortak prob) O₂ çıkar ya da metal çözünür, − uçta H₂ çıkar; bunun için elektrotlarda ≈ 1,7 V harcanır (polarizasyon). Baz akımı I_{B} ≈ (9 V − 0,65 V − 1,7 V) / (5 kΩ + 10 kΩ) ≈ 0,43 mA. β · I_{B}, LED devresinin izin verdiği akımdan (≈ 14 mA) çok büyük olduğu için transistör doyuma girer ve LED’i yakar: önce yeşil (≈ 3,4 s), sonra sarı (≈ 8,4 s), sonra kırmızı (≈ 13,4 s). Bazdaki kondansatör ve 100 kΩ, dalgalı su yüzeyinde LED’in titremesini önler. Su direncini 1 MΩ yap (çok saf su, iyon az): LED’den yalnızca ≈ 0,25 mA geçer.',
    everyday:
      'Su depolarında ve hidroforlarda seviye göstergeleri, kahve ve bulaşık makinelerindeki su seviyesi sensörleri, bodrumlarda su baskını alarmları. Barajlarda gerçek seviye ölçümü çoğunlukla basınç ya da ultrasonik sensörlerle yapılır, ama uyarı mantığı aynıdır. Doğru akım elektrotları zamanla aşındırır (Faraday’ın elektroliz yasası: 0,5 mA’lik sürekli akım bir yılda ≈ 5 g bakır çözer); bu yüzden gerçek sensörlerde paslanmaz çelik ya da grafit problar kullanılır ve problar alternatif akımla ya da yalnızca kısa aralıklarla beslenir.',
  },
  'baraj-tek-isik': {
    title: 'Baraj uyarısı: tek ışık',
    description: `Çubuk göstergenin aynısı, iki “susturma” transistörü eklenmiş. Q4’ün bazı Seviye 2 probundan, Q5’in bazı Seviye 3 probundan 10 kΩ ile sürülür; kollektörleri yeşilin (Q1) ve sarının (Q2) baz hattına, emetörleri ortak hatta bağlıdır. Q4 ve Q5’in prob kabloları birer prob kablosunu keserek geçer: ${CROSSING} Hazne yine %20’den 16 saniyede dolar.`,
    purpose:
      'Aynı anda yalnızca en yüksek seviyenin ışığını yakar (öncelik mantığı). Problar çubuk göstergedeki gibi çalışır: su devreyi tamamlar, suda akımı iyonlar taşır ve elektrotlarda ≈ 1,7 V elektrolize harcanır. Seviye 2 ıslanınca (≈ 8,4 s) Q4 doyuma girer ve Q1’in bazını ≈ 0,01 V’a çeker: Q1 kesime gider, yeşil söner, aynı anda sarı yanar. Seviye 3’te (≈ 13,4 s) Q5 sarıyı söndürür; yalnız kırmızı kalır. Hazne doluyken Q3, Q4 ve Q5 doyumda, Q1 ve Q2 kesimde: yeşil = Seviye 1 VE (Seviye 2 DEĞİL). Su akışını Boşalt yap: ışık kırmızıdan sarıya, sonra yeşile döner.',
    everyday:
      'Tek ışıklı durum göstergeleri (yeşil-sarı-kırmızı), yakıt ve batarya göstergelerinin en yüksek seviyeyi gösteren mantığı, asansörlerin kat göstergeleri ve öncelikli alarm panelleri aynı mantık kapılarıyla kurulur.',
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
      ics: 'Entegreler',
      instruments: 'Laboratuvar cihazları',
      switches: 'Anahtarlar ve koruma',
      outputs: 'Çıkış elemanları',
      sensors: 'Sensörler',
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
    fitTitle: 'Devreyi ekrana sığdır (Shift+1)',
    fullscreen: 'Tam ekran',
    fullscreenTitle: 'Tam ekran: yalnızca devre şeması (çıkmak için Esc)',
    fullscreenExit: 'Tam ekrandan çık',
    libraryPanel: 'Parça kütüphanesi',
    railPanel: 'Araç şeridi (Parça ekle, Bağla)',
    inspectorPanel: 'İnceleme paneli',
    notebookPanel: 'Defter',
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
    sound: 'Sesi çal (hoparlör, buzzer)',
    soundNote: 'Yalnızca ×1 hızda çalar',
    magneticField: 'Manyetik alanı göster',
    magneticFieldNote:
      'Kabloların iki yanında ⊙ (alan sayfadan dışarı) ve ⊗ (sayfaya doğru): sağ el kuralı, başparmak geleneksel akımın yönünde. Bobinlerde alan çizgileri ve N, S kutupları. Akım büyüdükçe işaretler sıklaşır ve koyulaşır.',
    currentSection: 'Akım ve görünüm',
    currentDots: 'Akım noktalarını göster',
    welcome: 'İlk açılış turunu göster',
    shortcuts: 'Kısayollar (?)',
  },
  canvas: {
    label: 'Devre şeması',
    empty: 'Başlamak için sağdaki defterin sonundaki “Parça ekle” satırına bir parça adı yaz.',
    emptyAction: 'Örneklerden başla',
    emptyMobile: 'Parça eklemek için alttaki **Parça** düğmesine dokun.',
    wiringActive: 'Kablo çiziliyor: bir pine ya da kabloya dokun',
    cancelWire: 'İptal',
    dropHint: 'Uca bırak: bağla',
    escCancel: 'vazgeç',
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
    legendIons: 'Suda iyonlar · + akım yönünde, − ters',
    legendField: 'Manyetik alan · ⊙ dışarı, ⊗ içeri',
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
    inductance: 'Endüktans',
    coilEnergy: 'Depolanan enerji (½LI²)',
    inductorRising: 'Akım artıyor: bobin bu değişime karşı koyar (Lenz), uçlarında v = L·di/dt kadar gerilim var.',
    inductorFalling: 'Akım azalıyor: bobin depoladığı enerjiyi devreye geri veriyor (v = L·di/dt).',
    inductorSteady: 'Akım değişmiyor: bobin, sargı direnci kadar bir dirençtir.',
    turnsRatio: 'Sarım oranı N₁ : N₂',
    primary: 'Birincil (P)',
    secondary: 'İkincil (S)',
    powerInOut: 'Giriş / çıkış gücü',
    timerOutput: 'Çıkış',
    timerHigh: 'Yüksek',
    timerLow: 'Düşük',
    timerThreshold: 'THRES / eşik (2/3·V_CC)',
    timerTrigger: 'TRIG / eşik (1/3·V_CC)',
    timerDischarge: 'Deşarj anahtarı',
    timerNote:
      'TRIG 1/3·V_CC’nin altına inince çıkış yüksek olur ve deşarj anahtarı açılır; THRES 2/3·V_CC’yi geçince çıkış düşer ve anahtar kapanarak DISCH’i toprağa bağlar. Kondansatörün dolma ve boşalma süresi (τ = R·C) zamanlamayı belirler.',
    arduinoUsbCurrent: 'USB’den çekilen akım',
    arduinoBoard: '5V ucu',
    arduinoSerial: 'Seri ekran',
    arduinoIdle: 'Program yok',
    arduinoModes: ['giriş', 'giriş (çekme)', 'DÜŞÜK', 'YÜKSEK'] as const,
    arduinoNote:
      'Program işlemcide gerçek zamanlamayla çalışır: çıkış pini 0 ya da 5 V’u ≈ 25 Ω’luk iç dirençle verir, giriş pini gerilimi eşikle (2,6 V / 2,15 V) okur, analogRead A0–A5’in gerilimini 5 V’a göre 0–1023’e çevirir.',
    opampDifferential: 'Giriş farkı (v₊ − v₋)',
    opampOutput: 'Çıkış gerilimi',
    opampCurrent: 'Çıkış akımı',
    opampModes: {
      linear: 'Doğrusal',
      high: 'Pozitif doyumda',
      low: 'Negatif doyumda',
      slewing: 'Eğim sınırında (0,5 V/µs)',
      limited: 'Akım sınırında (25 mA)',
    } as Record<'linear' | 'high' | 'low' | 'slewing' | 'limited', string>,
    opampNotes: {
      linear:
        'Çıkış = A · (v₊ − v₋), A ≈ 200 000. Geri besleme varsa çıkış, giriş farkını neredeyse sıfırda tutacak değere gelir (sanal kısa devre): kazancı dirençler belirler.',
      high: 'Giriş farkı, çıkışı V+’nın ≈ 1 V altına kadar sürüyor: çıkış daha yükseğe çıkamaz (doyum). Karşılaştırıcıda bu “yüksek” durumudur.',
      low: 'Giriş farkı, çıkışı V−’nin ≈ 1 V üstüne kadar sürüyor: çıkış daha alçalamaz (doyum). Karşılaştırıcıda bu “düşük” durumudur.',
      slewing: 'Çıkış en fazla 0,5 V/µs hızla değişebilir: hızlı ve büyük sinyaller üçgenleşir (eğim sınırı).',
      limited: 'Çıkıştan çekilen akım iç koruma sınırında (≈ 25 mA): çıkış kısa devre ya da yük çok küçük.',
    } as Record<'linear' | 'high' | 'low' | 'slewing' | 'limited', string>,
    averagePower: 'Ortalama güç',
    spl1m: 'Ses basıncı (1 m)',
    spl10cm: 'Ses basıncı (10 cm)',
    speakerNote:
      'Bobinden geçen değişen akım mıknatısın alanında bir kuvvetle (F = B·I·L) zarı ileri geri iter; zar havayı titreştirir. Ses basıncı zarın ivmesiyle orantılıdır. Doğru akım zarı yalnızca bir yana iter, ses vermez.',
    buzzerOn: 'Ötüyor (2,4 kHz)',
    buzzerOff: 'Sessiz',
    buzzerNote: 'İçindeki osilatör bobini 2,4 kHz’te açıp kapar; çekilen demir diyafram titreşir. ≈ 3 V’un altında osilatör çalışmaz.',
    fuseHeat: 'Telin ısınması (erime: %100)',
    fuseBlown: 'Attı (tel eridi)',
    fuseNote:
      'Tel akımın karesiyle ısınır (Joule): büyük akım teli çabuk eritir (I²t), anma akımına yakın akımlarda tel ısısını çevreye verip dengede kalır.',
    fuseBlownNote: 'Tel eridi, devre açık. Arızayı (kısa devreyi) giderip sağ tıklayarak “Onar”ı seç: yeni sigorta takılır.',
    potPosition: 'Sürgünün konumu',
    potHalves: 'Direnç 1–S / S–3',
    potWiper: 'Sürgünün gerilimi (3. uca göre)',
    potNote: 'Sürgü direnci ikiye böler: gerilim bölücü. Sürgüden akım çekilmiyorsa V_{S3} = V_{13} · R_{S3} / R_{13}; sürgüye yük bağlanınca gerilim bu değerin altına düşer.',
    ldrIlluminance: 'Aydınlık',
    ldrNote:
      'Işık, kadmiyum sülfürdeki elektronları serbest bırakır (fotoiletkenlik): ışık arttıkça taşıyıcı sayısı artar, direnç azalır. R = R₁₀ · (E / 10 lx)^{−γ}.',
    resistanceNow: 'Direnç',
    temperature: 'Sıcaklık',
    selfHeating: 'Öz ısınma',
    ntcNote:
      'Sıcaklık arttıkça yarı iletken seramikte daha çok yük taşıyıcı serbest kalır ve direnç üstel olarak azalır: R ≈ R₂₅ · e^{B·(1/T − 1/T₂₅)}, B = 3977 K.',
    filament: 'Filaman sıcaklığı',
    lampLight: 'Işık (anma değerine göre)',
    lampNote: (cold: string) =>
      `Tungstenin direnci sıcaklıkla artar: soğukken ${cold}. Yakıldığı an akım büyüktür, filaman ısındıkça direnç artar ve akım anma değerine iner. Isınan filaman ışınımla soğur; ışık sıcaklıkla çok hızlı artar.`,
    lampBurnedNote: 'Filaman eridi ve koptu: lamba açık devredir. Durdur’a bas ya da sağ tıklayıp “Onar”ı seç.',
    motorSpeed: 'Hız',
    motorRpm: (rpm: string) => `${rpm} dev/dk`,
    motorEmf: 'Zıt EMK (e = k·ω)',
    motorTorque: 'Motor torku (k·I)',
    motorLoadPower: 'Yüke verilen güç',
    motorStalled: 'Motor dönmüyor: zıt EMK yok, akımı yalnızca sargı direnci sınırlıyor (I = V / R). Uzun sürerse sargı ısınır.',
    motorGenerating:
      'Motor jeneratör gibi çalışıyor: dönen mil zıt EMK üretiyor ve akım devreye geri akıyor. Bu akım mile ters yönde tork uygular (Lenz): motor frenlenir.',
    motorRunning:
      'Dönen sargıda hızla orantılı bir zıt EMK (e = k·ω) oluşur ve akımı azaltır: I = (V − e) / R. Yük arttıkça hız düşer, akım artar.',
    relayEnergized: 'Çekili: C–NA kapalı, NK açık',
    relayReleased: 'Bırakılmış: C–NK kapalı, NA açık',
    relayCoil: 'Sargı',
    relayThresholds: 'Çekme / bırakma akımı',
    relayContact: 'Kontak akımı',
    relayNote:
      'Sargıdan geçen akım demir çekirdeği mıknatıslar ve paleti çeker (elektromıknatıs); palet kontağı değiştirir. Çekili paletin hava aralığı kapalı olduğu için onu tutmak çekmekten çok daha az akım ister. Sargı ile kontak arasında iletken yol yoktur.',
    transformerNote:
      'Birincildeki değişen akım çekirdekte değişen bir manyetik akı oluşturur; bu akı ikincilde ε = −N₂·dΦ/dt kadar gerilim indükler (Faraday). Gerilim oranı ≈ N₁ / N₂, akım oranı bunun tersi. Doğru akımda akı değişmez, ikincilde gerilim olmaz. İki sargı arasında iletken yol yoktur (galvanik yalıtım).',
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
    none: 'yok',
    tankNote:
      'Su, içinde çözünmüş iyonlar (Ca²⁺, Na⁺, Cl⁻, HCO₃⁻…) olduğu için iletir: suda akımı iyonlar taşır, katyonlar akım yönünde, anyonlar ters yönde sürüklenir. Kuru prob açık devredir. Yük, metal ile su arasında ancak elektrolizle geçer (anotta O₂ çıkar ya da metal çözünür, katotta H₂ çıkar); bunun için elektrotlarda ≈ 1,5–2 V harcanır (polarizasyon). Akım, ortak probdan suya geçen akımdır.',
    polarization: 'Elektrotlarda (elektroliz)',
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
      reverse: 'Ters aktif',
    } as Record<string, string>,
    bjtNotes: {
      cutoff: 'Kesim: B-E eklemi iletimde değil; transistör açık bir anahtar gibi, I_{C} ≈ 0.',
      active: 'Aktif bölge: I_{C} ≈ β · I_{B}; transistör yükselteç gibi çalışır.',
      saturation: 'Doyum: transistör kapalı bir anahtar gibi; I_{C} artık β · I_{B}’den küçüktür ve dış devre belirler.',
      reverse:
        'Ters aktif: B-E değil B-C eklemi iletimde; kollektör ile emetör yer değiştirmiş gibi çalışır ve kazanç çok düşüktür (β_{R} ≈ 8). Transistör ters bağlanmış olabilir.',
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
    dialogHint: 'Bir örneğe tıkla: devre açılır; ne işe yaradığı ve günlük hayatta nerede kullanıldığı Örnek kartında çıkar.',
    dialogClose: 'Örnekler penceresini kapat',
    groups: {
      temel: 'Temel devreler',
      aletler: 'Laboratuvar cihazları',
      elektromanyetizma: 'Elektromanyetizma',
      sensorler: 'Ayarlı parçalar ve sensörler',
      ses: 'Ses ve koruma',
      entegreler: 'Entegreler',
      arduino: 'Arduino',
      'diyot-karakteristigi': 'Deney 1 · Diyot karakteristikleri',
      dogrultucu: 'Deney 2 · Doğrultucular',
      kenetleyici: 'Deney 3 · Kenetleyici ve gerilim katlayıcı',
      kirpici: 'Deney 4 · Kırpıcılar',
      'fet-karakteristigi': 'Deney 5 · FET karakteristikleri',
      'fet-yukseltec': 'Deney 6 · JFET’li yükselteç',
      'bjt-yukseltec': 'Deney 7 · BJT’li yükselteç',
      'mosfet-yukseltec': 'Deney 8 · MOSFET’li yükselteç',
      anahtar: 'Deney 9 · Transistörün anahtar olarak kullanılması',
      baraj: 'Proje · Baraj su seviyesi uyarısı',
    } as Record<ExampleGroupId, string>,
    texts: EXAMPLES,
    /** Defterdeki katlı örnek kartının kısa başlığı: ne yapılacağı ya da neye bakılacağı (v3). */
    cues: {
      'led-on-direnc': 'Ön direnci küçült, LED’in akımını izle',
      'gerilim-bolucu': 'Dirençleri değiştir, çıkış gerilimini izle',
      'voltmetre-yukleme': 'Voltmetre neden 12 V yerine 10 V okuyor?',
      'ampermetre-etkisi': 'Ampermetrenin iç direnci akımı nasıl değiştiriyor?',
      'rc-dolma': 'Oynat, kondansatörün dolmasını izle',
      'rc-kare-dalga': 'Osiloskopta dolma ve boşalmayı izle',
      'rl-devresi': 'Anahtarı kapat, akımın yavaş yükselişini izle',
      'bobin-serbest-gecis': 'Anahtarı aç, diyodun bobini nasıl koruduğuna bak',
      'diyot-yonu': 'Diyodu ters çevir (F), akımı karşılaştır',
      'toprak-tuzagi': 'Ne gösteriyor, nasıl düzeltilir?',
      transformator: 'Sarım oranını değiştir, ikincil gerilimi izle',
      adaptor: 'Şebekeden düzgün doğru gerilime adım adım bak',
      'transformator-dc': 'Anahtarı kapat, ikincildeki kısa darbeyi izle',
      role: 'S1’i kapat, rölenin çekip lambayı yakmasını izle',
      'role-transistor': 'Transistörün röleyi nasıl sürdüğüne bak',
      'role-muhurleme': 'S1’e bas bırak, rölenin kendini tutmasını izle',
      'dc-motor': 'S1’i kapat, kalkış akımının düşüşünü izle',
      'motor-jenerator': 'S1’i aç, motorun gerilim üretmesini izle',
      'motor-h-koprusu': 'Anahtar çiftlerini değiştir, motorun yönünü izle',
      potansiyometre: 'Sürgüyü kaydır, çıkış gerilimini izle',
      'ldr-gece-lambasi': 'Işığı azalt, lambanın yanmasını izle',
      'ntc-termometre': 'NTC’yi ısıt, çıkış gerilimini izle',
      'lamba-ani-akim': 'Anahtarı kapat, ilk anki akım sıçramasını izle',
      hoparlor: 'Frekansı değiştir, sesin perdesini dinle',
      'buzzer-sicaklik': 'NTC’yi ısıt, buzzer’ın ötmesini dinle',
      sigorta: 'Sigortanın hangi akımda attığına bak',
      'opamp-evirmeyen': 'Girişi değiştir, çıkışın 11 katına çıkmasını izle',
      'opamp-eviren': 'Kazancı ve sanal toprağı izle',
      'opamp-karsilastirici': 'Işığı değiştir, çıkışın bir uçtan öbürüne geçişini izle',
      '555-astabil': 'RB’yi değiştir, yanıp sönme hızını izle',
      '555-monostabil': 'S1’e bas, LED’in ne kadar yandığını izle',
      '555-ses': 'Kondansatörü değiştir, sesin perdesini dinle',
      'ard-blink': 'Kodu oku, LED’in yanıp sönmesini izle',
      'ard-dugme': 'Düğmeye bas, LED’i yak',
      'ard-sayac': 'Düğmeye bas, Seri ekrandaki sayıyı izle',
      'ard-trafik-isigi': 'Işıkların sırasını ve LED akımlarını izle',
      'ard-fade': 'LED’in yavaşça parlayıp sönmesini izle',
      'ard-potansiyometre': 'Sürgüyü kaydır, parlaklığı ve okunan sayıyı izle',
      'ard-gece-lambasi': 'Işığı azalt, lambanın yanmasını izle',
      'ard-termometre': 'NTC’nin sıcaklığını değiştir, Seri ekranı izle',
      'ard-pwm-filtre': 'PWM’in düzgün bir gerilime dönüşmesini izle',
      'ard-melodi': 'Melodiyi dinle, notaların frekansına bak',
      'ard-role': 'Arduino’nun röleyle lambayı yakmasını izle',
      'diyot-dc': 'Kaynağı değiştir, akım-gerilim tablosunu doldur',
      'diyot-karakteristigi': 'X-Y ekranında diyodun eğrisini izle',
      'zener-karakteristigi': 'X-Y ekranında zenerin kırılmasını izle',
      'led-karakteristigi': 'LED’in eşiğini diyodunkiyle karşılaştır',
      'yarim-dalga': 'Osiloskopta giriş ve çıkış dalgasını karşılaştır',
      'kopru-dogrultmac': 'Osiloskopta tam dalga çıkışı izle',
      'negatif-kenetleyici': 'Osiloskopta dalganın aşağı kaymasını izle',
      'pozitif-kenetleyici': 'Osiloskopta dalganın yukarı kaymasını izle',
      'gerilim-katlayici': 'Çıkışın girişin iki katına çıkmasını izle',
      'paralel-kirpici': 'Osiloskopta 4 V’un üstünün kesilmesini izle',
      'cift-kirpici': 'Osiloskopta iki yönden kırpılmayı izle',
      'jfet-karakteristik': 'Kapı gerilimini değiştir, drain akımını izle',
      'fet-yukseltec': 'Giriş ve çıkış genliklerini karşılaştır',
      'bjt-yukseltec': 'Giriş ve çıkışı osiloskopta karşılaştır',
      'mosfet-yukseltec': 'Kazancı osiloskopta ölç',
      'bjt-anahtar': 'Girişi değiştir, LED’in tam yanmasını izle',
      'bjt-anahtar-emetor': 'LED neden sönük yanıyor?',
      'baraj-cubuk': 'Hazneyi doldur, ışıkların sırayla yanmasını izle',
      'baraj-tek-isik': 'Hazneyi doldur, yalnızca en üst ışığın yanmasını izle',
    } satisfies Record<ExampleId, string>,
    badge: 'Örnek',
    purpose: 'Ne işe yarar?',
    everyday: 'Günlük hayatta',
    loaded: 'Örnek yüklendi.',
    tabBadge: (group: string) => `Örnek · ${group}`,
    previous: '← Önceki',
    next: 'Sonraki →',
    previousLabel: 'Önceki örnek',
    nextLabel: 'Sonraki örnek',
    closeExample: 'Örneği kapat',
    noneTitle: 'Açık örnek yok',
    noneText: 'Örnekler penceresinden bir devre açınca açıklaması, ne işe yaradığı ve günlük hayatta nerede kullanıldığı burada çıkar.',
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
    tank: 'Su haznesi',
    level: 'Su seviyesi',
    levelSet: 'Seviyeyi elle ayarla',
    flow: 'Su akışı',
    fillTime: 'Dolma süresi',
    waterResistance: 'Su direnci',
    probes: 'Islak problar',
    probe: (n: number) => (n === 0 ? 'Ortak' : `Seviye ${n}`),
    tankNote:
      'Doldur’a basınca su simülasyon zamanıyla yükselir (boştan doluya dolma süresinde); Boşalt ile iner. Durdur’dan sonra başlangıç seviyesine döner.',
    output: (n: number) => `${n}. çıkış`,
    voltage: 'Gerilim',
    currentLimit: 'Akım sınırı',
    ccNote: (set: string, actual: string) => `Akım sınırında: çıkış ${set} yerine ${actual} veriyor.`,
    notConnected: 'Bağlı değil · çıkışlar topraktan yalıtılmış',
    measureHint: '**Ölç düzeni:** raf büyüdü. Kur düzenine dönmek için bir parça sürükle ya da Durdur’a bas.',
    settingsInRack: 'Bu cihazın bütün ayarları cihaz rafındaki ön panelinde.',
    showInRack: 'Rafta göster',
    autoDone: (parts: string) => `Oto: ${parts}`,
    autoSpeed: (speed: string) => `hız ${speed}`,
  },
  pcb: {
    title: 'Baskı devre (PCB) olarak üret',
    text:
      'Aynı devreden iki katmanlı bir baskı devre kartı: parçalar breadboard’daki sırasıyla, gövdeleri çakışmayacak kadar aralıklı (breadboard’un 2,54 mm’lik delik ızgarası gerçek parçaların bacak aralığıyla aynıdır); karttan dışarı giden bağlantılar kenarda vidalı klemens ya da pin başlık; entegrelere 100 nF dekuplaj kondansatörü. Bakır yollar otomatik çizilir (üst yüz kırmızı, alt yüz mavi) ve tasarım kuralları denetlenir.',
    routing: 'Yollar çiziliyor…',
    routed: (connections: number, vias: number) => `Yollar: ${connections} bağlantının hepsi çizildi${vias > 0 ? `, ${vias} via` : ''}. Tasarım kuralları temiz (aralık 0,25 mm, kenar 0,5 mm).`,
    unrouted: (count: number, connections: number) =>
      `${connections} bağlantıdan ${count} tanesi çizilemedi: üretim dosyası verilmez. KiCad dosyalarını indirip eksik yolları KiCad’de çiz (ince çizgiler gösterir).`,
    drcFailed: (first: string) => `Tasarım kuralı denetiminde hata var (${first}); üretim dosyası verilmez. KiCad dosyalarını indirip KiCad’de düzelt.`,
    fabrication: 'Üretim dosyalarını indir (Gerber, .zip)',
    download: 'KiCad dosyalarını indir (.zip)',
    order:
      'Üretim zip’i doğrudan üreticiye yüklenir (Gerber RS-274X + Excellon delik dosyası). Siparişte: 2 katman, 1,6 mm FR-4, 1 oz bakır, yüzey kurşunsuz HASL; en ince yol 0,3 mm, en küçük delik 0,4 mm. Üretici kartın çizimini gösterir: onaylamadan önce bak. Gümrük (Şubat 2026’dan beri): AB dışından posta/hızlı kargo gönderilerinde 30 € muafiyeti yok, vergi ≈ %60; Türkiye’deki üreticilerden teklif almak da bir seçenek. Malzeme listesi KiCad zip’inde.',
    previewLabel: 'Baskı devre kartının üstten görünüşü: pedler, üst ve alt yüzdeki bakır yollar, serigrafi',
    size: (mm: string) => `Kart boyutu: ${mm}`,
    mains:
      'Bu devrede şebekeye (230 V) bağlanan bir transformatör var: şebeke gerilimli kartlar ayrı güvenlik kuralları (yalıtım aralığı, sertifika) ister ve aktarılmaz. Transformatörü çıkarıp devreyi hazır bir AC ya da DC adaptörün düşük gerilim çıkışından besle.',
    addedDecoupling: (ref: string, ic: string) => `${ref}: ${ic} için 100 nF dekuplaj kondansatörü (simülatörde yok; gerçek kartta besleme ucuna yakın olmalı)`,
    addedConnector: (ref: string, label: string, type: string) => `${ref}: ${label} (${type}) için bağlantı`,
    ammeterBridge: '; ampermetre seri bağlıdır: ölçüm yapmazken iki pini bir jumper başlığıyla köprüle, yoksa devre açık kalır',
    readme: (title: string, size: string, added: readonly string[], unrouted: number) =>
      [
        `${title} · Devre Simülatörü'nden aktarılan PCB tasarımı`,
        '',
        `Kart boyutu: ${size} (2 katman, 1,6 mm FR-4). Kılıflar dosyanın içinde; her birinin açıklamasında eşdeğer standart KiCad kılıfının adı var.`,
        unrouted === 0
          ? 'Bakır yollar çizili (sitenin otomatik yol çizicisi); tasarım kuralları sitede denetlendi.'
          : `Bakır yolların çoğu çizili; ${unrouted} bağlantı çizilemedi: KiCad’de ince çizgiyle (ratsnest) görünür, elle tamamla.`,
        '',
        'Eklenen parçalar:',
        ...added.map((a) => `  - ${a}`),
        '',
        'Adımlar:',
        '  1. KiCad 7 ya da üstünü kur (https://www.kicad.org). Klasördeki .kicad_pro dosyasını aç, PCB düzenleyiciye geç.',
        '  2. Parçalar breadboard’daki sırasıyla durur (gövdeleri çakışanlar en yakın boş yere kaydırıldı).',
        '     Parçayı taşımak istersen (M tuşu) önce yollarını sil; bağlantılar (ağlar) parçayla birlikte gider.',
        '  3. Eksik ya da yeniden çizilecek yollar: Route > Interactive Router (X tuşu) ya da Freerouting eklentisi (Tools > Plugin and Content Manager).',
        '     Ağ sınıfları hazır: GND ve VCC 0,8 mm, öbür yollar 0,3 mm; aralık 0,25 mm.',
        '  4. İstersen alt yüze bir GND dolgusu ekle (Place > Add Filled Zone, B.Cu, GND).',
        '  5. Inspect > Design Rules Checker: hata kalmasın (bağlanmamış ağ dahil).',
        '  6. File > Fabrication Outputs > Gerbers: F.Cu, B.Cu, F.Mask, B.Mask, F.Silkscreen, Edge.Cuts; ardından Generate Drill Files (Excellon).',
        '     Çıkan dosyaları zip’leyip üreticiye yükle (2 katman, 1,6 mm, kurşunsuz HASL). Kartı değiştirmediysen sitedeki "Üretim dosyalarını indir" aynı dosyaları verir.',
        '  7. Gümrük (Şubat 2026’dan beri): AB dışından posta/hızlı kargo gönderilerinde 30 € muafiyeti yok, vergi ≈ %60 (ürün + kargo). Türkiye’deki üreticilerden teklif almak da bir seçenek.',
        '',
        'Şema dosyası yoktur: değişiklik gerekirse devreyi simülatörde değiştirip yeniden aktar.',
        'Şebeke (230 V) bu karta bağlanmaz. İlk açılışta akım sınırlı bir kaynak kullan.',
        '',
      ].join('\r\n'),
  },
  solderGuide: {
    open: 'Lehim rehberi',
    title: 'Lehim rehberi: delikli plakete aktarma',
    intro:
      'Breadboard’daki yerleşimin aynısı, breadboard düzeninde bir delikli plakete (ör. Adafruit Perma-Proto) lehimlenir: sütun numaraları, a–j satırları ve raylar aynıdır. Parçaları aşağıdaki sırayla tak: önce alçak olanlar (jumper’lar, dirençler), en son uzun olanlar ve dışarı giden teller. Her parçayı takınca bacaklarını alttan lehimle ve fazlasını kes.',
    board: 'Kart',
    materials: 'Malzeme listesi',
    steps: 'Takma sırası',
    checksTitle: 'Bitince denetle',
    checks: [
      'Lehim köprüsü yok: komşu şeritler birbirine değmiyor (büyüteçle bak).',
      'Besleme (+) ile toprak (−) arasında kısa devre yok: multimetre direnç kipinde birkaç kΩ’dan büyük gösterir.',
      'LED’lerin, diyotların, elektrolitik kondansatörlerin ve transistörlerin yönü rehberdeki gibi; entegre sokete çentiği sola gelecek biçimde takılı.',
      'İlk açılışta akım sınırlı bir kaynak (ör. 50 mA) ya da seri bir direnç kullan; gerilimleri simülatördeki değerlerle karşılaştır.',
    ],
    diagramLabel: 'Delikli plaketin üstten görünüşü: parçalar, jumper’lar ve dışarı giden tellerin delikleri',
    print: 'Yazdır',
    close: 'Kapat',
  },
  bench: {
    viewGroup: 'Görünüm',
    schematic: 'Şema',
    bench: '3B',
    label: '3B tezgâh: devrenin parçaları ve kabloları masanın üstünde',
    loading: '3B tezgâh yükleniyor…',
    fit: 'Sığdır',
    top: 'Üstten',
    hintMouse: 'Sol tuşla sürükle: kaydır · orta (ya da sağ) tuşla sürükle: döndür · tekerlek: yakınlaştır · parçaya tıkla: seç · Oynat’tayken anahtara tıkla, potansiyometreyi sürükle',
    hintTouch: 'Bir parmak: döndür · iki parmak: yakınlaştır ve kaydır · parçaya dokun: seç · Oynat’tayken anahtara dokun',
  },
  arduino: {
    serial: 'Seri ekran',
    serialEmpty: 'Program henüz bir şey yazmadı (Serial.print).',
    serialStopped: 'Oynat’a basınca programın Serial.print çıktısı burada görünür.',
    code: 'Kod',
    flash: (bytes: string) => `${bytes} bayt`,
    noProgram: 'Program seçilmedi.',
    precompiled:
      'Bu örnek program önceden derlendi (avr-gcc, Arduino AVR çekirdeği) ve işlemcide komut komut çalışıyor. Programı yukarıdaki Program listesinden değiştirebilirsin; kodu değiştirmek şimdilik mümkün değil.',
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
    uncomputable: 'hesaplanamıyor',
    varyingNote:
      'Bazı değerler hızla değişiyor: ≈ işaretliler son 0,4 saniyenin etkin değeri (gerilim, akım) ya da ortalaması (güç ve öbürleri); ⇄ iki durum arasında gidip geliyor demek.',
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
  notebook: {
    label: 'Defter: devredeki parçalar',
    title: 'Devredeki parçalar',
    count: (n: number) => `${n} parça`,
    openCard: (label: string, type: string) => `${label} · ${type}: kartı aç`,
    collapse: 'Kartı küçült',
    floating: (n: number) => `${n} uç boşta`,
    burned: 'Yandı',
    lit: 'Yanıyor',
    more: 'Diğer ayarlar',
    decrease: (field: string) => `${field}: azalt`,
    increase: (field: string) => `${field}: artır`,
    colorCode: 'Renk kodu',
    colorCodeLabel: (bands: string) => `Renk kodu: ${bands}`,
    group: (name: string, labels: string) => `${name} · ${labels}`,
    groupToggle: (name: string, n: number) => `${name}: ${n} parça`,
    empty: 'Henüz parça yok. Parçaları şemaya ekleyince her biri burada bir kart olur.',
    noProblems: 'sorun yok',
    addPlaceholder: 'Parça ekle',
    addLabel: 'Parça ekle: adını yaz, Enter’a bas',
    addFree: 'Şemada boş yere eklenir',
    addChained: (pinOf: string) => `${toDative(pinOf)} bağlanır`,
    browseAll: (n: number) => `Bütün parçalara göz at (${n})`,
    allParts: 'Bütün parçalar',
    closeAll: 'Bütün parçalar penceresini kapat',
    showPart: (labelAccusative: string) => `${labelAccusative} göster`,
    moreProblems: (n: number) => `${n} sorun daha`,
    fewerProblems: 'Daha az göster',
    plural: {
      battery: 'Piller',
      acsource: 'AC kaynaklar',
      funcgen: 'Fonksiyon üreteçleri',
      dcsupply: 'DC güç kaynakları',
      ground: 'Topraklar',
      resistor: 'Dirençler',
      capacitor: 'Kondansatörler',
      inductor: 'Bobinler',
      transformer: 'Transformatörler',
      diode: 'Diyotlar',
      zener: 'Zener diyotlar',
      led: 'LED’ler',
      npn: 'NPN transistörler',
      pnp: 'PNP transistörler',
      njfet: 'N kanallı JFET’ler',
      pjfet: 'P kanallı JFET’ler',
      nmos: 'N kanallı MOSFET’ler',
      pmos: 'P kanallı MOSFET’ler',
      switch: 'Anahtarlar',
      relay: 'Röleler',
      motor: 'DC motorlar',
      potentiometer: 'Potansiyometreler',
      ldr: 'LDR’ler',
      ntc: 'NTC termistörler',
      lamp: 'Akkor lambalar',
      opamp: 'İşlemsel yükselteçler',
      arduino: 'Arduino’lar',
      timer555: '555 zamanlayıcılar',
      speaker: 'Hoparlörler',
      buzzer: 'Buzzer’lar',
      fuse: 'Sigortalar',
      voltmeter: 'Voltmetreler',
      ammeter: 'Ampermetreler',
      oscilloscope: 'Osiloskoplar',
      tank: 'Su hazneleri',
    } satisfies Record<DeviceType, string>,
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
    counts: (errors: number, warnings: number, infos = 0) => `${errors} hata · ${warnings} uyarı${infos > 0 ? ` · ${infos} bilgi` : ''}`,
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
    severity: { error: 'Hata', warning: 'Uyarı', info: 'Bilgi' },
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
  baraj: {
    title: 'Baraj su seviyesi uyarısı',
    back: 'Simülatöre dön',
    variant: 'Devre',
    variants: { 'baraj-cubuk': 'Çubuk gösterge', 'baraj-tek-isik': 'Tek ışık' } as Record<string, string>,
    tabsLabel: 'Baraj sayfası bölümleri',
    sceneTitle: 'Baraj ve ışık kulesi',
    sideTitle: 'Durum ve devre',
    alert: {
      danger: 'Tehlike: su taşmak üzere',
      warning: 'Dikkat: su yüksek',
      normal: 'Normal',
      none: 'Uyarı yok',
    },
    lampNames: { red: 'kırmızı', yellow: 'sarı', green: 'yeşil' },
    lampOn: 'yanıyor',
    lampOff: 'sönük',
    sceneLabel: (level: number, lamps: string) => `Baraj kesiti: su seviyesi yüzde ${level}; lambalar: ${lamps}.`,
    circuitLabel: (title: string) => `${title} devresinin şeması: hazne probları, transistörler ve LED’ler.`,
    // --- Ders düzeni (docs/tasarim/baraj) ---------------------------------------------------
    shortTitle: 'Baraj uyarısı',
    openShort: 'Simülatörde aç',
    more: 'Diğer',
    moreLabel: (fullscreen: boolean) => `Diğer: Simülatörde aç, Ayarlar${fullscreen ? ', Tam ekran' : ''}`,
    skipToControls: 'Kumandaya atla',
    level: (n: number) => `Seviye ${n}`,
    dry: 'Kuru',
    common: 'Ortak +9 V',
    bandLabel: (n: number) => `Seviye ${n} · ${({ 1: 'yeşil', 2: 'sarı', 3: 'kırmızı' } as Record<number, string>)[n] ?? ''}`,
    handle: 'Su seviyesi',
    handleText: (n: number) => `%${n}`,
    ions: {
      cation: 'katyon: akım yönünde',
      anion: 'anyon: ters yönde',
      gas: 'gaz: elektroliz',
      sceneLabel: 'Suda akımı iyonlar taşıyor: katyonlar akım yönünde, anyonlar ters yönde; problarda elektroliz gazı çıkıyor.',
    },
    soru: {
      button: 'Soru',
      title: 'Soru',
      close: 'Soruyu kapat',
      predict: 'Tahmin et',
      answer: 'Cevap',
      show: 'Cevabı göster',
      hide: 'Cevabı gizle',
    },
    questions: {
      'baraj-cubuk': {
        question:
          'Su yükseldikçe LED’ler hangi sırayla yanar? Su Seviye 1’e ulaşınca transistör doyuma girer mi? Baz akımını kabaca hesapla (V_{BE} ≈ 0,65 V).',
        answer:
          'Önce yeşil (su %37,5’e gelince), sonra yeşilin yanında sarı (%62,5’te), sonra üçü birden (%87,5’te). Prob kuruyken devre açıktır; su gelince devreyi su tamamlar: suda akımı iyonlar taşır (katyonlar akım yönünde, anyonlar ters yönde; sahnede görülür). Yük metal ile su arasında ancak elektrolizle geçer (+ uçta O₂, − uçta H₂) ve elektrotlarda ≈ 1,7 V harcanır. I_{B} ≈ (9 V − 0,65 V − 1,7 V) / (5 kΩ + 10 kΩ) ≈ 0,43 mA; β · I_{B} ≈ 86 mA olurdu, ama LED devresi en fazla ≈ (9 V − 2,2 V) / 470 Ω ≈ 14 mA’e izin verir: transistör doyumdadır (V_{CE} ≈ 0,05 V), LED’den ≈ 14,5 mA geçer. Boşalt’a bas: LED’ler ters sırayla, kondansatör yüzünden yumuşakça söner. Ayarlar’dan Saf su’yu (1 MΩ) seç: suda iyon azdır, elektroliz gerilimi de düşünce baz akımı çok küçülür; LED’den yalnızca ≈ 0,25 mA geçer ve LED zor görünür. Gerçek devrelerde baz ve çekme dirençleri suyun direncine göre seçilir.',
      },
      'baraj-tek-isik': {
        question:
          'Su Seviye 2’ye ulaşınca yeşil LED’e ne olur, neden? Hazne doluyken hangi transistörler doyumda, hangileri kesimde?',
        answer:
          'Seviye 2 ıslanınca (su %62,5’e gelince) Q4 doyuma girer ve Q1’in bazını ≈ 0,01 V’a çeker: Q1 kesime gider, yeşil söner, aynı anda sarı yanar. Seviye 3’te (%87,5) Q5 sarıyı söndürür; yalnız kırmızı kalır. Hazne doluyken Q3, Q4 ve Q5 doyumda, Q1 ve Q2 kesimde. Bu bir öncelik mantığıdır: yeşil = Seviye 1 VE (Seviye 2 DEĞİL).',
      },
    } as Record<string, { readonly question: string; readonly answer: string }>,
    durum: {
      title: 'Durum',
      chain: 'prob → transistör → LED',
      hide: 'Gizle',
      show: 'Göster',
      hideLabel: 'Durum tablosunu gizle',
      showLabel: 'Durum tablosunu göster',
      tableLabel: 'Durum: her seviyenin probu, transistörü ve LED’i',
      columns: { level: 'Seviye', probe: 'Prob', transistor: 'Transistör', led: 'LED' },
      wet: 'ıslak',
      dry: 'kuru',
      regions: { cutoff: 'kesim', active: 'aktif', saturation: 'doyum', ohmic: 'omik', reverse: 'ters aktif' },
      led: { on: 'yanıyor', off: 'sönük', dim: 'çok zayıf', fading: 'sönüyor' },
      silenced: (q: string) => `${q} susturuyor`,
      discharging: (c: string) => `${c} boşalıyor`,
      noSim: '—',
    },
    sekmeler: { durum: 'Durum', devre: 'Devre' },
    devre: {
      title: 'Devre',
      legendWorking: 'çalışan kat',
      legendCutoff: 'kesimde',
    },
    kumanda: {
      label: 'Kumanda',
      flow: 'Su akışı',
      drain: 'Boşalt',
      stop: 'Durdur',
      fill: 'Doldur',
      level: 'Su seviyesi',
      rising: 'yükseliyor',
      falling: 'iniyor',
      steady: 'sabit',
      goTo: 'Seviyeye git',
      reset: 'Başa al',
      settings: 'Ayarlar',
      keys: { drain: '↓', stop: 'Boşluk', fill: '↑', reset: 'R' },
    },
    ayarlar: {
      title: 'Ayarlar',
      close: 'Ayarları kapat',
      water: 'Su',
      tap: 'Musluk suyu',
      pure: 'Saf su',
      waterResistance: 'Su direnci',
      waterResistanceNote: 'iki ıslak prob arası',
      waterNote:
        'Su, içinde çözünmüş iyonlar (Ca²⁺, Na⁺, Cl⁻…) olduğu için iletir; saf suda iyon çok azdır, direnç MΩ düzeyine çıkar.',
      fillTime: 'Dolma süresi',
      fillTimeNote: 'boştan doluya',
      waterDown: 'Su direncini azalt',
      waterUp: 'Su direncini artır',
      fillDown: 'Dolma süresini azalt',
      fillUp: 'Dolma süresini artır',
      defaults: 'Varsayılanlara dön',
      shortcuts: 'Tek tuş kısayolları',
      shortcutsNote: '↑ ↓ Boşluk, 0–3, Sayfa Aşağı / Yukarı, R, T, S, F',
    },
    announce: {
      reached: (n: number) => `Su Seviye ${n}’${n === 2 ? 'ye' : 'e'} ulaştı.`,
      dropped: (n: number) => `Su Seviye ${n}’${n === 2 ? 'ye' : 'e'} indi.`,
      dry: 'Su Seviye 1’in altına indi.',
      lamps: (names: readonly string[]) =>
        names.length === 0 ? 'Hiçbir lamba yanmıyor.' : `${names.join(' ve ').replace(/^./, (c) => c.toLocaleUpperCase('tr'))} yanıyor.`,
    },
    examplesLink: 'Baraj sayfasını aç',
    examplesLinkNote: 'Büyük baraj çizimi, ışık kulesi ve kontroller ayrı sayfada',
    exampleTabLink: 'Baraj sayfasında izle',
  },
  /** Toprak yokken (ya da toprağa bağlı olmayan parçada) çözücünün seçtiği sıfır noktası. */
  zeroPoint: {
    label: '0 V',
    title: 'Sıfır noktası (0 V)',
    detail: 'Devrede toprak yok. Gerilimler bu noktaya göre gösteriliyor; akımlar bundan etkilenmez.',
    detailIsland: 'Bu devre parçası toprağa bağlı değil. Gerilimleri bu noktaya göre gösteriliyor; akımlar bundan etkilenmez.',
    aria: 'Sıfır noktası (0 V): açıklamayı göster',
  },
  earthLine: 'toprak hattı',
  hints: {
    // Tuvalin altındaki ipucu şeridi: **kalın**, [[tuş]].
    simulating:
      '**Simülasyon sırasında:** anahtarı açıp kapatmak için üzerine tıkla · değeri sağdaki panelden değiştir · parça eklemek ya da taşımak simülasyonu durdurur',
    empty: 'Parça sürükle ya da tıklayıp tuvale tıkla · [[W]] kablo · [[R]] döndür',
    select:
      'Kablo çekmek için bir parçanın ucuna tıkla · seçince özellikler sağda açılır · [[R]] döndür · [[F]] ters çevir · [[Delete]] sil · [[Boşluk]] + sürükle: kaydır',
    example: 'Örnek açık: ne işe yaradığı Örnek sekmesinde; çalıştırmak için **Oynat**’a bas.',
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
      inductor:
        'Varsayılan değerler gerçek bir bobinden (Bourns RLB1314-103KL: 10 mH, sargı direnci 12 Ω, en fazla 100 mA). Sargı direncini 0 yaparsan ideal bobin olur.',
      transformer:
        'Varsayılan değerler gerçek bir transformatörden (RS PRO 504-464: 230 V → 12 V, sargı başına 1,5 VA; birincil 1167 Ω, ikincil 14,8 Ω, yüksüz giriş akımı ≈ 30 mA). Sarım oranı N₁ / N₂ = 16: 230 V’ta yüksüz ≈ 14,4 V, tam yükte (125 mA) ≈ 12 V. Oranı 1’den küçük yaparsan gerilim yükseltilir.',
      diode: 'Genel amaçlı silisyum diyot: 1 mA’de ≈ 0,60 V, 20 mA’de ≈ 0,70 V ileri gerilim. Ters yönde yalnızca çok küçük bir sızıntı akımı geçer.',
      potentiometer:
        'Varsayılan değerler gerçek bir potansiyometreden (Bourns PTV09A, 10 kΩ doğrusal): toleransı ±%20, uçlarda en fazla %1 artık direnç, en fazla 0,05 W. Sürgüden akım çekilmiyorsa sürgünün gerilimi konumla doğru orantılıdır; sürgüye bir yük bağlanınca gerilim düşer (yükleme).',
      ldr:
        'Varsayılan değerler gerçek bir LDR’den (GL5528): 10 lükste 10–20 kΩ (burada 15 kΩ), karanlıkta en az 1 MΩ, γ = 0,6: R = R₁₀ · (E / 10 lx)^{−γ}. Aydınlık örnekleri: gece ≈ 1 lx, oda ≈ 100–300 lx, bulutlu gün ≈ 10 000 lx, güneş ≈ 100 000 lx. Gerçek LDR ışık değişimine 20–30 ms’de uyar; burada anında.',
      ntc:
        'Varsayılan değerler gerçek bir termistörden (Vishay NTCLE100E3103: 10 kΩ, B₂₅/₈₅ = 3977 K); direnç üreticinin R(T) eğrisinden (0 °C’ta 32,6 kΩ, 50 °C’ta 3,61 kΩ, 100 °C’ta 677 Ω). İçinden geçen akım onu ısıtır (öz ısınma: 7 mW/K, ısıl zaman sabiti 15 s); ortam sıcaklığı değişince hemen ona uyar.',
      arduino:
        'Gerçek bir Uno’nun değerleri (ATmega328P veri sayfası, 5 V, 25 °C): çıkış pini ≈ 25 Ω (20 mA’de 4,5 V), bir pinden en fazla 40 mA (önerilen 20 mA), INPUT_PULLUP direnci ≈ 35 kΩ, giriş eşikleri 2,6 V (yükselen) ve 2,15 V (düşen), ADC 10 bit, referans 5 V. 5V ucu USB’den (500 mA sigorta), 3V3 ucu en fazla 150 mA verir. D0 ve D1 USB seri bağlantısı içindir (Seri ekran). Programlar önceden derlenmiştir: kodunu Arduino panelinde görürsün.',
      timer555:
        'Gerçek bir 555’in değerleri (TI NE555): eşikler 2/3 ve 1/3 V_CC (içeride üç 5 kΩ’luk bölücü), RESET 0,7 V, çıkış yüksekte V_CC − 1,7 V (100 mA), düşükte 0,1 V (10 mA), deşarj anahtarı 8 mA’de 0,15 V, besleme akımı 15 V’ta 10 mA. RESET’i kullanmıyorsan VCC’ye bağla; CONT’u 10 nF’la toprağa bağlamak gürültüyü azaltır.',
      opamp:
        'Gerçek bir 741’in değerleri (TI LM741, ±15 V, tipik): kazanç 200 V/mV, giriş direnci 2 MΩ, kazanç-bant genişliği ≈ 1,2 MHz, eğim hızı 0,5 V/µs, çıkış 10 kΩ’da ±14 V, 2 kΩ’da ±13 V, kısa devre akımı 25 mA, besleme akımı 1,7 mA. V+ ve V− uçlarını besle (ör. iki 15 V’luk pil, ortası toprak). Giriş kayma gerilimi (1 mV) ve kutuplama akımı (80 nA) modellenmez.',
      speaker:
        'Gerçek bir hoparlörün değerleri (Visaton FRS 5, 8 Ω, 5 cm): bobin 7,2 Ω ve 0,2 mH, rezonans frekansı 290 Hz (Q_{ms} = 3,19, Q_{es} = 1,81), anma gücü 5 W, 1 W’ta 1 m’de 84 dB. Empedans rezonansta ≈ 20 Ω’a çıkar. Ses yalnızca simülasyon ×1 hızdayken çalar.',
      buzzer:
        'Gerçek bir buzzerin değerleri (Same Sky CMI-1295IC-0585T): 5 V’ta 30 mA, 2,4 kHz, 10 cm’de 85 dB; 4–7 V arasında çalışır, ≈ 3 V’un altında ötmez. Ses yalnızca simülasyon ×1 hızdayken çalar.',
      fuse:
        'Varsayılan değerler gerçek bir sigortadan (Littelfuse 217, 5×20 mm hızlı, 1 A): soğuk direnç 0,096 Ω, erime I²t 1,042 A²s. Anma akımının 1,5 katında atmaz, 2,75 katında ≈ 0,18 s’de, 4 katında ≈ 73 ms’de, 10 katında ≈ 11 ms’de atar.',
      lamp:
        'Varsayılan: 12 V, 0,1 A (1,2 W) minyatür lamba. Sıcakken 120 Ω, soğukken ≈ 8,9 Ω (tungstenin direnci ≈ T^{1,2} ile artar); yakıldığı an ≈ 1,35 A çeker, filaman ≈ 10 ms’de ısınır. Işık gerilimle çok hızlı artar (≈ V^{3,4}). Filaman 3695 K’de erir: anma geriliminin ≈ 2,5 katında lamba yanar.',
      motor:
        'Varsayılan değerler gerçek bir motordan (maxon A-max 26, 12 V, 11 W): sargı 2,07 Ω ve 0,227 mH, tork sabiti 13,9 mN·m/A (zıt EMK 13,9 mV/(rad/s)), rotor ataleti 13,6 g·cm², boşta 57 mA (sürtünme 0,79 mN·m). 12 V’ta boşta ≈ 8160 dev/dk, kalkış akımı ≈ 5,8 A, durma torku ≈ 80 mN·m. Yük torku mile bağlanan yükü temsil eder (her mN·m hızı ≈ 102 dev/dk düşürür); sürekli çalışmada en fazla ≈ 14 mN·m (1,08 A).',
      relay:
        'Varsayılan değerler gerçek bir röleden (Omron G2R-1, 12 V DC): sargı 275 Ω (43,6 mA), endüktans 1,15 H (palet çekilince 2,29 H); veri sayfasına göre en geç 8,4 V’ta çeker, en erken 1,8 V’ta bırakır; kontak 30 mΩ. Sargı akımı çekme akımına (V_{ç} / R) ulaşınca palet çekilir, bırakma akımının altına inince bırakılır. Sargının akımını bir transistörle ya da anahtarla kesiyorsan sargıya ters paralel bir diyot (serbest geçiş diyodu) bağla.',
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
    luxShort: (lux: string) => `${lux} lx`,
    fuseShort: (rating: string) => `${rating} hızlı`,
    motorNoLoad: 'boşta',
    motorLoadShort: (load: string) => `yük ${load} mN·m`,
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
    notBlocking: 'Başlamaya engel değil.',
    // Cihazlar (P08, P09)
    devicesTitle: 'Cihazlar',
    devicesClose: 'Cihazları kapat',
    backToCircuit: 'Devreye dönmek için dokun',
    backToCircuitLabel: 'Devreye dön',
    circuit: 'Devre',
    deviceShort: { oscilloscope: 'Osiloskop', funcgen: 'Üreteç', dcsupply: 'Güç kaynağı', tank: 'Hazne' } as Record<string, string>,
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
    examplesHint: 'Bir örneğe dokun: devre açılır, ne işe yaradığı alttaki sayfada çıkar.',
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
          ['Tam ekrandan çık', 'Esc'],
          ['Oynat / Duraklat', 'P'],
          ['Sağ panele geç: parçalar · örnek · sorunlar', 'Alt+1…3'],
          ['Yardım', '?'],
        ],
      },
    ] as ReadonlyArray<{ title: string; rows: ReadonlyArray<readonly [string, string]> }>,
    keysNote: 'Kısayollar odak tuvaldeyken çalışır; bir alana yazarken harf tuşları yazıya gider. Türkçe Q klavyede de aynı tuşlar.',
    mouse: 'Fare',
    touch: 'Dokunma (telefon, tablet)',
    mouseRows: [
      ['Parça ekle', 'Defterin sonundaki satıra parçanın adını yaz, Enter’a bas; açık kartın boştaki ucuna bağlı eklenir. “Bütün parçalara göz at” kategorili listeyi açar.'],
      ['Tıkla', 'Seçer; kartı sağdaki defterde açılır.'],
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
      earth: 'Toprak hattı',
      earthText:
        'Toprak sembolleri ve topraklı cihazların COM uçları binanın toprak hattıyla birbirine bağlıdır. Aralarında kablo yoksa bu bağlantı kesikli çizgiyle gösterilir.',
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
    examplesText: 'Hazır bir devre aç; ne işe yaradığını oku, Oynat’la çalıştır.',
    blank: 'Boş tuvalde kur',
    blankText: 'Defterden parça ekle, uçlarından kablo çek.',
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
        desktop: 'Sağdaki defterin sonundaki **Parça ekle** satırına parçanın adını yaz ve Enter’a bas (ya da **Bütün parçalara göz at**).',
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
    severity: { error: 'Hata', warning: 'Uyarı', info: 'Bilgi' } as const,
  },
};

export type Translations = typeof tr;
