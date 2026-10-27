import { NR_ABSTOL, NR_RELTOL } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';
import { limitStep } from './threeTerminal';

/**
 * Laboratuvar DC güç kaynağı: iki bağımsız, yüzer (topraksız) çıkış; her birinin gerilimi ve akım
 * sınırı ayarlanır. Pinler: [0] = 1. çıkış +, [1] = 1. çıkış −, [2] = 2. çıkış +, [3] = 2. çıkış −.
 *
 *   (−) ── ideal kaynak V ── (iç düğüm) ── akım sınırlayıcı ── (+)
 *
 * Akım sınırlayıcı, uçları arasındaki gerilime göre I = I_sınır · tanh(v / 10 mV) akımı geçirir:
 * küçük akımlarda neredeyse kısa devredir (sabit gerilim, CV), yük akım sınırını aşmaya çalışınca
 * akım I_sınır'da kalır ve çıkış gerilimi düşer (sabit akım, CC). tanh, iki durum arasında
 * Newton-Raphson'un yakınsayacağı yumuşak bir geçiş verir.
 */
export const DCSUPPLY_DEFAULTS = { voltage1: 5, currentLimit1: 0.5, voltage2: 5, currentLimit2: 0.5 };
export const DCSUPPLY_MAX_VOLTAGE = 30;
/** Akım sınırlayıcının geçiş genişliği (V). */
const LIMITER_WIDTH = 0.01;
/** Bir Newton-Raphson iterasyonunda sınırlayıcı geriliminin en fazla değişimi (V). */
const MAX_LIMITER_STEP = 2;
/** Bir iterasyonda tanh(v / genişlik)'in en fazla değişimi (doyumdan doyuma sıçramayı önler). */
const MAX_TANH_STEP = 0.5;

/**
 * Sınırlayıcı geriliminin adımı (diyotlardaki pnjlim'in tanh karşılığı): doyumda iletkenlik ≈ 0
 * olduğundan Newton sınırlayıcıyı sabit akım kaynağı sanır ve akım yön değiştirince karşı doyuma
 * fırlar; CV ile CC arasında döngüye girebilir (ör. 30 V, 0,1 A sınırda diyotlu devre). tanh'in
 * değişimi 0,5 ile sınırlanınca böyle bir adım geçiş bölgesine iner, orada türev anlamlıdır.
 */
function limitLimiter(raw: number, vold: number): { v: number; limited: boolean } {
  const uOld = Math.tanh(vold / LIMITER_WIDTH);
  const uNew = Math.tanh(raw / LIMITER_WIDTH);
  if (Math.abs(uNew - uOld) > MAX_TANH_STEP) {
    const u = uOld + Math.sign(uNew - uOld) * MAX_TANH_STEP;
    return { v: LIMITER_WIDTH * Math.atanh(Math.max(-0.999999, Math.min(0.999999, u))), limited: true };
  }
  return limitStep(raw, vold, MAX_LIMITER_STEP);
}

export function dcsupplySettings(props: Props) {
  const d = DCSUPPLY_DEFAULTS;
  const volts = (key: string, fallback: number) => Math.min(DCSUPPLY_MAX_VOLTAGE, Math.max(0, numProp(props, key, fallback)));
  const amps = (key: string, fallback: number) => Math.max(1e-6, numProp(props, key, fallback));
  return {
    voltage: [volts('voltage1', d.voltage1), volts('voltage2', d.voltage2)] as const,
    currentLimit: [amps('currentLimit1', d.currentLimit1), amps('currentLimit2', d.currentLimit2)] as const,
  };
}

interface Limiter {
  /** Doğrusallaştırma noktası: iç düğüm − (+) uç gerilimi. */
  v: number;
  accepted: number;
  linCurrent: number;
  linConductance: number;
}

export class DcSupplyDevice extends Device {
  readonly type = 'dcsupply';
  readonly settings: ReturnType<typeof dcsupplySettings>;
  private limiters: [Limiter, Limiter] = [
    { v: 0, accepted: 0, linCurrent: 0, linConductance: 0 },
    { v: 0, accepted: 0, linCurrent: 0, linConductance: 0 },
  ];

  constructor(init: DeviceInit) {
    super(init);
    this.settings = dcsupplySettings(init.props);
  }

  override get nonlinear(): boolean {
    return true;
  }

  override get peakVoltage(): number {
    return Math.max(...this.settings.voltage);
  }

  /** İki çıkış birbirinden yalıtılmıştır: her çıkış kendi + ve − ucu ve iç düğümüyle bir grup. */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [0, 1].map((k) => [this.plus(k), this.minus(k), this.inner(k)]);
  }

  private plus(k: number): number {
    return this.nodes[2 * k]!;
  }
  private minus(k: number): number {
    return this.nodes[2 * k + 1]!;
  }
  private inner(k: number): number {
    return this.nodes[4 + k]!;
  }

  /** Sınırlayıcının akımı (iç düğümden + uca) ve türevi. */
  private limiterCurrent(k: number, v: number): { i: number; g: number } {
    const limit = this.settings.currentLimit[k]!;
    const t = Math.tanh(v / LIMITER_WIDTH);
    return { i: limit * t, g: (limit / LIMITER_WIDTH) * (1 - t * t) + 1e-12 };
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    for (let k = 0; k < 2; k++) {
      sys.voltageSource(this.inner(k), this.minus(k), this.branches[k]!, this.settings.voltage[k]! * ctx.sourceScale);
    }
  }

  override stampNonlinear(sys: MnaSystem): void {
    for (let k = 0; k < 2; k++) {
      const lim = this.limiters[k]!;
      const { i, g } = this.limiterCurrent(k, lim.v);
      lim.linCurrent = i;
      lim.linConductance = g;
      sys.conductance(this.inner(k), this.plus(k), g);
      sys.currentSource(this.inner(k), this.plus(k), i - g * lim.v);
    }
  }

  override updateIterate(x: Float64Array): boolean {
    let converged = true;
    for (let k = 0; k < 2; k++) {
      const lim = this.limiters[k]!;
      const raw = this.v(x, 4 + k) - this.v(x, 2 * k);
      const step = limitLimiter(raw, lim.v);
      const predicted = lim.linCurrent + lim.linConductance * (raw - lim.v);
      const actual = this.limiterCurrent(k, raw).i;
      const tolerance = NR_RELTOL * Math.max(Math.abs(actual), Math.abs(predicted)) + NR_ABSTOL;
      if (step.limited || Math.abs(actual - predicted) > tolerance) converged = false;
      lim.v = step.v;
    }
    return converged;
  }

  override restoreIterate(): void {
    for (const lim of this.limiters) lim.v = lim.accepted;
  }

  override accept(): void {
    for (const lim of this.limiters) lim.accepted = lim.v;
  }

  /** k. çıkışın + ucundan dış devreye verdiği akım. */
  outputCurrent(x: Float64Array, k: number): number {
    return this.limiterCurrent(k, this.v(x, 4 + k) - this.v(x, 2 * k)).i;
  }

  /** k. çıkışın uç gerilimi (+ − −). */
  outputVoltage(x: Float64Array, k: number): number {
    return this.v(x, 2 * k) - this.v(x, 2 * k + 1);
  }

  override pinCurrents(x: Float64Array): number[] {
    const i1 = this.outputCurrent(x, 0);
    const i2 = this.outputCurrent(x, 1);
    return [-i1, i1, -i2, i2];
  }

  /** Ölçüm: 1. çıkış (gerilim, + uca giren akım, güç). */
  measure(x: Float64Array): Measurement {
    const voltage = this.outputVoltage(x, 0);
    const current = -this.outputCurrent(x, 0);
    return { voltage, current, power: voltage * current };
  }

  /** Akım sınırına (≥ %98) ulaşan çıkışlar: ön paneldeki "CC" lambası. */
  override status(x: Float64Array): DeviceStatus {
    return {
      currentLimited: [0, 1].map((k) => Math.abs(this.outputCurrent(x, k)) >= 0.98 * this.settings.currentLimit[k]!),
      outputs: [0, 1].map((k) => ({ voltage: this.outputVoltage(x, k), current: this.outputCurrent(x, k) })),
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof DcSupplyDevice) this.limiters = prev.limiters;
  }
}

export const dcsupplyModel: DeviceModel = {
  type: 'dcsupply',
  pinCount: 4,
  internalNodes: 2,
  branchCount: 2,
  referencePins: () => [1, 3],
  // İki çıkış birbirinden yalıtılmıştır (laboratuvar güç kaynaklarında olduğu gibi yüzer çıkışlar).
  couplingPins: () => [
    [0, 1],
    [2, 3],
  ],
  create: (init) => new DcSupplyDevice(init),
};
