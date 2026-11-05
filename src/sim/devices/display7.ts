import type { MnaSystem } from '../mna';
import { strProp } from '../netlist';
import { WindowPeak } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';
import { Junction, saturationCurrentFor } from './junction';

/**
 * Ortak katotlu 7 segment gösterge (Kingbright SC56-11EWA, yüksek verimli kırmızı; DSAP6671 V.1A,
 * 03/04/2019). Pinler: [0–6] a…g segmentlerinin anotları, [7] DP, [8] ortak katot (3. bacak; 8. bacak
 * içeriden aynı). Her segment bir LED: anot ── Rs ── (iç düğüm) ── pn eklemi ── ortak katot.
 *   - İleri gerilim (tablo): I_F = 10 mA'de tipik 1,9 V. Eklemin N'si ve Rs: veri sayfasının "Forward
 *     Current vs. Forward Voltage" eğrisinin (s. 3, 25 °C) vektör çiziminden okunan 15 noktaya
 *     (0,5–15 mA) en küçük kareler: N = 2,76, Rs = 8,8 Ω (fark ≤ 15 mV); Is, 10 mA'de tablodaki
 *     1,9 V'u verecek biçimde.
 *   - Mutlak en büyük sürekli akım I_F = 30 mA (25 °C): aşılınca segment yanar (açık devre; LED gibi).
 *     Tepe akımı (160 mA, 1/10 görev, 0,1 ms) modellenmez.
 *   - En büyük ters gerilim V_R = 5 V: aşılırsa uyarı.
 *   - Parlaklık: ışık şiddeti 10 mA'e göre normalleştirilmiş (veri sayfasının ölçüm akımı).
 */
export const SEG7 = {
  forwardVoltage: 1.9,
  testCurrent: 10e-3,
  emission: 2.76,
  seriesResistance: 8.8,
  maxCurrent: 30e-3,
  maxReverse: 5,
} as const;

export const SEG7_MODELS = ['SC56-11EWA'] as const;
export const SEG7_DEFAULTS = { model: 'SC56-11EWA' };

const SEGMENTS = 8;
const COMMON = 8;
const GAMMA = 2.2;

/** Segmentin parlaklığı (0..1): akım / 10 mA (en çok 1), göz için gamma düzeltmeli. */
export function segmentBrightness(current: number): number {
  return Math.min(1, Math.max(0, current / SEG7.testCurrent)) ** (1 / GAMMA);
}

export class Display7Device extends Device {
  readonly type = 'seg7';
  readonly model: string;
  readonly junctions: Junction[];
  burned: boolean[] = new Array<boolean>(SEGMENTS).fill(false);
  burnCurrents: number[] = new Array<number>(SEGMENTS).fill(0);
  private reverse = Array.from({ length: SEGMENTS }, () => new WindowPeak());

  constructor(init: DeviceInit) {
    super(init);
    this.model = strProp(init.props, 'model', SEG7_MODELS, SEG7_DEFAULTS.model);
    const is = saturationCurrentFor(SEG7.testCurrent, SEG7.forwardVoltage - SEG7.testCurrent * SEG7.seriesResistance, SEG7.emission);
    this.junctions = Array.from({ length: SEGMENTS }, () => new Junction(is, SEG7.emission));
  }

  /** k. segmentin iç düğümü (eklemin anodu). */
  private inner(k: number): number {
    return this.nodes[9 + k]!;
  }

  override get nonlinear(): boolean {
    return true;
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    const groups: Array<readonly number[]> = [];
    for (let k = 0; k < SEGMENTS; k++) if (!this.burned[k]) groups.push([this.nodes[k]!, this.inner(k), this.nodes[COMMON]!]);
    return groups;
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return Array.from({ length: SEGMENTS }, (_, k) => [this.nodes[k]!, this.inner(k), this.nodes[COMMON]!]);
  }

  override stampStatic(sys: MnaSystem): void {
    for (let k = 0; k < SEGMENTS; k++) if (!this.burned[k]) sys.conductance(this.nodes[k]!, this.inner(k), 1 / SEG7.seriesResistance);
  }

  override stampNonlinear(sys: MnaSystem): void {
    for (let k = 0; k < SEGMENTS; k++) if (!this.burned[k]) this.junctions[k]!.stamp(sys, this.inner(k), this.nodes[COMMON]!);
  }

  override updateIterate(x: Float64Array): boolean {
    let converged = true;
    for (let k = 0; k < SEGMENTS; k++) {
      if (this.burned[k]) continue;
      if (!this.junctions[k]!.update(this.v(x, 9 + k) - this.v(x, COMMON))) converged = false;
    }
    return converged;
  }

  override restoreIterate(): void {
    for (const j of this.junctions) j.restore();
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    for (let k = 0; k < SEGMENTS; k++) {
      this.junctions[k]!.accept();
      this.reverse[k]!.add(this.reverseVoltage(x, k), ctx.h, ctx.window);
    }
  }

  private reverseVoltage(x: Float64Array, k: number): number {
    return Math.max(0, this.v(x, COMMON) - this.v(x, k));
  }

  /** k. segmentin akımı (anottan katoda). */
  segmentCurrent(x: Float64Array, k: number): number {
    if (this.burned[k]) return 0;
    return (this.v(x, k) - this.v(x, 9 + k)) / SEG7.seriesResistance;
  }

  override checkLimits(x: Float64Array): boolean {
    let changed = false;
    for (let k = 0; k < SEGMENTS; k++) {
      if (this.burned[k]) continue;
      const current = this.segmentCurrent(x, k);
      if (current > SEG7.maxCurrent) {
        this.burned[k] = true;
        this.burnCurrents[k] = current;
        changed = true;
      }
    }
    return changed;
  }

  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    let voltage = 0;
    for (let k = 0; k < SEGMENTS; k++) voltage = Math.max(voltage, this.reverse[k]!.value(this.reverseVoltage(x, k)));
    return voltage > SEG7.maxReverse ? [{ code: 'reverse-voltage', params: { voltage, limit: SEG7.maxReverse } }] : [];
  }

  override pinCurrents(x: Float64Array): number[] {
    const currents = new Array<number>(this.nodes.length).fill(0);
    let total = 0;
    for (let k = 0; k < SEGMENTS; k++) {
      const c = this.segmentCurrent(x, k);
      currents[k] = c;
      total += c;
    }
    currents[COMMON] = -total;
    return currents;
  }

  /** Ortak katottan dönen toplam akım ve en parlak segmentin gerilimi. */
  measure(x: Float64Array): Measurement {
    const currents = this.pinCurrents(x).slice(0, SEGMENTS);
    const current = currents.reduce((s, c) => s + c, 0);
    let k = 0;
    currents.forEach((c, i) => c > currents[k]! && (k = i));
    const voltage = this.v(x, k) - this.v(x, COMMON);
    return { voltage, current, power: currents.reduce((s, c, i) => s + c * (this.v(x, i) - this.v(x, COMMON)), 0) };
  }

  override status(x: Float64Array): DeviceStatus {
    const currents = Array.from({ length: SEGMENTS }, (_, k) => this.segmentCurrent(x, k));
    return {
      ...(this.burned.some(Boolean) ? { burned: true } : {}),
      display: { currents, brightness: currents.map((c, k) => (this.burned[k] ? 0 : segmentBrightness(c))), burned: [...this.burned] },
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof Display7Device) {
      this.burned = [...prev.burned];
      this.burnCurrents = [...prev.burnCurrents];
      this.reverse.forEach((r, k) => r.adopt(prev.reverse[k]!));
      this.junctions.forEach((j, k) => j.copyStateFrom(prev.junctions[k]!));
    }
  }

  override repair(): boolean {
    if (!this.burned.some(Boolean)) return false;
    this.burned.fill(false);
    this.burnCurrents.fill(0);
    return true;
  }
}

export const display7Model: DeviceModel = {
  type: 'seg7',
  pinCount: 9,
  internalNodes: SEGMENTS,
  branchCount: 0,
  create: (init) => new Display7Device(init),
};
