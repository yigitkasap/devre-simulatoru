import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type StepContext } from './device';

export const CAPACITOR_DEFAULTS = { capacitance: 100e-6, initialVoltage: 0 };

/** Kondansatör. Pinler: [0] = + uç, [1] = − uç. */
export class CapacitorDevice extends Device {
  readonly type = 'capacitor';
  readonly capacitance: number;
  /** Bir önceki (kabul edilmiş) adımdaki gerilim v(n). */
  voltage: number;
  /** Son adımdaki akım (+ uçtan girip − uçtan çıkan). */
  current = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.capacitance = Math.max(1e-15, numProp(init.props, 'capacitance', CAPACITOR_DEFAULTS.capacitance));
    this.voltage = numProp(init.props, 'initialVoltage', CAPACITOR_DEFAULTS.initialVoltage);
  }

  override get reactive(): boolean {
    return true;
  }

  /** Doğru akımda (h = 0) açık devre; geçici çözümde geq = C/h iletkenliği. */
  override conductiveGroups(transient: boolean): ReadonlyArray<readonly number[]> {
    return transient ? [this.nodes] : [];
  }

  /**
   * Geri Euler eşdeğer modeli: i = C·dv/dt ≈ C·(v(n+1) − v(n))/h
   *   ⇒ i = geq·v(n+1) − Ieq,  geq = C/h,  Ieq = geq·v(n)
   * geq, + ve − uçlar arasına iletkenlik olarak eklenir (bu kısım aynı h için sabittir).
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h > 0) sys.conductance(this.nodes[0]!, this.nodes[1]!, this.capacitance / ctx.h);
  }

  /** Ieq = geq·v(n), kondansatörün + düğümüne giren bir akım kaynağı olarak eklenir. */
  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const ieq = (this.capacitance / ctx.h) * this.voltage;
    sys.currentSource(this.nodes[1]!, this.nodes[0]!, ieq);
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const next = this.v(x, 0) - this.v(x, 1);
    this.current = ctx.h > 0 ? (this.capacitance / ctx.h) * (next - this.voltage) : 0;
    this.voltage = next;
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
