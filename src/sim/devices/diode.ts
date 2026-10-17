import { THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { strProp } from '../netlist';
import { DIODE_1N4001_VRRM, WindowPeak } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type RatingWarning, type StepContext } from './device';
import { Junction, saturationCurrentFor, type ChargeParams } from './junction';

// Genel amaçlı silisyum diyot (eski model; "model" özelliği olmayan kayıtlı devreler). Is ve N,
// iki noktadan bulunur:
//   1 mA'de 0,60 V ve 20 mA'de 0,70 V
//   ⇒ N·VT = (0,70 − 0,60) / ln(20) ≈ 33,4 mV  ⇒  N ≈ 1,29
//   ⇒ Is = 1 mA / (exp(0,60/(N·VT)) − 1) ≈ 1,6·10⁻¹¹ A
// Ters kırılma modellenmez; ters yönde yalnızca ≈ Is kadar sızıntı akımı akar.
const DIODE_NVT = (0.7 - 0.6) / Math.log(20);
export const DIODE_EMISSION = DIODE_NVT / THERMAL_VOLTAGE;
export const DIODE_SATURATION = saturationCurrentFor(1e-3, 0.6, DIODE_EMISSION);

// 1N4001 (1 A, 50 V doğrultucu diyot; föydeki diyot).
//   Ileri gerilim, Vishay 1N4001 veri sayfasının (88503) tipik eğrisinden: 10 mA'de ≈ 0,60 V,
//   100 mA'de ≈ 0,72 V  ⇒  N·VT = 0,12 / ln(10) ≈ 52 mV (N ≈ 2,0), Is ≈ 1,0·10⁻⁷ A.
//   Seri direnç (≈ 0,05 Ω) ihmal edildi: föy devrelerinde akım 10 mA'i geçmez (0,1 A'de fark ≈ 5 mV).
//   Eklem kapasitesi, aynı veri sayfasının tipik eğrisine uydurulmuştur: 0 V'ta ≈ 30 pF,
//   4 V'ta ≈ 14 pF, 10 V'ta ≈ 10 pF (VJ = 0,4 V, M = 0,33).
//   Geçiş süresi τ_T = 5,76 µs (LTspice'ın standart 1N4001 kartı; veri sayfasında t_rr verilmez):
//   ileri akımla depolanan yük, diyot ters kutuplanınca bir süre ters akım akıtır. Frekans
//   arttıkça X-Y eğrisi ilmek açar; 1 MHz'te diyot neredeyse iki yönde de iletir.
const N4001_NVT = (0.72 - 0.6) / Math.log(10);
const N4001_EMISSION = N4001_NVT / THERMAL_VOLTAGE;

export const DIODE_MODELS = ['1N4001', 'genel'] as const;
export type DiodeModelName = (typeof DIODE_MODELS)[number];

export interface DiodeModelParams {
  readonly saturationCurrent: number;
  readonly emission: number;
  readonly charge: ChargeParams | null;
}

export const DIODE_MODEL_PARAMS: Readonly<Record<DiodeModelName, DiodeModelParams>> = {
  '1N4001': {
    saturationCurrent: saturationCurrentFor(10e-3, 0.6, N4001_EMISSION),
    emission: N4001_EMISSION,
    charge: { cj0: 30e-12, vj: 0.4, m: 0.33, tt: 5.76e-6 },
  },
  genel: { saturationCurrent: DIODE_SATURATION, emission: DIODE_EMISSION, charge: null },
};

/** Yeni yerleştirilen diyot föydeki 1N4001'dir; "model" özelliği olmayan eski kayıtlar genel modeldir. */
export const DIODE_DEFAULTS = { model: '1N4001' as DiodeModelName };
export const DIODE_LEGACY_MODEL: DiodeModelName = 'genel';

export function diodeModelOf(props: DeviceInit['props']): DiodeModelName {
  return strProp(props, 'model', DIODE_MODELS, DIODE_LEGACY_MODEL);
}

/** Diyot. Pinler: [0] = anot, [1] = katot. */
export class DiodeDevice extends Device {
  readonly type = 'diode';
  readonly model: DiodeModelName;
  readonly junction: Junction;

  constructor(init: DeviceInit) {
    super(init);
    this.model = diodeModelOf(init.props);
    const p = DIODE_MODEL_PARAMS[this.model];
    this.junction = new Junction(p.saturationCurrent, p.emission, p.charge);
  }

  override get nonlinear(): boolean {
    return true;
  }

  /**
   * Diyot, Newton-Raphson'un her iterasyonunda bir iletkenlik gd ile ona paralel bir akım
   * kaynağı Ieq = Id − gd·Vd olarak eklenir (ayrıntı: junction.ts → Junction.stamp). Yük
   * modelinde zaman adımı boyunca depolanan yükün akımı da eklenir.
   */
  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.junction.stamp(sys, this.nodes[0]!, this.nodes[1]!, ctx);
  }

  override updateIterate(x: Float64Array): boolean {
    return this.junction.update(this.v(x, 0) - this.v(x, 1));
  }

  override restoreIterate(): void {
    this.junction.restore();
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.junction.accept(ctx);
    this.reverse.add(Math.max(0, this.v(x, 1) - this.v(x, 0)), ctx.h, ctx.window);
  }

  /** Ters gerilimin periyot içindeki tepesi (katot − anot). */
  private reverse = new WindowPeak();

  /**
   * 1N4001'de ters gerilim VRRM'yi (50 V) aşarsa uyarı. Genel (basit) modelin bir veri sayfası
   * yoktur: sınırı da yoktur.
   */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    if (this.model !== '1N4001') return [];
    const voltage = this.reverse.value(Math.max(0, this.v(x, 1) - this.v(x, 0)));
    return voltage > DIODE_1N4001_VRRM ? [{ code: 'reverse-voltage', params: { voltage, limit: DIODE_1N4001_VRRM } }] : [];
  }

  /** Yük modeli olan diyotta eklem gerilimi (yük onunla birlikte süreklidir). */
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return this.junction.charge ? [[this.nodes[0]!, this.nodes[1]!]] : [];
  }

  /** Akım: eklem akımı ile (yük modelinde) kapasitif ve ters toparlanma akımının toplamı. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return this.twoTerminal(x, this.junction.current(voltage) + this.junction.chargeCurrent);
  }

  override adoptState(prev: Device): void {
    if (prev instanceof DiodeDevice && prev.model === this.model) {
      this.junction.copyStateFrom(prev.junction);
      this.reverse.adopt(prev.reverse);
    }
  }
}

export const diodeModel: DeviceModel = {
  type: 'diode',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new DiodeDevice(init),
};
