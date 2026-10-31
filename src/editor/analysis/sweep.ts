// Eğri izleyici (A3, N3): seçili parça devreden ayrı, ideal kaynaklı bir test devresinde DC taranır.
// Diyot (diyot, zener, LED): I–V. JFET ve MOSFET: çıkış ailesi (V_DS taranır, basamak V_GS) ya da
// transfer (V_GS taranır, basamak V_DS). BJT: çıkış ailesi (V_CE taranır, basamak I_B; I_B yüksek
// gerilimli pil ve büyük dirençle verilir, gerçek değeri ölçülür). P tipi parçalarda gerilimler ve
// akımlar ters işaretli taranır, eğriler büyüklükleriyle (−V_DS, −I_D) çizilir. Her nokta bir öncekinin
// çözümünden başlar (motorun update()'i durumu korur); akım sınırı (0,5 A) aşılınca eğri biter.
// Motor yalnızca var olan arabirimiyle kullanılır (update, advance, runUntil, measure).

import { CircuitSimulator, type DeviceType, type Netlist, type NetlistElement, type PropValue } from '../../sim';
import { atOperatingPoint } from './bode';

export type TracerMode = 'diode' | 'output' | 'transfer';
export type TracerFamily = 'diode' | 'fet' | 'bjt';

export interface SweepRequest {
  readonly type: DeviceType;
  readonly props: Readonly<Record<string, PropValue>>;
  readonly mode: TracerMode;
  /** Taranan büyüklüğün aralığı ve adımı (büyüklük; P tipinde işaret içeride çevrilir). */
  readonly from: number;
  readonly to: number;
  readonly step: number;
  /** Basamaklar (V_GS, V_DS ya da I_B; büyüklük). Diyotta tek eğri: [0]. */
  readonly steps: readonly number[];
  /**
   * Yük doğrusu açıkken Q noktasındaki gerçek basamak (BJT'de I_B, FET'te V_GS; büyüklük): en sona ayrı
   * bir eğri olarak eklenir (analiz düzeltmeleri, 9).
   */
  readonly qStep?: number;
}

export interface Curve {
  readonly step: number;
  /** [x, y]: taranan büyüklük ve akım (büyüklük; SI). */
  readonly points: readonly (readonly [number, number])[];
  /** BJT: ölçülen gerçek I_B (A). */
  readonly measuredStep?: number;
  /** Q noktasındaki basamağın eğrisi. */
  readonly q?: boolean;
}

export const FAMILY: Partial<Record<DeviceType, TracerFamily>> = {
  diode: 'diode',
  zener: 'diode',
  led: 'diode',
  njfet: 'fet',
  pjfet: 'fet',
  nmos: 'fet',
  pmos: 'fet',
  npn: 'bjt',
  pnp: 'bjt',
};

/** P tipi (gerilimler ve akımlar ters işaretli). */
export const isP = (type: DeviceType): boolean => type === 'pjfet' || type === 'pmos' || type === 'pnp';

/** Parça türüne göre varsayılan tarama (tasarım N3: BF245A'da V_DS 0 → 15 V, 0,5 V; V_GS 0 … −0,6 V). */
export function defaultRequest(type: DeviceType, props: Readonly<Record<string, PropValue>>, mode: TracerMode): Omit<SweepRequest, 'type' | 'props'> {
  const family = FAMILY[type];
  if (family === 'diode') {
    if (type === 'zener') return { mode: 'diode', from: -6, to: 1, step: 0.05, steps: [0] };
    if (type === 'led') return { mode: 'diode', from: 0, to: 3.2, step: 0.05, steps: [0] };
    return { mode: 'diode', from: 0, to: 0.9, step: 0.02, steps: [0] };
  }
  if (family === 'bjt') return { mode: 'output', from: 0, to: 10, step: 0.1, steps: [10e-6, 20e-6, 30e-6, 40e-6] };
  const jfet = type === 'njfet' || type === 'pjfet';
  // JFET: V_GS büyüklüğü (n tipinde negatif); MOSFET: eşiğin üstü (IRF510 ≈ 4 V).
  const pinch = typeof props.pinchOff === 'number' ? Math.abs(props.pinchOff) : 2;
  if (mode === 'transfer') return jfet ? { mode, from: -pinch, to: 0, step: 0.05, steps: [10] } : { mode, from: 0, to: 8, step: 0.1, steps: [10] };
  return jfet ? { mode: 'output', from: 0, to: 15, step: 0.5, steps: [0, -0.2, -0.4, -0.6] } : { mode: 'output', from: 0, to: 10, step: 0.25, steps: [4.5, 5, 5.5, 6] };
}

/** Akım sınırı (A): aşılınca eğrinin geri kalanı çizilmez (eğri izleyicinin akım sınırı gibi). */
export const CURRENT_LIMIT = 0.5;
/** BJT'de baz akımını veren pilin gerilimi (V): V_BE'nin değişimi akımı binde birden az etkiler. */
const BASE_SUPPLY = 100;

/** Taranan büyüklüğün değerleri (uçlar dahil). */
export function sweepValues(from: number, to: number, step: number): number[] {
  const n = Math.max(1, Math.min(2000, Math.round(Math.abs(to - from) / Math.max(1e-9, Math.abs(step)))));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(from + ((to - from) * i) / n);
  return out;
}

const el = (id: string, type: DeviceType, pins: string[], props: Record<string, PropValue> = {}): NetlistElement => ({ id, type, pins, props });

/** Test devresi: x taranan kaynak, s basamak kaynağı (işaretler P tipinde çevrilmiş). */
function testNetlist(req: SweepRequest, x: number, s: number): Netlist {
  const sign = isP(req.type) ? -1 : 1;
  const dut = { ...req.props } as Record<string, PropValue>;
  const g = el('G', 'ground', ['0']);
  if (FAMILY[req.type] === 'diode') {
    return { elements: [g, el('VX', 'battery', ['a', '0'], { voltage: x, internalResistance: 0 }), el('DUT', req.type, ['a', '0'], dut)], links: [] };
  }
  if (FAMILY[req.type] === 'bjt') {
    const ib = Math.max(1e-12, Math.abs(s));
    const rb = (BASE_SUPPLY - 0.7) / ib;
    return {
      elements: [
        g,
        el('VC', 'battery', ['c', '0'], { voltage: sign * x, internalResistance: 0 }),
        el('VB', 'battery', ['vb', '0'], { voltage: sign * BASE_SUPPLY, internalResistance: 0 }),
        el('RB', 'resistor', ['vb', 'b'], { resistance: rb }),
        el('DUT', req.type, ['c', 'b', '0'], dut),
      ],
      links: [],
    };
  }
  const [vds, vgs] = req.mode === 'transfer' ? [s, x] : [x, s];
  return {
    elements: [
      g,
      el('VD', 'battery', ['d', '0'], { voltage: sign * vds, internalResistance: 0 }),
      el('VG', 'battery', ['gt', '0'], { voltage: sign * vgs, internalResistance: 0 }),
      el('DUT', req.type, ['d', 'gt', '0'], dut),
    ],
    links: [],
  };
}

/** DC çözüm: zamandan bağımsız devrede advance(0); eklem kapasitesi olan modelde kısa bir süre oturtulur. */
function settle(sim: CircuitSimulator): boolean {
  if (!sim.isTransient) return sim.advance(0).ok;
  return sim.runUntil(sim.time + 1e-3).ok;
}

/**
 * Taramayı yapar. onProgress (yapılan, toplam) her noktada; cancelled true dönerse tarama durur.
 * Bir basamakta çözüm bulunamazsa o eğri orada biter.
 */
export function runSweep(req: SweepRequest, onProgress?: (done: number, total: number) => void, cancelled?: () => boolean): Curve[] {
  const xs = sweepValues(req.from, req.to, req.step);
  const steps = req.qStep !== undefined ? [...req.steps, req.qStep] : req.steps;
  const total = xs.length * steps.length;
  const sign = isP(req.type) ? -1 : 1;
  const curves: Curve[] = [];
  let done = 0;
  for (const [k, s] of steps.entries()) {
    const isQ = req.qStep !== undefined && k === steps.length - 1;
    const points: [number, number][] = [];
    let sim: CircuitSimulator | null = null;
    let ib: number | undefined;
    for (const x of xs) {
      if (cancelled?.()) return curves;
      const netlist = testNetlist(req, x, s);
      if (!sim) {
        sim = new CircuitSimulator(netlist);
        if (!sim.canRun) break;
      } else {
        sim.update(netlist);
      }
      if (!settle(sim)) break;
      const m = sim.measure('DUT');
      if (!m || !Number.isFinite(m.current)) break;
      const current = sign * m.current;
      points.push([x, current]);
      if (FAMILY[req.type] === 'bjt') ib = sign * (sim.measure('RB')?.current ?? 0);
      done++;
      onProgress?.(done, total);
      if (Math.abs(current) > CURRENT_LIMIT) break;
    }
    done = curves.length * xs.length + xs.length;
    curves.push({ step: s, points, ...(ib !== undefined ? { measuredStep: ib } : {}), ...(isQ ? { q: true } : {}) });
  }
  return curves;
}

/** İki nokta arasında doğrusal ara değer: x'teki akım (eğrinin dışındaysa NaN). */
export function curveAt(curve: Curve, x: number): number {
  const p = curve.points;
  if (p.length === 0 || x < p[0]![0] || x > p[p.length - 1]![0]) return Number.NaN;
  for (let i = 1; i < p.length; i++) {
    const [x0, y0] = p[i - 1]!;
    const [x1, y1] = p[i]!;
    if (x <= x1) return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return p[p.length - 1]![1];
}

// --- Yük doğrusu ve Q noktası ------------------------------------------------------------------------

/** Yük doğrusu (büyüklüklerle): x = V_kaynak − y · R; Q devrenin DC çalışma noktası. */
export interface LoadLine {
  /** Yük direnci (R_D ya da R_C, varsa kaynak/emetör direnciyle toplam) ve adı. */
  readonly r: number;
  readonly label: string;
  readonly supply: number;
  readonly q: readonly [number, number];
  /** Q noktasındaki basamak: BJT'de I_B (A), FET'te V_GS (V); büyüklük (P tipinde işaret çevrilmiş). */
  readonly qStep: number | null;
}

/** Yük doğrusu açıkken taramanın üst sınırı: besleme, adımın tam katına yukarı yuvarlanmış. */
export function supplyTo(supply: number, step: number): number {
  const s = Math.abs(step) || 1;
  return Math.round(Math.ceil(Math.abs(supply) / s - 1e-9) * s * 1e9) / 1e9;
}

/** Netlist'in düğümleri: anahtar → kök (pinler ve bağlantılar birleşik). */
function nodeRoots(netlist: Netlist): (key: string) => string {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const e of netlist.elements) for (const p of e.pins) if (!parent.has(p)) parent.set(p, p);
  for (const l of netlist.links) {
    for (const k of [l.a, l.b]) if (!parent.has(k)) parent.set(k, k);
    const a = find(l.a);
    const b = find(l.b);
    if (a !== b) parent.set(a, b);
  }
  return find;
}

/**
 * Devredeki yük doğrusu: taranan parçanın drain / kollektör düğümüne bağlı direnç (öbür ucu başka bir
 * düğümde) yük direncidir; source / emetör düğümünde toprağa giden direnç varsa eklenir. Çalışma
 * noktası, AC kaynakların genliği sıfırlanıp devre DC çalışma noktasından (atOperatingPoint; büyük
 * kuplajlı devre de) başlatılarak ve 1 s oturtularak bulunur. Q'daki gerçek I_B ya da V_GS de
 * döner. Yük direnci yoksa null.
 */
export function loadLine(netlist: Netlist, dutId: string, labels: Readonly<Record<string, string>>): LoadLine | null {
  const dut = netlist.elements.find((e) => e.id === dutId);
  if (!dut || dut.pins.length < 3) return null;
  const root = nodeRoots(netlist);
  const ground = netlist.elements.filter((e) => e.type === 'ground').map((e) => root(e.pins[0]!));
  const drain = root(dut.pins[0]!);
  const source = root(dut.pins[2]!);
  const resistorsAt = (node: string) => netlist.elements.filter((e) => e.type === 'resistor' && e.id !== dutId && e.pins.some((p) => root(p) === node));
  const far = (e: NetlistElement, node: string) => e.pins.find((p) => root(p) !== node);
  const rd = resistorsAt(drain).find((e) => far(e, drain) !== undefined && root(far(e, drain)!) !== source);
  if (!rd) return null;
  const rs = ground.includes(source) ? undefined : resistorsAt(source).find((e) => far(e, source) !== undefined && ground.includes(root(far(e, source)!)));
  // AC kaynakların genliği sıfır: Q noktası DC.
  const quiet: Netlist = {
    ...netlist,
    elements: netlist.elements.map((e) => (e.type === 'acsource' || e.type === 'funcgen' ? { ...e, props: { ...e.props, amplitude: 0 } } : e)),
  };
  const sim = new CircuitSimulator(atOperatingPoint(quiet));
  if (!sim.canRun) return null;
  const ok = sim.isTransient ? sim.runUntil(1).ok : sim.advance(0).ok;
  const m = sim.measure(dutId);
  const control = sim.status(dutId).control;
  if (!ok || !m) return null;
  const sign = isP(dut.type) ? -1 : 1;
  const vFar = sim.voltageAt(far(rd, drain)!) ?? 0;
  const vLow = rs ? (sim.voltageAt(far(rs, source)!) ?? 0) : (sim.voltageAt(dut.pins[2]!) ?? 0);
  const r = Number(rd.props.resistance ?? 0) + (rs ? Number(rs.props.resistance ?? 0) : 0);
  if (!(r > 0)) return null;
  const qStep = control ? sign * (FAMILY[dut.type] === 'bjt' ? control.current : control.voltage) : null;
  return { r, label: labels[rd.id] ?? rd.id, supply: sign * (vFar - vLow), q: [sign * m.voltage, sign * m.current], qStep };
}
