import type { MnaSystem } from '../mna';
import { numProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';
import { ThermalResistor, type ThermalModel } from './thermal';

// Ayarlı parçalar ve sensörler: potansiyometre, LDR (fotodirenç), NTC termistör ve akkor lamba.

const KELVIN = 273.15;

// --- Potansiyometre ------------------------------------------------------------------------

/**
 * Potansiyometre. Varsayılanlar Bourns PTV09A-4020F-B103'ten (Bourns veri sayfası): 10 kΩ ±%20,
 * doğrusal (B), artık direnç en fazla %1 (uç konumlarında sürgü ile uç arasında kalan direnç),
 * güç 0,05 W. Pinler: [0] 1. uç, [1] sürgü (orta uç), [2] 3. uç. Konum %0'da sürgü 1. uçta.
 *   R₁₂ = R_a + (R − 2R_a)·p,  R₂₃ = R_a + (R − 2R_a)·(1 − p),  R₁₂ + R₂₃ = R.
 */
export const POT_DEFAULTS = { resistance: 10e3, position: 50 };
export const POT_RESIDUAL_FRACTION = 0.01;
export const POT_POWER_RATING = 0.05;

export function potSettings(p: Props) {
  const resistance = Math.max(1e-3, numProp(p, 'resistance', POT_DEFAULTS.resistance));
  const position = Math.min(100, Math.max(0, numProp(p, 'position', POT_DEFAULTS.position))) / 100;
  const residual = POT_RESIDUAL_FRACTION * resistance;
  const span = resistance - 2 * residual;
  return { resistance, position, r12: residual + span * position, r23: residual + span * (1 - position) };
}

export class PotentiometerDevice extends Device {
  readonly type = 'potentiometer';
  readonly r12: number;
  readonly r23: number;
  readonly position: number;

  constructor(init: DeviceInit) {
    super(init);
    const s = potSettings(init.props);
    this.r12 = s.r12;
    this.r23 = s.r23;
    this.position = s.position;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.r12);
    sys.conductance(this.nodes[1]!, this.nodes[2]!, 1 / this.r23);
  }

  /** Uçlara giren akımlar: 1. uç, sürgü, 3. uç. */
  override pinCurrents(x: Float64Array): number[] {
    const i1 = (this.v(x, 0) - this.v(x, 1)) / this.r12;
    const i3 = (this.v(x, 2) - this.v(x, 1)) / this.r23;
    return [i1, -(i1 + i3), i3];
  }

  /** 1. uç ile 3. uç arasındaki gerilim ve 1. uçtan giren akım. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 2);
    const current = (this.v(x, 0) - this.v(x, 1)) / this.r12;
    return { voltage, current, power: this.power(x) };
  }

  /** Direnç elemanında harcanan güç. */
  power(x: Float64Array): number {
    const v12 = this.v(x, 0) - this.v(x, 1);
    const v23 = this.v(x, 1) - this.v(x, 2);
    return (v12 * v12) / this.r12 + (v23 * v23) / this.r23;
  }

  override status(x: Float64Array): DeviceStatus {
    return { wiper: { voltage: this.v(x, 1) - this.v(x, 2), r12: this.r12, r23: this.r23 } };
  }

  /**
   * Güç sınırı bütün eleman içindir; bir bölümün payı boyuyla orantılıdır (en az %10: uç
   * konumunda sürgü akımı izin değil, uç bağlantısının artık direncinden geçer). En çok zorlanan
   * bölümün gücü payına düşen sınırı aşarsa uyarı (direncin uyarısıyla aynı kod).
   */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const total = this.r12 + this.r23;
    const v12 = this.v(x, 0) - this.v(x, 1);
    const v23 = this.v(x, 1) - this.v(x, 2);
    const parts = [
      { p: (v12 * v12) / this.r12, share: Math.max(0.1, this.r12 / total) },
      { p: (v23 * v23) / this.r23, share: Math.max(0.1, this.r23 / total) },
    ];
    const worst = parts.reduce((a, b) => (b.p / b.share > a.p / a.share ? b : a));
    return worst.p > POT_POWER_RATING * worst.share
      ? [{ code: 'resistor-overpower', params: { power: worst.p, rating: POT_POWER_RATING * worst.share } }]
      : [];
  }
}

export const potentiometerModel: DeviceModel = {
  type: 'potentiometer',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new PotentiometerDevice(init),
};

// --- LDR -----------------------------------------------------------------------------------

/**
 * LDR (CdS fotodirenç). Varsayılanlar GL5528'den (Senba GL55 serisi veri sayfası): 10 lükste
 * 10–20 kΩ (ortası 15 kΩ), karanlıkta en az 1 MΩ, γ = log(R₁₀/R₁₀₀) = 0,6; en fazla 150 V, 100 mW.
 *   R(E) = R₁₀·(E / 10 lx)^(−γ),  karanlık direnciyle paralel (E = 0'da 1 MΩ).
 * Tepki süresi (20 ms artış, 30 ms düşüş) modellenmez: direnç ışıkla anında değişir.
 */
export const LDR_DEFAULTS = { illuminance: 100, lightResistance: 15e3, gamma: 0.6 };
export const LDR_DARK_RESISTANCE = 1e6;

export function ldrResistance(p: Props): { illuminance: number; resistance: number } {
  const E = Math.max(0, numProp(p, 'illuminance', LDR_DEFAULTS.illuminance));
  const r10 = Math.max(1, numProp(p, 'lightResistance', LDR_DEFAULTS.lightResistance));
  const gamma = Math.max(0, numProp(p, 'gamma', LDR_DEFAULTS.gamma));
  if (E <= 0) return { illuminance: 0, resistance: LDR_DARK_RESISTANCE };
  const light = r10 * (E / 10) ** -gamma;
  return { illuminance: E, resistance: 1 / (1 / light + 1 / LDR_DARK_RESISTANCE) };
}

export class LdrDevice extends Device {
  readonly type = 'ldr';
  readonly resistance: number;
  readonly illuminance: number;

  constructor(init: DeviceInit) {
    super(init);
    const s = ldrResistance(init.props);
    this.resistance = s.resistance;
    this.illuminance = s.illuminance;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.resistance);
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, (this.v(x, 0) - this.v(x, 1)) / this.resistance);
  }

  override status(): DeviceStatus {
    return { resistance: this.resistance };
  }
}

export const ldrModel: DeviceModel = {
  type: 'ldr',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new LdrDevice(init),
};

// --- NTC termistör --------------------------------------------------------------------------

/**
 * NTC termistör. Varsayılanlar Vishay NTCLE100E3103JB0'dan (Vishay NTCLE100E3 veri sayfası):
 * 25 °C'ta 10 kΩ ±%5, B₂₅/₈₅ = 3977 K. R(T) üreticinin bu malzeme için verdiği eğriden:
 *   R(T) / R₂₅ = exp(A + B/T + C/T² + D/T³),  A = −14,6337, B = 4791,842 K, C = −115334 K², D = −3,730535·10⁶ K³
 * (25 °C'ta 1, 85 °C'ta 0,1070: B₂₅/₈₅ = 3977 K; veri sayfasının tablosu: 0 °C'ta 32 554 Ω,
 * 100 °C'ta 677,3 Ω). Öz ısınma: yayılma katsayısı δ = 7 mW/K, ısıl zaman sabiti 15 s (ısı sığası
 * δ·τ = 0,105 J/K). Isıl düğüm termistörün ortamın üstündeki ısınmasıdır (θ = T − T_ortam): ortam
 * sıcaklığı (özellik) değişince termistör hemen ona uyar (gerçekte havada ≈ 15 s, yağda ≈ 1,2 s
 * sürer; simülasyonda beklememek için), yalnızca öz ısınma zaman sabitiyle değişir.
 */
export const NTC_DEFAULTS = { temperature: 25, resistance25: 10e3 };
const NTC_CURVE = { a: -14.6337, b: 4791.842, c: -115334, d: -3.730535e6 };
export const NTC_DISSIPATION = 7e-3;
export const NTC_TIME_CONSTANT = 15;

/** NTC'nin T (K) sıcaklığındaki direncinin R₂₅'e oranı ve türevinin oranı. */
export function ntcRatio(T: number): { ratio: number; dratio: number } {
  const { a, b, c, d } = NTC_CURVE;
  const ratio = Math.exp(a + b / T + c / (T * T) + d / (T * T * T));
  return { ratio, dratio: ratio * (-b / (T * T) - (2 * c) / (T * T * T) - (3 * d) / (T * T * T * T)) };
}

export class NtcDevice extends Device {
  readonly type = 'ntc';
  readonly r25: number;
  readonly ambient: number;
  readonly thermal: ThermalResistor;

  constructor(init: DeviceInit) {
    super(init);
    this.r25 = Math.max(1e-3, numProp(init.props, 'resistance25', NTC_DEFAULTS.resistance25));
    this.ambient = Math.min(200, Math.max(-60, numProp(init.props, 'temperature', NTC_DEFAULTS.temperature))) + KELVIN;
    const r25 = this.r25;
    const ambient = this.ambient;
    const model: ThermalModel = {
      resistance: (rise) => {
        const { ratio, dratio } = ntcRatio(ambient + rise);
        return { r: r25 * ratio, dr: r25 * dratio };
      },
      loss: (rise) => ({ p: NTC_DISSIPATION * rise, dp: NTC_DISSIPATION }),
      heatCapacity: NTC_DISSIPATION * NTC_TIME_CONSTANT,
      ambient: 0,
      minT: -50,
      maxT: 400,
    };
    this.thermal = new ThermalResistor(model);
  }

  override get nonlinear(): boolean {
    return true;
  }
  override get reactive(): boolean {
    return true;
  }

  private get tNode(): number {
    return this.nodes[2]!;
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [[this.nodes[0]!, this.nodes[1]!], [this.tNode, -1]];
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    this.thermal.stampStatic(sys, this.tNode, ctx);
  }
  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    this.thermal.stampStep(sys, this.tNode, ctx);
  }
  override stampNonlinear(sys: MnaSystem): void {
    this.thermal.stampNonlinear(sys, this.nodes[0]!, this.nodes[1]!, this.tNode);
  }
  override updateIterate(x: Float64Array): boolean {
    return this.thermal.updateIterate(this.v(x, 0) - this.v(x, 1), this.v(x, 2));
  }
  override restoreIterate(): void {
    this.thermal.restoreIterate();
  }
  override accept(x: Float64Array, ctx: StepContext): void {
    this.thermal.accept(this.v(x, 0) - this.v(x, 1), this.v(x, 2), ctx);
  }
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [[this.tNode, -1]];
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.thermal.current(this.v(x, 0) - this.v(x, 1)));
  }

  override status(): DeviceStatus {
    const T = this.ambient + this.thermal.temperature;
    return { temperature: T, resistance: this.r25 * ntcRatio(T).ratio, ambient: this.ambient };
  }

  /** Öz ısınma (ortamın üstündeki ısınma) devralınır; ortam sıcaklığı yeni değerine hemen geçer. */
  override adoptState(prev: Device): void {
    if (prev instanceof NtcDevice) this.thermal.copyStateFrom(prev.thermal);
  }
}

export const ntcModel: DeviceModel = {
  type: 'ntc',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new NtcDevice(init),
};

// --- Akkor lamba ----------------------------------------------------------------------------

/**
 * Akkor (tungsten filamanlı) lamba. Varsayılan: 12 V, 0,1 A (1,2 W) minyatür lamba (ör. T-3¼ kama
 * duylu 12 V 100 mA; veri sayfasında akım 90–110 mA). Veri sayfaları filamanın soğuk direncini ve
 * ısıl zaman sabitini vermez; ikisi tungstenin bilinen özelliklerinden türetilir:
 *   - Özdirenç ρ(T) ∝ T^1,215 (Desai ve diğ., J. Phys. Chem. Ref. Data 13, 1984: 300 K'de 5,4,
 *     2500 K'de 73 µΩ·cm). Anma sıcaklığı T_n = 2500 K (uzun ömürlü vakumlu minyatür lamba):
 *     R(T) = R_sıcak·(T/T_n)^1,215, R_sıcak = V²/P = 120 Ω, 20 °C'ta R_soğuk ≈ 8,9 Ω (13,5 kat).
 *   - Isı kaybı ışınımla: P = k·(T⁴ − T₀⁴), k anma noktasından.
 *   - Isı sığası filamanın kütlesinden: ışınım (salım oranı 0,3) ve direnç anma değerlerini
 *     verecek tel çapı ve boyu (12 V 0,1 A'de ≈ 16 µm, 35 mm), tungstenin yoğunluğu 19,3 g/cm³ ve
 *     ısınma ısısı ≈ 0,15 J/(g·K): ≈ 2,1·10⁻⁵ J/K; anma noktasında ısıl zaman sabiti ≈ 11 ms.
 * Filaman 3695 K'de (tungstenin erime sıcaklığı) erir: lamba yanar, açık devre olur.
 * Işık akısı ∝ (T/T_n)^8,9 (lamba yasası Φ ∝ V^3,4 ile V ∝ T^2,6'dan).
 */
export const LAMP_DEFAULTS = { ratedVoltage: 12, ratedPower: 1.2 };
export const LAMP_RATED_TEMPERATURE = 2500;
export const LAMP_MELTING_POINT = 3695;
const LAMP_ROOM = 293.15;
const TUNGSTEN = { exponent: 1.215, rho293: 5.28e-8, density: 19300, specificHeat: 150, emissivity: 0.3 };
const STEFAN_BOLTZMANN = 5.670374e-8;

export function lampParameters(p: Props) {
  const ratedVoltage = Math.max(0.1, numProp(p, 'ratedVoltage', LAMP_DEFAULTS.ratedVoltage));
  const ratedPower = Math.max(1e-3, numProp(p, 'ratedPower', LAMP_DEFAULTS.ratedPower));
  const Tn = LAMP_RATED_TEMPERATURE;
  const hot = (ratedVoltage * ratedVoltage) / ratedPower;
  const scale = (T: number) => (T / Tn) ** TUNGSTEN.exponent;
  const k = ratedPower / (Tn ** 4 - LAMP_ROOM ** 4);
  // Filamanın çapı ve boyu: P = ε·σ·π·d·L·T⁴, R = 4ρL/(πd²).
  const rho = TUNGSTEN.rho293 * (Tn / LAMP_ROOM) ** TUNGSTEN.exponent;
  const d = Math.cbrt((4 * rho * ratedPower) / (TUNGSTEN.emissivity * STEFAN_BOLTZMANN * Math.PI ** 2 * Tn ** 4 * hot));
  const length = (hot * Math.PI * d * d) / (4 * rho);
  const heatCapacity = TUNGSTEN.density * ((Math.PI * d * d) / 4) * length * TUNGSTEN.specificHeat;
  return { ratedVoltage, ratedPower, hot, cold: hot * scale(LAMP_ROOM), scale, k, heatCapacity, diameter: d, length };
}

export class LampDevice extends Device {
  readonly type = 'lamp';
  readonly params: ReturnType<typeof lampParameters>;
  readonly thermal: ThermalResistor;
  burned = false;
  /** Yandığı andaki filaman sıcaklığı (K). */
  burnTemperature = 0;

  constructor(init: DeviceInit) {
    super(init);
    const q = lampParameters(init.props);
    this.params = q;
    const model: ThermalModel = {
      resistance: (T) => {
        const r = q.hot * q.scale(T);
        return { r, dr: (r * TUNGSTEN.exponent) / T };
      },
      loss: (T) => ({ p: q.k * (T ** 4 - LAMP_ROOM ** 4), dp: 4 * q.k * T ** 3 }),
      heatCapacity: q.heatCapacity,
      ambient: LAMP_ROOM,
      minT: 200,
      maxT: 6000,
    };
    this.thermal = new ThermalResistor(model);
  }

  override get nonlinear(): boolean {
    return !this.burned;
  }
  override get reactive(): boolean {
    return true;
  }

  private get tNode(): number {
    return this.nodes[2]!;
  }

  /** Yanmış lamba açık devredir. */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return this.burned ? [[this.tNode, -1]] : [[this.nodes[0]!, this.nodes[1]!], [this.tNode, -1]];
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    this.thermal.stampStatic(sys, this.tNode, ctx);
    // Yanmış lambada ısı düğümü yalnızca ışınımla soğur (doğrusal yaklaşık: anma noktasındaki eğim).
    if (this.burned) sys.add(this.tNode, this.tNode, 4 * this.params.k * LAMP_RATED_TEMPERATURE ** 3);
  }
  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    this.thermal.stampStep(sys, this.tNode, ctx);
    if (this.burned) sys.addRhs(this.tNode, 4 * this.params.k * LAMP_RATED_TEMPERATURE ** 3 * LAMP_ROOM);
  }
  override stampNonlinear(sys: MnaSystem): void {
    if (!this.burned) this.thermal.stampNonlinear(sys, this.nodes[0]!, this.nodes[1]!, this.tNode);
  }
  override updateIterate(x: Float64Array): boolean {
    return this.burned ? true : this.thermal.updateIterate(this.v(x, 0) - this.v(x, 1), this.v(x, 2));
  }
  override restoreIterate(): void {
    this.thermal.restoreIterate();
  }
  override accept(x: Float64Array, ctx: StepContext): void {
    this.thermal.accept(this.burned ? 0 : this.v(x, 0) - this.v(x, 1), this.v(x, 2), ctx);
  }
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [[this.tNode, -1]];
  }

  /** Filaman erime sıcaklığını aşarsa yanar (açık devre). */
  override checkLimits(x: Float64Array): boolean {
    if (this.burned) return false;
    const T = this.v(x, 2);
    if (T < LAMP_MELTING_POINT) return false;
    this.burned = true;
    this.burnTemperature = T;
    return true;
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.burned ? 0 : this.thermal.current(this.v(x, 0) - this.v(x, 1)));
  }

  /** Işık akısının anma değerine oranı. */
  get glow(): number {
    return this.burned ? 0 : (this.thermal.temperature / LAMP_RATED_TEMPERATURE) ** 8.9;
  }

  override status(): DeviceStatus {
    const T = this.thermal.temperature;
    return {
      temperature: T,
      resistance: this.burned ? Number.POSITIVE_INFINITY : this.params.hot * this.params.scale(T),
      glow: this.glow,
      burned: this.burned,
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof LampDevice) {
      this.thermal.copyStateFrom(prev.thermal);
      this.burned = prev.burned;
      this.burnTemperature = prev.burnTemperature;
    }
  }

  override repair(): boolean {
    if (!this.burned) return false;
    this.burned = false;
    this.burnTemperature = 0;
    return true;
  }
}

export const lampModel: DeviceModel = {
  type: 'lamp',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new LampDevice(init),
};
