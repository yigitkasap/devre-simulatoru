import type { MnaSystem } from '../mna';
import { numProp, type Props } from '../netlist';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

/**
 * Röle: bir elektromıknatıs (sargı) ve onun çektiği paletin taşıdığı bir değiştirme kontağı.
 * Pinler: [0] sargı 1, [1] sargı 2, [2] ortak uç (C), [3] normalde açık (NA), [4] normalde kapalı (NK).
 * İç yapı:
 *
 *   uç 0 ── R ── (iç düğüm) ── L ── uç 1          C ── R_k ── NA   (palet çekiliyken)
 *   uç 0 ──────── C_p ──────────── uç 1          C ── R_k ── NK   (palet bırakılmışken)
 *
 * Sargının akımı çekme akımına (I_ç = V_ç / R) ulaşınca palet çekilir, bırakma akımının
 * (I_b = V_b / R) altına inince bırakılır (histerezis: çekili paletin hava aralığı kapalıdır, aynı
 * akımla çok daha büyük kuvvet oluşur). Kuvvet akımın karesiyle orantılı olduğu için akımın yönü
 * önemsizdir. Palet hareket edince manyetik devrenin hava aralığı değişir ve sargının endüktansı da
 * değişir: palet çekilince L, RELAY_INDUCTANCE_RATIO katına çıkar. Palet anında hareket eder ve
 * sargının akı bağı λ = L·i bu anda korunur (Faraday: akının bir anda değişmesi sonsuz gerilim
 * isterdi). Bu yüzden çekme anında akım L₁/L₂ oranında düşer: gerçek rölelerin akımındaki
 * "çukur" (paletin çekildiğini göstermek için kullanılır); paletin hareketine harcanan enerji,
 * ½λ²/L'deki azalmadır. Paletin hareket süresi ve kontak sıçraması modellenmez.
 *
 * Varsayılanlar gerçek bir röleden: Omron G2R-1 12 VDC (Omron veri sayfası, Farnell 1648376):
 * sargı direnci 275 Ω ±%10 (43,6 mA, 0,53 W), sargı endüktansı (referans değer) palet açıkken
 * 1,15 H, çekiliyken 2,29 H; çekme gerilimi en fazla %70 (8,4 V), bırakma gerilimi en az %15
 * (1,8 V); kontak direnci en fazla 30 mΩ. Eşikler veri sayfasının garanti ettiği sınırlardır
 * (gerçek bir röle biraz daha düşük gerilimde çeker, biraz daha yüksekte bırakır). Anma
 * geriliminde çekme süresi τ·ln(1/(1 − 0,7)) ≈ 5,0 ms (τ = L/R ≈ 4,2 ms; veri sayfası: en fazla 15 ms).
 *
 * Sargı kapasitesi (C_p = 100 pF, veri sayfasında yok; küçük bobinlerde onlarca–yüzlerce pF)
 * akımı aniden kesilen sargının gerilimini sonlu tutar (bobindeki gibi; geri Euler ile).
 */
export const RELAY_DEFAULTS = { coilResistance: 275, inductance: 1.15, pullInVoltage: 8.4, dropOutVoltage: 1.8 };
/** Palet çekiliyken endüktansın açıkkenkine oranı (G2R-1 12 VDC: 2,29 H / 1,15 H). */
export const RELAY_INDUCTANCE_RATIO = 2.29 / 1.15;
/** Kapalı kontağın direnci (Ω): G2R'de en fazla 30 mΩ. */
export const RELAY_CONTACT_RESISTANCE = 0.03;
/** Sargının kapasitesi (F). */
export const RELAY_WINDING_CAPACITANCE = 100e-12;
/**
 * Bırakma akımı, çekme akımının en fazla bu katı: bırakılınca endüktans azalır ve akım (akı
 * korunduğu için) RELAY_INDUCTANCE_RATIO katına sıçrar; bırakma eşiği bundan daha yüksek olsaydı
 * palet aynı anda yeniden çekilirdi.
 */
const RELAY_MAX_DROPOUT_FRACTION = 0.9 / RELAY_INDUCTANCE_RATIO;

/** Rölenin ayarları (özelliklerden, sınırlanmış). */
export function relaySettings(p: Props) {
  const d = RELAY_DEFAULTS;
  const coilResistance = Math.max(1e-3, numProp(p, 'coilResistance', d.coilResistance));
  const inductance = Math.max(1e-9, numProp(p, 'inductance', d.inductance));
  const pullInVoltage = Math.max(1e-6, numProp(p, 'pullInVoltage', d.pullInVoltage));
  const dropOutVoltage = Math.min(pullInVoltage * RELAY_MAX_DROPOUT_FRACTION, Math.max(0, numProp(p, 'dropOutVoltage', d.dropOutVoltage)));
  return {
    coilResistance,
    inductance,
    pullInVoltage,
    dropOutVoltage,
    pullInCurrent: pullInVoltage / coilResistance,
    dropOutCurrent: dropOutVoltage / coilResistance,
  };
}

export class RelayDevice extends Device {
  readonly type = 'relay';
  readonly coilResistance: number;
  /** Palet açıkken ve çekiliyken sargının endüktansı (H). */
  readonly inductanceOff: number;
  readonly inductanceOn: number;
  readonly pullInCurrent: number;
  readonly dropOutCurrent: number;
  /** Palet çekili mi (NA kapalı, NK açık)? */
  energized = false;
  /** Son kabul edilen adımdaki sargı akımı, akı bağı λ = L·i ve endüktansın gerilimi. */
  private current = 0;
  private flux = 0;
  private coilVoltage = 0;
  /** Sargı kapasitesinin gerilimi ve akımı (son kabul edilen adım). */
  private capVoltage = 0;
  private capCurrent = 0;
  /** Devre son değiştiğinden beri sargının uçlarında görülen en büyük gerilim (Lenz uyarısı). */
  private spikePeak = 0;

  constructor(init: DeviceInit) {
    super(init);
    const s = relaySettings(init.props);
    this.coilResistance = s.coilResistance;
    this.inductanceOff = s.inductance;
    this.inductanceOn = s.inductance * RELAY_INDUCTANCE_RATIO;
    this.pullInCurrent = s.pullInCurrent;
    this.dropOutCurrent = s.dropOutCurrent;
  }

  override get reactive(): boolean {
    return true;
  }

  override get switching(): boolean {
    return true;
  }

  private get a(): number {
    return this.nodes[0]!;
  }
  private get b(): number {
    return this.nodes[1]!;
  }
  private get common(): number {
    return this.nodes[2]!;
  }
  /** Kapalı kontağın öbür ucu: çekiliyken NA, bırakılmışken NK. */
  private get contact(): number {
    return this.nodes[this.energized ? 3 : 4]!;
  }
  private get inner(): number {
    return this.nodes[5]!;
  }
  private get branch(): number {
    return this.branches[0]!;
  }
  /** Paletin şu anki konumundaki endüktans. */
  get inductance(): number {
    return this.energized ? this.inductanceOn : this.inductanceOff;
  }

  /** Sargı doğru akımda da iletir; kontak yalnızca kapalı olduğu uçla. */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [
      [this.a, this.inner, this.b],
      [this.common, this.contact],
    ];
  }

  /**
   * Sargı bobindeki gibi (dal satırı v_L − cs·L·i = −cs·λ(n) − v_L(n) yamukta; λ = L·i akı bağı,
   * palet hareket edince korunan büyüklük). Kontak, kapalı olduğu uçla C arasında R_k'dir.
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    sys.conductance(this.a, this.inner, 1 / this.coilResistance);
    sys.voltageSource(this.inner, this.b, this.branch, 0);
    if (ctx.h > 0) {
      sys.add(this.branch, this.branch, -chargeScale(ctx) * this.inductance);
      sys.conductance(this.a, this.b, RELAY_WINDING_CAPACITANCE / ctx.h);
    }
    sys.conductance(this.common, this.contact, 1 / RELAY_CONTACT_RESISTANCE);
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    sys.addRhs(this.branch, -chargeScale(ctx) * this.flux - (ctx.trap ? this.coilVoltage : 0));
    sys.currentSource(this.b, this.a, (RELAY_WINDING_CAPACITANCE / ctx.h) * this.capVoltage);
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const terminal = this.v(x, 0) - this.v(x, 1);
    this.current = x[this.branch]!;
    this.flux = this.inductance * this.current;
    this.coilVoltage = ctx.h > 0 ? this.v(x, 5) - this.v(x, 1) : 0;
    this.capCurrent = ctx.h > 0 ? (RELAY_WINDING_CAPACITANCE * (terminal - this.capVoltage)) / ctx.h : 0;
    this.capVoltage = terminal;
    this.spikePeak = Math.max(this.spikePeak, Math.abs(terminal));
  }

  /** Eşiğe uzaklık: ≥ 0 ise palet konum değiştirmeli (çekiliyken bırakma, açıkken çekme eşiği). */
  private margin(current: number): number {
    const i = Math.abs(current);
    return this.energized ? this.dropOutCurrent - i : i - this.pullInCurrent;
  }

  override eventFraction(x: Float64Array): number | null {
    const now = this.margin(x[this.branch]!);
    if (now < 0) return null;
    const before = this.margin(this.current);
    return before < 0 ? -before / (now - before) : 0;
  }

  /** Palet konum değiştirir; akı bağı (son kabul edilen adımdaki λ) korunur. */
  override switchState(x: Float64Array): boolean {
    if (this.margin(x[this.branch]!) < 0) return false;
    this.energized = !this.energized;
    return true;
  }

  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [
      [this.branch, -1],
      [this.a, this.b],
    ];
  }

  /** Sargının uç gerilimi ve uç 0'dan giren akımı (sargı + sargı kapasitesi). */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    const current = x[this.branch]! + this.capCurrent;
    return { voltage, current, power: voltage * current };
  }

  /** Kontaktan C'den kapalı uca akan akım. */
  contactCurrent(x: Float64Array): number {
    return (this.v(x, 2) - this.v(x, this.energized ? 3 : 4)) / RELAY_CONTACT_RESISTANCE;
  }

  override pinCurrents(x: Float64Array): number[] {
    const coil = this.measure(x).current;
    const contact = this.contactCurrent(x);
    return [coil, -coil, contact, this.energized ? -contact : 0, this.energized ? 0 : -contact];
  }

  override status(x: Float64Array): DeviceStatus {
    const m = this.measure(x);
    return { energized: this.energized, coil: { voltage: m.voltage, current: m.current }, contactCurrent: this.contactCurrent(x) };
  }

  /** Devre son değiştiğinden beri sargının uçlarında görülen en büyük gerilim. */
  spikeVoltage(): number {
    return this.spikePeak;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof RelayDevice) {
      this.energized = prev.energized;
      this.current = prev.current;
      this.flux = prev.flux;
      this.coilVoltage = prev.coilVoltage;
      this.capVoltage = prev.capVoltage;
      this.capCurrent = prev.capCurrent;
    }
  }
}

export const relayModel: DeviceModel = {
  type: 'relay',
  pinCount: 5,
  internalNodes: 1,
  branchCount: 1,
  // Sargı ile kontak arasında iletken yol yoktur (yalıtım): ayrı adalar.
  couplingPins: () => [
    [0, 1],
    [2, 3, 4],
  ],
  create: (init) => new RelayDevice(init),
};
