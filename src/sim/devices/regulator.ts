import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning } from './device';

// Doğrusal gerilim regülatörleri (davranışsal model). Pinler: [0] = IN, [1] = başvuru ucu (7805'te GND,
// LM317'de ADJ), [2] = OUT. Çıkış, başvuru ucuna göre ayar gerilimini (Vset) tutmaya çalışır:
//   I_reg  = (V_ref + Vset − V_out) / RO          (RO: yük regülasyonu)
// Giriş yeterince yüksek değilse geçiş transistörü girişin bırakma gerilimi kadar altına çıkamaz:
//   V_in − V_out ≥ Vd(I)  ⇒  I_drop = Vd⁻¹(V_in − V_out)     (Vd: veri sayfasının dropout eğrisi)
// Çıkış akımı I = min(I_reg, I_drop), 0 ile akım sınırı arasında; girişten çekilir (IN → OUT). Akımı
// geri alamaz (çıkış ayardan yüksekse akım ≈ 0; geçiş 1 µA ölçeğinde yumuşak). Başvuru ucundan da IN'den gelen küçük bir akım akar:
// 7805'te bekleme akımı (GND'ye), LM317'de ADJ akımı (ADJ ucundan dışarı).
// Varsayımlar (veri sayfasında yok): bekleme / ADJ akımı giriş − başvuru gerilimi 0'dan sıfır yük
// bırakma gerilimine çıkarken 0'dan tam değerine doğrusal artar (güç yokken akmaz); akım sınırı giriş −
// çıkış farkından bağımsızdır (gerçekte fark büyüdükçe düşer).

export interface RegulatorSpec {
  /** Başvuru ucuna göre çıkış gerilimi (V). */
  readonly vset: number;
  /** Çıkış direnci (yük regülasyonu, Ω). */
  readonly ro: number;
  /** Akım sınırı (A). */
  readonly ilim: number;
  /** Bırakma gerilimi eğrisi: (çıkış akımı A, giriş − çıkış V), akım artarak. */
  readonly dropout: ReadonlyArray<readonly [number, number]>;
  /** IN'den başvuru ucuna akan akım (7805: bekleme akımı; LM317: ADJ akımı, A). */
  readonly reference: number;
}

/**
 * L7805CV (ST L78 veri sayfası DS0422 Rev. 38, Şubat 2025; ST'nin sitesine erişilemedi, aynı belgenin
 * rlocman kopyası okundu).
 *   VO = 5 V (Tablo 10, tipik, TJ = 25 °C); RO = 17 mΩ (Tablo 10, tipik, f = 1 kHz);
 *   akım sınırı Iscp = 2,2 A (Tablo 10, tipik, TJ = 25 °C);
 *   bekleme akımı ≈ 4,2 mA (Şekil 33/36, VI = 10 V; eğriden okunur, yaklaşık; tabloda yalnızca en çok 8 mA);
 *   bırakma gerilimi Şekil 28 (ΔVO = %5, 25 °C; eğriden okunur, yaklaşık): 0 mA ≈ 1,0 V, 20 mA ≈ 1,5 V,
 *   200 mA ≈ 1,6 V, 500 mA ≈ 1,75 V, 1 A ≈ 2,0 V (Tablo 10: 1 A'de tipik 2 V). Kullanıcı kararı
 *   (2026-11-02): bırakma gerilimi akıma göre bu eğriden.
 */
export const REG7805: RegulatorSpec = {
  vset: 5,
  ro: 0.017,
  ilim: 2.2,
  dropout: [
    [0, 1.0],
    [0.02, 1.5],
    [0.2, 1.6],
    [0.5, 1.75],
    [1, 2.0],
  ],
  reference: 4.2e-3,
};

/**
 * LM317T (ST LM217/LM317 DocID2154 Rev. 19, Mart 2014; TI SLVS044Z ve onsemi LM317/D Rev. 18 aynı
 * değerleri verir).
 *   VREF = 1,25 V (Tablo 5, tipik); IADJ = 50 µA (Tablo 5, tipik);
 *   RO = 5 mV / (1,5 A − 10 mA) = 3,4 mΩ (Tablo 5, VO ≤ 5 V yük regülasyonu, tipik 5 mV);
 *   akım sınırı 2,2 A (Tablo 5, tipik, VI − VO ≤ 15 V);
 *   bırakma gerilimi Şekil 4 (ΔVO = 100 mV, 25 °C; eğriden okunur, yaklaşık): 20 mA ≈ 1,48 V,
 *   200 mA ≈ 1,67 V, 500 mA ≈ 1,85 V, 1 A ≈ 2,05 V, 1,5 A ≈ 2,25 V; 20 mA'in altı ilk parçanın
 *   uzantısı (0 mA ≈ 1,46 V; eğride yok). Kullanıcı kararı (2026-11-02): bırakma gerilimi akıma göre.
 *   En küçük yük akımı (tipik 3,5 mA) modellenmez.
 */
export const LM317: RegulatorSpec = {
  vset: 1.25,
  ro: 0.005 / (1.5 - 0.01),
  ilim: 2.2,
  dropout: [
    [0, 1.48 - (0.02 * (1.67 - 1.48)) / 0.18],
    [0.02, 1.48],
    [0.2, 1.67],
    [0.5, 1.85],
    [1, 2.05],
    [1.5, 2.25],
  ],
  reference: 50e-6,
};

/** Newton yinelemesinde çıkışın doğrusallaştırma noktasının en büyük adımı (V). */
const VOUT_STEP = 1;

/** Akım sınırındayken çıkış düğümü boşta kalmasın diye çok küçük eğim (S). */
const LEAK = 1e-9;
/** Sıfır akım sınırının yumuşaklığı (A): regülasyondaki etkisi ölçülemeyecek kadar küçük. */
const SOFT = 1e-6;

/** Bırakma eğrisinin tersi: giriş − çıkış farkında geçebilecek en büyük akım ve türevi (uçlarda uzantı). */
function dropoutCurrent(spec: RegulatorSpec, headroom: number): { i: number; g: number } {
  const pts = spec.dropout;
  for (let k = 1; k < pts.length; k++) {
    const [i0, v0] = pts[k - 1]!;
    const [i1, v1] = pts[k]!;
    if (headroom <= v1 || k === pts.length - 1) {
      const g = (i1 - i0) / (v1 - v0);
      return { i: i0 + g * (headroom - v0), g };
    }
  }
  return { i: 0, g: 0 };
}

/** Akıma göre bırakma gerilimi (eğriden doğrusal ara değer; son parçanın uzantısı). */
export function dropoutVoltage(spec: RegulatorSpec, current: number): number {
  const pts = spec.dropout;
  for (let k = 1; k < pts.length; k++) {
    const [i0, v0] = pts[k - 1]!;
    const [i1, v1] = pts[k]!;
    if (current <= i1 || k === pts.length - 1) return v0 + ((v1 - v0) * (Math.max(0, current) - i0)) / (i1 - i0);
  }
  return pts[0]![1];
}

interface Operating {
  /** IN → OUT akımı ve kısmi türevleri (V_in, V_ref, V_out). */
  readonly i: number;
  readonly dIn: number;
  readonly dRef: number;
  readonly dOut: number;
  /** IN → başvuru ucu akımı ve türevi (V_in − V_ref'e göre). */
  readonly q: number;
  readonly dq: number;
  /** Giriş yetmiyor (bırakma gerilimiyle sınırlı). */
  readonly dropout: boolean;
}

function operate(spec: RegulatorSpec, vin: number, vref: number, vout: number): Operating {
  const reg = (vref + spec.vset - vout) / spec.ro;
  const drop = dropoutCurrent(spec, vin - vout);
  // Küçük olan sınırlar: ayar (regülasyon) ya da girişin yetmemesi (bırakma gerilimi).
  const dropout = drop.i < reg;
  const m = dropout ? drop.i : reg;
  let dIn = dropout ? drop.g : 0;
  let dRef = dropout ? 0 : 1 / spec.ro;
  let dOut = dropout ? -drop.g : -1 / spec.ro;
  // Akımı geri alamaz: I = softplus(m) − SOFT·ln 2 (ölçek SOFT): m ≫ SOFT'ta I = m, m = 0'da tam 0
  // (yüksüz çıkış ayarda kalır), m < 0'da en çok 0,7 µA geri alır. Türev sürekli olduğu için Newton
  // yinelemesi sıfır akım sınırında gidip gelmez.
  const z = m / SOFT;
  let i = (z > 0 ? m + SOFT * Math.log1p(Math.exp(-z)) : SOFT * Math.log1p(Math.exp(z))) - SOFT * Math.LN2;
  const slope = z > 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z));
  dIn *= slope;
  dRef *= slope;
  // Eğim sıfıra inince (giriş yokken, yüksüz çıkış) matris tekil olmasın: çok küçük alt sınır.
  dOut = Math.min(dOut * slope, -LEAK);
  if (i > spec.ilim) {
    i = spec.ilim;
    dIn = 0;
    dRef = 0;
    dOut = -LEAK;
  }
  // Başvuru ucunun akımı: giriş − başvuru, sıfır yük bırakma gerilimine çıkarken 0'dan tam değerine.
  const head = vin - vref;
  const ramp = spec.dropout[0]![1];
  const q = head <= 0 ? 0 : head >= ramp ? spec.reference : (spec.reference * head) / ramp;
  const dq = head <= 0 || head >= ramp ? 0 : spec.reference / ramp;
  return { i, dIn, dRef, dOut, q, dq, dropout: dropout && i > 1e-6 };
}

export class RegulatorDevice extends Device {
  readonly type: 'reg7805';
  readonly spec: RegulatorSpec;
  /** NR doğrusallaştırma noktası (V_in, V_ref, V_out). */
  private it = { vin: 0, vref: 0, vout: 0 };
  private saved = { vin: 0, vref: 0, vout: 0 };

  constructor(init: DeviceInit, type: 'reg7805') {
    super(init);
    this.type = type;
    this.spec = REG7805;
  }

  override get nonlinear(): boolean {
    return true;
  }

  /** Doğrusallaştırılmış iki bağımlı akım kaynağı: IN → OUT ve IN → başvuru ucu. */
  override stampNonlinear(sys: MnaSystem): void {
    const [nin, nref, nout] = this.nodes as [number, number, number];
    const { vin, vref, vout } = this.it;
    const o = operate(this.spec, vin, vref, vout);
    // I = i + dIn·Δvin + dRef·Δvref + dOut·Δvout: IN düğümünden çıkar, OUT düğümüne girer.
    const ieq = o.i - o.dIn * vin - o.dRef * vref - o.dOut * vout;
    this.vccs(sys, nin, nout, [
      [nin, o.dIn],
      [nref, o.dRef],
      [nout, o.dOut],
    ], ieq);
    const qeq = o.q - o.dq * (vin - vref);
    this.vccs(sys, nin, nref, [
      [nin, o.dq],
      [nref, -o.dq],
    ], qeq);
  }

  /** `from` düğümünden çıkıp `to` düğümüne giren akım: Σ g·v + ieq. */
  private vccs(sys: MnaSystem, from: number, to: number, terms: ReadonlyArray<readonly [number, number]>, ieq: number): void {
    for (const [node, g] of terms) {
      if (node < 0 || g === 0) continue;
      if (from >= 0) sys.add(from, node, g);
      if (to >= 0) sys.add(to, node, -g);
    }
    sys.currentSource(from, to, ieq);
  }

  /**
   * Çıkışın doğrusallaştırma noktası yineleme başına en çok VOUT_STEP değişir (diyottaki gerilim
   * sınırlaması gibi): parçalı doğrusal model akım sınırı ile sıfır akım arasında gidip gelmesin.
   */
  override updateIterate(x: Float64Array): boolean {
    const next = { vin: this.v(x, 0), vref: this.v(x, 1), vout: this.v(x, 2) };
    const close = (a: number, b: number) => Math.abs(a - b) < 1e-6 + 1e-6 * Math.abs(a);
    const converged = close(next.vin, this.it.vin) && close(next.vref, this.it.vref) && close(next.vout, this.it.vout);
    const step = next.vout - this.it.vout;
    if (Math.abs(step) > VOUT_STEP) next.vout = this.it.vout + Math.sign(step) * VOUT_STEP;
    this.it = next;
    return converged;
  }

  override restoreIterate(): void {
    this.it = { ...this.saved };
  }

  override accept(): void {
    this.saved = { ...this.it };
  }

  private state(x: Float64Array) {
    const vin = this.v(x, 0);
    const vref = this.v(x, 1);
    const vout = this.v(x, 2);
    return { vin, vref, vout, ...operate(this.spec, vin, vref, vout) };
  }

  override pinCurrents(x: Float64Array): number[] {
    const s = this.state(x);
    return [s.i + s.q, -s.q, -s.i];
  }

  /** Çıkış: OUT − başvuru gerilimi, verdiği akım ve regülatörde harcanan güç. */
  measure(x: Float64Array): Measurement {
    const s = this.state(x);
    return { voltage: s.vout - s.vref, current: s.i, power: (s.vin - s.vout) * s.i + (s.vin - s.vref) * s.q };
  }

  override status(x: Float64Array): DeviceStatus {
    const s = this.state(x);
    return { regulator: { input: s.vin, output: s.vout, current: s.i, power: (s.vin - s.vout) * s.i + (s.vin - s.vref) * s.q, dropout: s.dropout } };
  }

  /** Giriş, çıkışın bırakma gerilimi kadar üstünde değil: çıkış ayarlanan değeri tutamıyor. */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const s = this.state(x);
    return s.dropout ? [{ code: 'regulator-dropout', params: { input: s.vin - s.vref, output: s.vout - s.vref, needed: dropoutVoltage(this.spec, s.i) } }] : [];
  }

  override adoptState(prev: Device): void {
    if (prev instanceof RegulatorDevice && prev.type === this.type) {
      this.it = { ...prev.it };
      this.saved = { ...prev.saved };
    }
  }
}

export const reg7805Model: DeviceModel = {
  type: 'reg7805',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 0,
  create: (init) => new RegulatorDevice(init, 'reg7805'),
};
