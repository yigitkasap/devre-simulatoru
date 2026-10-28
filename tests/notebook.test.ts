// Defter (tasarım v3): kartların sırası ve gruplaması.

import { describe, expect, it } from 'vitest';
import { GROUP_MIN, notebookEntries } from '../src/editor/notebookOrder';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import type { Part } from '../src/model/types';

const part = (id: string, type: Part['type'], label: string): Part => ({ id, type, label, x: 0, y: 0, rotation: 0, props: {} }) as Part;

describe('Defter sırası', () => {
  it('önce cihazlar ve Arduino, sonra etiket sırası (R2, R10’dan önce)', () => {
    const entries = notebookEntries([
      part('a', 'resistor', 'R10'),
      part('b', 'arduino', 'ARD1'),
      part('c', 'resistor', 'R2'),
      part('d', 'led', 'LED1'),
      part('e', 'oscilloscope', 'OSC1'),
      part('f', 'battery', 'B1'),
    ]);
    expect(entries.map((e) => (e.kind === 'part' ? e.part.label : e.type))).toEqual(['OSC1', 'ARD1', 'B1', 'LED1', 'R2', 'R10']);
  });

  it('aynı türden 3 ya da daha fazla parça tek satırda, ilk üyesinin yerinde', () => {
    const entries = notebookEntries([
      part('1', 'diode', 'D4'),
      part('2', 'diode', 'D1'),
      part('3', 'resistor', 'RL'),
      part('4', 'diode', 'D3'),
      part('5', 'diode', 'D2'),
      part('6', 'funcgen', 'FG1'),
      part('7', 'resistor', 'R1'),
    ]);
    expect(entries.map((e) => (e.kind === 'part' ? e.part.label : `${e.type}:${e.parts.map((p) => p.label).join(',')}`))).toEqual([
      'FG1',
      'diode:D1,D2,D3,D4',
      'R1',
      'RL',
    ]);
    expect(GROUP_MIN).toBe(3);
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: her parça defterde bir kez`, () => {
      const doc = exampleDoc(id)!;
      const shown = notebookEntries(doc.parts).flatMap((e) => (e.kind === 'part' ? [e.part.id] : e.parts.map((p) => p.id)));
      expect(shown.sort()).toEqual(doc.parts.map((p) => p.id).sort());
    });
  }
});
