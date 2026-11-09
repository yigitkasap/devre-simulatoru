// Föy kartlarındaki cihaz yönergeleri bugünkü arayüze göre: cihaz rafı arayüz v3'te kalktı; cihazların
// ayarları defterdeki kartlarında (masaüstünde sağdaki Defter, telefonda şemanın altı). Osiloskobun Oto
// düğmesi kartın görünen kısmında.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { LAB_FIGURE_TEXTS } from '../src/i18n/foy';

const DEVICE_TYPES = new Set(['funcgen', 'dcsupply', 'oscilloscope']);
const entries = Object.entries(LAB_FIGURE_TEXTS) as Array<[ExampleId, NonNullable<(typeof LAB_FIGURE_TEXTS)[ExampleId]>]>;

describe('föy kartlarında cihaz yönergeleri', () => {
  it('hiçbir föy metninde "cihaz rafı" geçmiyor', () => {
    for (const [id, figure] of entries) expect(JSON.stringify(figure), id).not.toMatch(/cihaz raf/i);
  });

  it('"defterdeki X kartında", "X’in kartını" ve "X kartındaki" yönergelerindeki X örnekte var ve bir laboratuvar cihazı', () => {
    let count = 0;
    for (const [id, figure] of entries) {
      const text = JSON.stringify(figure);
      const labels = [...text.matchAll(/(?:[Dd]efterdeki ([A-Z]+\d+) kartında|defterde ([A-Z]+\d+)’in kartını|([A-Z]+\d+) kartındaki Oto)/g)].map((m) => m[1] ?? m[2] ?? m[3]!);
      const doc = exampleDoc(id)!;
      for (const label of labels) {
        const part = doc.parts.find((p) => p.label === label);
        expect(part?.type, `${id}: ${label}`).toSatisfy((t: string | undefined) => t !== undefined && DEVICE_TYPES.has(t));
        count += 1;
      }
    }
    // 7 "Devre kurulu" metni + 5 adım metni; iki Oto yönergesi.
    expect(count).toBe(14);
  });

  it('"Oto’ya bas" diyen iki yer osiloskop kartındaki Oto düğmesini adıyla gösteriyor', () => {
    const otos = entries.flatMap(([id, figure]) => [...JSON.stringify(figure).matchAll(/.{0,20}Oto’ya bas/g)].map((m) => `${id}: ${m[0]}`));
    expect(otos).toHaveLength(2);
    for (const o of otos) expect(o).toMatch(/OSC1 kartındaki Oto’ya bas/);
  });
});
