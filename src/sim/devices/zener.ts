import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { DIODE_EMISSION, DIODE_SATURATION } from './diode';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement } from './device';
import { Junction, saturationCurrentFor } from './junction';
import { THERMAL_VOLTAGE } from '../constants';

/**
 * Zener diyot (1N4733A benzeri, V_Z = 5,1 V). Pinler: [0] = anot, [1] = katot. İç yapı:
 *   anot ── R_Z ── (iç düğüm) ──┬── ileri eklem (genel amaçlı diyot) ──┬── katot
 *                               └── kırılma eklemi (ters yönde) ───────┘
 * Kırılma eklemi, katottan iç düğüme doğru iletimde olan ayrı bir eklemdir. Üssü,
 * V_Z / (N_Z·VT) = 40 olacak biçimde seçilir (düşük gerilimli zenerlerin yumuşak dizi); Is'i,
 * 20 mA ters akımda uçlar arası gerilim tam V_Z olacak biçimde hesaplanır (LED'lerdeki gibi
 * 20 mA kuralı). R_Z = 1 Ω; 20 mA'deki dinamik direnç ≈ V_Z / (40 · 20 mA) + 1 Ω ≈ 7 Ω
 * (veri sayfası: Z_ZT ≤ 7 Ω).
 */
export const ZENER_DEFAULTS = { zenerVoltage: 5.1 };
export const ZENER_TEST_CURRENT = 20e-3;
const ZENER_SERIES_RESISTANCE = 1;
const BREAKDOWN_EXPONENT = 40;

export class ZenerDevice extends Device {
  readonly type = 'zener';
  readonly zenerVoltage: number;
  readonly forward = new Junction(DIODE_SATURATION, DIODE_EMISSION);
  readonly breakdown: Junction;

  constructor(init: DeviceInit) {
    super(init);
    this.zenerVoltage = Math.max(0.5, Math.abs(numProp(init.props, 'zenerVoltage', ZENER_DEFAULTS.zenerVoltage)));
    const emission = this.zenerVoltage / (BREAKDOWN_EXPONENT * THERMAL_VOLTAGE);
    const junctionVoltage = this.zenerVoltage - ZENER_TEST_CURRENT * ZENER_SERIES_RESISTANCE;
    this.breakdown = new Junction(saturationCurrentFor(ZENER_TEST_CURRENT, junctionVoltage, emission), emission);
  }

  private get anode(): number {
    return this.nodes[0]!;
  }
  private get cathode(): number {
    return this.nodes[1]!;
  }
  private get inner(): number {
    return this.nodes[2]!;
  }

  override get nonlinear(): boolean {
    return true;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.anode, this.inner, 1 / ZENER_SERIES_RESISTANCE);
  }

  override stampNonlinear(sys: MnaSystem): void {
    this.forward.stamp(sys, this.inner, this.cathode);
    this.breakdown.stamp(sys, this.cathode, this.inner);
  }

  override updateIterate(x: Float64Array): boolean {
    const vj = this.v(x, 2) - this.v(x, 1);
    const forward = this.forward.update(vj);
    const breakdown = this.breakdown.update(-vj);
    return forward && breakdown;
  }

  override restoreIterate(): void {
    this.forward.restore();
    this.breakdown.restore();
  }

  override accept(): void {
    this.forward.accept();
    this.breakdown.accept();
  }

  /** Anottan katoda akan akım (kırılmada negatif). */
  private currentAt(x: Float64Array): number {
    return (this.v(x, 0) - this.v(x, 2)) / ZENER_SERIES_RESISTANCE;
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.currentAt(x));
  }

  /** Ters yönde 1 mA'den fazla akım geçiyorsa kırılma (zener) bölgesindedir. */
  override status(x: Float64Array): DeviceStatus {
    return { breakdown: this.currentAt(x) < -1e-3 };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof ZenerDevice) {
      this.forward.copyStateFrom(prev.forward);
      if (prev.zenerVoltage === this.zenerVoltage) this.breakdown.copyStateFrom(prev.breakdown);
    }
  }
}

export const zenerModel: DeviceModel = {
  type: 'zener',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new ZenerDevice(init),
};
