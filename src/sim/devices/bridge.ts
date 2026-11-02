import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type StepContext } from './device';
import { SeriesJunction } from './seriesJunction';

// KBP307 köprü diyot (3 A, 1000 V; dört diyot tek pakette). Büyük üreticilerden hiçbiri bu adla
// üretmiyor; LGE ve DOWO 1000 V'luk KBP307 yapıyor. SPICE modeli yok. Kullanıcı kararı (2026-11-02):
// her diyot DOWO "KBP301~KBP307" (LCSC C20754758) Şekil 3 tipik ileri eğrisine (25 °C, 300 µs darbe)
// uydurulmuştur; eğriden okunan noktalar (yaklaşık, ±0,02 V):
//   10 mA 0,64 V · 0,1 A 0,75 V · 1 A 0,93 V · 3 A 1,07 V · 9,3 A 1,34 V
//   ⇒ en küçük kareler: IS = 1,64·10⁻⁷ A, N = 2,21, RS = 34,5 mΩ (beş noktada da fark ≤ 0,016 V).
// Tablo (LGE "KBP301 THRU KBP307" 20170701-P1 ve DOWO): diyot başına en çok 1,1 V (3 A), VRRM 1000 V,
// sızıntı 25 °C'de en çok 5 µA (LGE) / 10 µA (DOWO). Modelde ters akım ≈ IS = 0,16 µA.
// Eklem kapasitesi: DOWO ve LGE tablolarında değer yok (yalnızca eğri). Aynı adlı HXY KBP307'nin (800 V;
// LCSC C7507388) tablosundaki tipik 25 pF (diyot başına, 4 V, 1 MHz) gerilimden bağımsız alınır. Kapasite,
// dört diyot birden ters kutuplanınca yalnızca köprüyle bağlı kalan kaynağın (yalıtılmış AC kaynak,
// transformatörün ikincili) Newton çözümünü kararlı tutar; yalnızca GMIN'le bağlı düğüm çözülemezdi.
// Ters toparlanma modellenmez (tabloda değer yok).
export const BRIDGE_IS = 1.64078e-7;
export const BRIDGE_N = 2.21472;
export const BRIDGE_RS = 0.0344867;
/** Tablodaki en büyük ters gerilim (LGE ve DOWO KBP307). */
export const BRIDGE_VRRM = 1000;
export const BRIDGE_CHARGE = { cj0: 25e-12, vj: 1, m: 0, tt: 0 };

export const BRIDGE_MODELS = ['KBP307'] as const;
export const BRIDGE_DEFAULTS = { model: 'KBP307' as (typeof BRIDGE_MODELS)[number] };

/**
 * Köprü diyot. Pinler: [0] = ~ (üst AC), [1] = + (DC çıkış), [2] = ~ (alt AC), [3] = − (DC çıkış).
 * Diyotlar: ~₁ → +, ~₂ → +, − → ~₁, − → ~₂. İç düğümler: her diyodun RS ile eklemi arası.
 */
export class BridgeDevice extends Device {
  readonly type = 'bridge';
  readonly diodes: readonly SeriesJunction[];

  constructor(init: DeviceInit) {
    super(init);
    const [ac1, plus, ac2, minus, i0, i1, i2, i3] = init.nodes as [number, number, number, number, number, number, number, number];
    const d = (anode: number, inner: number, cathode: number) => new SeriesJunction(BRIDGE_IS, BRIDGE_N, BRIDGE_RS, anode, inner, cathode, BRIDGE_CHARGE);
    this.diodes = [d(ac1, i0, plus), d(ac2, i1, plus), d(minus, i2, ac1), d(minus, i3, ac2)];
  }

  override get nonlinear(): boolean {
    return true;
  }

  override stampStatic(sys: MnaSystem): void {
    for (const d of this.diodes) d.stampStatic(sys);
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    for (const d of this.diodes) d.stampNonlinear(sys, ctx);
  }

  override updateIterate(x: Float64Array): boolean {
    let converged = true;
    for (const d of this.diodes) if (!d.update(x)) converged = false;
    return converged;
  }

  override restoreIterate(): void {
    for (const d of this.diodes) d.junction.restore();
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return this.diodes.map((d) => d.lteState()!);
  }

  override accept(_x: Float64Array, ctx: StepContext): void {
    for (const d of this.diodes) d.junction.accept(ctx);
  }

  /** Her uca dışarıdan giren akım: anotu o uçta olan diyotların akımı, katotu o uçta olanlarınki eksi. */
  override pinCurrents(x: Float64Array): number[] {
    const [d0, d1, d2, d3] = this.diodes.map((d) => d.current(x)) as [number, number, number, number];
    return [d0 - d2, -(d0 + d1), d1 - d3, d2 + d3];
  }

  /** DC çıkış: gerilim v(+) − v(−), akım + uçtan dış devreye çıkan; güç dört diyotta harcanan. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 1) - this.v(x, 3);
    const current = -this.pinCurrents(x)[1]!;
    const power = this.diodes.reduce((s, d) => s + d.voltage(x) * d.current(x), 0);
    return { voltage, current, power };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof BridgeDevice) this.diodes.forEach((d, i) => d.junction.copyStateFrom(prev.diodes[i]!.junction));
  }
}

export const bridgeModel: DeviceModel = {
  type: 'bridge',
  pinCount: 4,
  internalNodes: 4,
  branchCount: 0,
  create: (init) => new BridgeDevice(init),
};
