import { SWITCH_ON_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { boolProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

export const SWITCH_DEFAULTS = { closed: false };

/** Tek kutuplu anahtar. Pinler: [0], [1]. */
export class SwitchDevice extends Device {
  readonly type = 'switch';
  readonly closed: boolean;

  constructor(init: DeviceInit) {
    super(init);
    this.closed = boolProp(init.props, 'closed', SWITCH_DEFAULTS.closed);
  }

  /**
   * Kapalı anahtar 1 mΩ'luk bir dirençtir: G = 1/1 mΩ = 1000 S iletkenliği eklenir.
   * Açık anahtar açık devredir; matrise hiçbir şey eklenmez.
   */
  override stampStatic(sys: MnaSystem): void {
    if (this.closed) sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / SWITCH_ON_RESISTANCE);
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return this.twoTerminal(x, this.closed ? voltage / SWITCH_ON_RESISTANCE : 0);
  }
}

export const switchModel: DeviceModel = {
  type: 'switch',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  // Açık anahtar matrise hiçbir şey eklemez: iki ucu ayrı adalarda olabilir.
  couplingPins: (props) => (boolProp(props, 'closed', SWITCH_DEFAULTS.closed) ? [[0, 1]] : []),
  create: (init) => new SwitchDevice(init),
};
