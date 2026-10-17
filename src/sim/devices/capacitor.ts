import type { MnaSystem } from '../mna';
import { numProp, strProp } from '../netlist';
import { ELECTROLYTIC_MAX_REVERSE_VOLTAGE, WindowPeak } from '../ratings';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type Measurement, type RatingWarning, type StepContext } from './device';

/**
 * Kondansatörün türü: elektrolitik (kutuplu, sembolde +) ya da seramik/film (kutupsuz). Yeni
 * yerleştirilen kondansatör elektrolitiktir (varsayılan 100 µF, gerçekte bu değer elektrolitiktir);
 * türü olmayan eski kayıtlar kutupsuz sayılır: eskiden ters gerilim uyarısı yoktu, eski devreler
 * yeni uyarı vermesin.
 */
export const CAPACITOR_KINDS = ['electrolytic', 'film'] as const;
export type CapacitorKind = (typeof CAPACITOR_KINDS)[number];
export const CAPACITOR_DEFAULTS = { capacitance: 100e-6, initialVoltage: 0, kind: 'electrolytic' as CapacitorKind };
export const CAPACITOR_LEGACY_KIND: CapacitorKind = 'film';

/** Kondansatör. Pinler: [0] = + uç, [1] = − uç. */
export class CapacitorDevice extends Device {
  readonly type = 'capacitor';
  readonly capacitance: number;
  readonly kind: CapacitorKind;
  /** Elektrolitikte ters gerilimin (− ucun + uçtan yüksekliği) periyot içindeki tepesi. */
  private reverse = new WindowPeak();
  /** Bir önceki (kabul edilmiş) adımdaki gerilim v(n). */
  voltage: number;
  /** Son adımdaki akım i(n) (+ uçtan girip − uçtan çıkan); yamuk kuralı bunu da kullanır. */
  current = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.capacitance = Math.max(1e-15, numProp(init.props, 'capacitance', CAPACITOR_DEFAULTS.capacitance));
    this.voltage = numProp(init.props, 'initialVoltage', CAPACITOR_DEFAULTS.initialVoltage);
    this.kind = strProp(init.props, 'kind', CAPACITOR_KINDS, CAPACITOR_LEGACY_KIND);
  }

  override get reactive(): boolean {
    return true;
  }

  /** Doğru akımda (h = 0) açık devre; geçici çözümde geq = C/h iletkenliği. */
  override conductiveGroups(transient: boolean): ReadonlyArray<readonly number[]> {
    return transient ? [this.nodes] : [];
  }

  /**
   * Eşdeğer model (i = C·dv/dt):
   *   yamuk:      (i(n+1) + i(n))/2 = C·(v(n+1) − v(n))/h
   *               ⇒ i(n+1) = geq·v(n+1) − Ieq,  geq = 2C/h,  Ieq = geq·v(n) + i(n)
   *   geri Euler: i(n+1) = C·(v(n+1) − v(n))/h  ⇒ geq = C/h,  Ieq = geq·v(n)
   * geq, + ve − uçlar arasına iletkenlik olarak eklenir (bu kısım aynı h ve yöntem için sabittir).
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h > 0) sys.conductance(this.nodes[0]!, this.nodes[1]!, chargeScale(ctx) * this.capacitance);
  }

  /** Ieq, kondansatörün + düğümüne giren bir akım kaynağı olarak eklenir. */
  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const ieq = chargeScale(ctx) * this.capacitance * this.voltage + (ctx.trap ? this.current : 0);
    sys.currentSource(this.nodes[1]!, this.nodes[0]!, ieq);
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const next = this.v(x, 0) - this.v(x, 1);
    this.current = ctx.h > 0 ? chargeScale(ctx) * this.capacitance * (next - this.voltage) - (ctx.trap ? this.current : 0) : 0;
    this.voltage = next;
    this.reverse.add(Math.max(0, -next), ctx.h, ctx.window);
  }

  /** Elektrolitik kondansatörde ters gerilim üreticinin izin verdiğini (1 V) aşıyorsa uyarı. */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    if (this.kind !== 'electrolytic') return [];
    const voltage = this.reverse.value(Math.max(0, this.v(x, 1) - this.v(x, 0)));
    return voltage > ELECTROLYTIC_MAX_REVERSE_VOLTAGE
      ? [{ code: 'capacitor-reverse', params: { voltage, limit: ELECTROLYTIC_MAX_REVERSE_VOLTAGE } }]
      : [];
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [[this.nodes[0]!, this.nodes[1]!]];
  }

  measure(): Measurement {
    return { voltage: this.voltage, current: this.current, power: this.voltage * this.current };
  }

  /** Kondansatörde depolanan enerji: E = ½·C·V². */
  energy(): number {
    return 0.5 * this.capacitance * this.voltage * this.voltage;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof CapacitorDevice) {
      this.voltage = prev.voltage;
      this.current = prev.current;
      this.reverse.adopt(prev.reverse);
    }
  }
}

export const capacitorModel: DeviceModel = {
  type: 'capacitor',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new CapacitorDevice(init),
};
