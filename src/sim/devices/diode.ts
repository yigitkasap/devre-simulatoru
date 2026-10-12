import { THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type Measurement } from './device';
import { Junction, saturationCurrentFor } from './junction';

// Genel amaçlı silisyum diyot. Is ve N, iki noktadan bulunur:
//   1 mA'de 0,60 V ve 20 mA'de 0,70 V
//   ⇒ N·VT = (0,70 − 0,60) / ln(20) ≈ 33,4 mV  ⇒  N ≈ 1,29
//   ⇒ Is = 1 mA / (exp(0,60/(N·VT)) − 1) ≈ 1,6·10⁻¹¹ A
// Ters kırılma v1'de modellenmez; ters yönde yalnızca ≈ Is kadar sızıntı akımı akar.
const DIODE_NVT = (0.7 - 0.6) / Math.log(20);
export const DIODE_EMISSION = DIODE_NVT / THERMAL_VOLTAGE;
export const DIODE_SATURATION = saturationCurrentFor(1e-3, 0.6, DIODE_EMISSION);

/** Diyot. Pinler: [0] = anot, [1] = katot. */
export class DiodeDevice extends Device {
  readonly type = 'diode';
  readonly junction = new Junction(DIODE_SATURATION, DIODE_EMISSION);

  constructor(init: DeviceInit) {
    super(init);
  }

  override get nonlinear(): boolean {
    return true;
  }

  /**
   * Diyot, Newton-Raphson'un her iterasyonunda bir iletkenlik gd ile ona paralel bir akım
   * kaynağı Ieq = Id − gd·Vd olarak eklenir (ayrıntı: junction.ts → Junction.stamp).
   */
  override stampNonlinear(sys: MnaSystem): void {
    this.junction.stamp(sys, this.nodes[0]!, this.nodes[1]!);
  }

  override updateIterate(x: Float64Array): boolean {
    return this.junction.update(this.v(x, 0) - this.v(x, 1));
  }

  override restoreIterate(): void {
    this.junction.restore();
  }

  override accept(): void {
    this.junction.accept();
  }

  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return this.twoTerminal(x, this.junction.current(voltage));
  }

  override adoptState(prev: Device): void {
    if (prev instanceof DiodeDevice) this.junction.copyStateFrom(prev.junction);
  }
}

export const diodeModel: DeviceModel = {
  type: 'diode',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new DiodeDevice(init),
};
