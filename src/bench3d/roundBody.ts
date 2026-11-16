// Yuvarlak gövdeler (LED, elektrolitik kondansatör, TO-18, NTC boncuğu, buzzer): çap ve değmeme (three yok, saf
// geometri). "Yuvarlak gövde" (2026-11-16): bu gövdeler eskiden ayak izi kuralına sığsın diye x'te ≈ 0,9, z'de ≈ 0,4
// ölçekle eziliyordu (daire 2:1 oval görünüyordu). Artık x ve z ölçeği aynı; çap yerleşime göre seçilir:
//   - olağan çap `max` (LED ve elektrolitik: 1,5 delik); bu, derinlikte yarım delik kuralını aşar;
//   - kural "gövdeler birbirine ve başka parçaların bacaklarına değmesin": yuvarlak gövde komşu bir gövdeye, bacağa
//     ya da Arduino kablosunun fişine değecekse değmeyecek kadar küçülür, en çok `min`'e kadar (≈ 1 delik);
//   - iki yuvarlak gövde birbirine değecekse ikisi de küçülür;
//   - `min` çapta da değiyorsa çakışma bildirilir (tahta planına dokunulmaz).

import type { Part } from '../model/types';
import { transistorPackage } from './dimensions';

/** Değmeyen iki gövde arasında bırakılan en küçük aralık (birim). */
export const ROUND_GAP = 0.04;

export interface RoundSpec {
  /** Olağan (en büyük) ve en küçük çap (delik aralığı). */
  readonly max: number;
  readonly min: number;
}

/**
 * LED ve elektrolitik kondansatör: olağan çap 1,5 delik, en küçük 1 delik. Komşu satırdaki iki gövdenin merkezleri
 * tam 1 delik arayla durur: çap 1,0'da birbirine teğet kalırlardı; aralarında ROUND_GAP kalsın diye en küçük çap
 * 1 − ROUND_GAP.
 */
const SMALL: RoundSpec = { max: 1.5, min: 1 - ROUND_GAP };
/** NTC boncuğu: küçük bir damla (Ø 1 delik). */
const BEAD: RoundSpec = { max: 1, min: 0.8 };
/**
 * Buzzer: bacakları 3 delik arayla; gövde bacaklarının arasında duran bir disk (Ø 2,2), bacaklar altından çıkıp
 * deliklere açılır. Daha büyük disk (gerçek buzzer Ø 4,7 delik) komşu satırlardaki delikleri örterdi: Tahtada kur'da
 * o deliklere tel takılır, görünür kalmalılar (en yakın yabancı delik merkezden 1,12 birim).
 */
const BUZZER: RoundSpec = { max: 2.2, min: 1.6 };

/** Parçanın tahtadaki gövdesi yuvarlaksa çap sınırları; değilse null. */
export function roundSpec(part: Pick<Part, 'type' | 'props'>): RoundSpec | null {
  switch (part.type) {
    case 'led':
      return SMALL;
    case 'capacitor':
      return part.props.kind === undefined || part.props.kind === 'electrolytic' ? SMALL : null;
    case 'npn':
    case 'pnp':
    case 'njfet':
    case 'pjfet':
    case 'nmos':
    case 'pmos':
      return transistorPackage(typeof part.props.model === 'string' ? part.props.model : '') === 'to18' ? SMALL : null;
    case 'ntc':
      return BEAD;
    case 'buzzer':
      return BUZZER;
    default:
      return null;
  }
}

export interface RoundItem {
  readonly id: string;
  /** Gövdenin merkezi (dünya, tahta düzlemi). */
  readonly x: number;
  readonly z: number;
  readonly spec: RoundSpec;
}

/** Yuvarlak gövdenin değmemesi gereken sabit nesne: başka bir parçanın gövde kutusu, bacağı ya da bir fiş. */
export type RoundObstacle =
  | { readonly kind: 'box'; readonly owner: string; readonly name: string; readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number }
  | { readonly kind: 'circle'; readonly owner: string; readonly name: string; readonly x: number; readonly z: number; readonly r: number };

export interface RoundConflict {
  readonly id: string;
  /** Değdiği nesne: başka bir parçanın kimliği ya da nesnenin adı. */
  readonly other: string;
  /** En küçük çapta kalan iç içe geçme (birim; aralık payı dahil). */
  readonly overlap: number;
}

/** Noktanın nesneye uzaklığı (nesnenin içindeyse 0). */
function distanceTo(x: number, z: number, o: RoundObstacle): number {
  if (o.kind === 'circle') return Math.max(0, Math.hypot(x - o.x, z - o.z) - o.r);
  return Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1));
}

/**
 * Yuvarlak gövdelerin çapları (kimlik → çap). Her gövde olağan çapından başlar; sabit nesnelere (`obstacles`) ve
 * öbür yuvarlak gövdelere ROUND_GAP'ten yakın olmayacak kadar küçülür. İki yuvarlak gövde birbirine yakınsa ikisi
 * eşit küçülür (biri zaten küçükse öbürü kalan yeri alır). En küçük çapta da değen çiftler `conflicts`'te.
 */
export function sizeRoundBodies(items: readonly RoundItem[], obstacles: readonly RoundObstacle[]): { sizes: Map<string, number>; conflicts: RoundConflict[] } {
  const radius = new Map(items.map((i) => [i.id, i.spec.max / 2] as const));
  const conflicts: RoundConflict[] = [];
  const floor = (i: RoundItem) => i.spec.min / 2;
  // Sabit nesneler.
  for (const item of items) {
    for (const o of obstacles) {
      if (o.owner === item.id) continue;
      const room = distanceTo(item.x, item.z, o) - ROUND_GAP;
      if (room >= radius.get(item.id)!) continue;
      radius.set(item.id, Math.max(floor(item), room));
      if (room < floor(item) - 1e-9) conflicts.push({ id: item.id, other: o.name, overlap: floor(item) - room });
    }
  }
  // Yuvarlak gövdeler birbirine: yakın çiftten başlayarak, birkaç tur (bir çiftin küçülmesi öbürüne yer açmaz).
  const pairs: Array<[RoundItem, RoundItem, number]> = [];
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      const d = Math.hypot(items[a]!.x - items[b]!.x, items[a]!.z - items[b]!.z);
      if (d < (items[a]!.spec.max + items[b]!.spec.max) / 2 + ROUND_GAP) pairs.push([items[a]!, items[b]!, d]);
    }
  }
  pairs.sort((p, q) => p[2] - q[2]);
  for (let round = 0; round < 3; round++) {
    for (const [a, b, d] of pairs) {
      const room = d - ROUND_GAP;
      const ra = radius.get(a.id)!;
      const rb = radius.get(b.id)!;
      if (ra + rb <= room + 1e-9) continue;
      const half = room / 2;
      let na = ra;
      let nb = rb;
      if (ra <= half) nb = room - ra;
      else if (rb <= half) na = room - rb;
      else na = nb = half;
      radius.set(a.id, Math.max(floor(a), na));
      radius.set(b.id, Math.max(floor(b), nb));
    }
  }
  for (const [a, b, d] of pairs) {
    const over = radius.get(a.id)! + radius.get(b.id)! + ROUND_GAP - d;
    if (over > 1e-9) conflicts.push({ id: a.id, other: b.id, overlap: over });
  }
  return { sizes: new Map([...radius].map(([id, r]) => [id, 2 * r] as const)), conflicts };
}
