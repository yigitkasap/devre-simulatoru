import { GMIN, NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type TransistorRegion } from './device';
import { criticalVoltage, limitJunction, safeExp } from './junction';
import { limitStep, stampThreeTerminal, type TerminalLinearization } from './threeTerminal';

// Alan etkili transistörler (JFET ve kanal oluşturmalı MOSFET), kare yasası (Shichman-Hodges):
//   kesim     V_GS − V_t ≤ 0:          I_D = 0
//   omik      V_DS < V_GS − V_t:      I_D = β·V_DS·(2·(V_GS − V_t) − V_DS)·(1 + λ·V_DS)
//   doyum     V_DS ≥ V_GS − V_t:      I_D = β·(V_GS − V_t)²·(1 + λ·V_DS)
// JFET'te V_t = V_P (kısılma gerilimi) ve β = I_DSS / V_P²  ⇒  doyumda I_D = I_DSS·(1 − V_GS/V_P)².
// MOSFET'te V_t eşik gerilimi ve β = k  ⇒  doyumda I_D = k·(V_GS − V_T)².
// Kanal simetriktir: V_DS < 0 iken drain ve source yer değiştirir. P kanallıda bütün gerilim ve
// akımlar ters işaretlidir (model N kanal için yazılır).

/** Kanal boyu modülasyonu (doyumdaki eğim), iki tür için de. */
export const FET_LAMBDA = 0.01;

/**
 * JFET: 2N5457 benzeri (veri sayfası: I_DSS 1–5 mA, V_GS(off) −0,5…−6 V); varsayılan
 * I_DSS = 3 mA, V_P = −1,5 V (P kanallıda +1,5 V). Kapı eklemleri Is = 10⁻¹⁴ A'lik diyotlardır.
 */
export const JFET_DEFAULTS = { idss: 3e-3, pinchOff: -1.5 };
export const PJFET_DEFAULTS = { idss: 3e-3, pinchOff: 1.5 };
const GATE_SATURATION = 1e-14;
const GATE_VCRIT = criticalVoltage(THERMAL_VOLTAGE, GATE_SATURATION);

/**
 * MOSFET: 2N7000 benzeri (veri sayfası V_GS(th) 0,8–3 V, tipik 2,1 V; V_GS = 4,5 V'ta I_D(on) ≥ 75 mA).
 * Varsayılan V_T = 2,1 V (P kanallıda −2,1 V), k = 50 mA/V². Kapı yalıtılmıştır (akım çekmez).
 */
export const MOSFET_DEFAULTS = { threshold: 2.1, k: 0.05 };
export const PMOSFET_DEFAULTS = { threshold: -2.1, k: 0.05 };

/** Bir Newton-Raphson iterasyonunda V_GS ve V_DS'in en fazla değişimi (karesel eğride sıçramayı önler). */
const MAX_GATE_STEP = 1;
const MAX_DRAIN_STEP = 5;

interface ChannelValue {
  readonly id: number;
  readonly gm: number;
  readonly gds: number;
}

/** V_DS ≥ 0 için kanal akımı ve türevleri. */
function channel(vgst: number, vds: number, beta: number): ChannelValue {
  if (vgst <= 0) return { id: 0, gm: 0, gds: 0 };
  const clm = 1 + FET_LAMBDA * vds;
  if (vds < vgst) {
    return {
      id: beta * vds * (2 * vgst - vds) * clm,
      gm: 2 * beta * vds * clm,
      gds: beta * (2 * vgst - 2 * vds) * clm + beta * vds * (2 * vgst - vds) * FET_LAMBDA,
    };
  }
  return { id: beta * vgst * vgst * clm, gm: 2 * beta * vgst * clm, gds: beta * vgst * vgst * FET_LAMBDA };
}

/** Kanal akımı (drain'den source'a) ve ∂/∂V_GS, ∂/∂V_DS; V_DS < 0 iken uçlar yer değiştirir. */
export function channelCurrent(vgs: number, vds: number, vt: number, beta: number): { id: number; dvgs: number; dvds: number } {
  if (vds >= 0) {
    const c = channel(vgs - vt, vds, beta);
    return { id: c.id + GMIN * vds, dvgs: c.gm, dvds: c.gds + GMIN };
  }
  // V_GD = V_GS − V_DS kapı-"source" gerilimi olur; akım ters yönde akar.
  const c = channel(vgs - vds - vt, -vds, beta);
  return { id: -c.id + GMIN * vds, dvgs: -c.gm, dvds: c.gm + c.gds + GMIN };
}

function regionOf(vgs: number, vds: number, vt: number): TransistorRegion {
  const vgst = (vds >= 0 ? vgs : vgs - vds) - vt;
  if (vgst <= 0) return 'cutoff';
  return Math.abs(vds) < vgst ? 'ohmic' : 'saturation';
}

/** Kontrol gerilimlerinin uç gerilimlerine göre katsayıları; uç sırası [D, G, S]. */
const CU = [0, 1, -1] as const; // u = V_GS
const CW = [1, 0, -1] as const; // w = V_DS

type FetType = 'njfet' | 'pjfet' | 'nmos' | 'pmos';

/** JFET ve MOSFET'in ortak kısmı. Pinler: [0] = drain (D), [1] = gate (G), [2] = source (S). */
abstract class FetDevice extends Device {
  abstract override readonly type: FetType;
  readonly sign: 1 | -1;
  /** Model (N kanal) cinsinden eşik/kısılma gerilimi ve β. */
  readonly vt: number;
  readonly beta: number;
  protected vgs = 0;
  protected vds = 0;
  private accepted = { vgs: 0, vds: 0 };
  private linear: readonly TerminalLinearization[] | null = null;

  constructor(init: DeviceInit, sign: 1 | -1, vt: number, beta: number) {
    super(init);
    this.sign = sign;
    this.vt = vt;
    this.beta = beta;
  }

  override get nonlinear(): boolean {
    return true;
  }

  protected controls(x: Float64Array): { vgs: number; vds: number } {
    const vd = this.v(x, 0);
    const vg = this.v(x, 1);
    const vs = this.v(x, 2);
    return { vgs: this.sign * (vg - vs), vds: this.sign * (vd - vs) };
  }

  /** Uçlara giren model akımları [D, G, S] ve türevleri. */
  protected abstract terminals(vgs: number, vds: number): TerminalLinearization[];

  /** Kontrol gerilimlerinin adımını sınırlar. */
  protected limit(raw: { vgs: number; vds: number }): { vgs: number; vds: number; limited: boolean } {
    const g = limitStep(raw.vgs, this.vgs, MAX_GATE_STEP);
    const d = limitStep(raw.vds, this.vds, MAX_DRAIN_STEP);
    return { vgs: g.v, vds: d.v, limited: g.limited || d.limited };
  }

  override stampNonlinear(sys: MnaSystem): void {
    const t = this.terminals(this.vgs, this.vds);
    this.linear = t;
    stampThreeTerminal(sys, this.nodes, this.sign, CU, CW, t, this.vgs, this.vds);
  }

  override updateIterate(x: Float64Array): boolean {
    const raw = this.controls(x);
    const next = this.limit(raw);
    let converged = !next.limited;
    if (converged && this.linear) {
      const actual = this.terminals(raw.vgs, raw.vds);
      const dvgs = raw.vgs - this.vgs;
      const dvds = raw.vds - this.vds;
      for (let k = 0; k < 2; k++) {
        const lin = this.linear[k]!;
        const predicted = lin.current + lin.du * dvgs + lin.dw * dvds;
        const real = actual[k]!.current;
        if (Math.abs(real - predicted) > NR_RELTOL * Math.max(Math.abs(real), Math.abs(predicted)) + NR_ABSTOL) converged = false;
      }
    }
    this.vgs = next.vgs;
    this.vds = next.vds;
    return converged;
  }

  override restoreIterate(): void {
    this.vgs = this.accepted.vgs;
    this.vds = this.accepted.vds;
  }

  override accept(): void {
    this.accepted = { vgs: this.vgs, vds: this.vds };
  }

  override pinCurrents(x: Float64Array): number[] {
    const { vgs, vds } = this.controls(x);
    return this.terminals(vgs, vds).map((t) => this.sign * t.current);
  }

  /** Ölçüm: gerilim V_DS, akım I_D (drain'e giren), güç V_DS·I_D. */
  measure(x: Float64Array): Measurement {
    const id = this.pinCurrents(x)[0]!;
    const vds = this.v(x, 0) - this.v(x, 2);
    return { voltage: vds, current: id, power: vds * id };
  }

  region(x: Float64Array): TransistorRegion {
    const { vgs, vds } = this.controls(x);
    return regionOf(vgs, vds, this.vt);
  }

  override status(x: Float64Array): DeviceStatus {
    const ig = this.pinCurrents(x)[1]!;
    return { region: this.region(x), control: { voltage: this.v(x, 1) - this.v(x, 2), current: ig } };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof FetDevice && prev.type === this.type) {
      this.vgs = prev.vgs;
      this.vds = prev.vds;
      this.accepted = prev.accepted;
    }
  }
}

/** Eklemli alan etkili transistör (JFET). Kapı-kanal eklemleri diyottur (ileri kutuplanırsa akım çeker). */
export class JfetDevice extends FetDevice {
  readonly type: 'njfet' | 'pjfet';
  readonly idss: number;
  readonly pinchOff: number;

  constructor(init: DeviceInit, type: 'njfet' | 'pjfet') {
    const defaults = type === 'njfet' ? JFET_DEFAULTS : PJFET_DEFAULTS;
    const sign = type === 'njfet' ? 1 : -1;
    const idss = Math.max(1e-9, numProp(init.props, 'idss', defaults.idss));
    // Kısılma gerilimi N kanalda negatif, P kanalda pozitiftir; modelde (N kanal) hep negatif.
    let pinchOff = numProp(init.props, 'pinchOff', defaults.pinchOff);
    if (pinchOff === 0) pinchOff = defaults.pinchOff;
    const vt = -Math.abs(pinchOff);
    super(init, sign, vt, idss / (vt * vt));
    this.type = type;
    this.idss = idss;
    this.pinchOff = pinchOff;
  }

  protected terminals(vgs: number, vds: number): TerminalLinearization[] {
    const ch = channelCurrent(vgs, vds, this.vt, this.beta);
    const vgd = vgs - vds;
    const egs = safeExp(vgs / THERMAL_VOLTAGE);
    const egd = safeExp(vgd / THERMAL_VOLTAGE);
    const igs = GATE_SATURATION * (egs - 1) + GMIN * vgs;
    const igd = GATE_SATURATION * (egd - 1) + GMIN * vgd;
    const ggs = (GATE_SATURATION / THERMAL_VOLTAGE) * egs + GMIN;
    const ggd = (GATE_SATURATION / THERMAL_VOLTAGE) * egd + GMIN;
    return [
      { current: ch.id - igd, du: ch.dvgs - ggd, dw: ch.dvds + ggd },
      { current: igs + igd, du: ggs + ggd, dw: -ggd },
      { current: -ch.id - igs, du: -ch.dvgs - ggs, dw: -ch.dvds },
    ];
  }

  /** Kapı eklemleri için diyot sınırlaması, ardından adım sınırlaması. */
  protected override limit(raw: { vgs: number; vds: number }): { vgs: number; vds: number; limited: boolean } {
    const gs = limitJunction(raw.vgs, this.vgs, THERMAL_VOLTAGE, GATE_VCRIT);
    const gd = limitJunction(raw.vgs - raw.vds, this.vgs - this.vds, THERMAL_VOLTAGE, GATE_VCRIT);
    const step = super.limit({ vgs: gs.v, vds: gs.v - gd.v });
    return { ...step, limited: step.limited || gs.limited || gd.limited };
  }
}

/** Kanal oluşturmalı (enhancement) MOSFET. Kapı yalıtılmıştır; gövde source'a bağlı kabul edilir. */
export class MosfetDevice extends FetDevice {
  readonly type: 'nmos' | 'pmos';
  readonly threshold: number;
  readonly k: number;

  constructor(init: DeviceInit, type: 'nmos' | 'pmos') {
    const defaults = type === 'nmos' ? MOSFET_DEFAULTS : PMOSFET_DEFAULTS;
    const sign = type === 'nmos' ? 1 : -1;
    const threshold = numProp(init.props, 'threshold', defaults.threshold);
    const k = Math.max(1e-9, numProp(init.props, 'k', defaults.k));
    // Eşik N kanalda pozitif, P kanalda negatiftir; modelde (N kanal) hep pozitif.
    super(init, sign, Math.abs(threshold), k);
    this.type = type;
    this.threshold = threshold;
    this.k = k;
  }

  protected terminals(vgs: number, vds: number): TerminalLinearization[] {
    const ch = channelCurrent(vgs, vds, this.vt, this.beta);
    return [
      { current: ch.id, du: ch.dvgs, dw: ch.dvds },
      { current: 0, du: 0, dw: 0 },
      { current: -ch.id, du: -ch.dvgs, dw: -ch.dvds },
    ];
  }
}

const fetModel = (type: FetType, create: (init: DeviceInit) => Device): DeviceModel => ({
  type,
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create,
});

export const njfetModel = fetModel('njfet', (init) => new JfetDevice(init, 'njfet'));
export const pjfetModel = fetModel('pjfet', (init) => new JfetDevice(init, 'pjfet'));
export const nmosModel = fetModel('nmos', (init) => new MosfetDevice(init, 'nmos'));
export const pmosModel = fetModel('pmos', (init) => new MosfetDevice(init, 'pmos'));
