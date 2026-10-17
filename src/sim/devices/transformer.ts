import type { MnaSystem } from '../mna';
import { numProp } from '../netlist';
import { chargeScale, Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

/**
 * Transformatör: aynı çekirdeğe sarılmış iki bobin, karşılıklı indüktansla bağlı (Faraday'ın
 * indüksiyon yasası). Pinler: [0] = birincil • (noktalı uç), [1] = birincil, [2] = ikincil •,
 * [3] = ikincil. İç yapı:
 *
 *   P• ── R₁ ── (iç 1) ── L₁ ── P        S• ── R₂ ── (iç 2) ── L₂ ── S
 *   P• ─────── C₁ ─────────── P        S• ─────── C₂ ─────────── S
 *
 *   v_L₁ = L₁·di₁/dt + M·di₂/dt,   v_L₂ = M·di₁/dt + L₂·di₂/dt,   M = k·√(L₁·L₂)
 *
 * Sarım oranı n = N₁/N₂ ile L₂ = L₁ / n² (endüktans sarım sayısının karesiyle orantılıdır).
 * Akımlar noktalı uçtan sargıya giren yöndedir: noktalı uçlar aynı anda aynı işaretli gerilimdedir.
 * Doğru akımda sargılar kısa devredir ve ikincilde gerilim yoktur (akı değişmez); iki sargı arasında
 * iletken yol yoktur (galvanik yalıtım).
 *
 * Varsayılanlar gerçek bir transformatörden: RS PRO 504-464 (3 VA, 230 V → 12 + 12 V, baskı devre
 * tipi; RS veri sayfası): birincil sargı direnci 1167 Ω, ikincil 14,8 Ω (ilk 12 V sargısı), yüksüz
 * giriş akımı en fazla 30 mA, tam yükte bakır kaybı 1,05 W ve verim > %67 (3 VA). Bakır kaybından
 * ikincillerin payı (2 × 125 mA, 14,8 + 17,3 Ω: 0,50 W) çıkınca birincilin akımı ≈ 21,7 mA; yükün
 * birincile yansıyan akımı (250 mA / 16 = 15,6 mA) çıkınca tipik mıknatıslanma akımı ≈ 15 mA (en
 * büyük değerin yarısı). Birincil endüktansı bundan: L₁ = 230 V / (2π·50 Hz · 15,1 mA) ≈ 48,5 H.
 * Sarım oranı, tam yükte (sargı başına 1,5 VA, 125 mA) ≈ 12 V verecek biçimde 16 alındı: yüksüz
 * ≈ 14,2 V, düzenleme ≈ %20 (veri sayfası: tipik < %22). Kuplaj k = 0,99
 * (küçük EI transformatörlerde kaçak endüktans ≈ %1; veri sayfasında yok). Çekirdek kaybı
 * (0,45 W) ve doyma modellenmez.
 *
 * Sargı kapasiteleri (C₁ = 100 pF, C₂ = C₁·n²; birincilin öz rezonansı ≈ 3 kHz, küçük şebeke
 * transformatörlerinde kHz mertebesinde) akımı aniden kesilen sargının gerilimini sonlu tutar
 * (bobindeki gibi); sert parazit oldukları için geri Euler ile çözülür.
 */
export const TRANSFORMER_DEFAULTS = {
  turnsRatio: 16,
  primaryInductance: 48.5,
  coupling: 0.99,
  primaryResistance: 1167,
  secondaryResistance: 14.8,
};
/** Kuplaj katsayısının üst sınırı: k = 1'de endüktans matrisi tekildir. */
export const TRANSFORMER_MAX_COUPLING = 0.999;
/** Birincil sargının kapasitesi (F); ikincilinki C₁·n². */
export const TRANSFORMER_PRIMARY_CAPACITANCE = 100e-12;

export class TransformerDevice extends Device {
  readonly type = 'transformer';
  readonly turnsRatio: number;
  readonly l1: number;
  readonly l2: number;
  readonly mutual: number;
  readonly r1: number;
  readonly r2: number;
  readonly c1: number;
  readonly c2: number;
  /** Son kabul edilen adımdaki sargı akımları ve endüktans gerilimleri. */
  private i1 = 0;
  private i2 = 0;
  private v1 = 0;
  private v2 = 0;
  /** Sargı kapasitelerinin gerilimleri ve akımları (son kabul edilen adım). */
  private vc1 = 0;
  private vc2 = 0;
  private ic1 = 0;
  private ic2 = 0;
  /**
   * Lenz sıçraması (bobindeki gibi): devre değiştiğinde sargılardan akım geçiyorduysa "kurulur" ve
   * o andan sonra iki sargının uçlarında görülen en büyük gerilimi tutar.
   */
  private armed = false;
  private spikePeak = 0;

  constructor(init: DeviceInit) {
    super(init);
    const p = init.props;
    const d = TRANSFORMER_DEFAULTS;
    this.turnsRatio = Math.max(1e-3, numProp(p, 'turnsRatio', d.turnsRatio));
    this.l1 = Math.max(1e-9, numProp(p, 'primaryInductance', d.primaryInductance));
    const k = Math.min(TRANSFORMER_MAX_COUPLING, Math.max(0, numProp(p, 'coupling', d.coupling)));
    this.l2 = this.l1 / this.turnsRatio ** 2;
    this.mutual = k * Math.sqrt(this.l1 * this.l2);
    this.r1 = Math.max(0, numProp(p, 'primaryResistance', d.primaryResistance));
    this.r2 = Math.max(0, numProp(p, 'secondaryResistance', d.secondaryResistance));
    this.c1 = TRANSFORMER_PRIMARY_CAPACITANCE;
    this.c2 = TRANSFORMER_PRIMARY_CAPACITANCE * this.turnsRatio ** 2;
  }

  override get reactive(): boolean {
    return true;
  }

  private node(k: number): number {
    return this.nodes[k]!;
  }
  /** Sargının endüktans tarafındaki başlangıç düğümü: direnç varsa iç düğüm, yoksa noktalı uç. */
  private start(w: 0 | 1): number {
    const r = w === 0 ? this.r1 : this.r2;
    return r > 0 ? this.node(4 + w) : this.node(2 * w);
  }

  /** İki sargı ayrı iletken gruplardır: aralarında doğru akım yolu yok (galvanik yalıtım). */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [0, 1].map((w) => (this.start(w as 0 | 1) === this.node(2 * w) ? [this.node(2 * w), this.node(2 * w + 1)] : [this.node(2 * w), this.node(4 + w), this.node(2 * w + 1)]));
  }

  /**
   * Dal satırları (k₁, k₂ akım bilinmeyenleri):
   *   yamuk:      v_L(n+1) = (2/h)·(L·Δi + M·Δi')  − v_L(n)
   *   geri Euler: v_L(n+1) = (1/h)·(L·Δi + M·Δi')
   *   doğru akım: v_L = 0 (kısa devre)
   * Matrise −cs·[[L₁, M], [M, L₂]] eklenir, sağ taraf −cs·(L·i(n) + M·i'(n)) − (yamukta) v_L(n).
   */
  override stampStatic(sys: MnaSystem, ctx: StepContext): void {
    const [k1, k2] = [this.branches[0]!, this.branches[1]!];
    if (this.r1 > 0) sys.conductance(this.node(0), this.node(4), 1 / this.r1);
    if (this.r2 > 0) sys.conductance(this.node(2), this.node(5), 1 / this.r2);
    sys.voltageSource(this.start(0), this.node(1), k1, 0);
    sys.voltageSource(this.start(1), this.node(3), k2, 0);
    if (ctx.h > 0) {
      const cs = chargeScale(ctx);
      sys.add(k1, k1, -cs * this.l1);
      sys.add(k1, k2, -cs * this.mutual);
      sys.add(k2, k1, -cs * this.mutual);
      sys.add(k2, k2, -cs * this.l2);
      sys.conductance(this.node(0), this.node(1), this.c1 / ctx.h);
      sys.conductance(this.node(2), this.node(3), this.c2 / ctx.h);
    }
  }

  override stampStep(sys: MnaSystem, ctx: StepContext): void {
    if (ctx.h <= 0) return;
    const cs = chargeScale(ctx);
    const [k1, k2] = [this.branches[0]!, this.branches[1]!];
    sys.addRhs(k1, -cs * (this.l1 * this.i1 + this.mutual * this.i2) - (ctx.trap ? this.v1 : 0));
    sys.addRhs(k2, -cs * (this.mutual * this.i1 + this.l2 * this.i2) - (ctx.trap ? this.v2 : 0));
    sys.currentSource(this.node(1), this.node(0), (this.c1 / ctx.h) * this.vc1);
    sys.currentSource(this.node(3), this.node(2), (this.c2 / ctx.h) * this.vc2);
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    const [k1, k2] = [this.branches[0]!, this.branches[1]!];
    const t1 = this.v(x, 0) - this.v(x, 1);
    const t2 = this.v(x, 2) - this.v(x, 3);
    this.i1 = x[k1]!;
    this.i2 = x[k2]!;
    this.v1 = ctx.h > 0 ? this.coilVoltage(x, 0) : 0;
    this.v2 = ctx.h > 0 ? this.coilVoltage(x, 1) : 0;
    this.ic1 = ctx.h > 0 ? (this.c1 * (t1 - this.vc1)) / ctx.h : 0;
    this.ic2 = ctx.h > 0 ? (this.c2 * (t2 - this.vc2)) / ctx.h : 0;
    this.vc1 = t1;
    this.vc2 = t2;
    if (this.armed) this.spikePeak = Math.max(this.spikePeak, Math.abs(t1), Math.abs(t2));
  }

  /** Akım taşırken devre değiştiyse, o andan beri sargılarda görülen en büyük gerilim (yoksa 0). */
  spikeVoltage(): number {
    return this.spikePeak;
  }

  /** Sargının endüktans geriliminin (iç düğüm − noktasız uç) çözümdeki değeri. */
  private coilVoltage(x: Float64Array, w: 0 | 1): number {
    const start = this.start(w) === this.node(2 * w) ? 2 * w : 4 + w;
    return this.v(x, start) - this.v(x, 2 * w + 1);
  }

  /** Durum değişkenleri: iki sargı akımı ve sargı kapasitelerinin gerilimleri. */
  override lteStates(): ReadonlyArray<readonly [number, number]> {
    return [
      [this.branches[0]!, -1],
      [this.branches[1]!, -1],
      [this.node(0), this.node(1)],
      [this.node(2), this.node(3)],
    ];
  }

  /** Uçlara giren akımlar: sargı akımı ile sargı kapasitesinin akımı. */
  override pinCurrents(x: Float64Array): number[] {
    const a = x[this.branches[0]!]! + this.ic1;
    const b = x[this.branches[1]!]! + this.ic2;
    return [a, -a, b, -b];
  }

  /** Birincil: uç gerilimi, noktalı uçtan giren akım, giriş gücü. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    const current = x[this.branches[0]!]! + this.ic1;
    return { voltage, current, power: voltage * current };
  }

  /**
   * Sargıların gerilimleri ve akımları. İkincilin akımı noktalı uçtan yüke verilen akımdır
   * (yüklüyken pozitif), birincilinki noktalı uçtan sargıya giren akım.
   */
  override status(x: Float64Array): DeviceStatus {
    const p = this.pinCurrents(x);
    return {
      windings: [
        { voltage: this.v(x, 0) - this.v(x, 1), current: p[0]! },
        { voltage: this.v(x, 2) - this.v(x, 3), current: -p[2]! },
      ],
    };
  }

  /** Manyetik alanda depolanan enerji ½L₁i₁² + M·i₁·i₂ + ½L₂i₂². */
  energy(x: Float64Array): number {
    const a = x[this.branches[0]!]!;
    const b = x[this.branches[1]!]!;
    return 0.5 * this.l1 * a * a + this.mutual * a * b + 0.5 * this.l2 * b * b;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof TransformerDevice) {
      this.i1 = prev.i1;
      this.i2 = prev.i2;
      this.v1 = prev.v1;
      this.v2 = prev.v2;
      this.vc1 = prev.vc1;
      this.vc2 = prev.vc2;
      this.ic1 = prev.ic1;
      this.ic2 = prev.ic2;
      this.armed = Math.abs(prev.i1) > 1e-6 || Math.abs(prev.i2) > 1e-6;
    }
  }
}

export const transformerModel: DeviceModel = {
  type: 'transformer',
  pinCount: 4,
  internalNodes: 2,
  branchCount: 2,
  // İki sargı ayrı adalardır (galvanik yalıtım): topraksız ikincil devre kendi sıfır noktasını alır.
  couplingPins: () => [
    [0, 1],
    [2, 3],
  ],
  create: (init) => new TransformerDevice(init),
};
