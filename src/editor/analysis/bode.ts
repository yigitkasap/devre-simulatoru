// Ölçülen Bode (A4, N4): laboratuvardaki gibi, üretecin frekansı adım adım değiştirilir; her frekansta
// devrenin oturması beklenir, sonra 2 periyot ölçülür. Kazanç ve faz sinüs uydurmasıyla (periyodun
// tam katlarında eşit aralıklı örneklerin ayrık Fourier katsayısı) bulunur. Tek bir simülatör
// kullanılır: frekans update() ile değişir, çalışma noktası (kuplaj kondansatörleri) oturmuş kalır.
// Önce kaynağın genliği sıfırken devre DC'de oturtulur (kuplaj kondansatörleri dolar). Oturma ölçütü
// her frekansta aynıdır ve periyot uzunluğundan bağımsızdır: son üç periyodun genliğinden kalan hata
// geometrik olarak tahmin edilir (Aitken); kalan hata genliğin binde birinden, faz değişimi 0,1°'den
// azsa oturmuş sayılır. Ardışık iki periyodu karşılaştırmak yetmez: yavaş kayma yüksek frekansta
// periyot başına çok küçük görünür, ölçüt erken sağlanır ve eğride basamak çıkar.
// Motor yalnızca var olan arabirimiyle kullanılır (update, runUntil, voltageAt).

import { CircuitSimulator, FUNCGEN_LIMITS, type DeviceType, type Netlist } from '../../sim';
import { AC_MAX_FREQUENCY } from '../../sim/devices/acsource';

/** Ölçülen gerilim: a ucunun b ucuna göre gerilimi (b yoksa toprağa göre). */
export interface Probe {
  readonly a: string;
  readonly b: string | null;
}

export interface BodeRequest {
  readonly netlist: Netlist;
  /** Frekansı değiştirilen kaynak (fonksiyon üreteci ya da AC kaynak). */
  readonly source: string;
  readonly input: Probe;
  readonly output: Probe;
  readonly from: number;
  readonly to: number;
  readonly points: number;
}

export interface BodePoint {
  readonly f: number;
  readonly inAmp: number;
  readonly outAmp: number;
  /** Kazanç (kat) ve faz (°, çıkışın girişe göre; ardışık noktalar arasında açılmış). */
  readonly gain: number;
  readonly phase: number;
  /** Oturma ölçütü sağlandı mı (sağlanmadan en çok periyot sınırına gelindiyse false). */
  readonly settled: boolean;
}

/**
 * Periyot başına örnek. Örnek anları motorun adımlarını da belirler: 64 örnekte 2 MHz'te kazanç
 * geçmişe göre %3 oynuyordu (101,6 / 104,6 kat), 128'de yakınsıyor (105,5; 256'da 106,1).
 */
const SAMPLES = 128;

/** Kaynağın verebildiği frekans aralığı: fonksiyon üreteci 0,2 Hz – 2 MHz, AC kaynak en çok 2 MHz. */
export function sourceLimits(type: DeviceType): { min: number; max: number } {
  return type === 'funcgen' ? { min: FUNCGEN_LIMITS.minFrequency, max: FUNCGEN_LIMITS.maxFrequency } : { min: 1e-3, max: AC_MAX_FREQUENCY };
}
/** Bir frekansta oturma için en çok periyot. */
const MAX_PERIODS = 400;
const AMP_TOL = 1e-3;
const PHASE_TOL = 0.1;

/** Logaritmik aralıklı frekanslar (uçlar dahil). */
export function logFrequencies(from: number, to: number, points: number): number[] {
  const n = Math.max(1, Math.round(points));
  if (n === 1) return [from];
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(from * (to / from) ** (i / (n - 1)));
  return out;
}

/** Eşit aralıklı, tam periyotluk örneklerden genlik ve faz (v = A · sin(ωt + φ)). */
export function sineFit(samples: readonly number[], times: readonly number[], f: number): { amp: number; phase: number } {
  let s = 0;
  let c = 0;
  const w = 2 * Math.PI * f;
  for (let i = 0; i < samples.length; i++) {
    s += samples[i]! * Math.sin(w * times[i]!);
    c += samples[i]! * Math.cos(w * times[i]!);
  }
  s *= 2 / samples.length;
  c *= 2 / samples.length;
  return { amp: Math.hypot(s, c), phase: (Math.atan2(c, s) * 180) / Math.PI };
}

const read = (sim: CircuitSimulator, p: Probe) => (sim.voltageAt(p.a) ?? 0) - (p.b === null ? 0 : (sim.voltageAt(p.b) ?? 0));

/** Kaynağın frekansı değiştirilmiş netlist. */
export function withFrequency(netlist: Netlist, source: string, f: number, quiet = false): Netlist {
  return { ...netlist, elements: netlist.elements.map((e) => (e.id === source ? { ...e, props: { ...e.props, frequency: f, ...(quiet ? { amplitude: 0 } : {}) } } : e)) };
}

/**
 * DC çalışma noktası (SPICE'taki .op gibi): kondansatörler çıkarılır (açık devre), bobinler kısa
 * devre (bağlantı) yapılır, devre oturtulur ve her kondansatörün uç gerilimi okunur. Dönen netlist'te
 * kondansatörler bu gerilimle başlar. Böylece büyük zaman sabitli devre de (ör. 10 µF kuplaj ve
 * 2,2 MΩ baz direnci, τ = 22 s) hemen çalışma noktasındadır; yalnız çıkışa bakan oturtma, transistör
 * henüz kesimdeyken çıkışı sabit görüp erken durabiliyordu. Bulunamazsa netlist olduğu gibi döner.
 */
export function atOperatingPoint(netlist: Netlist, cancelled?: () => boolean): Netlist {
  const caps = netlist.elements.filter((e) => e.type === 'capacitor');
  if (caps.length === 0) return netlist;
  const dc: Netlist = {
    elements: netlist.elements.filter((e) => e.type !== 'capacitor' && e.type !== 'inductor'),
    links: [...netlist.links, ...netlist.elements.filter((e) => e.type === 'inductor').map((e) => ({ a: e.pins[0]!, b: e.pins[1]! }))],
  };
  const sim = new CircuitSimulator(dc);
  if (!sim.canRun) return netlist;
  const read = () => caps.map((c) => (sim.voltageAt(c.pins[0]!) ?? 0) - (sim.voltageAt(c.pins[1]!) ?? 0));
  let previous = read();
  let settled = false;
  for (let dt = 1e-3; dt <= 20 && !settled; dt *= 2) {
    if (cancelled?.() || !sim.runUntil(sim.time + dt).ok) return netlist;
    const v = read();
    settled = v.every((x, i) => Math.abs(x - previous[i]!) < 1e-6 * Math.max(1, Math.abs(x)));
    previous = v;
  }
  const initial = new Map(caps.map((c, i) => [c.id, previous[i]!]));
  return { ...netlist, elements: netlist.elements.map((e) => (initial.has(e.id) ? { ...e, props: { ...e.props, initialVoltage: initial.get(e.id)! } } : e)) };
}

/**
 * DC'de oturtma (kaynağın genliği sıfır): çıkışın gerilimi, iki katına çıkan aralıklarla (1 ms'den
 * en çok 20 s'ye) bakıldığında artık değişmiyorsa (1 µV'tan az) durulur.
 */
export function settleDc(sim: CircuitSimulator, req: BodeRequest, cancelled?: () => boolean): boolean {
  let previous = read(sim, req.output);
  for (let dt = 1e-3; dt <= 20; dt *= 2) {
    if (cancelled?.()) return false;
    if (!sim.runUntil(sim.time + dt).ok) return false;
    const v = read(sim, req.output);
    if (Math.abs(v - previous) < 1e-6 * Math.max(1, Math.abs(v))) return true;
    previous = v;
  }
  return true;
}

/** Bir periyot (ya da daha çok) ölçer: girişin ve çıkışın uydurması. */
function measurePeriods(sim: CircuitSimulator, req: BodeRequest, f: number, periods: number) {
  const T = 1 / f;
  // Örnekler bir sonraki periyot başından (zaman ızgarası faz için ortak).
  const start = Math.ceil(sim.time / T - 1e-9) * T;
  const times: number[] = [];
  const vin: number[] = [];
  const vout: number[] = [];
  const n = SAMPLES * periods;
  for (let k = 0; k < n; k++) {
    const t = start + (k * T) / SAMPLES;
    if (!sim.runUntil(t).ok) return null;
    times.push(t);
    vin.push(read(sim, req.input));
    vout.push(read(sim, req.output));
  }
  return { input: sineFit(vin, times, f), output: sineFit(vout, times, f) };
}

/**
 * Kalan hatanın tahmini (son üç genlik): değişim geometrik azalıyorsa (0 < r < 1) kalan d₂ · r / (1 − r);
 * büyüyorsa sonsuz; işaret değiştiriyorsa (gürültü) son değişim.
 */
export function remainingChange(a1: number, a2: number, a3: number): number {
  const d1 = a2 - a1;
  const d2 = a3 - a2;
  if (d1 === 0) return Math.abs(d2);
  const r = d2 / d1;
  if (r >= 1) return Number.POSITIVE_INFINITY;
  return r > 0 ? Math.abs((d2 * r) / (1 - r)) : Math.abs(d2);
}

/** Bir frekansta ölçüm: oturma (periyot periyot, aynı ölçüt), sonra 2 periyot. */
function measureAt(sim: CircuitSimulator, req: BodeRequest, f: number, cancelled?: () => boolean): Omit<BodePoint, 'phase'> & { rawPhase: number } | null {
  const amps: number[] = [];
  let lastPhase: number | null = null;
  let settled = false;
  for (let p = 0; p < MAX_PERIODS; p++) {
    if (cancelled?.()) return null;
    const m = measurePeriods(sim, req, f, 1);
    if (!m) return null;
    const out = m.output;
    amps.push(out.amp);
    const n = amps.length;
    if (n >= 3 && lastPhase !== null) {
      const rest = remainingChange(amps[n - 3]!, amps[n - 2]!, amps[n - 1]!);
      const step = Math.abs(amps[n - 1]! - amps[n - 2]!);
      const tol = AMP_TOL * Math.max(1e-12, out.amp);
      // Sayısal gürültü tabanı: genlik milyonda birden az değişiyorsa oran (r) anlamsızdır.
      const quiet = step <= 1e-6 * Math.max(1e-12, out.amp);
      if ((quiet || (rest <= tol && step <= tol)) && Math.abs(wrap(out.phase - lastPhase)) <= PHASE_TOL) {
        settled = true;
        break;
      }
    }
    lastPhase = out.phase;
  }
  const m = measurePeriods(sim, req, f, 2);
  if (!m || !(m.input.amp > 0)) return null;
  return { f, inAmp: m.input.amp, outAmp: m.output.amp, gain: m.output.amp / m.input.amp, rawPhase: wrap(m.output.phase - m.input.phase), settled };
}

/** Açıyı (−180, 180] aralığına getirir. */
const wrap = (deg: number) => deg - 360 * Math.round(deg / 360);


/**
 * Bode taraması. onPoint her noktada (açılmış fazla); cancelled true dönerse durur. Faz ilk noktada
 * (−360, 0] aralığına alınır (eviren yükselteç −180°), sonra ardışık noktalar arasında 360°'lik
 * sıçramalar açılır.
 */
export function measureBode(
  req: BodeRequest,
  onPoint?: (p: BodePoint, i: number, total: number) => void,
  cancelled?: () => boolean,
  /** DC'de oturur oturmaz aynı simülatörle (çalışma noktası) çağrılır: Teori eğrisi (bodeTheory.ts). */
  onSettled?: (sim: CircuitSimulator) => void,
): BodePoint[] {
  // Kaynağın sınırı dışında motor frekansı kırpar (üreteç 2 MHz'ten fazlasını vermez); ölçüm istenen
  // frekansta uydurma yaptığı için aralık kaynağın sınırına alınır.
  const type = req.netlist.elements.find((e) => e.id === req.source)?.type ?? 'funcgen';
  const { min, max } = sourceLimits(type);
  const clamp = (f: number) => Math.min(max, Math.max(min, f));
  const freqs = logFrequencies(clamp(req.from), clamp(req.to), req.points);
  const out: BodePoint[] = [];
  let sim: CircuitSimulator | null = null;
  let last: number | null = null;
  for (const [i, f] of freqs.entries()) {
    if (cancelled?.()) break;
    const netlist = withFrequency(req.netlist, req.source, f);
    if (!sim) {
      // İlk frekans: önce sinyalsiz oturtulur, sonra sinyal açılır. Motorun en büyük adımı kaynağın
      // periyoduna bağlı: sinyalsiz oturtma düşük frekansta (en çok 10 Hz) yapılır, adımlar büyük kalır.
      sim = new CircuitSimulator(atOperatingPoint(withFrequency(req.netlist, req.source, Math.min(f, 10), true), cancelled));
      if (!sim.canRun || !settleDc(sim, req, cancelled)) break;
      onSettled?.(sim);
      sim.update(netlist);
    } else {
      sim.update(netlist);
    }
    const m = measureAt(sim, req, f, cancelled);
    if (!m) break;
    // İlk nokta (−270°, 90°] aralığına: eviren yükselteç ≈ −180°, evirmeyen ≈ 0°.
    let phase: number = last === null ? (m.rawPhase > 90 ? m.rawPhase - 360 : m.rawPhase) : m.rawPhase;
    if (last !== null) phase += 360 * Math.round((last - phase) / 360);
    last = phase;
    const point: BodePoint = { f: m.f, inAmp: m.inAmp, outAmp: m.outAmp, gain: m.gain, phase, settled: m.settled };
    out.push(point);
    onPoint?.(point, i, freqs.length);
  }
  return out;
}

export const toDb = (gain: number): number => 20 * Math.log10(Math.max(1e-30, gain));

/**
 * Orta bant ve −3 dB noktaları: orta bant, kazancı en büyüğünün 1 dB yakınındaki noktaların
 * logaritmik ortasına en yakın ölçüm; f_H ve f_L, kazancın (dB) orta banttan 3 dB düştüğü yer, iki
 * ölçüm noktası arasında dB – log f doğrusal ara değeriyle (interpolated: true).
 */
export function bodeSummary(points: readonly BodePoint[]): { mid: BodePoint; fH: number | null; fL: number | null } | null {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => toDb(p.gain)));
  const flat = points.filter((p) => toDb(p.gain) >= max - 1);
  const center = Math.sqrt(flat[0]!.f * flat[flat.length - 1]!.f);
  const mid = flat.reduce((a, b) => (Math.abs(Math.log(b.f / center)) < Math.abs(Math.log(a.f / center)) ? b : a));
  const target = toDb(mid.gain) - 3;
  const cross = (a: BodePoint, b: BodePoint) => {
    const da = toDb(a.gain);
    const db = toDb(b.gain);
    const u = (da - target) / (da - db);
    return 10 ** (Math.log10(a.f) + u * (Math.log10(b.f) - Math.log10(a.f)));
  };
  const iMid = points.indexOf(mid);
  let fH: number | null = null;
  for (let i = iMid; i + 1 < points.length; i++) {
    if (toDb(points[i + 1]!.gain) < target) {
      fH = cross(points[i]!, points[i + 1]!);
      break;
    }
  }
  let fL: number | null = null;
  for (let i = iMid; i > 0; i--) {
    if (toDb(points[i - 1]!.gain) < target) {
      fL = cross(points[i]!, points[i - 1]!);
      break;
    }
  }
  return { mid, fH, fL };
}
