import type { MnaSystem } from '../mna';
import { boolProp, numProp, strProp, type Props } from '../netlist';
import { ScopeRecorder, type TriggerConfig } from '../scope';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

export type ScopeTrigger = 'A' | 'B';
export const SCOPE_TRIGGERS: readonly ScopeTrigger[] = ['A', 'B'];
/** Y-t: iki kanal zamana göre; ADD: A + B (B ters çevrilirse A − B); X-Y: A yatay, B dikey eksende. */
export type ScopeMode = 'yt' | 'add' | 'xy';
export const SCOPE_MODES: readonly ScopeMode[] = ['yt', 'add', 'xy'];
/** Kanal kuplajı: DC (olduğu gibi), AC (DC bileşen süzülür), GND (giriş kesilir, sıfır çizgisi). */
export type ScopeCoupling = 'dc' | 'ac' | 'gnd';
export const SCOPE_COUPLINGS: readonly ScopeCoupling[] = ['dc', 'ac', 'gnd'];
/** Giriş: gerçek (1 MΩ ‖ 25 pF, devreyi yükler) ya da ideal (akım çekmez). */
export type ScopeInput = 'real' | 'ideal';
export const SCOPE_INPUTS: readonly ScopeInput[] = ['real', 'ideal'];

/** Bölme başına süre ve gerilim seçenekleri (1-2-5 dizisi). */
export const TIME_PER_DIV_STEPS: readonly number[] = [
  0.1e-6, 0.2e-6, 0.5e-6, 1e-6, 2e-6, 5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3,
  50e-3, 0.1, 0.2, 0.5, 1,
];
export const VOLTS_PER_DIV_STEPS: readonly number[] = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
];

/** Gerçek girişin direnci ve kapasitesi (analog osiloskoplarda tipik 1 MΩ ‖ 25 pF). */
export const SCOPE_INPUT_RESISTANCE = 1e6;
export const SCOPE_INPUT_CAPACITANCE = 25e-12;
/** AC kuplajın alt kesim frekansı (analog osiloskoplarda tipik ≈ 10 Hz). */
export const SCOPE_AC_CUTOFF = 10;
/** AC kuplajda girişteki seri kondansatör: 1 MΩ ile 10 Hz'lik kesim verir (≈ 16 nF). */
const SCOPE_AC_CAPACITANCE = 1 / (2 * Math.PI * SCOPE_AC_CUTOFF * SCOPE_INPUT_RESISTANCE);

/** Yeni yerleştirilen osiloskobun ayarları (laboratuvardaki gibi gerçek giriş ve topraklı COM). */
export const OSCILLOSCOPE_DEFAULTS = {
  timePerDiv: 5e-3,
  voltsPerDivA: 2,
  voltsPerDivB: 2,
  /** Kanalın dikey konumu (bölme): 0'da sıfır çizgisi ekranın ortasındadır. */
  positionA: 0,
  positionB: 0,
  couplingA: 'dc' as ScopeCoupling,
  couplingB: 'dc' as ScopeCoupling,
  trigger: 'A' as ScopeTrigger,
  mode: 'yt' as ScopeMode,
  /** B kanalını ters çevir (INV): ADD ile birlikte A − B ölçülür. */
  invertB: false,
  input: 'real' as ScopeInput,
  /** COM ucu şebeke toprağına bağlı (gerçek osiloskoplarda BNC gövdesi topraklıdır). */
  earthed: true,
};

/**
 * Belgede bu özellikler yoksa (bu özellikler eklenmeden önce kaydedilmiş devreler) eski davranış
 * korunur: ideal giriş, topraksız COM.
 */
const LEGACY = { input: 'ideal' as ScopeInput, earthed: false };

/** Ayar özelliklerini okur. */
export function scopeSettings(props: Props) {
  const d = OSCILLOSCOPE_DEFAULTS;
  return {
    timePerDiv: numProp(props, 'timePerDiv', d.timePerDiv),
    voltsPerDiv: [numProp(props, 'voltsPerDivA', d.voltsPerDivA), numProp(props, 'voltsPerDivB', d.voltsPerDivB)] as const,
    position: [numProp(props, 'positionA', d.positionA), numProp(props, 'positionB', d.positionB)] as const,
    coupling: [
      strProp(props, 'couplingA', SCOPE_COUPLINGS, d.couplingA),
      strProp(props, 'couplingB', SCOPE_COUPLINGS, d.couplingB),
    ] as const,
    trigger: strProp(props, 'trigger', SCOPE_TRIGGERS, d.trigger),
    mode: strProp(props, 'mode', SCOPE_MODES, d.mode),
    invertB: boolProp(props, 'invertB', d.invertB),
    input: strProp(props, 'input', SCOPE_INPUTS, LEGACY.input),
    earthed: boolProp(props, 'earthed', LEGACY.earthed),
  };
}

export type ScopeSettings = ReturnType<typeof scopeSettings>;

/**
 * Osiloskop. Pinler: [0] = A kanalı, [1] = B kanalı, [2] = ortak uç (COM).
 * Kanallar ortak uca göre gerilimi ölçer: A = v(A) − v(COM), B = v(B) − v(COM).
 *
 * - Gerçek girişte her kanal (GND kuplajı dışında) COM'a 1 MΩ ‖ 25 pF ile bağlıdır: devreyi
 *   gerçek bir osiloskop gibi yükler. AC kuplajda 1 MΩ'un önünde ≈ 16 nF'lık seri kuplaj
 *   kondansatörü vardır: doğru akım çekmez (ör. sabit öngerilimli bir transistörün bazını
 *   yüklemez). İdeal girişte matrise hiçbir şey eklenmez.
 * - AC kuplaj, kaydedilen değere 10 Hz'lik birinci dereceden yüksek geçiren süzgeç (giriş
 *   kondansatörü + 1 MΩ) olarak uygulanır: y(n) = a·(y(n−1) + x(n) − x(n−1)), a = RC / (RC + Δt).
 * - COM topraklıysa (varsayılan) devrenin toprağıyla aynı düğümdür.
 */
export class OscilloscopeDevice extends Device {
  readonly type = 'oscilloscope';
  readonly timePerDiv: number;
  readonly settings: ScopeSettings;
  recorder: ScopeRecorder;
  /** Giriş kapasitelerinin gerilimi (geri Euler durumu). */
  private capVoltage: [number, number] = [0, 0];
  /** AC kuplaj kondansatörlerinin gerilimi (1 MΩ ile seri; zaman sabiti adımdan çok büyük). */
  private couplingVoltage: [number, number] = [0, 0];
  /** AC kuplaj süzgecinin durumu. */
  private filter: [{ x: number; y: number } | null, { x: number; y: number } | null] = [null, null];
  private lastTime: number | null = null;
  /** Son kaydedilen (kuplajdan geçmiş) kanal değerleri. */
  private shown: [number, number] = [0, 0];

  constructor(init: DeviceInit) {
    super(init);
    this.settings = scopeSettings(init.props);
    this.timePerDiv = Math.max(1e-8, this.settings.timePerDiv);
    this.recorder = new ScopeRecorder(this.timePerDiv);
    this.recorder.setTrigger(this.triggerConfig());
  }

  /** Kanalların devrede bir şeye bağlı olup olmadığı (tetik, bağlı kanala düşer). */
  private channelConnected: [boolean, boolean] = [true, true];

  /** Tetik kaynağı: seçili kanal (bağlı değilse öbürü), ADD kipinde A + B; X-Y kipinde tetik yok. */
  private triggerConfig(): TriggerConfig {
    const s = this.settings;
    const [a, b] = this.channelConnected;
    const source = s.mode === 'add' ? 'sum' : s.trigger === 'B' ? (b || !a ? 'B' : 'A') : a || !b ? 'A' : 'B';
    return { enabled: s.mode !== 'xy', source, invertB: s.invertB };
  }

  override connectPins(connected: readonly boolean[]): void {
    this.channelConnected = [connected[0] ?? true, connected[1] ?? true];
    this.recorder.setTrigger(this.triggerConfig());
  }

  /** Tetik kenarı motorun olayıdır: adım, kenarın hemen sonrasına kısaltılır (titremesiz ekran). */
  override get switching(): boolean {
    return this.settings.mode !== 'xy';
  }

  /**
   * Aday çözümde tetik kenarı varsa adımın içindeki kesri (AC kuplaj süzgeci yaklaşık uygulanır).
   * Kenar adımın sonuna bir kovadan yakınsa adım kısaltılmaz: kayıt kesimi aradeğerle bulur. (Kare
   * dalganın sıçramasında aradeğer kesimi hep adımın ortasına koyar; sınırsız yarılanmasın.)
   */
  override eventFraction(x: Float64Array, h = 0): number | null {
    const raw = this.raw(x);
    const shown = ([0, 1] as const).map((c) => {
      const coupling = this.settings.coupling[c];
      if (coupling === 'gnd') return 0;
      const prev = this.filter[c];
      return coupling === 'dc' || prev === null ? raw[c] : prev.y + raw[c] - prev.x;
    });
    const f = this.recorder.triggerFraction(shown[0]!, shown[1]!);
    return f === null || (1 - f) * h <= this.recorder.bucketTime ? null : f;
  }

  override get limitsStep(): boolean {
    return true;
  }

  /** Ekran yakalanırken adım, ekranın 1/CAPTURE_STEPS'iyle sınırlı. */
  override get stepLimit(): number {
    return this.recorder.stepLimit;
  }

  /** Gerçek girişle yüklenen kanallar (GND kuplajında giriş kesiktir). */
  private loaded(channel: 0 | 1): boolean {
    return this.settings.input === 'real' && this.settings.coupling[channel] !== 'gnd';
  }

  override get reactive(): boolean {
    return this.loaded(0) || this.loaded(1);
  }

  /** Gerçek giriş (1 MΩ ‖ 25 pF) kanalı COM'a bağlar; ideal giriş ve GND kuplaj iletmez. */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return ([0, 1] as const).filter((c) => this.loaded(c)).map((c) => [this.nodes[c]!, this.nodes[2]!]);
  }

  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    for (const c of [0, 1] as const) {
      if (!this.loaded(c)) continue;
      sys.conductance(this.nodes[c]!, this.nodes[2]!, 1 / SCOPE_INPUT_RESISTANCE);
      if (ctx.h > 0) sys.conductance(this.nodes[c]!, this.nodes[2]!, SCOPE_INPUT_CAPACITANCE / ctx.h);
    }
  }

  /** AC kuplajlı (doğru akımı kuplaj kondansatörüyle kesilen) gerçek giriş. */
  private acLoaded(channel: 0 | 1): boolean {
    return this.loaded(channel) && this.settings.coupling[channel] === 'ac';
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    for (const c of [0, 1] as const) {
      // AC kuplajda 1 MΩ'dan geçen akım (v − v_kuplaj)/R: iletkenliğin yanında v_kuplaj/R'lik kaynak.
      if (this.acLoaded(c)) sys.currentSource(this.nodes[2]!, this.nodes[c]!, this.couplingVoltage[c] / SCOPE_INPUT_RESISTANCE);
      if (ctx.h <= 0 || !this.loaded(c)) continue;
      sys.currentSource(this.nodes[2]!, this.nodes[c]!, (SCOPE_INPUT_CAPACITANCE / ctx.h) * this.capVoltage[c]);
    }
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const [a, b] = this.raw(x);
    this.capVoltage = [a, b];
    for (const c of [0, 1] as const) {
      if (!this.acLoaded(c) || ctx.h <= 0) continue;
      const current = ([a, b][c]! - this.couplingVoltage[c]) / SCOPE_INPUT_RESISTANCE;
      this.couplingVoltage[c] += (ctx.h * current) / SCOPE_AC_CAPACITANCE;
    }
  }

  /** İki kanalın uçlarındaki ham gerilimler. */
  raw(x: Float64Array): [number, number] {
    const com = this.v(x, 2);
    return [this.v(x, 0) - com, this.v(x, 1) - com];
  }

  /** Kuplajdan geçmiş (ekranda görünen, ters çevirmesiz) kanal değerleri. */
  channels(): [number, number] {
    return this.shown;
  }

  override observe(x: Float64Array, time: number): void {
    const raw = this.raw(x);
    const dt = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime);
    this.lastTime = time;
    const rc = 1 / (2 * Math.PI * SCOPE_AC_CUTOFF);
    for (const c of [0, 1] as const) {
      const coupling = this.settings.coupling[c];
      if (coupling === 'gnd') {
        this.shown[c] = 0;
        this.filter[c] = null;
      } else if (coupling === 'dc') {
        this.shown[c] = raw[c];
        this.filter[c] = null;
      } else {
        // Kuplaj kondansatörü başlangıçta boştur: ilk değer olduğu gibi görünür, sonra DC bileşen söner.
        const prev = this.filter[c];
        const y = prev === null ? raw[c] : (rc / (rc + dt)) * (prev.y + raw[c] - prev.x);
        this.filter[c] = { x: raw[c], y };
        this.shown[c] = y;
      }
    }
    this.recorder.record(time, this.shown[0], this.shown[1]);
  }

  /** Ölçüm: A kanalı (gerilim olarak) ve girişlerin çektiği akım; B kanalı durumda `reading`. */
  measure(x: Float64Array): Measurement {
    return { voltage: this.shown[0], current: this.pinCurrents(x)[0]!, power: 0 };
  }

  override status(): DeviceStatus {
    return { reading: this.shown[1] };
  }

  /** Girişlerin çektiği akım (gerçek girişte 1 MΩ üzerinden; kapasitif akım ihmal edilir). */
  override pinCurrents(x: Float64Array): number[] {
    const raw = this.raw(x);
    const current = (c: 0 | 1) =>
      this.loaded(c) ? (raw[c] - (this.acLoaded(c) ? this.couplingVoltage[c] : 0)) / SCOPE_INPUT_RESISTANCE : 0;
    const ia = current(0);
    const ib = current(1);
    return [ia, ib, -(ia + ib)];
  }

  /**
   * Bölme başına süre aynı kaldıysa kayıt devralınır (öbür ayarlar yalnızca çizimi değiştirir);
   * giriş kapasiteleri ve AC süzgeci her durumda sürer.
   */
  override adoptState(prev: Device): void {
    if (!(prev instanceof OscilloscopeDevice)) return;
    if (prev.timePerDiv === this.timePerDiv) this.recorder = prev.recorder;
    else this.recorder.perFrame = prev.recorder.perFrame;
    this.channelConnected = prev.channelConnected;
    this.recorder.setTrigger(this.triggerConfig());
    this.capVoltage = prev.capVoltage;
    this.lastTime = prev.lastTime;
    this.shown = prev.shown;
    for (const c of [0, 1] as const) {
      if (prev.settings.coupling[c] === this.settings.coupling[c]) {
        this.filter[c] = prev.filter[c];
        this.couplingVoltage[c] = prev.couplingVoltage[c];
      }
    }
  }
}

export const oscilloscopeModel: DeviceModel = {
  type: 'oscilloscope',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  earthPin: (props) => (scopeSettings(props).earthed ? 2 : null),
  // Gerçek giriş (1 MΩ ‖ 25 pF) kanalı COM'a bağlar; ideal giriş ve GND kuplaj hiçbir şey eklemez.
  couplingPins: (props) => {
    const s = scopeSettings(props);
    return ([0, 1] as const).filter((c) => s.input === 'real' && s.coupling[c] !== 'gnd').map((c) => [c, 2]);
  },
  create: (init) => new OscilloscopeDevice(init),
};
