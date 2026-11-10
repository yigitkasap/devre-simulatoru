// Mesajlar sekmesindeki satırlar: çözücünün tanılamaları (topoloji ve çalışma sırasındaki uyarılar) ve
// editörün kendi bulguları (toprak tuzağı, kısa devre edilen parça, üretecin kısa devre çıkışı). Çözücü
// yalnızca kod ve sayı döndürür; başlık ve açıklama burada Türkçeleştirilir. Saf fonksiyonlar; arayüzden
// bağımsız test edilir.

import { tr, type DiagnosticContext, type LedAdvice } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import type { CompiledCircuit, Diagnostic } from '../sim';
import { DEVICE_MODELS, multimeterMode } from '../sim/devices';
import type { DeviceType } from '../sim/netlist';

/** Bilgi: bir sorun değil, açıklama (ör. toprağa bağlı olmayan parçanın kendi sıfır noktası). */
export type MessageSeverity = 'error' | 'warning' | 'info';

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
  // Toprak hattı mesajı tektir; listelediği toprak noktaları akımla değişebilir (seçim kaybolmasın).
  if (d.code === 'ground-return') return d.code;
  return `${d.code}|${d.elementIds.join(',')}|${d.pin ?? ''}`;
}

/**
 * Yanan LED ve kısa devre, çözücüde simülasyonu durdurmayan uyarılardır; bir parçanın zarar gördüğünü
 * anlattıkları için arayüzde hata olarak gösterilir (tasarım: M07a).
 */
const SHOWN_AS_ERROR: ReadonlySet<string> = new Set(['led-burned', 'lamp-burned', 'fuse-blown', 'short-circuit', 'ic-burned', 'segment-burned']);

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
}

/** Şebeke toprağının bağlayabileceği iki uçlu parçalar (ölçü aletleri ve cihazlar hariç). */
const SHORTABLE: ReadonlySet<DeviceType> = new Set<DeviceType>([
  'resistor',
  'capacitor',
  'inductor',
  'diode',
  'schottky',
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
export function findEarthTrap(compiled: CompiledCircuit): EarthTrap | null {
  const { wiring, netlist } = compiled;
  /** Kablo ağı kökü → o ağa bağlı topraklı cihazlar. */
  const earthed = new Map<string, string[]>();
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
  }
  if (earthed.size < 2) return null;
  const shorted: string[] = [];
  for (const el of netlist.elements) {
    if (!SHORTABLE.has(el.type) || el.pins.length !== 2) continue;
    const [a, b] = el.pins.map((pin) => (wiring.has(pin) ? wiring.findKey(pin) : pin)) as [string, string];
    if (a !== b && earthed.has(a) && earthed.has(b)) shorted.push(el.id);
  }
  const instruments = [...earthed.values()].flat();
  // Topraklı cihaz yoksa (yalnızca toprak sembolleri) tuzak değil, sıradan kısa devre: findShortedParts söyler.
  if (shorted.length === 0 || instruments.length === 0) return null;
  return { instruments, shorted };
}

// --- Kısa devre edilen parça ve üretecin çıkışı ----------------------------------------------

/**
 * İki ucu aynı noktaya düştüğünde "kısa devre edildi" denen iki uçlu parçalar. Kaynakların kendi
 * mesajları var (ideal pilde "Direnç içermeyen döngü", iç dirençli pilde ve AC kaynakta çalışırken
 * "Kısa devre"); akım kaynağının kısa devresi zararsızdır. Voltmetre (ve V, Ω kipindeki multimetre) iki
 * ucu aynı noktadayken yalnızca 0 okur, bir kablonun iki ucunu ölçmek de olağandır (süreklilik):
 * kısa devre sayılmaz. A kipindeki multimetre ampermetre gibidir.
 */
const SHORTABLE_PARTS: ReadonlySet<DeviceType> = new Set<DeviceType>([
  'resistor',
  'capacitor',
  'inductor',
  'diode',
  'schottky',
  'zener',
  'led',
  'ldr',
  'ntc',
  'lamp',
  'speaker',
  'buzzer',
  'fuse',
  'motor',
  'switch',
  'pushbutton',
  'ammeter',
  'multimeter',
]);

/** Kısa devre edilen parça: iki ucu aynı kablo ağında (`wire`) ya da ikisi de toprakta (`ground`). */
export interface ShortedPart {
  readonly id: string;
  readonly via: 'wire' | 'ground';
  /** Fonksiyon üretecinde kısa devre olan çıkış: OUT ya da TTL darbe çıkışı. */
  readonly output?: 'out' | 'ttl';
  /** Kablo ağıyla kısa devrede ağın anahtarı (kabloları vurgulanır). */
  readonly net?: string;
}

/**
 * Kablo ağının kökü ve toprakta olan kökler: toprak sembollerinin ve topraklı cihazların (osiloskop,
 * fonksiyon üreteci) COM uçlarının ağları birbirine bağlıdır (derlemede tek düğüm).
 */
function groundedRoots(compiled: CompiledCircuit) {
  const { wiring, netlist } = compiled;
  const root = (pin: string) => (wiring.has(pin) ? wiring.findKey(pin) : pin);
  const grounded = new Set<string>();
  for (const el of netlist.elements) if (el.type === 'ground') for (const pin of el.pins) grounded.add(root(pin));
  for (const pin of compiled.earthedPins) grounded.add(root(pin));
  return { root, grounded };
}

/** İki ucu aynı noktaya düşen parçalar (devre sırasıyla). */
export function findShortedParts(compiled: CompiledCircuit): ShortedPart[] {
  const { root, grounded } = groundedRoots(compiled);
  const result: ShortedPart[] = [];
  for (const el of compiled.netlist.elements) {
    if (!SHORTABLE_PARTS.has(el.type) || el.pins.length !== 2) continue;
    if (el.type === 'multimeter' && multimeterMode(el.props) !== 'a') continue;
    const [a, b] = el.pins.map(root) as [string, string];
    if (a === b) result.push({ id: el.id, via: 'wire', net: a });
    else if (grounded.has(a) && grounded.has(b)) result.push({ id: el.id, via: 'ground' });
  }
  return result;
}

/**
 * OUT ya da TTL ucu COM'a kısa devre olan fonksiyon üreteçleri (kabloyla ya da ikisi de toprakta). İki çıkış
 * da iç kaynağın arkasında 50 Ω (funcgen.ts); ikisi birden kısa devreyse iki ayrı uyarı.
 */
export function findShortedGenerators(compiled: CompiledCircuit): ShortedPart[] {
  const { root, grounded } = groundedRoots(compiled);
  const result: ShortedPart[] = [];
  for (const el of compiled.netlist.elements) {
    if (el.type !== 'funcgen') continue;
    // Uçlar: [0] OUT, [1] TTL, [2] COM.
    const com = root(el.pins[2]!);
    for (const [output, pin] of [['out', 0], ['ttl', 1]] as const) {
      const node = root(el.pins[pin]!);
      if (node === com) result.push({ id: el.id, via: 'wire', net: node, output });
      else if (grounded.has(node) && grounded.has(com)) result.push({ id: el.id, via: 'ground', output });
    }
  }
  return result;
}

export function shortedPartItem(s: ShortedPart, doc: CircuitDoc): MessageItem {
  const part = doc.parts.find((p) => p.id === s.id);
  const label = part?.label ?? s.id;
  return {
    key: `part-shorted|${s.id}`,
    severity: 'warning',
    code: 'part-shorted',
    elementIds: [s.id],
    netKeys: s.net ? [s.net] : [],
    title: tr.messages.shortedTitle(label),
    detail: tr.messages.shortedDetail(label, part?.type, s.via),
  };
}

export function shortedGeneratorItem(s: ShortedPart, doc: CircuitDoc): MessageItem {
  const label = doc.parts.find((p) => p.id === s.id)?.label ?? s.id;
  return {
    key: s.output === 'ttl' ? `generator-shorted|${s.id}|ttl` : `generator-shorted|${s.id}`,
    severity: 'warning',
    code: 'generator-shorted',
    elementIds: [s.id],
    netKeys: s.net ? [s.net] : [],
    title: s.output === 'ttl' ? tr.messages.generatorTtlShortedTitle(label) : tr.messages.generatorShortedTitle(label),
    detail: s.output === 'ttl' ? tr.messages.generatorTtlShorted(label, s.via) : tr.messages.generatorShorted(label, s.via),
  };
}

/**
 * Yanan ya da aşırı akımdaki LED için bağlama göre öneri: LED'e seri bir ön direnç var mı (varsa
 * küçük), ön direnç kısa devre mi edilmiş (akımı başka bir kısa devre aşırı yapıyor), yoksa hiç yok mu.
 */
export function ledAdvice(ledId: string, compiled: CompiledCircuit, shorted: readonly ShortedPart[], doc: CircuitDoc): LedAdvice {
  const label = (id: string) => doc.parts.find((p) => p.id === id)?.label ?? id;
  const series = seriesResistor(ledId, compiled);
  if (series) return { kind: 'resistor', label: label(series) };
  const shortedResistors = shorted.filter((s) => compiled.deviceById.get(s.id)?.type === 'resistor').map((s) => s.id);
  if (shortedResistors.length === 0) return { kind: 'no-resistor' };
  // LED'in uçlarından (seri ampermetreler üzerinden) ulaşılan ağlarda kısa devre edilmiş direnç; yoksa
  // devredeki ilk kısa devre edilmiş direnç.
  const { wiring, netlist } = compiled;
  const root = (pin: string) => (wiring.has(pin) ? wiring.findKey(pin) : pin);
  const led = netlist.elements.find((e) => e.id === ledId);
  const seen = new Set<string>();
  let frontier = (led?.pins ?? []).map(root);
  for (let hop = 0; hop < 4 && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const net of frontier) {
      if (seen.has(net)) continue;
      seen.add(net);
      for (const el of netlist.elements) {
        if (el.id === ledId || !el.pins.some((p) => root(p) === net)) continue;
        if (shortedResistors.includes(el.id)) return { kind: 'resistor-shorted', label: label(el.id) };
        if (el.type === 'ammeter') next.push(...el.pins.map(root));
      }
    }
    frontier = next;
  }
  return { kind: 'resistor-shorted', label: label(shortedResistors[0]!) };
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
