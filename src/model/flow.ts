// Kablolardaki akımın dağılımı (akım animasyonu için).
//
// Çözücü, birbirine bağlı kabloları tek bir düğümde birleştirir; bu yüzden tek tek kablo
// parçalarından geçen akımı bilmez. Bunu burada buluruz:
//   - Kablo parçaları bir çizge (graph) oluşturur: köşeler noktalar, kenarlar parçalardır.
//   - Her pin, bağlı olduğu noktaya bileşenden gelen akımı "enjekte" eder (Kirchhoff akım yasası).
//   - Toprak noktaları (toprak sembolleri ve topraklı cihazların COM uçları) birbirine binanın toprak
//     hattıyla bağlıdır. İki ya da daha fazla kablo adasında toprak noktası varsa bu adalar "toprak
//     hattı" kenarlarıyla (en kısa ağaç, düz kesikli çizgi) birleştirilir: toprak hattından geçen akım
//     da kablolardaki gibi bulunur ve canlandırılır.
//   - Toprak sembolleri, adalarında kalan dengesizliği karşılar (KCL gereği ≈ 0).
//   - Her adada bir kapsayan ağaç (spanning tree) kurulur; bir kenardan geçen akım, kenarın
//     altındaki alt ağacın toplam enjeksiyonuna eşittir. Kablolar kendi aralarında döngü
//     oluşturuyorsa döngüyü kapatan kenara akım verilmez (dağılım belirsizdir, görünüm için yeterli).

import { DEVICE_MODELS } from '../sim/devices';
import { CATALOG } from './catalog';
import { onSegmentInterior, partBounds, pinPositions, pointKey } from './geometry';
import type { CircuitDoc, Point } from './types';

export interface FlowSegment {
  /** Kararlı anahtar: kablo kimliği, parça sırası, alt parça sırası. */
  readonly key: string;
  readonly wireId: string;
  readonly a: Point;
  readonly b: Point;
  /** Toprak hattı (binanın toprağı): toprak noktalarını birleştiren, şemada kablo olmayan bağlantı. */
  readonly earth?: boolean;
}

interface PinAttachment {
  readonly partId: string;
  readonly pin: number;
  readonly vertex: number;
  readonly ground: boolean;
}

export interface FlowGraph {
  readonly segments: readonly FlowSegment[];
  /** Her parçanın çizgedeki uçları (köşe indeksleri). */
  readonly segmentEnds: ReadonlyArray<readonly [number, number]>;
  readonly vertexCount: number;
  readonly pins: readonly PinAttachment[];
  /** Ağaç sırası: her ada için kökten yapraklara köşe sırası. */
  readonly order: readonly number[];
  /** Ağaçta her köşenin ebeveynine giden parça (−1: kök) ve o parçanın yönü. */
  readonly parentSegment: Int32Array;
  readonly parentVertex: Int32Array;
  /** Her köşenin ada (bağlı bileşen) numarası. */
  readonly island: Int32Array;
  readonly islandCount: number;
}

/** Parçanın şebeke toprağına bağlı ucu (osiloskop ve fonksiyon üretecinin COM'u); yoksa null. */
function earthPin(part: CircuitDoc['parts'][number]): number | null {
  return DEVICE_MODELS[part.type].earthPin?.(part.props) ?? null;
}

/** Belgenin geometrisinden akım çizgesini kurar (belge değişmedikçe yeniden kullanılır). */
export function buildFlowGraph(doc: CircuitDoc): FlowGraph {
  const vertexIndex = new Map<string, number>();
  const vertex = (p: Point): number => {
    const key = pointKey(p);
    let index = vertexIndex.get(key);
    if (index === undefined) {
      index = vertexIndex.size;
      vertexIndex.set(key, index);
    }
    return index;
  };

  // Başka kabloların uçları bir parçanın ortasına denk geliyorsa parça orada bölünür (T bağlantısı).
  const ends = doc.wires.flatMap((w) =>
    [w.points[0], w.points[w.points.length - 1]].filter((p): p is Point => p !== undefined).map((p) => ({ p, wireId: w.id })),
  );

  const segments: FlowSegment[] = [];
  const segmentEnds: Array<readonly [number, number]> = [];
  for (const wire of doc.wires) {
    for (let i = 0; i + 1 < wire.points.length; i++) {
      const a = wire.points[i]!;
      const b = wire.points[i + 1]!;
      const cuts = ends
        .filter((e) => e.wireId !== wire.id && onSegmentInterior(e.p, a, b))
        .map((e) => e.p)
        .sort((p, q) => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) - (Math.abs(q.x - a.x) + Math.abs(q.y - a.y)));
      const stops = [a, ...cuts, b];
      for (let j = 0; j + 1 < stops.length; j++) {
        const from = stops[j]!;
        const to = stops[j + 1]!;
        if (from.x === to.x && from.y === to.y) continue;
        segments.push({ key: `${wire.id}:${i}:${j}`, wireId: wire.id, a: from, b: to });
        segmentEnds.push([vertex(from), vertex(to)]);
      }
    }
  }

  // Toprak noktaları: toprak sembolünün ucu (çizimde sembolün ortası) ve topraklı cihazların COM ucu.
  // Kabloya bağlı olmasalar da çizgede bir köşeleri olur (toprak hattının ucu).
  const earthPoints: Array<{ vertex: number; tip: Point }> = [];
  for (const part of doc.parts) {
    const com = earthPin(part);
    if (part.type !== 'ground' && com === null) continue;
    const pos = pinPositions(part)[part.type === 'ground' ? 0 : com!];
    if (!pos) continue;
    const box = partBounds(part);
    const tip = part.type === 'ground' ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : pos;
    earthPoints.push({ vertex: vertex(pos), tip });
  }

  // Pinler yalnızca bir kablo köşesine (ya da toprak noktasına) denk geliyorsa çizgeye bağlanır.
  const pins: PinAttachment[] = [];
  for (const part of doc.parts) {
    pinPositions(part).forEach((pos, pin) => {
      const index = vertexIndex.get(pointKey(pos));
      // Toprak sembolünün akımı bilinmez: adasının dengesini karşılar. Topraklı cihazın COM ucu
      // sıradan bir uçtur (cihazın akımı), yalnızca toprak hattının ucudur.
      const ground = part.type === 'ground';
      if (index !== undefined) pins.push({ partId: part.id, pin, vertex: index, ground });
    });
  }

  // Toprak hattı: toprak noktası olan her kablo adasından bir temsilci; temsilciler en kısa ağaçla
  // (Prim, düz çizgi uzunluğu) birleştirilir. Kablolar hep dik açılı olduğu için düz (eğik olabilen)
  // kesikli çizgi kabloyla karışmaz; en kısa ağaç en az çizgiyle bütün noktaları bağlar.
  const n0 = vertexIndex.size;
  const wireIsland = new Int32Array(n0).map((_, i) => i);
  const findIsland = (v: number): number => {
    while (wireIsland[v] !== v) {
      wireIsland[v] = wireIsland[wireIsland[v]!]!;
      v = wireIsland[v]!;
    }
    return v;
  };
  for (const [u, v] of segmentEnds) wireIsland[findIsland(u)] = findIsland(v);
  const representatives: Array<{ vertex: number; tip: Point }> = [];
  const seenIsland = new Set<number>();
  for (const point of earthPoints) {
    const island = findIsland(point.vertex);
    if (seenIsland.has(island)) continue;
    seenIsland.add(island);
    representatives.push(point);
  }
  if (representatives.length >= 2) {
    const inTree = [0];
    const rest = new Set(representatives.map((_, i) => i).slice(1));
    let k = 0;
    while (rest.size > 0) {
      let best: { from: number; to: number; d: number } | null = null;
      for (const i of inTree) {
        for (const j of rest) {
          const a = representatives[i]!.tip;
          const b = representatives[j]!.tip;
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!best || d < best.d) best = { from: i, to: j, d };
        }
      }
      const from = representatives[best!.from]!;
      const to = representatives[best!.to]!;
      segments.push({ key: `earth:${k++}`, wireId: '', a: from.tip, b: to.tip, earth: true });
      segmentEnds.push([from.vertex, to.vertex]);
      inTree.push(best!.to);
      rest.delete(best!.to);
    }
  }

  // Kapsayan orman (genişlik öncelikli arama)
  const n = vertexIndex.size;
  const adjacency: Array<Array<{ to: number; segment: number }>> = Array.from({ length: n }, () => []);
  segmentEnds.forEach(([u, v], s) => {
    adjacency[u]!.push({ to: v, segment: s });
    adjacency[v]!.push({ to: u, segment: s });
  });
  const parentSegment = new Int32Array(n).fill(-1);
  const parentVertex = new Int32Array(n).fill(-1);
  const island = new Int32Array(n).fill(-1);
  const order: number[] = [];
  let islandCount = 0;
  // Kök olarak tercihen toprak noktası seçilir (görsel olarak fark etmez, kararlılık için).
  const roots = [...pins.filter((p) => p.ground).map((p) => p.vertex), ...Array.from({ length: n }, (_, i) => i)];
  for (const root of roots) {
    if (island[root] !== -1) continue;
    island[root] = islandCount;
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const u = queue[head]!;
      order.push(u);
      for (const { to, segment } of adjacency[u]!) {
        if (island[to] !== -1) continue;
        island[to] = islandCount;
        parentSegment[to] = segment;
        parentVertex[to] = u;
        queue.push(to);
      }
    }
    islandCount++;
  }

  return { segments, segmentEnds, vertexCount: n, pins, order, parentSegment, parentVertex, island, islandCount };
}

/**
 * Her kablo parçasından geçen akımı hesaplar. Pozitif değer, akımın parçanın `a` ucundan
 * `b` ucuna aktığını gösterir (geleneksel akım yönü).
 * @param pinCurrent Bileşenin pinine dışarıdan GİREN akım; bilinmiyorsa null (ör. toprak).
 */
export function solveFlows(graph: FlowGraph, pinCurrent: (partId: string, pin: number) => number | null): Float64Array {
  const injection = new Float64Array(graph.vertexCount);
  const groundVertex = new Int32Array(graph.islandCount).fill(-1);
  for (const attachment of graph.pins) {
    if (attachment.ground) {
      const isl = graph.island[attachment.vertex]!;
      if (groundVertex[isl] === -1) groundVertex[isl] = attachment.vertex;
      continue;
    }
    const current = pinCurrent(attachment.partId, attachment.pin);
    // Pine giren akım, kablo ağından çıkan akımdır.
    if (current !== null && Number.isFinite(current)) injection[attachment.vertex]! -= current;
  }
  // Toprak, adasındaki dengesizliği karşılar.
  const islandSum = new Float64Array(graph.islandCount);
  for (let v = 0; v < graph.vertexCount; v++) islandSum[graph.island[v]!]! += injection[v]!;
  for (let isl = 0; isl < graph.islandCount; isl++) {
    const g = groundVertex[isl]!;
    if (g !== -1) injection[g]! -= islandSum[isl]!;
  }

  const flows = new Float64Array(graph.segments.length);
  const subtree = Float64Array.from(injection);
  for (let k = graph.order.length - 1; k >= 0; k--) {
    const v = graph.order[k]!;
    const segment = graph.parentSegment[v]!;
    if (segment < 0) continue;
    const parent = graph.parentVertex[v]!;
    // Alt ağaçtaki toplam enjeksiyon, v'den ebeveyne doğru akar.
    const [a] = graph.segmentEnds[segment]!;
    flows[segment] = a === v ? subtree[v]! : -subtree[v]!;
    subtree[parent]! += subtree[v]!;
  }
  return flows;
}

/** İki uçlu bileşenlerin pinleri (animasyon için pin 0 → pin 1 doğrultusu). */
export function partAxis(part: Parameters<typeof pinPositions>[0]): readonly [Point, Point] | null {
  if (CATALOG[part.type].pins.length !== 2) return null;
  const [a, b] = pinPositions(part);
  return a && b ? [a, b] : null;
}
