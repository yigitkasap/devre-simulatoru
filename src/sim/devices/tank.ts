import { NR_ABSTOL, NR_RELTOL, THERMAL_VOLTAGE } from '../constants';
import type { MnaSystem } from '../mna';
import { numProp, strProp, type Props } from '../netlist';
import { Device, type DeviceInit, type DeviceModel, type DeviceStatus, type Measurement, type StepContext } from './device';

/**
 * Su haznesi (baraj) ve seviye probları. Pinler: [0] = ortak prob (dipte), [1] = Seviye 1,
 * [2] = Seviye 2, [3] = Seviye 3 probu.
 *
 * Su, ıslak probları birbirine bağlayan bir iletkendir: içinde çözünmüş iyonlar (Ca²⁺, Mg²⁺, Na⁺,
 * Cl⁻, HCO₃⁻…) vardır ve akımı elektrik alanda sürüklenen bu iyonlar taşır. Her ıslak prob suya
 * (iç düğüm) bir dalla bağlanır: elektrot arayüzü (aşağıda) ile suyun yayılma direnci R_su / 2
 * seri; böylece iki ıslak prob arasındaki direnç R_su olur (musluk suyunda birkaç cm aralıklı
 * problar için birkaç kΩ; varsayılan 5 kΩ). Kuru prob açık devredir. Su yüzeyi probun ucunu ±%1'lik
 * bir aralıkta yavaşça ıslatır (menisküs): iletkenlik birden atlamaz, Newton-Raphson zorlanmaz.
 *
 * Elektrot polarizasyonu (elektroliz): telde akımı elektronlar, suda iyonlar taşır; yük metal ile
 * su arasında ancak bir kimyasal tepkimeyle geçer. + elektrotta (anot) su yükseltgenir
 * (2H₂O → O₂ + 4H⁺ + 4e⁻) ya da metal çözünür (korozyon), − elektrotta (katot) hidrojen çıkar
 * (2H₂O + 2e⁻ → H₂ + 2OH⁻). Bunun için suyun ayrışma gerilimi (tersinir 1,23 V) ile iki elektrodun
 * aşırı gerilimleri gerekir. Her elektrot Butler–Volmer biçiminde bir arayüzdür (α = 0,5):
 *   i = 2·i₀·sinh(η / b),  b = 2·V_T ≈ 52 mV (Tafel eğimi ≈ 119 mV/onlu)
 * Tersinir gerilim ve aşırı gerilimler bu tek terime toplandı; i₀ = 3·10⁻¹¹ A, bir anot ile bir
 * katodun toplam polarizasyonu 0,1 mA'de ≈ 1,55 V, 0,4 mA'de ≈ 1,7 V, 1 mA'de ≈ 1,8 V olacak
 * biçimde seçildi (suyun elektrolizinde gözlenen 1,5–2 V). Çift katmanın kapasitesi modellenmez.
 *
 * Seviye (yüzde) Doldur / Boşalt kipinde simülasyon zamanıyla değişir: 0'dan 100'e "dolma
 * süresi"nde. Durdur'da (simülasyon başa dönünce) başlangıç seviyesine döner (kondansatörlerin
 * başlangıç gerilimi gibi). Prob yükseklikleri, uçların sembolde durduğu yüksekliklerdir.
 */
export const TANK_MODES = ['stop', 'fill', 'drain'] as const;
export type TankMode = (typeof TANK_MODES)[number];

export const TANK_DEFAULTS = {
  /** Başlangıç seviyesi (%). */
  level: 0,
  mode: 'stop' as TankMode,
  /** Boştan doluya geçen süre (s). */
  fillTime: 20,
  /** İki ıslak prob arasındaki suyun direnci (Ω). */
  waterResistance: 5e3,
};

export const TANK_LIMITS = { minFillTime: 1, maxFillTime: 600, minWaterResistance: 10, maxWaterResistance: 10e6 };

/** Elektrot arayüzünün değişim akımı i₀ (A): bkz. dosyanın başındaki açıklama. */
export const ELECTRODE_EXCHANGE_CURRENT = 3e-11;
/** Elektrot arayüzünün eğimi b = 2·V_T (V; α = 0,5). */
export const ELECTRODE_SLOPE = 2 * THERMAL_VOLTAGE;

/**
 * Islak bir probun dalı: elektrot arayüzü ile suyun yayılma direnci `resistance` seri. Uçları arası
 * gerilim `voltage` (prob − su) iken akım (probdan suya), türevi ve arayüzün aşırı gerilimi η.
 * η, f(η) = η + R·2·i₀·sinh(η/b) − |V| = 0'ın köküdür: f artan ve η > 0'da dışbükeydir; kökün
 * sağından başlayan Newton tekdüze yakınsar.
 */
export function electrodeBranch(
  voltage: number,
  resistance: number,
  guess?: number,
): { current: number; conductance: number; overpotential: number } {
  const i0 = ELECTRODE_EXCHANGE_CURRENT;
  const b = ELECTRODE_SLOPE;
  const a = Math.abs(voltage);
  if (a === 0) {
    const gi = (2 * i0) / b;
    return { current: 0, conductance: gi / (1 + resistance * gi), overpotential: 0 };
  }
  // Başlangıç: önceki çözüm (Newton-Raphson iterasyonları arasında gerilim az değişir) ya da akımın
  // hepsi direnç üzerinden geçseydi gereken aşırı gerilim (kökün sağında). Kök [0, |V|] aralığındadır.
  let eta = guess !== undefined ? Math.min(a, Math.abs(guess)) : Math.min(a, b * Math.asinh(a / resistance / (2 * i0)));
  for (let k = 0; k < 100; k++) {
    const f = eta + resistance * 2 * i0 * Math.sinh(eta / b) - a;
    const df = 1 + resistance * ((2 * i0) / b) * Math.cosh(eta / b);
    const next = Math.min(a, Math.max(0, eta - f / df));
    const step = Math.abs(next - eta);
    eta = next;
    if (step <= 1e-11) break;
  }
  const gi = ((2 * i0) / b) * Math.cosh(eta / b);
  const sign = Math.sign(voltage);
  return { current: (sign * (a - eta)) / resistance, conductance: gi / (1 + resistance * gi), overpotential: sign * eta };
}

/** Probların ucunun yüksekliği (%): ortak prob, Seviye 1, 2, 3. */
export const TANK_PROBE_HEIGHTS = [12.5, 37.5, 62.5, 87.5] as const;

/** Su yüzeyinin probu ıslattığı aralığın genişliği (%). */
const WET_BAND = 2;

export function tankSettings(props: Props) {
  const d = TANK_DEFAULTS;
  return {
    level: Math.min(100, Math.max(0, numProp(props, 'level', d.level))),
    mode: strProp(props, 'mode', TANK_MODES, d.mode),
    fillTime: Math.min(TANK_LIMITS.maxFillTime, Math.max(TANK_LIMITS.minFillTime, numProp(props, 'fillTime', d.fillTime))),
    waterResistance: Math.max(TANK_LIMITS.minWaterResistance, numProp(props, 'waterResistance', d.waterResistance)),
  };
}

export type TankSettings = ReturnType<typeof tankSettings>;

/** Probun ıslaklığı (0 kuru … 1 ıslak): yüzey ucun ±%1 çevresindeyken yumuşak geçiş. */
export function probeWetness(level: number, height: number): number {
  const t = Math.min(1, Math.max(0, (level - height) / WET_BAND + 0.5));
  return t * t * (3 - 2 * t);
}

export class TankDevice extends Device {
  readonly type = 'tank';
  readonly settings: TankSettings;
  /** Son kabul edilen adımdaki seviye (%). */
  level: number;
  /** Newton-Raphson doğrusallaştırma noktası: her probun dalının gerilimi (prob − su). */
  private branchV = [0, 0, 0, 0];
  private branchVAccepted = [0, 0, 0, 0];
  /** Son doğrusallaştırmadaki dal akımları ve iletkenlikleri. */
  private linCurrent = [0, 0, 0, 0];
  private linConductance = [0, 0, 0, 0];
  /** Son doğrusallaştırmadaki dal dirençleri (kuru prob: sonsuz). */
  private iterResistance: number[] = [Infinity, Infinity, Infinity, Infinity];
  /**
   * Yakınsama denetiminde yeni gerilimde çözülen dal: bir sonraki doğrusallaştırma aynı gerilim ve
   * dirençte olduğu için yeniden çözülmez.
   */
  private solved: Array<{ v: number; r: number; current: number; conductance: number; overpotential: number } | null> = [null, null, null, null];

  constructor(init: DeviceInit) {
    super(init);
    this.settings = tankSettings(init.props);
    this.level = this.settings.level;
  }

  /** Seviyenin değişim hızı (%/s); Durdur kipinde 0. */
  private get rate(): number {
    const { mode, fillTime } = this.settings;
    return mode === 'fill' ? 100 / fillTime : mode === 'drain' ? -100 / fillTime : 0;
  }

  /** Seviye zamanla değişirken devre adım adım çözülür. */
  override get timeVarying(): boolean {
    return this.rate !== 0;
  }

  /** İletkenlik seviyeye bağlı ve zamanla değiştiği için her iterasyonda yeniden eklenir. */
  override get nonlinear(): boolean {
    return true;
  }

  private levelAfter(h: number): number {
    return Math.min(100, Math.max(0, this.level + this.rate * h));
  }

  /** Her probun suya yayılma direnci (Ω) verilen seviyede; kuru prob sonsuz. */
  private resistances(level: number): number[] {
    const r = this.settings.waterResistance / 2;
    return TANK_PROBE_HEIGHTS.map((height) => {
      const w = probeWetness(level, height);
      return w > 0 ? r / w : Infinity;
    });
  }

  /**
   * Problar suyla yalnızca ıslakken bağlanır ve seviye simülasyon sırasında (yapı değişmeden) değişir;
   * bu yüzden iletken yol sayılmaz (gerekirse su düğümüne fazladan, zararsız bir gmin eklenir).
   */
  override conductiveGroups(): ReadonlyArray<readonly number[]> {
    return [];
  }

  /** Islak problar su düğümüne bağlanır: akımı 0 sayılmamalı. */
  override possibleGroups(): ReadonlyArray<readonly number[]> {
    return [this.nodes];
  }

  override stampNonlinear(sys: MnaSystem, ctx: StepContext): void {
    const water = this.nodes[4]!;
    this.iterResistance = this.resistances(this.levelAfter(ctx.h));
    this.iterResistance.forEach((r, k) => {
      if (!Number.isFinite(r)) return;
      const v = this.branchV[k]!;
      const cached = this.solved[k];
      const { current, conductance } = cached && cached.v === v && cached.r === r ? cached : electrodeBranch(v, r, cached?.overpotential);
      this.linCurrent[k] = current;
      this.linConductance[k] = conductance;
      sys.conductance(this.nodes[k]!, water, conductance);
      sys.currentSource(this.nodes[k]!, water, current - conductance * v);
    });
  }

  /** Dal gerilimleri yeni doğrusallaştırma noktası olur; akım doğrusal tahmine yakınsa yakınsamıştır. */
  override updateIterate(x: Float64Array): boolean {
    const water = this.v(x, 4);
    let converged = true;
    this.iterResistance.forEach((r, k) => {
      const vnew = this.v(x, k) - water;
      if (Number.isFinite(r)) {
        const predicted = this.linCurrent[k]! + this.linConductance[k]! * (vnew - this.branchV[k]!);
        const branch = electrodeBranch(vnew, r, this.solved[k]?.overpotential);
        this.solved[k] = { v: vnew, r, ...branch };
        const actual = branch.current;
        if (Math.abs(actual - predicted) > NR_RELTOL * Math.max(Math.abs(actual), Math.abs(predicted)) + NR_ABSTOL) converged = false;
      }
      this.branchV[k] = vnew;
    });
    return converged;
  }

  override restoreIterate(): void {
    this.branchV = [...this.branchVAccepted];
  }

  override accept(x: Float64Array, ctx: StepContext): void {
    this.level = this.levelAfter(ctx.h);
    const water = this.v(x, 4);
    this.branchV = [0, 1, 2, 3].map((k) => this.v(x, k) - water);
    this.branchVAccepted = [...this.branchV];
  }

  /** Her dalın akımı (probdan suya) ve elektrot arayüzünün aşırı gerilimi. */
  private probeBranches(x: Float64Array): Array<{ current: number; overpotential: number }> {
    const water = this.v(x, 4);
    return this.resistances(this.level).map((r, k) =>
      Number.isFinite(r) ? electrodeBranch(this.v(x, k) - water, r) : { current: 0, overpotential: 0 },
    );
  }

  /** Uçlara giren akımlar: ıslak probdan suya akan akım. */
  override pinCurrents(x: Float64Array): number[] {
    return this.probeBranches(x).map((b) => b.current);
  }

  /** Ölçüm: Seviye 1 probu ile ortak prob arasındaki gerilim; ortak probun akımı. */
  measure(x: Float64Array): Measurement {
    const voltage = this.v(x, 1) - this.v(x, 0);
    const current = this.pinCurrents(x)[0]!;
    return { voltage, current, power: 0 };
  }

  /**
   * Polarizasyon: akım taşıyan elektrotların arayüz gerilimleri; anotların en büyüğü ile katotların
   * en büyüğünün toplamı (bir anot–katot çiftinin elektrolize harcadığı gerilim).
   */
  override status(x: Float64Array): DeviceStatus {
    const branches = this.probeBranches(x);
    const etas = branches.map((b) => b.overpotential);
    return {
      level: this.level,
      wetProbes: TANK_PROBE_HEIGHTS.map((h) => probeWetness(this.level, h) > 0.5),
      probeCurrents: branches.map((b) => b.current),
      polarization: Math.max(0, ...etas) + Math.max(0, ...etas.map((e) => -e)),
    };
  }

  /**
   * Değer değişince (ör. kip ya da dolma süresi) seviye kaldığı yerden sürer; başlangıç seviyesi
   * değiştiyse (kaydırıcı) yeni değer geçerlidir.
   */
  override adoptState(prev: Device): void {
    if (prev instanceof TankDevice && prev.settings.level === this.settings.level) this.level = prev.level;
    if (prev instanceof TankDevice) {
      this.branchV = [...prev.branchV];
      this.branchVAccepted = [...prev.branchVAccepted];
    }
  }
}

export const tankModel: DeviceModel = {
  type: 'tank',
  pinCount: 4,
  internalNodes: 1,
  branchCount: 0,
  create: (init) => new TankDevice(init),
};
