import type { MnaSystem } from '../mna';
import { boolProp, numProp, strProp, type Props } from '../netlist';
import { WAVEFORMS, waveAtPhase, type Waveform } from './acsource';
import { Device, type DeviceInit, type DeviceModel, type Measurement, type StepContext } from './device';

/**
 * Laboratuvar fonksiyon üreteci (GW Instek GFG-8015G benzeri; veri sayfası: 0,2 Hz – 2 MHz,
 * açık devrede > 20 V tepe-tepe, 50 Ω çıkış, ±10 V DC offset, %10–90 simetri, −20 dB zayıflatıcı,
 * TTL darbe çıkışı). Pinler: [0] = çıkış (OUT), [1] = TTL darbe çıkışı, [2] = ortak uç (COM).
 *
 *   COM ── ideal kaynak e(t) ── (iç düğüm) ── 50 Ω ── OUT
 *   COM ── ideal kaynak 0/5 V ── (iç düğüm) ── 50 Ω ── TTL
 *
 * Genlik açık devre tepe-tepe değeridir (ön paneldeki gibi); 50 Ω'luk yükte yarıya düşer.
 * COM, gerçek cihazdaki gibi şebeke toprağına bağlıdır (kapatılabilir): devrenin toprağıyla
 * aynı düğümdür.
 */
export const FUNCGEN_DEFAULTS = {
  waveform: 'sine' as Waveform,
  frequency: 1000,
  amplitude: 2,
  offset: 0,
  duty: 50,
  attenuate: false,
  earthed: true,
};

export const FUNCGEN_LIMITS = {
  minFrequency: 0.2,
  maxFrequency: 2e6,
  maxAmplitude: 20,
  maxOffset: 10,
  minDuty: 10,
  maxDuty: 90,
};

export const FUNCGEN_OUTPUT_RESISTANCE = 50;
export const FUNCGEN_TTL_HIGH = 5;

/**
 * Simetri (duty) ayarı: periyodun ilk d kesri dalganın ilk yarısına, kalanı ikinci yarısına
 * eşlenir. Kare dalgada darbe genişliği, üçgende testere dişi, sinüste eğik sinüs olur.
 */
export function warpPhase(phase: number, duty: number): number {
  return phase < duty ? (0.5 * phase) / duty : 0.5 + (0.5 * (phase - duty)) / (1 - duty);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ön panel ayarları (çizim ve bilgi kutusu da kullanır). */
export function funcgenSettings(props: Props) {
  const d = FUNCGEN_DEFAULTS;
  const L = FUNCGEN_LIMITS;
  return {
    waveform: strProp(props, 'waveform', WAVEFORMS, d.waveform),
    frequency: clamp(numProp(props, 'frequency', d.frequency), L.minFrequency, L.maxFrequency),
    amplitude: clamp(Math.abs(numProp(props, 'amplitude', d.amplitude)), 0, L.maxAmplitude),
    offset: clamp(numProp(props, 'offset', d.offset), -L.maxOffset, L.maxOffset),
    duty: clamp(numProp(props, 'duty', d.duty), L.minDuty, L.maxDuty) / 100,
    attenuate: boolProp(props, 'attenuate', d.attenuate),
    earthed: boolProp(props, 'earthed', d.earthed),
  };
}

export class FuncgenDevice extends Device {
  readonly type = 'funcgen';
  readonly settings: ReturnType<typeof funcgenSettings>;

  constructor(init: DeviceInit) {
    super(init);
    this.settings = funcgenSettings(init.props);
  }

  override get timeVarying(): boolean {
    return true;
  }

  override get period(): number {
    return 1 / this.settings.frequency;
  }

  private get gain(): number {
    return this.settings.attenuate ? 0.1 : 1;
  }

  override get peakVoltage(): number {
    const s = this.settings;
    return Math.max((Math.abs(s.offset) + s.amplitude / 2) * this.gain, FUNCGEN_TTL_HIGH);
  }

  private phase(t: number): number {
    const cycles = t * this.settings.frequency;
    return cycles - Math.floor(cycles);
  }

  /** Çıkışın iç (açık devre) gerilimi e(t). */
  emf(t: number): number {
    const s = this.settings;
    return (s.offset + (s.amplitude / 2) * waveAtPhase(s.waveform, warpPhase(this.phase(t), s.duty))) * this.gain;
  }

  /** TTL darbe çıkışının iç gerilimi: periyodun ilk "simetri" kesrinde 5 V, sonra 0 V. */
  ttl(t: number): number {
    return this.phase(t) < this.settings.duty ? FUNCGEN_TTL_HIGH : 0;
  }

  private get out(): number {
    return this.nodes[0]!;
  }
  private get pulse(): number {
    return this.nodes[1]!;
  }
  private get com(): number {
    return this.nodes[2]!;
  }
  private get innerOut(): number {
    return this.nodes[3]!;
  }
  private get innerPulse(): number {
    return this.nodes[4]!;
  }

  override stampStatic(sys: MnaSystem): void {
    sys.voltageSource(this.innerOut, this.com, this.branches[0]!, 0);
    sys.conductance(this.innerOut, this.out, 1 / FUNCGEN_OUTPUT_RESISTANCE);
    sys.voltageSource(this.innerPulse, this.com, this.branches[1]!, 0);
    sys.conductance(this.innerPulse, this.pulse, 1 / FUNCGEN_OUTPUT_RESISTANCE);
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    sys.addRhs(this.branches[0]!, this.emf(ctx.time) * ctx.sourceScale);
    sys.addRhs(this.branches[1]!, this.ttl(ctx.time) * ctx.sourceScale);
  }

  /** OUT ucundan dış devreye verilen akım. */
  outputCurrent(x: Float64Array): number {
    return (this.v(x, 3) - this.v(x, 0)) / FUNCGEN_OUTPUT_RESISTANCE;
  }

  pulseCurrent(x: Float64Array): number {
    return (this.v(x, 4) - this.v(x, 1)) / FUNCGEN_OUTPUT_RESISTANCE;
  }

  /** Uçlara giren akımlar; COM'un akımı, cihaz topraklıysa kısmen toprak üzerinden döner. */
  override pinCurrents(x: Float64Array): number[] {
    const out = this.outputCurrent(x);
    const pulse = this.pulseCurrent(x);
    return [-out, -pulse, out + pulse];
  }

  /** Ölçüm: çıkış uç gerilimi (OUT − COM) ve OUT'a giren akım. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 2);
    const current = -this.outputCurrent(x);
    return { voltage, current, power: voltage * current };
  }

  override idealVoltageBranches(): Array<readonly [number, number]> {
    return [];
  }
}

export const funcgenModel: DeviceModel = {
  type: 'funcgen',
  pinCount: 3,
  internalNodes: 2,
  branchCount: 2,
  earthPin: (props) => (boolProp(props, 'earthed', FUNCGEN_DEFAULTS.earthed) ? 2 : null),
  referencePins: (props) => (boolProp(props, 'earthed', FUNCGEN_DEFAULTS.earthed) ? [] : [2]),
  create: (init) => new FuncgenDevice(init),
};
