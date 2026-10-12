// Belge üzerindeki işlemler. Hepsi saf fonksiyondur: yeni bir belge döndürür, eskisini değiştirmez
// (geri alma geçmişi bu sayede basit bir dizi olarak tutulur).

import type { DeviceType, PropValue } from '../sim/netlist';
import { CATALOG } from './catalog';
import { nextRotation, onSegmentInterior, partBounds, pinPositions, pointKey, samePoint } from './geometry';
import type { CircuitDoc, Part, Point, Rotation, Wire } from './types';
import type { Box } from './catalog';
import { moveEndpoint, normalizePoints, rerouteEndpoint, translatePoints } from './wires';

function nextId(items: ReadonlyArray<{ id: string }>, prefix: string): string {
  let max = 0;
  for (const item of items) {
    if (item.id.startsWith(prefix)) {
      const n = Number(item.id.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

/** Tür için bir sonraki ad: R1, R2... (silinenlerin numarası yeniden kullanılmaz, en büyüğün bir fazlası). */
export function nextLabel(doc: CircuitDoc, type: DeviceType): string {
  const prefix = CATALOG[type].labelPrefix;
  let max = 0;
  for (const part of doc.parts) {
    if (!part.label.startsWith(prefix)) continue;
    const n = Number(part.label.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

export function addPart(doc: CircuitDoc, type: DeviceType, at: Point, rotation: Rotation): { doc: CircuitDoc; id: string } {
  const id = nextId(doc.parts, 'p');
  const part: Part = {
    id,
    type,
    label: nextLabel(doc, type),
    x: at.x,
    y: at.y,
    rotation,
    props: { ...CATALOG[type].defaultProps },
  };
  return { doc: { ...doc, parts: [...doc.parts, part] }, id };
}

export function addWire(doc: CircuitDoc, points: readonly Point[]): { doc: CircuitDoc; id: string | null } {
  const clean = normalizePoints(points);
  if (clean.length < 2) return { doc, id: null };
  const id = nextId(doc.wires, 'w');
  return { doc: { ...doc, wires: [...doc.wires, { id, points: clean }] }, id };
}

export function updatePart(
  doc: CircuitDoc,
  id: string,
  patch: { label?: string; props?: Readonly<Record<string, PropValue>> },
): CircuitDoc {
  return {
    ...doc,
    parts: doc.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
  };
}

export function removeItems(doc: CircuitDoc, partIds: Iterable<string>, wireIds: Iterable<string>): CircuitDoc {
  const parts = new Set(partIds);
  const wires = new Set(wireIds);
  if (parts.size === 0 && wires.size === 0) return doc;
  return {
    ...doc,
    parts: doc.parts.filter((p) => !parts.has(p.id)),
    wires: doc.wires.filter((w) => !wires.has(w.id)),
  };
}

/**
 * Kabloları, uçları `moves` tablosundaki noktalara (eski konum → yeni konum) bağlı olacak
 * şekilde günceller. `translated` içindeki kablolar bütünüyle (dx, dy) kadar kayar.
 */
function followMoves(
  wires: readonly Wire[],
  moves: Map<string, Point>,
  translated: ReadonlySet<string>,
  dx: number,
  dy: number,
): Wire[] {
  // Taşınan kabloların uçlarına bağlı kablolar da esnesin.
  for (const wire of wires) {
    if (!translated.has(wire.id)) continue;
    for (const p of wire.points) moves.set(pointKey(p), { x: p.x + dx, y: p.y + dy });
  }
  const result = wires.map((wire) => {
    if (translated.has(wire.id)) return { ...wire, points: translatePoints(wire.points, dx, dy) };
    const first = wire.points[0]!;
    const last = wire.points[wire.points.length - 1]!;
    const startTo = moves.get(pointKey(first));
    const endTo = moves.get(pointKey(last));
    if (!startTo && !endTo) return wire;
    let points: Point[] = [...wire.points];
    if (startTo) points = moveEndpoint(points, 'start', startTo);
    if (endTo) points = moveEndpoint(points, 'end', endTo);
    return { ...wire, points };
  });
  return followTJunctions(wires, result);
}

/** p, [a, b] parçası üzerinde mi (uçlar dahil)? */
function onSegment(p: Point, a: Point, b: Point): boolean {
  return samePoint(p, a) || samePoint(p, b) || onSegmentInterior(p, a, b);
}

function onWire(p: Point, points: readonly Point[]): boolean {
  for (let i = 0; i + 1 < points.length; i++) if (onSegment(p, points[i]!, points[i + 1]!)) return true;
  return false;
}

/**
 * Esneyen bir kablonun bir parçası kendine dik yönde kaydıysa, o parçaya T ile bağlı
 * kabloların uçları da aynı miktarda kayar; böylece bağlantı kopmaz.
 */
function followTJunctions(before: readonly Wire[], after: Wire[]): Wire[] {
  const beforeById = new Map(before.map((w) => [w.id, w]));
  const changed = after
    .map((wire) => ({ old: beforeById.get(wire.id)!, neu: wire }))
    .filter(({ old, neu }) => old !== undefined && old.points !== neu.points);
  if (changed.length === 0) return after;
  return after.map((wire) => {
    if (wire.points !== beforeById.get(wire.id)?.points) return wire; // bu kablo zaten taşındı/esnedi
    let points = wire.points;
    for (const which of ['start', 'end'] as const) {
      const end = which === 'start' ? points[0]! : points[points.length - 1]!;
      for (const { old, neu } of changed) {
        if (old.id === wire.id || onWire(end, neu.points)) continue;
        const target = followedPoint(end, old.points, neu.points);
        if (target) {
          points = moveEndpoint(points, which, target);
          break;
        }
      }
    }
    return points === wire.points ? wire : { ...wire, points };
  });
}

/** Eski kablonun ortasındaki p noktasının, yeni kabloda dik yönde karşılık geldiği nokta. */
function followedPoint(p: Point, oldPoints: readonly Point[], newPoints: readonly Point[]): Point | null {
  for (let i = 0; i + 1 < oldPoints.length; i++) {
    const a = oldPoints[i]!;
    const b = oldPoints[i + 1]!;
    if (!onSegmentInterior(p, a, b)) continue;
    const horizontal = a.y === b.y;
    for (let j = 0; j + 1 < newPoints.length; j++) {
      const c = newPoints[j]!;
      const d = newPoints[j + 1]!;
      if (horizontal && c.y === d.y && p.x >= Math.min(c.x, d.x) && p.x <= Math.max(c.x, d.x)) return { x: p.x, y: c.y };
      if (!horizontal && c.x === d.x && p.y >= Math.min(c.y, d.y) && p.y <= Math.max(c.y, d.y)) return { x: c.x, y: p.y };
    }
    return null;
  }
  return null;
}

/**
 * Seçili parçaları ve kabloları (dx, dy) kadar taşır. Parçalara bağlı kabloların uçları
 * parçayla birlikte gider (kablo esner); iki ucu da taşınan parçalara bağlı kablolar
 * bütünüyle kayar.
 */
export function moveSelection(
  doc: CircuitDoc,
  partIds: ReadonlySet<string>,
  wireIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): CircuitDoc {
  if (dx === 0 && dy === 0) return doc;
  const moves = new Map<string, Point>();
  for (const part of doc.parts) {
    if (!partIds.has(part.id)) continue;
    for (const pin of pinPositions(part)) moves.set(pointKey(pin), { x: pin.x + dx, y: pin.y + dy });
  }
  const translated = new Set(wireIds);
  for (const wire of doc.wires) {
    const first = wire.points[0]!;
    const last = wire.points[wire.points.length - 1]!;
    if (moves.has(pointKey(first)) && moves.has(pointKey(last))) translated.add(wire.id);
  }
  return {
    ...doc,
    parts: doc.parts.map((p) => (partIds.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
    wires: followMoves(doc.wires, moves, translated, dx, dy),
  };
}

/**
 * Parçaları kendi merkezleri etrafında 90° döndürür; bağlı kablolar pinleri izler. Kablonun ucu
 * yeni pin konumuna, parçanın gövdesinden geçmeyen bir yolla yeniden yönlendirilir.
 */
export function rotateParts(doc: CircuitDoc, partIds: ReadonlySet<string>): CircuitDoc {
  if (partIds.size === 0) return doc;
  const moves = new Map<string, { to: Point; avoid: Box; vicinity: Box }>();
  const parts = doc.parts.map((part) => {
    if (!partIds.has(part.id)) return part;
    const rotated = { ...part, rotation: nextRotation(part.rotation) };
    const before = pinPositions(part);
    const after = pinPositions(rotated);
    const avoid = partBounds(rotated);
    // Parçanın her dönüşte kapladığı kare (pinler + 2 ızgara pay): kablonun bu alandaki kuyruğu yeniden çizilir.
    const reach = Math.max(...CATALOG[part.type].pins.map((p) => Math.max(Math.abs(p.x), Math.abs(p.y)))) + 2;
    const vicinity = { x: part.x - reach, y: part.y - reach, w: 2 * reach, h: 2 * reach };
    before.forEach((p, i) => {
      if (!samePoint(p, after[i]!)) moves.set(pointKey(p), { to: after[i]!, avoid, vicinity });
    });
    return rotated;
  });
  if (moves.size === 0) return { ...doc, parts };
  const wires = doc.wires
    .map((wire) => {
      const startMove = moves.get(pointKey(wire.points[0]!));
      const endMove = moves.get(pointKey(wire.points[wire.points.length - 1]!));
      if (!startMove && !endMove) return wire;
      let points: Point[] = [...wire.points];
      if (startMove) points = rerouteEndpoint(points, 'start', startMove.to, startMove.avoid, startMove.vicinity);
      if (endMove) points = rerouteEndpoint(points, 'end', endMove.to, endMove.avoid, endMove.vicinity);
      return { ...wire, points };
    })
    .filter((wire) => wire.points.length >= 2);
  return { ...doc, parts, wires: followTJunctions(doc.wires, wires) };
}

/**
 * Yönlü parçaları (diyot, LED, pil, ölçü aletleri) ters çevirir: parça 180° döner, pinleri yer
 * değiştirir ve kablolar yerinde kalır. Böylece ör. diyotun anodu ile katodu devrede yer değiştirir.
 * Yönsüz parçalara dokunulmaz.
 */
export function flipParts(doc: CircuitDoc, partIds: ReadonlySet<string>): CircuitDoc {
  let changed = false;
  const parts = doc.parts.map((part) => {
    if (!partIds.has(part.id) || !CATALOG[part.type].polarized) return part;
    changed = true;
    return { ...part, rotation: nextRotation(nextRotation(part.rotation)) };
  });
  return changed ? { ...doc, parts } : doc;
}

export function replaceWirePoints(doc: CircuitDoc, wireId: string, points: readonly Point[]): CircuitDoc {
  return {
    ...doc,
    wires: doc.wires.map((w) => (w.id === wireId ? { ...w, points: normalizePoints(points) } : w)),
  };
}

/** Tek noktaya inmiş (uzunluğu sıfır) kabloları temizler. */
export function dropDegenerateWires(doc: CircuitDoc): CircuitDoc {
  const wires = doc.wires.filter((w) => w.points.length >= 2);
  return wires.length === doc.wires.length ? doc : { ...doc, wires };
}
