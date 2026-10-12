import { MIN_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';

export const RESISTOR_DEFAULTS = { resistance: 1000 };

export class ResistorDevice extends Device {
  readonly type = 'resistor';
  readonly resistance: number;

  constructor(init: DeviceInit) {
    super(init);
    this.resistance = Math.max(MIN_RESISTANCE, numProp(init.props, 'resistance', RESISTOR_DEFAULTS.resistance));
  }

  /**
   * Direnç (a–b), Ohm yasası I = (va − vb)/R. İletkenlik G = 1/R:
   *   A[a][a] += G, A[b][b] += G, A[a][b] −= G, A[b][a] −= G
   */
  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.resistance);
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return this.twoTerminal(x, voltage / this.resistance);
  }
}

export const resistorModel: DeviceModel = {
  type: 'resistor',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new ResistorDevice(init),
};
