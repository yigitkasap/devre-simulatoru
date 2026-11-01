import type { MnaSystem } from '../mna';
import { nodeVoltage } from '../mna';
import type { StepContext } from './device';
import { Junction } from './junction';

/**
 * Seri dirençli eklem (SPICE diyodunun RS'si): anot → RS → iç düğüm → eklem → katot. Yüksek akımda
 * ileri gerilim RS·I kadar artar. Schottky (1N5819) ve köprü diyotun (KBP307) her diyodu.
 */
export class SeriesJunction {
  readonly junction: Junction;

  constructor(
    saturationCurrent: number,
    emission: number,
    readonly resistance: number,
    /** Düğümler: anot, iç düğüm, katot (bilinmeyen indeksi; −1 = toprak). */
    readonly anode: number,
    readonly inner: number,
    readonly cathode: number,
  ) {
    this.junction = new Junction(saturationCurrent, emission);
  }

  stampStatic(sys: MnaSystem): void {
    sys.conductance(this.anode, this.inner, 1 / this.resistance);
  }

  stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.junction.stamp(sys, this.inner, this.cathode, ctx);
  }

  update(x: Float64Array): boolean {
    return this.junction.update(nodeVoltage(x, this.inner) - nodeVoltage(x, this.cathode));
  }

  /** Anottan girip katottan çıkan akım. */
  current(x: Float64Array): number {
    return (nodeVoltage(x, this.anode) - nodeVoltage(x, this.inner)) / this.resistance;
  }

  /** Uçlar arası gerilim (anot − katot). */
  voltage(x: Float64Array): number {
    return nodeVoltage(x, this.anode) - nodeVoltage(x, this.cathode);
  }
}
