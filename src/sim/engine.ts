// Simülasyon motoru: derlenmiş devreyi zaman içinde ilerletir.
//
// - Kondansatör ve AC kaynak yoksa devre zamandan bağımsızdır: her karede (gerekirse) tek bir DC
//   çözüm yapılır.
// - Kondansatör ya da AC kaynak varsa geri Euler ile h adımlarıyla ilerlenir (varsayılan 50 µs;
//   AC kaynakta en fazla periyodun 1/100'ü).
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
import { MnaSystem } from './mna';
import type { Netlist } from './netlist';

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

/** AC kaynaklı devrede en büyük zaman adımı: en kısa periyodun 1/100'ü. */
const STEPS_PER_PERIOD = 100;

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
  private xSum: Float64Array;
  private currentSum: Float64Array;
  private deviceIndex = new Map<string, number>();
  /** Henüz adımlanmamış simülasyon zamanı. */
  private pending = 0;
  private successStreak = 0;
  /** Son NR denemesinde yakınsamayan bileşenler. */
  private nonConverged: string[] = [];
  private burnedThisCall: string[] = [];

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
    this.currentSum = new Float64Array(this.circuit.devices.length);
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
    if (this.h > this.maxStep) this.h = this.maxStep;
    this.deviceIndex = new Map(this.circuit.devices.map((d, i) => [d.id, i]));
    if (this.currentSum.length !== this.circuit.devices.length) {
      this.currentSum = new Float64Array(this.circuit.devices.length);
    }
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
    return this.circuit.deviceById.get(id)?.measure(this.x) ?? null;
  }

  status(id: string): DeviceStatus {
    return this.circuit.deviceById.get(id)?.status(this.x) ?? {};
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

  /** Son advance() çağrısı boyunca bir bileşenin ortalama akımı (yoksa anlık). */
  averageCurrent(id: string): number | null {
    const index = this.deviceIndex.get(id);
    if (index === undefined) return null;
    if (this.intervalTime <= 0) return this.circuit.devices[index]!.measure(this.x).current;
    return this.currentSum[index]! / this.intervalTime;
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
    this.xSum.fill(0);
    this.currentSum.fill(0);
  }

  /** Kabul edilen çözüm, kayıt tutan bileşenlere (osiloskop) iletilir. */
  private observe(): void {
    for (const device of this.circuit.devices) device.observe(this.x, this.time);
  }

  /** AC devrede aralık ortalamaları için integraller (zamandan bağımsız devrede gereksiz). */
  private accumulate(h: number): void {
    if (!this.hasAcSources) return;
    this.intervalTime += h;
    for (let i = 0; i < this.x.length; i++) this.xSum[i]! += this.x[i]! * h;
    const devices = this.circuit.devices;
    for (let i = 0; i < devices.length; i++) this.currentSum[i]! += devices[i]!.measure(this.x).current * h;
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
    // Her düğümü toprağa 1e-12 S ile bağla: boşta düğümler matrisi tekil yapmasın.
    for (let i = 0; i < this.circuit.nodeUnknowns; i++) sys.add(i, i, GMIN);
    for (const device of this.circuit.devices) device.stampStatic(sys, ctx);
    this.staticKey = key;
    return key;
  }

  /** Bir adımı (gerekirse Newton-Raphson ile) çözer; sonuç xNew'dadır. */
  private solve(ctx: StepContext): boolean {
    const key = this.prepareStatic(ctx);
    const n = this.circuit.size;
    this.stepSys.copyFrom(this.staticSys);
    for (const device of this.circuit.devices) device.stampStep(this.stepSys, ctx);

    const nonlinear = this.circuit.devices.filter((d) => d.nonlinear);
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
      for (const device of nonlinear) device.stampNonlinear(this.iterSys);
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
        return true;
      }
      this.nonConverged = unconverged.length > 0 ? unconverged : nonlinear.map((d) => d.id);
    }
    return false;
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
