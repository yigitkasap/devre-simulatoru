// Cihaz kablolarının ucundaki timsah kıskaçlar (3B; three'nin yalnızca matematik sınıfları, DOM yok): kıskacın
// tuttuğu yer (eksenli parçanın bacağı ya da deliğe takılı kısa dik telin ucu), duruşu ve zincir. Kıskaçlar,
// kısa teller, köprüler (jumper), fişler ve kabloların uçları birbirinin içine girmesin diye her kıskacın duruşu
// adaylar arasından çarpışmasız olan seçilir: önce cihaza doğru, sonra yana açılarak; bacakta ya da planın
// deliğinde yer yoksa ağın şeridinde ya da rayında başka bir boş delik (bir delik boşluk bırakılır).
//
// Ölçüler gerçek parçalardan (docs/KARARLAR.md → "3B: cihaz kabloları, timsah kıskaç"):
//   - Kıskaç: Mueller BU-30C mini timsah kıskacı, 27,69 × 5,08 × 7,87 mm, ağız en çok 4,8 mm.
//   - Kısa tel: 22 AWG tek damarlı (Alpha Wire 3051/1, yalıtım Ø 1,45 mm, iletken Ø 0,643 mm); soyuk uç 7 mm
//     (Global Specialties WK-1 hazır tel takımı). Yalıtımın tahtanın üstünde kalan boyu 5 mm (onay bekliyor).

import { Vector3 } from 'three';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { BB, holeXZ, railHoles, type BreadboardPlan, type Hole } from './breadboard';
import { JUMPER_RADIUS, jumperCurve, jumperLift, type JumperShape } from './breadboardModel';
import { CLIP_LEGS, clipGroups } from './clipPlan';
import { conductorOf } from './holes';

const MM = 1 / 2.54;

/** Mueller BU-30C: boy, genişlik, yükseklik (birim; 1 = 2,54 mm); ağızın (metal çene) boyu kıskacın %42'si. */
export const CLIP = { length: 27.69 * MM, width: 5.08 * MM, height: 7.87 * MM, jaw: 0.42 } as const;
/** Kısa dik tel: yalıtımın yarıçapı, iletkenin yarıçapı, tahtanın üstündeki yalıtım ve soyuk uç (birim). */
export const STUB = { radius: (1.45 / 2) * MM, core: (0.643 / 2) * MM, insulated: 5 * MM, bare: 7 * MM } as const;
/** Masadaki parçaların (pil, Arduino…) dupont fişi: kesiti bir delik aralığından dar (birim). */
export const PLUG = { width: 0.75, height: 1.5 } as const;
/** Kabloların yarıçapı (birim). */
export const CABLE_RADIUS = 0.28;
/** Kıskaç ağzının teli tuttuğu yer: soyuk ucun tepesinin bu kadar altı. */
const GRIP_BELOW_TIP = 2.5 * MM;
/** Bacağı tutan kıskacın ağzı: kartın üstünden bu kadar yukarıda (gövdeyle kart arasındaki dik bacak). */
const LEG_GRIP = 0.55;
/** Zincirdeki kıskaç öncekinin metal çenesini bu kesirlerden birinde tutar (çene kıskacın %42'si). */
const CHAIN_AT = [0.28, 0.16, 0.38];

export interface ClipPose {
  /** Ağzın ucu (tuttuğu yer). */
  readonly jaw: Vector3;
  /** Ağızdan kuyruğa (kablonun girdiği uç) birim vektör. */
  readonly axis: Vector3;
  /** Çenelerin açıldığı yön (eksene dik). */
  readonly up: Vector3;
  /** Genişlik yönü (yatay, eksene dik). */
  readonly side: Vector3;
}

export interface ClipPlacement extends ClipPose {
  /** plan.leads sırası. */
  readonly lead: number;
  readonly net: string;
  /** Bacağı, kısa teli ya da (zincirde) önceki kıskacı tutar. */
  readonly kind: 'leg' | 'stub' | 'chain';
  /** Elektriksel olarak bağlandığı delik (bacağın, telin ya da zincirin ilk kıskacının deliği). */
  readonly hole: Hole;
  /** Zincirde tuttuğu kıskacın kablosu (plan.leads sırası). */
  readonly onto: number | null;
  /** Bacakta: parça ve pin. */
  readonly part?: string;
  readonly pin?: number;
}

/** Kısa dik telin biçimi: ayağı (kartın üstü), tepesi; `bend`: gövdesi deliğin üstünü örten parçanın altından çıkan tel önce alçakta yatay bu kadar ilerler, sonra dikilir (sıfırsa düz). */
export interface StubShape {
  readonly foot: Vector3;
  readonly top: Vector3;
  readonly bend: Vector3;
  /** Yatay kısmın kartın üstünden yüksekliği (0: kartın üstünde yatar). */
  readonly knee: number;
}

export interface StubPlacement extends StubShape {
  readonly hole: Hole;
  readonly net: string;
  /** Teli tutan kıskacın kablosu. */
  readonly lead: number;
}

export interface Junction {
  readonly net: string;
  /** Birleşme noktası: ilk kıskacın ağzı. */
  readonly at: Vector3;
  readonly count: number;
}

export interface ClipLayout {
  /** plan.leads sırası → kıskaç (cihaz kablosu olmayanlarda yok). */
  readonly clips: ReadonlyMap<number, ClipPlacement>;
  readonly stubs: readonly StubPlacement[];
  readonly junctions: readonly Junction[];
}

/** Kıskacın kuyruğu (kablonun girdiği uç). */
export function clipTail(p: ClipPose): Vector3 {
  return p.jaw.clone().addScaledVector(p.axis, CLIP.length);
}

/** `heading` (yatay birim vektör) yönünde, `elevation` (radyan) eğimle kalkan kıskaç. */
export function clipPose(jaw: Vector3, heading: Vector3, elevation: number): ClipPose {
  const h = new Vector3(heading.x, 0, heading.z);
  if (h.lengthSq() < 1e-9) h.set(0, 0, -1);
  h.normalize();
  const axis = h.clone().multiplyScalar(Math.cos(elevation)).add(new Vector3(0, Math.sin(elevation), 0)).normalize();
  const side = new Vector3().crossVectors(axis, new Vector3(0, 1, 0)).normalize();
  const up = new Vector3().crossVectors(side, axis).normalize();
  return { jaw: jaw.clone(), axis, up, side };
}

// --- Çarpışma ilkelleri ---------------------------------------------------------------------------------------

/** Kapsül (iki uç, yarıçap) ya da yönlü kutu (merkez, eksenler, yarı boylar). `owner`: ait olduğu nesne. */
export type Prim =
  | { readonly kind: 'capsule'; readonly a: Vector3; readonly b: Vector3; readonly r: number; readonly owner: string; readonly tag?: 'jaw' }
  | { readonly kind: 'box'; readonly c: Vector3; readonly u: readonly [Vector3, Vector3, Vector3]; readonly e: readonly [number, number, number]; readonly owner: string; readonly tag?: 'jaw' };

const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);

/** Dünya eksenlerine hizalı kutu. */
export function boxPrim(min: Vector3, max: Vector3, owner: string): Prim {
  const c = min.clone().add(max).multiplyScalar(0.5);
  return { kind: 'box', c, u: [X, Y, Z], e: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2], owner };
}

/** Kıskacın ilkelleri: ince metal ağız (kapsül), gövde ve kılıf (kutu), kuyruktan çıkan kablonun başı. */
export function clipPrims(p: ClipPose, owner: string): Prim[] {
  const L = CLIP.length;
  const at = (t: number) => p.jaw.clone().addScaledVector(p.axis, t);
  return [
    { kind: 'capsule', a: at(0.35), b: at(0.3 * L), r: 0.4, owner, tag: 'jaw' },
    { kind: 'box', c: at(0.65 * L), u: [p.axis, p.side, p.up], e: [0.35 * L, CLIP.width / 2, CLIP.height / 2], owner },
    { kind: 'capsule', a: at(L), b: at(L + 2.5), r: CABLE_RADIUS, owner },
  ];
}

/** Eğik tel: kartın üstünden bu yükseklikte yatay ilerler (parçaların gövdesinin altından); alçak gövdede kartın üstünde yatar. */
const STUB_KNEES = [0.4, 0];

/** Kısa telin kırık çizgisi: ayak, (eğikse) dirsekler, tepe. */
export function stubPoints(s: StubShape): Vector3[] {
  if (s.bend.lengthSq() < 1e-9) return [s.foot, s.top];
  const knee = s.foot.clone().setY(s.foot.y + s.knee);
  return [s.foot, knee, knee.clone().add(s.bend), s.top];
}

/** Kısa telin ayağı ve tepesi: düz ya da `bend` kadar yana kaymış. */
export function stubShape(foot: Vector3, bend: Vector3 = new Vector3(), knee = STUB_KNEES[0]!): StubShape {
  return { foot, top: foot.clone().add(bend).setY(foot.y + STUB.insulated + STUB.bare), bend, knee };
}

/** Kısa dik telin ilkelleri. */
export function stubPrims(s: StubShape, owner: string): Prim[] {
  const pts = stubPoints(s);
  return pts.slice(1).map((b, i) => ({ kind: 'capsule' as const, a: pts[i]!, b, r: STUB.radius, owner }));
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
function sphereOf(p: Prim): { c: Vector3; r: number } {
  if (p.kind === 'capsule') return { c: p.a.clone().add(p.b).multiplyScalar(0.5), r: p.a.distanceTo(p.b) / 2 + p.r };
  return { c: p.c, r: Math.hypot(p.e[0], p.e[1], p.e[2]) };
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

/** Jumper telinin en çok yüksekliği (kartın üstünden, birim). */
const MAX_LIFT = 7;
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
export function jumperShapes(plan: BreadboardPlan, clipLeads: ReadonlySet<number>): JumperShape[] {
  const plugs: Array<{ prims: Prim[]; bounds: { min: Vector3; max: Vector3 } }> = [];
  plan.leads.forEach((lead, i) => {
    if (clipLeads.has(i)) return;
    const prims = plugPrims(holeTopOf(lead.hole, plan.cols), `plug:${i}`);
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
      const want = Math.min(MAX_LIFT, shapes[lo]!.lift + 0.5);
      if (shapes[hi]!.lift < want) {
        shapes[hi] = { ...shapes[hi]!, lift: want };
        changed = true;
      }
    }
    if (!changed) break;
  }
  let prims = ends.map(([a, b], i) => jumperPrims(a, b, shapes[i]!, `jumper:${i}`));
  let bounds = prims.map(boundsOf);
  const clashes = (i: number, mine: readonly Prim[], box: { min: Vector3; max: Vector3 }) => {
    let count = 0;
    for (const q of plugs) if (boundsMeet(box, q.bounds) && mine.some((x) => q.prims.some((y) => primsOverlap(x, y)))) count++;
    for (let k = 0; k < n; k++) if (k !== i && boundsMeet(box, bounds[k]!) && mine.some((x) => prims[k]!.some((y) => primsOverlap(x, y)))) count++;
    return count;
  };
  const order = ends.map((_, i) => i).sort((i, k) => length(i) - length(k) || i - k);
  for (let round = 0; round < 3; round++) {
    let changed = false;
    for (const i of order) {
      const [a, b] = ends[i]!;
      if (clashes(i, prims[i]!, bounds[i]!) === 0) continue;
      const now = shapes[i]!;
      const options: Array<JumperShape & { cost: number }> = [];
      for (const bow of BOWS) for (let lift = 0.45; lift <= MAX_LIFT + 1e-9; lift += 0.25) options.push({ lift, bow, cost: Math.abs(lift - now.lift) + 1.5 * Math.abs(bow - now.bow) });
      options.sort((x, y) => x.cost - y.cost);
      for (const o of options) {
        const shape = { lift: o.lift, bow: o.bow };
        const mine = jumperPrims(a, b, shape, `jumper:${i}`);
        const box = boundsOf(mine);
        if (clashes(i, mine, box) > 0) continue;
        shapes[i] = shape;
        prims = prims.map((p, k) => (k === i ? mine : p));
        bounds = bounds.map((x, k) => (k === i ? box : x));
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return shapes;
}

/**
 * Tahtadaki sabit ilkeller: parçalar (kartın üstündeki kısmı), köprüler (jumper) ve masadaki parçaların fişleri ile
 * fişten kalkan kablonun başı. `clipLeads`: kıskaçla biten kablolar (fişleri yok).
 */
export function boardPrims(plan: BreadboardPlan, bodies: ReadonlyMap<string, BoardBody>, clipLeads: ReadonlySet<number>, shapes: readonly JumperShape[] = jumperShapes(plan, clipLeads)): Prim[] {
  const out: Prim[] = [];
  for (const [id, b] of bodies) {
    const prim = partPrim(id, b.body);
    if (prim) out.push(prim);
  }
  plan.jumpers.forEach((j, i) => out.push(...jumperPrims(holeTopOf(j.a, plan.cols), holeTopOf(j.b, plan.cols), shapes[i]!, `jumper:${i}`)));
  plan.leads.forEach((lead, i) => {
    if (!clipLeads.has(i)) out.push(...plugPrims(holeTopOf(lead.hole, plan.cols), `plug:${i}`));
  });
  return out;
}

type ClipInfo = Pick<ClipPlacement, 'kind' | 'onto' | 'part'>;

/**
 * Bir çift sayılmaz mı: aynı nesne (kıskaç ve tuttuğu kısa tel dahil); zincirdeki kıskacın ağzı tuttuğu kıskaca;
 * bacağı tutan kıskaç kendi parçasının kutusuna (bacaksız gövdesi ayrıca sınanır).
 */
function exempt(p: Prim, q: Prim, info: (lead: number) => ClipInfo | undefined): boolean {
  if (p.owner === q.owner) return true;
  for (const [a, b] of [
    [p, q],
    [q, p],
  ] as const) {
    const lead = /^clip:(\d+)$/.exec(a.owner);
    if (!lead) continue;
    const clip = info(Number(lead[1]));
    if (!clip) continue;
    if (a.tag === 'jaw' && clip.onto !== null && b.owner === `clip:${clip.onto}`) return true;
    if (a.tag === 'jaw' && clip.kind === 'leg' && b.owner === `part:${clip.part}`) return true;
  }
  return false;
}

/** Çifti sınamaya değer mi: parçaların gövdeleri yalnızca kıskaçlar, kısa teller ve kıskaçtan çıkan kablolarla. */
function relevant(p: Prim, q: Prim): boolean {
  const isPart = (x: Prim) => x.owner.startsWith('part:');
  if (isPart(p) && isPart(q)) return false;
  if (isPart(p) || isPart(q)) return (isPart(p) ? q : p).owner.startsWith('clip:');
  return true;
}

/** Kıskaçların, kısa tellerin ve kıskaçtan çıkan kabloların ilkelleri (kısa tel onu tutan kıskaçla aynı nesne). */
export function layoutPrims(layout: ClipLayout): Prim[] {
  const out: Prim[] = [];
  for (const clip of layout.clips.values()) out.push(...clipPrims(clip, `clip:${clip.lead}`));
  for (const s of layout.stubs) out.push(...stubPrims(s, `clip:${s.lead}`));
  return out;
}

/**
 * Çakışmalar: kıskaçlar, kısa teller, kıskaçtan çıkan kabloların başı, köprüler ve fişler arasında birbirinin içine
 * giren çiftler; kıskaçlar ve kısa teller parçalara da sınanır (parçaların kendi aralarındaki ve parça–köprü,
 * parça–fiş çiftleri tahtanın yerleşimidir, sayılmaz).
 */
export function collisions(plan: BreadboardPlan, layout: ClipLayout, bodies: ReadonlyMap<string, BoardBody>): Array<{ a: string; b: string }> {
  const all = [...boardPrims(plan, bodies, new Set(layout.clips.keys())), ...layoutPrims(layout)];
  const info = (lead: number) => layout.clips.get(lead);
  const found: Array<{ a: string; b: string }> = [];
  const seen = new Set<string>();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const p = all[i]!;
      const q = all[j]!;
      if (!relevant(p, q) || exempt(p, q, info) || !primsOverlap(p, q)) continue;
      const key = [p.owner, q.owner].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ a: p.owner, b: q.owner });
    }
  }
  return found;
}

// --- Yerleşim ------------------------------------------------------------------------------------------------

export interface ClipInput {
  readonly doc: CircuitDoc;
  readonly plan: BreadboardPlan;
  /** Şemanın planı: aynı ağdaki cihaz kabloları zincirlenir, kıskaç bacağı tutabilir; Tahtada kur kurulumunda false. */
  readonly chain: boolean;
  /** Tahtadaki parçaların kutuları. */
  readonly bodies: ReadonlyMap<string, BoardBody>;
  /** Cihaz kablosunun soketi (dünya): kıskaç kabloya, cihaza doğru bakar. */
  readonly socket: (lead: number) => Vector3 | undefined;
  /** Jumper tellerinin biçimi (verilmezse hesaplanır: jumperShapes). */
  readonly shapes?: readonly JumperShape[];
}

const DEG = Math.PI / 180;
/** Cihaza bakan yönden sapmalar (derece) ve eğimler: önce cihaza doğru, sonra yanlara açılarak. */
const TURNS = [0, 20, -20, 40, -40, 60, -60, 80, -80, 105, -105, 130, -130, 160, -160, 180];
const ELEVATIONS = [55, 70, 40, 82];

/** Deliğin üstü (kartın yüzeyi). */
function holeTop(h: Hole, cols: number): Vector3 {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, BB.height, z);
}

const holeKey = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);

/** Tahtadaki dolu delikler: bacaklar, köprüler ve kıskaçsız kablolar (kıskaçlı kabloların planlı delikleri boş sayılır). */
function usedHoles(plan: BreadboardPlan, clipLeads: ReadonlySet<number>): Set<string> {
  const used = new Set<string>();
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) used.add(holeKey(h));
  for (const j of plan.jumpers) used.add(holeKey(j.a)).add(holeKey(j.b));
  plan.leads.forEach((l, i) => {
    if (!clipLeads.has(i)) used.add(holeKey(l.hole));
  });
  return used;
}

/** Ağın kullandığı iletkenlerin (şerit yarısı, ray) bütün delikleri. */
function netHoles(plan: BreadboardPlan, net: string): Hole[] {
  const conductors = new Map<string, Hole>();
  const add = (h: Hole) => conductors.set(conductorOf(h), h);
  for (const [id, p] of plan.onBoard) p.holes.forEach((h, pin) => plan.netOf.get(pinKey(id, pin)) === net && add(h));
  for (const j of plan.jumpers) {
    if (j.net !== net) continue;
    add(j.a);
    add(j.b);
  }
  for (const l of plan.leads) if (l.net === net) add(l.hole);
  const out: Hole[] = [];
  for (const h of conductors.values()) {
    if (h.kind === 'strip') {
      const rows = h.row < 5 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8, 9];
      for (const row of rows) out.push({ kind: 'strip', board: h.board, col: h.col, row });
    } else {
      for (let k = 0; k < railHoles(plan.cols); k++) out.push({ kind: 'rail', board: h.board, rail: h.rail, k });
    }
  }
  return out;
}

/** Cihaz kablolarının kıskaçları, kısa telleri ve birleşme noktaları. */
export function layoutClips(input: ClipInput): ClipLayout {
  const { doc, plan, chain, bodies } = input;
  const groups = clipGroups(doc, plan, chain);
  if (groups.length === 0) return { clips: new Map(), stubs: [], junctions: [] };
  const clipLeads = new Set(groups.flatMap((g) => g.leads));
  const used = usedHoles(plan, clipLeads);
  const placed: Prim[] = boardPrims(plan, bodies, clipLeads, input.shapes);
  const clips = new Map<number, ClipPlacement>();
  const stubs: StubPlacement[] = [];
  const junctions: Junction[] = [];
  const partTypes = new Map(doc.parts.map((p) => [p.id, p.type]));

  /** Adayın yerleşmişlerle çakışma sayısı. */
  const clashes = (prims: readonly Prim[], lead: number, me: ClipInfo): number => {
    const info = (k: number) => (k === lead ? me : clips.get(k));
    let n = 0;
    for (const p of prims) for (const q of placed) if (relevant(p, q) && !exempt(p, q, info) && primsOverlap(p, q)) n++;
    return n;
  };

  const headingTo = (lead: number, from: Vector3) => {
    const s = input.socket(lead);
    return s ? new Vector3(s.x - from.x, 0, s.z - from.z) : new Vector3(0, 0, -1);
  };
  const rotate = (v: Vector3, deg: number) => v.clone().applyAxisAngle(Y, deg * DEG);

  /** En az çakışan duruş (ilk çakışmasız olanda durur). */
  const bestPose = (jaw: Vector3, lead: number, me: ClipInfo, stub: StubShape | null) => {
    const base = headingTo(lead, jaw);
    let best: { pose: ClipPose; n: number } | null = null;
    for (const elevation of ELEVATIONS) {
      for (const turn of TURNS) {
        const pose = clipPose(jaw, rotate(base, turn), elevation * DEG);
        const prims = clipPrims(pose, `clip:${lead}`);
        if (stub) prims.push(...stubPrims(stub, `clip:${lead}`));
        const n = clashes(prims, lead, me);
        if (!best || n < best.n) best = { pose, n };
        if (n === 0) return best;
      }
    }
    return best!;
  };

  const commit = (placement: ClipPlacement, stub: StubPlacement | null) => {
    clips.set(placement.lead, placement);
    placed.push(...clipPrims(placement, `clip:${placement.lead}`));
    if (stub) {
      stubs.push(stub);
      placed.push(...stubPrims(stub, `clip:${placement.lead}`));
      used.add(holeKey(stub.hole));
    }
  };

  for (const group of groups) {
    const first = group.leads[0]!;
    const planned = plan.leads[first]!.hole;
    const plannedAt = holeTop(planned, plan.cols);
    type Candidate = { kind: 'leg' | 'stub'; hole: Hole; jaw: Vector3; stub: StubShape | null; part?: string; pin?: number };
    const candidates: Candidate[] = [];
    if (chain) {
      // Önce ağdaki eksenli parçaların bacakları (planlı deliğe yakın olan önce).
      const legs: Candidate[] = [];
      for (const [id, p] of plan.onBoard) {
        const type = partTypes.get(id);
        if (!type || !CLIP_LEGS.has(type)) continue;
        p.holes.forEach((h, pin) => {
          if (plan.netOf.get(pinKey(id, pin)) !== group.net) return;
          const at = holeTop(h, plan.cols);
          legs.push({ kind: 'leg', hole: h, jaw: at.clone().setY(BB.height + LEG_GRIP), stub: null, part: id, pin });
        });
      }
      legs.sort((a, b) => a.jaw.distanceTo(plannedAt) - b.jaw.distanceTo(plannedAt));
      candidates.push(...legs);
    }
    // Sonra kısa tel: planın deliği, sonra ağın şeridindeki ya da rayındaki öbür boş delikler (yakın olan önce).
    const stubAt = (h: Hole, bend?: Vector3, knee?: number): Candidate => {
      const stub = stubShape(holeTop(h, plan.cols), bend, knee);
      return { kind: 'stub', hole: h, jaw: stub.top.clone().setY(stub.top.y - GRIP_BELOW_TIP), stub };
    };
    const holes = [planned];
    if (chain) {
      holes.push(
        ...netHoles(plan, group.net)
          .filter((h) => !used.has(holeKey(h)) && holeKey(h) !== holeKey(planned))
          .sort((a, b) => holeTop(a, plan.cols).distanceTo(plannedAt) - holeTop(b, plan.cols).distanceTo(plannedAt)),
      );
    }
    candidates.push(...holes.map((h) => stubAt(h)));
    // Deliğin üstünü bir parçanın gövdesi örtüyorsa: tel gövdenin altından yatay çıkıp dikilir (eğik tel).
    for (const knee of STUB_KNEES) {
      for (const h of holes) for (const reach of [1, 1.6, 2.4, 3.2]) for (const d of [new Vector3(0, 0, -1), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(1, 0, 0)]) candidates.push(stubAt(h, d.multiplyScalar(reach), knee));
    }
    let chosen: { c: Candidate; pose: ClipPose; n: number } | null = null;
    for (const c of candidates) {
      if (c.kind === 'stub' && used.has(holeKey(c.hole))) continue;
      const r = bestPose(c.jaw, first, { onto: null, kind: c.kind, ...(c.part ? { part: c.part } : {}) }, c.stub);
      if (!chosen || r.n < chosen.n) chosen = { c, pose: r.pose, n: r.n };
      if (r.n === 0) break;
    }
    const c = chosen!.c;
    const anchor: ClipPlacement = {
      ...chosen!.pose,
      lead: first,
      net: group.net,
      kind: c.kind,
      hole: c.hole,
      onto: null,
      ...(c.part !== undefined ? { part: c.part, pin: c.pin! } : {}),
    };
    commit(anchor, c.stub ? { ...c.stub, hole: c.hole, net: group.net, lead: first } : null);
    // Zincir: her kıskaç öncekinin (yer yoksa ilkinin) metal çenesini tutar: üstünden ya da yanından.
    let previous = anchor;
    for (const lead of group.leads.slice(1)) {
      let pick: { onto: ClipPlacement; pose: ClipPose; n: number } | null = null;
      search: for (const target of previous === anchor ? [anchor] : [previous, anchor]) {
        for (const f of CHAIN_AT) {
          for (const [u, w] of [[0.3, 0], [0, 0.4], [0, -0.4], [-0.3, 0]] as const) {
            const jaw = target.jaw.clone().addScaledVector(target.axis, f * CLIP.length).addScaledVector(target.up, u * CLIP.height).addScaledVector(target.side, w * CLIP.width);
            const r = bestPose(jaw, lead, { onto: target.lead, kind: 'chain' }, null);
            if (!pick || r.n < pick.n) pick = { onto: target, pose: r.pose, n: r.n };
            if (r.n === 0) break search;
          }
        }
      }
      const clip: ClipPlacement = { ...pick!.pose, lead, net: group.net, kind: 'chain', hole: anchor.hole, onto: pick!.onto.lead };
      commit(clip, null);
      previous = clip;
    }
    if (group.leads.length > 1) junctions.push({ net: group.net, at: anchor.jaw.clone(), count: group.leads.length });
  }
  return { clips, stubs, junctions };
}

/** Cihaz kablolarının elektriksel delikleri kıskacınkiyle değişmiş plan (akım noktaları: cableFlow). */
export function clippedPlan(plan: BreadboardPlan, layout: ClipLayout): BreadboardPlan {
  if (layout.clips.size === 0) return plan;
  return { ...plan, leads: plan.leads.map((l, i) => {
    const clip = layout.clips.get(i);
    return clip ? { ...l, hole: clip.hole } : l;
  }) };
}
