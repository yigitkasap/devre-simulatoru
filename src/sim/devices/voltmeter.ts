import { METER_MODES, WindowAverager, type MeterMode } from '../averager';
import { MIN_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { boolProp, numProp, strProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

export const VOLTMETER_DEFAULTS = { mode: 'dc' as MeterMode, resistance: 10e6, ideal: false };

/**
 * Voltmetre. Pinler: [0] = + uç, [1] = − uç. Anlık değer: v(+) − v(−).
 * Gösterge, AC kaynaklı devrede bir periyot üzerinden DC kipinde ortalamayı, AC kipinde etkin
 * değeri gösterir; AC kaynak yoksa anlık değeri (AC kipinde büyüklüğünü).
 */
export class VoltmeterDevice extends Device {
  readonly type = 'voltmeter';
  readonly resistance: number;
  readonly ideal: boolean;
  readonly mode: MeterMode;
  private averager = new WindowAverager();

  constructor(init: DeviceInit) {
    super(init);
    this.resistance = Math.max(MIN_RESISTANCE, numProp(init.props, 'resistance', VOLTMETER_DEFAULTS.resistance));
    this.ideal = boolProp(init.props, 'ideal', VOLTMETER_DEFAULTS.ideal);
    this.mode = strProp(init.props, 'mode', METER_MODES, VOLTMETER_DEFAULTS.mode);
  }

  /**
   * Gerçek voltmetre, uçları arasında iç direnci kadar bir dirençtir: G = 1/R_iç.
   * İdeal (∞) voltmetre devreden hiç akım çekmez; matrise hiçbir şey eklenmez.
   */
  override stampStatic(sys: MnaSystem): void {
    if (!this.ideal) sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.resistance);
  }

  /** Uçları arasındaki anlık gerilim. */
  instantaneous(x: Float64Array): number {
    return this.v(x, 0) - this.v(x, 1);
  }

  /** Voltmetrenin gösterdiği değer (kipine göre). */
  reading(x: Float64Array): number {
    return this.averager.reading(this.mode, this.instantaneous(x));
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.averager.add(this.instantaneous(x), ctx.h, ctx.window);
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.instantaneous(x);
    return this.twoTerminal(x, this.ideal ? 0 : voltage / this.resistance);
  }

  override status(x: Float64Array): DeviceStatus {
    return { reading: this.reading(x) };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof VoltmeterDevice && prev.mode === this.mode) this.averager.adopt(prev.averager);
  }
}

export const voltmeterModel: DeviceModel = {
  type: 'voltmeter',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  // İdeal voltmetre akım çekmez, matrise hiçbir şey eklemez.
  couplingPins: (props) => (boolProp(props, 'ideal', VOLTMETER_DEFAULTS.ideal) ? [] : [[0, 1]]),
  create: (init) => new VoltmeterDevice(init),
};
