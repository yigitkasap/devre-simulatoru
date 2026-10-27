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
import { ChargeState, criticalVoltage, depletionCharge, limitJunction, safeExp, safeExpSlope, type ChargeParams } from './junction';
import { stampThreeTerminal, type TerminalLinearization } from './threeTerminal';

/**
 * Küçük sinyal BJT parametreleri (BC547B / BC557B benzeri genel amaçlı transistör).
 *   Is  = 2,39·10⁻¹⁴ A  (NXP BC547B SPICE modeli; 1 mA'de V_BE ≈ 0,63 V)
 *   β_F = 200 (varsayılan; BC547B için veri sayfası aralığı 200–450), özellik penceresinden değişir
 *   β_R = 7,9,  V_A (Early gerilimi) = 63 V  (aynı model)
 */
export const BJT_PARAMS = { saturationCurrent: 2.39e-14, reverseBeta: 7.9, earlyVoltage: 63.2 };
export const BJT_DEFAULTS = { beta: 200 };

/**
 * NPN modelleri. BC107 föydeki transistördür; BC547 ile aynı yonga ailesidir (BC547, BC107'nin
 * plastik kılıflı karşılığı). Doğru akım parametreleri yukarıdakilerle aynıdır ve BC107 veri
 * sayfasıyla (Central Semiconductor) tutar: 2 mA'de V_BE 0,55–0,7 V (modelde 0,65 V), h_FE 110–450.
 * BC107'de eklem yükleri de vardır (NXP BC547B SPICE kartından):
 *   B-E: C_je = 13,6 pF, V_je = 0,65 V, M_je = 0,33;  τ_F = 0,44 ns  (f_T ≈ 300 MHz; veri sayfası ≥ 150 MHz)
 *   B-C: C_jc = 3,7 pF,  V_jc = 0,40 V, M_jc = 0,30  (10 V'ta ≈ 1,4 pF; veri sayfası C_ob ≤ 4,5 pF)
 *   FC = 0,9579 (karttan; boşluk kapasitesinin doğrusal uzatıldığı yer).
 * Bu kapasiteler yükseltecin kazancını yüksek frekansta düşürür (Miller etkisi).
 * BC107'nin doğru akım modeli de kartın Gummel-Poon modelidir (ngspice bjtload.c; GUMMEL_POON):
 * düşük akımda B-E sızıntısı (ISE, NE) β'yı düşürür, yüksek akımda yüksek enjeksiyon (IKF) da
 * düşürür; ters Early gerilimi (VAR) ve emisyon katsayıları (NF, NR) da vardır. β özelliği kartın
 * ideal BF'sidir: 2 mA'de etkin h_FE ≈ β, 100 mA'de ≈ %30 düşük. Seri dirençler (RB = 1 Ω,
 * RE = 0,47 Ω, RC = 0,85 Ω) iç düğüm gerektirir; föydeki akımlarda etkileri ölçüm belirsizliğinin
 * altında olduğu için modellenmez.
 * "BC547B" seçeneği eski (yüksüz) modeldir; "model" özelliği olmayan kayıtlar onu kullanır.
 */
export const NPN_MODELS = ['BC107', 'BC547B'] as const;
export type NpnModelName = (typeof NPN_MODELS)[number];
export const NPN_DEFAULTS = { model: 'BC107' as NpnModelName, beta: 200 };
export const NPN_LEGACY_MODEL: NpnModelName = 'BC547B';

interface BjtCharges {
  readonly be: ChargeParams;
  readonly bc: ChargeParams;
}

const NPN_CHARGES: Readonly<Record<NpnModelName, BjtCharges | null>> = {
  BC107: {
    be: { cj0: 13.58e-12, vj: 0.65, m: 0.3279, tt: 0.4391e-9, fc: 0.9579 },
    bc: { cj0: 3.728e-12, vj: 0.3997, m: 0.2955, tt: 0, fc: 0.9579 },
  },
  BC547B: null,
};

/** Gummel-Poon kartının doğru akım parametreleri (NXP BC547B; BF yerine β özelliği). */
export interface GummelPoon {
  readonly is: number;
  readonly nf: number;
  readonly nr: number;
  readonly ise: number;
  readonly ne: number;
  readonly isc: number;
  readonly nc: number;
  readonly br: number;
  readonly ikf: number;
  readonly ikr: number;
  readonly vaf: number;
  readonly var: number;
}

export const GUMMEL_POON: Readonly<Record<NpnModelName, GummelPoon | null>> = {
  BC107: { is: 2.39e-14, nf: 1.008, nr: 1.004, ise: 3.545e-15, ne: 1.541, isc: 6.272e-14, nc: 1.243, br: 7.946, ikf: 0.1357, ikr: 0.1144, vaf: 63.2, var: 25.9 },
  BC547B: null,
};

const VT = THERMAL_VOLTAGE;
const VCRIT = criticalVoltage(VT, BJT_PARAMS.saturationCurrent);

/** Kontrol gerilimlerinin uç gerilimlerine göre katsayıları; uç sırası [C, B, E]. */
const CU = [0, 1, -1] as const; // u = V_BE = v(B) − v(E)
const CW = [-1, 1, 0] as const; // w = V_BC = v(B) − v(C)

interface BjtEvaluation {
  /** Kollektöre ve baza giren model akımları. */
  readonly collector: TerminalLinearization;
  readonly base: TerminalLinearization;
}

/**
 * Ebers-Moll taşıma modeli (Early etkisiyle). NPN için; PNP'de bütün gerilim ve akımlar ters işaretlidir.
 *   I_F = Is·(e^{V_BE/VT} − 1),   I_R = Is·(e^{V_BC/VT} − 1)
 *   I_CT = (I_F − I_R)·(1 − V_BC/V_A)                  (taşıma akımı; V_BC < 0 iken artar)
 *   I_C = I_CT − I_R/β_R,   I_B = I_F/β_F + I_R/β_R,   I_E = −(I_C + I_B)
 * Her eklemin paralelinde gmin vardır.
 */
export function evaluateBjt(vbe: number, vbc: number, beta: number): BjtEvaluation {
  const { saturationCurrent: is, reverseBeta: br, earlyVoltage: va } = BJT_PARAMS;
  const ef = safeExp(vbe / VT);
  const er = safeExp(vbc / VT);
  const iF = is * (ef - 1);
  const iR = is * (er - 1);
  const gF = (is / VT) * safeExpSlope(vbe / VT);
  const gR = (is / VT) * safeExpSlope(vbc / VT);
  // Early çarpanı; doyumda V_BC > 0 iken çok küçülmesin.
  const k = Math.max(0.05, 1 - vbc / va);
  const kSlope = 1 - vbc / va > 0.05 ? -1 / va : 0;
  const transport = (iF - iR) * k;
  return {
    collector: {
      current: transport - iR / br - GMIN * vbc,
      du: gF * k,
      dw: -gR * k + (iF - iR) * kSlope - gR / br - GMIN,
    },
    base: {
      current: iF / beta + iR / br + GMIN * (vbe + vbc),
      du: gF / beta + GMIN,
      dw: gR / br + GMIN,
    },
  };
}

/** Bir eklem diyodunun akımı ve iletkenliği: I = Is·(e^{v/(N·VT)} − 1). */
function diodeTerm(is: number, v: number, nvt: number): { i: number; g: number } {
  if (is <= 0) return { i: 0, g: 0 };
  return { i: is * (safeExp(v / nvt) - 1), g: (is / nvt) * safeExpSlope(v / nvt) };
}

/**
 * Gummel-Poon modeli (ngspice bjtload.c ile aynı denklemler, seri dirençsiz):
 *   I_F = IS·(e^{V_BE/(NF·VT)} − 1),  I_R = IS·(e^{V_BC/(NR·VT)} − 1)
 *   q1 = 1/(1 − V_BC/VAF − V_BE/VAR),  q2 = I_F/IKF + I_R/IKR,  q_b = q1·(1 + √(1 + 4·q2))/2
 *   I_C = (I_F − I_R)/q_b − I_R/BR − I_SC,   I_B = I_F/BF + I_SE + I_R/BR + I_SC
 *   I_SE = ISE·(e^{V_BE/(NE·VT)} − 1),  I_SC = ISC·(e^{V_BC/(NC·VT)} − 1)
 * Yalnızca VAF verilip IKF, VAR sonsuzken Ebers-Moll + Early (evaluateBjt) ile aynıdır.
 */
export function evaluateGummelPoon(vbe: number, vbc: number, bf: number, p: GummelPoon): BjtEvaluation {
  const f = diodeTerm(p.is, vbe, p.nf * VT);
  const r = diodeTerm(p.is, vbc, p.nr * VT);
  const se = diodeTerm(p.ise, vbe, p.ne * VT);
  const sc = diodeTerm(p.isc, vbc, p.nc * VT);
  // q1: Early etkisi (ileri ve ters); doyumda payda çok küçülmesin (evaluateBjt'deki gibi).
  const denominator = 1 - vbc / p.vaf - vbe / p.var;
  const early = denominator > 0.05;
  const q1 = 1 / (early ? denominator : 0.05);
  const q2 = f.i / p.ikf + r.i / p.ikr;
  const sq = Math.sqrt(Math.max(0, 1 + 4 * q2));
  const qb = (q1 * (1 + sq)) / 2;
  const dqbdve = q1 * ((early ? qb / p.var : 0) + (sq > 0 ? f.g / p.ikf / sq : 0));
  const dqbdvc = q1 * ((early ? qb / p.vaf : 0) + (sq > 0 ? r.g / p.ikr / sq : 0));
  const transport = (f.i - r.i) / qb;
  return {
    collector: {
      current: transport - r.i / p.br - sc.i - GMIN * vbc,
      du: f.g / qb - (transport * dqbdve) / qb,
      dw: -r.g / qb - (transport * dqbdvc) / qb - r.g / p.br - sc.g - GMIN,
    },
    base: {
      current: f.i / bf + se.i + r.i / p.br + sc.i + GMIN * (vbe + vbc),
      du: f.g / bf + se.g + GMIN,
      dw: r.g / p.br + sc.g + GMIN,
    },
  };
}

/**
 * Eklem yükü (boşluk + difüzyon): Q = Q_boşluk(v) + τ·Is·(e^{v/VT} − 1). Taşıma akımındaki
 * Early çarpanı ihmal edilir (SPICE'ın τ_F·I_F'si gibi).
 */
function junctionCharge(v: number, p: ChargeParams, nvt = VT): { q: number; c: number } {
  const dep = depletionCharge(v, p);
  if (p.tt <= 0) return dep;
  const is = BJT_PARAMS.saturationCurrent;
  const e = safeExp(v / nvt);
  return { q: dep.q + p.tt * is * (e - 1), c: dep.c + (p.tt * is * safeExpSlope(v / nvt)) / nvt };
}

/** Bipolar transistör. Pinler: [0] = kollektör (C), [1] = baz (B), [2] = emetör (E). */
export class BjtDevice extends Device {
  readonly type: 'npn' | 'pnp';
  readonly sign: 1 | -1;
  readonly beta: number;
  /** NPN modeli (PNP'de yalnızca eski model vardır). */
  readonly model: NpnModelName | null;
  private readonly charges: BjtCharges | null;
  /** Gummel-Poon kartı (BC107); yoksa Ebers-Moll + Early (eski BC547B ve PNP). */
  readonly gp: GummelPoon | null;

  /** Uç akımları ve türevleri: kart varsa Gummel-Poon, yoksa Ebers-Moll + Early. */
  private evaluate(vbe: number, vbc: number): BjtEvaluation {
    return this.gp ? evaluateGummelPoon(vbe, vbc, this.beta, this.gp) : evaluateBjt(vbe, vbc, this.beta);
  }

  /** Eklemlerin N·VT'si (difüzyon yükü için). */
  private get nvtF(): number {
    return (this.gp?.nf ?? 1) * VT;
  }

  private get nvtR(): number {
    return (this.gp?.nr ?? 1) * VT;
  }
  /** B-E ve B-C eklem yüklerinin integrasyon durumu. */
  private readonly chargeBe = new ChargeState();
  private readonly chargeBc = new ChargeState();
  /** Newton-Raphson'un doğrusallaştırma noktası (model gerilimleri V_BE, V_BC). */
  private vbe = 0;
  private vbc = 0;
  private accepted = { vbe: 0, vbc: 0 };
  private linear: BjtEvaluation | null = null;

  constructor(init: DeviceInit, type: 'npn' | 'pnp') {
    super(init);
    this.type = type;
    this.sign = type === 'npn' ? 1 : -1;
    this.beta = Math.max(1, numProp(init.props, 'beta', BJT_DEFAULTS.beta));
    this.model = type === 'npn' ? strProp(init.props, 'model', NPN_MODELS, NPN_LEGACY_MODEL) : null;
    this.charges = this.model ? NPN_CHARGES[this.model] : null;
    this.gp = this.model ? GUMMEL_POON[this.model] : null;
  }

  override get nonlinear(): boolean {
    return true;
  }

  /** Uç gerilimlerinden model gerilimleri: V_BE ve V_BC (PNP'de işaret ters). */
  private controls(x: Float64Array): { vbe: number; vbc: number } {
    const vc = this.v(x, 0);
    const vb = this.v(x, 1);
    const ve = this.v(x, 2);
    return { vbe: this.sign * (vb - ve), vbc: this.sign * (vb - vc) };
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    const e = this.evaluate(this.vbe, this.vbc);
    this.linear = e;
    let collector = e.collector;
    let base = e.base;
    if (this.charges && ctx.h > 0) {
      // Eklem yüklerinin akımları: B-E yükü bazdan emetöre, B-C yükü bazdan kollektöre akar.
      const be = junctionCharge(this.vbe, this.charges.be, this.nvtF);
      const bc = junctionCharge(this.vbc, this.charges.bc, this.nvtR);
      const ibe = this.chargeBe.companion(be.q, be.c, ctx);
      const ibc = this.chargeBc.companion(bc.q, bc.c, ctx);
      collector = { current: collector.current - ibc.i, du: collector.du, dw: collector.dw - ibc.g };
      base = { current: base.current + ibe.i + ibc.i, du: base.du + ibe.g, dw: base.dw + ibc.g };
    }
    const emitter: TerminalLinearization = {
      current: -(collector.current + base.current),
      du: -(collector.du + base.du),
      dw: -(collector.dw + base.dw),
    };
    stampThreeTerminal(sys, this.nodes, this.sign, CU, CW, [collector, base, emitter], this.vbe, this.vbc);
  }

  override updateIterate(x: Float64Array): boolean {
    const raw = this.controls(x);
    const be = limitJunction(raw.vbe, this.vbe, VT, VCRIT);
    const bc = limitJunction(raw.vbc, this.vbc, VT, VCRIT);
    let converged = !be.limited && !bc.limited;
    if (converged && this.linear) {
      // Akım yakınsaması: doğrusal tahmin ile gerçek eğri arasındaki fark.
      const actual = this.evaluate(raw.vbe, raw.vbc);
      const dvbe = raw.vbe - this.vbe;
      const dvbc = raw.vbc - this.vbc;
      for (const key of ['collector', 'base'] as const) {
        const lin = this.linear[key];
        const predicted = lin.current + lin.du * dvbe + lin.dw * dvbc;
        const tolerance = NR_RELTOL * Math.max(Math.abs(actual[key].current), Math.abs(predicted)) + NR_ABSTOL;
        if (Math.abs(actual[key].current - predicted) > tolerance) converged = false;
      }
    }
    this.vbe = be.v;
    this.vbc = bc.v;
    return converged;
  }

  override restoreIterate(): void {
    this.vbe = this.accepted.vbe;
    this.vbc = this.accepted.vbc;
  }

  override accept(_x: Float64Array, ctx: StepContext): void {
    this.accepted = { vbe: this.vbe, vbc: this.vbc };
    if (this.charges) {
      this.chargeBe.accept(junctionCharge(this.vbe, this.charges.be, this.nvtF).q, ctx);
      this.chargeBc.accept(junctionCharge(this.vbc, this.charges.bc, this.nvtR).q, ctx);
    }
  }

  /** Yük modeli olan transistörde B-E ve B-C eklem gerilimleri. */
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    if (!this.charges) return [];
    const [c, b, e] = this.nodes as [number, number, number];
    return [
      [b, e],
      [b, c],
    ];
  }

  /** Kollektöre, baza ve emetöre giren gerçek akımlar (yük modelinde son adımın yük akımları dahil). */
  override pinCurrents(x: Float64Array): number[] {
    const { vbe, vbc } = this.controls(x);
    const e = this.evaluate(vbe, vbc);
    let ic = e.collector.current;
    let ib = e.base.current;
    if (this.charges) {
      ic -= this.chargeBc.current;
      ib += this.chargeBe.current + this.chargeBc.current;
    }
    ic *= this.sign;
    ib *= this.sign;
    return [ic, ib, -(ic + ib)];
  }

  /** Ölçüm: gerilim V_CE, akım I_C (kollektöre giren), güç V_CE·I_C + V_BE·I_B. */
  measure(x: Float64Array): Measurement {
    const [ic, ib] = this.pinCurrents(x) as [number, number, number];
    const vce = this.v(x, 0) - this.v(x, 2);
    const vbe = this.v(x, 1) - this.v(x, 2);
    return { voltage: vce, current: ic, power: vce * ic + vbe * ib };
  }

  /**
   * Çalışma bölgesi: B-E eklemi iletimde değilse kesim (yalnızca B-C eklemi iletiyorsa ters aktif:
   * kollektör ile emetör yer değiştirmiş, β_R ≈ 8), B-C eklemi de iletimdeyse doyum.
   */
  region(x: Float64Array): TransistorRegion {
    const { vbe, vbc } = this.controls(x);
    if (vbe < 0.5) return vbc >= 0.5 ? 'reverse' : 'cutoff';
    return vbc > 0.4 ? 'saturation' : 'active';
  }

  override status(x: Float64Array): DeviceStatus {
    const ib = this.pinCurrents(x)[1]!;
    return { region: this.region(x), control: { voltage: this.v(x, 1) - this.v(x, 2), current: ib } };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof BjtDevice && prev.type === this.type) {
      this.vbe = prev.vbe;
      this.vbc = prev.vbc;
      this.accepted = prev.accepted;
      if (prev.model === this.model) {
        this.chargeBe.copyFrom(prev.chargeBe);
        this.chargeBc.copyFrom(prev.chargeBc);
      }
    }
  }
}

export const npnModel: DeviceModel = {
  type: 'npn',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new BjtDevice(init, 'npn'),
};

export const pnpModel: DeviceModel = {
  type: 'pnp',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new BjtDevice(init, 'pnp'),
};
