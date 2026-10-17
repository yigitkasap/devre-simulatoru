// Tüm bileşen modellerinin ortak arayüzü.
//
// Bir zaman adımı şöyle çözülür:
//   1. stampStatic   — adım boyunca değişmeyen katkılar (dirençler, kaynaklar, kondansatörün C/h'si).
//                      Doğrusal devrelerde bu matris aynı h için bir kez LU ayrıştırılır.
//   2. stampStep     — her adımda değişen sağ taraf katkıları (kondansatörün Ieq'su).
//   3. stampNonlinear — Newton-Raphson iterasyonuna bağlı katkılar (diyot, LED, transistörler;
//                      yük depolayan modellerde eklem kapasitelerinin geri Euler katkısı da).
//   4. updateIterate — NR çözümünden sonra eklem gerilimlerini sınırla/güncelle.
//   5. accept        — adım kabul edilince durumu kaydet (kondansatör gerilimi vb.).
//   6. observe       — adım kabul edildikten sonra ölçüm kaydı (osiloskop). Kondansatörsüz ve AC
//                      kaynaksız (zamandan bağımsız) devrede her ilerletmede bir kez çağrılır.
//
// İntegrasyon: kondansatör, bobin ve eklem yükleri yamuk (trapez) kuralıyla integre edilir; ilk
// adımda ve süreksizliklerden (kare dalga kenarı, anahtar, değer değişimi) sonraki adımda geri
// Euler (StepContext.trap = false). Ayrıntı ve gerekçe: README, "Fizik 4".

import type { DiagnosticCode } from '../diagnostics';
import { MnaSystem, nodeVoltage } from '../mna';
import type { DeviceType, Props } from '../netlist';

export interface StepContext {
  /** Zaman adımı h (s). Kondansatörsüz devrelerde (DC çözüm) 0. */
  readonly h: number;
  /**
   * Yamuk kuralı mı (ikinci dereceden)? false: geri Euler (birinci dereceden; ilk adım ve
   * süreksizliklerden sonraki adım). DC çözümde anlamsız.
   */
  readonly trap: boolean;
  /** Bağımsız kaynakların ölçeği (0..1). Yalnızca "kaynak adımlama" yedeğinde 1'den küçüktür. */
  readonly sourceScale: number;
  /** Çözülen anın simülasyon zamanı (s): adımın sonu, DC çözümde şu an. */
  readonly time: number;
  /**
   * Kaynakların değerlendirildiği an. Adım bir kırılma noktasında (kare dalga kenarı) bitiyorsa
   * kenarın hemen öncesi (sol limit): kenar bir sonraki adımın başında olur. Verilmezse `time`.
   */
  readonly sourceTime?: number;
  /**
   * Ölçü aletlerinin ortalama/etkin değer penceresi (s): devredeki AC kaynakların en uzun
   * periyodu. AC kaynak yoksa 0 (ölçü aletleri anlık değeri gösterir).
   */
  readonly window: number;
}

export interface Measurement {
  /** Pin 0 ile pin 1 arasındaki gerilim: v(pin0) − v(pin1) (V). */
  readonly voltage: number;
  /** Pin 0'dan girip bileşenin içinden pin 1'e akan akım (A). */
  readonly current: number;
  /** Bileşenin harcadığı güç P = V·I (W). Negatifse bileşen güç veriyordur (ör. pil). */
  readonly power: number;
}

export interface DeviceStatus {
  /** Pil: dış yük iç dirençten küçük (kısa devre). */
  readonly shortCircuit?: boolean;
  /** LED: mutlak en büyük akım aşıldı, LED yandı. */
  readonly burned?: boolean;
  /** LED: yandığı andaki akım (A). */
  readonly burnCurrent?: number;
  /** LED: akım nominal değerin (20 mA) üstünde ama henüz yanmadı. */
  readonly overCurrent?: boolean;
  /** LED: 0..1 arası, gamma düzeltmeli parlaklık. */
  readonly brightness?: number;
  /** Ölçü aleti: ekrandaki değer (DC kipinde ortalama, AC kipinde etkin değer). */
  readonly reading?: number;
  /** Transistör: çalışma bölgesi. */
  readonly region?: TransistorRegion;
  /** Zener diyot: kırılma bölgesinde (ters yönde iletimde). */
  readonly breakdown?: boolean;
  /** Transistör: kontrol gerilimi (V_BE ya da V_GS) ve kontrol akımı (I_B ya da I_G). */
  readonly control?: { readonly voltage: number; readonly current: number };
  /** DC güç kaynağı: hangi çıkışlar akım sınırında (CC). */
  readonly currentLimited?: readonly boolean[];
  /** DC güç kaynağı: çıkışların uç gerilimi ve verdiği akım. */
  readonly outputs?: ReadonlyArray<{ readonly voltage: number; readonly current: number }>;
  /** Su haznesi: su seviyesi (%). */
  readonly level?: number;
  /**
   * DC motor: açısal hız (rad/s), zıt EMK (V), motor torku k·i (N·m), yüke verilen mekanik güç (W)
   * ve sargının ısınması (ortalama bakır kaybının sürekli çalışma sınırına oranı).
   */
  readonly motor?: {
    readonly speed: number;
    readonly backEmf: number;
    readonly torque: number;
    readonly loadPower: number;
    readonly heating: number;
  };
  /** Röle: palet çekili mi (NA kontağı kapalı)? */
  readonly energized?: boolean;
  /** Potansiyometre: sürgünün 3. uca göre gerilimi ve iki bölümün direnci. */
  readonly wiper?: { readonly voltage: number; readonly r12: number; readonly r23: number };
  /** LDR, NTC, lamba: şu anki direnç (Ω). */
  readonly resistance?: number;
  /** NTC, lamba: sıcaklık (K); NTC'de ortam sıcaklığı da. */
  readonly temperature?: number;
  readonly ambient?: number;
  /** Hoparlör: ortalama elektrik gücü (W). Hoparlör ve buzzer: ses basıncı düzeyi (dB). */
  readonly averagePower?: number;
  readonly spl?: number;
  /** Buzzer: osilatör çalışıyor (ötüyor). */
  readonly sounding?: boolean;
  /**
   * İşlemsel yükselteç: giriş farkı v₊ − v₋, çıkış gerilimi ve akımı, çalışma durumu (doğrusal,
   * pozitif/negatif doyum, eğim sınırı, akım sınırı).
   */
  readonly opamp?: {
    readonly differential: number;
    readonly output: number;
    readonly current: number;
    readonly mode: 'linear' | 'high' | 'low' | 'slewing' | 'limited';
  };
  /** 555: çıkış yüksek mi, çıkış, eşik ve tetik girişlerinin gerilimi, iç eşikler (2/3 ve 1/3 V_CC). */
  readonly timer?: {
    readonly high: boolean;
    readonly output: number;
    readonly threshold: number;
    readonly trigger: number;
    readonly upper: number;
    readonly lower: number;
  };
  /** Sigorta: telin ısınması (1'de erir). */
  readonly heating?: number;
  /** Lamba: ışık akısının anma değerine oranı. */
  readonly glow?: number;
  /** Röle: kapalı kontaktan (C'den kapalı uca) geçen akım. */
  readonly contactCurrent?: number;
  /** Röle: sargının uç gerilimi ve akımı. */
  readonly coil?: { readonly voltage: number; readonly current: number };
  /** Transformatör: birincil ve ikincil sargının uç gerilimi ve akımı (ikincilde yüke verilen). */
  readonly windings?: ReadonlyArray<{ readonly voltage: number; readonly current: number }>;
  /** Su haznesi: ıslak problar (ortak, Seviye 1, 2, 3). */
  readonly wetProbes?: readonly boolean[];
  /** Su haznesi: her probdan suya akan akım (A; probdan çıkıp suya giren pozitif). */
  readonly probeCurrents?: readonly number[];
  /** Su haznesi: elektrolize harcanan gerilim (bir anot ile bir katodun arayüz gerilimleri toplamı, V). */
  readonly polarization?: number;
  /** Direnç: harcanan gücün (AC'de bir periyodun ortalaması) güç sınırına oranı. */
  readonly powerRatio?: number;
}

/** Gerçek parçanın sınırı aşıldı (Fizik 5): uyarı kodu ve ayrıntıları (gerilim, güç, sınır). */
export interface RatingWarning {
  readonly code: Extract<DiagnosticCode, 'reverse-voltage' | 'resistor-overpower' | 'capacitor-reverse' | 'motor-overload'>;
  readonly params: Readonly<Record<string, number>>;
}

/** Transistörün çalışma bölgesi: BJT'de kesim/aktif/doyum, FET'te kesim/omik (doğrusal)/doyum. */
export type TransistorRegion = 'cutoff' | 'active' | 'saturation' | 'ohmic';

export interface DeviceInit {
  readonly id: string;
  readonly props: Props;
  /** Önce pin düğümleri, ardından iç düğümler (bilinmeyen indeksi; −1 = toprak). */
  readonly nodes: readonly number[];
  /** Akım bilinmeyenlerinin satırları. */
  readonly branches: readonly number[];
}

export abstract class Device {
  abstract readonly type: DeviceType;
  readonly id: string;
  readonly props: Props;
  readonly nodes: readonly number[];
  readonly branches: readonly number[];

  constructor(init: DeviceInit) {
    this.id = init.id;
    this.props = init.props;
    this.nodes = init.nodes;
    this.branches = init.branches;
  }

  /** Newton-Raphson gerektiren doğrusal olmayan bir bileşen mi? */
  get nonlinear(): boolean {
    return false;
  }

  /** Zamana bağlı (enerji depolayan) bir bileşen mi? */
  get reactive(): boolean {
    return false;
  }

  /** Değeri zamanla değişen bir kaynak mı (AC kaynak)? Devre o zaman adım adım çözülür. */
  get timeVarying(): boolean {
    return false;
  }

  /** Zamanla değişen kaynağın periyodu (s); öbür bileşenlerde 0. */
  get period(): number {
    return 0;
  }

  /** Kaynağın tepe gerilimi (kablo renk ölçeği için); kaynak olmayanlarda 0. */
  get peakVoltage(): number {
    return 0;
  }

  stampStatic(_sys: MnaSystem, _ctx: StepContext): void {}
  stampStep(_sys: MnaSystem, _ctx: StepContext): void {}
  /** NR iterasyonu katkısı; yük depolayan eklemler (diyot, transistör kapasiteleri) ctx.h'yi kullanır. */
  stampNonlinear(_sys: MnaSystem, _ctx: StepContext): void {}

  /** NR çözümünden sonra çağrılır. Bu bileşen yakınsadıysa true döner. */
  updateIterate(_x: Float64Array): boolean {
    return true;
  }

  /** Başarısız bir adım denemesinden sonra NR durumunu son kabul edilen adıma döndürür. */
  restoreIterate(): void {}

  /** Adım kabul edildi: durumu kaydet. */
  accept(_x: Float64Array, _ctx: StepContext): void {}

  /** Kabul edilen çözümü `time` anının ölçümü olarak kaydet (osiloskop). */
  observe(_x: Float64Array, _time: number): void {}

  /** Akım sınırı aşıldıysa durumu değiştirir (ör. LED yanar) ve true döner. */
  checkLimits(_x: Float64Array): boolean {
    return false;
  }

  /** Durumu bir eşiğin aşılmasıyla değişen bileşen mi (röle)? */
  get switching(): boolean {
    return false;
  }

  /**
   * Bu adımın çözümünde bir eşik aşılıyorsa, geçişin adımın hangi kesrinde olduğu (son kabul edilen
   * adımdan doğrusal aradeğerle, 0..1); aşılmıyorsa null. Motor adımı geçişin hemen sonrasına
   * kısaltır (EVENT_RESOLUTION), sonra switchState çağrılır.
   */
  eventFraction(_x: Float64Array): number | null {
    return null;
  }

  /** Eşik aşıldıysa durumu değiştirir (röle çeker ya da bırakır) ve true döner. */
  switchState(_x: Float64Array): boolean {
    return false;
  }

  /**
   * Veri sayfası sınırları aşıldı mı (ters gerilim, güç)? Yalnızca uyarıdır; bileşenin davranışı
   * değişmez. AC devrede bir periyotluk pencerenin tepe ya da ortalama değerine bakılır.
   */
  ratingWarnings(_x: Float64Array): readonly RatingWarning[] {
    return [];
  }

  /**
   * Yerel kesme hatası (LTE) denetlenen durum değişkenleri: her biri x[a] − x[b] (bilinmeyen
   * indeksleri; −1 = toprak). Kondansatör ve eklem gerilimleri, bobin akımı. Bunlar süreksizlikte
   * de süreklidir; kaynak düğümleri gibi sıçrayabilen büyüklükler buraya girmez.
   */
  lteStates(): ReadonlyArray<readonly [number, number]> {
    return [];
  }

  /**
   * `after` anından (kesin olarak) sonraki ilk süreksizlik: kare dalganın kenarı, üçgenin köşesi.
   * Zaman adımı tam bu ana denk getirilir, ardından geri Euler adımı atılır. Yoksa sonsuz.
   */
  nextBreakpoint(_after: number): number {
    return Number.POSITIVE_INFINITY;
  }

  /**
   * Hangi uçların devrede başka bir şeye bağlı olduğu (derlemeden sonra bir kez). Kullanılmayan
   * çıkışın (ör. fonksiyon üretecinin TTL'si) kenarları kırılma noktası sayılmasın diye.
   */
  connectPins(_connected: readonly boolean[]): void {}

  /**
   * İletken yollar: bu bileşenin içinden akımın akabildiği düğüm grupları (pinler ve iç düğümler;
   * −1 = toprak). Bir gruptaki düğümler bu bileşen üzerinden birbirine bağlıdır. Motor, referansa
   * hiçbir iletken yolu olmayan düğümlere gmin ekler (engine.ts). `transient`: geçici çözüm (h > 0);
   * kondansatör ve kapasiteler yalnızca o zaman iletir. Varsayılan: bütün düğümler tek grup.
   * Emin olunamayan bir yol (değeri sıfıra inebilen iletkenlik) burada sayılmamalıdır: fazladan gmin
   * zararsızdır, eksik gmin matrisi tekil yapar.
   */
  conductiveGroups(_transient: boolean): ReadonlyArray<readonly number[]> {
    return [this.nodes];
  }

  /**
   * İletebilecek her yol (akımı tam 0 sayılan uçları bulmak için; fazla saymak güvenlidir).
   * Varsayılan: conductiveGroups. Değeri simülasyon sırasında sıfıra inebilen bir iletkenlik burada
   * sayılır, conductiveGroups'ta sayılmaz (su haznesinin probları).
   */
  possibleGroups(transient: boolean): ReadonlyArray<readonly number[]> {
    return this.conductiveGroups(transient);
  }

  /** Topoloji kontrolü için: bu bileşenin içindeki ideal gerilim dalları (düğüm çiftleri). */
  idealVoltageBranches(): Array<readonly [number, number]> {
    return [];
  }

  abstract measure(x: Float64Array): Measurement;

  /**
   * Her uca dışarıdan giren akım (kablo akımları ve akım noktaları için). İki uçlu bileşenlerde
   * ölçümden türetilir; üç uçlular kendi akımlarını verir.
   */
  pinCurrents(x: Float64Array): number[] {
    const { current } = this.measure(x);
    return [current, -current];
  }

  status(_x: Float64Array): DeviceStatus {
    return {};
  }

  /** Devre yeniden derlendiğinde (ör. değer değişince) önceki örneğin durumunu devralır. */
  adoptState(_prev: Device): void {}

  /** Yanmış bir bileşeni onarır; durum değiştiyse true döner. */
  repair(): boolean {
    return false;
  }

  protected v(x: Float64Array, nodeIndex: number): number {
    return nodeVoltage(x, this.nodes[nodeIndex]!);
  }

  /** İki uçlu bileşenler için ortak ölçüm: V = v0 − v1, P = V·I. */
  protected twoTerminal(x: Float64Array, current: number): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return { voltage, current, power: voltage * current };
  }
}

/**
 * Kapasitif bir dalın (i = dq/dt) zaman adımındaki eşdeğerinin katsayısı k:
 *   geri Euler:  i(n+1) = k·(q(n+1) − q(n)),           k = 1/h
 *   yamuk:       i(n+1) = k·(q(n+1) − q(n)) − i(n),    k = 2/h
 * Doğrusallaştırılmış iletkenlik k·C'dir.
 */
export function chargeScale(ctx: { readonly h: number; readonly trap: boolean }): number {
  return ctx.h > 0 ? (ctx.trap ? 2 : 1) / ctx.h : 0;
}

/**
 * Bir kaynağın kırılma noktaları periyodun sabit kesirlerindeyse (`phases`, 0 ≤ p < 1) `after`
 * anından sonraki ilki. `after` bir kırılma noktasının üstündeyse (yuvarlama payıyla) o atlanır.
 */
export function nextPhaseTime(after: number, frequency: number, phases: readonly number[]): number {
  if (phases.length === 0) return Number.POSITIVE_INFINITY;
  const cycles = after * frequency;
  const base = Math.floor(cycles);
  const slack = 1e-9 * Math.max(1, Math.abs(cycles));
  let best = Number.POSITIVE_INFINITY;
  for (const p of phases) {
    let c = base + p;
    while (c <= cycles + slack) c += 1;
    best = Math.min(best, c);
  }
  return best / frequency;
}

export interface DeviceModel {
  readonly type: DeviceType;
  readonly pinCount: number;
  /** Bileşenin kendine ait iç düğüm sayısı (ör. pilin ideal kaynak ile iç direnci arasındaki düğüm). */
  readonly internalNodes: number;
  /** MNA'ya eklediği akım bilinmeyeni sayısı. */
  readonly branchCount: number;
  /**
   * Şebeke toprağına bağlı uç (laboratuvar cihazlarının kasası/BNC gövdesi): bu uç, devrenin
   * toprağıyla aynı düğümdür. Yoksa null.
   */
  earthPin?(props: Props): number | null;
  /**
   * Sıfır noktası adayı: kaynağın − ucu (pil, AC kaynak, DC güç kaynağının çıkışları, topraksız
   * fonksiyon üretecinin COM'u). Toprağa bağlı olmayan bir adada önce bu uç sıfır noktası seçilir.
   */
  referencePins?(props: Props): readonly number[];
  /**
   * Ada (sıfır noktası) hesabında bu bileşenin içinden birbirine bağlı sayılan pin grupları.
   * Verilmezse bütün pinler tek gruptur. Yalnızca matrise kesinlikle hiçbir şey eklemeyen
   * bağlantılar (açık anahtar, ideal voltmetre, osiloskobun ideal girişi, güç kaynağının birbirinden
   * yalıtılmış çıkışları) grupları ayırır: adayı fazla geniş tutmak güvenlidir, dar tutmak değil.
   */
  couplingPins?(props: Props): ReadonlyArray<readonly number[]>;
  create(init: DeviceInit): Device;
}
