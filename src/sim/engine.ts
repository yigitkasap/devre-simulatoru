// Simülasyon motoru: derlenmiş devreyi zaman içinde ilerletir.
//
// - Kondansatör ve AC kaynak yoksa devre zamandan bağımsızdır: her karede (gerekirse) tek bir DC
//   çözüm yapılır.
// - Kondansatör ya da AC kaynak varsa geri Euler ile h adımlarıyla ilerlenir (varsayılan 50 µs;
//   AC kaynakta en fazla periyodun 1/50'si).
// - Doğrusal olmayan bileşen (diyot, LED) varsa her adım Newton-Raphson ile çözülür. NR
//   yakınsamazsa h yarıya indirilir (en az 1 ns); birkaç başarılı adımdan sonra yeniden büyütülür.
// - Doğrusal devrelerde aynı h için LU ayrıştırması saklanır; adımlar yalnızca ileri/geri
//   yerine koyma kadar sürer.

import { compileNetlist, devicesTouching, netKeysOfNode, type CompiledCircuit } from './compile';
import {
  DEFAULT_TIME_STEP,
  GMIN,
  LTE_ABSTOL_CURRENT,
  LTE_RELTOL,
  LTE_TRTOL,
  LTE_VNTOL,
  MAX_STEP_GROWTH,
  MIN_TIME_STEP,
  NR_ABSTOL,
  NR_MAX_ITERATIONS,
  NR_RELTOL,
  NR_VNTOL,
  START_STEP_FRACTION,
  STEP_GROWTH_AFTER,
} from './constants';
import { hasErrors, type Diagnostic } from './diagnostics';
import {
  AcSourceDevice,
  BatteryDevice,
  CapacitorDevice,
  DEVICE_MODELS,
  InductorDevice,
  LedDevice,
  type Device,
  type DeviceStatus,
  type Measurement,
  type StepContext,
} from './devices';
import { luFactor, luSolve, SingularMatrixError, type LUFactorization } from './lu';
import { GROUND, MnaSystem } from './mna';
import type { Netlist } from './netlist';
import { UnionFind } from './unionFind';

export interface SimulatorOptions {
  /** En büyük (ve başlangıç) zaman adımı (s). */
  readonly timeStep: number;
  /** En küçük zaman adımı (s). */
  readonly minTimeStep: number;
}

export interface AdvanceResult {
  readonly ok: boolean;
  /** Bu çağrıda yapılan zaman adımı sayısı. */
  readonly steps: number;
  /** ok = false ise simülasyonu durduran hata. */
  readonly error?: Diagnostic;
  /** Bu çağrıda yanan LED'lerin kimlikleri. */
  readonly burned: readonly string[];
}

const DEFAULT_OPTIONS: SimulatorOptions = { timeStep: DEFAULT_TIME_STEP, minTimeStep: MIN_TIME_STEP };

/** Kaynak adımlama yedeğinde kullanılan ölçekler (DC çözüm yakınsamazsa). */
const SOURCE_STEPS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * AC kaynaklı devrede en büyük zaman adımı: en kısa periyodun 1/50'si. Osiloskopta düzgün bir
 * dalga ve doğru tepe değerleri için yeterli; 1 kHz'i gerçek zamanda izlemek saniyede 50 000 adım.
 */
const STEPS_PER_PERIOD = 50;
/** Toprak hattı akımı uyarısının eşiği: en az 1 µA ve en büyük kaynak akımının %1'i. */
const GROUND_RETURN_MIN = 1e-6;
const GROUND_RETURN_FRACTION = 0.01;
/** Kare ortalamaları için periyot başına alınan örnek (her adımda değil; hesap yükünü azaltır). */
const AVERAGE_SAMPLES_PER_PERIOD = 25;

export class CircuitSimulator {
  private circuit: CompiledCircuit;
  private readonly options: SimulatorOptions;

  /** Son kabul edilen çözüm. */
  private x: Float64Array;
  private xNew: Float64Array;
  private xIter: Float64Array;

  private staticSys: MnaSystem;
  private stepSys: MnaSystem;
  private iterSys: MnaSystem;
  private staticKey = '';
  private luCache: { key: string; factor: LUFactorization } | null = null;
  private luWork: LUFactorization | undefined;

  /** Matris katkılarını değiştiren her olayda artar (değer değişikliği, LED yanması...). */
  private version = 0;
  /** DC kipte x'in hangi sürüm için çözüldüğü. */
  private solvedVersion = -1;

  /** Simülasyon zamanı (s). */
  time = 0;
  /** Şu anki zaman adımı (s). */
  private h: number;
  /** Bu devre için en büyük zaman adımı (AC kaynağın periyoduna göre küçülür). */
  private maxStep: number;
  /** Ölçü aletlerinin ortalama penceresi: AC kaynakların en uzun periyodu (yoksa 0). */
  private window = 0;
  /**
   * Son advance() çağrısı (bir animasyon karesi) boyunca düğüm gerilimlerinin ve bileşen
   * akımlarının zaman integrali. AC devrede tuvaldeki renkler, akım noktaları ve LED parlaklığı
   * bu ortalamalardan çizilir; anlık değerler kare hızında örneklenince titrerdi.
   */
  private intervalTime = 0;
  /** Son örnekten bu yana geçen süre ve örnekler arası süre (ortalamalar için). */
  private sampleClock = 0;
  private sampleSpacing = 0;
  /** Doğrusal olmayan bileşenler (her adımda yeniden süzülmesin diye). */
  private nonlinearDevices: readonly Device[] = [];
  private xSum: Float64Array;
  /** Bileşen başına uç akımlarının integrali (bileşen sırasıyla). */
  private pinSums: Float64Array[] = [];
  private deviceIndex = new Map<string, number>();
  /** Henüz adımlanmamış simülasyon zamanı. */
  private pending = 0;
  private successStreak = 0;
  /**
   * Kabul edilen son üç çözüm (en yenisi başta) ve zamanları: LTE tahmininde öngörücü (predictor)
   * bu noktalardan geçen polinomdur. Devre değişince sıfırlanır.
   */
  private history: Float64Array[] = [];
  private historyTimes = [0, 0, 0];
  private historyCount = 0;
  /** Bir sonraki adım geri Euler ile mi (başlangıç, süreksizlik, yakınsama sorunu)? */
  private eulerNext = true;
  /** LTE ile denetlenen durum değişkenleri: bileşenlerin lteStates()'i. */
  private lteStates: Array<readonly [number, number]> = [];
  /** Kırılma noktası verebilen bileşenler (zamanla değişen kaynaklar). */
  private breakpointDevices: readonly Device[] = [];
  /** Son adım denemesinin LTE oranı (|LTE|/tolerans; tahmin yapılamadıysa null). */
  private lteRatioLast: number | null = null;
  /** Son adımda bir bileşenin durumu değişti mi (LED yandı): süreksizlik. */
  private limitEvent = false;
  /** gmin düğümleri ve akımı tam 0 olan uçlar hangi sürüm ve çözüm türü için hesaplandı. */
  private topologyKey = '';
  private floating: number[] = [];
  /** Son NR denemesinde yakınsamayan bileşenler. */
  private nonConverged: string[] = [];
  private burnedThisCall: string[] = [];
  /**
   * KCL gereği akımı tam 0 olan uçlar (bileşen kimliği → uç başına): iletken çizgide köprü olan
   * kenarlar. Çözümün yuvarlama artığı (≈ 1e-15 A) yerine tam 0 gösterilir (bkz. findZeroPins).
   */
  private zeroPins = new Map<string, readonly boolean[]>();
  /**
   * Toprak noktaları: toprak sembolü ya da topraklı cihaz COM'u içeren kablo adaları (toprak
   * birleştirmesinden önce). Her noktadan toprak hattına geçen akım, o adadaki bileşen uçlarının
   * akımlarından KCL ile bulunur. `pins`: adadaki uçlar (bileşen sırası, uç).
   */
  private groundPoints: Array<{ readonly ids: string[]; readonly pins: Array<readonly [number, number]> }> = [];
  /**
   * AC devrede tepe değerler (işaretli): toprak noktası akımları ve en büyük kaynak akımı. Bir AC
   * periyodu (window) boyunca tutulur, sonra bir öncekine kaydırılır; gösterilen değer ikisinin
   * büyüğüdür (kare süresinden bağımsız, sıfır geçişinde yanıp sönmez).
   */
  private earthPeaks = new Float64Array(0);
  private earthPrev = new Float64Array(0);
  private sourcePeak = 0;
  private sourcePrev = 0;
  /** Osiloskop girişlerinden geçen akımların toplamı (tepe). */
  private scopePeak = 0;
  private scopePrev = 0;
  private peakClock = 0;
  /** Tepe değerler için en az bir örnek alındı mı (alınmadıysa anlık değer kullanılır). */
  private peaksReady = false;

  constructor(netlist: Netlist, options: Partial<SimulatorOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.h = this.options.timeStep;
    this.maxStep = this.options.timeStep;
    this.circuit = compileNetlist(netlist);
    const n = this.circuit.size;
    this.x = new Float64Array(n);
    this.xNew = new Float64Array(n);
    this.xIter = new Float64Array(n);
    this.xSum = new Float64Array(n);
    this.staticSys = new MnaSystem(n);
    this.stepSys = new MnaSystem(n);
    this.iterSys = new MnaSystem(n);
    this.history = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
    this.configure();
  }

  /** Devreye göre zaman adımı sınırı, ortalama penceresi ve bileşen sırası. */
  private configure(): void {
    let shortest = Number.POSITIVE_INFINITY;
    let longest = 0;
    for (const device of this.circuit.devices) {
      const period = device.timeVarying ? device.period : 0;
      if (period > 0) {
        shortest = Math.min(shortest, period);
        longest = Math.max(longest, period);
      }
    }
    this.window = longest;
    this.maxStep = Number.isFinite(shortest)
      ? Math.min(this.options.timeStep, shortest / STEPS_PER_PERIOD)
      : this.options.timeStep;
    this.sampleSpacing = Number.isFinite(shortest) ? shortest / AVERAGE_SAMPLES_PER_PERIOD : 0;
    this.nonlinearDevices = this.circuit.devices.filter((d) => d.nonlinear);
    this.connectPins();
    this.lteStates = this.circuit.devices.flatMap((d) => d.lteStates());
    this.breakpointDevices = this.circuit.devices.filter((d) => d.timeVarying);
    // Geçmiş yok: ilk adım geri Euler ve küçük; LTE tahmini birkaç adım sonra devreye girer.
    this.historyCount = 0;
    this.eulerNext = true;
    this.successStreak = 0;
    this.h = this.lteStates.length > 0 ? this.startStep() : this.maxStep;
    this.deviceIndex = new Map(this.circuit.devices.map((d, i) => [d.id, i]));
    this.pinSums = this.circuit.devices.map((d) => new Float64Array(d.pinCurrents(this.x).length));
    this.intervalTime = 0;
    this.groundPoints = this.findGroundPoints();
    this.earthPeaks = new Float64Array(this.groundPoints.length);
    this.earthPrev = new Float64Array(this.groundPoints.length);
    this.sourcePeak = 0;
    this.sourcePrev = 0;
    this.scopePeak = 0;
    this.scopePrev = 0;
    this.peakClock = 0;
    this.peaksReady = false;
  }

  /** Geçmişi olmayan başlangıçtaki adım: en büyük adımın binde biri (en az 1 ns). */
  private startStep(): number {
    return Math.min(this.maxStep, Math.max(this.options.minTimeStep, this.maxStep * START_STEP_FRACTION));
  }

  /** Bileşenlere hangi uçlarının devrede başka bir uca (ya da toprağa) bağlı olduğunu bildirir. */
  private connectPins(): void {
    const uses = new Map<number, number>();
    this.circuit.devices.forEach((device, i) => {
      const pins = this.circuit.netlist.elements[i]!.pins.length;
      for (let k = 0; k < pins; k++) uses.set(device.nodes[k]!, (uses.get(device.nodes[k]!) ?? 0) + 1);
    });
    this.circuit.devices.forEach((device, i) => {
      const pins = this.circuit.netlist.elements[i]!.pins.length;
      device.connectPins(device.nodes.slice(0, pins).map((node) => node === GROUND || (uses.get(node) ?? 0) >= 2));
    });
  }

  /** Toprak sembolü ya da topraklı COM içeren kablo adaları ve o adalardaki bileşen uçları. */
  private findGroundPoints(): Array<{ ids: string[]; pins: Array<readonly [number, number]> }> {
    const { netlist, wiring } = this.circuit;
    const points = new Map<string, { ids: string[]; pins: Array<readonly [number, number]> }>();
    for (const el of netlist.elements) {
      const com = DEVICE_MODELS[el.type].earthPin?.(el.props) ?? null;
      for (const [k, pin] of el.pins.entries()) {
        if (el.type !== 'ground' && k !== com) continue;
        const root = wiring.findKey(pin);
        const point = points.get(root) ?? { ids: [], pins: [] };
        if (!point.ids.includes(el.id)) point.ids.push(el.id);
        points.set(root, point);
      }
    }
    // Osiloskobun giriş akımı (1 MΩ ‖ 25 pF, birkaç µA) cihazın kendi ölçüm akımıdır: toprak hattından
    // dönse de devrenin akımı sayılmaz (yoksa doğru bağlanmış her topraklı prob uyarı verirdi).
    netlist.elements.forEach((el, i) => {
      if (el.type === 'ground' || el.type === 'oscilloscope') return;
      el.pins.forEach((pin, k) => points.get(wiring.findKey(pin))?.pins.push([i, k]));
    });
    return [...points.values()];
  }

  /** Bir toprak noktasından toprak hattına geçen anlık akım (adadaki uçlara giren akımların tersi). */
  private earthCurrent(point: { readonly pins: Array<readonly [number, number]> }): number {
    let sum = 0;
    for (const [i, k] of point.pins) {
      const device = this.circuit.devices[i]!;
      sum += this.maskPins(device.id, device.pinCurrents(this.x))[k] ?? 0;
    }
    return -sum;
  }

  /** Kaynakların (pil, AC kaynak, fonksiyon üreteci, güç kaynağı) en büyük uç akımı. */
  private sourceCurrent(): number {
    let max = 0;
    for (const device of this.circuit.devices) {
      if (device.type !== 'battery' && device.type !== 'acsource' && device.type !== 'funcgen' && device.type !== 'dcsupply') continue;
      for (const c of this.maskPins(device.id, device.pinCurrents(this.x))) max = Math.max(max, Math.abs(c));
    }
    return max;
  }

  /** Osiloskop girişlerinden (A ve B) geçen akımların toplamı: toprak hattından dönen ölçüm akımı. */
  private scopeCurrent(): number {
    let sum = 0;
    for (const device of this.circuit.devices) {
      if (device.type !== 'oscilloscope') continue;
      const c = this.maskPins(device.id, device.pinCurrents(this.x));
      sum += Math.abs(c[0] ?? 0) + Math.abs(c[1] ?? 0);
    }
    return sum;
  }

  /**
   * Toprak noktalarından toprak hattına geçen akımlar (A, işaretli): AC devrede son aralığın tepe
   * değerleri (sıfır geçişinde uyarı yanıp sönmesin), değilse anlık değerler.
   */
  groundLineCurrents(): Array<{ readonly ids: readonly string[]; readonly current: number }> {
    const peaks = this.hasAcSources && this.peaksReady;
    return this.groundPoints.map((point, j) => {
      if (!peaks) return { ids: point.ids, current: this.earthCurrent(point) };
      const a = this.earthPeaks[j]!;
      const b = this.earthPrev[j]!;
      return { ids: point.ids, current: Math.abs(a) >= Math.abs(b) ? a : b };
    });
  }

  // ---------------------------------------------------------------------------
  // Devre ve durum

  /**
   * Devreyi yeni bir netlist ile değiştirir; aynı kimlikli bileşenlerin durumu (kondansatör
   * gerilimi, yanmış LED...) korunur. Simülasyon çalışırken değer değiştirmek için kullanılır.
   */
  update(netlist: Netlist): void {
    const previous = this.circuit;
    this.circuit = compileNetlist(netlist);
    for (const device of this.circuit.devices) {
      const old = previous.deviceById.get(device.id);
      if (old && old.type === device.type) device.adoptState(old);
    }
    const n = this.circuit.size;
    if (n !== previous.size) {
      this.x = new Float64Array(n);
      this.xNew = new Float64Array(n);
      this.xIter = new Float64Array(n);
      this.xSum = new Float64Array(n);
      this.staticSys = new MnaSystem(n);
      this.stepSys = new MnaSystem(n);
      this.iterSys = new MnaSystem(n);
      this.history = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
      this.luWork = undefined;
    }
    this.configure();
    this.invalidate();
  }

  /** Matris katkıları değişti (değer, LED yanması, onarım): süreksizlik, sonraki adım geri Euler. */
  private invalidate(): void {
    this.version++;
    this.nonlinearDevices = this.circuit.devices.filter((d) => d.nonlinear);
    this.staticKey = '';
    this.topologyKey = '';
    this.luCache = null;
    this.eulerNext = true;
  }

  /** Topoloji kontrollerinin sonuçları. */
  get topologyDiagnostics(): readonly Diagnostic[] {
    return this.circuit.diagnostics;
  }

  /** Simülasyon sırasında oluşan uyarılar (kısa devre, yanmış LED). */
  get runtimeDiagnostics(): Diagnostic[] {
    const result: Diagnostic[] = [];
    for (const device of this.circuit.devices) {
      if (device instanceof BatteryDevice && device.isShortCircuited(this.x)) {
        result.push({
          severity: 'warning',
          code: 'short-circuit',
          elementIds: [device.id],
          netKeys: [],
          params: {
            current: Math.abs(device.outputCurrent(this.x)),
            voltage: device.voltage,
            internalResistance: device.internalResistance,
          },
        });
      }
      if (device instanceof AcSourceDevice && device.isShortCircuited(this.x)) {
        result.push({
          severity: 'warning',
          code: 'short-circuit',
          elementIds: [device.id],
          netKeys: [],
          params: {
            current: device.peakOutputCurrent(this.x),
            voltage: device.peakVoltage,
            internalResistance: device.internalResistance,
          },
        });
      }
      if (device instanceof LedDevice && device.burned) {
        result.push({
          severity: 'warning',
          code: 'led-burned',
          elementIds: [device.id],
          netKeys: [],
          params: {
            current: device.burnCurrent,
            maxCurrent: device.params.maxCurrent,
            forwardVoltage: device.params.forwardVoltage,
          },
        });
      }
    }
    // Veri sayfası sınırları (Fizik 5): LED ve 1N4001'in ters gerilimi, direncin gücü,
    // elektrolitik kondansatörün ters gerilimi.
    for (const device of this.circuit.devices) {
      for (const warning of device.ratingWarnings(this.x)) {
        result.push({ severity: 'warning', code: warning.code, elementIds: [device.id], netKeys: [], params: { ...warning.params } });
      }
    }
    // Bobinin akımı aniden kesildi (Lenz): uç gerilimi devredeki kaynakların ve kondansatörlerin
    // başlangıç gerilimlerinin iki katını (en az 20 V) aşıyor.
    const reference = this.referenceVoltage();
    for (const device of this.circuit.devices) {
      if (!(device instanceof InductorDevice)) continue;
      const voltage = device.spikeVoltage();
      if (voltage > Math.max(20, 2 * reference)) {
        result.push({ severity: 'warning', code: 'inductor-spike', elementIds: [device.id], netKeys: [], params: { voltage } });
      }
    }
    const earth = this.groundReturn();
    if (earth) result.push(earth);
    return result;
  }

  /** Devrede kaynakların tepe gerilimi ya da kondansatörlerin başlangıç gerilimi (hangisi büyükse). */
  private referenceVoltage(): number {
    let max = this.maxSourceVoltage();
    for (const device of this.circuit.devices) {
      if (device instanceof CapacitorDevice) max = Math.max(max, Math.abs(Number(device.props.initialVoltage ?? 0)));
    }
    return max;
  }

  /**
   * Akım toprak hattı üzerinden dönüyorsa uyarı. İki ya da daha fazla toprak noktası varsa ve
   * birinden toprak hattına geçen akım eşiği aşıyorsa. Eşik: 1 µA ya da en büyük kaynak akımının
   * %1'i (hangisi büyükse). Topraklı osiloskobun 1 MΩ'luk girişinden geçen birkaç µA'lik akım da
   * toprak hattından döner; bu bir sorun değildir ve kaynak akımının yanında çok küçüktür.
   */
  private groundReturn(): Diagnostic | null {
    if (this.groundPoints.length < 2) return null;
    const currents = this.groundLineCurrents();
    const peaks = this.hasAcSources && this.peaksReady;
    const source = peaks ? Math.max(this.sourcePeak, this.sourcePrev) : this.sourceCurrent();
    const scope = peaks ? Math.max(this.scopePeak, this.scopePrev) : this.scopeCurrent();
    // Osiloskobun giriş akımı da (prob → COM → toprak hattı → başka bir topraklı nokta) buradan döner;
    // onun iki katının altındaki akım bir bağlantı sorunu değildir.
    const threshold = Math.max(GROUND_RETURN_MIN, GROUND_RETURN_FRACTION * source, 2 * scope);
    const significant = currents.filter((c) => Math.abs(c.current) > threshold);
    if (significant.length === 0) return null;
    const max = Math.max(...currents.map((c) => Math.abs(c.current)));
    // Akımın döndüğü öteki nokta(lar) da (eşiğin altında kalsa bile en büyük ikinci) listeye girer.
    const ordered = [...currents].sort((a, b) => Math.abs(b.current) - Math.abs(a.current));
    const involved = new Set([...significant, ...ordered.slice(0, 2)]);
    const elementIds = currents.filter((c) => involved.has(c)).flatMap((c) => c.ids);
    // Kablo adasında toprak sembolü olan nokta şemanın ortak toprak gösterimidir (föydeki devreler de
    // ayrı toprak sembolleriyle çizilir): toprak hattı çizilir, bilgi verilir. Akım, toprak sembolü
    // olmayan, yalnızca topraklı bir cihazın COM'undan oluşan bir noktadan geçiyorsa gerçekten
    // binanın toprak hattından (cihazın kasasından) döner: uyarı (toprak tuzağı).
    const instrumentOnly = significant.some((c) => c.ids.every((id) => this.circuit.deviceById.get(id)?.type !== 'ground'));
    return {
      severity: instrumentOnly ? 'warning' : 'info',
      code: 'ground-return',
      elementIds,
      netKeys: [],
      params: { current: max },
    };
  }

  get diagnostics(): Diagnostic[] {
    return [...this.circuit.diagnostics, ...this.runtimeDiagnostics];
  }

  /** Topolojide hata yoksa simülasyon çalışabilir. */
  get canRun(): boolean {
    return !hasErrors(this.circuit.diagnostics);
  }

  /** Devrede zamana bağlı bileşen (kondansatör, AC kaynak) var mı? */
  get isTransient(): boolean {
    return this.circuit.devices.some((d) => d.reactive || d.timeVarying);
  }

  /** Devrede AC kaynak var mı? */
  get hasAcSources(): boolean {
    return this.window > 0;
  }

  /** Şu anki (bir sonraki denemede kullanılacak) zaman adımı (s). */
  get timeStep(): number {
    return this.h;
  }

  /** Bu devrede zaman adımının üst sınırı (s): 50 µs ya da en kısa AC periyodunun 1/50'si. */
  get maxTimeStep(): number {
    return this.maxStep;
  }

  device(id: string): Device | undefined {
    return this.circuit.deviceById.get(id);
  }

  get devices(): readonly Device[] {
    return this.circuit.devices;
  }

  /** Yanmış bir LED'i onarır. */
  repair(id: string): boolean {
    const device = this.circuit.deviceById.get(id);
    if (!device?.repair()) return false;
    this.invalidate();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Sonuçlar

  /** Bir ağın (pin ya da kablo anahtarı) gerilimi; ağ devrede değilse null. */
  voltageAt(key: string): number | null {
    if (!this.circuit.nets.has(key)) return null;
    const node = this.circuit.nodeOfRoot.get(this.circuit.nets.findKey(key));
    if (node === undefined) return null;
    return node < 0 ? 0 : this.x[node]!;
  }

  /** Bir anahtarın bağlı olduğu elektriksel düğümün kök anahtarı. */
  netOf(key: string): string | null {
    return this.circuit.nets.has(key) ? this.circuit.nets.findKey(key) : null;
  }

  measure(id: string): Measurement | null {
    const device = this.circuit.deviceById.get(id);
    if (!device) return null;
    const m = device.measure(this.x);
    return this.isOpenPath(device) ? { voltage: m.voltage, current: 0, power: 0 } : m;
  }

  status(id: string): DeviceStatus {
    const device = this.circuit.deviceById.get(id);
    if (!device) return {};
    const status = device.status(this.x);
    // Akımı KCL gereği 0 olan ampermetre tam 0 gösterir.
    return device.type === 'ammeter' && this.isOpenPath(device) ? { ...status, reading: 0 } : status;
  }

  /** İki uçlu bir bileşenin içinden akım geçemiyor mu (bir ucu köprü kenarında). */
  private isOpenPath(device: Device): boolean {
    const zero = this.zeroPins.get(device.id);
    return device.nodes.length >= 2 && zero !== undefined && zero.length === 2 && (zero[0]! || zero[1]!);
  }

  private maskPins(id: string, currents: number[]): number[] {
    const zero = this.zeroPins.get(id);
    return zero ? currents.map((c, k) => (zero[k] ? 0 : c)) : currents;
  }

  /** Devredeki en büyük kaynak (tepe) gerilimi (kablo renk ölçeği için). */
  maxSourceVoltage(): number {
    let max = 0;
    for (const d of this.circuit.devices) max = Math.max(max, d.peakVoltage);
    return max;
  }

  /**
   * Son advance() çağrısı boyunca bir ağın ortalama gerilimi; o çağrıda zaman adımı atılmadıysa
   * (DC devre, duraklatılmış simülasyon) anlık değer.
   */
  averageVoltageAt(key: string): number | null {
    if (this.intervalTime <= 0) return this.voltageAt(key);
    if (!this.circuit.nets.has(key)) return null;
    const node = this.circuit.nodeOfRoot.get(this.circuit.nets.findKey(key));
    if (node === undefined) return null;
    return node < 0 ? 0 : this.xSum[node]! / this.intervalTime;
  }

  /** Bir bileşenin uçlarına giren anlık akımlar. */
  pinCurrents(id: string): number[] | null {
    const currents = this.circuit.deviceById.get(id)?.pinCurrents(this.x);
    return currents ? this.maskPins(id, currents) : null;
  }

  /** Son advance() çağrısı boyunca uçlara giren ortalama akımlar (adım atılmadıysa anlık). */
  averagePinCurrents(id: string): number[] | null {
    const index = this.deviceIndex.get(id);
    if (index === undefined) return null;
    if (this.intervalTime <= 0) return this.maskPins(id, this.circuit.devices[index]!.pinCurrents(this.x));
    return this.maskPins(id, Array.from(this.pinSums[index]!, (sum) => sum / this.intervalTime));
  }

  /** Son advance() çağrısı boyunca bir bileşenin (1. ucuna giren) ortalama akımı. */
  averageCurrent(id: string): number | null {
    return this.averagePinCurrents(id)?.[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Zaman ilerletme

  /**
   * Simülasyonu `dt` saniye ilerletir. Zamandan bağımsız devrede yalnızca zamanı ilerletir ve
   * devre değiştiyse yeniden çözer.
   * @param maxSteps Bu çağrıda en fazla kaç adım atılacağı (yavaş bilgisayarda donmayı önler);
   *                 aşılırsa kalan süre atlanır.
   */
  advance(dt: number, maxSteps = Number.POSITIVE_INFINITY): AdvanceResult {
    this.burnedThisCall = [];
    if (!this.canRun) {
      const error = this.circuit.diagnostics.find((d) => d.severity === 'error');
      return { ok: false, steps: 0, burned: [], ...(error ? { error } : {}) };
    }
    this.beginInterval();
    try {
      if (!this.isTransient) {
        this.time += dt;
        const error = this.solvedVersion === this.version ? null : this.solveDC();
        if (!error) this.observe();
        return this.result(0, error);
      }
      return this.advanceTransient(dt, maxSteps, this.exact);
    } catch (e) {
      if (e instanceof SingularMatrixError) return this.result(0, this.singularDiagnostic(e.column));
      throw e;
    }
  }

  /** runUntil: son adım istenen ana tam denk getirilir. */
  private exact = false;

  /** Belirli bir simülasyon zamanına kadar ilerletir; son adım tam o ana denk gelir (testler için). */
  runUntil(time: number): AdvanceResult {
    this.exact = true;
    try {
      return this.advance(Math.max(0, time - this.time - this.pending));
    } finally {
      this.exact = false;
    }
  }

  private result(steps: number, error: Diagnostic | null): AdvanceResult {
    return { ok: error === null, steps, burned: this.burnedThisCall, ...(error ? { error } : {}) };
  }

  /**
   * Geçici çözüm: uyarlanır zaman adımıyla ilerletir (README, "Fizik 4").
   *   - Adım, bir sonraki kırılma noktasına (kare dalga kenarı, üçgenin köşesi) taşmaz; tam üstüne
   *     denk gelir ve o adımda kaynaklar kenarın hemen öncesindeki değeriyle çözülür. Ardından gelen
   *     adım geri Euler'dir (yamuk kuralı süreksizlikte salınım yapabilir).
   *   - Her adımdan sonra durum değişkenlerinin yerel kesme hatası tahmin edilir (lteRatio). Hata
   *     toleransı aşarsa adım reddedilir ve küçültülür; küçükse sonraki adım büyür (en fazla 2 kat,
   *     en büyük adıma kadar).
   *   - Newton-Raphson yakınsamazsa adım yarıya iner ve geri Euler'e dönülür.
   * @param exact son adımı istenen süreye tam denk getir (runUntil).
   */
  private advanceTransient(dt: number, maxSteps: number, exact: boolean): AdvanceResult {
    this.pending += dt;
    const target = this.time + this.pending;
    const minStep = this.options.minTimeStep;
    let steps = 0;
    let attempts = 0;
    for (;;) {
      const tiny = Math.max(1e-15, Math.abs(this.time) * 1e-13);
      const proposed = Math.min(this.h, this.maxStep);
      let end = this.time + proposed;
      let landing = false;
      /** Adım kırılma noktasına ya da hedefe denk gelsin diye kısaltıldı mı? */
      let truncated = false;
      const breakpoint = this.nextBreakpoint();
      if (breakpoint <= end + tiny) {
        end = breakpoint;
        landing = true;
        truncated = true;
      }
      if (exact) {
        if (target - this.time <= tiny) break;
        if (target < end - tiny) {
          end = target;
          landing = false;
          truncated = true;
        }
      } else if (this.pending < (end - this.time) * (1 - 1e-9)) {
        break;
      }
      if (steps >= maxSteps || attempts >= 4 * maxSteps + 64) {
        this.pending = 0;
        break;
      }
      const h = end - this.time;
      if (h <= minStep * 1e-3) {
        // Kırılma noktası (ya da hedef) yuvarlama payı kadar ötede: adım atmaya değmez.
        this.pending -= h;
        this.time = end;
        if (landing) this.eulerNext = true;
        continue;
      }
      attempts++;
      const ctx: StepContext = {
        h,
        // Yamuk kuralı yalnızca hata denetimi yapılabildiğinde (geçmişte üç nokta varken): denetimsiz
        // başlangıç adımlarında sert bir kipte (ör. diyot eklemi) sönmeyen salınım bırakabilir.
        trap: !this.eulerNext && (this.lteStates.length === 0 || this.historyCount >= 3),
        sourceScale: 1,
        time: end,
        window: this.window,
        ...(landing ? { sourceTime: end - h * 1e-3 } : {}),
      };
      // En küçük adımda (ya da daha kısa, kırılma noktasına denk getirilmiş adımda) hata denetlenmez:
      // daha küçültülemez. Karar önerilen adımla verilir (end − time farkının yuvarlaması 1 ns'yi aşabilir).
      const outcome = this.step(ctx, proposed > minStep * (1 + 1e-6) && h > minStep * 0.5);
      if (outcome === 'failed') {
        this.h = h / 2;
        this.eulerNext = true;
        this.successStreak = 0;
        if (this.h < minStep) {
          this.h = this.lteStates.length > 0 ? this.startStep() : this.maxStep;
          return this.result(steps, this.nrFailedDiagnostic());
        }
        continue;
      }
      const order = ctx.trap ? 2 : 1;
      const ratio = this.lteRatioLast;
      if (outcome === 'rejected') {
        // Hata payı aşıldı: adım, tahmini hataya göre küçültülür (en az yarıya, en fazla onda bire).
        this.h = Math.max(minStep, h * Math.min(0.5, Math.max(0.1, 0.9 * ratio! ** (-1 / (order + 1)))));
        continue;
      }
      this.time = end;
      this.pending -= h;
      steps++;
      this.observe();
      this.accumulate(h);
      this.pushHistory();
      this.eulerNext = landing || this.limitEvent;
      if (this.lteStates.length === 0) {
        // Durum değişkeni yok (ör. AC kaynak, direnç, diyot): en büyük adım; yakınsama için
        // küçülmüşse art arda başarılı adımlardan sonra büyür.
        this.successStreak++;
        if (this.h < this.maxStep && this.successStreak >= STEP_GROWTH_AFTER) {
          this.h = Math.min(this.maxStep, this.h * 2);
          this.successStreak = 0;
        }
      } else if (truncated) {
        // Adım kırılma noktasına ya da hedefe denk gelsin diye kısaltıldı: önerilen adım korunur.
        // (Kısaltma, end − time farkıyla değil bayrakla izlenir: o farkın yuvarlama hatası küçük
        // adımlarda 1e-9'u aşar.)
        this.h = proposed;
      } else {
        const growth = ratio === null ? MAX_STEP_GROWTH : Math.min(MAX_STEP_GROWTH, 0.9 * Math.max(ratio, 1e-12) ** (-1 / (order + 1)));
        this.h = Math.min(this.maxStep, Math.max(minStep, h * growth));
      }
    }
    if (this.pending < 0 || exact) this.pending = 0;
    return this.result(steps, null);
  }

  /** Bir sonraki kırılma noktası (şu andan kesin olarak sonra); yoksa sonsuz. */
  private nextBreakpoint(): number {
    let next = Number.POSITIVE_INFINITY;
    for (const device of this.breakpointDevices) next = Math.min(next, device.nextBreakpoint(this.time));
    return next;
  }

  /** Kabul edilen çözümü geçmişe ekler (en yenisi başta). */
  private pushHistory(): void {
    const oldest = this.history[2]!;
    this.history[2] = this.history[1]!;
    this.history[1] = this.history[0]!;
    this.history[0] = oldest;
    oldest.set(this.x);
    this.historyTimes[2] = this.historyTimes[1]!;
    this.historyTimes[1] = this.historyTimes[0]!;
    this.historyTimes[0] = this.time;
    this.historyCount = Math.min(3, this.historyCount + 1);
  }

  /**
   * Yerel kesme hatasının toleransa oranı (en kötü durum değişkeni). Öngörücü-düzeltici tahmini
   * (Milne yöntemi): öngörücü, son p + 1 kabul edilmiş noktadan geçen p. dereceden polinomun yeni
   * ana uzatılmasıdır (p: yöntemin derecesi; yamukta 2, geri Euler'de 1). İkisinin hatası aynı
   * x^(p+1) türeviyle orantılıdır:
   *   düzeltici (çözüm):  yamuk h³/12·x''',  geri Euler h²/2·x''
   *   öngörücü:           x^(p+1)/(p+1)! · Π (t − t_j)
   * Böylece LTE ≈ |x_düzeltici − x_öngörücü| · C_d / (C_d + C_ö). Eşit adımda yamukta 1/13, geri
   * Euler'de 1/3. Kırılma noktasından sonra geçmiş eski eğilimi taşır; tahmin büyük çıkar ve adım
   * küçülür (hızlı geçiş çözülene kadar). Yeterli geçmiş yoksa null.
   */
  private lteRatio(ctx: StepContext): number | null {
    const states = this.lteStates;
    if (states.length === 0) return null;
    const p = ctx.trap ? 2 : 1;
    if (this.historyCount < p + 1) return null;
    const t = this.time + ctx.h;
    const ts = this.historyTimes;
    const weights: number[] = [];
    let spread = 1;
    for (let j = 0; j <= p; j++) {
      let w = 1;
      for (let k = 0; k <= p; k++) if (k !== j) w *= (t - ts[k]!) / (ts[j]! - ts[k]!);
      weights.push(w);
      spread *= t - ts[j]!;
    }
    const predictor = spread / (p === 2 ? 6 : 2);
    const corrector = p === 2 ? ctx.h ** 3 / 12 : ctx.h ** 2 / 2;
    const factor = corrector / (corrector + predictor);
    const nodes = this.circuit.nodeUnknowns;
    const diff = (x: Float64Array, a: number, b: number) => (a === GROUND ? 0 : x[a]!) - (b === GROUND ? 0 : x[b]!);
    let worst = 0;
    for (const [a, b] of states) {
      const corrected = diff(this.xNew, a, b);
      let predicted = 0;
      for (let j = 0; j <= p; j++) predicted += weights[j]! * diff(this.history[j]!, a, b);
      const previous = diff(this.history[0]!, a, b);
      const absolute = a >= nodes && a !== GROUND ? LTE_ABSTOL_CURRENT : LTE_VNTOL;
      const tolerance = LTE_RELTOL * Math.max(Math.abs(corrected), Math.abs(previous)) + absolute;
      worst = Math.max(worst, (factor * Math.abs(corrected - predicted)) / tolerance);
    }
    return worst / LTE_TRTOL;
  }

  /** Yeni bir ilerletme aralığı (animasyon karesi): ortalamalar sıfırlanır. */
  private beginInterval(): void {
    this.intervalTime = 0;
    this.sampleClock = 0;
    this.xSum.fill(0);
    for (const sums of this.pinSums) sums.fill(0);
  }

  /** Kabul edilen çözüm, kayıt tutan bileşenlere (osiloskop) iletilir. */
  private observe(): void {
    for (const device of this.circuit.devices) device.observe(this.x, this.time);
  }

  /**
   * AC devrede aralık ortalamaları için integraller (zamandan bağımsız devrede gereksiz).
   * Her adımda değil, periyot başına ≈ 25 örnekle alınır; her örnek, önceki örnekten bu yana
   * geçen süreyle ağırlıklandırılır.
   */
  private accumulate(h: number): void {
    if (!this.hasAcSources) return;
    this.sampleClock += h;
    if (this.sampleClock < this.sampleSpacing * (1 - 1e-9)) return;
    const weight = this.sampleClock;
    this.sampleClock = 0;
    this.intervalTime += weight;
    for (let i = 0; i < this.x.length; i++) this.xSum[i]! += this.x[i]! * weight;
    if (this.groundPoints.length >= 2) {
      this.groundPoints.forEach((point, j) => {
        const c = this.earthCurrent(point);
        if (Math.abs(c) > Math.abs(this.earthPeaks[j]!)) this.earthPeaks[j] = c;
      });
      this.sourcePeak = Math.max(this.sourcePeak, this.sourceCurrent());
      this.scopePeak = Math.max(this.scopePeak, this.scopeCurrent());
      this.peaksReady = true;
      this.peakClock += weight;
      if (this.peakClock >= this.window) {
        this.earthPrev.set(this.earthPeaks);
        this.earthPeaks.fill(0);
        this.sourcePrev = this.sourcePeak;
        this.sourcePeak = 0;
        this.scopePrev = this.scopePeak;
        this.scopePeak = 0;
        this.peakClock = 0;
      }
    }
    const devices = this.circuit.devices;
    for (let i = 0; i < devices.length; i++) {
      const currents = devices[i]!.pinCurrents(this.x);
      const sums = this.pinSums[i]!;
      for (let k = 0; k < sums.length; k++) sums[k]! += (currents[k] ?? 0) * weight;
    }
  }

  /**
   * Tek bir zaman adımı (ya da DC çözüm). LED yanarsa aynı adım LED açık devre olarak
   * yeniden çözülür. Başarılıysa durum kaydedilir.
   */
  private step(ctx: StepContext, checkError = false): 'ok' | 'failed' | 'rejected' {
    this.limitEvent = false;
    for (let attempt = 0; attempt <= this.circuit.devices.length; attempt++) {
      if (!this.solve(ctx)) {
        this.restoreIterates();
        return 'failed';
      }
      let changed = false;
      for (const device of this.circuit.devices) {
        if (device.checkLimits(this.xNew)) {
          changed = true;
          this.burnedThisCall.push(device.id);
        }
      }
      if (!changed) break;
      this.limitEvent = true;
      this.invalidate();
      this.restoreIterates();
    }
    // Yerel kesme hatası: tolerans aşıldıysa adım reddedilir (bir bileşenin durumu değiştiyse ya da
    // adım zaten en küçükse — checkError = false — kabul edilir).
    this.lteRatioLast = checkError ? this.lteRatio(ctx) : null;
    if (checkError && !this.limitEvent && this.lteRatioLast !== null && this.lteRatioLast > 1) {
      this.restoreIterates();
      return 'rejected';
    }
    for (const device of this.circuit.devices) device.accept(this.xNew, ctx);
    this.x.set(this.xNew);
    return 'ok';
  }

  /** DC çözüm; yakınsamazsa kaynak adımlama dener. Hata varsa tanılamayı döndürür. */
  private solveDC(): Diagnostic | null {
    const ctx: StepContext = { h: 0, trap: false, sourceScale: 1, time: this.time, window: 0 };
    if (this.step(ctx) !== 'ok') {
      // Kaynak adımlama: kaynakları %10'dan başlayarak artır, her çözümü bir sonrakinin
      // başlangıç noktası yap.
      for (const scale of SOURCE_STEPS) {
        const scaled: StepContext = { ...ctx, sourceScale: scale };
        if (this.step(scaled) !== 'ok') return this.nrFailedDiagnostic();
      }
    }
    this.solvedVersion = this.version;
    return null;
  }

  private restoreIterates(): void {
    for (const device of this.circuit.devices) device.restoreIterate();
  }

  /**
   * Adım boyunca sabit katkıları (gmin dahil) hazırlar; aynı h, yöntem ve sürüm için önbellekten
   * döner. gmin düğümleri ve akımı tam 0 olan uçlar yalnızca devre ya da çözüm türü (doğru akım /
   * geçici) değişince yeniden bulunur.
   */
  private prepareStatic(ctx: StepContext): string {
    const key = `${this.version}|${ctx.h}|${ctx.sourceScale}|${ctx.trap}`;
    if (key === this.staticKey) return key;
    const transient = ctx.h > 0;
    const topology = `${this.version}|${transient}`;
    if (topology !== this.topologyKey) {
      this.floating = this.floatingNodes(transient);
      this.zeroPins = this.findZeroPins(transient);
      this.topologyKey = topology;
    }
    const sys = this.staticSys;
    sys.clear();
    for (const node of this.floating) sys.add(node, node, GMIN);
    for (const device of this.circuit.devices) device.stampStatic(sys, ctx);
    this.staticKey = key;
    return key;
  }

  /**
   * gmin gereken düğümler: bileşenler üzerinden referansa (toprak) hiçbir iletken yolu olmayan
   * düğüm grupları (açık anahtarın, ideal voltmetrenin, doğru akımda kondansatörün arkasında kalan
   * parçalar; kullanılmayan iç düğümler). Her böyle grubun YALNIZCA BİR düğümü toprağa 1e-12 S ile
   * bağlanır: matris tekil olmaz, ve tek noktadan bağlı bir gruptan net akım geçemeyeceği için (KCL)
   * gmin hiçbir yerde kaçak akım oluşturmaz. Referansa bağlı düğümlere gmin eklenmez: açık devrede
   * (kablosu eksik, anahtarı açık) akım tam 0'dır. Diyot ve transistör eklemlerindeki paralel gmin
   * (Newton-Raphson yakınsaması için) bileşenlerin içindedir ve değişmez.
   */
  private floatingNodes(transient: boolean): number[] {
    const n = this.circuit.nodeUnknowns;
    const groundIndex = n;
    const uf = new UnionFind();
    for (let i = 0; i <= n; i++) uf.add();
    const index = (node: number) => (node === GROUND ? groundIndex : node);
    for (const device of this.circuit.devices) {
      for (const group of device.conductiveGroups(transient)) {
        const first = group[0];
        if (first === undefined) continue;
        for (const node of group) uf.union(index(first), index(node));
      }
    }
    const ground = uf.find(groundIndex);
    const tied = new Set<number>();
    const result: number[] = [];
    for (let i = 0; i < n; i++) {
      const root = uf.find(i);
      if (root === ground || tied.has(root)) continue;
      tied.add(root);
      result.push(i);
    }
    return result;
  }

  /**
   * Akımı KCL gereği tam 0 olan uçlar. İletken çizgi: düğümler (toprak dahil) ve bileşenlerin iletken
   * grupları (iki düğümlü grup bir kenar; daha büyüğü, bileşene ait sanal bir düğüme yıldız). Bir
   * köprü kenarı kesilince çizge ikiye ayrılır ve iki yan arasında başka yol kalmaz: köprüden geçen
   * net akım 0'dır (ucu boşta kalan dal, kablosu eksik devre). Hiçbir iletken gruba girmeyen uç
   * (açık anahtar, ideal voltmetre) da akım taşımaz. Köprüler Tarjan'ın algoritmasıyla bulunur.
   */
  private findZeroPins(transient: boolean): Map<string, readonly boolean[]> {
    const n = this.circuit.nodeUnknowns;
    const vertex = (node: number) => (node === GROUND ? n : node);
    let vertexCount = n + 1;
    const edges: Array<{ u: number; v: number }> = [];
    /** Her bileşenin her ucu için o ucu taşıyan kenarlar. */
    const pinEdges: number[][][] = [];
    this.circuit.devices.forEach((device, i) => {
      const pins = this.circuit.netlist.elements[i]!.pins.length;
      const perPin: number[][] = Array.from({ length: pins }, () => []);
      for (const members of device.possibleGroups(transient)) {
        if (members.length < 2) continue;
        // İki düğümlü grup tek kenardır (iki ucu aynı düğümdeyse kendine dönen kenar: hiç köprü olmaz).
        // Daha büyüğü bileşene ait sanal bir düğüme yıldızdır; aynı düğüme giden iki kol koşut kenardır
        // (ör. iki ucu kısa devre edilmiş pilin içindeki halka).
        if (members.length === 2) {
          const e = edges.length;
          edges.push({ u: vertex(members[0]!), v: vertex(members[1]!) });
          for (let k = 0; k < pins; k++) if (device.nodes[k] === members[0] || device.nodes[k] === members[1]) perPin[k]!.push(e);
          continue;
        }
        const hub = vertexCount++;
        for (const member of members) {
          const e = edges.length;
          edges.push({ u: hub, v: vertex(member) });
          for (let k = 0; k < pins; k++) if (device.nodes[k] === member) perPin[k]!.push(e);
        }
      }
      pinEdges.push(perPin);
    });
    const adjacency: number[][] = Array.from({ length: vertexCount }, () => []);
    edges.forEach((e, i) => {
      adjacency[e.u]!.push(i);
      adjacency[e.v]!.push(i);
    });
    // Tarjan: tin[v] ziyaret sırası, low[v] alt ağaçtan geri kenarla ulaşılan en küçük sıra.
    const tin = new Int32Array(vertexCount).fill(-1);
    const low = new Int32Array(vertexCount);
    const bridge = new Uint8Array(edges.length);
    let timer = 0;
    for (let root = 0; root < vertexCount; root++) {
      if (tin[root] !== -1) continue;
      const stack: Array<{ v: number; parentEdge: number; next: number }> = [{ v: root, parentEdge: -1, next: 0 }];
      tin[root] = low[root] = timer++;
      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        const list = adjacency[top.v]!;
        if (top.next < list.length) {
          const e = list[top.next++]!;
          if (e === top.parentEdge) continue;
          const edge = edges[e]!;
          const to = edge.u === top.v ? edge.v : edge.u;
          if (tin[to] === -1) {
            tin[to] = low[to] = timer++;
            stack.push({ v: to, parentEdge: e, next: 0 });
          } else {
            low[top.v] = Math.min(low[top.v]!, tin[to]!);
          }
        } else {
          stack.pop();
          const parent = stack[stack.length - 1];
          if (parent) {
            low[parent.v] = Math.min(low[parent.v]!, low[top.v]!);
            if (low[top.v]! > tin[parent.v]!) bridge[top.parentEdge] = 1;
          }
        }
      }
    }
    const result = new Map<string, readonly boolean[]>();
    this.circuit.devices.forEach((device, i) => {
      // Ucun bütün kenarları köprüyse (ya da hiç kenarı yoksa) o uçtan akım geçmez.
      const zero = pinEdges[i]!.map((list) => list.every((e) => bridge[e] === 1));
      if (zero.some(Boolean)) result.set(device.id, zero);
    });
    return result;
  }

  /** Bir adımı (gerekirse Newton-Raphson ile) çözer; sonuç xNew'dadır. */
  private solve(ctx: StepContext): boolean {
    const key = this.prepareStatic(ctx);
    const n = this.circuit.size;
    this.stepSys.copyFrom(this.staticSys);
    for (const device of this.circuit.devices) device.stampStep(this.stepSys, ctx);

    const nonlinear = this.nonlinearDevices;
    if (nonlinear.length === 0) {
      if (this.luCache?.key !== key) {
        this.luCache = { key, factor: luFactor(this.staticSys.A, n) };
      }
      luSolve(this.luCache.factor, this.stepSys.z, this.xNew);
      this.checkFinite(this.xNew);
      return true;
    }

    // Newton-Raphson: x(k+1), x(k) etrafında doğrusallaştırılmış sistemin çözümüdür.
    this.xIter.set(this.x);
    // Yamuk adımında başlangıç noktası son iki çözümden doğrusal öngörü (SPICE'taki öngörücü): eğri
    // boyunca ilerleyen bir çözümde yineleme sayısı azalır. Süreksizlikten sonraki geri Euler adımında
    // öngörü eski eğilimi taşıdığı için kullanılmaz.
    if (ctx.trap && this.historyCount >= 2) {
      const t0 = this.historyTimes[0]!;
      const f = (ctx.time - t0) / (t0 - this.historyTimes[1]!);
      const x0 = this.history[0]!;
      const x1 = this.history[1]!;
      for (let i = 0; i < n; i++) this.xIter[i] = x0[i]! + f * (x0[i]! - x1[i]!);
      for (const device of nonlinear) device.updateIterate(this.xIter);
    }
    for (let iteration = 0; iteration < NR_MAX_ITERATIONS; iteration++) {
      this.iterSys.copyFrom(this.stepSys);
      for (const device of nonlinear) device.stampNonlinear(this.iterSys, ctx);
      this.luWork = luFactor(this.iterSys.A, n, this.luWork);
      luSolve(this.luWork, this.iterSys.z, this.xNew);
      this.checkFinite(this.xNew);

      const unconverged: string[] = [];
      for (const device of nonlinear) {
        if (!device.updateIterate(this.xNew)) unconverged.push(device.id);
      }
      const voltagesConverged = this.converged(this.xNew, this.xIter);
      this.xIter.set(this.xNew);
      if (unconverged.length === 0 && voltagesConverged) {
        this.nonConverged = [];
        // Doğru akım çözümünde (devre değişince bir kez) bir yineleme daha: yakınsama ölçütü düğüm
        // gerilimine göredir (≈ 1e-3·|V|); ucu boşta kalan bir eklemde bu, ≈ 1e-14 A'lık sahte bir akım
        // bırakır. Newton adımı bunu karesel olarak sıfırlar (açık devrede akım tam 0).
        if (ctx.h === 0) this.polish(nonlinear, ctx, n);
        return true;
      }
      this.nonConverged = unconverged.length > 0 ? unconverged : nonlinear.map((d) => d.id);
    }
    return false;
  }

  /** Yakınsamış Newton-Raphson çözümünde bir adım daha (sonuç xNew'da). */
  private polish(nonlinear: readonly Device[], ctx: StepContext, n: number): void {
    this.iterSys.copyFrom(this.stepSys);
    for (const device of nonlinear) device.stampNonlinear(this.iterSys, ctx);
    this.luWork = luFactor(this.iterSys.A, n, this.luWork);
    luSolve(this.luWork, this.iterSys.z, this.xNew);
    this.checkFinite(this.xNew);
    for (const device of nonlinear) device.updateIterate(this.xNew);
  }

  /** |ΔV| < 1e-3·|V| + 1e-6 V (düğüm gerilimleri); akımlar için mutlak tolerans 1e-12 A. */
  private converged(a: Float64Array, b: Float64Array): boolean {
    const nodes = this.circuit.nodeUnknowns;
    for (let i = 0; i < a.length; i++) {
      const tolerance = NR_RELTOL * Math.max(Math.abs(a[i]!), Math.abs(b[i]!)) + (i < nodes ? NR_VNTOL : NR_ABSTOL);
      if (Math.abs(a[i]! - b[i]!) > tolerance) return false;
    }
    return true;
  }

  private checkFinite(x: Float64Array): void {
    for (let i = 0; i < x.length; i++) {
      if (!Number.isFinite(x[i]!)) throw new SingularMatrixError(i);
    }
  }

  private nrFailedDiagnostic(): Diagnostic {
    return {
      severity: 'error',
      code: 'nr-failed',
      elementIds: [...this.nonConverged],
      netKeys: [],
    };
  }

  private singularDiagnostic(column: number): Diagnostic {
    const netKeys = column < this.circuit.externalNodes ? netKeysOfNode(this.circuit, column) : [];
    return {
      severity: 'error',
      code: 'singular-matrix',
      elementIds: devicesTouching(this.circuit, column),
      netKeys,
    };
  }
}
