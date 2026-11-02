import type { MnaSystem } from '../mna';
import { nodeVoltage } from '../mna';
import { strProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';
import { SeriesJunction } from './seriesJunction';

// PC817 optokuplör (Sharp "PC817XxNSZ1B Series", OP18002EN, 15 Ocak 2018; "PC817X Series" D2-A03101EN,
// 30 Eylül 2003). Sharp SPICE modeli yok. Pinler: [0] = A (1), [1] = K (2), [2] = C (4), [3] = E (3).
//
// Giriş LED'i: seri dirençli eklem; IS, N, RS 2018 sayfasının Şekil 6 eğrisine (25 °C; eğriden okunur,
// yaklaşık) en küçük kareler: 1 mA 1,09 V · 5 mA 1,17 V · 10 mA 1,22 V · 20 mA 1,28 V · 50 mA 1,41 V
//   ⇒ IS = 2,31·10⁻¹⁴ A, N = 1,72, RS = 3,01 Ω (fark ≤ 3 mV). Tablo: 20 mA'de tipik 1,2 V, en çok 1,4 V.
//
// Çıkış: IC = CTR · IF · f(VCE). CTR tabloda yalnızca aralık olarak verilir (IF = 5 mA, VCE = 5 V'ta
// %50–600; sınıflar A %80–160, B %130–260, C %200–400, D %300–600). Kullanıcı kararı (2026-11-02):
// kartta sınıf seçilir, CTR aralığın ortasıdır (A %120, B %195, C %300, D %450; ortalama hesaplanmıştır,
// sayfada basılı değil), varsayılan C.
// Doyma: f, VCE büyüdükçe 0'dan 1'e çıkan yumuşak bir eşik (lojistik). Kullanıcı kararı: doymadaki VCE
// tablodaki tipik VCE(sat) = 0,1 V'a göre (IF = 20 mA, IC = 1 mA): eşiğin yeri, bu koşulda VCE = 0,1 V
// olacak biçimde seçilir. Eşiğin genişliği (10 mV) veri sayfasında yoktur (varsayım). Karanlık akım
// (ICEO en çok 100 nA) ve yanıt süresi modellenmez.
export const OPTO_IS = 2.31466e-14;
export const OPTO_N = 1.71572;
export const OPTO_RS = 3.01192;
export const OPTO_RANKS = ['A', 'B', 'C', 'D'] as const;
export type OptoRank = (typeof OPTO_RANKS)[number];
/** Sınıfın CTR aralığının ortası (oran; %300 = 3). */
export const OPTO_CTR: Readonly<Record<OptoRank, number>> = { A: 1.2, B: 1.95, C: 3.0, D: 4.5 };
export const OPTO_MODELS = ['PC817'] as const;
export const OPTO_DEFAULTS = { model: 'PC817' as (typeof OPTO_MODELS)[number], rank: 'C' as OptoRank };
/** Tablodaki doyma koşulu ve tipik VCE(sat). */
const SAT_IF = 20e-3;
const SAT_IC = 1e-3;
const SAT_VCE = 0.1;
/** Doyma eşiğinin genişliği (V; varsayım). */
const KNEE = 0.01;

const logistic = (z: number) => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

export function optoCtr(props: Props): number {
  return OPTO_CTR[strProp(props, 'rank', OPTO_RANKS, OPTO_DEFAULTS.rank)];
}

/** Optokuplör. İç düğüm: LED'in RS'si ile eklemi arası. */
export class OptocouplerDevice extends Device {
  readonly type = 'opto';
  readonly led: SeriesJunction;
  readonly ctr: number;
  /** Eşiğin ortası (V): IF = 20 mA, IC = 1 mA'de VCE = 0,1 V olacak yer. */
  private readonly center: number;
  private readonly offset: number;
  /** Çıkışın doğrusallaştırma noktası: LED akımı ve VCE. */
  private it = { iled: 0, vce: 0 };
  private saved = { iled: 0, vce: 0 };

  constructor(init: DeviceInit) {
    super(init);
    const [a, k, , , inner] = init.nodes as [number, number, number, number, number];
    this.led = new SeriesJunction(OPTO_IS, OPTO_N, OPTO_RS, a, inner, k);
    this.ctr = optoCtr(init.props);
    this.offset = logistic(-SAT_VCE / KNEE);
    // f(0,1 V) = IC / (CTR · IF) tablonun koşulunda.
    const fraction = SAT_IC / (this.ctr * SAT_IF);
    const raw = fraction * (1 - this.offset) + this.offset;
    this.center = SAT_VCE - KNEE * Math.log(raw / (1 - raw));
  }

  /** f(VCE) ve türevi: 0'da 0, eşiğin üstünde 1. */
  private knee(vce: number): { f: number; df: number } {
    const s = logistic((vce - this.center) / KNEE);
    const s0 = logistic(-this.center / KNEE);
    return { f: (s - s0) / (1 - s0), df: (s * (1 - s)) / KNEE / (1 - s0) };
  }

  override get nonlinear(): boolean {
    return true;
  }

  override stampStatic(sys: MnaSystem): void {
    this.led.stampStatic(sys);
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.led.stampNonlinear(sys, ctx);
    // Çıkış: IC = CTR · IF · f(VCE), C'den E'ye; IF = (vA − v_iç) / RS.
    const [a, , c, e, inner] = this.nodes as [number, number, number, number, number];
    const { iled, vce } = this.it;
    const { f, df } = this.knee(vce);
    const ic = this.ctr * iled * f;
    const gled = (this.ctr * f) / OPTO_RS;
    const gce = this.ctr * iled * df;
    const terms: ReadonlyArray<readonly [number, number]> = [
      [a, gled],
      [inner, -gled],
      [c, gce],
      [e, -gce],
    ];
    for (const [node, g] of terms) {
      if (node < 0 || g === 0) continue;
      if (c >= 0) sys.add(c, node, g);
      if (e >= 0) sys.add(e, node, -g);
    }
    // Σ g·v doğrusallaştırma noktasında: gled·(vA − v_iç) = gled·RS·IF, gce·VCE.
    sys.currentSource(c, e, ic - gled * OPTO_RS * iled - gce * vce);
  }

  /** LED tarafı her zaman iletir; çıkış IF sıfıra inince iletmez (gmin için sayılmaz). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    const [a, k, , , inner] = this.nodes as [number, number, number, number, number];
    return [[a, inner, k]];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    const [a, k, c, e, inner] = this.nodes as [number, number, number, number, number];
    return [
      [a, inner, k],
      [c, e],
    ];
  }

  override updateIterate(x: Float64Array): boolean {
    const ledConverged = this.led.update(x);
    const iled = this.led.current(x);
    const vce = nodeVoltage(x, this.nodes[2]!) - nodeVoltage(x, this.nodes[3]!);
    const converged = ledConverged && Math.abs(vce - this.it.vce) < 1e-6 + 1e-6 * Math.abs(vce) && Math.abs(iled - this.it.iled) < 1e-9 + 1e-6 * Math.abs(iled);
    this.it = { iled, vce };
    return converged;
  }

  override restoreIterate(): void {
    this.led.junction.restore();
    this.it = { ...this.saved };
  }

  override accept(_x: Float64Array, ctx: StepContext): void {
    this.led.junction.accept(ctx);
    this.saved = { ...this.it };
  }

  private outputCurrent(x: Float64Array): { iled: number; ic: number; vce: number } {
    const iled = this.led.current(x);
    const vce = nodeVoltage(x, this.nodes[2]!) - nodeVoltage(x, this.nodes[3]!);
    return { iled, ic: this.ctr * iled * this.knee(vce).f, vce };
  }

  override pinCurrents(x: Float64Array): number[] {
    const { iled, ic } = this.outputCurrent(x);
    return [iled, -iled, ic, -ic];
  }

  /** Ölçüm: LED'in gerilimi ve akımı; güç LED ile çıkış transistöründe harcanan. */
  measure(x: Float64Array): Measurement {
    const { iled, ic, vce } = this.outputCurrent(x);
    const vled = this.led.voltage(x);
    return { voltage: vled, current: iled, power: vled * iled + vce * ic };
  }

  override status(x: Float64Array): DeviceStatus {
    const { iled, ic, vce } = this.outputCurrent(x);
    return { opto: { led: iled, ledVoltage: this.led.voltage(x), output: ic, vce, ctr: this.ctr, saturated: iled > 1e-6 && ic < 0.9 * this.ctr * iled } };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof OptocouplerDevice) {
      this.led.junction.copyStateFrom(prev.led.junction);
      this.it = { ...prev.it };
      this.saved = { ...prev.saved };
    }
  }
}

export const optocouplerModel: DeviceModel = {
  type: 'opto',
  pinCount: 4,
  internalNodes: 1,
  branchCount: 0,
  // LED ile çıkış yalıtılmıştır (ışıkla bağlı): ada hesabında iki ayrı grup.
  couplingPins: () => [
    [0, 1],
    [2, 3],
  ],
  create: (init) => new OptocouplerDevice(init),
};
