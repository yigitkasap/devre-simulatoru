import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type Measurement, type StepContext } from './device';

/**
 * Bobin (Fizik 7). Varsayılan değerler Bourns RLB1314-103KL radyal bobininden (veri sayfası değerleri,
 * Farnell ve RS listeleri): L = 10 mH ±%10, sargı direnci R_dc ≤ 12 Ω, I_dc = 100 mA, öz rezonans
 * frekansı (SRF) 0,53 MHz. Pinler: [0], [1] (akımın yönü 0 → 1). İç yapı:
 *
 *   uç 0 ── R_dc ── (iç düğüm) ── L ── uç 1
 *   uç 0 ──────────── C_p ─────────── uç 1      (sargıların arasındaki kapasite)
 *
 * C_p = 1/((2π·SRF)²·L) ≈ 9,0 pF; her endüktans için aynı alınır (sargı kapasitesi pF mertebesindedir).
 * Gerçek bobinin bu kapasitesi, akımı aniden kesilen bobinin gerilimini sınırlar: anahtar açılınca
 * bobin akımı C_p'ye akar, gerilim ≈ I·√(L/C_p)'ye çıkar (enerji ½LI² = ½C_pV²) ve SRF'de salınarak
 * R_dc üzerinden söner. Açık anahtardan akım yine tam 0'dır (anahtar ideal kalır).
 */
export const INDUCTOR_DEFAULTS = { inductance: 10e-3, dcResistance: 12 };
/** RLB1314-103KL'nin öz rezonans frekansı (Hz) ve ondan bulunan sargı kapasitesi (F). */
export const INDUCTOR_SRF = 0.53e6;
export const INDUCTOR_WINDING_CAPACITANCE = 1 / ((2 * Math.PI * INDUCTOR_SRF) ** 2 * INDUCTOR_DEFAULTS.inductance);

export class InductorDevice extends Device {
  readonly type = 'inductor';
  readonly inductance: number;
  readonly dcResistance: number;
  /** Son kabul edilen adımdaki bobin akımı i(n) (uç 0'dan uç 1'e) ve L'nin gerilimi v(n). */
  current = 0;
  private coilVoltage = 0;
  /** Sargı kapasitesinin gerilimi ve akımı (son kabul edilen adım). */
  private capVoltage = 0;
  private capCurrent = 0;
  /**
   * Lenz sıçraması: devre değiştiğinde (ör. anahtar açıldı) bobinden akım geçiyorduysa "kurulur"
   * ve o andan sonraki en büyük uç gerilimini tutar. Uyarı, devre yeniden değişene kadar kalır.
   * (Rezonanstaki yüksek gerilim gibi akımı kesilmeyen durumlar bu yüzden sayılmaz.)
   */
  private armed = false;
  private spikePeak = 0;

  constructor(init: DeviceInit) {
    super(init);
    this.inductance = Math.max(1e-12, numProp(init.props, 'inductance', INDUCTOR_DEFAULTS.inductance));
    this.dcResistance = Math.max(0, numProp(init.props, 'dcResistance', INDUCTOR_DEFAULTS.dcResistance));
  }

  override get reactive(): boolean {
    return true;
  }

  private get a(): number {
    return this.nodes[0]!;
  }
  private get b(): number {
    return this.nodes[1]!;
  }
  private get inner(): number {
    return this.nodes[2]!;
  }
  private get branch(): number {
    return this.branches[0]!;
  }
  /** L'nin başlangıç düğümü: sargı direnci varsa iç düğüm, yoksa uç 0. */
  private get coilStart(): number {
    return this.dcResistance > 0 ? this.inner : this.a;
  }

  /** Sargı direnci 0 iken iç düğüm kullanılmaz. Bobin doğru akımda da iletir (kısa devre). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return this.dcResistance > 0 ? [[this.a, this.inner, this.b]] : [[this.a, this.b]];
  }

  /**
   * v = L·di/dt, MNA'da akım bilinmeyeni i ile (dal satırı v_L − R_eş·i = sağ taraf):
   *   yamuk:       (v(n+1) + v(n))/2 = L·(i(n+1) − i(n))/h  ⇒  R_eş = 2L/h, sağ taraf = −R_eş·i(n) − v(n)
   *   geri Euler:  v(n+1) = L·(i(n+1) − i(n))/h            ⇒  R_eş = L/h,  sağ taraf = −R_eş·i(n)
   *   doğru akım (h = 0): v = 0 (kısa devre).
   * Sargı kapasitesi (parazit, sert: 100 Ω'luk devrede τ ≈ 1 ns) her zaman geri Euler ile çözülür
   * (geq = C_p/h): yamuk kuralı sert kipte sönmeyen bir salınım bırakır (başlangıçtaki gerilim
   * sıçramasından kalan ±mA'lik akım). Geri Euler'in sönümü, gerçek bobinin öz rezonanstaki
   * çekirdek kayıplarına da yakındır (açılan anahtardan sonraki salınım birkaç periyotta söner).
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    if (this.dcResistance > 0) sys.conductance(this.a, this.inner, 1 / this.dcResistance);
    sys.voltageSource(this.coilStart, this.b, this.branch, 0);
    if (ctx.h > 0) {
      sys.add(this.branch, this.branch, -chargeScale(ctx) * this.inductance);
      sys.conductance(this.a, this.b, INDUCTOR_WINDING_CAPACITANCE / ctx.h);
    }
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const req = chargeScale(ctx) * this.inductance;
    sys.addRhs(this.branch, -req * this.current - (ctx.trap ? this.coilVoltage : 0));
    sys.currentSource(this.b, this.a, (INDUCTOR_WINDING_CAPACITANCE / ctx.h) * this.capVoltage);
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const coil = this.v(x, this.dcResistance > 0 ? 2 : 0) - this.v(x, 1);
    const terminal = this.v(x, 0) - this.v(x, 1);
    this.current = x[this.branch]!;
    this.coilVoltage = ctx.h > 0 ? coil : 0;
    this.capCurrent = ctx.h > 0 ? (INDUCTOR_WINDING_CAPACITANCE * (terminal - this.capVoltage)) / ctx.h : 0;
    this.capVoltage = terminal;
    if (this.armed) this.spikePeak = Math.max(this.spikePeak, Math.abs(terminal));
  }

  /**
   * Durum değişkenleri: bobin akımı (dal bilinmeyeni) ve sargı kapasitesinin (uçların) gerilimi.
   * Akımı kesilen bobinde salınım sargı kapasitesiyle olur; adım onu çözecek kadar küçülsün.
   */
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [
      [this.branch, -1],
      [this.a, this.b],
    ];
  }

  /** Uç gerilimi ve uç 0'dan giren akım (bobin + sargı kapasitesi). */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    const current = x[this.branch]! + this.capCurrent;
    return { voltage, current, power: voltage * current };
  }

  /** Bobinde depolanan enerji ½LI². */
  energy(x: Float64Array): number {
    const i = x[this.branch]!;
    return 0.5 * this.inductance * i * i;
  }

  /** Akım taşırken devre değiştiyse, o andan beri görülen en büyük uç gerilimi (yoksa 0). */
  spikeVoltage(): number {
    return this.spikePeak;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof InductorDevice) {
      this.current = prev.current;
      this.coilVoltage = prev.coilVoltage;
      this.capVoltage = prev.capVoltage;
      this.capCurrent = prev.capCurrent;
      this.armed = Math.abs(prev.current) > 1e-6;
    }
  }
}

export const inductorModel: DeviceModel = {
  type: 'inductor',
  pinCount: 2,
  internalNodes: 1,
  branchCount: 1,
  create: (init) => new InductorDevice(init),
};
