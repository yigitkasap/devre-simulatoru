// Cihaz ve tahta dışı parça kablolarının yolları (three'nin yalnızca matematik sınıfları, DOM yok).
// "3B: kablolar üst üste binmez, yumuşak bükülür" (2026-11-14). Eskiden her kablo kendi başına bir Bézier eğrisiydi:
// aynı yoldan geçen kablolar (multimetrenin kırmızı ve siyah kablosu) üst üste çiziliyor, titreşiyordu.
//
// Düzen (serbest kamera): cihazlarla direk sırası arasındaki masa bir kablo koridorudur. Koridorda x boyunca uzanan
// şeritler vardır (aralık: kablo çapı + pay); aynı yöne giden kablolar şeritlerde yan yana, düz bir bant gibi yatar.
//   - Cihaz kablosu: soketten düz çıkar, kendi şeridinin üstüne kadar havada ilerler, masaya iner, şeridinde direğinin
//     hizasına kadar gider, orada dikey yükselir ve fişine arkadan girer. Başka bir şeridi kesen her kısım havadadır
//     (iniş ve çıkış): kesişen kablo ötekinin üstünden geçer, gövdeler birbirine girmez.
//   - Soketi direğiyle neredeyse aynı hizada olan kablo (şeritte iki dönüşe yer yok) koridorun üstünden, hafifçe
//     sarkarak doğrudan gider.
//   - Tahta dışı parçanın (pil, motor, röle…) kablosu: ucundan çapraz ayrılır, parçanın yanındaki boşlukta arkaya
//     doğru yatar (yan şeritler), koridorda kendi şeridine döner.
// Her köşe en az CABLE_BEND yarıçaplı bir yayla yuvarlanır (cablePath.ts → roundPath).
//
// Tepeden görünümde cihazlar tahtanın hemen arkasındaki kartlardır (koridor yok): kablo kısa bir kavistir; kavislerin
// yükseklikleri farklıdır (kesişen kablolar üst üste gelmez).

import { Box3, CubicBezierCurve3, Vector3 } from 'three';
import { pathDistance, roundPath, trimPath } from './cablePath';
import { CABLE_RADIUS } from './jumpers';
import { plugEntry, type PostLayout } from './posts';

const CABLE_R = CABLE_RADIUS;
/** En küçük bükülme yarıçapı: 4 kablo çapı. */
export const CABLE_BEND_MIN = 8 * CABLE_R;
/** Yolların kurulduğu yarıçap (sınırın biraz üstü). */
const R = CABLE_BEND_MIN + 0.06;
/** Masada yatan kablonun merkez yüksekliği. */
export const CABLE_TABLE = CABLE_R + 0.02;
/** Şeritler arası aralık: kablo çapı ve küçük bir pay. */
export const CABLE_PITCH = 2 * CABLE_R + 0.06;
/** Kablonun fişe girmeden önceki düz kısmı. */
const BOOT = 0.5;
/** Soketteki fişin boyu: kablo fişin ucundan başlar. */
const PLUG_LENGTH = 1.5;
/** Tahta dışı kabloların koridorda en geride olabileceği şerit (cihazların ön yüzüne değmeden). */
const SIDE_LANES = 10;
/** Atlamanın (masadaki bir kablonun üstünden geçiş) rampasının boyu. */
const RAMP = 3;
/** İnişin başka bir kablonun direğine en az uzaklığı (x). */
const SHIFT = 0.95;
/** İki kablonun merkez çizgileri arasında aranan en küçük uzaklık. */
const CLEAR = 2 * CABLE_R + 0.02;

export interface CableJob {
  /** Kablonun çıktığı uç (soket ya da parçanın ucu; dünya). */
  readonly from: Vector3;
  /** Ön paneldeki soketin baktığı yön (laboratuvar cihazı). */
  readonly dir?: Vector3;
  /** Parçanın kutusu (dünya). */
  readonly box: Box3;
  /** Laboratuvar cihazı (ön panelinde soket) mı, tahta dışı parça mı. */
  readonly instrument: boolean;
  /** Kablonun fişe girdiği yer (posts.ts → plugEntry). */
  readonly entry: Vector3;
}

export interface RouteContext {
  /** Taban plakasının yarı genişliği (x) ve arka kenarı (z). */
  readonly plateHalf: number;
  readonly plateBack: number;
  /** Plakanın üst yüzü (y). */
  readonly plateTop: number;
  /** Tepeden görünüm: cihazlar kart, koridor yok. */
  readonly top: boolean;
}

export type RouteKind = 'lane' | 'bridge' | 'side' | 'arc';

export interface CableRoute {
  readonly points: Vector3[];
  readonly kind: RouteKind;
  /** Köşelerdeki en küçük yarıçap (kavisli tepeden görünüm yolunda ölçülmez: sonsuz). */
  readonly minRadius: number;
  /** Koridordaki şerit (0: direklere en yakın); şeritsiz yolda −1. */
  readonly lane: number;
}

export interface RouteResult {
  readonly routes: CableRoute[];
  /** Şeridine yer kalmayan kablo sayısı (koridor dolu). */
  readonly overflow: number;
  /** Koridorun yerleşimi: düz, üst üste yatan kablolu ya da atlamalı. */
  readonly mode: 'flat' | 'stacked' | 'hops';
}

interface LaneItem {
  readonly index: number;
  readonly side: boolean;
  /** Koridora girdiği x (soketin ya da yan şeridin x'i) ve direğin x'i. */
  readonly xa: number;
  readonly xp: number;
  /** Koridora kadar olan dayanak noktaları. */
  readonly pre: Vector3[];
  /** Cihaz kablosu: soketten çıkışın bittiği z ve yükseklik (iniş buradan başlar). */
  readonly yh: number;
  readonly exitZ: number;
  /** En derin olabileceği şerit (plakanın kenarından inen kablo dönüşe yer ister). */
  minLane: number;
  /** Doğrudan giden bir kablo bu kablonun direğinin hizasından geçiyorsa: en geride olabileceği şerit. */
  capLane: number;
  /** Aynı şeritte üst üste yatan kablolarda kat (0: masada). */
  layer: number;
  lane: number;
}

const Z = new Vector3(0, 0, 1);

/** Soketten çıkış: fişin ucu ve (soket yukarı bakıyorsa) yataya dönüş köşesi. */
function socketExit(job: CableJob): { pre: Vector3[]; x: number; y: number; z: number; lead: number } {
  const dir = (job.dir ?? Z).clone().normalize();
  const a1 = job.from.clone().addScaledVector(dir, PLUG_LENGTH);
  const tilt = dir.angleTo(Z);
  if (tilt < 0.02) return { pre: [a1], x: a1.x, y: a1.y, z: a1.z, lead: 0 };
  const t = R * Math.tan(tilt / 2) + 0.02;
  const knee = a1.clone().addScaledVector(dir, t);
  return { pre: [a1, knee], x: knee.x, y: knee.y, z: knee.z, lead: t };
}

/**
 * Tahta dışı parçanın kablosu koridora kadar: uçtan çapraz ayrılır (arkaya ve yan şeridine doğru), yan şeritte arkaya
 * gider. `slot`: yan şeridin x'i ve yüksekliği.
 */
function sidePre(job: CableJob, slot: { x: number; y: number }, steep: boolean, ctx: RouteContext): Vector3[] {
  const from = job.from.clone();
  const h = Math.hypot(slot.x - from.x, slot.y - from.y);
  const pre = [from];
  if (h > 0.05) {
    // Çaprazın arkaya uzanışı: 45° (uçlar sıksa 60°); kısa çaprazda köşe yayı sığsın diye biraz daha uzun.
    const back = Math.max(steep ? h * 0.58 : h, Math.sqrt((R * h) / 2) + 0.05);
    pre.push(new Vector3(slot.x, slot.y, from.z - back));
  }
  // Plakanın kenar payında yatan kablo arka kenardan sonra hafif bir eğimle masaya iner (koridordaki köşesine kadar).
  if (slot.y > CABLE_TABLE + 0.01) pre.push(new Vector3(slot.x, slot.y, ctx.plateBack + 0.3));
  return pre;
}

/** Tahta dışı parçaların yan şeritleri: her kablonun şeridi (x, y) ve çaprazının dikliği. */
function sideSlots(jobs: readonly CableJob[], ctx: RouteContext): Map<number, { x: number; y: number; steep: boolean }> {
  const out = new Map<number, { x: number; y: number; steep: boolean }>();
  const side = jobs.map((job, index) => ({ job, index })).filter((j) => !j.job.instrument);
  for (const s of [-1, 1]) {
    const mine = side.filter((j) => (j.job.box.min.x + j.job.box.max.x) / 2 >= 0 === s > 0);
    // Sütunlar: kutuları x'te üst üste binen parçalar aynı sütundadır.
    const faces = [...new Set(mine.map((j) => `${Math.min(Math.abs(j.job.box.min.x), Math.abs(j.job.box.max.x)).toFixed(1)}:${Math.max(Math.abs(j.job.box.min.x), Math.abs(j.job.box.max.x)).toFixed(1)}`))]
      .map((k) => k.split(':').map(Number) as [number, number])
      .sort((p, q) => p[0] - q[0]);
    faces.forEach(([near, far], column) => {
      const inColumn = mine.filter((j) => Math.abs(Math.min(Math.abs(j.job.box.min.x), Math.abs(j.job.box.max.x)) - near) < 0.06);
      const isInner = (j: (typeof mine)[number]) => Math.abs(Math.abs(j.job.from.x) - near) <= Math.abs(Math.abs(j.job.from.x) - far);
      for (const inner of [true, false]) {
        const group = inColumn.filter((j) => isInner(j) === inner).sort((p, q) => q.job.from.z - p.job.from.z || Math.abs(p.job.from.x) - Math.abs(q.job.from.x));
        if (group.length === 0) continue;
        // Uçlar birbirine yakınsa (rölenin kontakları) çapraz dikleşir: koşut çaprazlar birbirine değmesin.
        const steep = group.some((j, k) => k > 0 && Math.abs(group[k - 1]!.job.from.z - j.job.from.z) < 0.85 && Math.abs(Math.abs(group[k - 1]!.job.from.x) - Math.abs(j.job.from.x)) < 0.5);
        const first = steep ? 1.25 : 0.6;
        // Şeritler: yüzden uzaklaşarak. İçeride sınır plakanın kenarı (ya da öndeki sütunla aradaki boşluğun ortası);
        // boşluk dolunca (bir yanda dörtten çok kablo) plakanın kenar payında, tahtanın yanında iki şerit daha var.
        // Dışarıda sınır sonraki sütunla aradaki boşluğun ortası.
        const slots: Array<{ x: number; y: number }> = [];
        if (inner) {
          const prev = column > 0 ? faces[column - 1]![1] : null;
          const limit = prev === null ? ctx.plateHalf + CABLE_R : (prev + near) / 2 + CABLE_PITCH / 2;
          for (let d = first; near - d >= limit - 1e-9; d += CABLE_PITCH) slots.push({ x: s * (near - d), y: CABLE_TABLE });
          if (prev === null) {
            slots.push({ x: s * (ctx.plateHalf - CABLE_R), y: ctx.plateTop + CABLE_TABLE });
            slots.push({ x: s * (ctx.plateHalf - CABLE_R - CABLE_PITCH), y: ctx.plateTop + CABLE_TABLE });
          }
        } else {
          const next = column + 1 < faces.length ? faces[column + 1]![0] : null;
          const limit = next === null ? Number.POSITIVE_INFINITY : (far + next) / 2 - CABLE_PITCH / 2;
          for (let d = first; far + d <= limit + 1e-9 && slots.length < 12; d += CABLE_PITCH) slots.push({ x: s * (far + d), y: CABLE_TABLE });
        }
        if (slots.length === 0) slots.push({ x: s * (inner ? near - first : far + first), y: CABLE_TABLE });
        // Öndeki uç yüzden en uzak şeridi alır (arkadaki uçların kabloları onun yolunu kesmeden katılır). Şerit
        // yetmezse (bir yanda altıdan çok kablo) fazlası aynı aralıkla dizilmeyi sürdürür.
        const last = slots[slots.length - 1]!;
        while (slots.length < group.length) slots.push({ x: s * (Math.abs(slots[slots.length - 1]!.x) + (inner ? -1 : 1) * CABLE_PITCH), y: last.y });
        group.forEach((j, k) => out.set(j.index, { ...slots[group.length - 1 - k]!, steep }));
      }
    });
  }
  return out;
}

/** Tepeden görünümdeki kısa kavis: yükseklik `lift` (kesişen kavisler farklı yükseklikte). */
function arc(job: CableJob, lift: number): CableRoute {
  const a = job.from.clone().add(new Vector3(0, 1.4, 0));
  const b = job.entry.clone();
  const curve = new CubicBezierCurve3(a, a.clone().add(new Vector3(0, lift, 0)), b.clone().add(new Vector3(0, lift, 0)), b);
  return { points: curve.getPoints(28), kind: 'arc', minRadius: Number.POSITIVE_INFINITY, lane: -1 };
}

/** Soketi direğiyle aynı hizadaki kablo: koridorun üstünden, ortası `sag` kadar sarkarak. */
function bridge(job: CableJob, sag: number): CableRoute {
  const exit = socketExit(job);
  const a = exit.pre[exit.pre.length - 1]!;
  const dir = exit.pre.length > 1 ? Z : (job.dir ?? Z).clone().normalize();
  const a2 = a.clone().addScaledVector(dir, 1.0);
  const p = job.entry.clone().addScaledVector(Z, -(BOOT + 1.2));
  const mid = a2.clone().lerp(p, 0.5);
  mid.y = Math.max(CABLE_TABLE, mid.y - sag);
  const path = roundPath([...exit.pre, a2, mid, p, job.entry.clone()], R);
  return { points: path.points, kind: 'bridge', minRadius: path.minRadius, lane: -1 };
}

/** Kablonun, uçlarındaki fişlerin dışındaki kısmı (uzaklık ölçümünde). */
export const cableBody = (points: readonly Vector3[]): Vector3[] => trimPath(points, 0.3, 0.3);

/**
 * Bütün direk kablolarının yolları (`jobs` sırasıyla). Şerit ataması: kablolar derinden (direklere yakın şeritten)
 * başlayarak yerleşir; aynı şeritte x aralıkları üst üste binmez. Kısıtlar:
 *   - aynı yandaki tahta dışı kablolar iç içe döner (plakaya yakın yan şerit, direklere yakın koridor şeridi);
 *   - yan şeridin üstünden geçen cihaz kablosu o tahta dışı kablodan geride (cihazlara yakın) kalır.
 * Soketi başka bir kablonun direğiyle aynı hizadaki cihaz kablosunun inişi yana kayar (öbürünün fişe giden üst
 * kısmının içinden geçmesin).
 */
export function routeCables(jobs: readonly CableJob[], ctx: RouteContext): RouteResult {
  const routes: Array<CableRoute | null> = jobs.map(() => null);
  const slots = sideSlots(jobs, ctx);
  const items: LaneItem[] = [];
  const bridges: number[] = [];
  let arcs = 0;
  jobs.forEach((job, index) => {
    if (!job.instrument) {
      const slot = slots.get(index)!;
      // Plakadan inen kablonun koridordaki köşesi plakanın arka kenarının yeterince gerisinde olmalı.
      const minLane = slot.y > CABLE_TABLE + 0.01 ? Math.max(0, Math.ceil((job.entry.z - R - BOOT - (ctx.plateBack + 0.3 - R - 0.4)) / CABLE_PITCH)) : 0;
      items.push({ index, side: true, xa: slot.x, xp: job.entry.x, pre: sidePre(job, slot, slot.steep, ctx), yh: 0, exitZ: Number.NEGATIVE_INFINITY, minLane, capLane: 99, layer: 0, lane: -1 });
      return;
    }
    if (ctx.top) {
      // Kavis yükseklikleri sırayla artar: iki kavis kesişse de aynı yükseklikte buluşmaz.
      const dist = job.from.distanceTo(job.entry);
      routes[index] = arc(job, Math.min(6, 1.2 + 0.08 * dist) + CABLE_PITCH * 1.2 * arcs++);
      return;
    }
    const exit = socketExit(job);
    if (Math.abs(exit.x - job.entry.x) < 2 * R + 0.05) {
      bridges.push(index);
      return;
    }
    // İniş başka bir kablonun direğinin hizasına düşüyorsa (o kablonun fişe giden üst kısmının içinden geçerdi) yana
    // kayar: soketten sonra hafif çapraz ilerler. Kendi direğinden uzaklaşan yön yeğlenir.
    const posts = jobs.flatMap((other, k) => (k === index ? [] : [other.entry.x]));
    const near = (x: number) => posts.some((px) => Math.abs(x - px) < SHIFT);
    let xd = exit.x;
    if (near(xd)) {
      const away = Math.sign(exit.x - job.entry.x) || 1;
      const blocker = posts.filter((px) => Math.abs(exit.x - px) < SHIFT).sort((p, q) => Math.abs(exit.x - p) - Math.abs(exit.x - q))[0]!;
      xd = [blocker + away * SHIFT, blocker - away * SHIFT].find((x) => !near(x) && Math.abs(x - job.entry.x) >= 2 * R + 0.05) ?? blocker + away * SHIFT;
    }
    // Çapraz, soketten (ve varsa yataya dönüş köşesinden) sonraki kısa bir düz parçadan başlar.
    const shifted = xd !== exit.x;
    const pre = shifted ? [...exit.pre, new Vector3(exit.x, exit.y, exit.z + exit.lead + 1)] : exit.pre;
    items.push({ index, side: false, xa: xd, xp: job.entry.x, pre, yh: exit.y, exitZ: exit.z + exit.lead + (shifted ? 1.6 : 0), minLane: 0, capLane: 99, layer: 0, lane: -1 });
  });

  // --- Şerit ataması ---
  const z0 = (job: CableJob) => job.entry.z - R - BOOT;
  const laneZ = (item: LaneItem) => z0(jobs[item.index]!) - item.lane * CABLE_PITCH;
  const layerY = (layer: number) => CABLE_TABLE + layer * CABLE_PITCH;
  /** İniş: yeterince yüksek sokette dikey; alçak sokette öne yatık (iki köşe yayı sığsın). */
  const slant = (drop: number) => {
    let lean = 0;
    let top = R;
    for (; lean < 8; lean += 0.1) {
      const len = Math.hypot(drop, lean);
      top = R * Math.tan(Math.acos(lean / len) / 2);
      if (len >= top + R + 0.02) break;
    }
    return { lean, top };
  };
  const descent = (item: LaneItem, layer: number) => slant(item.yh - layerY(layer));
  /** Direğe çıkış (üst katta yatan kabloda yükseklik iki köşe yayına yetmez: öne yatık). */
  const rise = (item: LaneItem, layer: number) => slant(jobs[item.index]!.entry.y - layerY(layer));
  /** Öne yatık çıkışa yer bırakan en derin şerit. */
  const riseLane = (item: LaneItem, layer: number) => {
    const r = rise(item, layer);
    return Math.max(0, Math.ceil((r.lean + r.top - R) / CABLE_PITCH - 1e-9));
  };
  /** Kablonun en geride olabileceği şerit (iniş sokete yakın şeride sığmaz). */
  const maxLane = (item: LaneItem, layer = 0) => {
    if (item.side) return SIDE_LANES;
    const d = descent(item, layer);
    return Math.floor((z0(jobs[item.index]!) - (item.exitZ + d.top + 0.03 + d.lean)) / CABLE_PITCH + 1e-9);
  };
  const lo = (item: LaneItem) => Math.min(item.xa, item.xp);
  const hi = (item: LaneItem) => Math.max(item.xa, item.xp);
  // Doğrudan giden kabloların (köprü) hattı: hattın altından geçen soketin inişi hattın gerisinde, direğin çıkışı
  // hattın önünde kalmalı (kablo ötekinin inişinin ya da fişe giden üst kısmının içinden geçmesin).
  for (const index of bridges) {
    const job = jobs[index]!;
    const exit = socketExit(job);
    const a = exit.pre[exit.pre.length - 1]!;
    const p = job.entry.clone().addScaledVector(Z, -(BOOT + 1.2));
    const zAt = (x: number) => a.z + 1 + Math.max(0, Math.min(1, Math.abs(p.x - a.x) < 1e-6 ? 1 : (x - a.x) / (p.x - a.x))) * (p.z - a.z - 1);
    const within = (x: number) => x > Math.min(a.x, p.x) - 0.6 && x < Math.max(a.x, p.x) + 0.6;
    for (const item of items) {
      const z = z0(jobs[item.index]!);
      if (!item.side && within(item.xa)) item.minLane = Math.max(item.minLane, Math.ceil((z - (zAt(item.xa) - 0.5)) / CABLE_PITCH));
      if (within(item.xp)) item.capLane = Math.min(item.capLane, Math.floor((z - (zAt(item.xp) + 0.5)) / CABLE_PITCH));
    }
  }
  /** deeper.get(i): i'den önce (daha derine) yerleşmesi gerekenler. */
  const deeper = new Map<LaneItem, Set<LaneItem>>(items.map((i) => [i, new Set<LaneItem>()]));
  for (const s of [-1, 1]) {
    const mine = items.filter((i) => i.side && i.xa >= 0 === s > 0).sort((p, q) => Math.abs(p.xa) - Math.abs(q.xa));
    for (let k = 1; k < mine.length; k++) deeper.get(mine[k]!)!.add(mine[k - 1]!);
  }
  /** Yan şeridin üstünden geçen cihaz kablosu o tahta dışı kablodan geride kalır (atlamalı yerleştirmede kalkar). */
  const behindSide = new Map<LaneItem, Set<LaneItem>>(items.map((i) => [i, new Set<LaneItem>()]));
  const crosses = (b: LaneItem, side: LaneItem) => side.xa > lo(b) - SHIFT && side.xa < hi(b) + SHIFT;
  for (const b of items) {
    if (b.side) continue;
    for (const side of items) if (side.side && crosses(b, side)) behindSide.get(b)!.add(side);
  }
  /**
   * Yerleştirme. `stack`: koridor dolunca kablo, aynı şeritte kendisini bütünüyle kapsayan (iki ucu da dışında kalan)
   * bir kablonun üstüne yatar (kablo demeti gibi); iniş ve çıkışlar yine birbirinin içinden geçmez. `hop`: o da
   * yetmezse cihaz kablosu yan şeritten gelen kablodan öne (direklere yakın şeride) geçebilir; kesiştiği yerde bir
   * kablo çapı yükselip onun üstünden atlar.
   */
  const assign = (stack: boolean, hop: boolean): number => {
    const before = (i: LaneItem) => (hop ? [...deeper.get(i)!] : [...deeper.get(i)!, ...behindSide.get(i)!]);
    const placed: LaneItem[] = [];
    let overflow = 0;
    const pending = new Set(items);
    for (const item of items) item.lane = -1;
    while (pending.size > 0) {
      let candidates = [...pending].filter((i) => before(i).every((d) => !pending.has(d)));
      if (candidates.length === 0) candidates = [...pending];
      const item = candidates.sort((p, q) => Math.min(maxLane(p), p.capLane) - Math.min(maxLane(q), q.capLane) || hi(q) - lo(q) - (hi(p) - lo(p)) || p.index - q.index)[0]!;
      pending.delete(item);
      const after = before(item).filter((d) => d.lane >= 0);
      const start = Math.max(item.minLane, ...after.map((d) => d.lane + 1));
      const apart = (q: LaneItem) => lo(q) > hi(item) + CABLE_PITCH || hi(q) < lo(item) - CABLE_PITCH;
      const inside = (q: LaneItem) => lo(q) + 2 * CABLE_PITCH <= lo(item) && hi(item) <= hi(q) - 2 * CABLE_PITCH;
      const fits = (lane: number, layer: number) => {
        const here = placed.filter((q) => q.lane === lane);
        if (layer === 0) return here.every((q) => q.layer > 0 || apart(q));
        return here.some((q) => q.layer === layer - 1 && inside(q)) && here.every((q) => (q.layer < layer ? apart(q) || inside(q) : q.layer > layer || apart(q)));
      };
      let lane = start;
      let layer = 0;
      for (;;) {
        if (fits(lane, 0)) break;
        // Yan şeritten gelen kablo masada kalır (köşesine masadan döner).
        if (stack && !item.side) {
          const up = [1, 2].find((l) => fits(lane, l) && lane <= maxLane(item, l) && lane >= riseLane(item, l));
          if (up !== undefined) {
            layer = up;
            break;
          }
        }
        lane++;
      }
      if (lane > maxLane(item, layer)) overflow++;
      item.lane = lane;
      item.layer = layer;
      placed.push(item);
    }
    return overflow;
  };
  // Sırayla: düz, üst üste yatan, atlamalı. İlk taşmasız (ya da en az taşan) yerleşim tutulur.
  let overflow = assign(false, false);
  let kept = items.map((i) => ({ lane: i.lane, layer: i.layer }));
  let mode: RouteResult['mode'] = 'flat';
  for (const [stack, hop] of [[true, false], [true, true]] as const) {
    if (overflow === 0) break;
    const tried = assign(stack, hop);
    if (tried < overflow) {
      overflow = tried;
      kept = items.map((i) => ({ lane: i.lane, layer: i.layer }));
      mode = hop ? 'hops' : 'stacked';
    }
  }
  items.forEach((i, k) => Object.assign(i, kept[k]));
  for (const item of items) {
    const job = jobs[item.index]!;
    const z = laneZ(item);
    const y = layerY(item.layer);
    const way = [...item.pre];
    // Atlama: bu şeridin gerisine dönen yan kabloların masadaki kısmı bu kablonun altından geçer; kablo oralarda bir
    // kablo çapı yükselir. Rampaya yer yoksa (iniş ya da çıkış yakın) kablo o uçta yüksekte başlar ya da biter.
    const sgn = Math.sign(item.xp - item.xa) || 1;
    const under = item.side ? [] : items.filter((q) => q.side && q.lane > item.lane && crosses(item, q)).map((q) => q.xa).sort((p, q) => (p - q) * sgn);
    const high = y + CABLE_PITCH;
    let startY = y;
    let endY = y;
    const hops: Vector3[] = [];
    for (let k = 0; k < under.length; ) {
      let m = k;
      while (m + 1 < under.length && Math.abs(under[m + 1]! - under[m]!) < 2 * RAMP + 1.5) m++;
      const u1 = under[k]! - sgn * 0.6;
      const u2 = under[m]! + sgn * 0.6;
      if ((u1 - sgn * RAMP - item.xa) * sgn < R + 0.4) startY = high;
      else hops.push(new Vector3(u1 - sgn * RAMP, y, z));
      hops.push(new Vector3(u1, high, z), new Vector3(u2, high, z));
      if ((item.xp - (u2 + sgn * RAMP)) * sgn < R + 0.4) endY = high;
      else hops.push(new Vector3(u2 + sgn * RAMP, y, z));
      k = m + 1;
    }
    if (startY > y && hops.length > 0 && Math.abs(hops[0]!.x - item.xa) < R + 0.4) hops.shift();
    if (endY > y && hops.length > 0 && Math.abs(hops[hops.length - 1]!.x - item.xp) < R + 0.4) hops.pop();
    if (item.side) way.push(new Vector3(item.xa, y, z));
    else way.push(new Vector3(item.xa, item.yh, z - slant(item.yh - startY).lean), new Vector3(item.xa, startY, z));
    way.push(...hops);
    // Şeritte iki dönüşe yer yoksa (yan şerit direğe yakın) kablo şeritte yatmaz: köşeden fişin hizasına eğimle çıkar.
    if (!(item.side && Math.abs(item.xa - item.xp) < 2 * R + 0.05)) way.push(new Vector3(item.xp, endY, z));
    // Çıkışın öne yatıklığı: gerektiği kadar, fişe kalan yeri geçmeden.
    const up = slant(job.entry.y - endY);
    way.push(new Vector3(item.xp, job.entry.y, z + Math.min(up.lean, Math.max(0, job.entry.z - BOOT - up.top - z))), job.entry.clone());
    const path = roundPath(way, R);
    routes[item.index] = { points: path.points, kind: item.side ? 'side' : 'lane', minRadius: path.minRadius, lane: item.lane };
  }
  // --- Doğrudan giden kablolar: öbür kablolara değmeyen ilk sarkma ---
  const SAGS = [1.2, 0.5, 2.0, 0, 2.8, -0.8, 3.6, -1.6, 4.4];
  for (const index of bridges) {
    const job = jobs[index]!;
    const others = routes.flatMap((r) => (r ? [cableBody(r.points)] : []));
    let best: { route: CableRoute; score: number } | null = null;
    for (const sag of SAGS) {
      const route = bridge(job, sag);
      const body = cableBody(route.points);
      const clear = Math.min(CLEAR * 2, ...others.map((o) => pathDistance(body, o, CLEAR)));
      const score = (route.minRadius >= CABLE_BEND_MIN ? 0 : -10) + Math.min(clear, CLEAR);
      if (!best || score > best.score + 1e-9) best = { route, score };
      if (route.minRadius >= CABLE_BEND_MIN && clear >= CLEAR) break;
    }
    routes[index] = best!.route;
  }
  return { routes: routes.map((r) => r!), overflow, mode };
}

/**
 * Masadaki parçadan (Arduino) doğrudan deliğe giden atlama kablosu: uçtan dik kalkar, `height` yüksekliğinde düz
 * gider, deliğin fişine dik iner. Köşeler yuvarlak.
 */
export function archPath(a: Vector3, b: Vector3, height: number): { points: Vector3[]; minRadius: number } {
  const path = roundPath([a.clone(), new Vector3(a.x, height, a.z), new Vector3(b.x, height, b.z), b.clone()], R);
  return { points: path.points, minRadius: path.minRadius };
}

/**
 * Atlama kablolarının yolları: her kablo, öncekilere ve `others`'a (direk kabloları) değmeyen en alçak yükseklikten
 * geçer (kesişen kablo ötekinin üstünden, bir kablo çapı yukarıdan).
 */
export function routeArches(ends: ReadonlyArray<{ a: Vector3; b: Vector3 }>, others: ReadonlyArray<readonly Vector3[]>): Array<{ points: Vector3[]; minRadius: number }> {
  const span = (e: { a: Vector3; b: Vector3 }) => Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
  const done: Vector3[][] = others.map((o) => cableBody(o));
  // Kısa kablo alçaktan, uzun kablo yüksekten geçer: bir kablonun dik kalkışı ya da inişi, üstünden geçen daha uzun
  // kablonun düz kısmının altında kalır.
  const order = ends.map((_, i) => i).sort((p, q) => span(ends[p]!) - span(ends[q]!) || p - q);
  const out = new Array<{ points: Vector3[]; minRadius: number }>(ends.length);
  for (const i of order) {
    const { a, b } = ends[i]!;
    const base = Math.max(a.y, b.y) + R + 0.05;
    let best: { points: Vector3[]; minRadius: number } | null = null;
    let bestClear = -1;
    for (let k = 0; k < 10; k++) {
      const path = archPath(a, b, base + k * CABLE_PITCH);
      const body = cableBody(path.points);
      const clear = Math.min(CLEAR, ...done.map((o) => pathDistance(body, o, CLEAR)));
      if (clear > bestClear + 1e-9) {
        best = path;
        bestClear = clear;
      }
      if (clear >= CLEAR) break;
    }
    done.push(cableBody(best!.points));
    out[i] = best!;
  }
  return out;
}

/** Direk kablolarının işleri (`layout.cables` sırasıyla; parçası sahnede olmayan kablo için null). */
export interface CableSource {
  readonly anchors: readonly Vector3[];
  readonly dirs: readonly (Vector3 | undefined)[];
  readonly box: Box3;
  readonly instrument: boolean;
}

export function cableJobs(layout: Pick<PostLayout, 'posts' | 'cables'>, source: (partId: string) => CableSource | undefined): Array<CableJob | null> {
  return layout.cables.map((c) => {
    const part = source(c.partId);
    const from = part?.anchors[c.pin];
    if (!part || !from) return null;
    return { from, dir: part.dirs[c.pin], box: part.box, instrument: part.instrument, entry: plugEntry(layout.posts[c.post]!, c.level) };
  });
}
