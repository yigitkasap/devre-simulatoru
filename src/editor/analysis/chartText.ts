// Grafik yazılarının ölçüsü ve yeri (XYChart): yazının genişliği tuvalle ölçülür (alt simgeli adlar dahil),
// işaret yazıları (V_{P}, −3 dB, I_{D} …) çizgilerle, eğrilerle ve birbirleriyle çakışmayan yere konur,
// eğri adları grafiğin sağına sığmıyorsa altındaki açıklama satırlarına dizilir.

const SUB = /_\{([^}]*)\}/;

let ctx: CanvasRenderingContext2D | null | undefined;
const fonts = new Map<string, string>();

function context(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx;
  // Testteki jsdom'da tuval yok (getContext uyarı yazar): yaklaşık ölçü kullanılır.
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return (ctx = null);
  try {
    ctx = document.createElement('canvas').getContext('2d');
  } catch {
    ctx = null;
  }
  return ctx;
}

function family(kind: 'mono' | 'sans'): string {
  const cached = fonts.get(kind);
  if (cached) return cached;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--font-${kind}`).trim() || (kind === 'mono' ? 'monospace' : 'sans-serif');
  fonts.set(kind, value);
  return value;
}

/**
 * Yazının çizildiği genişlik (px). Alt simge (svgSub) 0,75 em ve ardında 0,75 em'lik bir boşluk; tuval
 * yoksa harf başına 0,62 em (eş aralıklı yazının ortalaması).
 */
export function textWidth(text: string, size: number, kind: 'mono' | 'sans' = 'mono'): number {
  const parts = text.split(SUB);
  const g = context();
  let w = 0;
  parts.forEach((p, i) => {
    const sub = i % 2 === 1;
    const s = sub ? size * 0.75 : size;
    const run = sub ? `${p} ` : p;
    if (run === '') return;
    if (g) {
      g.font = `${s}px ${family(kind)}`;
      w += g.measureText(run).width;
    } else w += run.length * s * 0.62;
  });
  return Math.ceil(w);
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Çizginin parçası: x1 y1 x2 y2 (piksel). */
export type Segment = readonly [number, number, number, number];

const inside = (x: number, y: number, b: Box) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (d === 0) return false;
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Çizgi parçası kutuya değiyor mu (içinden geçiyor ya da içinde). */
export function segmentHitsBox([x1, y1, x2, y2]: Segment, b: Box): boolean {
  if (Math.max(x1, x2) < b.x || Math.min(x1, x2) > b.x + b.w || Math.max(y1, y2) < b.y || Math.min(y1, y2) > b.y + b.h) return false;
  if (inside(x1, y1, b) || inside(x2, y2, b)) return true;
  const [l, r, t, bo] = [b.x, b.x + b.w, b.y, b.y + b.h];
  return cross(x1, y1, x2, y2, l, t, r, t) || cross(x1, y1, x2, y2, l, bo, r, bo) || cross(x1, y1, x2, y2, l, t, l, bo) || cross(x1, y1, x2, y2, r, t, r, bo);
}

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export interface Obstacles {
  /** İşaret çizgileri (kesikli): yazı bunların üstüne hiç gelmemeli. */
  readonly lines: readonly Segment[];
  /** Eğriler: olabildiğince kaçınılır. */
  readonly curves: readonly Segment[];
  /** Önceden yerleşmiş yazılar. */
  readonly boxes: readonly Box[];
}

/**
 * Adaylardan en az çakışanı: grafik alanının dışına taşan, bir işaret çizgisinin ya da başka bir yazının
 * üstüne gelen aday ağır, eğriye değen her parça hafif cezalı; eşitlikte ilk aday.
 */
export function pickSpot(candidates: readonly Box[], obstacles: Obstacles, bounds: Box): Box {
  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    let cost = 0;
    if (c.x < bounds.x || c.y < bounds.y || c.x + c.w > bounds.x + bounds.w || c.y + c.h > bounds.y + bounds.h) cost += 10_000;
    for (const s of obstacles.lines) if (segmentHitsBox(s, c)) cost += 1_000;
    for (const b of obstacles.boxes) if (overlaps(b, c)) cost += 1_000;
    for (const s of obstacles.curves) {
      if (segmentHitsBox(s, c)) cost += 1;
      if (cost >= bestCost) break;
    }
    if (cost < bestCost) {
      best = c;
      bestCost = cost;
      if (cost === 0) break;
    }
  }
  return best;
}

export interface LegendItem {
  readonly x: number;
  readonly row: number;
}

/** Açıklama satırları: her ad bir renk çizgisi ve yazı; sığmayan bir alt satıra (soldan sağa). */
export function legendLayout(widths: readonly number[], width: number, swatch = 18, gap = 16): { readonly items: readonly LegendItem[]; readonly rows: number } {
  const items: LegendItem[] = [];
  let x = 0;
  let row = 0;
  for (const w of widths) {
    const need = swatch + w;
    if (x > 0 && x + need > width) {
      row++;
      x = 0;
    }
    items.push({ x, row });
    x += need + gap;
  }
  return { items, rows: widths.length > 0 ? row + 1 : 0 };
}
