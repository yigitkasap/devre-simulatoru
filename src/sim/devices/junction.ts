// pn eklemi (diyot, LED ve zener diyotun ortak çekirdeği): Shockley denklemi ve Newton-Raphson
// doğrusallaştırması. Gerilim sınırlaması transistörlerin eklemlerinde de kullanılır.
//
//   Id = Is·(exp(Vd/(N·VT)) − 1)

import { GMIN, NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { chargeScale } from './device';

/** Zaman adımı ve integrasyon yöntemi (StepContext'in yük modelinin kullandığı kısmı). */
export interface Integration {
  readonly h: number;
  readonly trap: boolean;
}

/** Doğru akım çözümü: yük akımı yok. */
const DC: Integration = { h: 0, trap: false };

/** exp() taşmasını önlemek için üs sınırı; bunun ötesinde eğri doğrusal sürdürülür. */
const MAX_EXP_ARG = 80;
const EXP_AT_MAX = Math.exp(MAX_EXP_ARG);

export function safeExp(arg: number): number {
  return arg <= MAX_EXP_ARG ? Math.exp(arg) : EXP_AT_MAX * (1 + arg - MAX_EXP_ARG);
}

/**
 * safeExp'in türevi d/d(arg): sınırın ötesinde doğrusal sürdürmenin eğimi (EXP_AT_MAX). İletkenlik
 * ve kapasite bununla hesaplanır; safeExp'le hesaplansaydı akımın gerçek türevinden (1 + arg − 80)
 * kat büyük çıkar, Newton yavaş yakınsardı.
 */
export function safeExpSlope(arg: number): number {
  return arg <= MAX_EXP_ARG ? Math.exp(arg) : EXP_AT_MAX;
}

/** Vcrit = N·VT·ln(N·VT/(√2·Is)): bunun üstünde eklem gerilimi adımı sınırlanır. */
export function criticalVoltage(nvt: number, saturationCurrent: number): number {
  return nvt * Math.log(nvt / (Math.SQRT2 * saturationCurrent));
}

/**
 * Eklem geriliminin Newton-Raphson adımını sınırlar: Vnew > Vcrit ve |Vnew − Vold| > 2·N·VT ise
 *   Vold > 0:  Vnew = Vold + N·VT·ln(1 + (Vnew − Vold)/(N·VT))
 *   Vold ≤ 0:  Vnew = N·VT·ln(Vnew/(N·VT))   (ters kutuplanmadan hızlı çıkış için)
 */
export function limitJunction(vnew: number, vold: number, nvt: number, vcrit: number): { v: number; limited: boolean } {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * nvt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nvt;
      return { v: arg > 0 ? vold + nvt * Math.log(arg) : vcrit, limited: true };
    }
    return { v: nvt * Math.log(vnew / nvt), limited: true };
  }
  return { v: vnew, limited: false };
}

// ---------------------------------------------------------------------------
// Yük depolama (SPICE'taki gibi): boşluk (depletion) kapasitesi ve difüzyon yükü.
//
//   V < FC·VJ:  Q = CJ0·VJ/(1 − M)·(1 − (1 − V/VJ)^(1−M)),   C = CJ0·(1 − V/VJ)^(−M)
//   V ≥ FC·VJ:  C, V'ye göre doğrusal uzatılır (FC = 0,5); Q bunun integralidir.
//   Difüzyon yükü Q_d = τ_T·I_D (ileri yönde depolanan azınlık taşıyıcıları; ters toparlanma).
// Zaman adımında yamuk kuralıyla i = 2(Q(v) − Q_önceki)/h − i_önceki, iletkenliği 2C(v)/h olur
// (geri Euler adımında i = (Q(v) − Q_önceki)/h, C(v)/h). Doğru akım çözümünde (h = 0) yük akımı
// yoktur: kondansatörsüz devreler eskisi gibi tek çözümle kalır.

const DEPLETION_FC = 0.5;

export interface DepletionParams {
  /** Sıfır gerilimdeki kapasite (F). */
  readonly cj0: number;
  /** Eklem potansiyeli (V). */
  readonly vj: number;
  /** Derecelenme katsayısı. */
  readonly m: number;
}

/** Boşluk yükü ve kapasitesi; v, eklemin ileri yöndeki gerilimidir (ters kutuplanmada negatif). */
export function depletionCharge(v: number, p: DepletionParams): { q: number; c: number } {
  if (p.cj0 <= 0) return { q: 0, c: 0 };
  const vf = DEPLETION_FC * p.vj;
  if (v < vf) {
    const arg = 1 - v / p.vj;
    const s = arg ** -p.m;
    return { q: (p.cj0 * p.vj * (1 - arg * s)) / (1 - p.m), c: p.cj0 * s };
  }
  const f1 = (p.vj * (1 - (1 - DEPLETION_FC) ** (1 - p.m))) / (1 - p.m);
  const f2 = (1 - DEPLETION_FC) ** (1 + p.m);
  const f3 = 1 - DEPLETION_FC * (1 + p.m);
  return {
    q: p.cj0 * f1 + (p.cj0 / f2) * (f3 * (v - vf) + (p.m / (2 * p.vj)) * (v * v - vf * vf)),
    c: (p.cj0 / f2) * (f3 + (p.m * v) / p.vj),
  };
}

/** Bir eklemin yük modeli: boşluk kapasitesi ve difüzyon (geçiş) süresi τ_T. */
export interface ChargeParams extends DepletionParams {
  /** Geçiş süresi τ_T (s): ileri akımla depolanan yük Q = τ_T·I. */
  readonly tt: number;
}

/**
 * Yük depolayan bir dalın integrasyon durumu: son kabul edilen adımdaki yük ve akım.
 * companion(), (q, c) noktasında doğrusallaştırılmış akımı ve iletkenliği verir.
 */
export class ChargeState {
  /** Son kabul edilen adımdaki yük (C). */
  q0 = 0;
  /** Son kabul edilen adımdaki yük akımı dQ/dt (A). */
  current = 0;

  /** Adımın sonundaki yük akımı (yamukta önceki akım da girer) ve iletkenliği. */
  companion(q: number, c: number, ctx: Integration): { i: number; g: number } {
    if (ctx.h <= 0) return { i: 0, g: 0 };
    const k = chargeScale(ctx);
    return { i: k * (q - this.q0) - (ctx.trap ? this.current : 0), g: k * c };
  }

  accept(q: number, ctx: Integration): void {
    this.current = ctx.h > 0 ? chargeScale(ctx) * (q - this.q0) - (ctx.trap ? this.current : 0) : 0;
    this.q0 = q;
  }

  copyFrom(other: ChargeState): void {
    this.q0 = other.q0;
    this.current = other.current;
  }
}

export class Junction {
  readonly saturationCurrent: number;
  /** N·VT */
  readonly nvt: number;
  /** Vcrit = N·VT·ln(N·VT/(√2·Is)): bunun üstünde gerilim adımı sınırlanır. */
  readonly vcrit: number;
  /** Yük modeli (yoksa eklem anlık davranır: eski genel modeller). */
  readonly charge: ChargeParams | null;
  readonly chargeState = new ChargeState();

  /** NR'nin bu iterasyonda kullandığı doğrusallaştırma noktası. */
  vd = 0;
  /** Son kabul edilen adımdaki eklem gerilimi. */
  private vdAccepted = 0;
  /** Son doğrusallaştırmanın değerleri (akım yakınsama kontrolü için). */
  private linCurrent = 0;
  private linConductance = 0;

  constructor(saturationCurrent: number, emissionCoefficient: number, charge: ChargeParams | null = null) {
    this.saturationCurrent = saturationCurrent;
    this.nvt = emissionCoefficient * THERMAL_VOLTAGE;
    this.vcrit = criticalVoltage(this.nvt, saturationCurrent);
    this.charge = charge;
  }

  /** Eklemde depolanan yük ve küçük sinyal kapasitesi (boşluk + difüzyon). */
  chargeAt(vd: number): { q: number; c: number } {
    if (!this.charge) return { q: 0, c: 0 };
    const dep = depletionCharge(vd, this.charge);
    const tt = this.charge.tt;
    const e = safeExp(vd / this.nvt);
    return {
      q: dep.q + tt * this.saturationCurrent * (e - 1),
      c: dep.c + (tt * this.saturationCurrent * safeExpSlope(vd / this.nvt)) / this.nvt,
    };
  }

  /** Son kabul edilen adımdaki yük akımı (kapasitif ve ters toparlanma akımı). */
  get chargeCurrent(): number {
    return this.chargeState.current;
  }

  /** Eklem akımı (paralel gmin dahil). */
  current(vd: number): number {
    return this.saturationCurrent * (safeExp(vd / this.nvt) - 1) + GMIN * vd;
  }

  /** Küçük sinyal iletkenliği dId/dVd (paralel gmin dahil). */
  conductance(vd: number): number {
    return (this.saturationCurrent / this.nvt) * safeExpSlope(vd / this.nvt) + GMIN;
  }

  /**
   * Eklem (anot a, katot c), vd noktasında doğrusallaştırılır:
   *   Id(v) ≈ Id(vd) + gd·(v − vd) = gd·v + Ieq
   *   gd  = (Is/(N·VT))·exp(vd/(N·VT)) + gmin
   *   Ieq = Id − gd·vd
   * Böylece eklem, a–c arasında bir gd iletkenliği ve ona paralel, a'dan c'ye akan
   * Ieq akım kaynağı olur. Zaman adımında (h > 0) yük modeli varsa yük akımı da aynı biçimde
   * eklenir (ChargeState.companion).
   */
  stamp(sys: MnaSystem, anode: number, cathode: number, ctx: Integration = DC): void {
    let gd = this.conductance(this.vd);
    let id = this.current(this.vd);
    this.linConductance = gd;
    this.linCurrent = id;
    if (this.charge && ctx.h > 0) {
      const { q, c } = this.chargeAt(this.vd);
      const { i, g } = this.chargeState.companion(q, c, ctx);
      gd += g;
      id += i;
    }
    sys.conductance(anode, cathode, gd);
    sys.currentSource(anode, cathode, id - gd * this.vd);
  }

  /**
   * NR çözümünden gelen yeni eklem gerilimini sınırlar (limitJunction) ve bir sonraki
   * doğrusallaştırma noktası yapar.
   * @returns gerilim sınırlanmadıysa ve akım doğrusal tahmine yeterince yakınsa true
   */
  update(vnew: number): boolean {
    const vold = this.vd;
    const { v, limited } = limitJunction(vnew, vold, this.nvt, this.vcrit);
    // Akım yakınsaması: doğrusal modelin öngördüğü akım ile gerçek eğri arasındaki fark.
    const predicted = this.linCurrent + this.linConductance * (vnew - vold);
    const actual = this.current(vnew);
    const tolerance = NR_RELTOL * Math.max(Math.abs(actual), Math.abs(predicted)) + NR_ABSTOL;
    this.vd = v;
    return !limited && Math.abs(actual - predicted) <= tolerance;
  }

  /** Adım kabul edildi (doğru akım çözümünde h = 0). */
  accept(ctx: Integration = DC): void {
    this.vdAccepted = this.vd;
    if (this.charge) this.chargeState.accept(this.chargeAt(this.vd).q, ctx);
  }

  restore(): void {
    this.vd = this.vdAccepted;
  }

  copyStateFrom(other: Junction): void {
    this.vd = other.vd;
    this.vdAccepted = other.vdAccepted;
    this.chargeState.copyFrom(other.chargeState);
  }
}

/** Belirli bir akımda belirli bir ileri gerilim verecek Is değeri: Is = I / (exp(V/(N·VT)) − 1). */
export function saturationCurrentFor(current: number, junctionVoltage: number, emissionCoefficient: number): number {
  return current / Math.expm1(junctionVoltage / (emissionCoefficient * THERMAL_VOLTAGE));
}
