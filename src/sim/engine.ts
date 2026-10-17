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
  MIN_TIME_STEP,
  NR_ABSTOL,
  NR_MAX_ITERATIONS,
  NR_RELTOL,
  NR_VNTOL,
  STEP_GROWTH_AFTER,
} from './constants';
import { hasErrors, type Diagnostic } from './diagnostics';
import {
  AcSourceDevice,
  BatteryDevice,
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
  /** Son NR denemesinde yakınsamayan bileşenler. */
  private nonConverged: string[] = [];
  private burnedThisCall: string[] = [];
  /**
   * KCL gereği akımı tam 0 olan uçlar (bileşen kimliği → uç başına): iletken çizgide köprü olan
   * kenarlar. Çözümün yuvarlama artığı (≈ 1e-15 A) yerine tam 0 gösterilir (bkz. findZeroPins).
   */
  private zeroPins = new Map<string, readonly boolean[]>();

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
    if (this.h > this.maxStep) this.h = this.maxStep;
    this.deviceIndex = new Map(this.circuit.devices.map((d, i) => [d.id, i]));
    this.pinSums = this.circuit.devices.map((d) => new Float64Array(d.pinCurrents(this.x).length));
    this.intervalTime = 0;
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
      this.luWork = undefined;
    }
    this.configure();
    this.invalidate();
  }

  private invalidate(): void {
    this.version++;
    this.nonlinearDevices = this.circuit.devices.filter((d) => d.nonlinear);
    this.staticKey = '';
    this.luCache = null;
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
    return result;
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

  get timeStep(): number {
    return this.h;
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
      return this.advanceTransient(dt, maxSteps);
    } catch (e) {
      if (e instanceof SingularMatrixError) return this.result(0, this.singularDiagnostic(e.column));
      throw e;
    }
  }

  /** Belirli bir simülasyon zamanına kadar ilerletir (testler için). */
  runUntil(time: number): AdvanceResult {
    return this.advance(Math.max(0, time - this.time - this.pending));
  }

  private result(steps: number, error: Diagnostic | null): AdvanceResult {
    return { ok: error === null, steps, burned: this.burnedThisCall, ...(error ? { error } : {}) };
  }

  private advanceTransient(dt: number, maxSteps: number): AdvanceResult {
    this.pending += dt;
    let steps = 0;
    while (this.pending >= this.h * (1 - 1e-9)) {
      if (steps >= maxSteps) {
        this.pending = 0;
        break;
      }
      const ctx: StepContext = { h: this.h, sourceScale: 1, time: this.time + this.h, window: this.window };
      if (this.step(ctx)) {
        this.time += this.h;
        this.pending -= this.h;
        steps++;
        this.observe();
        this.accumulate(ctx.h);
        this.successStreak++;
        if (this.h < this.maxStep && this.successStreak >= STEP_GROWTH_AFTER) {
          this.h = Math.min(this.maxStep, this.h * 2);
          this.successStreak = 0;
        }
      } else {
        this.h /= 2;
        this.successStreak = 0;
        if (this.h < this.options.minTimeStep) {
          this.h = this.maxStep;
          return this.result(steps, this.nrFailedDiagnostic());
        }
      }
    }
    if (this.pending < 0) this.pending = 0;
    return this.result(steps, null);
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
  private step(ctx: StepContext): boolean {
    for (let attempt = 0; attempt <= this.circuit.devices.length; attempt++) {
      if (!this.solve(ctx)) {
        this.restoreIterates();
        return false;
      }
      let changed = false;
      for (const device of this.circuit.devices) {
        if (device.checkLimits(this.xNew)) {
          changed = true;
          this.burnedThisCall.push(device.id);
        }
      }
      if (!changed) break;
      this.invalidate();
      this.restoreIterates();
    }
    for (const device of this.circuit.devices) device.accept(this.xNew, ctx);
    this.x.set(this.xNew);
    return true;
  }

  /** DC çözüm; yakınsamazsa kaynak adımlama dener. Hata varsa tanılamayı döndürür. */
  private solveDC(): Diagnostic | null {
    const ctx: StepContext = { h: 0, sourceScale: 1, time: this.time, window: 0 };
    if (!this.step(ctx)) {
      // Kaynak adımlama: kaynakları %10'dan başlayarak artır, her çözümü bir sonrakinin
      // başlangıç noktası yap.
      for (const scale of SOURCE_STEPS) {
        const scaled: StepContext = { ...ctx, sourceScale: scale };
        if (!this.step(scaled)) return this.nrFailedDiagnostic();
      }
    }
    this.solvedVersion = this.version;
    return null;
  }

  private restoreIterates(): void {
    for (const device of this.circuit.devices) device.restoreIterate();
  }

  /** Adım boyunca sabit katkıları (gmin dahil) hazırlar; aynı h ve sürüm için önbellekten döner. */
  private prepareStatic(ctx: StepContext): string {
    const key = `${this.version}|${ctx.h}|${ctx.sourceScale}`;
    if (key === this.staticKey) return key;
    const sys = this.staticSys;
    sys.clear();
    for (const node of this.floatingNodes(ctx.h > 0)) sys.add(node, node, GMIN);
    this.zeroPins = this.findZeroPins(ctx.h > 0);
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
