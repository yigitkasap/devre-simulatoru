import type { MnaSystem } from '../mna';
import { strProp } from '../netlist';
import { LED_MAX_REVERSE_VOLTAGE, WindowPeak } from '../ratings';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';
import { Junction, saturationCurrentFor } from './junction';

export const LED_COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type LedColor = (typeof LED_COLORS)[number];

export const LED_DEFAULTS = { color: 'red' as LedColor };

/** Nominal akım: veri sayfalarındaki ileri gerilim bu akımda verilir; parlaklık 1 bu akımdadır. */
export const LED_NOMINAL_CURRENT = 20e-3;

export interface LedModelParams {
  /** 20 mA'deki ileri gerilim (V), 5 mm LED veri sayfalarından. */
  readonly forwardVoltage: number;
  /** Mutlak en büyük sürekli akım (A); aşılırsa LED yanar. */
  readonly maxCurrent: number;
  /** Eklemin ideallik (emisyon) katsayısı N. */
  readonly emission: number;
  /** Seri direnç Rs (Ω). */
  readonly seriesResistance: number;
  /** Arayüzde kullanılan ışık rengi. */
  readonly lightColor: string;
}

// N, Is'yi çok küçültmeyecek şekilde 2-6 aralığında seçildi (Is ≈ 10⁻¹⁴ A mertebesi).
// Is, 20 mA'de veri sayfasındaki ileri gerilimi verecek şekilde hesaplanır:
//   Vf = Vj + I·Rs,  Is = I / (exp(Vj/(N·VT)) − 1)
export const LED_MODELS: Readonly<Record<LedColor, LedModelParams>> = {
  red: { forwardVoltage: 1.85, maxCurrent: 30e-3, emission: 2.6, seriesResistance: 2, lightColor: '#ff3b30' },
  yellow: { forwardVoltage: 2.1, maxCurrent: 30e-3, emission: 2.8, seriesResistance: 2.5, lightColor: '#ffc107' },
  green: { forwardVoltage: 2.2, maxCurrent: 25e-3, emission: 3.0, seriesResistance: 3, lightColor: '#34c759' },
  blue: { forwardVoltage: 3.3, maxCurrent: 30e-3, emission: 4.4, seriesResistance: 5, lightColor: '#2f7bff' },
};

export function ledSaturationCurrent(params: LedModelParams): number {
  const junctionVoltage = params.forwardVoltage - LED_NOMINAL_CURRENT * params.seriesResistance;
  return saturationCurrentFor(LED_NOMINAL_CURRENT, junctionVoltage, params.emission);
}

/** Göz algısı için gamma değeri. */
const BRIGHTNESS_GAMMA = 2.2;

/** Parlaklık: akım / 20 mA (en fazla 1), gamma düzeltmeli. */
export function ledBrightness(current: number): number {
  const linear = Math.min(1, Math.max(0, current / LED_NOMINAL_CURRENT));
  return linear ** (1 / BRIGHTNESS_GAMMA);
}

/**
 * LED. Pinler: [0] = anot, [1] = katot. İç yapı:
 *   anot ── Rs ── (iç düğüm) ── pn eklemi ── katot
 * Yanmış LED açık devredir: matrise hiçbir şey eklemez.
 */
export class LedDevice extends Device {
  readonly type = 'led';
  readonly color: LedColor;
  readonly params: LedModelParams;
  readonly junction: Junction;
  burned = false;
  burnCurrent = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.color = strProp(init.props, 'color', LED_COLORS, LED_DEFAULTS.color);
    this.params = LED_MODELS[this.color];
    this.junction = new Junction(ledSaturationCurrent(this.params), this.params.emission);
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
    return !this.burned;
  }

  /** Yanmış LED açık devredir (matrise hiçbir şey eklemez). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return this.burned ? [] : [this.nodes];
  }

  /** Seri direnç Rs: anot ile iç düğüm arasında G = 1/Rs iletkenliği. */
  override stampStatic(sys: MnaSystem): void {
    if (this.burned) return;
    sys.conductance(this.anode, this.inner, 1 / this.params.seriesResistance);
  }

  /**
   * Eklem, diyotla aynı biçimde (iç düğüm–katot arasında) gd iletkenliği ve
   * Ieq = Id − gd·Vd akım kaynağı olarak eklenir (ayrıntı: junction.ts).
   */
  override stampNonlinear(sys: MnaSystem): void {
    if (this.burned) return;
    this.junction.stamp(sys, this.inner, this.cathode);
  }

  override updateIterate(x: Float64Array): boolean {
    if (this.burned) return true;
    return this.junction.update(this.v(x, 2) - this.v(x, 1));
  }

  override restoreIterate(): void {
    this.junction.restore();
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.junction.accept();
    this.reverse.add(this.reverseVoltage(x), ctx.h, ctx.window);
  }

  /** Ters gerilimin periyot içindeki tepesi. */
  private reverse = new WindowPeak();

  /** Ters gerilim (katot − anot; ileri kutuplamada 0). */
  private reverseVoltage(x: Float64Array): number {
    return Math.max(0, this.v(x, 1) - this.v(x, 0));
  }

  /** Ters gerilim veri sayfasındaki 5 V'u aşarsa uyarı (yalnızca uyarı: bozulma modellenmez). */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const voltage = this.reverse.value(this.reverseVoltage(x));
    return voltage > LED_MAX_REVERSE_VOLTAGE ? [{ code: 'reverse-voltage', params: { voltage, limit: LED_MAX_REVERSE_VOLTAGE } }] : [];
  }

  private currentAt(x: Float64Array): number {
    if (this.burned) return 0;
    return (this.v(x, 0) - this.v(x, 2)) / this.params.seriesResistance;
  }

  override checkLimits(x: Float64Array): boolean {
    if (this.burned) return false;
    const current = this.currentAt(x);
    if (current > this.params.maxCurrent) {
      this.burned = true;
      this.burnCurrent = current;
      return true;
    }
    return false;
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.currentAt(x));
  }

  override status(x: Float64Array): DeviceStatus {
    if (this.burned) return { burned: true, burnCurrent: this.burnCurrent, brightness: 0 };
    const current = this.currentAt(x);
    return {
      burned: false,
      overCurrent: current > LED_NOMINAL_CURRENT,
      brightness: ledBrightness(current),
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof LedDevice) {
      this.burned = prev.burned;
      this.burnCurrent = prev.burnCurrent;
      this.reverse.adopt(prev.reverse);
      if (prev.color === this.color) this.junction.copyStateFrom(prev.junction);
    }
  }

  override repair(): boolean {
    if (!this.burned) return false;
    this.burned = false;
    this.burnCurrent = 0;
    return true;
  }
}

export const ledModel: DeviceModel = {
  type: 'led',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new LedDevice(init),
};
