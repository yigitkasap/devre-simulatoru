// 3B tezgâh: farenin üstüne gelme beklemesi ve telefondaki hareket ipucunun yeri (sahneden bağımsız, sınanabilir).
//
// Üstüne gelmek hiçbir şeyi vurgulamaz ve soluklaştırmaz (ağ vurgusu yalnızca tıklayınca ya da dokununca: scene.ts).
// Üstüne gelince yalnızca gizli etiket ve direğin açık adı açılır; o da imleç aynı nesnenin üstünde HOVER_DELAY
// kadar durunca. İmleç ayrılınca hemen kapanır: hızlı geçişte hiçbir şey yanıp sönmez.

/** İmleç aynı nesnenin üstünde bu kadar durunca etiketi açılır (ms). */
export const HOVER_DELAY = 200;

/**
 * Üstüne gelme beklemesi. `over(key, target)`: imlecin altındaki nesne (yoksa null). Nesne değişince açık olan hemen
 * kapanır (`show(null)`), yenisi `delay` ms sonra açılır (`show(target)`); aynı nesnenin üstünde gezinmek süreyi
 * yeniden başlatmaz.
 */
export class Dwell<T> {
  private key: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private open = false;

  constructor(
    private readonly show: (target: T | null) => void,
    private readonly delay = HOVER_DELAY,
  ) {}

  over(key: string | null, target: T | null): void {
    if (key === this.key) return;
    this.key = key;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.open) {
      this.open = false;
      this.show(null);
    }
    if (key === null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.open = true;
      this.show(target);
    }, this.delay);
  }

  /** İmleç ayrıldı (ya da düğmeye basıldı): bekleyen iptal, açık olan kapanır. */
  clear(): void {
    this.over(null, null);
  }
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** İpucunun denenen satırları arasındaki adım (px). */
const FLOAT_STEP = 4;

/** İpucunun biçimi (tek satır, dar yerde iki satır) ve üst kenarı (px). */
export interface FloatSpot {
  shape: number;
  y: number;
}

/**
 * Yüzen ipucunun yeri: `taken` dikdörtgenlerinin (görünen etiketler, tuvalin üstündeki denetimler, alttaki düğmeler)
 * hiçbirine `gap` pikselden fazla yaklaşmayan ilk satır. `shapes`: ipucunun olası boyutları, tercih sırasıyla (tek
 * satır, iki satır). Önce tahtanın üstü (`top` ile `boardTop` arası), sonra tahtanın altı (`boardBottom` ile `bottom`
 * arası); ikisinde de yer yoksa tahtanın üstüne biner. Şimdiki yeri (`current`) hâlâ boşsa ve tahtanın üstüne
 * binmiyorsa orada kalır (etiketler kıpırdadıkça ipucu zıplamasın). Hiç yer yoksa null: ipucu gösterilmez, etiket
 * örtülmez.
 */
export function floatSpot(
  x0: number,
  shapes: ReadonlyArray<{ w: number; h: number }>,
  taken: readonly Rect[],
  range: { top: number; boardTop: number; boardBottom: number; bottom: number },
  current: FloatSpot | null,
  gap: number,
): FloatSpot | null {
  const free = (k: number, y: number) => {
    const { w, h } = shapes[k]!;
    return !taken.some((r) => x0 < r.x1 + gap && x0 + w > r.x0 - gap && y < r.y1 + gap && y + h > r.y0 - gap);
  };
  const scan = (k: number, from: number, to: number): FloatSpot | null => {
    for (let y = from; y + shapes[k]!.h <= to; y += FLOAT_STEP) if (free(k, y)) return { shape: k, y };
    return null;
  };
  const above = Math.min(range.boardTop, range.bottom);
  const below = Math.max(range.top, range.boardBottom + gap);
  if (current !== null && shapes[current.shape] !== undefined && current.y >= range.top && free(current.shape, current.y)) {
    const end = current.y + shapes[current.shape]!.h;
    if (end <= above || (current.y >= below && end <= range.bottom)) return current;
  }
  for (const [from, to] of [[range.top, above], [below, range.bottom]] as const) {
    for (let k = 0; k < shapes.length; k++) {
      const spot = scan(k, from, to);
      if (spot) return spot;
    }
  }
  for (let k = 0; k < shapes.length; k++) {
    const spot = scan(k, range.top, range.bottom);
    if (spot) return spot;
  }
  return null;
}
