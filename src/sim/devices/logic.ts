import { GATE_CHIPS, LOGIC_CHIPS, gateModels, gateOutput, type GateChipType, type LogicChipType } from '../../model/logicChips';
import { GMIN } from '../constants';
import type { MnaSystem } from '../mna';
import { strProp } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type LogicPinStatus, type Measurement, type PinState, type RatingWarning, type StepContext } from './device';

/**
 * Lojik entegreler (Dalga 2): 7400, 7402, 7404, 7408, 7432, 7486, 7474 (74HC ve 74LS), CD4017B,
 * CD4511B. Bütün sayılar üreticinin veri sayfasından (TA = 25 °C, tipik değer varsa tipik); kaynaklar
 * aşağıdaki sabitlerin yorumlarında ve README'de ("Lojik entegreler").
 *
 * Model:
 *   - Girişler veri sayfasındaki V_IL / V_IH eşiklerine göre 0 ya da 1 okunur (besleme gerilimine göre
 *     tablodaki noktalar arasında doğrusal ara değer). Arada "belirsiz": sayısal durum kararlı kalsın
 *     diye ortadaki eşik küçük bir histerezisle (aralığın %5'i) kullanılır, kart belirsiz gösterir ve
 *     uyarı verir.
 *   - 74HC ve CD4000B girişi akım çekmez (sızıntı ≤ 0,1 µA, modellenmez). Hiçbir şey girişi sürmüyorsa
 *     (beslemeye iletken yolu yok) "CMOS giriş boşta" uyarısı; motorun gmin'i girişi 0'a çeker.
 *   - 74LS girişi veri sayfasındaki giriş akımlarıyla: I_IL = −0,4 mA (V_I = 0,4 V) ve I_IH = 20 µA
 *     (2,7 V) noktalarından geçen doğru (2,59 V arkasında 5,48 kΩ); 2,7 V'un üstünde 7 V'taki
 *     I_I = 0,1 mA noktasına giden doğru. Boşta giriş 2,59 V'ta kalır ve 1 okunur. İki birim yüklü
 *     girişler (74LS86A'nın girişleri, 74LS74A'nın PRĒ ve CLR̄'si: I_IL −0,8 mA) iki kat akım çeker.
 *   - Çıkış: 1'de V_CC'den, 0'da GND'den, veri sayfasındaki V_OH / V_OL – akım noktalarından geçen
 *     parça parça doğrusal bir eğriyle akım verir (çeker). Noktalar arasında doğru, son noktanın
 *     ötesinde son doğrunun uzantısı; beslemeye göre tablolar arasında ara değer. Kısa devrede ya da
 *     aşırı yükte çıkış gerilimi bu eğriye göre düşer. Eğrisi 0 A'de sıfırdan farklı başlayan
 *     çıkışlar (74LS, CD4511B'nin npn çıkışı) ters yönde akım vermez.
 *   - Besleme: besleme bacakları bağlı değilse ya da V_CC − GND veri sayfasının önerilen en küçük
 *     değerinin altındaysa çıkışlar sürmez ("entegre beslenmiyor"). Önerilen aralığın dışı uyarı;
 *     mutlak en büyük değerin üstünde entegre yanar (çıkışlar sürmez, Onar ile düzelir).
 *   - Yayılma gecikmesi: giriş eşiği geçtikten (olay, 10 ns çözünürlükle) t_pd sonra çıkış değişir
 *     (kırılma noktası); t_pd'den kısa bir giriş darbesi çıkışa geçmez (eylemsiz gecikme). Çıkışın
 *     yükselme ve düşme süresi, kurulum ve tutma süreleri modellenmez.
 *   - 74LS'nin besleme akımı (I_CCH / I_CCL, V_CC = 5,25 V'ta tipik) V_CC ile GND arasında bir
 *     iletkenlik; 74HC ve CD4000B'nin durgun akımı (en çok µA) modellenmez.
 */

export type LogicFamily = 'HC' | 'LS' | 'CD';

/** (akım A, gerilim V) noktaları; akım artan sırada, ilki 0 A. */
type Curve = ReadonlyArray<readonly [number, number]>;
/** Besleme gerilimine göre eğriler (veri sayfasının ölçüm noktaları). */
type CurveTable = ReadonlyArray<{ readonly vcc: number; readonly curve: Curve }>;

export interface OutputStage {
  /** 1 çıkışı: V_CC − V_çıkış düşümü, verilen akıma göre. */
  readonly high: CurveTable;
  /** 0 çıkışı: V_çıkış − GND, çekilen akıma göre. */
  readonly low: CurveTable;
}

export interface LogicFamilySpec {
  /** Önerilen besleme aralığı (V). */
  readonly supplyMin: number;
  readonly supplyMax: number;
  /** Mutlak en büyük besleme gerilimi (V); aşılırsa entegre yanar. */
  readonly supplyAbsMax: number;
  /** Giriş eşikleri: [V_CC, V_IL en çok, V_IH en az]. */
  readonly thresholds: ReadonlyArray<readonly [number, number, number]>;
  /** 74LS giriş eşdeğeri (bir birim yük); CMOS girişlerde null. */
  readonly ttlInput: { readonly g: number; readonly v0: number; readonly gHigh: number; readonly vKnee: number } | null;
  readonly output: OutputStage;
  /** Çıkış başına mutlak en büyük akım (A); aşılırsa uyarı. Veri sayfası vermiyorsa null. */
  readonly outputCurrentMax: number | null;
}

/** Doğrusal ara değer: x, noktalar arasında; dışında uçtaki değer. */
function lerp(x: number, points: ReadonlyArray<readonly [number, number]>): number {
  if (x <= points[0]![0]) return points[0]![1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x0, y0] = points[i - 1]!;
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return points[points.length - 1]![1];
}

/** Eğrinin akımdaki gerilimi (son doğrunun uzantısıyla). */
function curveVoltage(c: Curve, current: number): number {
  let k = 1;
  while (k < c.length - 1 && current > c[k]![0]) k++;
  const [i0, v0] = c[k - 1]!;
  const [i1, v1] = c[k]!;
  return v0 + ((v1 - v0) * (current - i0)) / (i1 - i0);
}

/** Besleme gerilimindeki eğri: iki tablonun aynı akımlardaki gerilimleri arasında ara değer. */
export function curveAt(table: CurveTable, vcc: number): Curve {
  const first = table[0]!;
  const last = table[table.length - 1]!;
  if (vcc <= first.vcc) return first.curve;
  if (vcc >= last.vcc) return last.curve;
  let k = 1;
  while (vcc > table[k]!.vcc) k++;
  const a = table[k - 1]!;
  const b = table[k]!;
  const w = (vcc - a.vcc) / (b.vcc - a.vcc);
  const currents = [...new Set([...a.curve.map((p) => p[0]), ...b.curve.map((p) => p[0])])].sort((x, y) => x - y);
  return currents.map((i) => [i, (1 - w) * curveVoltage(a.curve, i) + w * curveVoltage(b.curve, i)] as const);
}

/** Eğrinin gerilimdeki doğrusu: akım = g · v + i0. Eğri 0 A'de sıfırdan yukarıdaysa altında akım yok (−1). */
function segmentAt(c: Curve, v: number): number {
  if (v < c[0]![1] && c[0]![1] > 1e-9) return -1;
  let k = 1;
  while (k < c.length - 1 && v > c[k]![1]) k++;
  return k;
}

function linearize(c: Curve, v: number): { readonly g: number; readonly i0: number } {
  const k = segmentAt(c, v);
  // Akım vermeyen bölge: matris tekil olmasın diye motorun gmin'i kadar iletkenlik (sayısal; akım ≈ 0).
  if (k < 0) return { g: GMIN, i0: -GMIN * c[0]![1] };
  const [ia, va] = c[k - 1]!;
  const [ib, vb] = c[k]!;
  const g = (ib - ia) / (vb - va);
  return { g, i0: ia - g * va };
}

function curveCurrent(c: Curve, v: number): number {
  const { g, i0 } = linearize(c, v);
  return g * v + i0;
}

/** İki noktadan geçen doğrunun 0 A'deki değeri. */
function atZero(a: readonly [number, number], b: readonly [number, number]): number {
  return a[1] - (a[0] * (b[1] - a[1])) / (b[0] - a[0]);
}

/**
 * 74HC (TI SN74HC00 SCLS181H, HC02 SCLS076G, HC04 SCLS078H, HC08 SCLS081J, HC32 SCLS200F, HC86
 * SCLS100F, HC74 SCLS094F; değerler aileye ortak):
 *   - Önerilen V_CC 2–6 V; mutlak en büyük 7 V. Çıkış akımı mutlak en büyük ±25 mA.
 *   - V_IH (en az): 2 V'ta 1,5 V, 4,5 V'ta 3,15 V, 6 V'ta 4,2 V; V_IL (en çok): 0,5 / 1,35 / 1,8 V.
 *   - V_OH (tipik): 2 V'ta I_OH = −20 µA'de 1,998 V; 4,5 V'ta −4 mA'de 4,3 V; 6 V'ta −5,2 mA'de 5,8 V.
 *   - V_OL (tipik): 2 V'ta 20 µA'de 0,002 V; 4,5 V'ta 4 mA'de 0,17 V; 6 V'ta 5,2 mA'de 0,15 V.
 */
const HC: LogicFamilySpec = {
  supplyMin: 2,
  supplyMax: 6,
  supplyAbsMax: 7,
  thresholds: [
    [2, 0.5, 1.5],
    [4.5, 1.35, 3.15],
    [6, 1.8, 4.2],
  ],
  ttlInput: null,
  output: {
    high: [
      { vcc: 2, curve: [[0, 0], [20e-6, 2 - 1.998]] },
      { vcc: 4.5, curve: [[0, 0], [4e-3, 4.5 - 4.3]] },
      { vcc: 6, curve: [[0, 0], [5.2e-3, 6 - 5.8]] },
    ],
    low: [
      { vcc: 2, curve: [[0, 0], [20e-6, 0.002]] },
      { vcc: 4.5, curve: [[0, 0], [4e-3, 0.17]] },
      { vcc: 6, curve: [[0, 0], [5.2e-3, 0.15]] },
    ],
  },
  outputCurrentMax: 25e-3,
};

/**
 * 74LS (TI SN74LS00 SDLS025D, LS02 SDLS027, LS04 SDLS029C, LS08 SDLS033, LS32 SDLS100, LS86A
 * SDLS124, LS74A SDLS119; V_CC = 5 V):
 *   - Önerilen V_CC 4,75–5,25 V; mutlak en büyük 7 V. V_IH 2 V, V_IL 0,8 V.
 *   - V_OH (tipik) V_CC = 4,75 V ve I_OH = −0,4 mA'de 3,4 V (düşüm 1,35 V); kısa devre akımı I_OS
 *     −20 … −100 mA (V_CC = 5,25 V; veri sayfası tipik vermez, aralığın ortası −60 mA alındı): bu iki
 *     noktadan geçen doğru (V_CC − 1,32 V arkasında 65 Ω).
 *   - V_OL (tipik) I_OL = 4 mA'de 0,25 V, 8 mA'de 0,35 V: bu doğru (0 A'de 0,15 V).
 *   - Giriş: I_IL = −0,4 mA (V_I = 0,4 V), I_IH = 20 µA (2,7 V), I_I = 0,1 mA (7 V).
 */
const LS_HIGH_A = [0.4e-3, 4.75 - 3.4] as const;
const LS_HIGH_B = [60e-3, 5.25] as const;
const LS: LogicFamilySpec = {
  supplyMin: 4.75,
  supplyMax: 5.25,
  supplyAbsMax: 7,
  thresholds: [[5, 0.8, 2]],
  ttlInput: {
    g: (20e-6 + 0.4e-3) / (2.7 - 0.4),
    v0: 0.4 + 0.4e-3 / ((20e-6 + 0.4e-3) / (2.7 - 0.4)),
    gHigh: (0.1e-3 - 20e-6) / (7 - 2.7),
    vKnee: 2.7,
  },
  output: {
    high: [{ vcc: 5, curve: [[0, atZero(LS_HIGH_A, LS_HIGH_B)], LS_HIGH_B] }],
    low: [{ vcc: 5, curve: [[0, atZero([4e-3, 0.25], [8e-3, 0.35])], [4e-3, 0.25], [8e-3, 0.35]] }],
  },
  outputCurrentMax: null,
};

/**
 * 74LS04 (SDLS029C): V_OL'nin tipiği yalnızca I_OL = 8 mA'de (0,25 V). Eğim kardeşlerinin (4 ve 8 mA
 * noktaları: 25 Ω) eğimi alındı (yaklaştırma; README).
 */
const LS04_LOW: CurveTable = [{ vcc: 5, curve: [[0, 0.25 - 8e-3 * 25], [8e-3, 0.25]] }];

/**
 * CD4000B (TI CD4017B SCHS027C, CD4511B SCHS072B; Harris; TA = 25 °C tipik):
 *   - Önerilen V_DD 3–18 V; mutlak en büyük 20 V.
 *   - V_IL (en çok) 1,5 / 3 / 4 V, V_IH (en az) 3,5 / 7 / 11 V (V_DD = 5 / 10 / 15 V).
 *   - Kaynak akımı I_OH (tipik): 5 V'ta V_O = 4,6 V'ta −1 mA ve 2,5 V'ta −3,2 mA; 10 V'ta 9,5 V'ta
 *     −2,6 mA; 15 V'ta 13,5 V'ta −6,8 mA.
 *   - Çekme akımı I_OL (tipik): 5 V'ta V_O = 0,4 V'ta 1 mA; 10 V'ta 0,5 V'ta 2,6 mA; 15 V'ta 1,5 V'ta 6,8 mA.
 */
const CD_LOW: CurveTable = [
  { vcc: 5, curve: [[0, 0], [1e-3, 0.4]] },
  { vcc: 10, curve: [[0, 0], [2.6e-3, 0.5]] },
  { vcc: 15, curve: [[0, 0], [6.8e-3, 1.5]] },
];
const CD: LogicFamilySpec = {
  supplyMin: 3,
  supplyMax: 18,
  supplyAbsMax: 20,
  thresholds: [
    [5, 1.5, 3.5],
    [10, 3, 7],
    [15, 4, 11],
  ],
  ttlInput: null,
  output: {
    high: [
      { vcc: 5, curve: [[0, 0], [1e-3, 0.4], [3.2e-3, 2.5]] },
      { vcc: 10, curve: [[0, 0], [2.6e-3, 0.5]] },
      { vcc: 15, curve: [[0, 0], [6.8e-3, 1.5]] },
    ],
    low: CD_LOW,
  },
  outputCurrentMax: null,
};

export const LOGIC_FAMILIES: Readonly<Record<LogicFamily, LogicFamilySpec>> = { HC, LS, CD };

/** Model adından aile: "74HC08" → HC, "74LS08" → LS, "CD4017B" → CD. */
export function logicFamily(model: string): LogicFamily {
  return model.startsWith('CD') ? 'CD' : model.includes('LS') ? 'LS' : 'HC';
}

/** Girişteki ara bölgede (V_IL–V_IH) kullanılan histerezis: aralığın bu kesri (± ortadan). */
const HYSTERESIS = 0.05;

/** Bacakların rolü (indeks 0'dan: DIP bacak numarası − 1). */
interface ChipLayout {
  readonly vcc: number;
  readonly gnd: number;
  readonly inputs: readonly number[];
  readonly outputs: readonly number[];
}

/** Entegreye özgü ayrıntılar: çıkış katı, besleme akımı, giriş yükü. */
interface ChipExtras {
  readonly output?: Partial<OutputStage>;
  readonly outputCurrentMax?: number | null;
  /** 74LS besleme akımı (A, V_CC = 5,25 V'ta tipik): çıkışların hepsi 1 / hepsi 0 iken. */
  readonly icc?: { readonly high: number; readonly low: number };
  /** 74LS girişlerinin birim yükü (girişlerin sırasıyla; verilmezse 1). */
  readonly inputLoad?: readonly number[];
}

/**
 * Lojik entegrelerin ortak çözücü modeli: girişlerin okunması (eşik, histerezis, olay), çıkış katı,
 * besleme, gecikmeli çıkış değişimi. Alt sınıf mantığı (evaluate) ve gecikmeyi (delay) verir.
 */
export abstract class LogicIcDevice extends Device {
  abstract override readonly type: LogicChipType;
  readonly layout: ChipLayout;
  readonly model: string;
  readonly family: LogicFamily;
  readonly spec: LogicFamilySpec;
  private readonly extras: ChipExtras;
  /** Girişlerin son kabul edilen seviyesi (histerezisli). */
  protected levels: number[];
  /** Çıkışların sürülen seviyesi. */
  protected outs: number[];
  /** Bekleyen çıkış değişimleri: çıkış indeksi → seviye ve zaman. */
  protected pending = new Map<number, { level: number; time: number }>();
  protected powered = false;
  burned = false;
  burnSupply = 0;
  /** Devrede başka bir şeye bağlı bacaklar (derlemede bildirilir). */
  private connected: readonly boolean[] = [];
  /** Beslemeye iletken yolu olan (bir şeyin sürdüğü) bacaklar; motor topoloji değişince bildirir. */
  private driven: readonly boolean[] | null = null;
  private lastH = 0;
  private outputChanged = false;
  /** Son kabul edilen adımdaki eşik farkları (olay konumu için). */
  private margins: number[];
  /** Çıkış katının ve eşiklerin hesaplandığı besleme (son kabul edilen adımdaki). */
  private supplyNominal = 5;
  private highCurve: Curve;
  private lowCurve: Curve;
  /** Newton'da son yinelemenin çıkış ve 74LS giriş gerilimleri (doğru parçasını seçmek için). */
  private iterOut: number[];
  private iterIn: number[];
  private savedOut: number[];
  private savedIn: number[];

  constructor(init: DeviceInit, type: LogicChipType, model: string, extras: ChipExtras = {}) {
    super(init);
    const def = LOGIC_CHIPS[type];
    this.layout = { vcc: def.vcc - 1, gnd: def.gnd - 1, inputs: def.inputs.map((p) => p - 1), outputs: def.outputs.map((p) => p - 1) };
    this.model = model;
    this.family = logicFamily(model);
    this.spec = LOGIC_FAMILIES[this.family];
    this.extras = extras;
    this.levels = this.layout.inputs.map(() => 0);
    this.margins = this.layout.inputs.map(() => 0);
    this.outs = this.layout.outputs.map(() => 0);
    this.iterOut = this.layout.outputs.map(() => 0);
    this.iterIn = this.layout.inputs.map(() => 0);
    this.savedOut = [...this.iterOut];
    this.savedIn = [...this.iterIn];
    this.highCurve = curveAt(this.stage.high, 5);
    this.lowCurve = curveAt(this.stage.low, 5);
  }

  private get stage(): OutputStage {
    return { ...this.spec.output, ...this.extras.output };
  }

  get outputCurrentMax(): number | null {
    return this.extras.outputCurrentMax !== undefined ? this.extras.outputCurrentMax : this.spec.outputCurrentMax;
  }

  override get nonlinear(): boolean {
    return true;
  }
  override get reactive(): boolean {
    return true;
  }
  override get timeVarying(): boolean {
    return true;
  }
  override get switching(): boolean {
    return true;
  }

  /** Mantık: giriş seviyelerinden (ve iç durumdan) çıkış seviyeleri; kenarlar previous → levels. */
  protected abstract evaluate(levels: readonly number[], previous: readonly number[]): number[];

  /** Yayılma gecikmesi (s): çıkış `out` `level`'e geçiyor; `changed`: değişen girişler. */
  protected abstract delay(vcc: number, out: number, level: number, changed: readonly boolean[], levels: readonly number[]): number;

  /** Beslenince iç durum (flip-flop, sayaç, mandal) başlangıç değerine döner. */
  protected resetState(): void {}

  protected supplyAt(x: Float64Array): number {
    return this.v(x, this.layout.vcc) - this.v(x, this.layout.gnd);
  }

  private supplyConnected(): boolean {
    const { vcc, gnd } = this.layout;
    return this.connected.length === 0 || (this.connected[vcc]! && this.connected[gnd]!);
  }

  /** Beslemenin ve bacaklarının durumuna göre entegre çalışıyor mu? */
  private poweredAt(x: Float64Array): boolean {
    if (this.burned || !this.supplyConnected()) return false;
    const supply = this.supplyAt(x);
    // Önerilen en küçük beslemenin çevresinde küçük histerezis (kararlılık için).
    return this.powered ? supply > this.spec.supplyMin - 0.05 : supply >= this.spec.supplyMin;
  }

  /** Giriş eşikleri (V_IL, V_IH) beslemeye göre. */
  thresholdsAt(vcc: number): { readonly vil: number; readonly vih: number } {
    const t = this.spec.thresholds;
    return {
      vil: lerp(
        vcc,
        t.map(([v, il]) => [v, il] as const),
      ),
      vih: lerp(
        vcc,
        t.map(([v, , ih]) => [v, ih] as const),
      ),
    };
  }

  /** Girişin ortadaki karar eşiği (şu anki seviyesine göre histerezisli). */
  private threshold(vcc: number, level: number): number {
    const { vil, vih } = this.thresholdsAt(vcc);
    const mid = (vil + vih) / 2;
    const h = HYSTERESIS * (vih - vil);
    return level === 1 ? mid - h : mid + h;
  }

  private marginsAt(x: Float64Array): number[] {
    const vcc = Math.max(this.supplyAt(x), this.spec.supplyMin);
    const gnd = this.v(x, this.layout.gnd);
    return this.layout.inputs.map((pin, i) => this.v(x, pin) - gnd - this.threshold(vcc, this.levels[i]!));
  }

  /** Girişlerin x'teki seviyesi (önceki seviyelerden histerezisle). */
  private levelsAt(x: Float64Array): number[] {
    return this.marginsAt(x).map((m, i) => (this.levels[i] === 1 ? (m < 0 ? 0 : 1) : m > 0 ? 1 : 0));
  }

  override connectPins(connected: readonly boolean[]): void {
    this.connected = connected;
  }

  override drivenPins(same: (a: number, b: number) => boolean): void {
    const { vcc, gnd } = this.layout;
    this.driven = this.nodes.map((node) => same(node, this.nodes[gnd]!) || same(node, this.nodes[vcc]!));
  }

  private setSupply(vcc: number): void {
    if (Math.abs(vcc - this.supplyNominal) < 1e-3) return;
    this.supplyNominal = vcc;
    this.highCurve = curveAt(this.stage.high, vcc);
    this.lowCurve = curveAt(this.stage.low, vcc);
  }

  private inputLoad(i: number): number {
    return this.extras.inputLoad?.[i] ?? 1;
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    this.lastH = ctx.h;
    if (!this.powered) return;
    const vcc = this.nodes[this.layout.vcc]!;
    const gnd = this.nodes[this.layout.gnd]!;
    this.layout.outputs.forEach((pin, i) => {
      const out = this.nodes[pin]!;
      if (this.outs[i] === 1) {
        // Çıkıştan dışarı: g · (V_CC − V_çıkış) + i0.
        const { g, i0 } = linearize(this.highCurve, this.iterOut[i]!);
        if (g > 0) sys.conductance(out, vcc, g);
        if (i0 !== 0) sys.currentSource(vcc, out, i0);
      } else {
        // Çıkıştan içeri: g · (V_çıkış − GND) + i0.
        const { g, i0 } = linearize(this.lowCurve, this.iterOut[i]!);
        if (g > 0) sys.conductance(out, gnd, g);
        if (i0 !== 0) sys.currentSource(out, gnd, i0);
      }
    });
    const ttl = this.spec.ttlInput;
    if (ttl) {
      // 74LS girişi: 2,7 V'un altında ve üstünde iki doğru (Newton'da bulunduğu parçanın doğrusu).
      this.layout.inputs.forEach((pin, i) => {
        const node = this.nodes[pin]!;
        const k = this.inputLoad(i);
        if (this.iterIn[i]! < ttl.vKnee) {
          sys.conductance(node, gnd, k * ttl.g);
          sys.currentSource(node, gnd, -k * ttl.g * ttl.v0);
        } else {
          const iKnee = ttl.g * (ttl.vKnee - ttl.v0);
          sys.conductance(node, gnd, k * ttl.gHigh);
          sys.currentSource(node, gnd, k * (iKnee - ttl.gHigh * ttl.vKnee));
        }
      });
    }
    const icc = this.iccConductance();
    if (icc > 0) sys.conductance(vcc, gnd, icc);
  }

  /** 74LS besleme akımının iletkenliği: çıkışların 1 / 0 oranına göre I_CCH ile I_CCL arası, 5,25 V'ta. */
  private iccConductance(): number {
    const icc = this.extras.icc;
    if (!icc || !this.powered) return 0;
    const high = this.outs.filter((o) => o === 1).length / Math.max(1, this.outs.length);
    return (high * icc.high + (1 - high) * icc.low) / 5.25;
  }

  /** Çıkışın eğri gerilimi: 1'de V_CC − V_çıkış, 0'da V_çıkış − GND. */
  private outVoltage(x: Float64Array, i: number): number {
    const pin = this.layout.outputs[i]!;
    return this.outs[i] === 1 ? this.v(x, this.layout.vcc) - this.v(x, pin) : this.v(x, pin) - this.v(x, this.layout.gnd);
  }

  override updateIterate(x: Float64Array): boolean {
    if (!this.powered) return true;
    let converged = true;
    this.layout.outputs.forEach((_, i) => {
      const v = this.outVoltage(x, i);
      const curve = this.outs[i] === 1 ? this.highCurve : this.lowCurve;
      if (segmentAt(curve, v) !== segmentAt(curve, this.iterOut[i]!)) converged = false;
      this.iterOut[i] = v;
    });
    const ttl = this.spec.ttlInput;
    if (ttl) {
      const gnd = this.v(x, this.layout.gnd);
      this.layout.inputs.forEach((pin, i) => {
        const v = this.v(x, pin) - gnd;
        if (v < ttl.vKnee !== this.iterIn[i]! < ttl.vKnee) converged = false;
        this.iterIn[i] = v;
      });
    }
    return converged;
  }

  override restoreIterate(): void {
    this.iterOut = [...this.savedOut];
    this.iterIn = [...this.savedIn];
  }

  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    if (!this.powered) return [];
    const { vcc, gnd, outputs, inputs } = this.layout;
    const groups: Array<readonly number[]> = outputs.map((pin, i) => [this.nodes[pin]!, this.nodes[this.outs[i] === 1 ? vcc : gnd]!]);
    if (this.spec.ttlInput) groups.push(...inputs.map((pin) => [this.nodes[pin]!, this.nodes[gnd]!]));
    if (this.extras.icc) groups.push([this.nodes[vcc]!, this.nodes[gnd]!]);
    return groups;
  }

  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [[...this.nodes]];
  }

  override eventFraction(x: Float64Array): number | null {
    if (!this.powered) return this.poweredAt(x) ? 0 : null;
    if (!this.poweredAt(x)) return 0;
    const now = this.marginsAt(x);
    let best = Number.POSITIVE_INFINITY;
    now.forEach((m, i) => {
      const flips = this.levels[i] === 1 ? m < 0 : m > 0;
      if (!flips) return;
      const before = this.margins[i]!;
      const crossed = this.levels[i] === 1 ? before < 0 : before > 0;
      best = Math.min(best, crossed ? 0 : Math.abs(before) / (Math.abs(before) + Math.abs(m)));
    });
    return Number.isFinite(best) ? best : null;
  }

  override switchState(x: Float64Array): boolean {
    const powered = this.poweredAt(x);
    if (powered !== this.powered) {
      this.powered = powered;
      this.pending.clear();
      if (powered) {
        this.setSupply(Math.max(this.supplyAt(x), this.spec.supplyMin));
        this.resetState();
        this.levels = this.layout.inputs.map(() => 0);
        this.levels = this.levelsAt(x);
        this.settle(x);
      }
      return true;
    }
    // Doğru akım çözümünde (h = 0) çıkışlar gecikmesiz uyar (kenar sayılmaz); geçici çözümde adım
    // kabul edilince (accept).
    if (this.lastH === 0 && powered) return this.settle(x);
    return false;
  }

  /** Doğru akım çözümünde art arda kaç kez çıkış değişti (geri beslemeli devrede salınımı kesmek için). */
  private dcSettles = 0;

  /**
   * Girişleri okuyup çıkışları hemen (gecikmesiz, kenar saymadan) uydurur; değiştiyse true. Doğru akım
   * çözümünde çıkışlar art arda ikiden çok kez değişirse (NAND mandalı gibi geri besleme) her seferinde
   * yalnızca ilk farklı çıkış değişir: devre gerçekteki gibi kararlı durumlardan birine düşer.
   */
  private settle(x: Float64Array): boolean {
    const levels = this.levelsAt(x);
    const outs = this.evaluate(levels, levels);
    this.levels = levels;
    this.margins = this.marginsAt(x);
    const differ = outs.flatMap((o, i) => (o !== this.outs[i] ? [i] : []));
    if (differ.length === 0) return false;
    this.dcSettles++;
    if (this.dcSettles > 2) this.outs[differ[0]!] = outs[differ[0]!]!;
    else this.outs = outs;
    return true;
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.outputChanged = false;
    if (!this.powered) {
      this.margins = this.marginsAt(x);
      this.savedOut = [...this.iterOut];
      this.savedIn = [...this.iterIn];
      return;
    }
    this.setSupply(Math.max(this.supplyAt(x), this.spec.supplyMin));
    this.dcSettles = 0;
    if (ctx.h === 0) {
      this.settle(x);
      this.dcSettles = 0;
    } else {
      // Girişlere göre çıkışların olması gereken seviye: değişen çıkış gecikmeyle planlanır; gecikme
      // dolmadan girişi eski haline dönen değişim iptal (eylemsiz gecikme).
      const levels = this.levelsAt(x);
      const changed = levels.map((l, i) => l !== this.levels[i]);
      const desired = this.evaluate(levels, this.levels);
      this.levels = levels;
      desired.forEach((level, i) => {
        const p = this.pending.get(i);
        if (level === this.outs[i]) {
          if (p) this.pending.delete(i);
        } else if (!p || p.level !== level) {
          this.pending.set(i, { level, time: ctx.time + this.delay(this.supplyNominal, i, level, changed, levels) });
        }
      });
      // Vakti gelen çıkış değişimleri. Aynı anda birden çoğunun vakti geldiyse yalnızca ilki (en küçük
      // indeks) uygulanır, öbürleri 2 ps ertelenir: sonraki çözümde hâlâ gerekiyorsa uygulanır. Böylece
      // iki kapı birbirini aynı anda değiştirmek istediğinde (NAND mandalı) devre sonsuza dek salınmaz.
      let applied = false;
      for (const i of [...this.pending.keys()].sort((a, b) => a - b)) {
        const p = this.pending.get(i)!;
        if (p.time > ctx.time + 1e-15) continue;
        if (applied) {
          p.time = ctx.time + 2e-12;
          continue;
        }
        if (this.outs[i] !== p.level) this.outputChanged = true;
        this.outs[i] = p.level;
        this.pending.delete(i);
        applied = true;
      }
      this.margins = this.marginsAt(x);
    }
    this.savedOut = [...this.iterOut];
    this.savedIn = [...this.iterIn];
  }

  override discontinuity(): boolean {
    return this.outputChanged;
  }

  override nextBreakpoint(after: number): number {
    let next = Number.POSITIVE_INFINITY;
    for (const p of this.pending.values()) next = Math.min(next, Math.max(p.time, after + 2e-12));
    return next;
  }

  override checkLimits(x: Float64Array): boolean {
    if (this.burned) return false;
    const supply = this.supplyAt(x);
    if (supply > this.spec.supplyAbsMax) {
      this.burned = true;
      this.burnSupply = supply;
      this.powered = false;
      this.pending.clear();
      return true;
    }
    return false;
  }

  override repair(): boolean {
    if (!this.burned) return false;
    this.burned = false;
    this.burnSupply = 0;
    return true;
  }

  /** Çıkış bacağından dışarı verilen akım (A; 0'da negatif: çıkış akım çeker). */
  outputCurrent(x: Float64Array, i: number): number {
    if (!this.powered) return 0;
    const v = this.outVoltage(x, i);
    return this.outs[i] === 1 ? curveCurrent(this.highCurve, v) : -curveCurrent(this.lowCurve, v);
  }

  /** 74LS girişine dışarıdan giren akım (A). */
  private inputCurrent(x: Float64Array, i: number): number {
    const ttl = this.spec.ttlInput;
    if (!ttl || !this.powered) return 0;
    const v = this.v(x, this.layout.inputs[i]!) - this.v(x, this.layout.gnd);
    const unit = v < ttl.vKnee ? ttl.g * (v - ttl.v0) : ttl.g * (ttl.vKnee - ttl.v0) + ttl.gHigh * (v - ttl.vKnee);
    return this.inputLoad(i) * unit;
  }

  override pinCurrents(x: Float64Array): number[] {
    const currents = new Array<number>(this.nodes.length).fill(0);
    const { vcc, gnd } = this.layout;
    const icc = this.iccConductance() * this.supplyAt(x);
    let vccCurrent = icc;
    this.layout.outputs.forEach((pin, i) => {
      const out = this.outputCurrent(x, i);
      currents[pin] = -out;
      if (this.outs[i] === 1) vccCurrent += out;
    });
    this.layout.inputs.forEach((pin, i) => (currents[pin] = this.inputCurrent(x, i)));
    currents[vcc] = vccCurrent;
    currents[gnd] = -currents.reduce((s, c, k) => (k === gnd ? s : s + c), 0);
    return currents;
  }

  /** Besleme gerilimi ve entegrenin besleme akımı. */
  measure(x: Float64Array): Measurement {
    const voltage = this.supplyAt(x);
    const current = this.pinCurrents(x)[this.layout.vcc] ?? 0;
    return { voltage, current, power: voltage * current };
  }

  /** Giriş bacağı boşta mı (hiçbir şey sürmüyor)? */
  private floatingInput(pin: number): boolean {
    if (this.connected.length > 0 && !this.connected[pin]) return true;
    return this.driven !== null && !this.driven[pin];
  }

  /** Bacakların durumu: girişte 1 / 0 / belirsiz / boşta, çıkışta sürülen seviye, beslemede gerilim. */
  pinStatuses(x: Float64Array): LogicPinStatus[] {
    const gnd = this.v(x, this.layout.gnd);
    const { vil, vih } = this.thresholdsAt(Math.max(this.supplyAt(x), this.spec.supplyMin));
    return this.nodes.map((_, pin) => {
      const voltage = this.v(x, pin) - gnd;
      if (pin === this.layout.vcc || pin === this.layout.gnd) return { state: 'supply', voltage, output: false };
      const out = this.layout.outputs.indexOf(pin);
      if (out >= 0) return { state: this.powered ? (this.outs[out] === 1 ? 'high' : 'low') : 'off', voltage, output: true };
      if (this.floatingInput(pin)) return { state: 'floating', voltage, output: false };
      const state: PinState = voltage >= vih ? 'high' : voltage <= vil ? 'low' : 'undefined';
      return { state, voltage, output: false };
    });
  }

  override ratingWarnings(x: Float64Array): readonly RatingWarning[] {
    const warnings: RatingWarning[] = [];
    if (this.burned) return warnings;
    const supply = this.supplyAt(x);
    if (!this.supplyConnected() || !this.powered) {
      warnings.push({ code: 'logic-unpowered', params: { supply, min: this.spec.supplyMin } });
      return warnings;
    }
    if (supply > this.spec.supplyMax || supply < this.spec.supplyMin) {
      warnings.push({ code: 'logic-supply-range', params: { supply, min: this.spec.supplyMin, max: this.spec.supplyMax } });
    }
    const pins = this.pinStatuses(x);
    pins.forEach((p, pin) => {
      if (p.output || p.state === 'supply') return;
      // 74LS'nin boştaki girişi 1 okunur (uyarı yok); CMOS girişte uyarı.
      if (p.state === 'floating') {
        if (!this.spec.ttlInput) warnings.push({ code: 'logic-input-floating', params: { pin: pin + 1 } });
      } else if (p.state === 'undefined') {
        const { vil, vih } = this.thresholdsAt(Math.max(supply, this.spec.supplyMin));
        warnings.push({ code: 'logic-input-undefined', params: { pin: pin + 1, voltage: p.voltage, vil, vih } });
      }
    });
    const limit = this.outputCurrentMax;
    if (limit !== null) {
      this.layout.outputs.forEach((pin, i) => {
        const current = Math.abs(this.outputCurrent(x, i));
        if (current > limit) warnings.push({ code: 'pin-overcurrent', params: { pin: pin + 1, current, limit } });
      });
    }
    return warnings;
  }

  override status(x: Float64Array): DeviceStatus {
    return {
      ...(this.burned ? { burned: true } : {}),
      logic: {
        family: this.family,
        model: this.model,
        powered: this.powered,
        supply: this.supplyAt(x),
        pins: this.pinStatuses(x),
        levels: this.pinLevels(),
        ...this.details(),
      },
    };
  }

  /** Alt sınıfın kartta gösterilen iç durumu (flip-flopun Q'su, sayaç, gösterilen rakam). */
  protected details(): { readonly q?: readonly number[]; readonly count?: number; readonly digit?: number | null } {
    return {};
  }

  /** Bacakların mantık seviyesi (giriş: okunan, çıkış: sürülen; besleme ve sürülmeyen çıkış null). */
  private pinLevels(): (number | null)[] {
    const levels: (number | null)[] = this.nodes.map(() => null);
    this.layout.inputs.forEach((pin, i) => (levels[pin] = this.powered ? this.levels[i]! : null));
    this.layout.outputs.forEach((pin, i) => (levels[pin] = this.powered ? this.outs[i]! : null));
    return levels;
  }

  override adoptState(prev: Device): void {
    if (prev instanceof LogicIcDevice && prev.type === this.type && prev.family === this.family) {
      this.levels = [...prev.levels];
      this.outs = [...prev.outs];
      this.margins = [...prev.margins];
      this.powered = prev.powered;
      this.burned = prev.burned;
      this.burnSupply = prev.burnSupply;
      this.setSupply(prev.supplyNominal);
      this.pending = new Map(prev.pending);
      this.iterOut = [...prev.iterOut];
      this.iterIn = [...prev.iterIn];
      this.savedOut = [...prev.savedOut];
      this.savedIn = [...prev.savedIn];
      this.adoptLogic(prev);
    }
  }

  /** Alt sınıfın iç durumu (flip-flop, sayaç, mandal) devralınır. */
  protected adoptLogic(_prev: LogicIcDevice): void {}
}

// --- Kapı entegreleri -------------------------------------------------------------------------------------

/**
 * Kapıların yayılma gecikmesi (s, tipik). 74HC: t_pd (t_PLH ile t_PHL'nin büyüğü; C_L = 50 pF),
 * V_CC = 2 / 4,5 / 6 V'ta (HC00, HC02, HC04: 45 / 9 / 8 ns; HC08, HC32: 50 / 10 / 8 ns; HC86: 40 / 12 /
 * 10 ns). 74LS (V_CC = 5 V, R_L = 2 kΩ, C_L = 15 pF): t_PLH / t_PHL (LS00 9 / 10, LS02 10 / 10, LS04
 * 9 / 10, LS08 8 / 10, LS32 14 / 14 ns; LS86A öbür giriş 0 iken 12 / 10, 1 iken 20 / 13 ns).
 */
const HC_TPD: Readonly<Record<GateChipType, ReadonlyArray<readonly [number, number]>>> = {
  ic7400: [[2, 45e-9], [4.5, 9e-9], [6, 8e-9]],
  ic7402: [[2, 45e-9], [4.5, 9e-9], [6, 8e-9]],
  ic7404: [[2, 45e-9], [4.5, 9e-9], [6, 8e-9]],
  ic7408: [[2, 50e-9], [4.5, 10e-9], [6, 8e-9]],
  ic7432: [[2, 50e-9], [4.5, 10e-9], [6, 8e-9]],
  ic7486: [[2, 40e-9], [4.5, 12e-9], [6, 10e-9]],
};
const LS_TPD: Readonly<Record<GateChipType, { readonly lh: number; readonly hl: number; readonly lhOtherHigh?: number; readonly hlOtherHigh?: number }>> = {
  ic7400: { lh: 9e-9, hl: 10e-9 },
  ic7402: { lh: 10e-9, hl: 10e-9 },
  ic7404: { lh: 9e-9, hl: 10e-9 },
  ic7408: { lh: 8e-9, hl: 10e-9 },
  ic7432: { lh: 14e-9, hl: 14e-9 },
  ic7486: { lh: 12e-9, hl: 10e-9, lhOtherHigh: 20e-9, hlOtherHigh: 13e-9 },
};

/**
 * 74LS besleme akımı (V_CC = 5,25 V, tipik): LS00 I_CCH 0,8 / I_CCL 2,4 mA, LS02 1,6 / 2,8, LS04
 * 1,2 / 3,6, LS08 2,4 / 4,4, LS32 3,1 / 4,9 mA; LS86A I_CC 6,1 mA (girişler toprakta); LS74A 4 mA.
 */
const LS_ICC: Readonly<Record<GateChipType, { readonly high: number; readonly low: number }>> = {
  ic7400: { high: 0.8e-3, low: 2.4e-3 },
  ic7402: { high: 1.6e-3, low: 2.8e-3 },
  ic7404: { high: 1.2e-3, low: 3.6e-3 },
  ic7408: { high: 2.4e-3, low: 4.4e-3 },
  ic7432: { high: 3.1e-3, low: 4.9e-3 },
  ic7486: { high: 6.1e-3, low: 6.1e-3 },
};

function lsExtras(type: GateChipType, model: string): ChipExtras {
  if (logicFamily(model) !== 'LS') return {};
  const inputs = LOGIC_CHIPS[type].inputs;
  // LS86A'nın bütün girişleri, LS74A'nın PRĒ ve CLR̄'si iki birim yük (I_IL −0,8 mA, I_IH 40 µA).
  const double = type === 'ic7486' ? inputs : [];
  return {
    icc: LS_ICC[type],
    inputLoad: inputs.map((p) => (double.includes(p) ? 2 : 1)),
    ...(type === 'ic7404' ? { output: { low: LS04_LOW } } : {}),
  };
}

function modelOf(init: DeviceInit, models: readonly string[]): string {
  return strProp(init.props, 'model', models, models[0]!);
}

export class GateIcDevice extends LogicIcDevice {
  readonly type: GateChipType;

  constructor(init: DeviceInit, type: GateChipType) {
    const model = modelOf(init, gateModels(type));
    super(init, type, model, lsExtras(type, model));
    this.type = type;
  }

  protected evaluate(levels: readonly number[]): number[] {
    const chip = GATE_CHIPS[this.type];
    let k = 0;
    return chip.gates.map((g) => gateOutput(chip.kind, g.inputs.map(() => levels[k++]!)));
  }

  protected delay(vcc: number, out: number, level: number, changed: readonly boolean[], levels: readonly number[]): number {
    if (this.family !== 'LS') return lerp(vcc, HC_TPD[this.type]);
    const d = LS_TPD[this.type];
    if (d.lhOtherHigh !== undefined && d.hlOtherHigh !== undefined) {
      // 74LS86A: gecikme öbür girişin seviyesine göre (değişmeyen giriş; ikisi birden değiştiyse 0 sayılır).
      const a = out * 2;
      const other = changed[a] && !changed[a + 1] ? levels[a + 1] : !changed[a] && changed[a + 1] ? levels[a] : 0;
      if (other === 1) return level === 1 ? d.lhOtherHigh : d.hlOtherHigh;
    }
    return level === 1 ? d.lh : d.hl;
  }
}

/** Entegrenin model seçenekleri (katalog). */
export function logicModels(type: LogicChipType): readonly string[] {
  return gateModels(type);
}

function model(type: LogicChipType, create: (init: DeviceInit) => Device): DeviceModel {
  return { type, pinCount: LOGIC_CHIPS[type].names.length, internalNodes: 0, branchCount: 0, create };
}

export const LOGIC_IC_MODELS: Readonly<Record<LogicChipType, DeviceModel>> = {
  ic7400: model('ic7400', (init) => new GateIcDevice(init, 'ic7400')),
  ic7402: model('ic7402', (init) => new GateIcDevice(init, 'ic7402')),
  ic7404: model('ic7404', (init) => new GateIcDevice(init, 'ic7404')),
  ic7408: model('ic7408', (init) => new GateIcDevice(init, 'ic7408')),
  ic7432: model('ic7432', (init) => new GateIcDevice(init, 'ic7432')),
  ic7486: model('ic7486', (init) => new GateIcDevice(init, 'ic7486')),
};
