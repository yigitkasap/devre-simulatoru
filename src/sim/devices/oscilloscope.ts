import { boolProp, numProp, strProp } from '../netlist';
import { ScopeRecorder } from '../scope';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement } from './device';

export type ScopeTrigger = 'A' | 'B';
export const SCOPE_TRIGGERS: readonly ScopeTrigger[] = ['A', 'B'];
/** Y-t: iki kanal zamana göre; X-Y: A yatay, B dikey eksende (karakteristik eğrileri için). */
export type ScopeMode = 'yt' | 'xy';
export const SCOPE_MODES: readonly ScopeMode[] = ['yt', 'xy'];

/** Bölme başına süre ve gerilim seçenekleri (1-2-5 dizisi). */
export const TIME_PER_DIV_STEPS: readonly number[] = [
  10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3, 10e-3, 20e-3, 50e-3, 0.1, 0.2, 0.5, 1,
];
export const VOLTS_PER_DIV_STEPS: readonly number[] = [
  0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50,
];

export const OSCILLOSCOPE_DEFAULTS = {
  timePerDiv: 5e-3,
  voltsPerDivA: 2,
  voltsPerDivB: 2,
  /** Kanalın dikey konumu (bölme): 0'da sıfır çizgisi ekranın ortasındadır. */
  positionA: 0,
  positionB: 0,
  trigger: 'A' as ScopeTrigger,
  mode: 'yt' as ScopeMode,
  /** B kanalını ters çevir (ör. akım ölçme direnci ters yönde bağlıysa). */
  invertB: false,
};

/**
 * Osiloskop. Pinler: [0] = A kanalı, [1] = B kanalı, [2] = ortak uç (COM).
 * Kanallar ortak uca göre gerilimi ölçer: A = v(A) − v(COM), B = v(B) − v(COM).
 * Girişleri idealdir (iç direnç ∞): devreden akım çekmez, matrise hiçbir şey eklemez.
 */
export class OscilloscopeDevice extends Device {
  readonly type = 'oscilloscope';
  readonly timePerDiv: number;
  recorder: ScopeRecorder;

  constructor(init: DeviceInit) {
    super(init);
    this.timePerDiv = Math.max(1e-7, numProp(init.props, 'timePerDiv', OSCILLOSCOPE_DEFAULTS.timePerDiv));
    this.recorder = new ScopeRecorder(this.timePerDiv);
  }

  /** İki kanalın anlık değerleri. */
  channels(x: Float64Array): [number, number] {
    const com = this.v(x, 2);
    return [this.v(x, 0) - com, this.v(x, 1) - com];
  }

  override observe(x: Float64Array, time: number): void {
    const [a, b] = this.channels(x);
    this.recorder.record(time, a, b);
  }

  /** Ölçüm: A kanalı (gerilim olarak); B kanalı durumda `reading` olarak verilir. */
  measure(x: Float64Array): Measurement {
    return { voltage: this.channels(x)[0], current: 0, power: 0 };
  }

  override status(x: Float64Array): DeviceStatus {
    return { reading: this.channels(x)[1] };
  }

  override pinCurrents(): number[] {
    return [0, 0, 0];
  }

  /** Yalnızca bölme başına süre aynı kaldıysa kayıt devralınır (öbür ayarlar yalnızca çizimi değiştirir). */
  override adoptState(prev: Device): void {
    if (prev instanceof OscilloscopeDevice && prev.timePerDiv === this.timePerDiv) this.recorder = prev.recorder;
  }
}

/** Ayar özelliklerini okur (çizim için). */
export function scopeSettings(props: Parameters<typeof numProp>[0]) {
  return {
    timePerDiv: numProp(props, 'timePerDiv', OSCILLOSCOPE_DEFAULTS.timePerDiv),
    voltsPerDiv: [
      numProp(props, 'voltsPerDivA', OSCILLOSCOPE_DEFAULTS.voltsPerDivA),
      numProp(props, 'voltsPerDivB', OSCILLOSCOPE_DEFAULTS.voltsPerDivB),
    ] as const,
    position: [
      numProp(props, 'positionA', OSCILLOSCOPE_DEFAULTS.positionA),
      numProp(props, 'positionB', OSCILLOSCOPE_DEFAULTS.positionB),
    ] as const,
    trigger: strProp(props, 'trigger', SCOPE_TRIGGERS, OSCILLOSCOPE_DEFAULTS.trigger),
    mode: strProp(props, 'mode', SCOPE_MODES, OSCILLOSCOPE_DEFAULTS.mode),
    invertB: boolProp(props, 'invertB', OSCILLOSCOPE_DEFAULTS.invertB),
  };
}

export type ScopeSettings = ReturnType<typeof scopeSettings>;

export const oscilloscopeModel: DeviceModel = {
  type: 'oscilloscope',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new OscilloscopeDevice(init),
};
