// Mesajlar sekmesindeki satırlar: çözücünün tanılamaları (topoloji ve çalışma sırasındaki uyarılar) ve
// editörün kendi bulguları (toprak tuzağı). Çözücü yalnızca kod ve sayı döndürür; başlık ve açıklama
// burada Türkçeleştirilir. Saf fonksiyonlar; arayüzden bağımsız test edilir.

import { tr, type DiagnosticContext } from '../i18n/tr';
import { pinPositions } from '../model/geometry';
import type { CircuitDoc, Point } from '../model/types';
import type { CompiledCircuit, Diagnostic } from '../sim';
import { DEVICE_MODELS } from '../sim/devices';
import type { DeviceType } from '../sim/netlist';

export type MessageSeverity = 'error' | 'warning';

export interface MessageItem {
  readonly key: string;
  readonly severity: MessageSeverity;
  readonly code: string;
  readonly elementIds: readonly string[];
  readonly netKeys: readonly string[];
  readonly title: string;
  readonly detail: string;
  /** Tuvalde rozet alacak parçalar (verilmezse elementIds). */
  readonly badgeIds?: readonly string[];
  /** Çözücüden geliyorsa özgün tanılama. */
  readonly diagnostic?: Diagnostic;
}

export function messageKey(d: Diagnostic): string {
  return `${d.code}|${d.elementIds.join(',')}|${d.pin ?? ''}`;
}

/**
 * Yanan LED ve kısa devre, çözücüde simülasyonu durdurmayan uyarılardır; bir parçanın zarar gördüğünü
 * anlattıkları için arayüzde hata olarak gösterilir (tasarım: M07a).
 */
const SHOWN_AS_ERROR: ReadonlySet<string> = new Set(['led-burned', 'short-circuit']);

export function itemFromDiagnostic(d: Diagnostic, context: DiagnosticContext): MessageItem {
  const { title, detail } = tr.diagnostics.describe(d, context);
  return {
    key: messageKey(d),
    severity: SHOWN_AS_ERROR.has(d.code) ? 'error' : d.severity,
    code: d.code,
    elementIds: d.elementIds,
    netKeys: d.netKeys,
    title,
    detail,
    diagnostic: d,
  };
}

// --- Toprak tuzağı -------------------------------------------------------------------------

export interface EarthTrap {
  /** Şebeke toprağıyla birleşen topraklı cihazlar (osiloskop, fonksiyon üreteci). */
  readonly instruments: readonly string[];
  /** Şebeke toprağı yüzünden iki ucu birleşen (kısa devre olan) parçalar. */
  readonly shorted: readonly string[];
  /** Topraklı cihazların COM uçları (tuvalde şebeke toprağı çizgisi için). */
  readonly comPoints: readonly Point[];
}

/** Şebeke toprağının bağlayabileceği iki uçlu parçalar (ölçü aletleri ve cihazlar hariç). */
const SHORTABLE: ReadonlySet<DeviceType> = new Set<DeviceType>([
  'resistor',
  'capacitor',
  'diode',
  'zener',
  'led',
  'battery',
  'acsource',
  'switch',
]);

/**
 * Toprak tuzağı: osiloskop ve fonksiyon üretecinin COM uçları (ve toprak sembolleri) şebeke toprağı
 * üzerinden birleşir. Bu uçlar kablolarla farklı noktalara bağlıysa, iki ucu bu noktalara giden bir
 * parça kısa devre olur (köprü doğrultmaçta prob toprağını yükün − ucuna takmak gibi).
 */
export function findEarthTrap(doc: CircuitDoc, compiled: CompiledCircuit): EarthTrap | null {
  const { wiring, netlist } = compiled;
  /** Kablo ağı kökü → o ağa bağlı topraklı cihazlar. */
  const earthed = new Map<string, string[]>();
  const comPoints: Point[] = [];
  for (const el of netlist.elements) {
    if (el.type === 'ground') {
      for (const pin of el.pins) if (wiring.has(pin)) earthed.set(wiring.findKey(pin), earthed.get(wiring.findKey(pin)) ?? []);
      continue;
    }
    const pinIndex = DEVICE_MODELS[el.type].earthPin?.(el.props);
    if (pinIndex === null || pinIndex === undefined) continue;
    const pin = el.pins[pinIndex];
    if (!pin || !wiring.has(pin)) continue;
    const root = wiring.findKey(pin);
    earthed.set(root, [...(earthed.get(root) ?? []), el.id]);
    const part = doc.parts.find((p) => p.id === el.id);
    const at = part ? pinPositions(part)[pinIndex] : undefined;
    if (at) comPoints.push(at);
  }
  if (earthed.size < 2) return null;
  const shorted: string[] = [];
  for (const el of netlist.elements) {
    if (!SHORTABLE.has(el.type) || el.pins.length !== 2) continue;
    const [a, b] = el.pins.map((pin) => (wiring.has(pin) ? wiring.findKey(pin) : pin)) as [string, string];
    if (a !== b && earthed.has(a) && earthed.has(b)) shorted.push(el.id);
  }
  if (shorted.length === 0) return null;
  const instruments = [...earthed.values()].flat();
  return { instruments, shorted, comPoints };
}

export function earthTrapItem(trap: EarthTrap, doc: CircuitDoc): MessageItem {
  const label = (id: string) => doc.parts.find((p) => p.id === id)?.label ?? id;
  const typeOf = (id: string) => doc.parts.find((p) => p.id === id)?.type;
  const scope = trap.instruments.find((id) => typeOf(id) === 'oscilloscope');
  const generator = trap.instruments.find((id) => typeOf(id) === 'funcgen');
  const names = trap.instruments.map(label);
  const detail =
    scope && generator
      ? tr.messages.earthTrap(label(scope), label(generator), trap.shorted.map(label).join(', '))
      : tr.messages.earthTrapGeneric(names.join(', '), trap.shorted.map(label).join(', '));
  return {
    key: `earth-trap|${trap.shorted.join(',')}`,
    severity: 'warning',
    code: 'earth-trap',
    elementIds: [...trap.shorted, ...trap.instruments],
    badgeIds: trap.shorted,
    netKeys: [],
    title: tr.messages.earthTrapTitle,
    detail,
  };
}

// --- Yanan LED: seri ön direnç önerisi ------------------------------------------------------

/** E24 dizisi (±%5 dirençler). */
const E24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0, 3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1];

/** Bir değerden büyük ya da ona eşit en küçük E24 değeri. */
export function e24AtLeast(value: number): number {
  if (!(value > 0)) return E24[0]!;
  const exp = Math.floor(Math.log10(value));
  for (const e of [exp, exp + 1]) {
    for (const m of E24) {
      const candidate = Number((m * 10 ** e).toPrecision(3));
      if (candidate >= value * (1 - 1e-9)) return candidate;
    }
  }
  return 10 ** (exp + 1);
}

/**
 * LED'e tek bir direnç seri bağlıysa (LED'in bir ucunun bağlı olduğu noktada yalnızca o direnç varsa;
 * arada seri bir ampermetre olabilir) direncin kimliği; değilse null.
 */
export function seriesResistor(ledId: string, compiled: CompiledCircuit): string | null {
  const { wiring, netlist } = compiled;
  const byId = new Map(netlist.elements.map((e) => [e.id, e]));
  const led = byId.get(ledId);
  if (!led) return null;
  const root = (pin: string) => (wiring.has(pin) ? wiring.findKey(pin) : pin);
  const onNet = new Map<string, Array<{ id: string; pin: string }>>();
  for (const el of netlist.elements) {
    for (const pin of el.pins) onNet.set(root(pin), [...(onNet.get(root(pin)) ?? []), { id: el.id, pin }]);
  }
  const candidates = new Set<string>();
  for (const start of led.pins) {
    let from = ledId;
    let net = root(start);
    // Seri ampermetreler (ideal: tel gibi) üzerinden en çok birkaç adım ilerle.
    for (let hop = 0; hop < 4; hop++) {
      const others = (onNet.get(net) ?? []).filter((p) => p.id !== from);
      if (others.length !== 1) break;
      const next = byId.get(others[0]!.id)!;
      if (next.type === 'resistor') {
        candidates.add(next.id);
        break;
      }
      if (next.type !== 'ammeter') break;
      const exit = next.pins.find((p) => p !== others[0]!.pin);
      if (!exit) break;
      from = next.id;
      net = root(exit);
    }
  }
  return candidates.size === 1 ? [...candidates][0]! : null;
}

/** Önerilen ön direnç: R = (V_kaynak − V_f) / 20 mA, bir üst E24 değerine yuvarlanır. */
export function suggestedResistor(sourceVoltage: number, forwardVoltage: number): number | null {
  const r = (sourceVoltage - forwardVoltage) / 0.02;
  return r > 0 ? e24AtLeast(r) : null;
}
