import type { MnaSystem } from '../mna';
import { numProp, type Props } from '../netlist';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';

/**
 * Fırçalı DC motor (sabit mıknatıslı). Pinler: [0] = + uç, [1] = − uç (akım + uçtan girince
 * motor ileri döner). Elektriksel eşdeğeri:
 *
 *   + ── R ── L ──┬──────────┬──────────┐
 *                 │          │          │
 *                C_m      sürtünme      e = k·ω   (zıt EMK)
 *                 │       ve yük        │
 *   − ────────────┴──────────┴──────────┘
 *   + ──────────── C_p ─────────────── −    (sargı ve fırça kapasitesi)
 *
 * Mil hareket denklemi J·dω/dt = k·i − T_sürtünme − T_yük, zıt EMK e = k·ω ile yazılırsa
 * (J/k²)·de/dt = i − (T_sürtünme + T_yük)/k olur: bu, sargı akımının bir C_m = J/k² kapasitesini
 * doldurmasıdır (dönen rotorun kinetik enerjisi ½Jω² = ½C_m·e²). Sürtünme (fırçalar, yataklar) ve
 * yük torku dönmeye karşı koyar: T·tanh(ω/ω_s) (ω_s = 0,1 rad/s; durgun motorda ani yön
 * değiştirmeyi yumuşatır). Motorun aldığı elektriksel güç e·i mile geçer (Lenz: zıt EMK akımı
 * azaltır). Motor dışarıdan çevrilirse ya da akımı kesilip boşta dönerken uçlarında e görülür
 * (jeneratör).
 *
 * Varsayılanlar gerçek bir motordan: maxon A-max 26 (110937; 12 V, 11 W, grafit fırçalı; maxon
 * veri sayfası): uç direnci R = 2,07 Ω, uç endüktansı L = 0,227 mH, tork sabiti k = 13,9 mN·m/A,
 * rotor ataleti J = 13,6 g·cm². Boşta akım 57 mA: sürtünme torku k·I₀ = 0,79 mN·m. Bu değerlerle
 * boşta hız (12 V − R·I₀)/k ≈ 8160 dev/dk (veri sayfası 8190), kalkış akımı 12 V / R ≈ 5,8 A
 * (5,79 A), durma torku k·(I_k − I₀) ≈ 79,8 mN·m (80,2), mekanik zaman sabiti R·J/k² ≈ 14,6 ms
 * (14,6 ms). Sürekli çalışmada en fazla 1,08 A (14,2 mN·m): sargıda R·I² ≈ 2,4 W. Sargının
 * ısınması bir birinci dereceden ısıl modelle izlenir (zaman sabiti 13 s, veri sayfası); bakır
 * kaybının ortalaması 2,4 W'ı aşınca uyarı verilir (motor zorlanıyor).
 *
 * C_p = 1 nF (veri sayfasında yok): akımı aniden kesilen sargının gerilimini sonlu tutar (bobindeki
 * gibi, geri Euler ile).
 */
export const MOTOR_DEFAULTS = {
  armatureResistance: 2.07,
  armatureInductance: 0.227e-3,
  torqueConstant: 13.9,
  inertia: 13.6,
  frictionTorque: 0.792,
  loadTorque: 0,
};
/** Sargı ve fırça kapasitesi (F). */
export const MOTOR_TERMINAL_CAPACITANCE = 1e-9;
/** Sürtünmenin yumuşatma hızı ω_s (rad/s). */
export const MOTOR_STICTION_SPEED = 0.1;
/** Sürekli çalışmada sargıda harcanabilecek en büyük güç (W): 1,08 A²·2,07 Ω. */
export const MOTOR_MAX_COPPER_LOSS = 1.08 ** 2 * 2.07;
/** Sargının ısıl zaman sabiti (s). */
export const MOTOR_THERMAL_TIME = 13;

/** Motorun SI birimlerindeki ayarları (özellikler mN·m/A, g·cm², mN·m cinsinden). */
export function motorSettings(p: Props) {
  const d = MOTOR_DEFAULTS;
  const k = Math.max(1e-6, numProp(p, 'torqueConstant', d.torqueConstant)) * 1e-3;
  const inertia = Math.max(1e-6, numProp(p, 'inertia', d.inertia)) * 1e-7;
  const friction = Math.max(0, numProp(p, 'frictionTorque', d.frictionTorque)) * 1e-3;
  const load = Math.max(0, numProp(p, 'loadTorque', d.loadTorque)) * 1e-3;
  return {
    resistance: Math.max(1e-3, numProp(p, 'armatureResistance', d.armatureResistance)),
    inductance: Math.max(1e-9, numProp(p, 'armatureInductance', d.armatureInductance)),
    k,
    inertia,
    friction,
    load,
  };
}

export class MotorDevice extends Device {
  readonly type = 'motor';
  readonly resistance: number;
  readonly inductance: number;
  /** Tork sabiti k (N·m/A = V·s/rad). */
  readonly k: number;
  /** Zıt EMK düğümünün kapasitesi C_m = J/k² (F). */
  readonly mechanicalCapacitance: number;
  /** Sürtünme ve yük torku (N·m) ve ikisinin zıt EMK düğümünde karşılığı olan akım (T/k). */
  readonly frictionTorque: number;
  readonly loadTorque: number;
  private readonly dragCurrent: number;
  private readonly smoothingVoltage: number;
  /** Son kabul edilen adım: sargı akımı ve endüktansın gerilimi, zıt EMK ve C_m'nin akımı. */
  private current = 0;
  private coilVoltage = 0;
  private emf = 0;
  private emfCurrent = 0;
  /** Uç kapasitesinin gerilimi ve akımı. */
  private capVoltage = 0;
  private capCurrent = 0;
  /** Newton-Raphson: sürtünmenin doğrusallaştırıldığı zıt EMK (yineleme ve kabul edilen). */
  private emfIter = 0;
  /** Sargının bakır kaybının ısıl ortalaması (W). */
  private heat = 0;
  /** Devre son değiştiğinden beri uçlarda görülen en büyük gerilim (Lenz uyarısı). */
  private spikePeak = 0;

  constructor(init: DeviceInit) {
    super(init);
    const s = motorSettings(init.props);
    this.resistance = s.resistance;
    this.inductance = s.inductance;
    this.k = s.k;
    this.mechanicalCapacitance = s.inertia / (s.k * s.k);
    this.frictionTorque = s.friction;
    this.loadTorque = s.load;
    this.dragCurrent = (s.friction + s.load) / s.k;
    this.smoothingVoltage = s.k * MOTOR_STICTION_SPEED;
  }

  override get nonlinear(): boolean {
    return this.dragCurrent > 0;
  }

  override get reactive(): boolean {
    return true;
  }

  private get a(): number {
    return this.nodes[0]!;
  }
  private get b(): number {
    return this.nodes[1]!;
  }
  private get inner(): number {
    return this.nodes[2]!;
  }
  private get emfNode(): number {
    return this.nodes[3]!;
  }
  private get branch(): number {
    return this.branches[0]!;
  }

  /** Geçici çözümde bütün düğümler bağlı (C_m); doğru akımda zıt EMK düğümü yalnızca sürtünmeyle. */
  override conductiveGroups(transient: boolean): ReadonlyArray<readonly number[]> {
    return transient ? [[this.a, this.inner, this.emfNode, this.b]] : [[this.a, this.inner, this.emfNode]];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [[this.a, this.inner, this.emfNode, this.b]];
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    sys.conductance(this.a, this.inner, 1 / this.resistance);
    sys.voltageSource(this.inner, this.emfNode, this.branch, 0);
    if (ctx.h > 0) {
      const cs = chargeScale(ctx);
      sys.add(this.branch, this.branch, -cs * this.inductance);
      sys.conductance(this.emfNode, this.b, cs * this.mechanicalCapacitance);
      sys.conductance(this.a, this.b, MOTOR_TERMINAL_CAPACITANCE / ctx.h);
    }
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const cs = chargeScale(ctx);
    sys.addRhs(this.branch, -cs * this.inductance * this.current - (ctx.trap ? this.coilVoltage : 0));
    sys.currentSource(this.b, this.emfNode, cs * this.mechanicalCapacitance * this.emf + (ctx.trap ? this.emfCurrent : 0));
    sys.currentSource(this.b, this.a, (MOTOR_TERMINAL_CAPACITANCE / ctx.h) * this.capVoltage);
  }

  /** Sürtünme ve yük: zıt EMK düğümünden − uca akan I = (T/k)·tanh(e/e_s) ve türevi. */
  private drag(e: number): { current: number; conductance: number } {
    const t = Math.tanh(e / this.smoothingVoltage);
    return { current: this.dragCurrent * t, conductance: (this.dragCurrent / this.smoothingVoltage) * (1 - t * t) };
  }

  override stampNonlinear(sys: MnaSystem): void {
    const e = this.emfIter;
    const { current, conductance } = this.drag(e);
    sys.conductance(this.emfNode, this.b, conductance);
    sys.currentSource(this.emfNode, this.b, current - conductance * e);
  }

  override updateIterate(x: Float64Array): boolean {
    const e = this.v(x, 3) - this.v(x, 1);
    const before = this.drag(this.emfIter);
    const predicted = before.current + before.conductance * (e - this.emfIter);
    const actual = this.drag(e).current;
    this.emfIter = e;
    return Math.abs(actual - predicted) <= 1e-3 * Math.max(Math.abs(actual), Math.abs(predicted)) + 1e-9;
  }

  override restoreIterate(): void {
    this.emfIter = this.emf;
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const terminal = this.v(x, 0) - this.v(x, 1);
    const e = this.v(x, 3) - this.v(x, 1);
    this.current = x[this.branch]!;
    if (ctx.h > 0) {
      this.coilVoltage = this.v(x, 2) - this.v(x, 3);
      this.emfCurrent = chargeScale(ctx) * this.mechanicalCapacitance * (e - this.emf) - (ctx.trap ? this.emfCurrent : 0);
      this.capCurrent = (MOTOR_TERMINAL_CAPACITANCE * (terminal - this.capVoltage)) / ctx.h;
      const loss = this.resistance * this.current * this.current;
      this.heat += (loss - this.heat) * (1 - Math.exp(-ctx.h / MOTOR_THERMAL_TIME));
    }
    this.emf = e;
    this.emfIter = e;
    this.capVoltage = terminal;
    this.spikePeak = Math.max(this.spikePeak, Math.abs(terminal));
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [
      [this.branch, -1],
      [this.a, this.b],
      [this.emfNode, this.b],
    ];
  }

  /** Uç gerilimi ve + uçtan giren akım (sargı + uç kapasitesi). */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    const current = x[this.branch]! + this.capCurrent;
    return { voltage, current, power: voltage * current };
  }

  /** Açısal hız (rad/s): ω = e/k. */
  speed(x: Float64Array): number {
    return (this.v(x, 3) - this.v(x, 1)) / this.k;
  }

  override status(x: Float64Array): DeviceStatus {
    const omega = this.speed(x);
    const current = x[this.branch]!;
    return {
      motor: {
        speed: omega,
        backEmf: omega * this.k,
        torque: this.k * current,
        loadPower: this.loadTorque * Math.abs(omega),
        heating: this.heat / MOTOR_MAX_COPPER_LOSS,
      },
    };
  }

  /** Sargının ortalama bakır kaybı sürekli çalışma sınırını aşıyorsa uyarı. */
  override ratingWarnings(): readonly RatingWarning[] {
    return this.heat > MOTOR_MAX_COPPER_LOSS ? [{ code: 'motor-overload', params: { power: this.heat, limit: MOTOR_MAX_COPPER_LOSS } }] : [];
  }

  /** Devre son değiştiğinden beri uçlarda görülen en büyük gerilim. */
  spikeVoltage(): number {
    return this.spikePeak;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof MotorDevice) {
      this.current = prev.current;
      this.coilVoltage = prev.coilVoltage;
      // Rotorun kinetik enerjisi korunur: ω aynı kalır (k değiştiyse zıt EMK değişir).
      this.emf = (prev.emf / prev.k) * this.k;
      this.emfIter = this.emf;
      this.emfCurrent = 0;
      this.capVoltage = prev.capVoltage;
      this.capCurrent = prev.capCurrent;
      this.heat = prev.heat;
    }
  }
}

export const motorModel: DeviceModel = {
  type: 'motor',
  pinCount: 2,
  internalNodes: 2,
  branchCount: 1,
  create: (init) => new MotorDevice(init),
};
