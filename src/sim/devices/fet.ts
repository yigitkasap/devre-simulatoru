import { GMIN, NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp, strProp } from '../netlist';
import {
  Device,
  type DeviceInit,
  type DeviceModel,
  type DeviceStatus,
  type Measurement,
  type StepContext,
  type TransistorRegion,
} from './device';
import { ChargeState, criticalVoltage, depletionCharge, limitJunction, safeExp, type DepletionParams } from './junction';
import { limitStep, stampThreeTerminal, type TerminalLinearization } from './threeTerminal';

// Alan etkili transistörler (JFET ve kanal oluşturmalı MOSFET), kare yasası (Shichman-Hodges):
//   kesim     V_GS − V_t ≤ 0:          I_D = 0
//   omik      V_DS < V_GS − V_t:      I_D = β·V_DS·(2·(V_GS − V_t) − V_DS)·(1 + λ·V_DS)
//   doyum     V_DS ≥ V_GS − V_t:      I_D = β·(V_GS − V_t)²·(1 + λ·V_DS)
// JFET'te V_t = V_P (kısılma gerilimi) ve β = I_DSS / V_P²  ⇒  doyumda I_D = I_DSS·(1 − V_GS/V_P)².
// MOSFET'te V_t eşik gerilimi ve β = k  ⇒  doyumda I_D = k·(V_GS − V_T)².
// Kanal simetriktir: V_DS < 0 iken drain ve source yer değiştirir. P kanallıda bütün gerilim ve
// akımlar ters işaretlidir (model N kanal için yazılır).

/** Kanal boyu modülasyonu (doyumdaki eğim): eski genel modellerde iki tür için de. */
export const FET_LAMBDA = 0.01;

/**
 * JFET: 2N5457 benzeri (veri sayfası: I_DSS 1–5 mA, V_GS(off) −0,5…−6 V); varsayılan
 * I_DSS = 3 mA, V_P = −1,5 V (P kanallıda +1,5 V). Kapı eklemleri Is = 10⁻¹⁴ A'lik diyotlardır.
 */
export const JFET_DEFAULTS = { idss: 3e-3, pinchOff: -1.5 };
export const PJFET_DEFAULTS = { idss: 3e-3, pinchOff: 1.5 };
const GATE_SATURATION = 1e-14;

/**
 * MOSFET: 2N7000 benzeri (veri sayfası V_GS(th) 0,8–3 V, tipik 2,1 V; V_GS = 4,5 V'ta I_D(on) ≥ 75 mA).
 * Varsayılan V_T = 2,1 V (P kanallıda −2,1 V), k = 50 mA/V². Kapı yalıtılmıştır (akım çekmez).
 */
export const MOSFET_DEFAULTS = { threshold: 2.1, k: 0.05 };
export const PMOSFET_DEFAULTS = { threshold: -2.1, k: 0.05 };

/**
 * Föydeki N kanallı JFET: BF245A. NXP'nin SPICE kartından (Philips/NXP, NJF):
 *   VTO = −1,737 V, BETA = 1,166 mA/V²  ⇒  I_DSS = BETA·VTO² ≈ 3,52 mA (veri sayfası: 2–6,5 mA)
 *   LAMBDA = 0,0177 V⁻¹, IS = 2,9·10⁻¹⁶ A, CGS = CGD = 2,2 pF (0 V), PB = 0,78 V (M = 0,5)
 * Kartın 9 Ω'luk drain ve source dirençleri ihmal edildi (birkaç mA'de V_GS'te ≈ 30 mV fark).
 * "2N5457" seçeneği eski (kapasitesiz) modeldir; "model" özelliği olmayan kayıtlar onu kullanır.
 */
export const NJFET_MODELS = ['BF245A', '2N5457'] as const;
export type NjfetModelName = (typeof NJFET_MODELS)[number];
export const NJFET_DEFAULTS = { model: 'BF245A' as NjfetModelName, idss: 3.52e-3, pinchOff: -1.74 };
export const NJFET_LEGACY_MODEL: NjfetModelName = '2N5457';
export const NJFET_PRESETS: Readonly<Record<NjfetModelName, { idss: number; pinchOff: number }>> = {
  BF245A: { idss: NJFET_DEFAULTS.idss, pinchOff: NJFET_DEFAULTS.pinchOff },
  '2N5457': JFET_DEFAULTS,
};

/**
 * Föydeki N kanallı MOSFET: IRF510 (100 V, 5,6 A güç MOSFET'i).
 *   V_T = 3,83 V, k = KP/2 = 1,24 A/V² (IRF510 için yaygın MODPEX SPICE kartı: VTO = 3,827 V,
 *   KP = 2,485 A/V², W = L); veri sayfası V_GS(th) 2–4 V. λ = 0,003 V⁻¹ (varsayım: güç
 *   MOSFET'lerinin çıkış eğrileri doyumda neredeyse yataydır).
 *   Kapasiteler Vishay veri sayfasından (V_GS = 0, V_DS = 25 V): C_iss = 180 pF, C_oss = 81 pF,
 *   C_rss = 15 pF  ⇒  C_GS = 165 pF (sabit), C_GD 25 V'ta 15 pF, C_DS 25 V'ta 66 pF. C_GD ve
 *   C_DS (gövde diyodunun kapasitesi), düşük V_DS'te güç MOSFET'lerindeki gibi büyür (eklem
 *   kapasitesi biçiminde: C_GD0 = 107 pF, V_J = 0,5 V; C_DS0 = 375 pF, V_J = 0,8 V; M = 0,5).
 *   Gövde diyodunun doğru akım davranışı ve iç dirençler (≈ 0,5 Ω) modellenmez.
 * "2N7000" seçeneği eski (kapasitesiz) modeldir; "model" özelliği olmayan kayıtlar onu kullanır.
 */
export const NMOS_MODELS = ['IRF510', '2N7000'] as const;
export type NmosModelName = (typeof NMOS_MODELS)[number];
export const NMOS_DEFAULTS = { model: 'IRF510' as NmosModelName, threshold: 3.83, k: 1.24 };
export const NMOS_LEGACY_MODEL: NmosModelName = '2N7000';
export const NMOS_PRESETS: Readonly<Record<NmosModelName, { threshold: number; k: number }>> = {
  IRF510: { threshold: NMOS_DEFAULTS.threshold, k: NMOS_DEFAULTS.k },
  '2N7000': MOSFET_DEFAULTS,
};

/** Modelin kanal ve kapasite parametreleri (eski modellerde kapasite yok). */
interface FetDynamics {
  readonly lambda: number;
  /** Kapı-source kapasitesi: eklem biçiminde (JFET) ya da sabit (MOSFET, m = 0). */
  readonly cgs: DepletionParams | null;
  readonly cgd: DepletionParams | null;
  /** Drain-source kapasitesi (MOSFET gövde diyodu); ileri yönü source → drain. */
  readonly cds: DepletionParams | null;
  /** JFET kapı eklemlerinin doyma akımı. */
  readonly gateSaturation: number;
}

const LEGACY_DYNAMICS: FetDynamics = { lambda: FET_LAMBDA, cgs: null, cgd: null, cds: null, gateSaturation: GATE_SATURATION };

const NJFET_DYNAMICS: Readonly<Record<NjfetModelName, FetDynamics>> = {
  BF245A: {
    lambda: 0.0177,
    cgs: { cj0: 2.2e-12, vj: 0.78, m: 0.5 },
    cgd: { cj0: 2.2e-12, vj: 0.78, m: 0.5 },
    cds: null,
    gateSaturation: 2.9e-16,
  },
  '2N5457': LEGACY_DYNAMICS,
};

const NMOS_DYNAMICS: Readonly<Record<NmosModelName, FetDynamics>> = {
  IRF510: {
    lambda: 0.003,
    cgs: { cj0: 165e-12, vj: 1, m: 0 },
    cgd: { cj0: 107e-12, vj: 0.5, m: 0.5 },
    cds: { cj0: 375e-12, vj: 0.8, m: 0.5 },
    gateSaturation: GATE_SATURATION,
  },
  '2N7000': LEGACY_DYNAMICS,
};

/** Bir Newton-Raphson iterasyonunda V_GS ve V_DS'in en fazla değişimi (karesel eğride sıçramayı önler). */
const MAX_GATE_STEP = 1;
const MAX_DRAIN_STEP = 5;

interface ChannelValue {
  readonly id: number;
  readonly gm: number;
  readonly gds: number;
}

/** V_DS ≥ 0 için kanal akımı ve türevleri. */
function channel(vgst: number, vds: number, beta: number, lambda: number): ChannelValue {
  if (vgst <= 0) return { id: 0, gm: 0, gds: 0 };
  const clm = 1 + lambda * vds;
  if (vds < vgst) {
    return {
      id: beta * vds * (2 * vgst - vds) * clm,
      gm: 2 * beta * vds * clm,
      gds: beta * (2 * vgst - 2 * vds) * clm + beta * vds * (2 * vgst - vds) * lambda,
    };
  }
  return { id: beta * vgst * vgst * clm, gm: 2 * beta * vgst * clm, gds: beta * vgst * vgst * lambda };
}

/** Kanal akımı (drain'den source'a) ve ∂/∂V_GS, ∂/∂V_DS; V_DS < 0 iken uçlar yer değiştirir. */
export function channelCurrent(
  vgs: number,
  vds: number,
  vt: number,
  beta: number,
  lambda = FET_LAMBDA,
): { id: number; dvgs: number; dvds: number } {
  if (vds >= 0) {
    const c = channel(vgs - vt, vds, beta, lambda);
    return { id: c.id + GMIN * vds, dvgs: c.gm, dvds: c.gds + GMIN };
  }
  // V_GD = V_GS − V_DS kapı-"source" gerilimi olur; akım ters yönde akar.
  const c = channel(vgs - vds - vt, -vds, beta, lambda);
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
  /** Seçilen parça modeli (P kanallılarda yalnızca eski model vardır: null). */
  readonly model: string | null;
  protected readonly dynamics: FetDynamics;
  /** Kapasitelerin geri Euler durumu: G-S, G-D, D-S. */
  private readonly charges = [new ChargeState(), new ChargeState(), new ChargeState()] as const;
  protected vgs = 0;
  protected vds = 0;
  private accepted = { vgs: 0, vds: 0 };
  private linear: readonly TerminalLinearization[] | null = null;

  constructor(init: DeviceInit, sign: 1 | -1, vt: number, beta: number, model: string | null, dynamics: FetDynamics) {
    super(init);
    this.sign = sign;
    this.vt = vt;
    this.beta = beta;
    this.model = model;
    this.dynamics = dynamics;
  }

  private get hasCharges(): boolean {
    const d = this.dynamics;
    return d.cgs !== null || d.cgd !== null || d.cds !== null;
  }

  /**
   * Kapasite yükleri (ileri yön gerilimiyle): G-S'de V_GS, G-D'de V_GD = V_GS − V_DS,
   * D-S'de (gövde diyodu, anot source) V_SD = −V_DS.
   */
  private chargesAt(vgs: number, vds: number): [{ q: number; c: number }, { q: number; c: number }, { q: number; c: number }] {
    const d = this.dynamics;
    const none = { q: 0, c: 0 };
    return [
      d.cgs ? depletionCharge(vgs, d.cgs) : none,
      d.cgd ? depletionCharge(vgs - vds, d.cgd) : none,
      d.cds ? depletionCharge(-vds, d.cds) : none,
    ];
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

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    let t = this.terminals(this.vgs, this.vds);
    this.linear = t;
    if (this.hasCharges && ctx.h > 0) {
      const [gs, gd, ds] = this.chargesAt(this.vgs, this.vds);
      const igs = this.charges[0].companion(gs.q, gs.c, ctx.h);
      const igd = this.charges[1].companion(gd.q, gd.c, ctx.h);
      const ids = this.charges[2].companion(ds.q, ds.c, ctx.h);
      t = addCapacitiveCurrents(t, igs, igd, ids);
    }
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

  override accept(_x: Float64Array, ctx: StepContext): void {
    this.accepted = { vgs: this.vgs, vds: this.vds };
    if (this.hasCharges) {
      const q = this.chargesAt(this.vgs, this.vds);
      this.charges.forEach((state, k) => state.accept(q[k]!.q, ctx.h));
    }
  }

  /** Uçlara giren akımlar (yük modelinde son adımın kapasite akımları dahil). */
  override pinCurrents(x: Float64Array): number[] {
    const { vgs, vds } = this.controls(x);
    let t = this.terminals(vgs, vds);
    if (this.hasCharges) {
      const [gs, gd, ds] = this.charges.map((s) => ({ i: s.current, g: 0 })) as [ChargeCompanion, ChargeCompanion, ChargeCompanion];
      t = addCapacitiveCurrents(t, gs, gd, ds);
    }
    return t.map((terminal) => this.sign * terminal.current);
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
      if (prev.model === this.model) this.charges.forEach((state, k) => state.copyFrom(prev.charges[k]!));
    }
  }
}

interface ChargeCompanion {
  readonly i: number;
  readonly g: number;
}

/**
 * Kapasite akımlarını uç akımlarına ekler (uç sırası [D, G, S]; u = V_GS, w = V_DS).
 *   G-S: kapıdan girer, source'tan çıkar; ∂/∂u = g.
 *   G-D: kapıdan girer, drain'den çıkar; V_GD = u − w ⇒ ∂/∂u = g, ∂/∂w = −g.
 *   D-S: source'tan girer (gövde diyodunun anodu), drain'den çıkar; V_SD = −w ⇒ ∂/∂w = −g.
 */
function addCapacitiveCurrents(
  t: readonly TerminalLinearization[],
  gs: ChargeCompanion,
  gd: ChargeCompanion,
  ds: ChargeCompanion,
): TerminalLinearization[] {
  const [d, g, s] = t as [TerminalLinearization, TerminalLinearization, TerminalLinearization];
  return [
    { current: d.current - gd.i - ds.i, du: d.du - gd.g, dw: d.dw + gd.g + ds.g },
    { current: g.current + gs.i + gd.i, du: g.du + gs.g + gd.g, dw: g.dw - gd.g },
    { current: s.current - gs.i + ds.i, du: s.du - gs.g, dw: s.dw - ds.g },
  ];
}

/** Eklemli alan etkili transistör (JFET). Kapı-kanal eklemleri diyottur (ileri kutuplanırsa akım çeker). */
export class JfetDevice extends FetDevice {
  readonly type: 'njfet' | 'pjfet';
  readonly idss: number;
  readonly pinchOff: number;

  private readonly gateVcrit: number;

  constructor(init: DeviceInit, type: 'njfet' | 'pjfet') {
    const model = type === 'njfet' ? strProp(init.props, 'model', NJFET_MODELS, NJFET_LEGACY_MODEL) : null;
    const defaults = model ? NJFET_PRESETS[model] : PJFET_DEFAULTS;
    const sign = type === 'njfet' ? 1 : -1;
    const idss = Math.max(1e-9, numProp(init.props, 'idss', defaults.idss));
    // Kısılma gerilimi N kanalda negatif, P kanalda pozitiftir; modelde (N kanal) hep negatif.
    let pinchOff = numProp(init.props, 'pinchOff', defaults.pinchOff);
    if (pinchOff === 0) pinchOff = defaults.pinchOff;
    const vt = -Math.abs(pinchOff);
    super(init, sign, vt, idss / (vt * vt), model, model ? NJFET_DYNAMICS[model] : LEGACY_DYNAMICS);
    this.type = type;
    this.idss = idss;
    this.pinchOff = pinchOff;
    this.gateVcrit = criticalVoltage(THERMAL_VOLTAGE, this.dynamics.gateSaturation);
  }

  protected terminals(vgs: number, vds: number): TerminalLinearization[] {
    const ch = channelCurrent(vgs, vds, this.vt, this.beta, this.dynamics.lambda);
    const is = this.dynamics.gateSaturation;
    const vgd = vgs - vds;
    const egs = safeExp(vgs / THERMAL_VOLTAGE);
    const egd = safeExp(vgd / THERMAL_VOLTAGE);
    const igs = is * (egs - 1) + GMIN * vgs;
    const igd = is * (egd - 1) + GMIN * vgd;
    const ggs = (is / THERMAL_VOLTAGE) * egs + GMIN;
    const ggd = (is / THERMAL_VOLTAGE) * egd + GMIN;
    return [
      { current: ch.id - igd, du: ch.dvgs - ggd, dw: ch.dvds + ggd },
      { current: igs + igd, du: ggs + ggd, dw: -ggd },
      { current: -ch.id - igs, du: -ch.dvgs - ggs, dw: -ch.dvds },
    ];
  }

  /** Kapı eklemleri için diyot sınırlaması, ardından adım sınırlaması. */
  protected override limit(raw: { vgs: number; vds: number }): { vgs: number; vds: number; limited: boolean } {
    const gs = limitJunction(raw.vgs, this.vgs, THERMAL_VOLTAGE, this.gateVcrit);
    const gd = limitJunction(raw.vgs - raw.vds, this.vgs - this.vds, THERMAL_VOLTAGE, this.gateVcrit);
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
    const model = type === 'nmos' ? strProp(init.props, 'model', NMOS_MODELS, NMOS_LEGACY_MODEL) : null;
    const defaults = model ? NMOS_PRESETS[model] : PMOSFET_DEFAULTS;
    const sign = type === 'nmos' ? 1 : -1;
    const threshold = numProp(init.props, 'threshold', defaults.threshold);
    const k = Math.max(1e-9, numProp(init.props, 'k', defaults.k));
    // Eşik N kanalda pozitif, P kanalda negatiftir; modelde (N kanal) hep pozitif.
    super(init, sign, Math.abs(threshold), k, model, model ? NMOS_DYNAMICS[model] : LEGACY_DYNAMICS);
    this.type = type;
    this.threshold = threshold;
    this.k = k;
  }

  protected terminals(vgs: number, vds: number): TerminalLinearization[] {
    const ch = channelCurrent(vgs, vds, this.vt, this.beta, this.dynamics.lambda);
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
