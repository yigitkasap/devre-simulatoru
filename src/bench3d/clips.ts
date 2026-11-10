// Cihaz kablolarının ucundaki timsah kıskaçlar (3B; three'nin yalnızca matematik sınıfları, DOM yok): kıskacın
// tuttuğu kısa dik tel, telin deliği, duruşu ve gerekirse kenar köprüsü ya da zincir. Kıskaç hiçbir zaman parça
// bacağını tutmaz; her cihaz kablosu ağın şeridindeki (ya da rayındaki) ayrı bir boş deliğe takılan kendi kısa
// telinin soyuk ucunu tutar. Delik ve duruş adaylar arasından seçilir (`layoutClips`):
//   - çakışma yok: kıskaçlar, kısa teller, köprüler (jumper), fişler, kabloların başı ve parçaların gövdeleri
//     birbirinin içine girmez;
//   - parçalar örtülmez: varsayılan kameranın bakış açılarından kıskacın ve kablosunun başının görüntüsü parça
//     gövdelerinin görüntüsüne düşmez (yaklaşık izdüşüm, `occlusion`);
//   - kıskaç neredeyse yatay (eğim en çok 25°), kuyruğu kendi cihazına doğru ve tahtanın ortasından dışa bakar,
//     gövdesi parça alanının dışında; delik parça gövdelerinden uzak, tahtanın cihazlara bakan (arka) kenarına yakın.
// Ağın iletkenlerinde uygun boş delik yoksa ağdan tahtadaki boş bir şeride kısa köprü teli çekilir ve kısa tel
// oraya takılır; o da olmazsa kıskaç aynı ağdaki bir kıskacın çenesini tutar (zincir, en çok 2 kıskaç).
//
// Ölçüler gerçek parçalardan (docs/KARARLAR.md → "3B: cihaz kabloları, timsah kıskaç"):
//   - Kıskaç: Mueller BU-30C mini timsah kıskacı, 27,69 × 5,08 × 7,87 mm, ağız en çok 4,8 mm.
//   - Kısa tel: 22 AWG tek damarlı (Alpha Wire 3051/1, yalıtım Ø 1,45 mm, iletken Ø 0,643 mm); soyuk uç 7 mm
//     (Global Specialties WK-1 hazır tel takımı). Yalıtımın tahtanın üstünde kalan boyu 5 mm (onay bekliyor).

import { Box3, Vector3, type CurvePath } from 'three';
import { pinKey } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { BB, boardWidth, boardZ, holeXZ, type BreadboardPlan, type Hole } from './breadboard';
import { JUMPER_RADIUS, jumperCurve, jumperLift, type JumperShape } from './breadboardModel';
import { clipLeads } from './clipPlan';
import { conductorOf, connectedHoles } from './holes';
import { socketCurve } from './leadRoute';

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
/** Kıskacın ağzı kartın en az bu kadar üstünde (mm): kısa telin ucunu tutan kıskacın ağzı 9,5 mm'de. */
export const MIN_JAW_MM = 8;
/** Kıskacın en çok eğimi (derece): neredeyse yatay. */
export const MAX_ELEVATION = 25;
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
  /**
   * `stub`: ağın şeridine ya da rayına takılı kendi kısa telini; `bridge`: kenar köprüsüyle ağa bağlanan boş şeritteki
   * kısa telini; `chain`: aynı ağdaki bir kıskacın çenesini tutar.
   */
  readonly kind: 'stub' | 'bridge' | 'chain';
  /** Elektriksel olarak bağlandığı delik (telin deliği; zincirde tuttuğu kıskacın deliği). */
  readonly hole: Hole;
  /** Zincirde tuttuğu kıskacın kablosu (plan.leads sırası). */
  readonly onto: number | null;
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

/** Kenar köprüsü: ağın iletkenindeki `a` deliğinden boş şeritteki `b` deliğine kısa jumper (yalnızca 3B). */
export interface BridgePlacement {
  readonly net: string;
  /** Köprünün ucundaki şeride takılan telin kıskacının kablosu. */
  readonly lead: number;
  readonly a: Hole;
  readonly b: Hole;
  readonly shape: JumperShape;
}

export interface Junction {
  readonly net: string;
  /** Etiketin yeri: ağın kıskaçlarının ortasına en yakın kıskacın gövdesi (kılıfın ortası). */
  readonly at: Vector3;
  readonly count: number;
}

export interface ClipLayout {
  /** plan.leads sırası → kıskaç (cihaz kablosu olmayanlarda yok). */
  readonly clips: ReadonlyMap<number, ClipPlacement>;
  readonly stubs: readonly StubPlacement[];
  readonly bridges: readonly BridgePlacement[];
  readonly junctions: readonly Junction[];
}

/**
 * Cihaz kablosunun yolu: soketten öne çıkar, masaya sarkar, kıskacın kuyruğuna onun ekseni boyunca girer
 * (`leadRoute.socketCurve`; sahne aynı yolu çizer, görünürlük hesabı da bunu kullanır).
 */
export function clipCable(socket: Vector3, dir: Vector3, pose: ClipPose): CurvePath<Vector3> {
  return socketCurve(socket.clone().addScaledVector(dir, 1.5), dir, clipTail(pose), new Box3(), pose.axis);
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

type ClipInfo = Pick<ClipPlacement, 'kind' | 'onto'>;

/** Bir çift sayılmaz mı: aynı nesne (kıskaç ve tuttuğu kısa tel dahil); zincirdeki kıskacın ağzı tuttuğu kıskaca. */
function exempt(p: Prim, q: Prim, info: (lead: number) => ClipInfo | undefined): boolean {
  if (p.owner === q.owner) return true;
  for (const [a, b] of [
    [p, q],
    [q, p],
  ] as const) {
    const lead = /^clip:(\d+)$/.exec(a.owner);
    if (!lead) continue;
    const clip = info(Number(lead[1]));
    if (clip && a.tag === 'jaw' && clip.onto !== null && b.owner === `clip:${clip.onto}`) return true;
  }
  return false;
}

/** Çifti sınamaya değer mi: parçaların gövdeleri yalnızca kıskaçlar, kısa teller, kıskaçtan çıkan kablolar ve kenar köprüleriyle. */
function relevant(p: Prim, q: Prim): boolean {
  const isPart = (x: Prim) => x.owner.startsWith('part:');
  if (isPart(p) && isPart(q)) return false;
  if (isPart(p) || isPart(q)) return /^(clip|bridge):/.test((isPart(p) ? q : p).owner);
  return true;
}

/** Kenar köprüsünün ilkelleri. */
function bridgePrims(b: BridgePlacement, cols: number): Prim[] {
  return jumperPrims(holeTopOf(b.a, cols), holeTopOf(b.b, cols), b.shape, `bridge:${b.lead}`);
}

/** Kıskaçların, kısa tellerin, kıskaçtan çıkan kabloların ve kenar köprülerinin ilkelleri (kısa tel onu tutan kıskaçla aynı nesne). */
export function layoutPrims(layout: ClipLayout, cols: number): Prim[] {
  const out: Prim[] = [];
  for (const clip of layout.clips.values()) out.push(...clipPrims(clip, `clip:${clip.lead}`));
  for (const s of layout.stubs) out.push(...stubPrims(s, `clip:${s.lead}`));
  for (const b of layout.bridges) out.push(...bridgePrims(b, cols));
  return out;
}

/**
 * Çakışmalar: kıskaçlar, kısa teller, kıskaçtan çıkan kabloların başı, köprüler (planınkiler ve kenar köprüleri) ve
 * fişler arasında birbirinin içine giren çiftler; kıskaçlar, kısa teller ve kenar köprüleri parçalara da sınanır
 * (parçaların kendi aralarındaki ve parça–plan köprüsü, parça–fiş çiftleri tahtanın yerleşimidir, sayılmaz).
 */
export function collisions(plan: BreadboardPlan, layout: ClipLayout, bodies: ReadonlyMap<string, BoardBody>): Array<{ a: string; b: string }> {
  const all = [...boardPrims(plan, bodies, new Set(layout.clips.keys())), ...layoutPrims(layout, plan.cols)];
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

// --- Görünüş: parçaların örtülmesi -------------------------------------------------------------------------------

/**
 * Varsayılan kameranın (Serbest, masa üstü cihaz varken) yaklaşık yerleri: önden (azimut 0), tahtanın ortasından
 * yükseklik açısı ve uzaklık (birim; yarım boy tahtada, tam boyda uzaklık tahtanın genişliğiyle büyür). Ölçülen
 * (2026-11-10, ios-kontrol'ün görünümleri): masaüstü 1440×900 ≈ 42° / 109 (kameranın 36°'lik bakışının hedefi
 * tahtanın üstünde ve arkasında), iPhone 13 dikey ≈ 31° / 114, yatay ≈ 31° / 60 (kısa alan: kamera yakın).
 * Örtülme yalnızca kameranın yerine bağlı (ışınlar); bakış yönü sayılmaz. Kıskacın görüntüsü bu yerlerin hiçbirinden
 * parça gövdelerinin görüntüsüne düşmesin.
 */
const VIEWS: ReadonlyArray<{ readonly elevation: number; readonly distance: number }> = [
  { elevation: 42, distance: 109 },
  { elevation: 31, distance: 114 },
  { elevation: 31, distance: 60 },
];
/** Kameranın uzaklığı bu genişlikteki (yarım boy) tahtaya göre. */
const VIEW_BOARD = 33;

interface Camera2D {
  readonly at: Vector3;
  readonly forward: Vector3;
  readonly up: Vector3;
}

type Point2 = readonly [number, number];

/** Kameranın görüntü düzleminde nokta (perspektif) ve derinlik. */
function project(cam: Camera2D, p: Vector3): { u: number; w: number; d: number } {
  const rel = p.clone().sub(cam.at);
  const d = Math.max(1e-3, rel.dot(cam.forward));
  return { u: rel.x / d, w: rel.dot(cam.up) / d, d };
}

/** Noktaların dışbükey zarfı (saat yönünün tersine). */
function hull(points: Point2[]): Point2[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Point2, a: Point2, b: Point2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Point2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point2[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Dışbükey çokgenin dikdörtgenle kesişimi (Sutherland–Hodgman): alanı ve ağırlık merkezi. */
function clipToRect(poly: readonly Point2[], r: { u0: number; u1: number; w0: number; w1: number }): { area: number; u: number; w: number } | null {
  let out: Point2[] = [...poly];
  const edges: Array<(p: Point2) => number> = [(p) => p[0] - r.u0, (p) => r.u1 - p[0], (p) => p[1] - r.w0, (p) => r.w1 - p[1]];
  for (const f of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const a = input[i]!;
      const b = input[(i + 1) % input.length]!;
      const fa = f(a);
      const fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) {
        const t = fa / (fa - fb);
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    if (out.length < 3) return null;
  }
  let area = 0;
  let cu = 0;
  let cw = 0;
  for (let i = 0; i < out.length; i++) {
    const a = out[i]!;
    const b = out[(i + 1) % out.length]!;
    const k = a[0] * b[1] - b[0] * a[1];
    area += k;
    cu += (a[0] + b[0]) * k;
    cw += (a[1] + b[1]) * k;
  }
  if (Math.abs(area) < 1e-12) return null;
  return { area: Math.abs(area) / 2, u: cu / (3 * area), w: cw / (3 * area) };
}

/** Yönlü kutu: merkez, eksenler, yarı boylar. */
interface Box3D {
  readonly c: Vector3;
  readonly u: readonly [Vector3, Vector3, Vector3];
  readonly e: readonly [number, number, number];
}

/** Işının kutuya girdiği uzaklık (değmezse Infinity). */
function rayEnter(origin: Vector3, dir: Vector3, b: Box3D): number {
  let t0 = -Infinity;
  let t1 = Infinity;
  const rel = origin.clone().sub(b.c);
  for (let i = 0; i < 3; i++) {
    const o = rel.dot(b.u[i]!);
    const d = dir.dot(b.u[i]!);
    const e = b.e[i]!;
    if (Math.abs(d) < 1e-12) {
      if (Math.abs(o) > e) return Infinity;
      continue;
    }
    let a = (-e - o) / d;
    let c = (e - o) / d;
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** İlkelin yönlü kutusu (kapsül: yarıçapı kadar kalın kutu). */
function primBox(p: Prim): Box3D {
  if (p.kind === 'box') return { c: p.c, u: [p.u[0], p.u[1], p.u[2]], e: [p.e[0], p.e[1], p.e[2]] };
  const along = p.b.clone().sub(p.a);
  const len = along.length();
  const a0 = len > 1e-9 ? along.divideScalar(len) : new Vector3(0, 1, 0);
  const a1 = new Vector3().crossVectors(a0, Math.abs(a0.y) > 0.9 ? X : Y).normalize();
  const a2 = new Vector3().crossVectors(a0, a1).normalize();
  return { c: p.a.clone().add(p.b).multiplyScalar(0.5), u: [a0, a1, a2], e: [len / 2 + p.r, p.r, p.r] };
}

/** Kutunun sekiz köşesi. */
function boxCorners(b: Box3D): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(b.c.clone().addScaledVector(b.u[0], i & 1 ? b.e[0] : -b.e[0]).addScaledVector(b.u[1], i & 2 ? b.e[1] : -b.e[1]).addScaledVector(b.u[2], i & 4 ? b.e[2] : -b.e[2]));
  return out;
}

interface BodyShadow {
  readonly id: string;
  readonly box: Box3D;
  readonly r: { u0: number; u1: number; w0: number; w1: number };
  readonly area: number;
}

/**
 * Parça gövdelerinin varsayılan bakışlardaki görüntüleri; dönen işlev bir nesnenin (ilkeller) bu görüntüleri en çok ne
 * kadar örttüğünü verir (gövdenin görüntüsünün payı, 0–1; bakışların ve gövdelerin en kötüsü). Görüntüler kesişirse
 * kesişimin ortasından geçen ışın hangisine önce giriyorsa o öndedir (çakışmayan dışbükey iki nesne).
 */
function viewModel(plan: BreadboardPlan, bodies: ReadonlyMap<string, BoardBody>): (prims: readonly Prim[]) => number {
  const xs = [
    ...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]),
    ...plan.leads.map((l) => l.hole),
    ...plan.jumpers.flatMap((j) => [j.a, j.b]),
  ].map((h) => holeXZ(h, plan.cols).x);
  const half = boardWidth(plan.cols) / 2;
  const full = plan.cols >= BB.cols && xs.length > 0;
  const cx = full ? (Math.max(-half, Math.min(...xs) - 4) + Math.min(half, Math.max(...xs) + 4)) / 2 : 0;
  const cz = boardZ(plan.boards - 1) / 2;
  const scale = Math.max(1, (full ? Math.min(2 * half, Math.max(...xs) - Math.min(...xs) + 8) : 2 * half) / VIEW_BOARD);
  const views = VIEWS.map(({ elevation, distance }) => {
    const e = elevation * DEG;
    const back = new Vector3(0, Math.sin(e), Math.cos(e));
    const cam: Camera2D = { at: new Vector3(cx, BB.height, cz).addScaledVector(back, distance * scale), forward: back.clone().negate(), up: new Vector3(0, Math.cos(e), -Math.sin(e)) };
    const shadows: BodyShadow[] = [];
    for (const [id, b] of bodies) {
      const min = b.body.min.clone().setY(Math.max(b.body.min.y, BB.height));
      if (b.body.max.y <= min.y) continue;
      const max = b.body.max;
      const box: Box3D = { c: min.clone().add(max).multiplyScalar(0.5), u: [X, Y, Z], e: [(max.x - min.x) / 2, (max.y - min.y) / 2, (max.z - min.z) / 2] };
      const q = boxCorners(box).map((p) => project(cam, p));
      const r = { u0: Math.min(...q.map((p) => p.u)), u1: Math.max(...q.map((p) => p.u)), w0: Math.min(...q.map((p) => p.w)), w1: Math.max(...q.map((p) => p.w)) };
      shadows.push({ id, box, r, area: (r.u1 - r.u0) * (r.w1 - r.w0) });
    }
    return { cam, shadows };
  });
  return (prims) => {
    let worst = 0;
    for (const { cam, shadows } of views) {
      if (shadows.length === 0) continue;
      const covered = new Map<string, number>();
      for (const prim of prims) {
        const box = primBox(prim);
        const pts = boxCorners(box).map((p) => {
          const q = project(cam, p);
          return [q.u, q.w] as const;
        });
        // Hızlı eleme: görüntüsünün kutusu hiçbir gövdeninkine değmiyorsa zarf hesaplanmaz.
        const u0 = Math.min(...pts.map((p) => p[0]));
        const u1 = Math.max(...pts.map((p) => p[0]));
        const w0 = Math.min(...pts.map((p) => p[1]));
        const w1 = Math.max(...pts.map((p) => p[1]));
        const near = shadows.filter((s) => s.r.u0 < u1 && u0 < s.r.u1 && s.r.w0 < w1 && w0 < s.r.w1);
        if (near.length === 0) continue;
        const poly = hull(pts);
        for (const s of near) {
          const hit = clipToRect(poly, s.r);
          if (!hit) continue;
          const dir = cam.forward.clone().add(new Vector3(hit.u, 0, 0)).addScaledVector(cam.up, hit.w);
          if (rayEnter(cam.at, dir, box) >= rayEnter(cam.at, dir, s.box)) continue;
          covered.set(s.id, (covered.get(s.id) ?? 0) + hit.area / s.area);
        }
      }
      for (const v of covered.values()) worst = Math.max(worst, Math.min(1, v));
    }
    return worst;
  };
}

// --- Yerleşim ------------------------------------------------------------------------------------------------

export interface ClipInput {
  readonly doc: CircuitDoc;
  readonly plan: BreadboardPlan;
  /**
   * Şemanın planı: kısa tel ağın iletkenlerindeki en uygun boş deliğe takılır (gerekirse kenar köprüsü ya da zincir).
   * Tahtada kur kurulumunda false: her kablo kendi deliğindeki kısa teli tutar.
   */
  readonly schematic: boolean;
  /** Tahtadaki parçaların kutuları. */
  readonly bodies: ReadonlyMap<string, BoardBody>;
  /** Cihaz kablosunun soketi (dünya): kıskacın kuyruğu kabloya, cihaza doğru bakar. */
  readonly socket: (lead: number) => Vector3 | undefined;
  /** Soketin dışa baktığı yön: kablonun yolu (`clipCable`) görünürlük hesabına girer (verilmezse yalnızca başı). */
  readonly socketDir?: (lead: number) => Vector3 | undefined;
  /** Jumper tellerinin biçimi (verilmezse hesaplanır: jumperShapes). */
  readonly shapes?: readonly JumperShape[];
}

const DEG = Math.PI / 180;
/** Cihaza bakan yönden sapmalar (derece): kuyruk her zaman cihazından yana (kablo tahtanın üstünden geri dönmez). */
const TURNS = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 85, -85];
/** Eğimler (derece; en çok MAX_ELEVATION). Yer bulunamazsa son çare dik duruşlar (testte sınanır). */
const ELEVATIONS = [12, 18, 6, 25, 0];
const STEEP = [35, 45, 55];
/** Kıskacın tercih edilen eğimi (derece): kablonun ağırlığıyla kuyruğu hafifçe kalkık. */
const PREFERRED_ELEVATION = 12;
/** Bir parçanın görüntüsünün en çok bu payı örtülebilir (yaklaşık izdüşüm; ölçülen sınır %20). */
const OCCLUSION_LIMIT = 0.08;
/** Kenar köprüsünün en çok boyu (birim, yatay): alt yarıdaki şeritten orta kanalın üstünden arka yarıya yeter. */
const BRIDGE_REACH = 8;
/** Bir kablo için denenen en çok kenar köprüsü adayı (payı en küçük olanlar). */
const BRIDGE_TRIES = 48;
/** Kenar köprüsünün kartın üstünden yükseklikleri (birim): alçak, sonra aradaki parçaların üstünden kemer. */
const BRIDGE_LIFTS = [2.4, 3.4, 4.4];

/** Deliğin üstü (kartın yüzeyi). */
function holeTop(h: Hole, cols: number): Vector3 {
  const { x, z } = holeXZ(h, cols);
  return new Vector3(x, BB.height, z);
}

const holeKey = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);

/** Tahtadaki dolu delikler: bacaklar, köprüler ve kıskaçsız kablolar (kıskaçlı kabloların planlı delikleri boş sayılır). */
function usedHoles(plan: BreadboardPlan, clipped: ReadonlySet<number>): Set<string> {
  const used = new Set<string>();
  for (const p of plan.onBoard.values()) for (const h of [...p.holes, ...(p.extraHoles ?? [])]) used.add(holeKey(h));
  for (const j of plan.jumpers) used.add(holeKey(j.a)).add(holeKey(j.b));
  plan.leads.forEach((l, i) => {
    if (!clipped.has(i)) used.add(holeKey(l.hole));
  });
  return used;
}

/** Ağların kullandığı iletkenler (şerit yarısı, ray): iletken → ağ. */
function conductorNets(plan: BreadboardPlan): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, p] of plan.onBoard) p.holes.forEach((h, pin) => {
    const net = plan.netOf.get(pinKey(id, pin));
    if (net !== undefined) out.set(conductorOf(h), net);
  });
  for (const p of plan.onBoard.values()) for (const h of p.extraHoles ?? []) if (!out.has(conductorOf(h))) out.set(conductorOf(h), '');
  for (const j of plan.jumpers) out.set(conductorOf(j.a), j.net).set(conductorOf(j.b), j.net);
  for (const l of plan.leads) out.set(conductorOf(l.hole), l.net);
  return out;
}

/** Bir aday: kısa telin deliği ve biçimi; köprülüyse köprü. */
interface Candidate {
  readonly kind: 'stub' | 'bridge';
  readonly hole: Hole;
  readonly stub: StubShape;
  readonly bridge: { readonly a: Hole; readonly b: Hole; readonly shape: JumperShape } | null;
  /** Deliğin (ve köprünün) tercih payı: küçük olan önce. */
  readonly cost: number;
}

/** Cihaz kablolarının kıskaçları, kısa telleri, kenar köprüleri ve birleşme etiketlerinin yerleri. */
export function layoutClips(input: ClipInput): ClipLayout {
  const { doc, plan, schematic, bodies } = input;
  const leads = clipLeads(doc, plan);
  if (leads.length === 0) return { clips: new Map(), stubs: [], bridges: [], junctions: [] };
  const clipped = new Set(leads);
  const occlusion = viewModel(plan, bodies);
  const fixed: Prim[] = boardPrims(plan, bodies, clipped, input.shapes);
  const partPrims = fixed.filter((p) => p.owner.startsWith('part:'));

  // Parça alanı (gövdelerin yatay kutusu) ve tahtanın ortası; arka (cihazlara bakan) kenar.
  const bodyRects = [...bodies.values()].map((b) => ({ x0: b.body.min.x, x1: b.body.max.x, z0: b.body.min.z, z1: b.body.max.z }));
  const area = bodyRects.length
    ? { x0: Math.min(...bodyRects.map((r) => r.x0)) - 0.5, x1: Math.max(...bodyRects.map((r) => r.x1)) + 0.5, z0: Math.min(...bodyRects.map((r) => r.z0)) - 0.5, z1: Math.max(...bodyRects.map((r) => r.z1)) + 0.5 }
    : null;
  const center = new Vector3(0, 0, boardZ(plan.boards - 1) / 2);
  const backEdge = -BB.depth / 2;
  const rectDistance = (x: number, z: number, r: { x0: number; x1: number; z0: number; z1: number }) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
  /** Deliğin tercih payı: parça gövdelerinden uzak, arka kenara yakın. */
  const holeCost = (h: Hole) => {
    const { x, z } = holeXZ(h, plan.cols);
    const near = bodyRects.length ? Math.min(...bodyRects.map((r) => rectDistance(x, z, r))) : 99;
    return (3 * (z - boardZ(h.board) - backEdge)) / BB.depth + (1.5 * Math.max(0, 4 - near)) / 4;
  };

  const rotate = (v: Vector3, deg: number) => v.clone().applyAxisAngle(Y, deg * DEG);
  /** Kıskacın gövdesinin parça alanında kalan payı (0–1). */
  const inArea = (pose: ClipPose) => {
    if (!area) return 0;
    let n = 0;
    for (let k = 0; k < 6; k++) {
      const p = pose.jaw.clone().addScaledVector(pose.axis, CLIP.length * (0.3 + (0.7 * k) / 5));
      if (p.x > area.x0 && p.x < area.x1 && p.z > area.z0 && p.z < area.z1) n++;
    }
    return n / 6;
  };

  /**
   * Bir deneme: kablolar verilen sırayla yerleşir (önce gelen en uygun deliği alır). `trouble`: yerleşimin sorunları
   * (köprü 1, zincir 5, dik duruş 20, çakışma 100); kablolar sorunlarına göre.
   */
  const attempt = (order: readonly number[]) => {
    const used = usedHoles(plan, clipped);
    const owners = conductorNets(plan);
    const placed: Prim[] = [...fixed];
    const clips = new Map<number, ClipPlacement>();
    const stubs: StubPlacement[] = [];
    const bridges: BridgePlacement[] = [];
    const chained = new Set<number>();
    const trouble = new Map<number, number>();

    /** Adayın yerleşmişlerle çakışma sayısı (ilk çakışmada durur: `stop`). */
    const clashes = (prims: readonly Prim[], lead: number, me: ClipInfo, stop = false): number => {
      const info = (k: number) => (k === lead ? me : clips.get(k));
      let n = 0;
      for (const p of prims) {
        const sp = sphereOf(p);
        for (const q of placed) {
          const sq = sphereOf(q);
          if (sp.c.distanceToSquared(sq.c) > (sp.r + sq.r) ** 2) continue;
          if (relevant(p, q) && !exempt(p, q, info) && primsOverlap(p, q)) {
            n++;
            if (stop) return n;
          }
        }
      }
      return n;
    };

    /** Bir aday: kısa telin deliği, ağzın yeri ve duruşu; `cheap`: örtülme dışındaki payların toplamı. */
    type Option = { c: Candidate | null; pose: ClipPose; cheap: number; occluded?: number; cabled?: number };
    /** Ağızdaki duruşlar: cihaza dönük, tahtanın ortasından dışa, yataya yakın, parça alanının dışında. */
    const optionsAt = (jaw: Vector3, lead: number, from: Vector3, c: Candidate | null, base: number, elevations: readonly number[], out: Option[]) => {
      const s = input.socket(lead);
      const toward = s ? new Vector3(s.x - jaw.x, 0, s.z - jaw.z) : new Vector3(0, 0, -1);
      if (toward.lengthSq() < 1e-9) toward.set(0, 0, -1);
      toward.normalize();
      const away = new Vector3(from.x - center.x, 0, from.z - center.z);
      const outward = away.lengthSq() > 1e-9 ? away.normalize() : new Vector3(0, 0, -1);
      for (const elevation of elevations) {
        for (const turn of TURNS) {
          const heading = rotate(toward, turn);
          const pose = clipPose(jaw, heading, elevation * DEG);
          const inward = Math.max(0, -heading.dot(outward));
          out.push({ c, pose, cheap: base + 2 * inArea(pose) + Math.abs(turn) / 90 + 0.75 * inward + Math.abs(elevation - PREFERRED_ELEVATION) / 30 });
        }
      }
    };

    /**
     * Kablonun (soketten kuyruğa) görüntüdeki örtme payı: kuyruğa yakın yarısı (masadaki kısmı tahtadaki parçaların
     * arkasında kalır). Kıskaç cihazından yana bakmazsa kablo tahtanın üstünden dönüp kuyruğa girer, parçaları örter.
     */
    const cableOcclusion = (pose: ClipPose, lead: number) => {
      const s = input.socket(lead);
      const d = input.socketDir?.(lead);
      if (!s || !d) return 0;
      // Son parça (masadan kuyruğa giden Bézier) parametresiyle örneklenir: yay boyu hesabı her seçenekte pahalı.
      const path = clipCable(s, d, pose);
      const last = path.curves[path.curves.length - 1]!;
      const pts = Array.from({ length: 9 }, (_, k) => last.getPoint(0.2 + k * 0.1));
      return occlusion(pts.slice(1).map((b, k) => ({ kind: 'capsule' as const, a: pts[k]!, b, r: CABLE_RADIUS, owner: `clip:${lead}` })));
    };

    /** Kıskacın ve kablosunun başının görüntüdeki örtme payı. */
    const clipOcclusion = (pose: ClipPose, lead: number) => {
      const tail = clipTail(pose);
      const cable: Prim = { kind: 'capsule', a: tail, b: tail.clone().addScaledVector(pose.axis, 4.5), r: CABLE_RADIUS, owner: `clip:${lead}` };
      return occlusion([...clipPrims(pose, `clip:${lead}`), cable]);
    };

    /** Kısa telin (ve köprünün) ilkelleri, örtme payı ve çakışması: duruştan bağımsız, aday başına bir kez. */
    const extras = new Map<Candidate, { prims: Prim[]; bridge: Prim[]; occluded: number; clash: boolean }>();
    const extraOf = (c: Candidate, lead: number) => {
      let x = extras.get(c);
      if (!x) {
        const bridge = c.bridge ? jumperPrims(holeTopOf(c.bridge.a, plan.cols), holeTopOf(c.bridge.b, plan.cols), c.bridge.shape, `bridge:${lead}`) : [];
        const prims = [...stubPrims(c.stub, `clip:${lead}`), ...bridge];
        // Görüntüde tel ince: yalıtımı yalnızca alttaki 5 mm, üstü soyuk iletken (çakışmada bütün tel yalıtım kalınlığında).
        const pts = stubPoints(c.stub);
        const bare = c.stub.top.clone().setY(c.stub.top.y - STUB.bare);
        const seen: Prim[] = [
          ...pts.slice(1, -1).map((b, i) => ({ kind: 'capsule' as const, a: pts[i]!, b, r: STUB.radius, owner: 'stub' })),
          { kind: 'capsule', a: pts[pts.length - 2]!, b: bare, r: STUB.radius, owner: 'stub' },
          { kind: 'capsule', a: bare, b: c.stub.top, r: STUB.core, owner: 'stub' },
          ...prims.slice(pts.length - 1),
        ];
        // Köprü kendi kısa telinin içinden de geçmez (köprünün kemeri telin üstünden aşabilir).
        const crossed = bridge.some((q) => stubPrims(c.stub, 'stub').some((p) => primsOverlap(p, q)));
        x = { prims, bridge, occluded: occlusion(seen), clash: crossed || clashes(prims, lead, { kind: 'stub', onto: null }, true) > 0 };
        extras.set(c, x);
      }
      return x;
    };

    /**
     * Zincir seçeneklerinden en uygun duruş (dal-sınır): ucuz paya göre sıralanır; örtülme payı (40 × pay) eklenince en
     * küçük toplamı veren, örtme sınırının altında kalan ve çakışmayan seçenek. Ucuz pay bulunan en iyi toplamı aşınca durur.
     */
    const best = (options: Option[], lead: number, me: ClipInfo, limit: number): Option | null => {
      options.sort((a, b) => a.cheap - b.cheap);
      let found: { o: Option; total: number } | null = null;
      for (const o of options) {
        if (found && o.cheap >= found.total) break;
        const occluded = clipOcclusion(o.pose, lead);
        if (occluded > limit || (found && o.cheap + 40 * occluded >= found.total)) continue;
        if (clashes(clipPrims(o.pose, `clip:${lead}`), lead, me, true) > 0) continue;
        const cabled = occluded + cableOcclusion(o.pose, lead);
        if (cabled > limit) continue;
        const total = o.cheap + 40 * cabled;
        if (found && total >= found.total) continue;
        found = { o, total };
      }
      return found?.o ?? null;
    };

    /**
     * Kısa tel adaylarından en uygun duruş (dal-sınır, önce adaylar): adaylar tercih payına göre sıralanır; bir adayın
     * bütün duruşlarının ucuz payı en az adayın payı olduğundan, bulunan en iyi toplamı aşan adayda durulur. Adayın
     * duruşları bir kez üretilir (gevşek sınırla yeniden aranınca yeniden kullanılır).
     */
    const posesOf = new WeakMap<Candidate, Option[]>();
    const pickFrom = (candidates: readonly Candidate[], lead: number, limit: number, elevations: readonly number[] = ELEVATIONS, max = Infinity): { c: Candidate; pose: ClipPose } | null => {
      const order = [...candidates].sort((a, b) => a.cost - b.cost).slice(0, max);
      const me: ClipInfo = { kind: 'stub', onto: null };
      let found: { o: Option; total: number } | null = null;
      for (const c of order) {
        if (found && c.cost >= found.total) break;
        const extra = extraOf(c, lead);
        if (extra.clash || extra.occluded > limit) continue;
        let options = posesOf.get(c);
        if (!options) {
          options = [];
          optionsAt(c.stub.top.clone().setY(c.stub.top.y - GRIP_BELOW_TIP), lead, c.stub.foot, c, c.cost, elevations, options);
          options.sort((x, y) => x.cheap - y.cheap);
          posesOf.set(c, options);
        }
        for (const o of options) {
          if (found && o.cheap >= found.total) break;
          const occluded = (o.occluded ??= clipOcclusion(o.pose, lead) + extra.occluded);
          if (occluded > limit || (found && o.cheap + 40 * occluded >= found.total)) continue;
          const mine = clipPrims(o.pose, `clip:${lead}`);
          if (clashes([...mine, ...extra.prims], lead, me, true) > 0) continue;
          // Kıskaç kendi kenar köprüsüne de değmez (kısa teliyle aynı nesne sayılır).
          if (extra.bridge.length && mine.some((p) => extra.bridge.some((q) => primsOverlap(p, q)))) continue;
          // Kablonun yolu en pahalısı: yalnızca çakışmayan ve öbür paylarla en iyiden iyi olabilecek seçenekte.
          const cabled = (o.cabled ??= occluded + cableOcclusion(o.pose, lead));
          if (cabled > limit) continue;
          const total = o.cheap + 40 * cabled;
          if (found && total >= found.total) continue;
          found = { o, total };
        }
      }
      return found ? { c: found.o.c!, pose: found.o.pose } : null;
    };
    /** Adaylardan en uygun duruş (verilen eğimlerle, örtme sınırı `limit`). */
    const choose = (lead: number, candidates: readonly Candidate[], elevations: readonly number[], limit: number) => pickFrom(candidates, lead, limit, elevations);

    const commitStub = (lead: number, net: string, c: Candidate, pose: ClipPose) => {
      const placement: ClipPlacement = { ...pose, lead, net, kind: c.kind, hole: c.hole, onto: null };
      clips.set(lead, placement);
      placed.push(...clipPrims(placement, `clip:${lead}`));
      const stub: StubPlacement = { ...c.stub, hole: c.hole, net, lead };
      stubs.push(stub);
      placed.push(...stubPrims(stub, `clip:${lead}`));
      used.add(holeKey(c.hole));
      if (c.bridge) {
        const bridge: BridgePlacement = { net, lead, ...c.bridge };
        bridges.push(bridge);
        placed.push(...bridgePrims(bridge, plan.cols));
        used.add(holeKey(c.bridge.a)).add(holeKey(c.bridge.b));
        owners.set(conductorOf(c.bridge.b), net);
      }
    };

    /**
     * Bir delikteki kısa tel: düz; deliğin üstünü bir parçanın gövdesi örtüyorsa tel gövdenin altından yatay çıkıp
     * dikilir (eğik tel, alçakta ya da kartın üstünde yatarak).
     */
    const stubsAt = (h: Hole, cost: number): Array<{ hole: Hole; stub: StubShape; cost: number }> => {
      const foot = holeTop(h, plan.cols);
      const straight = stubShape(foot);
      const prims = stubPrims(straight, 'stub');
      if (!prims.some((p) => partPrims.some((q) => primsOverlap(p, q)))) return [{ hole: h, stub: straight, cost }];
      const out: Array<{ hole: Hole; stub: StubShape; cost: number }> = [];
      for (const knee of STUB_KNEES) {
        for (const reach of [1, 1.6, 2.4, 3.2]) {
          for (const d of [new Vector3(0, 0, -1), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(1, 0, 0)]) {
            out.push({ hole: h, stub: stubShape(foot, d.multiplyScalar(reach), knee), cost: cost + 1 + 0.3 * reach });
          }
        }
      }
      return out;
    };

    /** Ağın iletkenlerindeki boş delikler. */
    const netCandidates = (net: string): Candidate[] => {
      const holes = new Map<string, Hole>();
      for (const [conductor, owner] of owners) {
        if (owner !== net) continue;
        for (const h of connectedHoles(conductor.startsWith('s') ? stripHole(conductor) : railHole(conductor), plan.cols)) if (!used.has(holeKey(h))) holes.set(holeKey(h), h);
      }
      // Aynı ağın kıskaçları bir arada kalsın (etiket onların üstünde): yerleşmiş tellere uzaklık hafifçe sayılır.
      const mine = stubs.filter((s) => s.net === net).map((s) => s.foot);
      return [...holes.values()].flatMap((h) => {
        const top = holeTop(h, plan.cols);
        const cost = holeCost(h) + (mine.length ? 0.08 * Math.min(...mine.map((f) => f.distanceTo(top))) : 0);
        return stubsAt(h, cost).map((x) => ({ ...x, kind: 'stub' as const, bridge: null }));
      });
    };

    /**
     * Kenar köprüleri: ağın boş bir deliğinden kimsenin kullanmadığı yakın bir şeride (en çok BRIDGE_REACH) kısa jumper
     * (alçak ya da aradaki parçaların üstünden kemer); tel o şeridin arka kenara en yakın boş deliklerinden birinde.
     */
    const bridgeCandidates = (net: string): Candidate[] => {
      const from = netCandidates(net).map((c) => ({ h: c.hole, at: holeTop(c.hole, plan.cols) }));
      const out: Candidate[] = [];
      // Her boş şerit için en kısa iki köprü (eşit boyda olanlardan parça gövdelerinden uzak olanı: gövdenin
      // önündeki delikten çıkan köprü onu örter).
      type Pair = { a: Hole; b: Hole; d: number; at: Vector3; bt: Vector3; score: number };
      const strips: Array<{ pairs: Pair[]; holes: Hole[] }> = [];
      const clearance = (p: Vector3) => (bodyRects.length ? Math.min(2, ...bodyRects.map((r) => rectDistance(p.x, p.z, r))) : 2);
      for (let board = 0; board < plan.boards; board++) {
        for (let col = 1; col <= plan.cols; col++) {
          for (const half of [0, 1]) {
            if (owners.has(`s${board}:${col}:${half}`)) continue;
            const holes = connectedHoles({ kind: 'strip', board, col, row: half * 5 }, plan.cols).filter((h) => !used.has(holeKey(h)));
            if (holes.length < 2) continue;
            const pairs: Pair[] = [];
            for (const b of holes) {
              const bt = holeTop(b, plan.cols);
              for (const { h: a, at } of from) {
                const d = Math.hypot(at.x - bt.x, at.z - bt.z);
                if (d >= 1 && d <= BRIDGE_REACH) pairs.push({ a, b, d, at, bt, score: d - 0.75 * Math.min(clearance(at), clearance(bt)) });
              }
            }
            if (pairs.length) strips.push({ pairs: pairs.sort((x, y) => x.score - y.score).slice(0, 2), holes });
          }
        }
      }
      // En yakın şeritler (köprü kısa olsun).
      strips.sort((x, y) => x.pairs[0]!.score - y.pairs[0]!.score);
      for (const { pairs, holes } of strips.slice(0, 8)) {
        for (const { a, b, d, at, bt } of pairs) {
          const rest = holes.filter((h) => holeKey(h) !== holeKey(b)).sort((x, y) => holeCost(x) - holeCost(y)).slice(0, 3);
          for (const lift of [jumperLift(at, bt), ...BRIDGE_LIFTS]) {
            for (const s of rest) for (const x of stubsAt(s, holeCost(s) + 3 + 0.3 * d + 0.2 * lift)) out.push({ ...x, kind: 'bridge', bridge: { a, b, shape: { lift, bow: 0 } } });
          }
        }
      }
      return out;
    };

    /** Tahtada kur: kablonun kendi deliği; gövdesi deliğin üstünü örten parçanın altından çıkan eğik tel de olur. */
    const ownCandidates = (lead: number): Candidate[] => {
      const h = plan.leads[lead]!.hole;
      const foot = holeTop(h, plan.cols);
      const out: Candidate[] = [{ kind: 'stub', hole: h, stub: stubShape(foot), bridge: null, cost: 0 }];
      for (const knee of STUB_KNEES) {
        for (const reach of [1, 1.6, 2.4, 3.2]) {
          for (const d of [new Vector3(0, 0, -1), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(1, 0, 0)]) {
            out.push({ kind: 'stub', hole: h, stub: stubShape(foot, d.multiplyScalar(reach), knee), bridge: null, cost: 2 + reach });
          }
        }
      }
      return out;
    };

    /** Zincir: aynı ağda zinciri olmayan bir kıskacın metal çenesi (üstünden ya da yanından). */
    const chainOnto = (lead: number, net: string, elevations: readonly number[]): { onto: ClipPlacement; pose: ClipPose } | null => {
      let found: { onto: ClipPlacement; pose: ClipPose; cheap: number } | null = null;
      for (const target of clips.values()) {
        if (target.net !== net || target.kind === 'chain' || chained.has(target.lead)) continue;
        const options: Option[] = [];
        for (const f of CHAIN_AT) {
          for (const [u, w] of [[0.3, 0], [0, 0.4], [0, -0.4], [-0.3, 0]] as const) {
            const jaw = target.jaw.clone().addScaledVector(target.axis, f * CLIP.length).addScaledVector(target.up, u * CLIP.height).addScaledVector(target.side, w * CLIP.width);
            optionsAt(jaw, lead, jaw, null, 0, elevations, options);
          }
        }
        const o = best(options, lead, { kind: 'chain', onto: target.lead }, 1);
        if (o && (!found || o.cheap < found.cheap)) found = { onto: target, pose: o.pose, cheap: o.cheap };
      }
      return found;
    };

    /** Hiçbir aday çakışmasız değilse: en az çakışan duruş (testte çakışma sayılır). */
    const fallback = (lead: number, c: Candidate): { c: Candidate; pose: ClipPose } => {
      const options: Option[] = [];
      optionsAt(c.stub.top.clone().setY(c.stub.top.y - GRIP_BELOW_TIP), lead, c.stub.foot, c, 0, [...ELEVATIONS, ...STEEP], options);
      let found: { pose: ClipPose; n: number } | null = null;
      for (const o of options) {
        const n = clashes([...clipPrims(o.pose, `clip:${lead}`), ...stubPrims(c.stub, `clip:${lead}`)], lead, { kind: 'stub', onto: null });
        if (!found || n < found.n) found = { pose: o.pose, n };
      }
      return { c, pose: found!.pose };
    };

    const flat = (pose: ClipPose) => Math.asin(Math.min(1, Math.max(-1, pose.axis.y))) <= MAX_ELEVATION * DEG + 1e-9;
    for (const lead of order) {
      const net = plan.leads[lead]!.net;
      if (!schematic) {
        const own = ownCandidates(lead);
        const pick = choose(lead, own, ELEVATIONS, 1) ?? choose(lead, own, STEEP, 1);
        const chosen = pick ?? fallback(lead, own[0]!);
        trouble.set(lead, !pick ? 100 : flat(pick.pose) ? 0 : 20);
        commitStub(lead, net, chosen.c, chosen.pose);
        continue;
      }
      // Önce ağın boş delikleri, sonra kenar köprüsü; ikisi de parçaları örtüyorsa örtme sınırı gevşer (ölçülen sınır %20).
      let viaNet: Candidate[] | null = null;
      let viaBridge: Candidate[] | null = null;
      const near = () => (viaNet ??= netCandidates(net));
      const far = () => (viaBridge ??= bridgeCandidates(net));
      // Köprü adaylarından yalnızca payı en küçük olanlar (her biri 65 duruş; hepsini denemek yavaş).
      const pick =
        pickFrom(near(), lead, OCCLUSION_LIMIT) ??
        pickFrom(far(), lead, OCCLUSION_LIMIT, ELEVATIONS, BRIDGE_TRIES) ??
        pickFrom(near(), lead, 2 * OCCLUSION_LIMIT) ??
        pickFrom(far(), lead, 2 * OCCLUSION_LIMIT, ELEVATIONS, BRIDGE_TRIES);
      if (pick) {
        trouble.set(lead, pick.c.kind === 'bridge' ? 1 : 0);
        commitStub(lead, net, pick.c, pick.pose);
        continue;
      }
      const link = chainOnto(lead, net, ELEVATIONS) ?? chainOnto(lead, net, STEEP);
      if (link) {
        const clip: ClipPlacement = { ...link.pose, lead, net, kind: 'chain', hole: link.onto.hole, onto: link.onto.lead };
        clips.set(lead, clip);
        chained.add(link.onto.lead);
        placed.push(...clipPrims(clip, `clip:${lead}`));
        trouble.set(lead, flat(link.pose) ? 5 : 25);
        continue;
      }
      const steep = choose(lead, netCandidates(net), [...ELEVATIONS, ...STEEP], 1);
      const last = steep ?? fallback(lead, netCandidates(net)[0] ?? ownCandidates(lead)[0]!);
      trouble.set(lead, steep ? (flat(steep.pose) ? 10 : 20) : 100);
      commitStub(lead, net, last.c, last.pose);
    }
    const total = [...trouble.values()].reduce((a, b) => a + b, 0);
    const troubled = [...trouble].filter(([, t]) => t > 1).sort((a, b) => b[1] - a[1]).map(([lead]) => lead);
    return { clips, stubs, bridges, total, troubled };
  };

  // Sıra: önce çok kablolu ağlar (aynı şeritte birden çok boş delik gerekir), ağ içinde soldan sağa (soketin yeri).
  // Bir kablo iyi yer bulamadıysa (zincir, dik duruş, çakışma) o kablo öne alınarak yeniden denenir.
  const byNet = new Map<string, number[]>();
  for (const i of leads) {
    const net = plan.leads[i]!.net;
    byNet.set(net, [...(byNet.get(net) ?? []), i]);
  }
  let order: readonly number[] = schematic
    ? [...byNet.values()].sort((a, b) => b.length - a.length || a[0]! - b[0]!).flatMap((g) => [...g].sort((i, k) => (input.socket(i)?.x ?? 0) - (input.socket(k)?.x ?? 0) || i - k))
    : leads;
  let result = attempt(order);
  const tried = new Set([order.join()]);
  for (let round = 0; round < 3 && result.troubled.length > 0; round++) {
    let better: { order: readonly number[]; result: ReturnType<typeof attempt> } | null = null;
    for (const lead of result.troubled) {
      const next = [lead, ...order.filter((i) => i !== lead)];
      if (tried.has(next.join())) continue;
      tried.add(next.join());
      const r = attempt(next);
      if (r.total < (better?.result.total ?? result.total)) better = { order: next, result: r };
    }
    if (!better) break;
    order = better.order;
    result = better.result;
  }
  const { clips, stubs, bridges } = result;

  // Birden çok cihaz kablosunun gittiği ağların etiketi: kıskaçların ortasına en yakın kıskacın gövdesinin (kılıf)
  // üstünde. Kıskaçlar ayrı deliklerde; etiket ağzın değil gövdenin üstünde olunca tahtadaki parçalardan uzak kalır
  // (kıskaçlar arka kenarda, cihazlara bakar) ve üstüne gelince o kıskaç vurgulanır.
  const junctions: Junction[] = [];
  if (schematic) {
    for (const [net, group] of byNet) {
      if (group.length < 2) continue;
      const bodies = group.map((i) => clips.get(i)!).map((c) => c.jaw.clone().addScaledVector(c.axis, 0.65 * CLIP.length));
      const mid = bodies.reduce((s, p) => s.add(p), new Vector3()).divideScalar(bodies.length);
      const at = bodies.reduce((a, b) => (b.distanceTo(mid) < a.distanceTo(mid) ? b : a));
      junctions.push({ net, at, count: group.length });
    }
  }
  return { clips, stubs, bridges, junctions };
}

/** İletken adından (conductorOf) bir delik. */
function stripHole(conductor: string): Hole {
  const [board, col, half] = conductor.slice(1).split(':').map(Number) as [number, number, number];
  return { kind: 'strip', board, col, row: half * 5 };
}
function railHole(conductor: string): Hole {
  const [board, rail] = conductor.slice(1).split(':').map(Number) as [number, number];
  return { kind: 'rail', board, rail, k: 0 };
}

/**
 * Akım noktaları için plan: cihaz kablolarının delikleri kıskacınkiyle değişir, kenar köprüleri plandaki köprülerin
 * arkasına eklenir (sahnedeki kablo yolları da bu sırada: önce plan.jumpers, sonra kenar köprüleri).
 */
export function clippedPlan(plan: BreadboardPlan, layout: ClipLayout): BreadboardPlan {
  if (layout.clips.size === 0) return plan;
  return {
    ...plan,
    leads: plan.leads.map((l, i) => {
      const clip = layout.clips.get(i);
      return clip ? { ...l, hole: clip.hole } : l;
    }),
    jumpers: [...plan.jumpers, ...layout.bridges.map((b) => ({ net: b.net, a: b.a, b: b.b }))],
  };
}

/** Tahtada 3B'de dolu delikler (denetim): bacaklar, köprüler, kıskaçsız kablolar, kısa teller, kenar köprüleri. */
export function holes3d(plan: BreadboardPlan, layout: ClipLayout | null): string[] {
  return [
    ...[...plan.onBoard.values()].flatMap((p) => [...p.holes, ...(p.extraHoles ?? [])]),
    ...plan.jumpers.flatMap((j) => [j.a, j.b]),
    ...plan.leads.filter((_, i) => !layout?.clips.has(i)).map((l) => l.hole),
    ...(layout?.stubs ?? []).map((s) => s.hole),
    ...(layout?.bridges ?? []).flatMap((b) => [b.a, b.b]),
  ].map(holeKey);
}

