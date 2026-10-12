import { MIN_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { boolProp, numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

export const VOLTMETER_DEFAULTS = { resistance: 10e6, ideal: false };

/** Voltmetre. Pinler: [0] = + uç, [1] = − uç. Gösterge: v(+) − v(−). */
export class VoltmeterDevice extends Device {
  readonly type = 'voltmeter';
  readonly resistance: number;
  readonly ideal: boolean;

  constructor(init: DeviceInit) {
    super(init);
    this.resistance = Math.max(MIN_RESISTANCE, numProp(init.props, 'resistance', VOLTMETER_DEFAULTS.resistance));
    this.ideal = boolProp(init.props, 'ideal', VOLTMETER_DEFAULTS.ideal);
  }

  /**
   * Gerçek voltmetre, uçları arasında iç direnci kadar bir dirençtir: G = 1/R_iç.
   * İdeal (∞) voltmetre devreden hiç akım çekmez; matrise hiçbir şey eklenmez.
   */
  override stampStatic(sys: MnaSystem): void {
    if (!this.ideal) sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.resistance);
  }

  /** Voltmetrenin gösterdiği değer. */
  reading(x: Float64Array): number {
    return this.v(x, 0) - this.v(x, 1);
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.reading(x);
    return this.twoTerminal(x, this.ideal ? 0 : voltage / this.resistance);
  }
}

export const voltmeterModel: DeviceModel = {
  type: 'voltmeter',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new VoltmeterDevice(init),
};
