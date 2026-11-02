import type { MnaSystem } from '../mna';
import { nodeVoltage } from '../mna';
import type { StepContext } from './device';
import { type ChargeParams, Junction } from './junction';

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
    /** Eklem kapasitesi (yoksa eklem anlık davranır). */
    charge: ChargeParams | null = null,
  ) {
    this.junction = new Junction(saturationCurrent, emission, charge);
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

  /** Kapasiteli eklemde zaman adımının denetlediği durum: eklem gerilimi (iç düğüm − katot). */
  lteState(): readonly [number, number] | null {
    return this.junction.charge ? [this.inner, this.cathode] : null;
  }

  /** Anottan girip katottan çıkan akım (kapasitif akım dahil). */
  current(x: Float64Array): number {
    return (nodeVoltage(x, this.anode) - nodeVoltage(x, this.inner)) / this.resistance;
  }

  /** Uçlar arası gerilim (anot − katot). */
  voltage(x: Float64Array): number {
    return nodeVoltage(x, this.anode) - nodeVoltage(x, this.cathode);
  }
}
