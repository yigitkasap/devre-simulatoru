// ATmega328P (Arduino Uno) işlemcisi: avr8js (Wokwi, MIT) üzerine ince bir sarmalayıcı.
//
// İşlemci kendi saatinde (16 MHz) komut komut koşar. Devre tarafıyla bağlantı üç kancadan geçer:
//   - onPins:   bir portun çıkış değeri ya da yönü değişti (digitalWrite, pinMode, PWM kenarı),
//   - onAdc:    bir ADC dönüşümü başladı (analogRead); sonuç completeAdc ile verilir,
//   - onSerial: seri porttan bir bayt gönderildi (Serial.print).
// Pin girişleri setInput ile verilir (devrenin çözümünden, eşik ve histerezisle).

import {
  ADCMuxInputType,
  AVRADC,
  AVRIOPort,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  usart0Config,
  type ADCMuxInput,
} from 'avr8js';
import { MCU_FREQUENCY, PinMode } from './pins';

export { MCU_FREQUENCY, PinMode };

/** delay()'de bir atlamanın en büyük ve en küçük boyu (çevrim). */
const IDLE_SKIP = 1000;
const MIN_SKIP = 16;

/** avr8js'in içinde açık olan ama tipte gizli alanlar (boşta atlama bunları okur). */
interface ClockEvent {
  readonly cycles: number;
  readonly callback: unknown;
  readonly next: ClockEvent | null;
}
interface CpuInternals {
  cycles: number;
  readonly interruptsEnabled: boolean;
  readonly nextInterrupt: number;
  readonly nextClockEvent: ClockEvent | null;
}
interface TimerInternals {
  readonly count: unknown;
  readonly divider: number;
  readonly lastCycle: number;
  readonly tcnt: number;
  readonly ocrA: number;
  readonly ocrB: number;
  readonly TOP: number;
  readonly timerMode: number;
  readonly tcntUpdated: boolean;
  readonly updateDivider: boolean;
}

/** avr8js TimerMode: faz doğru PWM kipleri (yukarı-aşağı sayar). */
const PHASE_CORRECT = new Set([1, 4]);

/**
 * Bir zamanlayıcının bir sonraki olayının (taşma ya da karşılaştırma eşleşmesi) çevrimi; zamanlayıcı
 * kapalıysa sonsuz. Faz doğru PWM'de sayma yönü bilinmediği için en yakın eşik alınır (erken durmak
 * güvenlidir, geç durmak değil).
 */
function timerHorizon(t: TimerInternals, now: number): number {
  if (!t.divider) return Number.POSITIVE_INFINITY;
  if (t.tcntUpdated || t.updateDivider) return now;
  const top = t.TOP;
  const v = t.tcnt;
  let d: number;
  if (PHASE_CORRECT.has(t.timerMode)) {
    d = v === 0 || v === top ? 1 : Number.POSITIVE_INFINITY;
    for (const x of [t.ocrA, t.ocrB, top, 0]) if (x !== v) d = Math.min(d, Math.abs(x - v));
  } else {
    d = top + 1 - v;
    for (const x of [t.ocrA, t.ocrB]) d = Math.min(d, x > v ? x - v : top + 1 - v + x);
  }
  return t.lastCycle + Math.max(1, d) * t.divider;
}
/** Uno'nun program belleği (32 KB; son 512 bayt önyükleyicinin). */
const FLASH_WORDS = 0x4000;

/** Arduino pin numarası (D0–D13, A0–A5 = 14–19) → port ve bit. */
export interface PortPin {
  readonly port: 'B' | 'C' | 'D';
  readonly bit: number;
}

export function arduinoPortPin(pin: number): PortPin {
  if (pin < 8) return { port: 'D', bit: pin };
  if (pin < 14) return { port: 'B', bit: pin - 8 };
  return { port: 'C', bit: pin - 14 };
}

export function decodeFirmware(base64: string): Uint16Array {
  const bytes = typeof atob === 'function'
    ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    : new Uint8Array(Buffer.from(base64, 'base64'));
  const words = new Uint16Array(FLASH_WORDS);
  for (let i = 0; i + 1 < bytes.length; i += 2) words[i >> 1] = bytes[i]! | (bytes[i + 1]! << 8);
  return words;
}

declare const Buffer: { from(data: string, encoding: string): Uint8Array };

export class Atmega328 {
  readonly cpu: CPU;
  private readonly ports: Record<PortPin['port'], AVRIOPort>;
  private readonly adc: AVRADC;
  readonly usart: AVRUSART;
  /** Bir portun çıkışı ya da yönü değişti. */
  onPins: () => void = () => {};
  /** ADC dönüşümü başladı: kanal (0–5) ve dönüşümün süresi (çevrim). */
  onAdc: (channel: number, cycles: number) => void = () => {};
  onSerial: (byte: number) => void = () => {};
  /** Süren run() çağrısının bitiş çevrimi; kancalar küçülterek işlemciyi erken durdurur. */
  end = 0;
  private readonly timers: readonly TimerInternals[];
  private readonly timerCounts: ReadonlySet<unknown>;
  /** delay()'in flash'taki aralığı (kelime adresi); bu aralıkta boşta bekleme atlanır. */
  private readonly idleStart: number;
  private readonly idleEnd: number;
  /** Atlanan çevrim sayısı (ölçüm için). */
  skipped = 0;
  /** Son atlamadan beri zaman (TCNT0) okundu mu? */
  private timeRead = false;

  /** `idle`: delay() işlevinin bayt adresi aralığı (derleyiciden); yoksa bekleme atlanmaz. */
  constructor(program: Uint16Array, idle: readonly [number, number] | null = null) {
    this.cpu = new CPU(program);
    // Zamanlayıcılar: 0 millis/delay ve D5/D6 PWM, 1 D9/D10 PWM (Servo), 2 D3/D11 PWM ve tone().
    this.timers = [timer0Config, timer1Config, timer2Config].map((config) => new AVRTimer(this.cpu, config) as unknown as TimerInternals);
    this.timerCounts = new Set(this.timers.map((t) => t.count));
    this.idleStart = idle ? idle[0] / 2 : 0;
    this.idleEnd = idle ? idle[1] / 2 : 0;
    // micros() TCNT0'ı okur: iki okuma arasında en çok bir atlama (yoksa delay() eski okunan değerle
    // karşılaştırırken zaman birkaç kez ileri sarılmış olur ve dönüş gecikir).
    const tcnt0 = this.cpu.readHooks[timer0Config.TCNT]!;
    this.cpu.readHooks[timer0Config.TCNT] = (addr: number) => {
      this.timeRead = true;
      return tcnt0(addr);
    };
    this.ports = {
      B: new AVRIOPort(this.cpu, portBConfig),
      C: new AVRIOPort(this.cpu, portCConfig),
      D: new AVRIOPort(this.cpu, portDConfig),
    };
    for (const port of Object.values(this.ports)) port.addListener(() => this.onPins());
    this.adc = new AVRADC(this.cpu, adcConfig);
    this.adc.onADCRead = (input: ADCMuxInput) => {
      if (input.type === ADCMuxInputType.SingleEnded) {
        this.onAdc(input.channel, this.adc.sampleCycles);
      } else {
        // İç kaynaklar (1,1 V bant aralığı, sıcaklık algılayıcısı) Arduino örneklerinde kullanılmaz.
        const voltage = input.type === ADCMuxInputType.Constant ? input.voltage : 0.378;
        this.cpu.addClockEvent(() => this.adc.completeADCRead(this.toCode(voltage)), this.adc.sampleCycles);
      }
    };
    this.usart = new AVRUSART(this.cpu, usart0Config, MCU_FREQUENCY);
    this.usart.onByteTransmit = (byte) => this.onSerial(byte);
  }

  get cycles(): number {
    return this.cpu.cycles;
  }

  /** `cycles` çevrime kadar (ya da bir kanca `end`i küçültene kadar) komut işler. */
  run(cycles: number): void {
    const cpu = this.cpu;
    const { idleStart, idleEnd } = this;
    this.end = cycles;
    while (cpu.cycles < this.end) {
      if (cpu.pc >= idleStart && cpu.pc < idleEnd) this.skipIdle();
      avrInstruction(cpu);
      cpu.tick();
    }
  }

  /**
   * delay()'in bekleme döngüsünü ileri sarar. Döngü yalnızca micros()'u okur: zamanlayıcıların bir
   * sonraki olayına (taşma, karşılaştırma eşleşmesi: kesme ya da PWM kenarı) ve zamanlayıcı dışındaki
   * ilk saat olayına (seri port, ADC) kadar hiçbir şey değişmez. İşlemci oraya (en çok IDLE_SKIP
   * çevrim) atlar; zamanlayıcılar aradaki sayımı tek seferde yapar, kesmeler zamanında gelir. İki
   * micros() okuması arasında en çok bir atlama olur: delay()'in dönüşü en çok 2·IDLE_SKIP gecikir
   * (125 µs; delay(500)'de %0,025).
   */
  private skipIdle(): void {
    const cpu = this.cpu as unknown as CpuInternals;
    if (!this.timeRead || !cpu.interruptsEnabled || cpu.nextInterrupt >= 0) return;
    let target = Math.min(this.end, cpu.cycles + IDLE_SKIP);
    for (let e = cpu.nextClockEvent; e; e = e.next) {
      if (!this.timerCounts.has(e.callback)) {
        target = Math.min(target, e.cycles);
        break;
      }
    }
    for (const t of this.timers) target = Math.min(target, timerHorizon(t, cpu.cycles));
    if (target - cpu.cycles < MIN_SKIP) return;
    this.skipped += target - cpu.cycles;
    this.timeRead = false;
    cpu.cycles = target;
    // Aradaki saat olayları (zamanlayıcı sayımları) sırayla; her biri birikmiş sayımı bir kerede yapar.
    for (let guard = 0; guard < 16 && cpu.nextClockEvent && cpu.nextClockEvent.cycles <= cpu.cycles; guard++) this.cpu.tick();
  }

  /** İşlemciyi en geç `cycles` çevriminde durdurur (süren run() içinden çağrılır). */
  stopAt(cycles: number): void {
    this.end = Math.min(this.end, cycles);
  }

  mode(pin: number): PinMode {
    const { port, bit } = arduinoPortPin(pin);
    switch (this.ports[port].pinState(bit)) {
      case PinState.High:
        return PinMode.High;
      case PinState.Low:
        return PinMode.Low;
      case PinState.InputPullUp:
        return PinMode.PullUp;
      default:
        return PinMode.Input;
    }
  }

  /** Giriş pininin mantık değeri (PIN yazmacına yazılır; çıkış pinlerinde etkisizdir). */
  setInput(pin: number, high: boolean): void {
    const { port, bit } = arduinoPortPin(pin);
    this.ports[port].setPin(bit, high);
  }

  /** ADC referansı (analogReference; varsayılan AVCC = 5 V). */
  get adcReference(): number {
    return this.adc.referenceVoltage;
  }

  toCode(voltage: number): number {
    return Math.min(1023, Math.max(0, Math.floor((voltage / this.adc.referenceVoltage) * 1024)));
  }

  /** Başlamış ADC dönüşümünü örneklenen gerilimle tamamlar (`cycles` çevrim sonra). */
  completeAdc(voltage: number, cycles: number): void {
    const code = this.toCode(voltage);
    this.cpu.addClockEvent(() => this.adc.completeADCRead(code), Math.max(1, cycles));
  }
}
