import type { MnaSystem } from '../mna';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type RatingWarning } from './device';

// Doğrusal gerilim regülatörleri (davranışsal model). Pinler: [0] = IN, [1] = başvuru ucu (7805'te GND,
// LM317'de ADJ), [2] = OUT. Geçiş akımı I (IN → OUT) bir MNA dalıdır; her Newton yinelemesinde dört
// durumdan biri geçerlidir:
//   ayar (regülasyon):  V_out = V_ref + Vset − RO·I          (RO: yük regülasyonu)
//   bırakma:            V_out = V_in − Vd(I)                 (Vd: veri sayfasının dropout eğrisi)
//   akım sınırı:        I = Ilim
//   kapalı:             I = 0                                (akımı geri alamaz; giriş yokken)
// Durum bir önceki yinelemenin çözümünden seçilir (çıkış ikisinin küçüğü; I, 0 ile Ilim arasında). Ayar
// durumunda denklem doğrusaldır: Newton tek adımda çözer. Başvuru ucundan da IN'den gelen küçük bir
// akım akar: 7805'te bekleme akımı (GND'ye), LM317'de ADJ akımı (ADJ ucundan dışarı).
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

/** Bırakma eğrisinin akıma göre eğimi (Ω; doğrusal ara değerin parçası). */
function dropoutSlope(spec: RegulatorSpec, current: number): number {
  const pts = spec.dropout;
  for (let k = 1; k < pts.length; k++) {
    const [i0, v0] = pts[k - 1]!;
    const [i1, v1] = pts[k]!;
    if (current <= i1 || k === pts.length - 1) return (v1 - v0) / (i1 - i0);
  }
  return 0;
}

/** Başvuru ucunun akımı (IN → başvuru): giriş − başvuru 0'dan sıfır yük bırakma gerilimine çıkarken 0'dan tam değerine. */
function referenceCurrent(spec: RegulatorSpec, head: number): { q: number; dq: number } {
  const ramp = spec.dropout[0]![1];
  if (head <= 0) return { q: 0, dq: 0 };
  if (head >= ramp) return { q: spec.reference, dq: 0 };
  return { q: (spec.reference * head) / ramp, dq: spec.reference / ramp };
}

type Mode = 'reg' | 'drop' | 'limit' | 'off';

export const LM317_MODELS = ['LM317T'] as const;
export const LM317_DEFAULTS = { model: 'LM317T' as (typeof LM317_MODELS)[number] };

export class RegulatorDevice extends Device {
  readonly type: 'reg7805' | 'lm317';
  readonly spec: RegulatorSpec;
  /** Yinelemedeki durum ve bırakma eğrisinin doğrusallaştırıldığı akım; son kabul edilenler. */
  private mode: Mode = 'reg';
  private i0 = 0;
  private saved: { mode: Mode; i0: number; head: number } = { mode: 'reg', i0: 0, head: 0 };
  /** Başvuru ucu akımının doğrusallaştırma noktası (giriş − başvuru). */
  private head = 0;
  /** Son kabul edilen adımda durum değişti ya da akım salınıyor (süreksizlik). */
  private jumped = false;
  /** Son kabul edilen geçiş akımı ve bir önceki adıma göre değişimi. */
  private lastCurrent = 0;
  private lastDelta = 0;

  constructor(init: DeviceInit, type: 'reg7805' | 'lm317') {
    super(init);
    this.type = type;
    this.spec = type === 'reg7805' ? REG7805 : LM317;
  }

  override get nonlinear(): boolean {
    return true;
  }

  private get branch(): number {
    return this.branches[0]!;
  }

  override stampNonlinear(sys: MnaSystem): void {
    const [nin, nref, nout] = this.nodes as [number, number, number];
    const k = this.branch;
    const { spec } = this;
    // Geçiş akımı I: IN düğümünden çıkar, OUT düğümüne girer.
    if (nin >= 0) sys.add(nin, k, 1);
    if (nout >= 0) sys.add(nout, k, -1);
    switch (this.mode) {
      case 'reg':
        // V_out − V_ref + RO·I = Vset
        if (nout >= 0) sys.add(k, nout, 1);
        if (nref >= 0) sys.add(k, nref, -1);
        sys.add(k, k, spec.ro);
        sys.addRhs(k, spec.vset);
        break;
      case 'drop': {
        // V_out − V_in + rd·I = −(Vd(I0) − rd·I0)
        const rd = dropoutSlope(spec, this.i0);
        if (nout >= 0) sys.add(k, nout, 1);
        if (nin >= 0) sys.add(k, nin, -1);
        sys.add(k, k, rd);
        sys.addRhs(k, -(dropoutVoltage(spec, this.i0) - rd * this.i0));
        break;
      }
      case 'limit':
        sys.add(k, k, 1);
        sys.addRhs(k, spec.ilim);
        break;
      case 'off':
        sys.add(k, k, 1);
        break;
    }
    // Başvuru ucunun akımı (IN → başvuru), giriş − başvuruya göre doğrusallaştırılmış.
    const { q, dq } = referenceCurrent(spec, this.head);
    if (dq !== 0) {
      if (nin >= 0) {
        sys.add(nin, nin, dq);
        if (nref >= 0) sys.add(nin, nref, -dq);
      }
      if (nref >= 0) {
        sys.add(nref, nref, dq);
        if (nin >= 0) sys.add(nref, nin, -dq);
      }
    }
    sys.currentSource(nin, nref, q - dq * this.head);
  }

  /** Bir önceki çözümden durumu seçer: çıkış ayar ile bırakma sınırının küçüğü, akım 0 ile Ilim arası. */
  override updateIterate(x: Float64Array): boolean {
    const { spec } = this;
    const vin = this.v(x, 0);
    const vref = this.v(x, 1);
    const vout = this.v(x, 2);
    const i = x[this.branch]!;
    const regulated = (current: number) => vref + spec.vset - spec.ro * current;
    const ceiling = (current: number) => vin - dropoutVoltage(spec, current);
    const onMode = (current: number): Mode => (ceiling(current) < regulated(current) ? 'drop' : 'reg');
    let next: Mode;
    if (this.mode === 'limit') next = vout > Math.min(regulated(spec.ilim), ceiling(spec.ilim)) + 1e-9 ? onMode(spec.ilim) : 'limit';
    else if (this.mode === 'off') next = Math.min(regulated(0), ceiling(0)) > vout + 1e-9 ? onMode(0) : 'off';
    else next = i > spec.ilim ? 'limit' : i < 0 ? 'off' : onMode(i);
    const head = vin - vref;
    const converged = next === this.mode && Math.abs(i - this.i0) < 1e-9 + 1e-6 * Math.abs(i) && Math.abs(head - this.head) < 1e-6 + 1e-6 * Math.abs(head);
    this.mode = next;
    this.i0 = Math.max(0, i);
    this.head = head;
    return converged;
  }

  override restoreIterate(): void {
    this.mode = this.saved.mode;
    this.i0 = this.saved.i0;
    this.head = this.saved.head;
  }

  /**
   * Durum değiştiyse ya da geçiş akımı adım adım bir artıp bir azalıyorsa (yamuk kuralının salınımı)
   * süreksizlik bildirilir. Salınım çıkıştaki kondansatörde başlar: ayar durumunda çıkış neredeyse ideal
   * bir gerilim kaynağıdır (RO çok küçük), yamuk kuralı da kondansatör akımındaki bir tutarsızlığı
   * söndürmez; bir geri Euler adımı onu sıfırlar.
   */
  override accept(x: Float64Array): void {
    const i = x[this.branch]!;
    const delta = i - this.lastCurrent;
    const tolerance = 1e-6 + 1e-4 * Math.abs(i);
    const ringing = delta * this.lastDelta < 0 && Math.abs(delta) > tolerance && Math.abs(this.lastDelta) > tolerance;
    this.jumped = this.mode !== this.saved.mode || ringing;
    this.lastCurrent = i;
    this.lastDelta = delta;
    this.saved = { mode: this.mode, i0: this.i0, head: this.head };
  }

  override discontinuity(): boolean {
    return this.jumped;
  }

  private state(x: Float64Array) {
    const vin = this.v(x, 0);
    const vref = this.v(x, 1);
    const vout = this.v(x, 2);
    const i = x[this.branch]!;
    const q = referenceCurrent(this.spec, vin - vref).q;
    return { vin, vref, vout, i, q, power: (vin - vout) * i + (vin - vref) * q, dropout: this.mode === 'drop' && i > 1e-6 };
  }

  override pinCurrents(x: Float64Array): number[] {
    const s = this.state(x);
    return [s.i + s.q, -s.q, -s.i];
  }

  /** Çıkış: OUT − başvuru gerilimi, verdiği akım ve regülatörde harcanan güç. */
  measure(x: Float64Array): Measurement {
    const s = this.state(x);
    return { voltage: s.vout - s.vref, current: s.i, power: s.power };
  }

  override status(x: Float64Array): DeviceStatus {
    const s = this.state(x);
    return { regulator: { input: s.vin, output: s.vout, current: s.i, power: s.power, dropout: s.dropout } };
  }

  /** Giriş, çıkışın bırakma gerilimi kadar üstünde değil: çıkış ayarlanan değeri tutamıyor. */
  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const s = this.state(x);
    return s.dropout ? [{ code: 'regulator-dropout', params: { input: s.vin - s.vref, output: s.vout - s.vref, needed: dropoutVoltage(this.spec, s.i) } }] : [];
  }

  override adoptState(prev: Device): void {
    if (prev instanceof RegulatorDevice && prev.type === this.type) {
      this.mode = prev.mode;
      this.i0 = prev.i0;
      this.head = prev.head;
      this.saved = { ...prev.saved };
      this.lastCurrent = prev.lastCurrent;
      this.lastDelta = prev.lastDelta;
    }
  }
}

export const reg7805Model: DeviceModel = {
  type: 'reg7805',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 1,
  create: (init) => new RegulatorDevice(init, 'reg7805'),
};

export const lm317Model: DeviceModel = {
  type: 'lm317',
  pinCount: 3,
  internalNodes: 0,
  branchCount: 1,
  create: (init) => new RegulatorDevice(init, 'lm317'),
};
