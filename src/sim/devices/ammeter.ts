import { MIN_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { boolProp, numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

export const AMMETER_DEFAULTS = { resistance: 0.1, ideal: false };

/** Ampermetre. Pinler: [0] = + uç (akım girer), [1] = − uç. Gösterge: + uçtan giren akım. */
export class AmmeterDevice extends Device {
  readonly type = 'ammeter';
  readonly resistance: number;
  readonly ideal: boolean;

  constructor(init: DeviceInit) {
    super(init);
    this.resistance = Math.max(MIN_RESISTANCE, numProp(init.props, 'resistance', AMMETER_DEFAULTS.resistance));
    this.ideal = boolProp(init.props, 'ideal', AMMETER_DEFAULTS.ideal);
  }

  private get branch(): number {
    return this.branches[0]!;
  }

  /**
   * İdeal (0 Ω) ampermetre 0 V'luk bir gerilim kaynağıdır (+ uç a, − uç b, ek satır k):
   *   A[a][k] += 1, A[k][a] += 1, A[b][k] −= 1, A[k][b] −= 1, z[k] = 0
   * ve akımı doğrudan x[k]'dan okunur.
   * Gerçek ampermetre, uçları arasında iç direnci kadar bir dirençtir: G = 1/R_iç.
   * Bu durumda ayrılmış akım satırı kullanılmaz: A[k][k] = 1, z[k] = 0 (x[k] = 0).
   */
  override stampStatic(sys: MnaSystem): void {
    if (this.ideal) {
      sys.voltageSource(this.nodes[0]!, this.nodes[1]!, this.branch, 0);
    } else {
      sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.resistance);
      sys.add(this.branch, this.branch, 1);
    }
  }

  override idealVoltageBranches(): Array<readonly [number, number]> {
    return this.ideal ? [[this.nodes[0]!, this.nodes[1]!]] : [];
  }

  /** Ampermetrenin gösterdiği değer. */
  reading(x: Float64Array): number {
    if (this.ideal) return x[this.branch]!;
    return (this.v(x, 0) - this.v(x, 1)) / this.resistance;
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.reading(x));
  }
}

export const ammeterModel: DeviceModel = {
  type: 'ammeter',
  pinCount: 2,
  internalNodes: 0,
  // İdeal/gerçek geçişinde yapı değişmesin diye akım satırı her zaman ayrılır.
  branchCount: 1,
  create: (init) => new AmmeterDevice(init),
};
