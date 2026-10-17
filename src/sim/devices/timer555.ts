import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement } from './device';

/**
 * 555 zamanlayıcı (NE555). Pinler veri sayfasının numaralarıyla: [0] GND (1), [1] TRIG (2),
 * [2] OUT (3), [3] RESET (4), [4] CONT (5), [5] THRES (6), [6] DISCH (7), [7] VCC (8).
 * Değerler TI NE555 veri sayfasından (SLFS022K, tipik):
 *   - V_CC ile GND arasında üç 5 kΩ'luk bölücü: CONT = 2/3·V_CC (eşik), iç düğüm 1/3·V_CC (tetik).
 *   - Karşılaştırıcılar ve flip-flop: TRIG < 1/3·V_CC → çıkış yüksek, deşarj kapalı (öncelikli);
 *     THRES > CONT → çıkış düşük, deşarj açık; ikisi de değilse önceki durum. RESET < 0,7 V → düşük.
 *   - Çıkış yüksekken V_CC − 0,9 V arkasında 8 Ω (100 mA'de V_CC − 1,7 V, 200 mA'de − 2,5 V);
 *     düşükken 0,025 V arkasında 7,5 Ω (10 mA'de 0,1 V, 50 mA'de 0,4 V).
 *   - Deşarj anahtarı açıkken DISCH ile GND arasında 19 Ω (8 mA'de 0,15 V); kapalıyken açık devre.
 *   - Besleme akımı: bölücü (15 kΩ) ve 1,67 kΩ (15 V'ta 10 mA, 5 V'ta 3 mA).
 * Geçişler motorun eşik olaylarıyla bulunur (adım geçişe 10 ns içinde denk getirilir): astabil
 * devrenin frekansı ve monostabilin süresi doğru çıkar. Çıkışın yükselme süresi (100 ns) ve
 * girişlerin nA mertebesindeki akımları modellenmez.
 */
export const TIMER555 = {
  divider: 5e3,
  supplyResistance: 1.67e3,
  highDrop: 0.9,
  highResistance: 8,
  lowOffset: 0.025,
  lowResistance: 7.5,
  dischargeResistance: 19,
  resetThreshold: 0.7,
};

const PIN = { gnd: 0, trig: 1, out: 2, reset: 3, cont: 4, thres: 5, disch: 6, vcc: 7 } as const;

export class Timer555Device extends Device {
  readonly type = 'timer555';
  /** Flip-flop: çıkış yüksek mi (deşarj kapalı)? Açılışta düşük. */
  high = false;
  /** Son kabul edilen adımdaki karşılaştırıcı farkları (tetik, eşik, reset). */
  private margins = { trig: 0, thres: 0, reset: 0 };

  constructor(init: DeviceInit) {
    super(init);
  }

  override get switching(): boolean {
    return true;
  }
  /** Kondansatörsüz bir 555 devresi de zamanla çözülsün (geçişler zaman içinde olur). */
  override get reactive(): boolean {
    return true;
  }

  private node(pin: number): number {
    return this.nodes[pin]!;
  }
  private get third(): number {
    return this.nodes[8]!;
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    const groups: Array<readonly number[]> = [[this.node(PIN.vcc), this.node(PIN.cont), this.third, this.node(PIN.gnd), this.node(PIN.out)]];
    if (!this.high) groups.push([this.node(PIN.disch), this.node(PIN.gnd)]);
    return groups;
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [[...this.nodes]];
  }

  override stampStatic(sys: MnaSystem): void {
    const t = TIMER555;
    const vcc = this.node(PIN.vcc);
    const gnd = this.node(PIN.gnd);
    const out = this.node(PIN.out);
    sys.conductance(vcc, this.node(PIN.cont), 1 / t.divider);
    sys.conductance(this.node(PIN.cont), this.third, 1 / t.divider);
    sys.conductance(this.third, gnd, 1 / t.divider);
    sys.conductance(vcc, gnd, 1 / t.supplyResistance);
    if (this.high) {
      // Çıkışa giren akım (V_CC − 0,9 V − V_çıkış) / 8 Ω.
      sys.conductance(out, vcc, 1 / t.highResistance);
      sys.currentSource(out, vcc, t.highDrop / t.highResistance);
    } else {
      sys.conductance(out, gnd, 1 / t.lowResistance);
      sys.currentSource(gnd, out, t.lowOffset / t.lowResistance);
      sys.conductance(this.node(PIN.disch), gnd, 1 / t.dischargeResistance);
    }
  }

  private marginsAt(x: Float64Array) {
    return {
      trig: this.v(x, PIN.trig) - this.v(x, 8),
      thres: this.v(x, PIN.thres) - this.v(x, PIN.cont),
      reset: this.v(x, PIN.reset) - this.v(x, PIN.gnd) - TIMER555.resetThreshold,
    };
  }

  /** Karşılaştırıcılara ve flip-flopa göre çıkışın olması gereken durumu. */
  private desired(m: { trig: number; thres: number; reset: number }): boolean {
    if (m.reset < 0) return false;
    if (m.trig < 0) return true;
    if (m.thres > 0) return false;
    return this.high;
  }

  override eventFraction(x: Float64Array): number | null {
    const now = this.marginsAt(x);
    if (this.desired(now) === this.high) return null;
    const before = this.margins;
    // Değişime yol açan karşılaştırıcının sıfırı geçtiği an (doğrusal aradeğer); zaten geçmişse 0.
    const crossing = (a: number, b: number, active: (v: number) => boolean) =>
      active(b) ? (active(a) ? 0 : Math.abs(a) / (Math.abs(a) + Math.abs(b))) : Number.POSITIVE_INFINITY;
    const fractions = this.high
      ? [crossing(before.reset, now.reset, (v) => v < 0), crossing(before.thres, now.thres, (v) => v > 0)]
      : [crossing(before.trig, now.trig, (v) => v < 0)];
    const f = Math.min(...fractions);
    return Number.isFinite(f) ? f : 0;
  }

  override switchState(x: Float64Array): boolean {
    const next = this.desired(this.marginsAt(x));
    if (next === this.high) return false;
    this.high = next;
    return true;
  }

  override accept(x: Float64Array): void {
    this.margins = this.marginsAt(x);
  }

  /** Çıkışın verdiği akım (çıkış düğümüne giren; düşükte negatif: çıkış akım çeker). */
  outputCurrent(x: Float64Array): number {
    const t = TIMER555;
    const vo = this.v(x, PIN.out);
    return this.high
      ? (this.v(x, PIN.vcc) - t.highDrop - vo) / t.highResistance
      : -(vo - t.lowOffset - this.v(x, PIN.gnd)) / t.lowResistance;
  }

  override pinCurrents(x: Float64Array): number[] {
    const t = TIMER555;
    const vcc = this.v(x, PIN.vcc);
    const gnd = this.v(x, PIN.gnd);
    const cont = this.v(x, PIN.cont);
    const third = this.v(x, 8);
    const out = this.outputCurrent(x);
    const disch = this.high ? 0 : (this.v(x, PIN.disch) - gnd) / t.dischargeResistance;
    const iVcc = (vcc - cont) / t.divider + (vcc - gnd) / t.supplyResistance + (this.high ? out : 0);
    const iCont = (cont - vcc) / t.divider + (cont - third) / t.divider;
    const currents = [0, 0, -out, 0, iCont, 0, disch, iVcc];
    currents[PIN.gnd] = -currents.reduce((s, c) => s + c, 0);
    return currents;
  }

  /** Çıkışın GND'ye göre gerilimi ve verdiği akım. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, PIN.out) - this.v(x, PIN.gnd);
    const current = this.outputCurrent(x);
    return { voltage, current, power: voltage * current };
  }

  override status(x: Float64Array): DeviceStatus {
    const gnd = this.v(x, PIN.gnd);
    return {
      timer: {
        high: this.high,
        output: this.v(x, PIN.out) - gnd,
        threshold: this.v(x, PIN.thres) - gnd,
        trigger: this.v(x, PIN.trig) - gnd,
        upper: this.v(x, PIN.cont) - gnd,
        lower: this.v(x, 8) - gnd,
      },
    };
  }

  override adoptState(prev: Device): void {
    if (prev instanceof Timer555Device) {
      this.high = prev.high;
      this.margins = { ...prev.margins };
    }
  }
}

export const timer555Model: DeviceModel = {
  type: 'timer555',
  pinCount: 8,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new Timer555Device(init),
};
