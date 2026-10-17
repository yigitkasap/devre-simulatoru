// Suda akımı taşıyan iyonların görselleştirilmesi (su haznesi sembolü ve baraj sahnesi).
//
// Telde akımı elektronlar taşır, suda ise elektrik alanda sürüklenen iyonlar: katyonlar (Ca²⁺, Mg²⁺,
// Na⁺…) akım yönünde, yani anottan (suya akım veren prob) katoda; anyonlar (Cl⁻, HCO₃⁻…) ters
// yönde. Akım taşımayan su da iyon doludur: iyonlar ısıl hareketle yerinde kıpırdar. Hızlar
// kablolardaki akım noktalarının ölçeğiyle çizilir (gerçek sürüklenme hızı µm/s düzeyindedir).

/** Bir anot probundan bir katot probuna giden akım kanalı. */
export interface IonChannel {
  /** Akımın suya girdiği prob (anot). */
  readonly from: number;
  /** Akımın sudan çıktığı prob (katot). */
  readonly to: number;
  /** Kanalın akımı (A, pozitif). */
  readonly current: number;
  /** Sürüklenme konumu (piksel): katyonlar bu kadar ileri, anyonlar bu kadar geri gider. */
  readonly phase: number;
}

export interface IonView {
  readonly channels: readonly IonChannel[];
  /** Her probdan suya akan akım (A). */
  readonly probeCurrents: readonly number[];
  /** Gerçek zamanda geçen süre (s): ısıl kıpırtı ve gaz kabarcıkları için. */
  readonly clock: number;
}

/** Bu akımın altında kanal çizilmez (kablolardaki akım noktalarıyla aynı eşik mertebesi). */
export const MIN_ION_CURRENT = 1e-7;

/**
 * Prob akımlarını anot → katot kanallarına ayırır: her anodun akımı katotlara, katotların akımıyla
 * orantılı paylaştırılır (toplamlar korunur, Kirchhoff).
 */
export function ionChannels(probeCurrents: readonly number[]): Array<{ from: number; to: number; current: number }> {
  const anodes = probeCurrents.map((i, k) => ({ k, i })).filter((p) => p.i > MIN_ION_CURRENT);
  const cathodes = probeCurrents.map((i, k) => ({ k, i: -i })).filter((p) => p.i > MIN_ION_CURRENT);
  const total = cathodes.reduce((s, c) => s + c.i, 0);
  if (total <= 0) return [];
  const out: Array<{ from: number; to: number; current: number }> = [];
  for (const a of anodes) {
    for (const c of cathodes) {
      const current = (a.i * c.i) / total;
      if (current > MIN_ION_CURRENT) out.push({ from: a.k, to: c.k, current });
    }
  }
  return out;
}

/** Bir haznenin iyon kanallarının sürüklenme konumlarını kare kare ilerletir. */
export class IonPhases {
  private phases = new Map<string, number>();
  private clock = 0;

  advance(probeCurrents: readonly number[], dtReal: number, speed: (current: number) => number): IonView {
    this.clock = (this.clock + dtReal) % 1e5;
    const channels = ionChannels(probeCurrents).map((c) => {
      const key = `${c.from}-${c.to}`;
      const phase = ((this.phases.get(key) ?? 0) + speed(c.current) * dtReal) % 1e6;
      this.phases.set(key, phase);
      return { ...c, phase };
    });
    return { channels, probeCurrents, clock: this.clock };
  }
}

/** Tekdüze sözde rastgele sayı (0..1): aynı tohumla her karede aynı (iyonların yeri titremesin). */
export function seeded(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Isıl kıpırtı: iyonun durduğu yerde küçük, düzensiz salınım. */
export function jiggle(seed: number, clock: number, amplitude: number): { dx: number; dy: number } {
  const a = 3.1 + 2.3 * seeded(seed);
  const b = 2.7 + 2.9 * seeded(seed + 1);
  return {
    dx: amplitude * (0.65 * Math.sin(a * clock + 6.28 * seeded(seed + 2)) + 0.35 * Math.sin(2.3 * b * clock + seed)),
    dy: amplitude * (0.65 * Math.cos(b * clock + 6.28 * seeded(seed + 3)) + 0.35 * Math.sin(1.9 * a * clock - seed)),
  };
}

export interface Point2 {
  readonly x: number;
  readonly y: number;
}

/** İkinci dereceden Bézier eğrisinde t'deki nokta. */
export function bezier(p0: Point2, c: Point2, p1: Point2, t: number): Point2 {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/** Eğrinin yaklaşık uzunluğu (8 parçalı çizgiyle). */
export function bezierLength(p0: Point2, c: Point2, p1: Point2): number {
  let length = 0;
  let prev = p0;
  for (let k = 1; k <= 8; k++) {
    const p = bezier(p0, c, p1, k / 8);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return length;
}

/** Bir alan çizgisi boyunca iyonlar: katyonlar 0 → 1 (anot → katot), anyonlar 1 → 0 yönünde. */
export interface PlacedIon {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly cation: boolean;
}

/**
 * Kanalın alan çizgisi üzerine `perSign` katyon ve `perSign` anyon yerleştirir. `phase` piksel
 * cinsinden sürüklenmedir; uç noktalara yakın iyonlar (elektrot yüzeyinde) çizilmez.
 */
export function ionsOnLine(
  key: string,
  p0: Point2,
  c: Point2,
  p1: Point2,
  phase: number,
  perSign: number,
  seed: number,
  clock: number,
  amplitude: number,
): PlacedIon[] {
  const length = Math.max(1, bezierLength(p0, c, p1));
  const out: PlacedIon[] = [];
  for (let n = 0; n < 2 * perSign; n++) {
    const cation = n % 2 === 0;
    const base = (Math.floor(n / 2) + (cation ? 0.5 : 0) + 0.37 * seeded(seed + n)) / perSign;
    const shift = phase / length;
    const raw = cation ? base + shift : base - shift;
    const t = raw - Math.floor(raw);
    if (t < 0.06 || t > 0.94) continue;
    const p = bezier(p0, c, p1, t);
    const j = jiggle(seed * 31 + n, clock, amplitude);
    out.push({ key: `${key}-${n}`, x: p.x + j.dx, y: p.y + j.dy, cation });
  }
  return out;
}

/** Katyon ve anyon renkleri (biçimleri de farklı: + ve − işareti). */
export const CATION_COLOR = '#e8590c';
export const ANION_COLOR = '#5f3dc4';
