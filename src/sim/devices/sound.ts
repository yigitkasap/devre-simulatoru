import type { MnaSystem } from '../mna';
import { numProp, type Props } from '../netlist';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';
import { Junction, saturationCurrentFor } from './junction';

// Ses ve koruma: hoparlör, aktif buzzer ve sigorta.

/** Ses örneği: simülasyon zamanı (s) ve değer. Arayüz bunları çalınacak sese çevirir. */
export interface SoundSample {
  readonly t: number;
  readonly v: number;
}

/** Ses örneklerinin tutulduğu en fazla sayı (arayüz okumazsa bellek büyümesin: ≈ 1 s'lik adım). */
const MAX_SOUND_SAMPLES = 40000;

/**
 * Örneği ekler. Sınır aşılınca baştan toplu kırpılır (sınırın 1,5 katında bir kez): her örnekte
 * kırpmak, ses okunmadığında (tarama, testler) her adımda 40 000 öğeyi kaydırırdı (O(n²)).
 */
function pushSample(buffer: SoundSample[], t: number, v: number): void {
  buffer.push({ t, v });
  if (buffer.length > MAX_SOUND_SAMPLES * 1.5) buffer.splice(0, buffer.length - MAX_SOUND_SAMPLES);
}

// --- Hoparlör ------------------------------------------------------------------------------

/**
 * Dinamik hoparlör. Varsayılanlar Visaton FRS 5 (8 Ω, Art. 2231; Visaton veri sayfası): R_dc =
 * 7,2 Ω, bobin endüktansı 0,2 mH, rezonans frekansı f_s = 290 Hz, Q_ms = 3,19, Q_es = 1,81, anma
 * gücü 5 W, ortalama ses basıncı 84 dB (1 W, 1 m). Elektriksel eşdeğer (Thiele-Small):
 *
 *   + ── R_e ── L_e ──┬────────┬────────┐
 *                     C_mes    L_ces    R_es      (hareketli kütle, askının esnekliği, kayıplar)
 *   − ────────────────┴────────┴────────┘
 *
 *   C_mes = Q_es / (2π f_s R_e) ≈ 138 µF,  L_ces = 1 / ((2π f_s)² C_mes) ≈ 2,18 mH,  R_es = R_e·Q_ms/Q_es ≈ 12,7 Ω
 *
 * Paralel kolun gerilimi zarın hızıyla (Bl·u), C_mes'in akımı zarın ivmesiyle orantılıdır; ses basıncı
 * (uzak alanda) ivmeyle orantılı olduğu için çalınan ses C_mes'in akımıdır. Empedans f_s'de R_e +
 * R_es ≈ 19,9 Ω'a çıkar. Doğru akım sese dönüşmez, yalnızca bobini ısıtır.
 */
export const SPEAKER = { re: 7.2, le: 0.2e-3, fs: 290, qms: 3.19, qes: 1.81, ratedPower: 5, spl: 84 };
const SPEAKER_CMES = SPEAKER.qes / (2 * Math.PI * SPEAKER.fs * SPEAKER.re);
const SPEAKER_LCES = 1 / ((2 * Math.PI * SPEAKER.fs) ** 2 * SPEAKER_CMES);
const SPEAKER_RES = (SPEAKER.re * SPEAKER.qms) / SPEAKER.qes;
/** Bobinin ısıl zaman sabiti (s; aşırı yük uyarısı için güç bu süreyle ortalanır). */
const SPEAKER_THERMAL_TIME = 2;
/** Gösterilen gücün (ses düzeyi) ortalama süresi (s). */
const SPEAKER_DISPLAY_TIME = 0.05;

export class SpeakerDevice extends Device {
  readonly type = 'speaker';
  /** Son kabul edilen adım: L_e ve L_ces akımları ve gerilimleri, C_mes'in gerilimi ve akımı. */
  private iLe = 0;
  private vLe = 0;
  private iLces = 0;
  private vC = 0;
  private iC = 0;
  /** Ortalama elektrik gücü: ısıl ortalama (uyarı) ve kısa ortalama (gösterim, ses düzeyi) (W). */
  private heat = 0;
  private power = 0;
  /** Zarın ivmesiyle orantılı C_mes akımının karesinin kısa ortalaması (A²; ses düzeyi). */
  private soundPower = 0;
  /** Ses örnekleri: C_mes'in akımı (A; zarın ivmesiyle orantılı). */
  readonly sound: SoundSample[] = [];

  override get reactive(): boolean {
    return true;
  }

  private get a(): number {
    return this.nodes[0]!;
  }
  private get b(): number {
    return this.nodes[1]!;
  }
  private get n1(): number {
    return this.nodes[2]!;
  }
  private get n2(): number {
    return this.nodes[3]!;
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [[this.a, this.n1, this.n2, this.b]];
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    const [kLe, kL] = this.branches;
    sys.conductance(this.a, this.n1, 1 / SPEAKER.re);
    sys.voltageSource(this.n1, this.n2, kLe!, 0);
    sys.voltageSource(this.n2, this.b, kL!, 0);
    sys.conductance(this.n2, this.b, 1 / SPEAKER_RES);
    if (ctx.h > 0) {
      const cs = chargeScale(ctx);
      sys.add(kLe!, kLe!, -cs * SPEAKER.le);
      sys.add(kL!, kL!, -cs * SPEAKER_LCES);
      sys.conductance(this.n2, this.b, cs * SPEAKER_CMES);
    }
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const [kLe, kL] = this.branches;
    const cs = chargeScale(ctx);
    sys.addRhs(kLe!, -cs * SPEAKER.le * this.iLe - (ctx.trap ? this.vLe : 0));
    sys.addRhs(kL!, -cs * SPEAKER_LCES * this.iLces - (ctx.trap ? this.vC : 0));
    sys.currentSource(this.b, this.n2, cs * SPEAKER_CMES * this.vC + (ctx.trap ? this.iC : 0));
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const [kLe, kL] = this.branches;
    const vC = this.v(x, 3) - this.v(x, 1);
    this.iLe = x[kLe!]!;
    this.iLces = x[kL!]!;
    if (ctx.h > 0) {
      this.vLe = this.v(x, 2) - this.v(x, 3);
      this.iC = chargeScale(ctx) * SPEAKER_CMES * (vC - this.vC) - (ctx.trap ? this.iC : 0);
      const p = (this.v(x, 0) - this.v(x, 1)) * this.iLe;
      this.heat += (p - this.heat) * (1 - Math.exp(-ctx.h / SPEAKER_THERMAL_TIME));
      const k = 1 - Math.exp(-ctx.h / SPEAKER_DISPLAY_TIME);
      this.power += (p - this.power) * k;
      this.soundPower += (this.iC * this.iC - this.soundPower) * k;
    }
    this.vC = vC;
  }

  override observe(_x: Float64Array, time: number): void {
    pushSample(this.sound, time, this.iC);
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [
      [this.branches[0]!, -1],
      [this.branches[1]!, -1],
      [this.n2, this.b],
    ];
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, x[this.branches[0]!]!);
  }

  /**
   * Ses basıncı düzeyi (1 m) zarın ivmesinden: 1 kHz'te 1 W'ta (C_mes'in etkin akımı ≈ √(1 W / R_e))
   * 84 dB; geçirme bandında 84 dB + 10·log(P/1 W) ile aynı, rezonansta zar daha çok salındığı için
   * daha yüksek.
   */
  override status(): DeviceStatus {
    const p = Math.max(this.power, 0);
    const relative = this.soundPower * SPEAKER.re;
    return { averagePower: p, ...(relative > 1e-12 ? { spl: SPEAKER.spl + 10 * Math.log10(relative) } : {}) };
  }

  override ratingWarnings(): readonly RatingWarning[] {
    return this.heat > SPEAKER.ratedPower ? [{ code: 'resistor-overpower', params: { power: this.heat, rating: SPEAKER.ratedPower } }] : [];
  }

  override adoptState(prev: Device): void {
    if (prev instanceof SpeakerDevice) {
      this.iLe = prev.iLe;
      this.vLe = prev.vLe;
      this.iLces = prev.iLces;
      this.vC = prev.vC;
      this.iC = prev.iC;
      this.heat = prev.heat;
      this.power = prev.power;
      this.soundPower = prev.soundPower;
    }
  }
}

/** Ses örneğini hoparlörün 1 W'lık (1 kHz) ses düzeyine oranlar: 1 W'ta tepe değeri 1. */
export const SPEAKER_REFERENCE_CURRENT = Math.sqrt(2 / SPEAKER.re);

export const speakerModel: DeviceModel = {
  type: 'speaker',
  pinCount: 2,
  internalNodes: 2,
  branchCount: 2,
  create: (init) => new SpeakerDevice(init),
};

// --- Aktif buzzer --------------------------------------------------------------------------

/**
 * Aktif (içinde osilatör olan) manyetik buzzer. Varsayılanlar Same Sky (eski adıyla CUI Devices)
 * CMI-1295IC-0585T'den: anma gerilimi 5 V (çalışma 4–7 V), anma geriliminde 30 mA, frekans
 * 2400 Hz (2300–2500), 10 cm'de 85 dB. Elektriksel model: iç sürücünün kutuplanma eklemi (diyot) ve
 * seri bir direnç (5 V'ta 30 mA): ters bağlanınca akım geçmez ve ses çıkmaz. Osilatör ≈ 3 V'ta
 * çalışmaya başlar; ses basıncı gerilimle orantılı kabul edilir (85 dB + 20·log(V/5 V)).
 */
export const BUZZER = { ratedVoltage: 5, ratedCurrent: 0.03, frequency: 2400, spl: 85, startVoltage: 3, maxVoltage: 7 };
const BUZZER_JUNCTION_N = 1.8;
const BUZZER_RESISTANCE = (BUZZER.ratedVoltage - 0.7) / BUZZER.ratedCurrent;

export class BuzzerDevice extends Device {
  readonly type = 'buzzer';
  readonly junction = new Junction(saturationCurrentFor(1e-3, 0.6, BUZZER_JUNCTION_N), BUZZER_JUNCTION_N, null);
  /** Ses örnekleri: buzzerin uç gerilimi (osilatörün sürüldüğü gerilim). */
  readonly sound: SoundSample[] = [];

  override get nonlinear(): boolean {
    return true;
  }

  private get inner(): number {
    return this.nodes[2]!;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.conductance(this.inner, this.nodes[1]!, 1 / BUZZER_RESISTANCE);
  }
  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.junction.stamp(sys, this.nodes[0]!, this.inner, ctx);
  }
  override updateIterate(x: Float64Array): boolean {
    return this.junction.update(this.v(x, 0) - this.v(x, 2));
  }
  override restoreIterate(): void {
    this.junction.restore();
  }
  override accept(_x: Float64Array, ctx: StepContext): void {
    this.junction.accept(ctx);
  }
  override observe(x: Float64Array, time: number): void {
    pushSample(this.sound, time, this.v(x, 0) - this.v(x, 1));
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, (this.v(x, 2) - this.v(x, 1)) / BUZZER_RESISTANCE);
  }

  /** Ötüyor mu (osilatör çalışıyor) ve ses basıncı düzeyi (10 cm). */
  override status(x: Float64Array): DeviceStatus {
    const v = this.v(x, 0) - this.v(x, 1);
    return v >= BUZZER.startVoltage ? { sounding: true, spl: BUZZER.spl + 20 * Math.log10(v / BUZZER.ratedVoltage) } : { sounding: false };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof BuzzerDevice) this.junction.copyStateFrom(prev.junction);
  }
}

/** Buzzerin sesi: gerilime göre genlik (anma geriliminde 1); osilatör çalışmıyorsa 0. */
export function buzzerLevel(voltage: number): number {
  return voltage >= BUZZER.startVoltage ? Math.min(voltage, BUZZER.maxVoltage * 1.3) / BUZZER.ratedVoltage : 0;
}

export const buzzerModel: DeviceModel = {
  type: 'buzzer',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new BuzzerDevice(init),
};

// --- Sigorta -------------------------------------------------------------------------------

/**
 * Cam gövdeli hızlı sigorta. Varsayılanlar Littelfuse 217 serisi 1 A'den (0217001; Littelfuse ürün
 * sayfası): soğuk direnç 0,09635 Ω, erime I²t 1,042 A²s; IEC 60127-2 (sayfa 2) hızlı sigorta
 * eğrisi: 1,5·I_n'de en az 1 saat dayanır, 2,1·I_n'de 30 dakikada, 2,75·I_n'de 10 ms – 2 s'de,
 * 4·I_n'de 3–300 ms'de, 10·I_n'de en fazla 20 ms'de atar.
 * Model: telin ısınması birinci dereceden ısıl denklemle (normalleştirilmiş, θ = 1'de erir):
 *   τ·dθ/dt = (I / I_min)² − θ,   τ = I²t / I_min²
 * I_min = 1,8·I_n (en küçük eritme akımı): bu akımın altında tel hiç erimez, çok büyük akımda erime
 * süresi I²t / I²'ye iner. Bu değerlerle 2,75·I_n'de 0,18 s, 4·I_n'de 73 ms, 10·I_n'de 10,6 ms
 * (hepsi standardın aralığında). Başka anma akımları için direnç ∝ 1/I_n, I²t ∝ I_n² alınır.
 * Erime anı olay olarak bulunur; atan sigorta açık devredir (Onar: yeni sigorta).
 */
export const FUSE_DEFAULTS = { rating: 1 };
const FUSE_1A = { resistance: 0.09635, i2t: 1.042 };
export const FUSE_MIN_FUSING_FACTOR = 1.8;

export function fuseSettings(p: Props) {
  const rating = Math.max(1e-3, numProp(p, 'rating', FUSE_DEFAULTS.rating));
  const minimum = FUSE_MIN_FUSING_FACTOR * rating;
  const i2t = FUSE_1A.i2t * rating * rating;
  return { rating, minimum, i2t, resistance: FUSE_1A.resistance / rating, tau: i2t / (minimum * minimum) };
}

/** I akımında sigortanın atma süresi (s); hiç atmıyorsa sonsuz. */
export function fuseBlowTime(current: number, p: Props = {}): number {
  const s = fuseSettings(p);
  const k = (current / s.minimum) ** 2;
  return k <= 1 ? Number.POSITIVE_INFINITY : s.tau * Math.log(k / (k - 1));
}

export class FuseDevice extends Device {
  readonly type = 'fuse';
  readonly settings: ReturnType<typeof fuseSettings>;
  /** Telin ısınması (1'de erir) ve son kabul edilen adımdaki akım. */
  private heat = 0;
  private current = 0;
  blown = false;
  /** Attığı andaki akım (A). */
  blowCurrent = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.settings = fuseSettings(init.props);
  }

  override get switching(): boolean {
    return !this.blown;
  }

  /** Telin ısınması zamanla değişir: dirençli bir devrede de zaman adımı atılır. */
  override get reactive(): boolean {
    return true;
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return this.blown ? [] : [this.nodes];
  }

  override stampStatic(sys: MnaSystem): void {
    if (!this.blown) sys.conductance(this.nodes[0]!, this.nodes[1]!, 1 / this.settings.resistance);
  }

  private currentAt(x: Float64Array): number {
    return this.blown ? 0 : (this.v(x, 0) - this.v(x, 1)) / this.settings.resistance;
  }

  /** Adımın sonundaki ısınma: akımın karesi adım boyunca doğrusal değişiyor sayılır. */
  private heatAfter(i: number, h: number): number {
    const decay = Math.exp(-h / this.settings.tau);
    const drive = (0.5 * (this.current * this.current + i * i)) / (this.settings.minimum * this.settings.minimum);
    return this.heat * decay + drive * (1 - decay);
  }

  private lastH = 0;

  override stampStep(_sys: MnaSystem, ctx: StepContext): void {
    this.lastH = ctx.h;
  }

  override eventFraction(x: Float64Array): number | null {
    if (this.blown || this.lastH <= 0) return null;
    const after = this.heatAfter(this.currentAt(x), this.lastH);
    if (after < 1) return null;
    return this.heat < 1 ? (1 - this.heat) / (after - this.heat) : 0;
  }

  override switchState(x: Float64Array): boolean {
    if (this.blown || this.lastH <= 0 || this.heatAfter(this.currentAt(x), this.lastH) < 1) return false;
    this.blowCurrent = Math.abs(this.currentAt(x));
    this.blown = true;
    return true;
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const i = this.currentAt(x);
    if (ctx.h > 0 && !this.blown) this.heat = Math.min(1, this.heatAfter(i, ctx.h));
    if (this.blown) this.heat = 0;
    this.current = i;
  }

  measure(x: Float64Array): Measurement {
    return this.twoTerminal(x, this.currentAt(x));
  }

  override status(): DeviceStatus {
    return { burned: this.blown, heating: this.heat };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof FuseDevice) {
      this.blown = prev.blown;
      this.blowCurrent = prev.blowCurrent;
      this.heat = prev.heat;
      this.current = prev.current;
    }
  }

  override repair(): boolean {
    if (!this.blown) return false;
    this.blown = false;
    this.blowCurrent = 0;
    this.heat = 0;
    this.current = 0;
    return true;
  }
}

export const fuseModel: DeviceModel = {
  type: 'fuse',
  pinCount: 2,
  internalNodes: 0,
  branchCount: 0,
  // Atan sigorta matrise bir şey eklemez; ada hesabında da iki ucu ayrı sayılmaz (güvenli taraf).
  create: (init) => new FuseDevice(init),
};

