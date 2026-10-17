import { IDEAL_SOURCE_SHORT_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp, strProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

export type Waveform = 'sine' | 'square' | 'triangle';
export const WAVEFORMS: readonly Waveform[] = ['sine', 'square', 'triangle'];

export const AC_SOURCE_DEFAULTS = {
  waveform: 'sine' as Waveform,
  amplitude: 5,
  frequency: 50,
  offset: 0,
  internalResistance: 1,
};

/**
 * En büyük frekans (laboratuvardaki fonksiyon üreteci gibi 2 MHz). Zaman adımı periyodun 1/100'ü
 * olduğundan yüksek frekanslarda simülasyon hızı düşürülmelidir (osiloskopta "Oto").
 */
export const AC_MAX_FREQUENCY = 2e6;

/**
 * Birim genlikli dalga biçiminin t anındaki değeri (−1..1). Üçü de t = 0'da ilk yarım
 * periyodun başındadır: sinüs ve üçgen 0'dan yükselir, kare dalga +1'dedir.
 */
export function waveValue(waveform: Waveform, frequency: number, t: number): number {
  const cycles = t * frequency;
  return waveAtPhase(waveform, cycles - Math.floor(cycles));
}

/** Birim genlikli dalganın periyot içindeki konumuna (0 ≤ faz < 1) göre değeri. */
export function waveAtPhase(waveform: Waveform, phase: number): number {
  switch (waveform) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'square':
      return phase < 0.5 ? 1 : -1;
    case 'triangle':
      return phase < 0.25 ? 4 * phase : phase < 0.75 ? 2 - 4 * phase : 4 * phase - 4;
  }
}

/** Kaymasız dalganın etkin değerinin tepe değerine oranı: sinüs 1/√2, kare 1, üçgen 1/√3. */
export function rmsFactor(waveform: Waveform): number {
  return waveform === 'sine' ? Math.SQRT1_2 : waveform === 'square' ? 1 : 1 / Math.sqrt(3);
}

/** Etkin değer, DC kayma dahil: √(kayma² + (katsayı · tepe)²). */
export function acRms(waveform: Waveform, amplitude: number, offset: number): number {
  return Math.hypot(offset, rmsFactor(waveform) * amplitude);
}

/**
 * AC kaynak (sinyal üreteci). Pinler: [0] = + uç (referans), [1] = − uç.
 *   e(t) = kayma + tepe · dalga(f · t),  v(+) − v(−) = e(t) − I · R_iç
 * İç yapı pil ile aynıdır: (−) ── ideal kaynak e(t) ── (iç düğüm) ── R_iç ── (+).
 * Kaynağın matris katkısı sabittir; yalnızca sağ taraf (z[k] = e(t)) her adımda değişir, böylece
 * doğrusal devrelerde LU ayrıştırması yine bir kez yapılır.
 */
export class AcSourceDevice extends Device {
  readonly type = 'acsource';
  readonly waveform: Waveform;
  readonly amplitude: number;
  readonly frequency: number;
  readonly offset: number;
  readonly internalResistance: number;
  /** Son tamamlanan periyottaki en büyük çıkış akımı (kısa devre uyarısı titremesin diye). */
  private peakCurrent: number | null = null;
  private runningPeak = 0;
  private elapsed = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.waveform = strProp(init.props, 'waveform', WAVEFORMS, AC_SOURCE_DEFAULTS.waveform);
    this.amplitude = Math.abs(numProp(init.props, 'amplitude', AC_SOURCE_DEFAULTS.amplitude));
    this.frequency = Math.min(
      AC_MAX_FREQUENCY,
      Math.max(1e-3, numProp(init.props, 'frequency', AC_SOURCE_DEFAULTS.frequency)),
    );
    this.offset = numProp(init.props, 'offset', AC_SOURCE_DEFAULTS.offset);
    this.internalResistance = Math.max(0, numProp(init.props, 'internalResistance', AC_SOURCE_DEFAULTS.internalResistance));
  }

  override get timeVarying(): boolean {
    return true;
  }

  override get period(): number {
    return 1 / this.frequency;
  }

  override get peakVoltage(): number {
    return Math.abs(this.offset) + this.amplitude;
  }

  /** Kaynağın iç gerilimi (EMK) e(t). */
  emf(t: number): number {
    return this.offset + this.amplitude * waveValue(this.waveform, this.frequency, t);
  }

  private get plus(): number {
    return this.nodes[0]!;
  }
  private get minus(): number {
    return this.nodes[1]!;
  }
  private get inner(): number {
    return this.nodes[2]!;
  }
  private get branch(): number {
    return this.branches[0]!;
  }

  /** Gerilim kaynağının matris kısmı (değeri 0; değer stampStep'te sağ tarafa yazılır). */
  override stampStatic(sys: MnaSystem): void {
    if (this.internalResistance > 0) {
      sys.voltageSource(this.inner, this.minus, this.branch, 0);
      sys.conductance(this.inner, this.plus, 1 / this.internalResistance);
    } else {
      sys.voltageSource(this.plus, this.minus, this.branch, 0);
    }
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    sys.addRhs(this.branch, this.emf(ctx.time) * ctx.sourceScale);
  }

  override idealVoltageBranches(): Array<readonly [number, number]> {
    return this.internalResistance > 0 ? [] : [[this.plus, this.minus]];
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    this.runningPeak = Math.max(this.runningPeak, Math.abs(this.outputCurrent(x)));
    this.elapsed += ctx.h;
    if (this.elapsed >= this.period * (1 - 1e-9)) {
      this.peakCurrent = this.runningPeak;
      this.runningPeak = 0;
      this.elapsed = 0;
    }
  }

  /** Akım: + uçtan kaynağa giren akım (MNA akım bilinmeyeni). */
  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, x[this.branch]!);
  }

  /** Kaynağın + ucundan dış devreye verdiği akım. */
  outputCurrent(x: Float64Array): number {
    return -x[this.branch]!;
  }

  /** Kısa devre değerlendirmesinde kullanılan akım: son periyodun tepe akımı (yoksa anlık). */
  peakOutputCurrent(x: Float64Array): number {
    return Math.max(this.peakCurrent ?? 0, this.runningPeak, Math.abs(this.outputCurrent(x)));
  }

  /** Pil ile aynı ölçüt: tepe akımı, tepe gerilimi / (2 · R_iç) değerini aşıyorsa (dış yük < R_iç). */
  isShortCircuited(x: Float64Array): boolean {
    const peak = this.peakVoltage;
    if (peak === 0) return false;
    const limit = this.internalResistance > 0 ? peak / (2 * this.internalResistance) : peak / IDEAL_SOURCE_SHORT_RESISTANCE;
    return this.peakOutputCurrent(x) > limit;
  }

  override status(x: Float64Array): DeviceStatus {
    return { shortCircuit: this.isShortCircuited(x) };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof AcSourceDevice && prev.frequency === this.frequency) {
      this.peakCurrent = prev.peakCurrent;
      this.runningPeak = prev.runningPeak;
      this.elapsed = prev.elapsed;
    }
  }
}

export const acSourceModel: DeviceModel = {
  type: 'acsource',
  pinCount: 2,
  // Pil gibi: iç direnç 0 ile >0 arasında geçişte yapı değişmesin diye iç düğüm hep ayrılır.
  internalNodes: 1,
  branchCount: 1,
  referencePins: () => [1],
  create: (init) => new AcSourceDevice(init),
};
