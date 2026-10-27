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

export const MCU_FREQUENCY = 16e6;
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

/** Bir pinin işlemci tarafındaki durumu: giriş, çekme dirençli giriş, düşük ya da yüksek çıkış. */
export const enum PinMode {
  Input = 0,
  PullUp = 1,
  Low = 2,
  High = 3,
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

  constructor(program: Uint16Array) {
    this.cpu = new CPU(program);
    // Zamanlayıcılar: 0 millis/delay ve D5/D6 PWM, 1 D9/D10 PWM (Servo), 2 D3/D11 PWM ve tone().
    new AVRTimer(this.cpu, timer0Config);
    new AVRTimer(this.cpu, timer1Config);
    new AVRTimer(this.cpu, timer2Config);
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
    this.end = cycles;
    while (cpu.cycles < this.end) {
      avrInstruction(cpu);
      cpu.tick();
    }
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
