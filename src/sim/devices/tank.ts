import type { MnaSystem } from '../mna';
import { numProp, strProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

/**
 * Su haznesi (baraj) ve seviye probları. Pinler: [0] = ortak prob (dipte), [1] = Seviye 1,
 * [2] = Seviye 2, [3] = Seviye 3 probu.
 *
 * Su, ıslak probları birbirine bağlayan bir iletkendir: her prob suya (iç düğüm) R_su / 2 ile
 * bağlanır, böylece iki ıslak prob arasındaki direnç R_su olur (musluk suyunda birkaç cm aralıklı
 * problar için birkaç kΩ; varsayılan 5 kΩ). Kuru prob açık devredir. Su yüzeyi probun ucunu ±%1'lik
 * bir aralıkta yavaşça ıslatır (menisküs): iletkenlik birden atlamaz, Newton-Raphson zorlanmaz.
 *
 * Seviye (yüzde) Doldur / Boşalt kipinde simülasyon zamanıyla değişir: 0'dan 100'e "dolma
 * süresi"nde. Durdur'da (simülasyon başa dönünce) başlangıç seviyesine döner (kondansatörlerin
 * başlangıç gerilimi gibi). Prob yükseklikleri, uçların sembolde durduğu yüksekliklerdir.
 */
export const TANK_MODES = ['stop', 'fill', 'drain'] as const;
export type TankMode = (typeof TANK_MODES)[number];

export const TANK_DEFAULTS = {
  /** Başlangıç seviyesi (%). */
  level: 0,
  mode: 'stop' as TankMode,
  /** Boştan doluya geçen süre (s). */
  fillTime: 20,
  /** İki ıslak prob arasındaki suyun direnci (Ω). */
  waterResistance: 5e3,
};

export const TANK_LIMITS = { minFillTime: 1, maxFillTime: 600, minWaterResistance: 10, maxWaterResistance: 10e6 };

/** Probların ucunun yüksekliği (%): ortak prob, Seviye 1, 2, 3. */
export const TANK_PROBE_HEIGHTS = [12.5, 37.5, 62.5, 87.5] as const;

/** Su yüzeyinin probu ıslattığı aralığın genişliği (%). */
const WET_BAND = 2;

export function tankSettings(props: Props) {
  const d = TANK_DEFAULTS;
  return {
    level: Math.min(100, Math.max(0, numProp(props, 'level', d.level))),
    mode: strProp(props, 'mode', TANK_MODES, d.mode),
    fillTime: Math.min(TANK_LIMITS.maxFillTime, Math.max(TANK_LIMITS.minFillTime, numProp(props, 'fillTime', d.fillTime))),
    waterResistance: Math.max(TANK_LIMITS.minWaterResistance, numProp(props, 'waterResistance', d.waterResistance)),
  };
}

export type TankSettings = ReturnType<typeof tankSettings>;

/** Probun ıslaklığı (0 kuru … 1 ıslak): yüzey ucun ±%1 çevresindeyken yumuşak geçiş. */
export function probeWetness(level: number, height: number): number {
  const t = Math.min(1, Math.max(0, (level - height) / WET_BAND + 0.5));
  return t * t * (3 - 2 * t);
}

export class TankDevice extends Device {
  readonly type = 'tank';
  readonly settings: TankSettings;
  /** Son kabul edilen adımdaki seviye (%). */
  level: number;

  constructor(init: DeviceInit) {
    super(init);
    this.settings = tankSettings(init.props);
    this.level = this.settings.level;
  }

  /** Seviyenin değişim hızı (%/s); Durdur kipinde 0. */
  private get rate(): number {
    const { mode, fillTime } = this.settings;
    return mode === 'fill' ? 100 / fillTime : mode === 'drain' ? -100 / fillTime : 0;
  }

  /** Seviye zamanla değişirken devre adım adım çözülür. */
  override get timeVarying(): boolean {
    return this.rate !== 0;
  }

  /** İletkenlik seviyeye bağlı ve zamanla değiştiği için her iterasyonda yeniden eklenir. */
  override get nonlinear(): boolean {
    return true;
  }

  private levelAfter(h: number): number {
    return Math.min(100, Math.max(0, this.level + this.rate * h));
  }

  /** Her probun suya iletkenliği (S) verilen seviyede. */
  private conductances(level: number): number[] {
    const g = 2 / this.settings.waterResistance;
    return TANK_PROBE_HEIGHTS.map((height) => g * probeWetness(level, height));
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    const water = this.nodes[4]!;
    this.conductances(this.levelAfter(ctx.h)).forEach((g, k) => {
      if (g > 0) sys.conductance(this.nodes[k]!, water, g);
    });
  }

  override accept(_x: Float64Array, ctx: StepContext): void {
    this.level = this.levelAfter(ctx.h);
  }

  /** Uçlara giren akımlar: ıslak probdan suya akan akım. */
  override pinCurrents(x: Float64Array): number[] {
    const water = this.v(x, 4);
    return this.conductances(this.level).map((g, k) => g * (this.v(x, k) - water));
  }

  /** Ölçüm: Seviye 1 probu ile ortak prob arasındaki gerilim; ortak probun akımı. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 1) - this.v(x, 0);
    const current = this.pinCurrents(x)[0]!;
    return { voltage, current, power: 0 };
  }

  override status(): DeviceStatus {
    return { level: this.level, wetProbes: TANK_PROBE_HEIGHTS.map((h) => probeWetness(this.level, h) > 0.5) };
  }

  /**
   * Değer değişince (ör. kip ya da dolma süresi) seviye kaldığı yerden sürer; başlangıç seviyesi
   * değiştiyse (kaydırıcı) yeni değer geçerlidir.
   */
  override adoptState(prev: Device): void {
    if (prev instanceof TankDevice && prev.settings.level === this.settings.level) this.level = prev.level;
  }
}

export const tankModel: DeviceModel = {
  type: 'tank',
  pinCount: 4,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new TankDevice(init),
};
