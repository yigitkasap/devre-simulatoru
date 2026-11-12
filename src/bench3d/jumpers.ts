// Tahta üstü teller (three'nin yalnızca matematik sınıfları, DOM yok): köprü tellerinin (jumper) biçimi ve tahtadaki
// nesnelerin çakışma ilkelleri. Köprüler, fişler ve parça gövdeleri birbirinin içine girmesin diye her telin
// yüksekliği ve yana açılması en yakın çakışmasız biçime çekilir (delikler değişmez).
//
// Kıskaç ve kısa test teli yok (2026-11-12, "3B: okunurluk önce"): cihaz kabloları tahtaya gelmez, taban
// plakasının arka kenarındaki bağlantı direklerine takılır (posts.ts).

import { Vector3 } from 'three';
import { BB, holeXZ, type BreadboardPlan, type Hole } from './breadboard';
import { JUMPER_RADIUS, jumperCurve, jumperLift, type JumperShape } from './breadboardModel';
import { POST_WIRE } from './posts';

/** Masadaki parçaların (pil, Arduino…) dupont fişi: kesiti bir delik aralığından dar (birim). */
export const PLUG = { width: 0.75, height: 1.5 } as const;
/** Kabloların yarıçapı (birim). */
export const CABLE_RADIUS = 0.28;


/** Kapsül (iki uç, yarıçap) ya da yönlü kutu (merkez, eksenler, yarı boylar). `owner`: ait olduğu nesne. */
export type Prim =
  | { readonly kind: 'capsule'; readonly a: Vector3; readonly b: Vector3; readonly r: number; readonly owner: string }
  | { readonly kind: 'box'; readonly c: Vector3; readonly u: readonly [Vector3, Vector3, Vector3]; readonly e: readonly [number, number, number]; readonly owner: string };

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** Dünya eksenlerine hizalı kutu. */
export function boxPrim(min: Vector3, max: Vector3, owner: string): Prim {
  const c = min.clone().add(max).multiplyScalar(0.5);
  return { kind: 'box', c, u: [X, Y, Z], e: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2], owner };
}

/** İki doğru parçasının en yakın uzaklığı. */
function segmentDistance(p1: Vector3, q1: Vector3, p2: Vector3, q2: Vector3): number {
  const d1 = q1.clone().sub(p1);
  const d2 = q2.clone().sub(p2);
  const r = p1.clone().sub(p2);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return p1.distanceTo(p2);
  if (a <= 1e-12) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = d1.dot(r);
    if (e <= 1e-12) s = Math.min(1, Math.max(0, -c / a));
    else {
      const b = d1.dot(d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return p1.clone().addScaledVector(d1, s).distanceTo(p2.clone().addScaledVector(d2, t));
}

/** Noktanın yönlü kutuya uzaklığı (içindeyse 0). */
function boxDistance(p: Vector3, box: Extract<Prim, { kind: 'box' }>): number {
  const d = p.clone().sub(box.c);
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    const v = Math.abs(d.dot(box.u[i]!)) - box.e[i]!;
    if (v > 0) sum += v * v;
  }
  return Math.sqrt(sum);
}

/** İki yönlü kutu kesişiyor mu (ayırma ekseni sınaması). */
function boxesOverlap(A: Extract<Prim, { kind: 'box' }>, B: Extract<Prim, { kind: 'box' }>, margin: number): boolean {
  const t = B.c.clone().sub(A.c);
  const axes: Vector3[] = [...A.u, ...B.u];
  for (const a of A.u) for (const b of B.u) {
    const c = new Vector3().crossVectors(a, b);
    if (c.lengthSq() > 1e-9) axes.push(c.normalize());
  }
  for (const L of axes) {
    const ra = A.e.reduce((s, e, i) => s + e * Math.abs(A.u[i]!.dot(L)), 0);
    const rb = B.e.reduce((s, e, i) => s + e * Math.abs(B.u[i]!.dot(L)), 0);
    if (Math.abs(t.dot(L)) > ra + rb - margin) return false;
  }
  return true;
}

/** İlkeli çevreleyen küre (hızlı eleme). */
const spheres = new WeakMap<Prim, { c: Vector3; r: number }>();
function sphereOf(p: Prim): { c: Vector3; r: number } {
  let s = spheres.get(p);
  if (!s) {
    s = p.kind === 'capsule' ? { c: p.a.clone().add(p.b).multiplyScalar(0.5), r: p.a.distanceTo(p.b) / 2 + p.r } : { c: p.c, r: Math.hypot(p.e[0], p.e[1], p.e[2]) };
    spheres.set(p, s);
  }
  return s;
}

/** İki ilkel birbirinin içine giriyor mu (`margin` kadar değme sayılmaz). */
export function primsOverlap(p: Prim, q: Prim, margin = 0.02): boolean {
  const sp = sphereOf(p);
  const sq = sphereOf(q);
  if (sp.c.distanceTo(sq.c) > sp.r + sq.r) return false;
  if (p.kind === 'capsule' && q.kind === 'capsule') return segmentDistance(p.a, p.b, q.a, q.b) < p.r + q.r - margin;
  if (p.kind === 'box' && q.kind === 'box') return boxesOverlap(p, q, margin);
  const cap = (p.kind === 'capsule' ? p : q) as Extract<Prim, { kind: 'capsule' }>;
  const box = (p.kind === 'box' ? p : q) as Extract<Prim, { kind: 'box' }>;
  const length = cap.a.distanceTo(cap.b);
  const n = Math.max(2, Math.ceil(length / Math.max(0.05, cap.r * 0.5)) + 1);
  const at = new Vector3();
  for (let i = 0; i < n; i++) {
    at.lerpVectors(cap.a, cap.b, i / (n - 1));
    if (boxDistance(at, box) < cap.r - margin) return true;
  }
  return false;
}

// --- Tahtadaki sabit nesneler ---------------------------------------------------------------------------------

/**
 * Tahtadaki parçanın gövdesi (bacaksız; eksenli ve dik iki bacaklı parçalarda modelin işaretli gövdesi, öbürlerinde
 * bütün model): ince bacaklar sayılmaz, kısa tel gövdenin altından geçebilir.
 */
export interface BoardBody {
  readonly body: { readonly min: Vector3; readonly max: Vector3 };
}

/** Kartın üstünde ne kadar yukarıdan başlayan kısım parça sayılır (bacakların deliğe giren uçları değil). */
const ABOVE = 0.3;

function partPrim(id: string, b: { readonly min: Vector3; readonly max: Vector3 }): Prim | null {
  const min = b.min.clone().setY(Math.max(b.min.y, BB.height + ABOVE));
  if (b.max.y <= min.y) return null;
  return boxPrim(min, b.max.clone(), `part:${id}`);
}

const holeTopOf = (h: Hole, cols: number) => {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, BB.height, z);
};

/** Masadaki parçanın (pil, Arduino…) dupont fişi ve fişten kalkan kablonun başı. */
function plugPrims(at: Vector3, owner: string): Prim[] {
  return [
    boxPrim(new Vector3(at.x - PLUG.width / 2, at.y, at.z - PLUG.width / 2), new Vector3(at.x + PLUG.width / 2, at.y + PLUG.height, at.z + PLUG.width / 2), owner),
    { kind: 'capsule', a: at.clone().setY(at.y + PLUG.height), b: at.clone().setY(at.y + PLUG.height + 1.5), r: CABLE_RADIUS, owner },
  ];
}

/** Jumper telinin ilkelleri: eğrinin üstünde sık noktalar arası kapsüller. */
function jumperPrims(a: Vector3, b: Vector3, shape: JumperShape, owner: string): Prim[] {
  const pts = jumperCurve(a, b, shape).getPoints(Math.max(10, Math.round(a.distanceTo(b) * 1.5)));
  const out: Prim[] = [];
  for (let k = 1; k < pts.length; k++) out.push({ kind: 'capsule', a: pts[k - 1]!, b: pts[k]!, r: JUMPER_RADIUS, owner });
  return out;
}

/** Direkten deliğe giden telin ilkelleri (köşe noktaları arası kapsüller). */
export function wirePrims(points: readonly Vector3[], owner: string): Prim[] {
  return points.slice(1).map((b, i) => ({ kind: 'capsule' as const, a: points[i]!, b, r: POST_WIRE.radius, owner }));
}

const NONE: ReadonlySet<number> = new Set();
const NO_BODIES: ReadonlyMap<string, BoardBody> = new Map();

/** Jumper telinin en çok yüksekliği (kartın üstünden, birim). */
const MAX_LIFT = 7;
/** En alçak tel (kartın üstünden, birim). */
const MIN_LIFT = 0.3;
/** Üst üste geçen iki tel arasındaki yükseklik farkı (birim): iki kat parça gövdelerinin (CLEAR) altına sığar. */
const LAYER = 0.5;
/** Parça gövdelerinin altında kalan en yüksek tel (birim): bunun üstü gövdelerin üstünden aşar. */
const UNDER = 0.85;
/** Yana açılma seçenekleri (birim; eksi: telin solu). */
const BOWS = [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4];

/** İlkellerin kapladığı kutu (hızlı eleme). */
function boundsOf(prims: readonly Prim[]): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const p of prims) {
    const s = sphereOf(p);
    min.min(s.c.clone().subScalar(s.r));
    max.max(s.c.clone().addScalar(s.r));
  }
  return { min, max };
}
const boundsMeet = (a: { min: Vector3; max: Vector3 }, b: { min: Vector3; max: Vector3 }) =>
  a.min.x <= b.max.x && b.min.x <= a.max.x && a.min.y <= b.max.y && b.min.y <= a.max.y && a.min.z <= b.max.z && b.min.z <= a.max.z;

/** `p` noktası (yatayda) a–b doğru parçasının iç kısmının üstünde mi; öyleyse doğru parçasındaki yeri (0–1), değilse null. */
function under(p: Vector3, a: Vector3, b: Vector3, reach: number): number | null {
  const ab = new Vector3(b.x - a.x, 0, b.z - a.z);
  const len2 = ab.lengthSq();
  if (len2 < 1e-9) return null;
  const t = ((p.x - a.x) * ab.x + (p.z - a.z) * ab.z) / len2;
  if (t <= 0.04 || t >= 0.96) return null;
  return Math.hypot(a.x + ab.x * t - p.x, a.z + ab.z * t - p.z) < reach ? t : null;
}

/**
 * Jumper tellerinin biçimi (delikler değişmez). Bir telin dik ucu başka bir telin altında kalıyorsa üstteki tel
 * ondan yüksek geçer (0,5 birim); iki tel birbirinin ucunun üstündeyse (aynı sırada iç içe) kısa olanın ortası yana
 * açılır, öbürü onun ucunun üstünden geçer. Sonra her tel öbür tellerin ve fişlerin içinden geçiyorsa en yakın
 * çakışmasız biçime (yükseklik, yana açılma) geçer. Hiçbiri olmazsa olduğu gibi kalır (testte çakışma sayılır).
 */
export function jumperShapes(
  plan: BreadboardPlan,
  noPlug: ReadonlySet<number>,
  hidden: ReadonlySet<number> = NONE,
  wires: ReadonlyArray<readonly Vector3[]> = [],
  bodies: ReadonlyMap<string, BoardBody> = NO_BODIES,
): JumperShape[] {
  if (hidden.size > 0) {
    // Çizilmeyen köprüler hesaba girmez; yerlerinde olağan biçim kalır (dizi plan.jumpers sırasında).
    const live = plan.jumpers.map((_, i) => i).filter((i) => !hidden.has(i));
    const sub = jumperShapes({ ...plan, jumpers: live.map((i) => plan.jumpers[i]!) }, noPlug, NONE, wires, bodies);
    const out: JumperShape[] = plan.jumpers.map((j) => ({ lift: jumperLift(holeTopOf(j.a, plan.cols), holeTopOf(j.b, plan.cols)), bow: 0 }));
    live.forEach((i, k) => (out[i] = sub[k]!));
    return out;
  }
  const plugs: Array<{ prims: Prim[]; bounds: { min: Vector3; max: Vector3 } }> = [];
  plan.leads.forEach((lead, i) => {
    if (noPlug.has(i)) return;
    const prims = plugPrims(holeTopOf(lead.hole, plan.cols), `plug:${i}`);
    plugs.push({ prims, bounds: boundsOf(prims) });
  });
  // Parça gövdeleri engel: köprü altlarından (kartın hemen üstünden) ya da yanlarından geçer.
  for (const [id, b] of bodies) {
    const prim = partPrim(id, b.body);
    if (prim) plugs.push({ prims: [prim], bounds: boundsOf([prim]) });
  }
  // Direklerden gelen teller (posts.ts) de engel: köprüler üstlerinden ya da yanlarından geçer.
  wires.forEach((pts, k) => {
    const prims = wirePrims(pts, `wire:${k}`);
    plugs.push({ prims, bounds: boundsOf(prims) });
  });
  const ends = plan.jumpers.map((j) => [holeTopOf(j.a, plan.cols), holeTopOf(j.b, plan.cols)] as const);
  const n = ends.length;
  const length = (i: number) => ends[i]![0].distanceTo(ends[i]![1]);
  const reach = 2 * JUMPER_RADIUS + 0.3;
  const shapes: JumperShape[] = ends.map(([a, b]) => ({ lift: jumperLift(a, b), bow: 0 }));
  // Üstte geçme kısıtları: [üstteki, alttaki].
  const above: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    for (let k = i + 1; k < n; k++) {
      const kUnderI = ends[k]!.some((p) => under(p, ends[i]![0], ends[i]![1], reach) !== null);
      const iUnderK = ends[i]!.some((p) => under(p, ends[k]![0], ends[k]![1], reach) !== null);
      if (kUnderI && iUnderK) {
        const bowed = length(i) <= length(k) ? i : k;
        shapes[bowed] = { ...shapes[bowed]!, bow: 0.8 };
        above.push([bowed === i ? k : i, bowed]);
      } else if (kUnderI) above.push([i, k]);
      else if (iUnderK) above.push([k, i]);
    }
  }
  for (let round = 0; round < n + 2; round++) {
    let changed = false;
    for (const [hi, lo] of above) {
      const want = Math.min(MAX_LIFT, shapes[lo]!.lift + LAYER);
      if (shapes[hi]!.lift < want) {
        shapes[hi] = { ...shapes[hi]!, lift: want };
        changed = true;
      }
    }
    if (!changed) break;
  }
  let prims = ends.map(([a, b], i) => jumperPrims(a, b, shapes[i]!, `jumper:${i}`));
  let bounds = prims.map(boundsOf);
  const clashes = (i: number, mine: readonly Prim[], box: { min: Vector3; max: Vector3 }, skip: ReadonlySet<number> = NONE) => {
    let count = 0;
    for (const q of plugs) if (boundsMeet(box, q.bounds) && mine.some((x) => q.prims.some((y) => primsOverlap(x, y)))) count++;
    for (let k = 0; k < n; k++) if (k !== i && !skip.has(k) && boundsMeet(box, bounds[k]!) && mine.some((x) => prims[k]!.some((y) => primsOverlap(x, y)))) count++;
    return count;
  };
  /** `i`'nin ucunun üstünden geçen teller (üstte geçme kısıtı): `i` yükselince onlar da yükselir. */
  const over = (i: number) => new Set(above.filter(([, lo]) => lo === i).map(([hi]) => hi));
  /** Üstte geçme kısıtlarını yeniden uygular (alttaki yükseldiyse üstteki de yükselir). */
  const settle = () => {
    for (let pass = 0; pass < n + 2; pass++) {
      let moved = false;
      for (const [hi, lo] of above) {
        const want = Math.min(MAX_LIFT, shapes[lo]!.lift + LAYER);
        if (shapes[hi]!.lift < want - 1e-9) {
          shapes[hi] = { ...shapes[hi]!, lift: want };
          const [a, b] = ends[hi]!;
          prims[hi] = jumperPrims(a, b, shapes[hi]!, 'jumper:' + hi);
          bounds[hi] = boundsOf(prims[hi]!);
          moved = true;
        }
      }
      if (!moved) break;
    }
  };
  const order = ends.map((_, i) => i).sort((i, k) => length(i) - length(k) || i - k);
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const i of order) {
      const [a, b] = ends[i]!;
      if (clashes(i, prims[i]!, bounds[i]!) === 0) continue;
      const now = shapes[i]!;
      const options: Array<JumperShape & { cost: number }> = [];
      // Gövdelerin üstünden aşan tel (parçaları örter) en son çare: iki katın üstündeki yükseklikler cezalı.
      for (const bow of BOWS) for (let lift = MIN_LIFT; lift <= MAX_LIFT + 1e-9; lift += 0.25) options.push({ lift, bow, cost: Math.abs(lift - now.lift) + 1.5 * Math.abs(bow - now.bow) + (lift > UNDER ? 4 : 0) });
      options.sort((x, y) => x.cost - y.cost);
      // Önce öbür tellere dokunmadan; olmazsa ucunun üstünden geçen teller birlikte yükselir (kilitlenme çözülür).
      let placed = false;
      for (const skip of [NONE, over(i)]) {
        if (placed || (skip !== NONE && skip.size === 0)) continue;
        for (const o of options) {
          const shape = { lift: o.lift, bow: o.bow };
          const mine = jumperPrims(a, b, shape, `jumper:${i}`);
          const box = boundsOf(mine);
          if (clashes(i, mine, box, skip) > 0) continue;
          shapes[i] = shape;
          prims = prims.map((p, k) => (k === i ? mine : p));
          bounds = bounds.map((x, k) => (k === i ? box : x));
          if (skip !== NONE) settle();
          changed = true;
          placed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }
  return shapes;
}

/**
 * Tahtadaki sabit ilkeller: parçalar (kartın üstündeki kısmı), köprüler (jumper) ve masadaki parçaların fişleri ile
 * fişten kalkan kablonun başı, direklerden gelen teller. `noPlug`: tahtaya gelmeyen kablolar (cihaz kabloları: direğe
 * takılır); `hidden`: çizilmeyen köprüler; `wires`: direk tellerinin köşe noktaları.
 */
export function boardPrims(
  plan: BreadboardPlan,
  bodies: ReadonlyMap<string, BoardBody>,
  noPlug: ReadonlySet<number>,
  hidden: ReadonlySet<number> = NONE,
  wires: ReadonlyArray<readonly Vector3[]> = [],
  shapes: readonly JumperShape[] = jumperShapes(plan, noPlug, hidden, wires, bodies),
): Prim[] {
  const out: Prim[] = [];
  for (const [id, b] of bodies) {
    const prim = partPrim(id, b.body);
    if (prim) out.push(prim);
  }
  plan.jumpers.forEach((j, i) => {
    if (!hidden.has(i)) out.push(...jumperPrims(holeTopOf(j.a, plan.cols), holeTopOf(j.b, plan.cols), shapes[i]!, `jumper:${i}`));
  });
  plan.leads.forEach((lead, i) => {
    if (!noPlug.has(i)) out.push(...plugPrims(holeTopOf(lead.hole, plan.cols), `plug:${i}`));
  });
  wires.forEach((pts, k) => out.push(...wirePrims(pts, `wire:${k}`)));
  return out;
}
