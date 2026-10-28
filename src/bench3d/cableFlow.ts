// 3B tezgâhta kablolardan geçen akım (akım noktaları için). Breadboard'da bir şeridin beş deliği ve
// bir rayın bütün delikleri tek bir iletkendir ("grup"). Parçaların bacakları ve masadaki parçaların
// kabloları gruplara akım sokar ya da çeker; jumper'lar grupları birbirine bağlar. Her ağdaki
// jumper'lar bir ağaç olarak çözülür: bir jumper'dan geçen akım, öbür ucundaki alt ağaca giren
// akımların toplamıdır (Kirchhoff akım kuralı). Döngü kuran jumper'lardan (planda olmaması gerekir)
// akım geçmediği varsayılır.

import type { BreadboardPlan, Hole } from './breadboard';

export interface CableCurrents {
  /** plan.leads sırasıyla: delikten parçanın ucuna akan akım (A). */
  readonly leads: Float64Array;
  /** plan.jumpers sırasıyla: a deliğinden b deliğine akan akım (A). */
  readonly jumpers: Float64Array;
}

/** Deliğin bağlı olduğu iletken: şeridin yarısı (a–e ya da f–j) ya da ray. */
export function holeGroup(h: Hole): string {
  return h.kind === 'strip' ? `s${h.board}:${h.col}:${h.row < 5 ? 0 : 1}` : `r${h.board}:${h.rail}`;
}

/** Uçlara giren akımlar (parça kimliği → pin sırasıyla; simülasyon karesinden). */
export type PinFlows = ReadonlyMap<string, readonly number[]>;

export function cableCurrents(plan: BreadboardPlan, pinFlows: PinFlows): CableCurrents {
  // Gruba dışarıdan giren akım: parçaya giren pin akımı gruptan çıkar.
  const inflow = new Map<string, number>();
  const add = (group: string, current: number) => inflow.set(group, (inflow.get(group) ?? 0) + current);
  for (const part of plan.onBoard.values()) {
    const pins = pinFlows.get(part.partId);
    part.holes.forEach((h, i) => add(holeGroup(h), -(pins?.[i] ?? 0)));
  }
  const leads = new Float64Array(plan.leads.length);
  plan.leads.forEach((lead, i) => {
    const current = pinFlows.get(lead.partId)?.[lead.pin] ?? 0;
    leads[i] = current;
    add(holeGroup(lead.hole), -current);
  });

  // Jumper çizgesi: her bileşende bir kökten ağaç; ağaç dışı (döngü kuran) jumper'lar 0.
  const edges = new Map<string, Array<{ index: number; other: string; forward: boolean }>>();
  plan.jumpers.forEach((j, index) => {
    const a = holeGroup(j.a);
    const b = holeGroup(j.b);
    if (a === b) return;
    (edges.get(a) ?? edges.set(a, []).get(a)!).push({ index, other: b, forward: true });
    (edges.get(b) ?? edges.set(b, []).get(b)!).push({ index, other: a, forward: false });
  });
  const jumpers = new Float64Array(plan.jumpers.length);
  const visited = new Set<string>();
  for (const root of edges.keys()) {
    if (visited.has(root)) continue;
    visited.add(root);
    // Önce sıra (kökten yapraklara), sonra yapraklardan köke alt ağaç toplamları.
    const order: string[] = [root];
    const parentEdge = new Map<string, { index: number; forward: boolean; parent: string }>();
    for (let k = 0; k < order.length; k++) {
      const node = order[k]!;
      for (const e of edges.get(node) ?? []) {
        if (visited.has(e.other)) continue;
        visited.add(e.other);
        parentEdge.set(e.other, { index: e.index, forward: e.forward, parent: node });
        order.push(e.other);
      }
    }
    const subtree = new Map<string, number>();
    for (let k = order.length - 1; k > 0; k--) {
      const node = order[k]!;
      const total = (subtree.get(node) ?? 0) + (inflow.get(node) ?? 0);
      const edge = parentEdge.get(node)!;
      // Alt ağaca dışarıdan giren akım ebeveyne jumper'dan akar: ebeveyn → çocuk yönünde −toplam.
      // forward: jumper a = ebeveyn, b = çocuk.
      jumpers[edge.index] = edge.forward ? -total : total;
      subtree.set(edge.parent, (subtree.get(edge.parent) ?? 0) + total);
    }
  }
  return { leads, jumpers };
}
