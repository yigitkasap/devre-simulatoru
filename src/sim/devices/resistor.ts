import { WindowAverager } from '../averager';
import { MIN_RESISTANCE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp, strProp } from '../netlist';
import { DEFAULT_RESISTOR_POWER, RESISTOR_POWER_RATINGS } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';

/** Varsayılan güç sınırı 1/4 W; eski kayıtlı devreler de bunu kullanır. */
export const RESISTOR_DEFAULTS = { resistance: 1000, powerRating: DEFAULT_RESISTOR_POWER as string };

export class ResistorDevice extends Device {
  readonly type = 'resistor';
  readonly resistance: number;
  /** Güç sınırı (W). */
  readonly powerRating: number;
  /** Harcanan güç P = V²/R; AC devrede bir periyodun ortalaması (ısınma ortalama güçle olur). */
  private power = new WindowAverager();

  constructor(init: DeviceInit) {
    super(init);
    this.resistance = Math.max(MIN_RESISTANCE, numProp(init.props, 'resistance', RESISTOR_DEFAULTS.resistance));
    this.powerRating = Number(strProp(init.props, 'powerRating', RESISTOR_POWER_RATINGS, DEFAULT_RESISTOR_POWER));
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

  private instantaneousPower(x: Float64Array): number {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return (voltage * voltage) / this.resistance;
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.power.add(this.instantaneousPower(x), ctx.h, ctx.window);
  }

  /** Harcanan güç: AC devrede son periyodun ortalaması, değilse anlık. */
  averagePower(x: Float64Array): number {
    return this.power.reading('dc', this.instantaneousPower(x));
  }

  override status(x: Float64Array): DeviceStatus {
    return { powerRatio: this.averagePower(x) / this.powerRating };
  }

  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const power = this.averagePower(x);
    return power > this.powerRating ? [{ code: 'resistor-overpower', params: { power, rating: this.powerRating } }] : [];
  }

  override adoptState(prev: Device): void {
    if (prev instanceof ResistorDevice) this.power.adopt(prev.power);
  }
}

export const resistorModel: DeviceModel = {
  type: 'resistor',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new ResistorDevice(init),
};
