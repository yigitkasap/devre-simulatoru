// 3B tezgâhın kablo akımları (akım noktaları): her breadboard grubunda Kirchhoff akım kuralı tutar,
// masadaki parçaların kablolarındaki akım parçanın uç akımıdır.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { cableCurrents, holeGroup } from '../src/bench3d/cableFlow';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { CircuitSimulator } from '../src/sim';

function solve(id: ExampleId) {
  const doc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  expect(sim.advance(0).ok).toBe(true);
  const pinFlows = new Map(doc.parts.map((p) => [p.id, sim.pinCurrents(p.id) ?? []] as const));
  const plan = planBreadboard(doc);
  return { doc, plan, pinFlows, currents: cableCurrents(plan, pinFlows) };
}

describe('3B kablo akımları', () => {
  for (const id of ['led-on-direnc', 'gerilim-bolucu', 'baraj-cubuk'] as const) {
    it(`${id}: her grupta giren akımların toplamı 0`, () => {
      const { plan, pinFlows, currents } = solve(id);
      const net = new Map<string, number>();
      const add = (g: string, i: number) => net.set(g, (net.get(g) ?? 0) + i);
      for (const part of plan.onBoard.values()) part.holes.forEach((h, i) => add(holeGroup(h), -(pinFlows.get(part.partId)?.[i] ?? 0)));
      plan.leads.forEach((lead, i) => add(holeGroup(lead.hole), -currents.leads[i]!));
      plan.jumpers.forEach((j, i) => {
        add(holeGroup(j.a), -currents.jumpers[i]!);
        add(holeGroup(j.b), currents.jumpers[i]!);
      });
      const scale = Math.max(1e-9, ...[...pinFlows.values()].flat().map(Math.abs));
      for (const [group, sum] of net) expect(Math.abs(sum) / scale, group).toBeLessThan(1e-6);
    });
  }

  it('LED ve ön direnç: masadaki pilin kabloları devre akımını taşır, jumper\'lardan da aynı akım geçer', () => {
    const { doc, plan, pinFlows, currents } = solve('led-on-direnc');
    const led = doc.parts.find((p) => p.type === 'led')!;
    const i = Math.abs(pinFlows.get(led.id)![0]!);
    expect(i).toBeGreaterThan(1e-3);
    plan.leads.forEach((lead, k) => expect(currents.leads[k]).toBeCloseTo(pinFlows.get(lead.partId)![lead.pin]!, 12));
    const carrying = [...currents.jumpers].filter((c) => Math.abs(Math.abs(c) - i) < i * 1e-6).length;
    expect(carrying).toBeGreaterThan(0);
  });
});
