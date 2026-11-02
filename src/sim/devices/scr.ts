import type { MnaSystem } from '../mna';
import { nodeVoltage } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';
import { Junction } from './junction';
import { SeriesJunction } from './seriesJunction';

// MCR100-6 tristör (SCR; onsemi "MCR100 Series" MCR100/D Rev. 10, Şubat 2010; 400 V, 0,8 A, TO-92).
// onsemi SPICE modeli yok. Pinler: [0] = A (anot), [1] = K (katot), [2] = G (kapı).
//
// Tetikleme ve kesme (tablo, s. 2, 25 °C, tipik): kapı akımı IGT = 40 µA'i (VAK = 7 V, RL = 100 Ω)
// aşınca iletime geçer; kapı akımı kesilince anot akımı kilitleme akımı IL = 0,6 mA'in üstündeyse
// iletimde kalır (kilitlenir), sonra anot akımı tutma akımı IH = 0,5 mA'in altına inince keser.
//
// İletim gerilimi: kullanıcı kararı (2026-11-02) Şekil 6 "Typical On-State Characteristics" 25 °C
// eğrisine (eğrinin etiketi "MAXIMUM @ TJ = 25 °C"; eğriden okunur, yaklaşık) en küçük kareler:
//   0,1 A 0,92 V · 0,5 A 1,01 V · 1 A 1,12 V · 2 A 1,33 V · 5 A 1,89 V · 9,5 A 2,60 V
//   ⇒ IS = 3,81·10⁻¹² A, N = 1,43, RS = 0,164 Ω (fark ≤ 0,04 V). Eğri 0,1 A'den başlar; altı aynı
//   üstel eğrinin uzantısıdır (10 mA'de ≈ 0,80 V). Tablo: 1 A'de en çok 1,7 V.
// Kapı–katot: kullanıcı kararı, ideal silisyum eklemi (N = 1; varsayım), tablodaki tipik tetikleme
// noktasından geçer: 40 µA'de VGT = 0,62 V ⇒ IS = 1,54·10⁻¹⁵ A.
// Kesimde anot–katot açık devredir (IDRM en çok 10 µA, modellenmez).
export const SCR_ON_IS = 3.80878e-12;
export const SCR_ON_N = 1.43188;
export const SCR_ON_RS = 0.164222;
export const SCR_GATE_IS = 1.53645e-15;
export const SCR_IGT = 40e-6;
export const SCR_IL = 0.6e-3;
export const SCR_IH = 0.5e-3;
export const SCR_MODELS = ['MCR100-6'] as const;
export const SCR_DEFAULTS = { model: 'MCR100-6' as (typeof SCR_MODELS)[number] };

/** Tristör. İç düğüm: iletimdeki eklemin RS'si ile eklemi arası. */
export class ScrDevice extends Device {
  readonly type = 'scr';
  readonly main: SeriesJunction;
  readonly gate: Junction;
  /** İletimde mi; kilitlendi mi (anot akımı IL'yi aştı). */
  private on = false;
  private latched = false;

  constructor(init: DeviceInit) {
    super(init);
    const [a, k, , inner] = init.nodes as [number, number, number, number];
    this.main = new SeriesJunction(SCR_ON_IS, SCR_ON_N, SCR_ON_RS, a, inner, k);
    this.gate = new Junction(SCR_GATE_IS, 1);
  }

  override get nonlinear(): boolean {
    return true;
  }

  override get switching(): boolean {
    return true;
  }

  override stampStatic(sys: MnaSystem): void {
    this.main.stampStatic(sys);
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    if (this.on) this.main.stampNonlinear(sys, ctx);
    this.gate.stamp(sys, this.nodes[2]!, this.nodes[1]!, ctx);
  }

  override updateIterate(x: Float64Array): boolean {
    const gate = this.gate.update(this.gateVoltage(x));
    const main = this.on ? this.main.update(x) : true;
    return gate && main;
  }

  override restoreIterate(): void {
    this.main.junction.restore();
    this.gate.restore();
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.main.junction.accept(ctx);
    this.gate.accept(ctx);
    if (this.on && this.anodeCurrent(x) >= SCR_IL) this.latched = true;
  }

  private gateVoltage(x: Float64Array): number {
    return nodeVoltage(x, this.nodes[2]!) - nodeVoltage(x, this.nodes[1]!);
  }

  private gateCurrent(x: Float64Array): number {
    return this.gate.current(this.gateVoltage(x));
  }

  private anodeCurrent(x: Float64Array): number {
    return this.on ? this.main.current(x) : 0;
  }

  /**
   * Durum değişikliği için pay (≥ 0: değişir). Kesimde: kapı akımı IGT'yi aştı ve anot katottan
   * pozitif. İletimde: kapı akımı IGT'nin altında ve anot akımı tutma (kilitlenmeden önce kilitleme)
   * akımının altında.
   */
  private margin(x: Float64Array): number {
    const ig = this.gateCurrent(x);
    if (!this.on) return this.main.voltage(x) > 0 ? ig - SCR_IGT : -1;
    const hold = this.latched ? SCR_IH : SCR_IL;
    return Math.min(SCR_IGT - ig, hold - this.anodeCurrent(x));
  }

  override eventFraction(x: Float64Array): number | null {
    return this.margin(x) >= 0 ? 0 : null;
  }

  override switchState(x: Float64Array): boolean {
    if (this.margin(x) < 0) return false;
    this.on = !this.on;
    this.latched = false;
    return true;
  }

  /** Kesimde anot–katot iletmez (gmin için yalnızca kapı–katot). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    const [a, k, g, inner] = this.nodes as [number, number, number, number];
    return this.on ? [[a, inner, k, g]] : [[g, k], [a, inner]];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [this.nodes];
  }

  override pinCurrents(x: Float64Array): number[] {
    const ia = this.anodeCurrent(x);
    const ig = this.gateCurrent(x);
    return [ia, -ia - ig, ig];
  }

  /** Ölçüm: anot–katot gerilimi ve anot akımı. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    const current = this.anodeCurrent(x);
    return { voltage, current, power: voltage * current + this.gateVoltage(x) * this.gateCurrent(x) };
  }

  override status(x: Float64Array): DeviceStatus {
    return { scr: { on: this.on, gate: this.gateCurrent(x), gateVoltage: this.gateVoltage(x) } };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof ScrDevice) {
      this.on = prev.on;
      this.latched = prev.latched;
      this.main.junction.copyStateFrom(prev.main.junction);
      this.gate.copyStateFrom(prev.gate);
    }
  }
}

export const scrModel: DeviceModel = {
  type: 'scr',
  pinCount: 3,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new ScrDevice(init),
};
