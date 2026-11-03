// Tahtada kur, 3. aşama: kurulumun 3B yerleşimi (tezgâh öğrencinin kurulumunu çizer).

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { holeLabel } from '../src/bench3d/holes';
import { exampleDoc } from '../src/examples';
import { buildFromPlan, emptyBuild } from '../src/model/build';
import { boardParts, requiredLeads } from '../src/editor/tahta/BoardMode';
import { planFromBuild, WIRE_HEX } from '../src/tahta/plan';

describe('Kurulumun 3B yerleşimi', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const schematic = planBreadboard(doc);

  it('planBreadboard yerleşimi kurulum olarak verilince aynı delikler, kablolar ve alet kabloları', () => {
    const plan = planFromBuild(doc, buildFromPlan(schematic), schematic);
    expect(plan.cols).toBe(schematic.cols);
    expect([...plan.onBoard.keys()].sort()).toEqual([...schematic.onBoard.keys()].sort());
    for (const [id, at] of schematic.onBoard) {
      expect(plan.onBoard.get(id)!.holes.map((h) => holeLabel(h, 30))).toEqual(at.holes.map((h) => holeLabel(h, 30)));
      expect(plan.onBoard.get(id)!.mount).toBe(at.mount);
    }
    expect(plan.jumpers.map((j) => [holeLabel(j.a, 30), holeLabel(j.b, 30)])).toEqual(schematic.jumpers.map((j) => [holeLabel(j.a, 30), holeLabel(j.b, 30)]));
    expect(plan.leads.map((l) => [l.partId, l.pin, holeLabel(l.hole, 30)])).toEqual(schematic.leads.map((l) => [l.partId, l.pin, holeLabel(l.hole, 30)]));
    // Masadaki yerler şemanın planından; kablo renkleri öğrencinin seçtiği.
    expect(plan.table).toBe(schematic.table);
    expect(plan.jumpers.every((j) => Object.values(WIRE_HEX).includes(j.color!))).toBe(true);
  });

  it('boş tahta: parça ve kablo yok, masadaki yerler var; panelde 4 parça ve 7 alet kablosu (T1)', () => {
    const plan = planFromBuild(doc, emptyBuild(30), schematic);
    expect(plan.onBoard.size).toBe(0);
    expect(plan.jumpers).toHaveLength(0);
    expect(plan.leads).toHaveLength(0);
    expect(plan.table.size).toBe(3);
    expect(boardParts(doc, schematic).map((p) => p.label)).toEqual(['R1', 'Q1', 'R2', 'LED1']);
    const leads = requiredLeads(schematic).map((l) => `${doc.parts.find((p) => p.id === l.part)!.label}#${l.pin}`);
    expect(leads).toHaveLength(7);
  });
});
