import { IDEAL_SOURCE_SHORT_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

export const BATTERY_DEFAULTS = { voltage: 9, internalResistance: 1 };

/**
 * Pil (DC gerilim kaynağı). Pinler: [0] = + uç, [1] = − uç.
 * İç yapı:  (−) ── ideal kaynak V ── (iç düğüm) ── R_iç ── (+)
 * İç direnç 0 ise ideal kaynak doğrudan + ve − uçlar arasındadır; iç düğüm kullanılmaz.
 */
export class BatteryDevice extends Device {
  readonly type = 'battery';
  readonly voltage: number;
  readonly internalResistance: number;

  constructor(init: DeviceInit) {
    super(init);
    this.voltage = numProp(init.props, 'voltage', BATTERY_DEFAULTS.voltage);
    this.internalResistance = Math.max(0, numProp(init.props, 'internalResistance', BATTERY_DEFAULTS.internalResistance));
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

  /**
   * İdeal gerilim kaynağı (+ uç a, − uç b, ek satır k): v(a) − v(b) = V
   *   A[a][k] += 1, A[k][a] += 1, A[b][k] −= 1, A[k][b] −= 1, z[k] = V
   * İç direnç > 0 ise a = iç düğüm ve iç düğüm ile + uç arasına G = 1/R_iç iletkenliği eklenir.
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    const v = this.voltage * ctx.sourceScale;
    if (this.internalResistance > 0) {
      sys.voltageSource(this.inner, this.minus, this.branch, v);
      sys.conductance(this.inner, this.plus, 1 / this.internalResistance);
    } else {
      sys.voltageSource(this.plus, this.minus, this.branch, v);
    }
  }

  override get peakVoltage(): number {
    return Math.abs(this.voltage);
  }

  override idealVoltageBranches(): Array<readonly [number, number]> {
    // İç dirençli pilin ideal kaynağı yalnızca kendi iç düğümüne bağlı; döngü oluşturamaz.
    return this.internalResistance > 0 ? [] : [[this.plus, this.minus]];
  }

  /** Akım: + uçtan pile giren akım (MNA akım bilinmeyeni). Pil güç verirken negatiftir. */
  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, x[this.branch]!);
  }

  /** Pilin + ucundan dış devreye verdiği akım. */
  outputCurrent(x: Float64Array): number {
    return -x[this.branch]!;
  }

  /**
   * Kısa devre: pilden geçen akım V/R_iç değerinin yarısından büyükse (dış yük < R_iç).
   * İdeal pilde (R_iç = 0) eşik olarak 0,1 Ω'luk dış yük kullanılır.
   */
  isShortCircuited(x: Float64Array): boolean {
    if (this.voltage === 0) return false;
    const current = Math.abs(this.outputCurrent(x));
    const limit =
      this.internalResistance > 0
        ? Math.abs(this.voltage) / (2 * this.internalResistance)
        : Math.abs(this.voltage) / IDEAL_SOURCE_SHORT_RESISTANCE;
    return current > limit;
  }

  override status(x: Float64Array): DeviceStatus {
    return { shortCircuit: this.isShortCircuited(x) };
  }
}

export const batteryModel: DeviceModel = {
  type: 'battery',
  pinCount: 2,
  // Yapının değer değişikliklerinde sabit kalması için iç düğüm ve akım satırı her zaman ayrılır.
  internalNodes: 1,
  branchCount: 1,
  create: (init) => new BatteryDevice(init),
};
