// 3B tezgâh, "üstüne gelince vurgu yok" (2026-11-14): fareyle üstüne gelmek hiçbir şeyi vurgulamaz ve
// soluklaştırmaz; ağ vurgusu yalnızca tıklayınca ya da dokununca (scene.ts, ios-kontrol "3B üstüne gelme").
//   1. Üstüne gelme beklemesi (Dwell): imleç aynı nesnenin üstünde 200 ms durunca etiketi açılır, ayrılınca hemen
//      kapanır; hızlı geçişte hiçbir şey açılmaz.
//   2. Telefondaki hareket ipucunun yeri (floatSpot): görünen hiçbir etikete değmeyen ilk satır, tercihen tahtanın
//      üstünde, orada yer yoksa altında (gerekirse iki satır); yer yoksa ipucu gösterilmez.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dwell, HOVER_DELAY, floatSpot, type FloatSpot, type Rect } from '../src/bench3d/hover';

describe('üstüne gelme beklemesi', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const dwell = () => {
    const seen: Array<string | null> = [];
    return { seen, d: new Dwell<string>((target) => seen.push(target)) };
  };

  it('bekleme 200 ms', () => {
    expect(HOVER_DELAY).toBe(200);
  });

  it('imleç aynı nesnenin üstünde 200 ms durunca açılır, daha önce değil', () => {
    const { seen, d } = dwell();
    d.over('part R1', 'R1');
    vi.advanceTimersByTime(HOVER_DELAY - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['R1']);
  });

  it('aynı nesnenin üstünde gezinmek süreyi yeniden başlatmaz', () => {
    const { seen, d } = dwell();
    d.over('part R1', 'R1');
    vi.advanceTimersByTime(150);
    d.over('part R1', 'R1');
    vi.advanceTimersByTime(50);
    expect(seen).toEqual(['R1']);
  });

  it('hızlı geçişte hiçbir şey açılmaz', () => {
    const { seen, d } = dwell();
    for (const id of ['R1', 'D1', 'A1', 'V1', 'PS1']) {
      d.over(`part ${id}`, id);
      vi.advanceTimersByTime(60);
    }
    d.clear();
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
  });

  it('imleç ayrılınca hemen kapanır', () => {
    const { seen, d } = dwell();
    d.over('post A1#0', 'A1 +');
    vi.advanceTimersByTime(HOVER_DELAY);
    d.clear();
    expect(seen).toEqual(['A1 +', null]);
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual(['A1 +', null]);
  });

  it('başka nesneye geçince açık olan hemen kapanır, yenisi 200 ms sonra açılır', () => {
    const { seen, d } = dwell();
    d.over('part R1', 'R1');
    vi.advanceTimersByTime(HOVER_DELAY);
    d.over('part D1', 'D1');
    expect(seen).toEqual(['R1', null]);
    vi.advanceTimersByTime(HOVER_DELAY - 1);
    expect(seen).toEqual(['R1', null]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual(['R1', null, 'D1']);
  });

  it('açık bir şey yokken ayrılmak geri çağrı üretmez', () => {
    const { seen, d } = dwell();
    d.clear();
    d.over('part R1', 'R1');
    vi.advanceTimersByTime(100);
    d.clear();
    expect(seen).toEqual([]);
  });
});

describe('hareket ipucunun yeri', () => {
  const GAP = 4;
  const X0 = 12;
  // Tek satır ve iki satır.
  const shapes = [
    { w: 300, h: 24 },
    { w: 180, h: 40 },
  ];
  const range = { top: 56, boardTop: 300, boardBottom: 520, bottom: 600 };
  const touches = (spot: FloatSpot, r: Rect) => {
    const { w, h } = shapes[spot.shape]!;
    return X0 < r.x1 + GAP && X0 + w > r.x0 - GAP && spot.y < r.y1 + GAP && spot.y + h > r.y0 - GAP;
  };
  const overBoard = (spot: FloatSpot) => spot.y + shapes[spot.shape]!.h > range.boardTop && spot.y < range.boardBottom;

  it('etiket yokken Şema | 3B düğmesinin hemen altında, tek satır', () => {
    expect(floatSpot(X0, shapes, [], range, null, GAP)).toEqual({ shape: 0, y: 56 });
  });

  it('üstteki etiketin altına kayar, hiçbir etikete değmez', () => {
    const labels: Rect[] = [
      { x0: 0, y0: 57, x1: 107, y1: 85 },
      { x0: 233, y0: 69, x1: 357, y1: 97 },
    ];
    const spot = floatSpot(X0, shapes, labels, range, null, GAP)!;
    expect(spot.shape).toBe(0);
    expect(spot.y).toBeGreaterThanOrEqual(97 + GAP);
    expect(labels.some((r) => touches(spot, r))).toBe(false);
    expect(overBoard(spot)).toBe(false);
  });

  it('yanındaki (yatayda ayrı) etiket engel değil', () => {
    expect(floatSpot(X0, shapes, [{ x0: 330, y0: 50, x1: 380, y1: 90 }], range, null, GAP)).toEqual({ shape: 0, y: 56 });
  });

  it('tek satır sığmıyorsa iki satır olur (sağda etiket varken)', () => {
    const labels: Rect[] = [{ x0: 210, y0: 40, x1: 390, y1: 300 }];
    const spot = floatSpot(X0, shapes, labels, range, null, GAP)!;
    expect(spot).toEqual({ shape: 1, y: 56 });
  });

  it('tahtanın üstünde yer yoksa tahtanın altına iner (yatay telefon: direk adları üstte), tahtanın üstüne binmez', () => {
    // Yatay telefon: tuval 523 × 333, tahta 87–268, direk adları 25–73, düğmeler sağ altta.
    const landscape = { top: 56, boardTop: 87, boardBottom: 268, bottom: 325 };
    const taken: Rect[] = [
      { x0: 131, y0: 55, x1: 173, y1: 73 },
      { x0: 157, y0: 25, x1: 199, y1: 43 },
      { x0: 240, y0: 55, x1: 275, y1: 73 },
      { x0: 263, y0: 279, x1: 463, y1: 323 },
    ];
    const spot = floatSpot(X0, shapes, taken, landscape, null, GAP)!;
    expect(spot.shape).toBe(1);
    expect(spot.y).toBeGreaterThanOrEqual(268);
    expect(spot.y + shapes[1]!.h).toBeLessThanOrEqual(325);
    expect(taken.some((r) => touches(spot, r))).toBe(false);
  });

  it('ne üstte ne altta yer varsa tahtanın üstüne biner; hiç yer yoksa gösterilmez', () => {
    const walls: Rect[] = [
      { x0: 0, y0: 40, x1: 390, y1: 290 },
      { x0: 0, y0: 500, x1: 390, y1: 600 },
    ];
    const spot = floatSpot(X0, shapes, walls, range, null, GAP)!;
    expect(overBoard(spot)).toBe(true);
    expect(walls.some((r) => touches(spot, r))).toBe(false);
    expect(floatSpot(X0, shapes, [{ x0: 0, y0: 0, x1: 390, y1: 600 }], range, null, GAP)).toBeNull();
  });

  it('şimdiki yeri boşsa orada kalır; etiket üstüne gelince yer değiştirir; tahtanın üstüne binmişse geri çıkar', () => {
    expect(floatSpot(X0, shapes, [], range, { shape: 0, y: 120 }, GAP)).toEqual({ shape: 0, y: 120 });
    const label: Rect[] = [{ x0: 100, y0: 110, x1: 200, y1: 130 }];
    const spot = floatSpot(X0, shapes, label, range, { shape: 0, y: 120 }, GAP)!;
    expect(spot.y).not.toBe(120);
    expect(label.some((r) => touches(spot, r))).toBe(false);
    expect(floatSpot(X0, shapes, [], range, { shape: 0, y: 400 }, GAP)).toEqual({ shape: 0, y: 56 });
  });

  it('81 rastgele etiket düzeninde ipucu ya hiçbir etikete değmez ya da gösterilmez', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    let shown = 0;
    for (let k = 0; k < 81; k++) {
      const labels: Rect[] = Array.from({ length: 4 + Math.floor(rnd() * 14) }, () => {
        const x0 = rnd() * 330;
        const y0 = rnd() * 560;
        return { x0, y0, x1: x0 + 40 + rnd() * 100, y1: y0 + 18 + rnd() * 30 };
      });
      const spot = floatSpot(X0, shapes, labels, range, null, GAP);
      if (spot === null) continue;
      shown++;
      expect(spot.y).toBeGreaterThanOrEqual(range.top);
      expect(spot.y + shapes[spot.shape]!.h).toBeLessThanOrEqual(range.bottom);
      expect(labels.some((r) => touches(spot, r))).toBe(false);
    }
    expect(shown).toBeGreaterThan(40);
  });
});
