import type { MnaSystem } from '../mna';
import { chargeScale, type StepContext } from './device';

/**
 * Sıcaklığa bağlı direnç (akkor lamba, NTC termistör) için ortak çözüm. Bilinmeyenler: uç gerilimi
 * V = v(a) − v(b) ve sıcaklık T (kelvin; MNA'da toprağa göre "gerilimi" T olan bir iç düğüm, ısıl
 * devre benzetmesi). Denklemler:
 *
 *   I = V / R(T)                                (elektrik)
 *   C·dT/dt + P_kayıp(T) = V² / R(T)             (ısı: sığa, çevreye kayıp, Joule ısınması)
 *
 * İkisi birlikte Newton-Raphson ile çözülür (doğrusallaştırma (V₀, T₀) noktasında):
 *   I ≈ G₀·V + g_T·(T − T₀),            G₀ = 1/R(T₀), g_T = −R'(T₀)/R(T₀)²·V₀
 *   P ≈ P₀ + 2G₀V₀·(V − V₀) + G'₀V₀²·(T − T₀)
 * Isı sığası yamuk kuralıyla (kondansatör gibi) integre edilir; sıcaklık LTE ile denetlenir.
 */
export interface ThermalModel {
  /** Direnç (Ω) ve sıcaklığa göre türevi (Ω/K). */
  resistance(T: number): { r: number; dr: number };
  /** Çevreye ısı kaybı (W) ve sıcaklığa göre türevi (W/K). */
  loss(T: number): { p: number; dp: number };
  /** Isı sığası (J/K). */
  readonly heatCapacity: number;
  /** Başlangıç (ortam) sıcaklığı (K). */
  readonly ambient: number;
  /** Yinelemede sıcaklığın alt ve üst sınırı (K). */
  readonly minT: number;
  readonly maxT: number;
}

export class ThermalResistor {
  /** Son kabul edilen adım: sıcaklık, ısı sığasının "akımı" (C·dT/dt) ve uç gerilimi. */
  temperature: number;
  private heatFlow = 0;
  /** Newton-Raphson doğrusallaştırma noktası (yineleme) ve kabul edilen değerleri. */
  private vIter = 0;
  private tIter: number;
  private vAccepted = 0;

  constructor(readonly model: ThermalModel) {
    this.temperature = model.ambient;
    this.tIter = model.ambient;
  }

  private clampT(T: number): number {
    return Math.min(this.model.maxT, Math.max(this.model.minT, T));
  }

  stampStatic(sys: MnaSystem, tNode: number, ctx: StepContext): void {
    if (ctx.h > 0) sys.add(tNode, tNode, chargeScale(ctx) * this.model.heatCapacity);
  }

  stampStep(sys: MnaSystem, tNode: number, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    sys.addRhs(tNode, chargeScale(ctx) * this.model.heatCapacity * this.temperature + (ctx.trap ? this.heatFlow : 0));
  }

  stampNonlinear(sys: MnaSystem, a: number, b: number, tNode: number): void {
    const V = this.vIter;
    const T = this.tIter;
    const { r, dr } = this.model.resistance(T);
    const g = 1 / r;
    const dg = -dr / (r * r);
    const gT = dg * V;
    // Elektrik: a'dan b'ye I ≈ g·V + gT·(T − T₀).
    sys.conductance(a, b, g);
    sys.add(a, tNode, gT);
    sys.add(b, tNode, -gT);
    sys.addRhs(a, gT * T);
    sys.addRhs(b, -gT * T);
    // Isı düğümü: C·dT/dt + P_kayıp(T) − P(V, T) = 0.
    const p0 = g * V * V;
    const dpV = 2 * g * V;
    const dpT = dg * V * V;
    const loss = this.model.loss(T);
    sys.add(tNode, tNode, loss.dp - dpT);
    sys.add(tNode, a, -dpV);
    sys.add(tNode, b, dpV);
    sys.addRhs(tNode, p0 - dpV * V - dpT * T - loss.p + loss.dp * T);
  }

  /** Yeni doğrusallaştırma noktası; akım ve güç doğrusal tahmine yakınsa yakınsamıştır. */
  updateIterate(V: number, T: number): boolean {
    const before = this.linear(this.vIter, this.tIter, V, T);
    const t = this.clampT(T);
    const after = this.exact(V, t);
    const converged =
      Math.abs(after.i - before.i) <= 1e-3 * Math.max(Math.abs(after.i), Math.abs(before.i)) + 1e-12 &&
      Math.abs(after.p - before.p) <= 1e-3 * Math.max(Math.abs(after.p), Math.abs(before.p)) + 1e-12 &&
      t === T;
    this.vIter = V;
    this.tIter = t;
    return converged;
  }

  private exact(V: number, T: number): { i: number; p: number } {
    const g = 1 / this.model.resistance(T).r;
    return { i: g * V, p: g * V * V };
  }

  /** Eski doğrusallaştırmanın (V, T) noktasındaki tahmini. */
  private linear(V0: number, T0: number, V: number, T: number): { i: number; p: number } {
    const { r, dr } = this.model.resistance(T0);
    const g = 1 / r;
    const dg = -dr / (r * r);
    return {
      i: g * V + dg * V0 * (T - T0),
      p: g * V0 * V0 + 2 * g * V0 * (V - V0) + dg * V0 * V0 * (T - T0),
    };
  }

  restoreIterate(): void {
    this.vIter = this.vAccepted;
    this.tIter = this.temperature;
  }

  accept(V: number, T: number, ctx: StepContext): void {
    const t = this.clampT(T);
    this.heatFlow = ctx.h > 0 ? chargeScale(ctx) * this.model.heatCapacity * (t - this.temperature) - (ctx.trap ? this.heatFlow : 0) : 0;
    this.temperature = t;
    this.vAccepted = V;
    this.vIter = V;
    this.tIter = t;
  }

  /** Uç gerilimi V'de akım (kabul edilen sıcaklıkla). */
  current(V: number): number {
    return V / this.model.resistance(this.temperature).r;
  }

  copyStateFrom(prev: ThermalResistor): void {
    this.temperature = this.clampT(prev.temperature);
    this.tIter = this.temperature;
    this.vAccepted = prev.vAccepted;
    this.vIter = prev.vAccepted;
    this.heatFlow = 0;
  }
}
