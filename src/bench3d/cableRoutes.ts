// Cihaz ve tahta dışı parça kablolarının yolları (three'nin yalnızca matematik sınıfları, DOM yok).
// "3B: kablolar üst üste binmez, yumuşak bükülür" (2026-11-14). Eskiden her kablo kendi başına bir Bézier eğrisiydi:
// aynı yoldan geçen kablolar (multimetrenin kırmızı ve siyah kablosu) üst üste çiziliyor, titreşiyordu.
//
// Düzen (serbest kamera): cihazlarla direk sırası arasındaki masa bir kablo koridorudur. Koridorda x boyunca uzanan
// şeritler vardır (aralık: kablo çapı + pay); aynı yöne giden kablolar şeritlerde yan yana, düz bir bant gibi yatar.
//   - Cihaz kablosu: fişin ucundan sonra hem aşağıya hem şeridinin yönüne döner, çapraz iner ve şeridine teğet yatar
//     ("kablo uçları", 2026-11-15; eskiden şeridinin üstüne kadar havada gidip dikey iniyordu: üstten bakınca dik
//     köşe). Şeridinde direğinin hizasına kadar gider, orada dikey yükselir ve fişine arkadan girer.
//   - Şeride katılma sırası: bir kablonun inişinin altında masada yatan kablo ondan önde (direklere yakın şeritte)
//     olur. Şeride sonradan katılan kablo şeridin cihazlara bakan kenarına, öbür kabloların yanına yerleşir; iniş
//     hiçbir kablonun üstünden geçmez. Aynı cihazın yan yana iki soketinden aynı yöne giden kablolar iç içe döner
//     (dıştaki önde). Kesişmesi kaçınılmaz kablolar (soket sırası direk sırasının tersi) direğin önünde, dikey
//     çıkışta kesişir: çıkan kablo ötekilerin üstünden geçer.
//   - Koridor bu sırayla dolmuyorsa (14 kablolu, çapraz bağlantılı `transformator`) sırasız yerleşime dönülür; her
//     kablo yine öbürlerine değmeyen bir çapraz inişi seçer (kısa çapraz, ya da biraz düz gidip sonra dönen).
//   - Soketi direğiyle neredeyse aynı hizada olan kablo (şeritte iki dönüşe yer yok) koridorun üstünden, hafifçe
//     sarkarak doğrudan gider.
//   - Tahta dışı parçanın (pil, motor, röle…) kablosu: ucundan çapraz ayrılır, parçanın yanındaki boşlukta arkaya
//     doğru yatar (yan şeritler), koridorda kendi şeridine döner.
// Her köşe en az CABLE_BEND yarıçaplı bir yayla yuvarlanır (cablePath.ts → roundPath).
//
// Tepeden görünümde cihazlar tahtanın hemen arkasındaki kartlardır (koridor yok): kablo kartın soketinden direğe bir
// kemerdir; her kemer öncekilere değmeyen en alçak yükseklikten geçer (kesişen kablolar farklı yükseklikte).

import { Box3, Vector3 } from 'three';
import { pathDistance, roundPath, trimPath, type RoundedPath } from './cablePath';
import { CABLE_RADIUS } from './jumpers';
import { BB } from './breadboard';
import { PLATE, plugEntry, type PostLayout } from './posts';

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
/** Direkteki muz fişin içine giren son parça (gövde denetiminde sayılmaz). */
const PLUG_ENTRY = 0.05;
/** Tahta dışı kabloların koridorda en geride olabileceği şerit (cihazların ön yüzüne değmeden). */
const SIDE_LANES = 10;
/** Atlamanın (masadaki bir kablonun üstünden geçiş) rampasının boyu. */
const RAMP = 3;
/** İnişin başka bir kablonun direğine en az uzaklığı (x). */
const SHIFT = 0.95;
/** İki kablonun merkez çizgileri arasında aranan en küçük uzaklık. */
const CLEAR = 2 * CABLE_R + 0.02;
/** Şeride katılma sırası hesabında inişin şerit boyunca uzanışı (sayılan) ve soketin iki yanındaki pay. */
const DROP_NOMINAL = 6;
const JOIN_MARGIN = 0.8;
/** Tepeden görünümdeki kemerin kalkışının ve inişinin öne yatıklığı. */
const TOP_SLANT = 1.2;
/** Çapraz inişin şerit boyunca uzanışı için denenen boylar (şeridin derinliğine göre seçilen ikisinden sonra). */
const DROP_LENGTHS = [7, 5, 4.2, 3.5, 3, 2.4, 1.9, 1.5, 1.1, 0.7, 0.4];
/** Çapraz inişte kablonun çekül doğrultusuna en çok yaklaşabileceği oran (|dy| / boy; 1: dikey). */
export const DROP_PLUMB = 0.97;
/** Çapraz inişin köşelerinde denenen yarıçaplar (büyükten küçüğe; yer oldukça geniş kavis). */
const DROP_RADII = [5.2, 4.2, 3.3, 2.7, R];

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
  /** Taban plakasının yarı genişliği (x): tahta dışı kablolar plakanın dışından dolanır. */
  readonly plateHalf: number;
  /** Tepeden görünüm: cihazlar kart, koridor yok. */
  readonly top: boolean;
  /** Masadaki bütün parçaların kutuları (kablosu direğe gitmeyen Arduino da): kablolar köşelerinden dolanırken değmez. */
  readonly bodies?: readonly Box3[];
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
  /** Çapraz inişe yer bulamayıp dikey inen cihaz kablosu sayısı. */
  readonly steep: number;
  /** Şeritler katılma sırasıyla mı dolduruldu (koridor o sırayla dolmayınca sırasız yerleşime dönülür). */
  readonly joined: boolean;
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
  /** Cihaz kablosu: soketin x'i (iniş yana kaydırılmışsa `xa`'dan farklı) ve soketten çıkış. */
  readonly sx: number;
  readonly exit: SocketExit | null;
  /** En derin olabileceği şerit (plakanın kenarından inen kablo dönüşe yer ister). */
  minLane: number;
  /** Doğrudan giden bir kablo bu kablonun direğinin hizasından geçiyorsa: en geride olabileceği şerit. */
  capLane: number;
  /** Çapraz inişe yer bulamayan kablo için en geride olabileceği şerit (yeniden atamada bir öne alınır). */
  limit: number;
  /** Aynı şeritte üst üste yatan kablolarda kat (0: masada). */
  layer: number;
  lane: number;
}

const Z = new Vector3(0, 0, 1);

interface SocketExit {
  readonly pre: Vector3[];
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly lead: number;
}

/** Soketten çıkış: fişin ucu ve (soket yukarı bakıyorsa) yataya dönüş köşesi. */
function socketExit(job: CableJob): SocketExit {
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
function sidePre(job: CableJob, slot: { x: number; y: number }, steepGroup: boolean): Vector3[] {
  let steep = steepGroup;
  const from = job.from.clone();
  const pre = [from];
  const lateral = Math.sign(slot.x - from.x) || 1;
  // Uç gövdenin üstünde ve kenarından içerideyse (AC kaynağın vidaları) kablo önce kenarın üstünden dışarı çıkar,
  // sonra şeridine iner: gövdenin köşesinin içinden geçmez.
  const face = lateral > 0 ? job.box.max.x : job.box.min.x;
  const inset = (face - from.x) * lateral;
  let start = from;
  if (inset > 0.15 && from.z - job.box.min.z < inset) {
    // Uç gövdenin arka yüzündeyse (hoparlörün uçları) kablo önce düz arkaya, gövdenin dışına çıkar.
    start = new Vector3(from.x + lateral * 0.08, from.y, job.box.min.z - 0.6);
    pre.push(start);
    steep = false;
  } else if (inset > 0.15 && job.box.max.y - from.y < 0.6) {
    start = new Vector3(from.x + lateral * (inset + 0.6), from.y + 0.6, from.z - 2);
    pre.push(start);
  }
  const h = Math.hypot(slot.x - start.x, slot.y - start.y);
  if (h > 0.05) {
    // Çaprazın arkaya uzanışı: 45° (uçlar sıksa ya da içerideyse 60°); kısa çaprazda köşe yayı sığsın diye biraz daha
    // uzun; kenarın üstünden aşan kabloda iki köşe yayına yetecek kadar.
    const back = Math.max(steep ? h * 0.58 : h, Math.sqrt((R * h) / 2) + 0.05, start === from ? 0 : 2);
    pre.push(new Vector3(slot.x, slot.y, start.z - back));
  }
  return pre;
}

/** Tahta dışı parçaların yan şeritleri: her kablonun şeridi (x, y) ve çaprazının dikliği. */
function sideSlots(jobs: readonly CableJob[], ctx: RouteContext): Map<number, { x: number; y: number; steep: boolean }> {
  const out = new Map<number, { x: number; y: number; steep: boolean }>();
  const side = jobs.map((job, index) => ({ job, index })).filter((j) => !j.job.instrument);
  for (const s of [-1, 1]) {
    const mine = side.filter((j) => (j.job.box.min.x + j.job.box.max.x) / 2 >= 0 === s > 0);
    // Sütunlar: o yandaki bütün parçaların (kablosu direğe gitmeyen Arduino da) kutularının yüzleri.
    const refZ = Math.min(...jobs.map((j) => j.entry.z));
    const boxes = [...mine.map((j) => j.job.box), ...(ctx.bodies ?? []).filter((b) => (b.min.x + b.max.x) / 2 >= 0 === s > 0 && Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) > ctx.plateHalf && b.max.z > refZ)];
    const faces = [...new Set(boxes.map((b) => `${Math.min(Math.abs(b.min.x), Math.abs(b.max.x)).toFixed(1)}:${Math.max(Math.abs(b.min.x), Math.abs(b.max.x)).toFixed(1)}`))]
      .map((k) => k.split(':').map(Number) as [number, number])
      .sort((p, q) => p[0] - q[0]);
    faces.forEach(([near, far], column) => {
      const inColumn = mine.filter((j) => Math.abs(Math.min(Math.abs(j.job.box.min.x), Math.abs(j.job.box.max.x)) - near) < 0.06);
      const isInner = (j: (typeof mine)[number]) => Math.abs(Math.abs(j.job.from.x) - near) <= Math.abs(Math.abs(j.job.from.x) - far);
      for (const inner of [true, false]) {
        const group = inColumn.filter((j) => isInner(j) === inner).sort((p, q) => q.job.from.z - p.job.from.z || Math.abs(p.job.from.x) - Math.abs(q.job.from.x));
        if (group.length === 0) continue;
        // Uçlar birbirine yakınsa (rölenin kontakları) ya da gövdenin kenarından içerideyse (transformatörün uçları)
        // çapraz dikleşir: koşut çaprazlar birbirine değmesin, kablo gövdenin yanından çabuk açılsın.
        const face = inner ? near : far;
        const steep =
          group.some((j) => Math.abs(Math.abs(j.job.from.x) - face) > 0.15) ||
          group.some((j, k) => k > 0 && Math.abs(group[k - 1]!.job.from.z - j.job.from.z) < 0.85 && Math.abs(Math.abs(group[k - 1]!.job.from.x) - Math.abs(j.job.from.x)) < 0.5);
        const first = steep ? 1.25 : 0.6;
        // Şeritler: yüzden uzaklaşarak. İçeride sınır plakanın kenarı (ya da öndeki sütunun yüzünden yarım birim açığı),
        // dışarıda sonraki sütunun yüzünden yarım birim açığı.
        const slots: number[] = [];
        if (inner) {
          const prev = column > 0 ? faces[column - 1]![1] : null;
          const limit = prev === null ? ctx.plateHalf + CABLE_RADIUS : prev + 0.5;
          for (let d = first; near - d >= limit - 1e-9; d += CABLE_PITCH) slots.push(s * (near - d));
          // Dar boşluk (Arduino ile yanındaki pilin arası): tek şerit, boşluğun ortasında.
          if (slots.length === 0) slots.push(s * (prev === null ? near - first : (prev + near) / 2));
        } else {
          const next = column + 1 < faces.length ? faces[column + 1]![0] : null;
          const limit = next === null ? Number.POSITIVE_INFINITY : next - 0.5;
          for (let d = first; far + d <= limit + 1e-9 && slots.length < 12; d += CABLE_PITCH) slots.push(s * (far + d));
          if (slots.length === 0) slots.push(s * (next === null ? far + first : (far + next) / 2));
        }
        // Öndeki uç yüzden en uzak şeridi alır (arkadaki uçların kabloları onun yolunu kesmeden katılır). Şerit
        // yetmezse (boşluğa sığmayan kablolar) öndeki uçların kabloları, sonradan katılan arkadakilerin üstüne yatar
        // (bir kablo çapı yukarıda).
        const cap = slots.length;
        group.forEach((j, k) => {
          const m = group.length - 1 - k;
          out.set(j.index, { x: slots[m % cap]!, y: CABLE_TABLE + Math.floor(m / cap) * CABLE_PITCH, steep });
        });
      }
    });
  }
  return out;
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

/**
 * Kablonun bütün gövdesi: yol fişin ucunda başlar (soketten çıkan fiş yolun dışındadır); yalnızca direkteki muz fişin
 * içine giren son parça sayılmaz. Denetimler bunu kullanır: soketten iniş ve şeride dönüş dahil.
 */
export const wholeCable = (points: readonly Vector3[]): Vector3[] => trimPath(points, 0, PLUG_ENTRY);

/**
 * Bütün direk kablolarının yolları (`jobs` sırasıyla). Şerit ataması: kablolar derinden (direklere yakın şeritten)
 * başlayarak yerleşir; aynı şeritte x aralıkları üst üste binmez. Kısıtlar:
 *   - aynı yandaki tahta dışı kablolar iç içe döner (plakaya yakın yan şerit, direklere yakın koridor şeridi);
 *   - yan şeridin üstünden geçen cihaz kablosu o tahta dışı kablodan geride (cihazlara yakın) kalır;
 *   - şeride katılma sırası: bir cihaz kablosunun inişinin altında yatan kablo ondan önde kalır (`joins`).
 * Yollar kurulurken her cihaz kablosu, kurulmuş kablolara ve gövdelere değmeyen ilk çapraz inişi seçer (`build`).
 */
export function routeCables(jobs: readonly CableJob[], ctx: RouteContext): RouteResult {
  const routes: Array<CableRoute | null> = jobs.map(() => null);
  const slots = sideSlots(jobs, ctx);
  const items: LaneItem[] = [];
  const bridges: number[] = [];
  /** Tepeden görünümdeki cihaz kabloları (kartın soketinden direğe kemer). */
  const tops: number[] = [];
  jobs.forEach((job, index) => {
    if (!job.instrument) {
      const slot = slots.get(index)!;
      // Koridora dönerken, tahtayla arasındaki bir parçanın (Arduino) arka köşesinin açığından geçer: şeridi o
      // parçanın arka yüzünün yeterince gerisinde olmalı.
      const between = (ctx.bodies ?? []).filter((b) => b !== job.box && Math.abs((b.min.x + b.max.x) / 2) < Math.abs(slot.x) && (b.min.x + b.max.x) / 2 >= 0 === slot.x >= 0 && Math.max(Math.abs(b.min.x), Math.abs(b.max.x)) > ctx.plateHalf && b.max.z > job.entry.z);
      const minLane = Math.max(0, ...between.map((b) => Math.ceil((job.entry.z - R - BOOT - (b.min.z - 1.2)) / CABLE_PITCH)));
      items.push({ index, side: true, xa: slot.x, xp: job.entry.x, pre: sidePre(job, slot, slot.steep), yh: slot.y, exitZ: Number.NEGATIVE_INFINITY, sx: slot.x, exit: null, minLane, capLane: 99, limit: 99, layer: 0, lane: -1 });
      return;
    }
    if (ctx.top) {
      tops.push(index);
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
    items.push({ index, side: false, xa: xd, xp: job.entry.x, pre, yh: exit.y, exitZ: exit.z + exit.lead + (shifted ? 1.6 : 0), sx: exit.x, exit, minLane: 0, capLane: 99, limit: 99, layer: 0, lane: -1 });
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
    return Math.min(item.limit, Math.floor((z0(jobs[item.index]!) - (item.exitZ + d.top + 0.03 + d.lean)) / CABLE_PITCH + 1e-9));
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
    // Üstte yatan kablo, altındakinden hemen sonra (bir geri şeritte) döner.
    const mine = items.filter((i) => i.side && i.xa >= 0 === s > 0).sort((p, q) => Math.abs(p.xa) - Math.abs(q.xa) || p.yh - q.yh);
    for (let k = 1; k < mine.length; k++) deeper.get(mine[k]!)!.add(mine[k - 1]!);
  }
  // Şeride katılma sırası: bir cihaz kablosunun inişinin (soketinin önü ve çaprazı) altında masada yatan kablo ondan
  // önde (direklere yakın şeritte) olmalı. Böylece şeride sonradan katılan kablo, şeridin cihazlara bakan kenarına,
  // öbür kabloların yanına yerleşir; iniş hiçbir kablonun üstünden geçmez (aynı cihazın yan yana iki soketinden aynı
  // yöne giden kablolar iç içe döner: dıştaki önde).
  /** joins.get(a): a'nın inişinin altında masada yatan kablolar (a ile aynı şeritte olabilir: a onun üstüne yatar). */
  const joins = new Map<LaneItem, Set<LaneItem>>(items.map((i) => [i, new Set<LaneItem>()]));
  for (const a of items) {
    if (a.side) continue;
    const sa = Math.sign(a.xp - a.sx) || 1;
    const reach = Math.min(DROP_NOMINAL, Math.abs(a.xp - a.sx));
    const a0 = Math.min(a.sx - sa * JOIN_MARGIN, a.sx + sa * (reach + JOIN_MARGIN));
    const a1 = Math.max(a.sx - sa * JOIN_MARGIN, a.sx + sa * (reach + JOIN_MARGIN));
    for (const b of items) {
      if (b === a) continue;
      // b'nin masada yattığı aralık: inişinin bittiği yerden direğine (iniş boyu iki kabloda da aynı sayılır).
      const sb = Math.sign(b.xp - b.sx) || 1;
      const from = b.side ? b.xa : b.sx + sb * Math.min(DROP_NOMINAL, Math.abs(b.xp - b.sx));
      if (Math.max(from, b.xp) > a0 && Math.min(from, b.xp) < a1) joins.get(a)!.add(b);
    }
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
  const assign = (stack: boolean, hop: boolean, join: boolean): number => {
    const strict = (i: LaneItem) => (hop ? [...deeper.get(i)!] : [...deeper.get(i)!, ...behindSide.get(i)!]);
    const joined = (i: LaneItem) => (join ? [...joins.get(i)!] : []);
    const before = (i: LaneItem) => [...strict(i), ...joined(i)];
    const placed: LaneItem[] = [];
    let overflow = 0;
    const pending = new Set(items);
    for (const item of items) item.lane = -1;
    while (pending.size > 0) {
      let candidates = [...pending].filter((i) => before(i).every((d) => !pending.has(d)));
      if (candidates.length === 0) candidates = [...pending];
      const item = candidates.sort((p, q) => Math.min(maxLane(p), p.capLane) - Math.min(maxLane(q), q.capLane) || hi(q) - lo(q) - (hi(p) - lo(p)) || p.index - q.index)[0]!;
      pending.delete(item);
      // Önde olması gerekenler: yan kablolar kesin önde; inişinin altında yatan kablo önde ya da aynı şeritte (altında).
      const start = Math.max(
        item.minLane,
        ...strict(item).filter((d) => d.lane >= 0).map((d) => d.lane + 1),
        ...joined(item).filter((d) => d.lane >= 0).map((d) => (d.side ? d.lane + 1 : d.lane)),
      );
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
  // Sırayla: düz, üst üste yatan, atlamalı; önce şeride katılma sırasıyla, koridor o sırayla dolmuyorsa (çok kablolu,
  // çapraz bağlantılı devre) sırasız (her kablo yine öbürlerine değmeyen bir çapraz iniş arar). İlk taşmasız (ya da en
  // az taşan) yerleşim tutulur.
  let overflow = 0;
  let mode: RouteResult['mode'] = 'flat';
  let joined = true;
  const chooseLanes = () => {
  overflow = assign(false, false, true);
  let kept = items.map((i) => ({ lane: i.lane, layer: i.layer }));
  mode = 'flat';
  joined = true;
  for (const [stack, hop, join] of [[true, false, true], [false, false, false], [true, false, false], [true, true, false]] as const) {
    if (overflow === 0) break;
    const tried = assign(stack, hop, join);
    if (tried < overflow) {
      overflow = tried;
      kept = items.map((i) => ({ lane: i.lane, layer: i.layer }));
      mode = hop ? 'hops' : stack ? 'stacked' : 'flat';
      joined = join;
    }
  }
  items.forEach((i, k) => Object.assign(i, kept[k]));
  };
  /**
   * Kablonun yolu. `drop` verilmişse soketten çapraz iniş: kablo fişin ucundan sonra hem aşağıya hem şeridinin yönüne
   * döner, çapraz iner ve şeridine teğet yatar (üstten bakınca dik köşe yok, yumuşak bir kavis). `drop` yoksa eski
   * dikey iniş (yedek; tahta dışı kablolar ve atlamalı yerleşim hep böyle). Çapraz iniş kurulamıyorsa null.
   */
  const build = (item: LaneItem, drop: { d: number; r: number; ahead: number } | null): RoundedPath | null => {
    const job = jobs[item.index]!;
    const z = laneZ(item);
    const y = layerY(item.layer);
    // Atlama: bu şeridin gerisine dönen yan kabloların masadaki kısmı bu kablonun altından geçer; kablo oralarda bir
    // kablo çapı yükselir. Rampaya yer yoksa (iniş ya da çıkış yakın) kablo o uçta yüksekte başlar ya da biter.
    const sgn = Math.sign(item.xp - item.xa) || 1;
    const under = item.side ? [] : items.filter((q) => q.side && q.lane > item.lane && crosses(item, q)).map((q) => q.xa).sort((p, q) => (p - q) * sgn);
    if (drop) {
      const exit = item.exit;
      if (!exit || (Math.sign(item.xp - exit.x) || 1) !== sgn) return null;
      const land = new Vector3(exit.x + sgn * drop.d, y, z);
      // İniş şeridin kendi aralığında biter (yana kaydırılmış inişte de).
      if ((land.x - item.xa) * sgn < 0) return null;
      // Atlama: masada yattığı kısmın altından geçen yan kablolar (inişin üstünden geçtikleri havada kalır; uzaklığı
      // aday denetimi ölçer). Kablo oralarda bir kablo çapı yükselir; rampaya yer yoksa bu iniş olmaz.
      const high = y + CABLE_PITCH;
      // Yan kablonun bu şeridi kestiği aralık (kurulmuş yolundan; köşesi yay olduğu için köşe noktasından sapar).
      const spans = items
        .filter((q) => q.side && q.lane > item.lane && crosses(item, q) && routes[q.index])
        .map((q) => {
          const xs = routes[q.index]!.points.filter((p) => Math.abs(p.z - z) < CABLE_PITCH && p.y < high + CABLE_PITCH).map((p) => p.x);
          return xs.length > 0 ? ([Math.min(...xs), Math.max(...xs)] as const) : ([q.xa, q.xa] as const);
        })
        .map(([a, b]) => (sgn > 0 ? ([a, b] as const) : ([b, a] as const)))
        .filter(([a, b]) => (a - land.x) * sgn > 0.6 && (item.xp - b) * sgn > -0.6)
        .sort((p, q) => (p[0] - q[0]) * sgn);
      const hopPts: Vector3[] = [];
      let endY = y;
      for (let k = 0; k < spans.length; ) {
        let m = k;
        while (m + 1 < spans.length && (spans[m + 1]![0] - spans[m]![1]) * sgn < 2 * RAMP + 1.5) m++;
        const u1 = spans[k]![0] - sgn * 0.6;
        const u2 = spans[m]![1] + sgn * 0.6;
        if ((u1 - sgn * RAMP - land.x) * sgn < R + 0.4) return null;
        hopPts.push(new Vector3(u1 - sgn * RAMP, y, z), new Vector3(u1, high, z), new Vector3(u2, high, z));
        if ((item.xp - (u2 + sgn * RAMP)) * sgn < R + 0.4) endY = high;
        else hopPts.push(new Vector3(u2 + sgn * RAMP, y, z));
        k = m + 1;
      }
      if (endY > y && hopPts.length > 0 && Math.abs(hopPts[hopPts.length - 1]!.x - item.xp) < R + 0.4) hopPts.pop();
      const base = exit.pre[exit.pre.length - 1]!;
      // Bükülme, kablo cihazın ön yüzünün (düğmeler, ayaklar) önüne çıktıktan sonra başlar.
      const straight = Math.max(exit.pre.length > 1 ? exit.lead : 0, job.box.max.z + CABLE_R + 0.15 - base.z) + drop.ahead;
      let t = drop.r;
      let top = base;
      for (let k = 0; k < 4; k++) {
        top = base.clone().addScaledVector(Z, straight + t);
        const phi = Z.angleTo(land.clone().sub(top));
        if (phi > 1.75) return null;
        t = drop.r * Math.tan(phi / 2) + 0.02;
      }
      const up = slant(job.entry.y - endY);
      const way = [...exit.pre, top, land, ...hopPts, new Vector3(item.xp, endY, z), new Vector3(item.xp, job.entry.y, z + Math.min(up.lean, Math.max(0, job.entry.z - BOOT - up.top - z))), job.entry.clone()];
      const first = exit.pre.length;
      return roundPath(way, (corner) => (corner === first || corner === first + 1 ? drop.r : R));
    }
    const way = [...item.pre];
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
    if (item.side) {
      // Üstte yatan yan kablo köşesini yüksekte döner; şeridinde hafif bir eğimle masaya iner (yer yoksa yüksekte kalır).
      const lifted = item.yh > y + 0.01;
      way.push(new Vector3(item.xa, lifted ? item.yh : y, z));
      if (lifted) {
        const from = item.xa + sgn * (R + 0.3);
        if ((item.xp - (from + sgn * RAMP)) * sgn >= R + 0.4) way.push(new Vector3(from, item.yh, z), new Vector3(from + sgn * RAMP, y, z));
        else endY = item.yh;
      }
    } else way.push(new Vector3(item.xa, item.yh, z - slant(item.yh - startY).lean), new Vector3(item.xa, startY, z));
    way.push(...hops);
    // Şeritte iki dönüşe yer yoksa (yan şerit direğe yakın) kablo şeritte yatmaz: köşeden fişin hizasına eğimle çıkar.
    if (!(item.side && Math.abs(item.xa - item.xp) < 2 * R + 0.05)) way.push(new Vector3(item.xp, endY, z));
    // Çıkışın öne yatıklığı: gerektiği kadar, fişe kalan yeri geçmeden.
    const up = slant(job.entry.y - endY);
    way.push(new Vector3(item.xp, job.entry.y, z + Math.min(up.lean, Math.max(0, job.entry.z - BOOT - up.top - z))), job.entry.clone());
    return roundPath(way, R);
  };
  /** Kurulan yolların gövdeleri (fişe giren son parça dışında tamamı): sonraki kablolar bunlara değmeyen inişi seçer. */
  const built: Vector3[][] = [];
  const keep = (item: LaneItem, path: RoundedPath) => {
    routes[item.index] = { points: path.points, kind: item.side ? 'side' : 'lane', minRadius: path.minRadius, lane: item.lane };
    built.push(wholeCable(path.points));
  };
  /** İniş (masaya ya da altındaki kabloya değene kadar) bir yerde çekül doğrultusuna DROP_PLUMB'dan yakın mı. */
  const tooSteep = (points: readonly Vector3[], y: number): boolean => {
    for (let k = 1; k < points.length; k++) {
      if (points[k - 1]!.y < y + 2 * CABLE_PITCH + 0.05) break;
      const step = points[k]!.clone().sub(points[k - 1]!);
      const len = step.length();
      if (len > 1e-6 && Math.abs(step.y) / len > DROP_PLUMB) return true;
    }
    return false;
  };
  /** Yol, kendi cihazı dışındaki bir gövdenin içinden (ya da kablo yarıçapı kadar yakınından) geçiyor mu. */
  const hitsBody = (points: readonly Vector3[], own: Box3): boolean => {
    const pad = CABLE_R + 0.1;
    const boxes = (ctx.bodies ?? []).filter((box) => box !== own);
    if (boxes.length === 0) return false;
    const p = new Vector3();
    for (let i = 1; i < points.length; i++) {
      const n = Math.max(1, Math.ceil(points[i]!.distanceTo(points[i - 1]!) / 0.4));
      for (let k = 0; k <= n; k++) {
        p.copy(points[i - 1]!).lerp(points[i]!, k / n);
        for (const box of boxes) if (p.x > box.min.x - pad && p.x < box.max.x + pad && p.y < box.max.y + pad && p.z > box.min.z - pad && p.z < box.max.z + pad) return true;
      }
    }
    return false;
  };
  /** Kabloların yolları (şeritler atanmış); çapraz inişe yer bulamayan cihaz kabloları döner. */
  const buildAll = (): LaneItem[] => {
    built.length = 0;
    for (const item of items) routes[item.index] = null;
    const steep: LaneItem[] = [];
  for (const item of items) if (item.side) keep(item, build(item, null)!);
  // Henüz kurulmamış kabloların direğe çıkan kısmı (şeritten dikey yükselip fişe giren): öndeki şeritte yatan
  // kablonun çıkışı, arkadaki kablonun inişinin önünde kalabilir; iniş seçilirken o da engel sayılır.
  const riserOf = new Map<LaneItem, Vector3[]>();
  for (const item of items) {
    if (item.side) continue;
    const pts = build(item, null)!.points;
    const y = layerY(item.layer) + 0.02;
    let last = 0;
    pts.forEach((p, k) => {
      if (p.y <= y) last = k;
    });
    riserOf.set(item, wholeCable(pts.slice(last)));
  }
  // Cihaz kabloları geriden öne (cihazlara yakın şeritten başlayarak) kurulur: öndeki kablonun inişi, gerisinde yatan
  // kabloların üstünden geçer; onlara değmeyen ilk iniş seçilir. Önce geniş kavisli uzun çapraz, olmazsa kısası, o da
  // olmazsa dikey iniş.
  const pendingLane = new Set(items.filter((i) => !i.side));
  for (const item of items.filter((i) => !i.side).sort((p, q) => q.lane - p.lane || q.layer - p.layer || p.index - q.index)) {
    pendingLane.delete(item);
    const risers = [...pendingLane].map((q) => riserOf.get(q)!);
    const job = jobs[item.index]!;
    const exit = item.exit!;
    const run = laneZ(item) - Math.max(exit.z + exit.lead, job.box.max.z + CABLE_R + 0.15);
    const reach = Math.abs(item.xp - exit.x) - R - 0.6;
    const lengths = [...new Set([Math.min(8, Math.max(3.6, 1.1 * run)), Math.min(6, Math.max(3, 0.8 * run)), ...DROP_LENGTHS].map((d) => Math.min(d, reach)).filter((d) => d >= 0.3))];
    let chosen: RoundedPath | null = null;
    // Önce fişin hemen önünde dönen iniş; olmazsa kablo biraz daha düz gidip sonra döner (önündeki bir direğin
    // kablosunun üstünden aşar).
    search: for (const ahead of [0, 1.2, 2.4]) {
      if (ahead > 0 && ahead > run - 2.5) break;
      for (const d of lengths) {
        for (const r of DROP_RADII) {
          const path = build(item, { d, r, ahead });
          if (!path || path.minRadius < CABLE_BEND_MIN || tooSteep(path.points, layerY(item.layer)) || hitsBody(path.points, job.box)) continue;
          const body = wholeCable(path.points);
          if (built.every((o) => pathDistance(body, o, CLEAR) >= CLEAR) && risers.every((o) => pathDistance(body, o, CLEAR) >= CLEAR)) {
            chosen = path;
            break search;
          }
        }
      }
    }
    if (!chosen) steep.push(item);
    keep(item, chosen ?? build(item, null)!);
  }
    return steep;
  };
  // Çapraz inişe yer bulamayan kablo (şeridi cihazın önüne çok yakın) bir şerit öne alınıp şeritler yeniden atanır.
  chooseLanes();
  let steepItems = buildAll();
  for (let round = 0; round < 6 && steepItems.length > 0; round++) {
    const before = { lanes: items.map((i) => ({ lane: i.lane, layer: i.layer, limit: i.limit })), routes: [...routes], overflow, mode, joined, steep: steepItems };
    for (const item of steepItems) item.limit = Math.max(0, item.lane - 1);
    chooseLanes();
    const again = buildAll();
    if (overflow > before.overflow || again.length >= before.steep.length) {
      items.forEach((i, k) => Object.assign(i, before.lanes[k]));
      before.routes.forEach((r, k) => (routes[k] = r));
      overflow = before.overflow;
      mode = before.mode;
      joined = before.joined;
      steepItems = before.steep;
      break;
    }
    steepItems = again;
  }
  const steep = steepItems.length;
  // --- Tepeden görünüm: cihaz kabloları kartın soketinden direğe kemer ---
  // Kemer soketin üstünden öne yatık kalkar, düz gider, fişe yatık iner (köşeler yuvarlak). Her kemer, öncekilere ve
  // tahta dışı kablolara değmeyen en alçak yükseklikten geçer: tepeden bakınca kesişen kablolar farklı yükseklikte,
  // gövdeleri birbirine girmez (eskiden kavisler kesiştikleri yerde aynı yükseklikte buluşabiliyordu).
  if (tops.length > 0) {
    const ends = tops.map((index) => ({ a: jobs[index]!.from.clone().add(new Vector3(0, 1.4, 0)), b: jobs[index]!.entry.clone() }));
    routeArches(ends, built, 24, slantArch).forEach((arch, k) => {
      routes[tops[k]!] = { points: arch.points, kind: 'arc', minRadius: arch.minRadius, lane: -1 };
    });
  }
  // --- Doğrudan giden kablolar: öbür kablolara değmeyen ilk sarkma ---
  const SAGS = [1.2, 0.5, 2.0, 0, 2.8, -0.8, 3.6, -1.6, 4.4];
  for (const index of bridges) {
    const job = jobs[index]!;
    const others = routes.flatMap((r) => (r ? [wholeCable(r.points)] : []));
    let best: { route: CableRoute; score: number } | null = null;
    for (const sag of SAGS) {
      const route = bridge(job, sag);
      const body = wholeCable(route.points);
      const clear = Math.min(CLEAR * 2, ...others.map((o) => pathDistance(body, o, CLEAR)));
      const score = (route.minRadius >= CABLE_BEND_MIN ? 0 : -10) + Math.min(clear, CLEAR);
      if (!best || score > best.score + 1e-9) best = { route, score };
      if (route.minRadius >= CABLE_BEND_MIN && clear >= CLEAR) break;
    }
    routes[index] = best!.route;
  }
  return { routes: routes.map((r) => r!), overflow, mode, steep, joined };
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
 * Tepeden görünümde kartın soketinden direğe giden kemer: kalkış ve iniş dik değil, öne yatık (`TOP_SLANT`). Dik
 * olsaydı, komşu direğe (2 birim ötede) alçak açıyla gelen bir kablonun düz kısmı bu kablonun dik inişinin yarım birim
 * yakınından geçerdi ve hangi yükseklik seçilirse seçilsin ikisi birbirine girerdi; yatık inişte yüksekliği farklı
 * kablolar inişin farklı yerinden geçer.
 */
function slantArch(a: Vector3, b: Vector3, height: number): { points: Vector3[]; minRadius: number } {
  const path = roundPath([a.clone(), new Vector3(a.x, height, a.z + TOP_SLANT), new Vector3(b.x, height, b.z - TOP_SLANT), b.clone()], R);
  return { points: path.points, minRadius: path.minRadius };
}

/**
 * Atlama kablolarının yolları: her kablo, öncekilere ve `others`'a (direk kabloları) değmeyen en alçak yükseklikten
 * geçer (kesişen kablo ötekinin üstünden, bir kablo çapı yukarıdan). `shape`: kemerin biçimi.
 */
export function routeArches(ends: ReadonlyArray<{ a: Vector3; b: Vector3 }>, others: ReadonlyArray<readonly Vector3[]>, levels = 10, shape: typeof archPath = archPath): Array<{ points: Vector3[]; minRadius: number }> {
  const span = (e: { a: Vector3; b: Vector3 }) => Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z);
  const done: Vector3[][] = others.map((o) => wholeCable(o));
  // Kısa kablo alçaktan, uzun kablo yüksekten geçer: bir kablonun dik kalkışı ya da inişi, üstünden geçen daha uzun
  // kablonun düz kısmının altında kalır.
  const order = ends.map((_, i) => i).sort((p, q) => span(ends[p]!) - span(ends[q]!) || p - q);
  const out = new Array<{ points: Vector3[]; minRadius: number }>(ends.length);
  for (const i of order) {
    const { a, b } = ends[i]!;
    const base = Math.max(a.y, b.y) + R + 0.05;
    let best: { points: Vector3[]; minRadius: number } | null = null;
    let bestClear = -1;
    for (let k = 0; k < levels; k++) {
      const path = shape(a, b, base + k * CABLE_PITCH);
      const body = wholeCable(path.points);
      const clear = Math.min(CLEAR, ...done.map((o) => pathDistance(body, o, CLEAR)));
      if (clear > bestClear + 1e-9) {
        best = path;
        bestClear = clear;
      }
      if (clear >= CLEAR) break;
    }
    done.push(wholeCable(best!.points));
    out[i] = best!;
  }
  return out;
}

/**
 * Tepeden görünümde ön paneli soketli cihazların uçları: gerçek boyutlu cihazlar tahtadan çok geniş bir sıra kurar,
 * kartlar tahtayı küçültürdü. Kartlar (soketlerin çevresi) tahtanın hemen arkasında yan yana dizilir; uçlar kartta
 * soldan sağa gerçek sırasıyla, kısa sabit aralıkla durur. `devices`: her cihazın gerçek uçları (masadaki sırayla).
 */
export function compactSockets(devices: ReadonlyArray<readonly Vector3[]>): Vector3[][] {
  const GAP = 4;
  const PITCH = 5;
  const PAD = 6;
  const widths = devices.map((real) => (real.length - 1) * PITCH + 2 * PAD);
  const total = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, devices.length - 1);
  let x = -total / 2;
  // Kartlar direk sırasının ve adlarının gerisinde (plakanın arka kenarının 5 birim ötesi).
  const z = -BB.depth / 2 - PLATE.back - 5;
  return devices.map((real, d) => {
    const order = real.map((a, i) => ({ a, i })).sort((u, v) => u.a.x - v.a.x);
    const compact: Vector3[] = new Array<Vector3>(real.length);
    order.forEach(({ a, i }, k) => (compact[i] = new Vector3(x + PAD + k * PITCH, a.y, z)));
    x += widths[d]! + GAP;
    return compact;
  });
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
