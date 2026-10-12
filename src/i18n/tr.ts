// Arayüzdeki TÜM metinler. Dil şimdilik yalnızca Türkçe.
//
// Yazım notları:
//   - Fizik terimleri: "gerilim" (voltaj değil), "akım", "iç direnç", "toprak", "kısa devre", "ön direnç".
//   - Bileşen adlarına (R1, B1...) ek getirilmez; okunuşa göre değişen ekler yerine
//     "R1 direncinin", "B1 pilinin" gibi yapılar kullanılır.
//   - Sayılar src/sim/units.ts ile Türkçe biçimde (4,7 kΩ) yazılır.

import { SITE_NAME } from '../config';
import type { Diagnostic } from '../sim/diagnostics';
import type { DeviceType } from '../sim/netlist';
import { formatSI } from '../sim/units';

export interface DiagnosticContext {
  /** Bileşenin tuvaldeki adı (R1, B2...). */
  label(id: string): string;
  /** Bileşenin türü. */
  type(id: string): DeviceType | undefined;
}

const DEVICE_NAMES: Record<DeviceType, string> = {
  battery: 'Pil',
  ground: 'Toprak',
  resistor: 'Direnç',
  capacitor: 'Kondansatör',
  diode: 'Diyot',
  led: 'LED',
  switch: 'Anahtar',
  voltmeter: 'Voltmetre',
  ammeter: 'Ampermetre',
};

/** "R1 direnci", "B1 pili" gibi tamlamalar için tür adının küçük harfli, belirtme durumlu hali. */
const DEVICE_GENITIVE: Record<DeviceType, string> = {
  battery: 'pilinin',
  ground: 'toprak sembolünün',
  resistor: 'direncinin',
  capacitor: 'kondansatörünün',
  diode: 'diyotunun',
  led: 'LED’inin',
  switch: 'anahtarının',
  voltmeter: 'voltmetresinin',
  ammeter: 'ampermetresinin',
};

const PIN_NAMES: Record<DeviceType, readonly string[]> = {
  battery: ['+ ucu', '− ucu'],
  ground: ['ucu'],
  resistor: ['1. ucu', '2. ucu'],
  capacitor: ['+ ucu', '− ucu'],
  diode: ['anot ucu', 'katot ucu'],
  led: ['anot ucu', 'katot ucu'],
  switch: ['1. ucu', '2. ucu'],
  voltmeter: ['+ ucu', '− ucu'],
  ammeter: ['+ ucu', '− ucu'],
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
    case 'ammeter-parallel':
      return {
        title: 'Ampermetre paralel bağlanmış',
        detail:
          `${labels[0] ?? ''} ampermetresi doğrudan ${labels[1] ?? ''} pilinin iki ucuna bağlanmış. ` +
          'Ampermetre seri bağlanır; iç direnci çok küçük olduğu için paralel bağlanınca kısa devre olur.',
      };
    case 'short-circuit': {
      const r = p.internalResistance ?? 0;
      return {
        title: 'Kısa devre',
        detail:
          `${firstLabel} pilinden ${formatSI(p.current ?? 0, 'A')} akım çekiliyor. ` +
          (r > 0
            ? `Dış devrenin direnci pilin iç direncinden (${formatSI(r, 'Ω', { trim: true })}) küçük. `
            : 'Dış devrenin direnci neredeyse sıfır. ') +
          'Gerçek bir pil bu durumda hızla ısınır ve boşalır.',
      };
    }
    case 'led-burned':
      return {
        title: 'LED yandı',
        detail:
          `${firstLabel}: LED’den ${formatSI(p.current ?? 0, 'A')} geçti, ama bu LED en fazla ` +
          `${formatSI(p.maxCurrent ?? 0, 'A', { trim: true })}’e dayanabilir. ` +
          'Seri bir ön direnç ekle: R = (Vkaynak − Vf) / I. ' +
          `(Bu LED için Vf ≈ ${formatSI(p.forwardVoltage ?? 0, 'V', { trim: true })}, I için 20 mA seçebilirsin.)`,
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
  },
  diagnostics: {
    describe: describeDiagnostic,
    severity: { error: 'Hata', warning: 'Uyarı' } as const,
  },
};

export type Translations = typeof tr;
