// Grafik kaydı (A1): yalnızca seçili izler örneklenir. Örnekler sabit simülasyon aralığında alınır:
// AC kaynağı olmayan devrede karenin ilerlemesi örnek anlarında bölünür (motorun advance() çağrısı
// birkaç parçaya ayrılır; izlenen istatistikler birleştirilir). AC kaynaklı devrede bölmek karenin
// ortalamalarını (kablo renkleri, LED parlaklığı) son parçaya indirirdi: orada karede bir örnek alınır.

import { mergeStats, type AdvanceResult, type CircuitSimulator, type KeyStats } from '../../sim';
import type { TraceDef } from '../../model/analysis';

/** Bir izin şu anki değeri (V ya da A); hesaplanamıyorsa NaN. */
export function traceValue(sim: Pick<CircuitSimulator, 'measure' | 'voltageAt'>, trace: TraceDef): number {
  if (trace.kind === 'current') return sim.measure(trace.part)?.current ?? Number.NaN;
  const a = sim.voltageAt(trace.node);
  if (a === null) return Number.NaN;
  if (trace.ref === null) return a;
  const b = sim.voltageAt(trace.ref);
  return b === null ? Number.NaN : a - b;
}

/** 1-2-5 dizisinde x'e en yakın (altındaki) değer. */
export function niceInterval(x: number): number {
  if (!(x > 0)) return 1e-3;
  const e = 10 ** Math.floor(Math.log10(x));
  const m = x / e;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e;
}

/** Hıza göre örnekleme aralığı: kare başına ≈ 3 örnek (×1'de 5 ms). */
export const intervalForSpeed = (speed: number): number => niceInterval(speed / 180);

/** Bellekte tutulan en çok örnek; dolunca her ikinci örnek atılır, aralık iki katına çıkar. */
export const MAX_SAMPLES = 20000;
/** Bir karede en çok bu kadar parçaya bölünür (fazlası tek parçada ilerler). */
const MAX_CHUNKS = 24;

export class TraceRecorder {
  private traces: readonly TraceDef[] = [];
  times = new Float64Array(256);
  /** İz kimliği → değerler (times ile aynı sırada; iz sonradan eklendiyse öncesi NaN). */
  values = new Map<string, Float64Array>();
  count = 0;
  interval = 0.005;
  /** AC kaynaklı devrede karede bir örnek. */
  perFrame = false;
  /** Her yeni örnekte artar (grafik yeniden çizilsin). */
  version = 0;
  private next = 0;

  get active(): boolean {
    return this.traces.length > 0;
  }

  get defs(): readonly TraceDef[] {
    return this.traces;
  }

  setTraces(traces: readonly TraceDef[]): void {
    const values = new Map<string, Float64Array>();
    for (const t of traces) values.set(t.id, this.values.get(t.id) ?? new Float64Array(this.times.length).fill(Number.NaN));
    this.values = values;
    this.traces = traces;
    this.version++;
  }

  /** Yeni kayıt (Oynat'a basılınca): örnekler silinir. */
  reset(time: number, speed: number, perFrame: boolean): void {
    this.count = 0;
    this.interval = intervalForSpeed(speed);
    this.perFrame = perFrame;
    this.next = time + this.interval;
    for (const [id, v] of this.values) this.values.set(id, v.fill(Number.NaN));
    this.version++;
  }

  /** Hız değişince aralık yeniden seçilir (önceki örnekler kalır). */
  setSpeed(time: number, speed: number): void {
    this.interval = intervalForSpeed(speed);
    this.next = time + this.interval;
  }

  private grow(): void {
    const size = this.times.length * 2;
    const times = new Float64Array(size);
    times.set(this.times);
    this.times = times;
    for (const [id, v] of this.values) {
      const next = new Float64Array(size).fill(Number.NaN);
      next.set(v);
      this.values.set(id, next);
    }
  }

  /** Bellek dolunca her ikinci örnek atılır, aralık iki katına çıkar. */
  private decimate(): void {
    const half = Math.ceil(this.count / 2);
    for (let i = 0; i < half; i++) this.times[i] = this.times[i * 2]!;
    for (const v of this.values.values()) {
      for (let i = 0; i < half; i++) v[i] = v[i * 2]!;
      v.fill(Number.NaN, half);
    }
    this.count = half;
    this.interval *= 2;
  }

  /** Şu anki değerleri kaydeder. */
  sample(sim: Pick<CircuitSimulator, 'measure' | 'voltageAt' | 'time'>): void {
    if (this.count >= MAX_SAMPLES) this.decimate();
    if (this.count >= this.times.length) this.grow();
    const i = this.count++;
    this.times[i] = sim.time;
    for (const t of this.traces) this.values.get(t.id)![i] = traceValue(sim, t);
    this.next = sim.time + this.interval;
    this.version++;
  }

  /** Bir sonraki örneğin zamanı. */
  get due(): number {
    return this.next;
  }

  /** t anındaki değer (iki örnek arasında doğrusal ara değer); kayıt dışındaysa NaN. */
  valueAt(id: string, t: number): number {
    const v = this.values.get(id);
    if (!v || this.count === 0) return Number.NaN;
    const times = this.times;
    if (t < times[0]! || t > times[this.count - 1]!) return Number.NaN;
    let lo = 0;
    let hi = this.count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid]! <= t) lo = mid;
      else hi = mid;
    }
    const t0 = times[lo]!;
    const t1 = times[hi]!;
    if (t1 === t0) return v[lo]!;
    const a = (t - t0) / (t1 - t0);
    return v[lo]! + (v[hi]! - v[lo]!) * a;
  }
}

/** Karedeki ilerlemenin sonucu ve izlenen bileşenlerin (bütün parçalar boyunca birleştirilmiş) istatistikleri. */
export interface RecordedAdvance {
  readonly result: AdvanceResult;
  readonly stats: ReadonlyMap<string, ReadonlyMap<string, KeyStats>> | null;
}

function mergeInto(acc: Map<string, Map<string, KeyStats>>, sim: CircuitSimulator, watched: readonly string[]): void {
  for (const id of watched) {
    const stats = sim.watchedStats(id);
    if (!stats) continue;
    let target = acc.get(id);
    if (!target) acc.set(id, (target = new Map()));
    for (const [key, s] of stats) {
      const previous = target.get(key);
      target.set(key, previous ? mergeStats(previous, s) : { ...s, values: [...s.values] });
    }
  }
}

/**
 * Simülasyonu dt kadar ilerletir ve kaydı tutar. AC kaynaksız devrede kare örnek anlarında bölünür;
 * adım bütçesi (maxSteps) ve süre sınırı (deadline) bütün parçalar için ortaktır.
 */
export function advanceRecorded(
  sim: CircuitSimulator,
  dt: number,
  maxSteps: number,
  deadline: number,
  recorder: TraceRecorder,
  watched: readonly string[],
): RecordedAdvance {
  if (recorder.perFrame || !sim.isTransient) {
    const result = sim.advance(dt, maxSteps, deadline);
    if (result.ok && sim.time >= recorder.due - recorder.interval * 1e-6) recorder.sample(sim);
    return { result, stats: null };
  }
  const acc = new Map<string, Map<string, KeyStats>>();
  let remaining = dt;
  let steps = 0;
  let chunks = 0;
  const burned: string[] = [];
  let truncated = false;
  let last: AdvanceResult = { ok: true, steps: 0, burned: [] };
  const tol = recorder.interval * 1e-6;
  while (remaining > 1e-15) {
    const toSample = recorder.due - sim.time;
    const chunk = chunks < MAX_CHUNKS && toSample > tol && toSample < remaining - tol ? toSample : remaining;
    last = sim.advance(chunk, Math.max(1, maxSteps - steps), deadline);
    chunks++;
    steps += last.steps;
    burned.push(...last.burned);
    truncated ||= last.truncated === true;
    remaining -= chunk;
    mergeInto(acc, sim, watched);
    if (!last.ok) break;
    if (sim.time >= recorder.due - tol) recorder.sample(sim);
    if (truncated) break;
  }
  const result: AdvanceResult = { ...last, steps, burned, ...(truncated ? { truncated: true } : {}) };
  return { result, stats: acc };
}
