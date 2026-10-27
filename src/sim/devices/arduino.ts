import type { Atmega328 } from '../arduino/mcu';
import { MCU_FREQUENCY, PinMode } from '../arduino/pins';
import { arduinoRuntime, loadArduinoRuntime } from '../arduino/runtime';
import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning, type StepContext } from './device';

/**
 * Arduino Uno R3 (ATmega328P, 16 MHz). İşlemci avr8js ile komut komut koşar; seçilen örnek
 * program (props.program) önceden derlenmiştir (src/arduino/sketches, npm run arduino:derle).
 *
 * Pinler: [0] 5V, [1] 3V3, [2] GND, [3–8] A0–A5, [9–20] D2–D13, [21] GND (dijital pinlerin
 * yanındaki ikinci GND; kart üstünde birinciye bağlı). D0/D1 USB seri bağlantısınındır (Seri ekran),
 * devreye çıkarılmaz. Değerler ATmega328P veri sayfasından (DS40002061A, 5 V, 25 °C,
 * tipik eğriler) ve Uno R3 şemasından:
 *   - Çıkış: 0 ya da 5 V arkasında 25 Ω (20 mA'de V_OH ≈ 4,5 V, V_OL ≈ 0,5 V). Mutlak sınır 40 mA.
 *   - Giriş: yüksek empedans; INPUT_PULLUP'ta 5 V'a 35 kΩ (veri sayfası 20–50 kΩ). Schmitt
 *     eşikleri: yükselen 2,6 V, düşen 2,15 V.
 *   - ADC: 10 bit, referans AVCC = 5 V; gerilim dönüşümün başladığı anda örneklenir.
 *   - 5V: USB'den, sigorta ve hat dahil 0,2 Ω; 3V3: LP2985 düzenleyicisi, 1 Ω, 150 mA.
 *   - Kart üstü L LED'i D13'ü bir tamponla izler (D13'e yük olmaz).
 *   - İki GND ucu arasında kartın toprak düzlemi: 10 mΩ.
 *
 * Zamanlama (devre ile işlemcinin eşgüdümü): işlemci analog çözümün en fazla LOOKAHEAD önünde
 * koşar. Bir çıkış değişince (digitalWrite, PWM kenarı) durur; değişim anı bir kırılma noktasıdır,
 * analog adım tam o ana denk gelir ve yeni değer sonraki adımda geçerlidir. analogRead'de işlemci
 * dönüşümün başladığı anda bekler; analog çözüm o ana gelince gerilim okunur. Girişlerin
 * (digitalRead) gecikmesi en çok LOOKAHEAD'dir.
 */
export const ARDUINO = {
  outputResistance: 25,
  pullUp: 35e3,
  risingThreshold: 2.6,
  fallingThreshold: 2.15,
  supply: 5,
  supplyResistance: 0.2,
  regulator: 3.3,
  regulatorResistance: 1,
  pinCurrentLimit: 0.04,
  /** USB sigortası (Uno R3: MF-MSMF050, 500 mA). */
  usbCurrentLimit: 0.5,
  regulatorCurrentLimit: 0.15,
};

/** İşlemcinin analog çözümün en fazla ne kadar önünde koşabileceği (s): girişlerin gecikmesi. */
const LOOKAHEAD = 50e-6;
/** Bu süreden yakın çıkış değişimleri tek kırılma noktasında birleşir (s). */
const MERGE = 0.5e-6;
/** ADC örneklemesinin analog çözüme göre kabul edilen kayması (s). */
const ADC_SLACK = 4e-6;

/** Devreye çıkan pinler (D2–D13, A0–A5) ve Arduino numaraları (A0 = 14). */
export const ARDUINO_IO = [14, 15, 16, 17, 18, 19, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
const FIRST_IO = 3;
const PIN = { v5: 0, v33: 1, gnd: 2, gnd2: 21 } as const;
/** İki GND ucu arasındaki toprak düzleminin direnci (Ω). */
const GROUND_PLANE = 0.01;

export function arduinoPinLabel(io: number): string {
  return io >= 14 ? `A${io - 14}` : `D${io}`;
}

/** Bir çıkış değişimi: işlemcinin zamanında (s) ve o andaki bütün pin kipleri. */
interface PendingChange {
  time: number;
  modes: Uint8Array;
}

/** Bir Arduino kartının işlemcisi ve zaman bilgisi (devre yeniden derlenince devralınır). */
class Board {
  readonly mcu: Atmega328;
  /** İşlemcinin 0. çevrimine karşılık gelen simülasyon zamanı. */
  readonly origin: number;
  serial = '';
  readonly decoder = new TextDecoder();
  lastSerialTime = Number.NEGATIVE_INFINITY;
  pending: PendingChange | null = null;
  mergeUntil = 0;
  adcRequest: { channel: number; time: number; cycles: number } | null = null;

  constructor(
    readonly program: string,
    mcu: Atmega328,
    origin: number,
  ) {
    this.mcu = mcu;
    this.origin = origin;
  }

  get time(): number {
    return this.origin + this.mcu.cycles / MCU_FREQUENCY;
  }
}

const SERIAL_LIMIT = 4000;

export class ArduinoDevice extends Device {
  readonly type = 'arduino';
  private board: Board | null = null;
  /** Son kabul edilen analog çözümün zamanı; henüz yoksa NaN. */
  private accepted = Number.NaN;
  /** Devreye uygulanmış pin kipleri (ARDUINO_IO sırasıyla). */
  private applied: Uint8Array = new Uint8Array(ARDUINO_IO.length);
  /** stampStatic'in kullandığı kipler (giriş / çekme / çıkış ayrımı matrisi değiştirir). */
  private stamped = new Uint8Array(ARDUINO_IO.length);
  /** Girişlerin mantık değeri (histerezis için). */
  private inputs = new Uint8Array(ARDUINO_IO.length);
  /** Son kabul edilen çözümde pinlerin GND'ye göre gerilimi (ADC örneklemesi için). */
  private voltages = new Float64Array(ARDUINO_IO.length);

  constructor(init: DeviceInit) {
    super(init);
  }

  get program(): string {
    return String(this.props.program ?? '');
  }

  override get switching(): boolean {
    return true;
  }
  override get reactive(): boolean {
    return true;
  }
  override get timeVarying(): boolean {
    return true;
  }
  override get limitsStep(): boolean {
    return true;
  }
  override get peakVoltage(): number {
    return ARDUINO.supply;
  }

  private ensureBoard(time: number): Board | null {
    if (this.board) return this.board;
    // İşlemci tembel yüklenir: yüklenene kadar kart çalışmıyor (pinler giriş) sayılır.
    const runtime = arduinoRuntime();
    if (!runtime) {
      void loadArduinoRuntime();
      return null;
    }
    const mcu = runtime.create(this.program);
    if (!mcu) return null;
    const board = new Board(this.program, mcu, time);
    this.attach(board);
    return board;
  }

  /** İşlemcinin kancalarını bu örneğe bağlar (devre yeniden derlenince yeni örnek devralır). */
  private attach(board: Board): void {
    this.board = board;
    const mcu = board.mcu;
    mcu.onPins = () => this.pinsChanged(board);
    mcu.onAdc = (channel, cycles) => {
      board.adcRequest = { channel, time: board.time, cycles };
      mcu.stopAt(0);
    };
    mcu.onSerial = (byte) => {
      // Arduino kodundaki metinler UTF-8'dir (ı, ş, °): baytlar akış olarak çözülür.
      board.serial = (board.serial + board.decoder.decode(Uint8Array.of(byte), { stream: true })).slice(-SERIAL_LIMIT);
      board.lastSerialTime = board.time;
    };
  }

  private readModes(board: Board): Uint8Array {
    const modes = new Uint8Array(ARDUINO_IO.length);
    ARDUINO_IO.forEach((io, i) => (modes[i] = board.mcu.mode(io)));
    return modes;
  }

  private pinsChanged(board: Board): void {
    const modes = this.readModes(board);
    const reference = board.pending?.modes ?? this.applied;
    if (modes.every((m, i) => m === reference[i])) return;
    if (board.pending) {
      board.pending.modes = modes;
    } else {
      // İlk değişim: işlemci MERGE kadar daha koşar (aynı ana düşen öbür değişimler birleşsin), sonra durur.
      board.pending = { time: board.time, modes };
      board.mergeUntil = board.mcu.cycles + Math.ceil(MERGE * MCU_FREQUENCY);
      board.mcu.stopAt(board.mergeUntil);
    }
  }

  /**
   * İşlemciyi analog çözümün LOOKAHEAD önüne kadar (ya da bir çıkış değişimine / ADC dönüşümüne
   * kadar) koşturur. Analog çözümün zaten geçtiği değişim ve dönüşümler hemen uygulanır.
   */
  private sync(now: number): void {
    const board = this.ensureBoard(now);
    if (!board) return;
    const mcu = board.mcu;
    for (let guard = 0; guard < 64; guard++) {
      if (board.pending) {
        if (mcu.cycles < board.mergeUntil && !board.adcRequest) {
          mcu.run(board.mergeUntil);
          continue;
        }
        if (board.pending.time > now + MERGE) return;
        this.applyPending(board);
      }
      if (board.adcRequest) {
        if (board.adcRequest.time > now + ADC_SLACK) return;
        const { channel, cycles } = board.adcRequest;
        board.adcRequest = null;
        // ARDUINO_IO A0–A5 ile başlar: kanal k'nin gerilimi voltages[k].
        mcu.completeAdc(this.voltages[channel] ?? 0, cycles);
      }
      const target = Math.ceil((now + LOOKAHEAD - board.origin) * MCU_FREQUENCY);
      if (mcu.cycles >= target) return;
      mcu.run(target);
    }
  }

  private applyPending(board: Board): void {
    this.applied = board.pending!.modes;
    board.pending = null;
  }

  override get stepLimit(): number {
    if (Number.isNaN(this.accepted)) return Number.POSITIVE_INFINITY;
    this.sync(this.accepted);
    const board = this.board;
    if (!board || board.pending) return Number.POSITIVE_INFINITY;
    const until = board.adcRequest ? board.adcRequest.time : board.time;
    return Math.max(until - this.accepted, 1e-9);
  }

  override nextBreakpoint(after: number): number {
    if (Number.isNaN(this.accepted)) this.accepted = after;
    this.sync(this.accepted);
    return this.board?.pending?.time ?? Number.POSITIVE_INFINITY;
  }

  private category(mode: number): number {
    return mode >= PinMode.Low ? 2 : mode;
  }

  override stampStatic(sys: MnaSystem): void {
    const a = ARDUINO;
    const gnd = this.nodes[PIN.gnd]!;
    sys.conductance(this.nodes[PIN.v5]!, gnd, 1 / a.supplyResistance);
    sys.currentSource(gnd, this.nodes[PIN.v5]!, a.supply / a.supplyResistance);
    sys.conductance(this.nodes[PIN.v33]!, gnd, 1 / a.regulatorResistance);
    sys.currentSource(gnd, this.nodes[PIN.v33]!, a.regulator / a.regulatorResistance);
    sys.conductance(this.nodes[PIN.gnd2]!, gnd, 1 / GROUND_PLANE);
    for (let i = 0; i < ARDUINO_IO.length; i++) {
      const node = this.nodes[FIRST_IO + i]!;
      const mode = this.applied[i]!;
      this.stamped[i] = this.category(mode);
      if (mode === PinMode.PullUp) {
        sys.conductance(node, gnd, 1 / a.pullUp);
        sys.currentSource(gnd, node, a.supply / a.pullUp);
      } else if (mode >= PinMode.Low) {
        sys.conductance(node, gnd, 1 / a.outputResistance);
      }
    }
  }

  override stampStep(sys: MnaSystem, _ctx: StepContext): void {
    const a = ARDUINO;
    const gnd = this.nodes[PIN.gnd]!;
    for (let i = 0; i < ARDUINO_IO.length; i++) {
      if (this.applied[i] === PinMode.High) sys.currentSource(gnd, this.nodes[FIRST_IO + i]!, a.supply / a.outputResistance);
    }
  }

  /** Bir pinin kipi giriş/çekme/çıkış arasında değiştiyse matris yeniden kurulur. */
  override switchState(): boolean {
    for (let i = 0; i < ARDUINO_IO.length; i++) {
      if (this.category(this.applied[i]!) !== this.stamped[i]) return true;
    }
    return false;
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.accepted = ctx.time;
    const gnd = this.v(x, PIN.gnd);
    const board = this.board;
    for (let i = 0; i < ARDUINO_IO.length; i++) {
      const v = this.v(x, FIRST_IO + i) - gnd;
      this.voltages[i] = v;
      const high = this.inputs[i] ? v > ARDUINO.fallingThreshold : v > ARDUINO.risingThreshold;
      if (high !== !!this.inputs[i]) {
        this.inputs[i] = high ? 1 : 0;
        board?.mcu.setInput(ARDUINO_IO[i]!, high);
      }
    }
    if (board?.pending && board.pending.time <= ctx.time + MERGE) this.applyPending(board);
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    const group = [this.nodes[PIN.v5]!, this.nodes[PIN.v33]!, this.nodes[PIN.gnd]!, this.nodes[PIN.gnd2]!];
    for (let i = 0; i < ARDUINO_IO.length; i++) if (this.applied[i] !== PinMode.Input) group.push(this.nodes[FIRST_IO + i]!);
    return [group];
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [[...this.nodes]];
  }

  /** Bir IO pininden devreye verilen akım (A; pinden dışarı pozitif). */
  pinOutput(x: Float64Array, i: number): number {
    const a = ARDUINO;
    const v = this.v(x, FIRST_IO + i) - this.v(x, PIN.gnd);
    switch (this.applied[i]) {
      case PinMode.High:
        return (a.supply - v) / a.outputResistance;
      case PinMode.Low:
        return -v / a.outputResistance;
      case PinMode.PullUp:
        return (a.supply - v) / a.pullUp;
      default:
        return 0;
    }
  }

  private supplyCurrents(x: Float64Array): { usb: number; regulator: number } {
    const a = ARDUINO;
    const gnd = this.v(x, PIN.gnd);
    return {
      usb: (a.supply - (this.v(x, PIN.v5) - gnd)) / a.supplyResistance,
      regulator: (a.regulator - (this.v(x, PIN.v33) - gnd)) / a.regulatorResistance,
    };
  }

  override pinCurrents(x: Float64Array): number[] {
    const { usb, regulator } = this.supplyCurrents(x);
    const currents = [-usb, -regulator, 0];
    for (let i = 0; i < ARDUINO_IO.length; i++) currents.push(-this.pinOutput(x, i));
    // İkinci GND'den giren akım toprak düzleminden birinciye geçer; kalan KCL'den birinciden.
    const plane = (this.v(x, PIN.gnd2) - this.v(x, PIN.gnd)) / GROUND_PLANE;
    currents.push(plane);
    currents[PIN.gnd] = -currents.reduce((s, c) => s + c, 0);
    return currents;
  }

  /** 5V ucunun gerilimi ve USB'den çekilen akım (pinlerin verdiği akım dahil). */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, PIN.v5) - this.v(x, PIN.gnd);
    const { usb, regulator } = this.supplyCurrents(x);
    let current = usb + regulator;
    for (let i = 0; i < ARDUINO_IO.length; i++) if (this.applied[i] === PinMode.High || this.applied[i] === PinMode.PullUp) current += this.pinOutput(x, i);
    return { voltage, current, power: voltage * current };
  }

  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const warnings: RatingWarning[] = [];
    for (let i = 0; i < ARDUINO_IO.length; i++) {
      const current = Math.abs(this.pinOutput(x, i));
      if (current > ARDUINO.pinCurrentLimit) {
        warnings.push({ code: 'pin-overcurrent', params: { pin: ARDUINO_IO[i]!, current, limit: ARDUINO.pinCurrentLimit } });
      }
    }
    return warnings;
  }

  override status(x: Float64Array): DeviceStatus {
    const board = this.board;
    const gnd = this.v(x, PIN.gnd);
    const d13 = this.v(x, FIRST_IO + ARDUINO_IO.indexOf(13)) - gnd;
    const time = board?.time ?? 0;
    return {
      arduino: {
        running: board !== null,
        pins: ARDUINO_IO.map((io, i) => ({
          pin: io,
          mode: this.applied[i]!,
          voltage: this.v(x, FIRST_IO + i) - gnd,
          current: this.pinOutput(x, i),
        })),
        serial: board?.serial ?? '',
        ledL: d13 > 2.5,
        ledTx: time - (board?.lastSerialTime ?? Number.NEGATIVE_INFINITY) < 0.03,
        time,
      },
    };
  }

  override adoptState(prev: Device): void {
    if (!(prev instanceof ArduinoDevice) || !prev.board || prev.board.program !== this.program) return;
    this.applied = prev.applied;
    this.inputs = prev.inputs;
    this.voltages = prev.voltages;
    this.accepted = prev.accepted;
    this.attach(prev.board);
    prev.board = null;
  }
}

export const arduinoModel: DeviceModel = {
  type: 'arduino',
  pinCount: 4 + ARDUINO_IO.length,
  internalNodes: 0,
  branchCount: 0,
  referencePins: () => [PIN.gnd],
  create: (init) => new ArduinoDevice(init),
};
