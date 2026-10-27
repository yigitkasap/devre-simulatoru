// Kartın bakır yolları (three'siz, saf hesap): iki katmanlı, 45°'lik yollar, ızgara üzerinde A*
// araması (labirent yönlendirmesi), ardından kesin geometriyle tasarım kuralı denetimi (DRC).
//
// Kart delikli (THT) parçalardan oluştuğu için pedler iki yüzde de bakırdır: yol bir pede bir
// yüzden girip öbür yüzden çıkabilir. Via yalnızca yol arada yüz değiştirmek zorunda kalınca konur.
// Ağın pedleri en kısa ağaç sırasıyla (Prim) bağlanır: her bağlantı, ağın o ana kadar çizilmiş bütün
// bakırından başlar. Çizilemeyen bağlantı kalırsa o ağlar öne alınıp hepsi yeniden çizilir.
// Yolların izi ızgarada (0,635 mm), pedlerin merkezine kısa bir uçla bağlanır.

import type { PcbDesign } from './kicad';

export const RULES = {
  /** Izgara adımı (mm): 2,54'ün dörtte biri; pedler ızgaraya oturur. */
  grid: 0.635,
  /** Farklı ağların bakırları arasında en az (mm). */
  clearance: 0.25,
  /** Bakırın kart kenarına ve kaplamasız deliğe (montaj) uzaklığı (mm). */
  edge: 0.5,
  signal: 0.3,
  /** Güç ağları (GND, VCC): IPC-2221'e göre 1 oz bakırda ≈ 2 A. */
  power: 0.8,
  /** Güç yolu sığmazsa (ör. iki ped arasından) daha ince dener. */
  powerNarrow: 0.5,
  via: 0.8,
  viaDrill: 0.4,
} as const;

export const isPowerNet = (net: string) => net === 'GND' || net === 'VCC';

export type Layer = 0 | 1;

export interface Track {
  readonly net: string;
  /** 0 üst yüz (F.Cu), 1 alt yüz (B.Cu). */
  readonly layer: Layer;
  readonly width: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export interface Via {
  readonly net: string;
  readonly x: number;
  readonly y: number;
}

export interface Routing {
  readonly tracks: readonly Track[];
  readonly vias: readonly Via[];
  /** Bütün bağlantılar (ağ başına ped sayısı − 1). */
  readonly connections: number;
  /** Çizilemeyen bağlantılar: ağ ve hedef ped (ör. "R1.2"). */
  readonly unrouted: ReadonlyArray<{ readonly net: string; readonly pad: string }>;
}

// --- Geometri -----------------------------------------------------------------------------------------

/** Bakır şekli: daire (ped, via), kare (kare ped; r yarı kenar), kapsül (yol; r yarı genişlik). */
export type Shape =
  | { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: 'square'; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: 'seg'; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly r: number };

export interface Copper {
  readonly kind: 'pad' | 'track' | 'via';
  readonly net: string | null;
  /** Katman maskesi: 1 üst, 2 alt, 3 ikisi. */
  readonly layers: number;
  readonly shape: Shape;
  /** Kaplamasız delik (montaj): bakır değil, kenar payı ister. */
  readonly hole?: boolean;
  /** Hata iletilerinde ad (ör. "R1.2", "yol GND"). */
  readonly name: string;
}

function pointSeg(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
  return Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
}

const pointBox = (px: number, py: number, cx: number, cy: number, h: number) => Math.hypot(Math.max(Math.abs(px - cx) - h, 0), Math.max(Math.abs(py - cy) - h, 0));

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function segsIntersect(a0x: number, a0y: number, a1x: number, a1y: number, b0x: number, b0y: number, b1x: number, b1y: number): boolean {
  const d1 = cross(b0x, b0y, b1x, b1y, a0x, a0y);
  const d2 = cross(b0x, b0y, b1x, b1y, a1x, a1y);
  const d3 = cross(a0x, a0y, a1x, a1y, b0x, b0y);
  const d4 = cross(a0x, a0y, a1x, a1y, b1x, b1y);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segSeg(a0x: number, a0y: number, a1x: number, a1y: number, b0x: number, b0y: number, b1x: number, b1y: number): number {
  if (segsIntersect(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y)) return 0;
  return Math.min(pointSeg(a0x, a0y, b0x, b0y, b1x, b1y), pointSeg(a1x, a1y, b0x, b0y, b1x, b1y), pointSeg(b0x, b0y, a0x, a0y, a1x, a1y), pointSeg(b1x, b1y, a0x, a0y, a1x, a1y));
}

function segBox(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, h: number): number {
  // Kesişiyor mu (Liang–Barsky)?
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (clip(-dx, x0 - (cx - h)) && clip(dx, cx + h - x0) && clip(-dy, y0 - (cy - h)) && clip(dy, cy + h - y0)) return 0;
  const corners = [
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h],
  ] as const;
  return Math.min(pointBox(x0, y0, cx, cy, h), pointBox(x1, y1, cx, cy, h), ...corners.map(([px, py]) => pointSeg(px, py, x0, y0, x1, y1)));
}

/** İki bakır şeklinin kenarları arasındaki uzaklık (değiyorsa ≤ 0). */
export function gap(a: Shape, b: Shape): number {
  if (a.kind === 'square' && b.kind !== 'square') return gap(b, a);
  if (a.kind === 'seg' && b.kind === 'circle') return gap(b, a);
  if (a.kind === 'circle') {
    if (b.kind === 'circle') return Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r;
    if (b.kind === 'square') return pointBox(a.x, a.y, b.x, b.y, b.r) - a.r;
    return pointSeg(a.x, a.y, b.x0, b.y0, b.x1, b.y1) - a.r - b.r;
  }
  if (a.kind === 'seg') {
    if (b.kind === 'seg') return segSeg(a.x0, a.y0, a.x1, a.y1, b.x0, b.y0, b.x1, b.y1) - a.r - b.r;
    if (b.kind === 'square') return segBox(a.x0, a.y0, a.x1, a.y1, b.x, b.y, b.r) - a.r;
    return gap(b, a);
  }
  if (b.kind !== 'square') return gap(b, a);
  // kare–kare
  return Math.hypot(Math.max(Math.abs(a.x - b.x) - a.r - b.r, 0), Math.max(Math.abs(a.y - b.y) - a.r - b.r, 0));
}

function bounds(s: Shape): [number, number, number, number] {
  if (s.kind === 'seg') return [Math.min(s.x0, s.x1) - s.r, Math.min(s.y0, s.y1) - s.r, Math.max(s.x0, s.x1) + s.r, Math.max(s.y0, s.y1) + s.r];
  return [s.x - s.r, s.y - s.r, s.x + s.r, s.y + s.r];
}

/** Kartın pedleri bakır olarak (iki yüzde). */
export function padCopper(design: PcbDesign): Copper[] {
  return design.footprints.flatMap((f) =>
    f.pads.map((p) => ({
      kind: 'pad' as const,
      net: p.npth ? null : p.net,
      layers: 3,
      shape: { kind: p.shape === 'rect' ? ('square' as const) : ('circle' as const), x: p.x, y: p.y, r: p.size / 2 },
      hole: p.npth,
      name: p.npth ? f.ref : `${f.ref}.${p.number}`,
    })),
  );
}

export const trackCopper = (t: Track): Copper => ({
  kind: 'track',
  net: t.net,
  layers: t.layer === 0 ? 1 : 2,
  shape: { kind: 'seg', x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1, r: t.width / 2 },
  name: `yol ${t.net}`,
});

export const viaCopper = (v: Via): Copper => ({ kind: 'via', net: v.net, layers: 3, shape: { kind: 'circle', x: v.x, y: v.y, r: RULES.via / 2 }, name: `via ${v.net}` });

/** Sorguları hızlandıran kova ızgarası (kova 2,54 mm). */
class Buckets {
  private readonly cells = new Map<number, Copper[]>();
  constructor(private readonly reach: number) {}
  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  add(c: Copper) {
    const [x0, y0, x1, y1] = bounds(c.shape);
    const s = 2.54;
    for (let i = Math.floor((x0 - this.reach) / s); i <= Math.floor((x1 + this.reach) / s); i++) {
      for (let j = Math.floor((y0 - this.reach) / s); j <= Math.floor((y1 + this.reach) / s); j++) {
        const k = this.key(i, j);
        const list = this.cells.get(k);
        if (list) list.push(c);
        else this.cells.set(k, [c]);
      }
    }
  }
  /** (x, y) noktasının `reach` yakınındaki bütün bakırlar (fazlası olabilir). */
  near(x: number, y: number): readonly Copper[] {
    return this.cells.get(this.key(Math.floor(x / 2.54), Math.floor(y / 2.54))) ?? [];
  }
}

// --- Yönlendirme ---------------------------------------------------------------------------------------

const MARGIN = 0.02; // ızgara noktaları arasında kalan payı kapatır
const VIA_COST = 14;
const DIRS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
/** Katman tercihi: üstte yatay, altta dikey yollar ucuz (iki yüz birbirini kesmeden geçer). */
function stepCost(layer: Layer, d: number): number {
  const diagonal = d % 2 === 1;
  const horizontal = d === 0 || d === 4;
  const base = diagonal ? Math.SQRT2 : 1;
  if (diagonal) return base * 1.15;
  return base * ((layer === 0) === horizontal ? 1 : 1.35);
}
const TURN = [0, 0.15, 0.6]; // 0°, 45°, 90° dönüş; daha keskini yok

class Heap {
  private f = new Float64Array(1024);
  private s = new Int32Array(1024);
  size = 0;
  clear() {
    this.size = 0;
  }
  push(f: number, s: number) {
    if (this.size === this.f.length) {
      const nf = new Float64Array(this.f.length * 2);
      nf.set(this.f);
      this.f = nf;
      const ns = new Int32Array(this.s.length * 2);
      ns.set(this.s);
      this.s = ns;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[p]! <= f) break;
      this.f[i] = this.f[p]!;
      this.s[i] = this.s[p]!;
      i = p;
    }
    this.f[i] = f;
    this.s[i] = s;
  }
  pop(): number {
    const top = this.s[0]!;
    const f = this.f[--this.size]!;
    const s = this.s[this.size]!;
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.f[c + 1]! < this.f[c]!) c++;
      if (this.f[c]! >= f) break;
      this.f[i] = this.f[c]!;
      this.s[i] = this.s[c]!;
      i = c;
    }
    this.f[i] = f;
    this.s[i] = s;
    return top;
  }
}

interface PadRef {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly square: boolean;
}

/** Ağların pedleri ve en kısa ağaç sırası (Prim): her ped, bağlanmış pedlerin en yakınına. */
function netPads(design: PcbDesign): Map<string, PadRef[]> {
  const nets = new Map<string, PadRef[]>();
  for (const f of design.footprints) {
    for (const p of f.pads) {
      if (!p.net || p.npth) continue;
      const list = nets.get(p.net) ?? [];
      list.push({ name: `${f.ref}.${p.number}`, x: p.x, y: p.y, r: p.size / 2, square: p.shape === 'rect' });
      nets.set(p.net, list);
    }
  }
  for (const [net, pads] of nets) {
    const order = [pads[0]!];
    const left = pads.slice(1);
    while (left.length) {
      let best = 0;
      let bestD = Number.POSITIVE_INFINITY;
      left.forEach((p, i) => {
        const d = Math.min(...order.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      order.push(left.splice(best, 1)[0]!);
    }
    nets.set(net, order);
  }
  return nets;
}

const mstLength = (pads: readonly PadRef[]) => pads.slice(1).reduce((s, p, i) => s + Math.min(...pads.slice(0, i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y))), 0);

function routeAll(design: PcbDesign, order: readonly string[], nets: Map<string, PadRef[]>): Routing {
  const g = RULES.grid;
  const o = design.outline;
  // Izgara pedlere oturur: ilk pedden g adımlarla.
  const anchor = design.footprints.find((f) => f.partId)?.pads[0] ?? design.footprints[0]!.pads[0]!;
  const gx0 = anchor.x - Math.floor((anchor.x - o.x0) / g) * g;
  const gy0 = anchor.y - Math.floor((anchor.y - o.y0) / g) * g;
  const W = Math.floor((o.x1 - gx0) / g) + 1;
  const H = Math.floor((o.y1 - gy0) / g) + 1;
  const HW = 2 * W - 1;
  const HH = 2 * H - 1;

  const buckets = new Buckets(RULES.power / 2 + RULES.clearance + RULES.edge);
  for (const c of padCopper(design)) buckets.add(c);
  const viaList: Via[] = [];
  const tracks: Track[] = [];
  const unrouted: Array<{ net: string; pad: string }> = [];
  let connections = 0;

  // Arama tamponları (her aramada damga ile sıfırlanır).
  const states = W * H * 2 * 9;
  const gScore = new Float64Array(states);
  const from = new Int32Array(states);
  const seen = new Uint32Array(states);
  const done = new Uint32Array(states);
  const target = new Uint32Array(W * H);
  let stamp = 0;
  const heap = new Heap();

  for (const net of order) {
    const pads = nets.get(net)!;
    connections += pads.length - 1;
    // Ağın kendi bakırı (kaynak): ızgara hücreleri, katman başına.
    const own = [new Set<number>(), new Set<number>()];
    const cellsInPad = (p: PadRef) => {
      const out: number[] = [];
      const lim = p.r - 0.05;
      for (let iy = Math.max(0, Math.floor((p.y - p.r - gy0) / g)); iy <= Math.min(H - 1, Math.ceil((p.y + p.r - gy0) / g)); iy++) {
        for (let ix = Math.max(0, Math.floor((p.x - p.r - gx0) / g)); ix <= Math.min(W - 1, Math.ceil((p.x + p.r - gx0) / g)); ix++) {
          const dx = gx0 + ix * g - p.x;
          const dy = gy0 + iy * g - p.y;
          if (p.square ? Math.abs(dx) <= lim && Math.abs(dy) <= lim : Math.hypot(dx, dy) <= lim) out.push(iy * W + ix);
        }
      }
      return out;
    };
    const padAt = new Map<number, PadRef>();
    const addPad = (p: PadRef) => {
      for (const c of cellsInPad(p)) {
        own[0]!.add(c);
        own[1]!.add(c);
        padAt.set(c, p);
      }
    };
    addPad(pads[0]!);

    {
      const width = isPowerNet(net) ? RULES.power : RULES.signal;
      // Nokta yasallığı (yarım ızgara; katman başına): 0 bilinmiyor, 1 yasal, 2 değil.
      const legal = [new Uint8Array(HW * HH), new Uint8Array(HW * HH)];
      const legalNarrow = [new Uint8Array(HW * HH), new Uint8Array(HW * HH)];
      const viaOk = new Uint8Array(W * H);
      const pointLegal = (hx: number, hy: number, layer: Layer, r: number, cache: Uint8Array[]) => {
        const k = hy * HW + hx;
        const c = cache[layer]![k]!;
        if (c) return c === 1;
        const x = gx0 + (hx * g) / 2;
        const y = gy0 + (hy * g) / 2;
        let ok = x - r >= o.x0 + RULES.edge && x + r <= o.x1 - RULES.edge && y - r >= o.y0 + RULES.edge && y + r <= o.y1 - RULES.edge;
        if (ok) {
          const me: Shape = { kind: 'circle', x, y, r };
          const mask = layer === 0 ? 1 : 2;
          for (const item of buckets.near(x, y)) {
            if (!(item.layers & mask) || (item.net === net && !item.hole)) continue;
            if (gap(me, item.shape) < (item.hole ? RULES.edge : RULES.clearance) + MARGIN) {
              ok = false;
              break;
            }
          }
        }
        cache[layer]![k] = ok ? 1 : 2;
        return ok;
      };
      const viaLegal = (ix: number, iy: number) => {
        const k = iy * W + ix;
        if (viaOk[k]) return viaOk[k] === 1;
        const x = gx0 + ix * g;
        const y = gy0 + iy * g;
        const r = RULES.via / 2;
        let ok = x - r >= o.x0 + RULES.edge && x + r <= o.x1 - RULES.edge && y - r >= o.y0 + RULES.edge && y + r <= o.y1 - RULES.edge;
        if (ok) {
          const me: Shape = { kind: 'circle', x, y, r };
          for (const item of buckets.near(x, y)) {
            // Via hiçbir pede (kendi ağınınkine de) ve başka via'ya yaklaşmaz: delikler ayrı kalsın.
            if (item.net === net && item.kind === 'track') continue;
            if (gap(me, item.shape) < (item.hole ? RULES.edge : RULES.clearance) + MARGIN) {
              ok = false;
              break;
            }
          }
        }
        viaOk[k] = ok ? 1 : 2;
        return ok;
      };

      for (const pad of pads.slice(1)) {
        if (cellsInPad(pad).some((c) => own[0]!.has(c) || own[1]!.has(c))) {
          // Önceki bir yol bu pedin üstünden geçti: zaten bağlı.
          addPad(pad);
          continue;
        }
        let path: number[] | null = null;
        let usedWidth: number = width;
        for (const [w, cache] of isPowerNet(net)
          ? ([
              [width, legal],
              [RULES.powerNarrow, legalNarrow],
            ] as const)
          : ([[width, legal]] as const)) {
          path = search(pad, w / 2, cache);
          if (path) {
            usedWidth = w;
            break;
          }
        }
        if (!path) {
          unrouted.push({ net, pad: pad.name });
          continue;
        }
        commit(path, pad, usedWidth);
      }

      function search(pad: PadRef, r: number, cache: Uint8Array[]): number[] | null {
        stamp++;
        heap.clear();
        const targets = cellsInPad(pad);
        for (const c of targets) target[c] = stamp;
        const h = (cell: number) => {
          const ix = cell % W;
          const iy = (cell - ix) / W;
          const dx = Math.abs(gx0 + ix * g - pad.x) / g;
          const dy = Math.abs(gy0 + iy * g - pad.y) / g;
          return Math.max(0, Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy) - pad.r / g);
        };
        for (const layer of [0, 1] as const) {
          for (const cell of own[layer]!) {
            const ix = cell % W;
            const iy = (cell - ix) / W;
            if (!pointLegal(2 * ix, 2 * iy, layer, r, cache)) continue;
            const s = (cell * 2 + layer) * 9 + 8;
            seen[s] = stamp;
            gScore[s] = 0;
            from[s] = -1;
            heap.push(h(cell), s);
          }
        }
        let expansions = 0;
        while (heap.size) {
          const s = heap.pop();
          if (done[s] === stamp) continue;
          done[s] = stamp;
          const dir = s % 9;
          const layer = ((s - dir) / 9) % 2;
          const cell = ((s - dir) / 9 - layer) / 2;
          if (target[cell] === stamp) {
            const out: number[] = [];
            for (let t = s; t !== -1; t = from[t]!) out.push(t);
            return out.reverse();
          }
          if (++expansions > 400_000) return null;
          const ix = cell % W;
          const iy = (cell - ix) / W;
          const g0 = gScore[s]!;
          for (let d = 0; d < 8; d++) {
            let turn = 0;
            if (dir !== 8) {
              const diff = Math.min(Math.abs(d - dir), 8 - Math.abs(d - dir));
              if (diff > 2) continue;
              turn = TURN[diff]!;
            }
            const nx = ix + DIRS[d]![0];
            const ny = iy + DIRS[d]![1];
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            if (!pointLegal(ix + nx, iy + ny, layer as Layer, r, cache) || !pointLegal(2 * nx, 2 * ny, layer as Layer, r, cache)) continue;
            const ncell = ny * W + nx;
            const ns = (ncell * 2 + layer) * 9 + d;
            const ng = g0 + stepCost(layer as Layer, d) + turn;
            if (seen[ns] === stamp && gScore[ns]! <= ng) continue;
            seen[ns] = stamp;
            gScore[ns] = ng;
            from[ns] = s;
            heap.push(ng + h(ncell), ns);
          }
          // Via: aynı noktada öbür yüze.
          if (viaLegal(ix, iy) && pointLegal(2 * ix, 2 * iy, (1 - layer) as Layer, r, cache)) {
            const ns = (cell * 2 + (1 - layer)) * 9 + 8;
            const ng = g0 + VIA_COST;
            if (!(seen[ns] === stamp && gScore[ns]! <= ng)) {
              seen[ns] = stamp;
              gScore[ns] = ng;
              from[ns] = s;
              heap.push(ng + h(cell), ns);
            }
          }
        }
        return null;
      }

      function commit(path: number[], pad: PadRef, w: number) {
        const point = (s: number) => {
          const dir = s % 9;
          const layer = ((s - dir) / 9) % 2;
          const cell = ((s - dir) / 9 - layer) / 2;
          const ix = cell % W;
          return { cell, layer: layer as Layer, x: gx0 + ix * g, y: gy0 + ((cell - ix) / W) * g };
        };
        const pts = path.map(point);
        // Uçlar: yol pedden çıkıyorsa ve pede giriyorsa ped merkezine kısa uç.
        const startPad = padAt.get(pts[0]!.cell);
        const runs: Array<{ layer: Layer; xs: number[]; ys: number[] }> = [];
        let run = { layer: pts[0]!.layer, xs: [] as number[], ys: [] as number[] };
        if (startPad) {
          run.xs.push(startPad.x);
          run.ys.push(startPad.y);
        }
        for (const p of pts) {
          if (p.layer !== run.layer) {
            viaList.push({ net, x: p.x, y: p.y });
            buckets.add(viaCopper({ net, x: p.x, y: p.y }));
            runs.push(run);
            run = { layer: p.layer, xs: [], ys: [] };
          }
          run.xs.push(p.x);
          run.ys.push(p.y);
          own[p.layer]!.add(p.cell);
        }
        run.xs.push(pad.x);
        run.ys.push(pad.y);
        runs.push(run);
        for (const r of runs) {
          // Aynı doğrultudaki adımları birleştir.
          const vx: number[] = [r.xs[0]!];
          const vy: number[] = [r.ys[0]!];
          for (let i = 1; i < r.xs.length; i++) {
            const x = r.xs[i]!;
            const y = r.ys[i]!;
            if (Math.abs(x - vx[vx.length - 1]!) < 1e-9 && Math.abs(y - vy[vy.length - 1]!) < 1e-9) continue;
            if (vx.length >= 2) {
              const ax = vx[vx.length - 2]!;
              const ay = vy[vy.length - 2]!;
              const bx = vx[vx.length - 1]!;
              const by = vy[vy.length - 1]!;
              if (Math.abs(cross(ax, ay, bx, by, x, y)) < 1e-9 && (bx - ax) * (x - bx) + (by - ay) * (y - by) > 0) {
                vx[vx.length - 1] = x;
                vy[vy.length - 1] = y;
                continue;
              }
            }
            vx.push(x);
            vy.push(y);
          }
          for (let i = 1; i < vx.length; i++) {
            const t: Track = { net, layer: r.layer, width: w, x0: round(vx[i - 1]!), y0: round(vy[i - 1]!), x1: round(vx[i]!), y1: round(vy[i]!) };
            tracks.push(t);
            buckets.add(trackCopper(t));
          }
        }
        addPad(pad);
      }
    }
  }
  return { tracks, vias: viaList.map((v) => ({ net: v.net, x: round(v.x), y: round(v.y) })), connections, unrouted };
}

const round = (v: number) => Math.round(v * 10000) / 10000;

/** Kartın bütün ağlarını çizer; çizilemeyen kalırsa o ağları öne alıp en çok 6 kez yeniden dener. */
export function routePcb(design: PcbDesign): Routing {
  const nets = netPads(design);
  // Önce güç ağları (kartın omurgası), sonra kısadan uzuna.
  let order = [...nets.keys()].filter((n) => nets.get(n)!.length > 1);
  order.sort((a, b) => Number(isPowerNet(b)) - Number(isPowerNet(a)) || mstLength(nets.get(a)!) - mstLength(nets.get(b)!) || a.localeCompare(b));
  let best: Routing | null = null;
  for (let pass = 0; pass < 6; pass++) {
    const result = routeAll(design, order, nets);
    if (!best || result.unrouted.length < best.unrouted.length) best = result;
    if (result.unrouted.length === 0) break;
    const failed = [...new Set(result.unrouted.map((u) => u.net))];
    order = [...failed, ...order.filter((n) => !failed.includes(n))];
  }
  return best!;
}

// --- Tasarım kuralı denetimi -----------------------------------------------------------------------------

export interface DrcResult {
  /** Kural ihlalleri (aralık, kenar). */
  readonly violations: readonly string[];
  /** Ağ başına birbirine bağlanmamış ped grupları (1'den fazlaysa bağlantı eksik). */
  readonly islands: ReadonlyMap<string, number>;
}

export function checkPcb(design: PcbDesign, routing: Routing): DrcResult {
  const items: Copper[] = [...padCopper(design), ...routing.tracks.map(trackCopper), ...routing.vias.map(viaCopper)];
  const violations: string[] = [];
  const o = design.outline;
  const buckets = new Buckets(RULES.power + RULES.clearance + RULES.edge);
  items.forEach((c) => buckets.add(c));
  const index = new Map(items.map((c, i) => [c, i]));
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < items.length; i++) {
    const a = items[i]!;
    const [x0, y0, x1, y1] = bounds(a.shape);
    if (!a.hole && (x0 < o.x0 + RULES.edge - 1e-6 || y0 < o.y0 + RULES.edge - 1e-6 || x1 > o.x1 - RULES.edge + 1e-6 || y1 > o.y1 - RULES.edge + 1e-6)) {
      violations.push(`${a.name}: kart kenarına ${RULES.edge} mm'den yakın`);
    }
    // Yakındaki bakırlar: şeklin köşelerindeki ve ortasındaki kovalardan.
    const near = new Set<Copper>();
    for (let x = x0; x <= x1 + 2.54; x += 2.54) for (let y = y0; y <= y1 + 2.54; y += 2.54) buckets.near(Math.min(x, x1), Math.min(y, y1)).forEach((c) => near.add(c));
    for (const b of near) {
      const j = index.get(b)!;
      if (j <= i || !(a.layers & b.layers)) continue;
      const d = gap(a.shape, b.shape);
      if (a.net !== null && a.net === b.net && !a.hole && !b.hole) {
        if (d <= 1e-6) parent[find(i)] = find(j);
        continue;
      }
      const need = a.hole || b.hole ? RULES.edge : RULES.clearance;
      if (d < need - 1e-6) violations.push(`${a.name} ↔ ${b.name}: ${Math.max(0, d).toFixed(3)} mm (en az ${need} mm)`);
    }
  }
  const islands = new Map<string, number>();
  const roots = new Map<string, Set<number>>();
  items.forEach((c, i) => {
    if (c.net === null || c.hole || c.kind !== 'pad') return;
    const set = roots.get(c.net) ?? new Set<number>();
    set.add(find(i));
    roots.set(c.net, set);
  });
  for (const [net, set] of roots) islands.set(net, set.size);
  return { violations, islands };
}
