// pn eklemi (diyot ve LED'in ortak çekirdeği): Shockley denklemi ve Newton-Raphson doğrusallaştırması.
//
//   Id = Is·(exp(Vd/(N·VT)) − 1)

import { GMIN, NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';

/** exp() taşmasını önlemek için üs sınırı; bunun ötesinde eğri doğrusal sürdürülür. */
const MAX_EXP_ARG = 80;
const EXP_AT_MAX = Math.exp(MAX_EXP_ARG);

function safeExp(arg: number): number {
  return arg <= MAX_EXP_ARG ? Math.exp(arg) : EXP_AT_MAX * (1 + arg - MAX_EXP_ARG);
}

export class Junction {
  readonly saturationCurrent: number;
  /** N·VT */
  readonly nvt: number;
  /** Vcrit = N·VT·ln(N·VT/(√2·Is)): bunun üstünde gerilim adımı sınırlanır. */
  readonly vcrit: number;

  /** NR'nin bu iterasyonda kullandığı doğrusallaştırma noktası. */
  vd = 0;
  /** Son kabul edilen adımdaki eklem gerilimi. */
  private vdAccepted = 0;
  /** Son doğrusallaştırmanın değerleri (akım yakınsama kontrolü için). */
  private linCurrent = 0;
  private linConductance = 0;

  constructor(saturationCurrent: number, emissionCoefficient: number) {
    this.saturationCurrent = saturationCurrent;
    this.nvt = emissionCoefficient * THERMAL_VOLTAGE;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * saturationCurrent));
  }

  /** Eklem akımı (paralel gmin dahil). */
  current(vd: number): number {
    return this.saturationCurrent * (safeExp(vd / this.nvt) - 1) + GMIN * vd;
  }

  /** Küçük sinyal iletkenliği dId/dVd (paralel gmin dahil). */
  conductance(vd: number): number {
    return (this.saturationCurrent / this.nvt) * safeExp(vd / this.nvt) + GMIN;
  }

  /**
   * Eklem (anot a, katot c), vd noktasında doğrusallaştırılır:
   *   Id(v) ≈ Id(vd) + gd·(v − vd) = gd·v + Ieq
   *   gd  = (Is/(N·VT))·exp(vd/(N·VT)) + gmin
   *   Ieq = Id − gd·vd
   * Böylece eklem, a–c arasında bir gd iletkenliği ve ona paralel, a'dan c'ye akan
   * Ieq akım kaynağı olur.
   */
  stamp(sys: MnaSystem, anode: number, cathode: number): void {
    const gd = this.conductance(this.vd);
    const id = this.current(this.vd);
    this.linConductance = gd;
    this.linCurrent = id;
    sys.conductance(anode, cathode, gd);
    sys.currentSource(anode, cathode, id - gd * this.vd);
  }

  /**
   * NR çözümünden gelen yeni eklem gerilimini sınırlar ve bir sonraki doğrusallaştırma noktası yapar.
   * Gerilim adımı sınırlaması: Vnew > Vcrit ve |Vnew − Vold| > 2·N·VT ise
   *   Vold > 0:  Vnew = Vold + N·VT·ln(1 + (Vnew − Vold)/(N·VT))
   *   Vold ≤ 0:  Vnew = N·VT·ln(Vnew/(N·VT))   (ters kutuplanmadan hızlı çıkış için)
   * @returns gerilim sınırlanmadıysa ve akım doğrusal tahmine yeterince yakınsa true
   */
  update(vnew: number): boolean {
    const vold = this.vd;
    let v = vnew;
    let limited = false;
    if (v > this.vcrit && Math.abs(v - vold) > 2 * this.nvt) {
      if (vold > 0) {
        const arg = 1 + (v - vold) / this.nvt;
        v = arg > 0 ? vold + this.nvt * Math.log(arg) : this.vcrit;
      } else {
        v = this.nvt * Math.log(v / this.nvt);
      }
      limited = true;
    }
    // Akım yakınsaması: doğrusal modelin öngördüğü akım ile gerçek eğri arasındaki fark.
    const predicted = this.linCurrent + this.linConductance * (vnew - vold);
    const actual = this.current(vnew);
    const tolerance = NR_RELTOL * Math.max(Math.abs(actual), Math.abs(predicted)) + NR_ABSTOL;
    this.vd = v;
    return !limited && Math.abs(actual - predicted) <= tolerance;
  }

  accept(): void {
    this.vdAccepted = this.vd;
  }

  restore(): void {
    this.vd = this.vdAccepted;
  }

  copyStateFrom(other: Junction): void {
    this.vd = other.vd;
    this.vdAccepted = other.vdAccepted;
  }
}

/** Belirli bir akımda belirli bir ileri gerilim verecek Is değeri: Is = I / (exp(V/(N·VT)) − 1). */
export function saturationCurrentFor(current: number, junctionVoltage: number, emissionCoefficient: number): number {
  return current / Math.expm1(junctionVoltage / (emissionCoefficient * THERMAL_VOLTAGE));
}
