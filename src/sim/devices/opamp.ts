import type { MnaSystem } from '../mna';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

/**
 * İşlemsel yükselteç (LM741 / µA741). Pinler: [0] eviren giriş (−), [1] evirmeyen giriş (+),
 * [2] çıkış, [3] pozitif besleme (V+), [4] negatif besleme (V−). Değerler TI LM741 veri sayfasından
 * (±15 V, 25 °C, tipik): açık çevrim kazancı A = 200 V/mV, giriş direnci 2 MΩ, yükselme süresi
 * 0,3 µs (birim kazanç bant genişliği 0,35 / 0,3 µs ≈ 1,17 MHz; veri sayfasının formülü), eğim hızı
 * 0,5 V/µs, kısa devre akımı 25 mA, besleme akımı 1,7 mA, çıkış salınımı 10 kΩ'da ±14 V, 2 kΩ'da
 * ±13 V. Bu iki salınım noktasından çıkışın raylara uzaklığı H ≈ 0,73 V ve çıkış direnci ≈ 196 Ω.
 * Giriş kayma gerilimi (1 mV) ve kutuplama akımı (80 nA) modellenmez (ideal girişli 741).
 *
 * Model (davranışsal, tek kutuplu):
 *   - Kazanç düğümü y (iç düğüm): τ·dy/dt = A·v_d − y, τ = A / (2π·GBW) ≈ 27 ms (baskın kutup
 *     ≈ 5,8 Hz); dy/dt eğim hızıyla sınırlı (yumuşak: S·tanh(u/(S·τ))). y, raylardan 1 V'tan fazla
 *     uzaklaşamaz (doyumdan çabuk çıksın diye).
 *   - Çıkış katı: V_c = y'nin raylar arasına (V− + H, V+ − H) yumuşakça kırpılmışı; çıkış akımı
 *     I = I_ks·tanh((V_c − v_çıkış) / (R_o·I_ks)): küçük akımda R_o'lu bir kaynak, kısa devrede 25 mA.
 *     Çıkış akımı V+ ya da V− ucundan çekilir (veren akım V+'tan, çeken akım V−'ye).
 *   - Girişler arasında 2 MΩ; besleme uçları arasında 1,7 mA çeken bir direnç (±15 V'ta).
 */
export const OPAMP = {
  gain: 2e5,
  gbw: 0.35 / 0.3e-6,
  slewRate: 0.5e6,
  inputResistance: 2e6,
  shortCircuitCurrent: 0.025,
  supplyCurrent: 1.7e-3,
  headroom: 0.725,
  outputResistance: 196,
};
const TAU = OPAMP.gain / (2 * Math.PI * OPAMP.gbw);
/** Kazanç düğümünün "kapasitesi" (F): yalnızca ölçek; denklem C·dy/dt = C·f(u). */
const NODE_C = 1e-6;
/** Yumuşak köşelerin genişliği (V) ve kazanç düğümünün raylardan en fazla uzaklığı (V). */
const CORNER = 0.05;
const WINDUP_MARGIN = 1;
/** Ray dışına taşan kazanç düğümünü geri çeken hız (1/s). */
const WINDUP_RATE = 1e6;
const SUPPLY_RESISTANCE = 30 / OPAMP.supplyCurrent;

function softplus(z: number, s: number): { v: number; d: number } {
  const x = z / s;
  if (x > 30) return { v: z, d: 1 };
  if (x < -30) return { v: 0, d: 0 };
  const e = Math.exp(x);
  return { v: s * Math.log1p(e), d: e / (1 + e) };
}

/**
 * Salınım penceresi [lo, hi] ve sınırların V+, V−'ye göre türevleri. Besleme, iki tavanın toplamından
 * küçükse (ör. ±15 mV) pencere ters döner (hi < lo) ve iki yumuşak sınır kazancın işaretini
 * çevirirdi; o durumda ikisi rayların ortasında birleşir: çıkış ortada kalır (gerçek 741 de çalışmaz).
 */
function swingWindow(vp: number, vn: number, inset: number) {
  const hi = vp - inset;
  const lo = vn + inset;
  if (hi >= lo) return { hi, lo, hiP: 1, hiN: 0, loP: 0, loN: 1 };
  const mid = (vp + vn) / 2;
  return { hi: mid, lo: mid, hiP: 0.5, hiN: 0.5, loP: 0.5, loN: 0.5 };
}

/** Kazanç düğümüne giren akım ve türevleri (y, v_d, V+, V−'ye göre). */
function gainStage(y: number, vd: number, vp: number, vn: number) {
  const u = OPAMP.gain * vd - y;
  const s = OPAMP.slewRate;
  const t = Math.tanh(u / (s * TAU));
  const fu = s * t;
  const dfu = (1 - t * t) / TAU;
  const w = swingWindow(vp, vn, OPAMP.headroom - WINDUP_MARGIN);
  const over = softplus(y - w.hi, CORNER);
  const under = softplus(w.lo - y, CORNER);
  const i = NODE_C * (fu - WINDUP_RATE * (over.v - under.v));
  return {
    i,
    dy: NODE_C * (-dfu - WINDUP_RATE * (over.d + under.d)),
    dvd: NODE_C * dfu * OPAMP.gain,
    dvp: NODE_C * WINDUP_RATE * (over.d * w.hiP + under.d * w.loP),
    dvn: NODE_C * WINDUP_RATE * (over.d * w.hiN + under.d * w.loN),
    slewing: Math.abs(t) > 0.9,
  };
}

/** Çıkış katının verdiği akım (çıkış düğümüne giren) ve türevleri. */
function outputStage(y: number, vo: number, vp: number, vn: number) {
  const w = swingWindow(vp, vn, OPAMP.headroom);
  const a = softplus(y - w.hi, CORNER);
  const b = softplus(w.lo - y, CORNER);
  const vc = y - a.v + b.v;
  const isc = OPAMP.shortCircuitCurrent;
  const ro = OPAMP.outputResistance;
  const t = Math.tanh((vc - vo) / (ro * isc));
  const g = (1 - t * t) / ro;
  return {
    i: isc * t,
    vc,
    dy: g * (1 - a.d - b.d),
    dvp: g * (a.d * w.hiP + b.d * w.loP),
    dvn: g * (a.d * w.hiN + b.d * w.loN),
    dvo: -g,
    saturation: a.d > 0.5 ? 'high' : b.d > 0.5 ? 'low' : null,
    limited: Math.abs(t) > 0.95,
  };
}

type OpAmpPoint = { readonly y: number; readonly vd: number; readonly vo: number; readonly vp: number; readonly vn: number };

/** Bir Newton yinelemesinde iki tanh katının en fazla değişimi. */
const MAX_TANH_STEP = 0.5;

const lerpPoint = (a: OpAmpPoint, b: OpAmpPoint, t: number): OpAmpPoint => ({
  y: a.y + (b.y - a.y) * t,
  vd: a.vd + (b.vd - a.vd) * t,
  vo: a.vo + (b.vo - a.vo) * t,
  vp: a.vp + (b.vp - a.vp) * t,
  vn: a.vn + (b.vn - a.vn) * t,
});
const gainTanh = (p: OpAmpPoint) => Math.tanh((OPAMP.gain * p.vd - p.y) / (OPAMP.slewRate * TAU));
const outputTanh = (p: OpAmpPoint) => outputStage(p.y, p.vo, p.vp, p.vn).i / OPAMP.shortCircuitCurrent;

/** a'dan b'ye adımın, iki katın tanh değişimini MAX_TANH_STEP'te tutan kesri (yarılayarak; 1 = tam adım). */
function dampedFraction(a: OpAmpPoint, b: OpAmpPoint): number {
  const g0 = gainTanh(a);
  const o0 = outputTanh(a);
  let t = 1;
  for (let k = 0; k < 30; k++) {
    const p = t === 1 ? b : lerpPoint(a, b, t);
    if (Math.abs(gainTanh(p) - g0) <= MAX_TANH_STEP && Math.abs(outputTanh(p) - o0) <= MAX_TANH_STEP) return t;
    t /= 2;
  }
  return t;
}

/** Çıkış akımının V+ ucundan çekilen kısmı (yumuşak pozitif kısım) ve türevi. */
const SPLIT = 1e-5;

export class OpAmpDevice extends Device {
  readonly type = 'opamp';
  /** NR doğrusallaştırma noktası: y, v_d, v_çıkış, V+, V− (yineleme ve kabul edilen). */
  private it = { y: 0, vd: 0, vo: 0, vp: 0, vn: 0 };
  private accepted = { y: 0, vd: 0, vo: 0, vp: 0, vn: 0 };
  /** Kazanç düğümünün kondansatör eşdeğeri: son kabul edilen y ve "akımı". */
  private yPrev = 0;
  private iPrev = 0;

  constructor(init: DeviceInit) {
    super(init);
  }

  override get nonlinear(): boolean {
    return true;
  }
  override get reactive(): boolean {
    return true;
  }

  private get g(): number {
    return this.nodes[5]!;
  }

  override conductiveGroups(transient: boolean): ReadonlyArray<readonly number[]> {
    const [inv, non, , vp, vn] = this.nodes;
    return transient ? [[inv!, non!], [vp!, vn!], [this.g, -1]] : [[inv!, non!], [vp!, vn!]];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [[...this.nodes.slice(0, 5), this.g, -1]];
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / OPAMP.inputResistance);
    sys.conductance(this.nodes[3]!, this.nodes[4]!, 1 / SUPPLY_RESISTANCE);
    if (ctx.h > 0) sys.add(this.g, this.g, chargeScale(ctx) * NODE_C);
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    sys.addRhs(this.g, chargeScale(ctx) * NODE_C * this.yPrev + (ctx.trap ? this.iPrev : 0));
  }

  override stampNonlinear(sys: MnaSystem): void {
    const [inv, non, out, vpN, vnN] = this.nodes as [number, number, number, number, number];
    const g = this.g;
    const { y, vd, vo, vp, vn } = this.it;
    // Kazanç düğümü: C·dy/dt − I_g(y, v_d, V+, V−) = 0.
    const gs = gainStage(y, vd, vp, vn);
    sys.add(g, g, -gs.dy);
    sys.add(g, non, -gs.dvd);
    sys.add(g, inv, gs.dvd);
    sys.add(g, vpN, -gs.dvp);
    sys.add(g, vnN, -gs.dvn);
    sys.addRhs(g, gs.i - gs.dy * y - gs.dvd * vd - gs.dvp * vp - gs.dvn * vn);
    // Çıkış: çıkış düğümüne I girer; I'nin pozitif kısmı V+'tan, kalanı V−'den çıkar.
    const os = outputStage(y, vo, vp, vn);
    const sp = softplus(os.i, SPLIT);
    const inject = (node: number, scale: number, value: number) => {
      // Düğüme giren akım J = scale·(I'nin uygun kısmı), doğrusallaştırılmış: J ≈ J₀ + Σ ∂J/∂x·(x − x₀).
      const terms: Array<[number, number, number]> = [
        [g, os.dy, y],
        [out, os.dvo, vo],
        [vpN, os.dvp, vp],
        [vnN, os.dvn, vn],
      ];
      let rhs = value;
      for (const [col, d, x0] of terms) {
        sys.add(node, col, -scale * d);
        rhs -= scale * d * x0;
      }
      sys.addRhs(node, rhs);
    };
    inject(out, 1, os.i);
    inject(vpN, -sp.d, -sp.v);
    inject(vnN, -(1 - sp.d), -(os.i - sp.v));
  }

  override updateIterate(x: Float64Array): boolean {
    const raw = { y: this.v(x, 5), vd: this.v(x, 1) - this.v(x, 0), vo: this.v(x, 2), vp: this.v(x, 3), vn: this.v(x, 4) };
    const before = this.it;
    // Doyumdaki iki tanh katı (eğim hızı ve kısa devre akımı) Newton'u döngüye sokabilir (ör. V+ 15 mV:
    // çıkış her yinelemede ±1600 V). Diyotlardaki pnjlim gibi: yeni doğrusallaştırma noktası, iki katın
    // tanh değeri en çok MAX_TANH_STEP değişecek kadar kısaltılır.
    const alpha = dampedFraction(before, raw);
    const next = alpha === 1 ? raw : lerpPoint(before, raw, alpha);
    if (alpha < 1) {
      this.it = next;
      return false;
    }
    // Kazanç düğümünün ve çıkış akımının doğrusal tahmini ile gerçek değeri yakınsa yakınsamıştır.
    const gs0 = gainStage(before.y, before.vd, before.vp, before.vn);
    const gs1 = gainStage(next.y, next.vd, next.vp, next.vn);
    const predictedG = gs0.i + gs0.dy * (next.y - before.y) + gs0.dvd * (next.vd - before.vd) + gs0.dvp * (next.vp - before.vp) + gs0.dvn * (next.vn - before.vn);
    const os0 = outputStage(before.y, before.vo, before.vp, before.vn);
    const os1 = outputStage(next.y, next.vo, next.vp, next.vn);
    const predictedO = os0.i + os0.dy * (next.y - before.y) + os0.dvo * (next.vo - before.vo) + os0.dvp * (next.vp - before.vp) + os0.dvn * (next.vn - before.vn);
    this.it = next;
    const close = (a: number, b: number, abs: number) => Math.abs(a - b) <= 1e-3 * Math.max(Math.abs(a), Math.abs(b)) + abs;
    return close(gs1.i, predictedG, NODE_C * 1e-3) && close(os1.i, predictedO, 1e-9);
  }

  override restoreIterate(): void {
    this.it = { ...this.accepted };
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const y = this.v(x, 5);
    this.iPrev = ctx.h > 0 ? chargeScale(ctx) * NODE_C * (y - this.yPrev) - (ctx.trap ? this.iPrev : 0) : 0;
    this.yPrev = y;
    this.accepted = { y, vd: this.v(x, 1) - this.v(x, 0), vo: this.v(x, 2), vp: this.v(x, 3), vn: this.v(x, 4) };
    this.it = { ...this.accepted };
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [[this.g, -1]];
  }

  /** Uçlara giren akımlar: girişler, çıkış (dışarı verilen akım negatif), beslemeler. */
  override pinCurrents(x: Float64Array): number[] {
    const vin = (this.v(x, 1) - this.v(x, 0)) / OPAMP.inputResistance;
    const vp = this.v(x, 3);
    const vn = this.v(x, 4);
    const os = outputStage(this.v(x, 5), this.v(x, 2), vp, vn);
    const sp = softplus(os.i, SPLIT).v;
    const supply = (vp - vn) / SUPPLY_RESISTANCE;
    return [-vin, vin, -os.i, sp + supply, os.i - sp - supply];
  }

  /** Çıkışın gerilimi (V− ucuna göre değil, toprağa göre) ve verdiği akım. */
  measure(x: Float64Array): Measurement {
    const os = outputStage(this.v(x, 5), this.v(x, 2), this.v(x, 3), this.v(x, 4));
    const voltage = this.v(x, 2);
    return { voltage, current: os.i, power: (this.v(x, 3) - this.v(x, 4)) * OPAMP.supplyCurrent };
  }

  override status(x: Float64Array): DeviceStatus {
    const vd = this.v(x, 1) - this.v(x, 0);
    const os = outputStage(this.v(x, 5), this.v(x, 2), this.v(x, 3), this.v(x, 4));
    const gs = gainStage(this.v(x, 5), vd, this.v(x, 3), this.v(x, 4));
    return {
      opamp: {
        differential: vd,
        output: this.v(x, 2),
        current: os.i,
        mode: os.saturation === 'high' ? 'high' : os.saturation === 'low' ? 'low' : os.limited ? 'limited' : gs.slewing ? 'slewing' : 'linear',
      },
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof OpAmpDevice) {
      this.yPrev = prev.yPrev;
      this.iPrev = prev.iPrev;
      this.accepted = { ...prev.accepted };
      this.it = { ...prev.accepted };
    }
  }
}

export const opampModel: DeviceModel = {
  type: 'opamp',
  pinCount: 5,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new OpAmpDevice(init),
};
