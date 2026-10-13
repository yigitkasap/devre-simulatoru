import { GMIN, NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type TransistorRegion } from './device';
import { criticalVoltage, limitJunction, safeExp } from './junction';
import { stampThreeTerminal, type TerminalLinearization } from './threeTerminal';

/**
 * Küçük sinyal BJT parametreleri (BC547B / BC557B benzeri genel amaçlı transistör).
 *   Is  = 2,39·10⁻¹⁴ A  (NXP BC547B SPICE modeli; 1 mA'de V_BE ≈ 0,63 V)
 *   β_F = 200 (varsayılan; BC547B için veri sayfası aralığı 200–450), özellik penceresinden değişir
 *   β_R = 7,9,  V_A (Early gerilimi) = 63 V  (aynı model)
 */
export const BJT_PARAMS = { saturationCurrent: 2.39e-14, reverseBeta: 7.9, earlyVoltage: 63.2 };
export const BJT_DEFAULTS = { beta: 200 };

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
  const gF = (is / VT) * ef;
  const gR = (is / VT) * er;
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

/** Bipolar transistör. Pinler: [0] = kollektör (C), [1] = baz (B), [2] = emetör (E). */
export class BjtDevice extends Device {
  readonly type: 'npn' | 'pnp';
  readonly sign: 1 | -1;
  readonly beta: number;
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

  override stampNonlinear(sys: MnaSystem): void {
    const e = evaluateBjt(this.vbe, this.vbc, this.beta);
    this.linear = e;
    const emitter: TerminalLinearization = {
      current: -(e.collector.current + e.base.current),
      du: -(e.collector.du + e.base.du),
      dw: -(e.collector.dw + e.base.dw),
    };
    stampThreeTerminal(sys, this.nodes, this.sign, CU, CW, [e.collector, e.base, emitter], this.vbe, this.vbc);
  }

  override updateIterate(x: Float64Array): boolean {
    const raw = this.controls(x);
    const be = limitJunction(raw.vbe, this.vbe, VT, VCRIT);
    const bc = limitJunction(raw.vbc, this.vbc, VT, VCRIT);
    let converged = !be.limited && !bc.limited;
    if (converged && this.linear) {
      // Akım yakınsaması: doğrusal tahmin ile gerçek eğri arasındaki fark.
      const actual = evaluateBjt(raw.vbe, raw.vbc, this.beta);
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

  override accept(): void {
    this.accepted = { vbe: this.vbe, vbc: this.vbc };
  }

  /** Kollektöre, baza ve emetöre giren gerçek akımlar. */
  override pinCurrents(x: Float64Array): number[] {
    const { vbe, vbc } = this.controls(x);
    const e = evaluateBjt(vbe, vbc, this.beta);
    const ic = this.sign * e.collector.current;
    const ib = this.sign * e.base.current;
    return [ic, ib, -(ic + ib)];
  }

  /** Ölçüm: gerilim V_CE, akım I_C (kollektöre giren), güç V_CE·I_C + V_BE·I_B. */
  measure(x: Float64Array): Measurement {
    const [ic, ib] = this.pinCurrents(x) as [number, number, number];
    const vce = this.v(x, 0) - this.v(x, 2);
    const vbe = this.v(x, 1) - this.v(x, 2);
    return { voltage: vce, current: ic, power: vce * ic + vbe * ib };
  }

  /** Çalışma bölgesi: B-E eklemi iletimde değilse kesim, B-C eklemi de iletimdeyse doyum. */
  region(x: Float64Array): TransistorRegion {
    const { vbe, vbc } = this.controls(x);
    if (vbe < 0.5) return 'cutoff';
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
