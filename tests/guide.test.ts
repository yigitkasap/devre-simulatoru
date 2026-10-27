// Lehim rehberi: her örnekte breadboard yerleşiminin bütün parçaları, jumper'ları ve telleri adım olarak.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { buildSolderGuide, holeName, resistorColorCode } from '../src/bench3d/guide';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

describe('Lehim rehberi', () => {
  it('direnç renk kodu', () => {
    expect(resistorColorCode(220)).toBe('kırmızı–kırmızı–kahverengi–altın');
    expect(resistorColorCode(10e3)).toBe('kahverengi–siyah–turuncu–altın');
    expect(resistorColorCode(4.7e3)).toBe('sarı–mor–kırmızı–altın');
    expect(resistorColorCode(2.2e6)).toBe('kırmızı–kırmızı–yeşil–altın');
    expect(resistorColorCode(1)).toBe('kahverengi–siyah–altın–altın');
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: her parça, jumper ve tel bir adım; delik adları geçerli`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const guide = buildSolderGuide(doc, plan);
      expect(guide.steps.length).toBe(plan.jumpers.length + plan.onBoard.size + plan.leads.length);
      for (const [partId] of plan.onBoard) {
        const label = doc.parts.find((p) => p.id === partId)!.label;
        expect(guide.steps.some((s) => s.title.startsWith(`${label} `)), `${id}: ${label}`).toBe(true);
      }
      const holes = [...plan.onBoard.values()].flatMap((p) => p.holes).concat(plan.leads.map((l) => l.hole), plan.jumpers.flatMap((j) => [j.a, j.b]));
      for (const h of holes) expect(holeName(h, plan)).toMatch(/^(\d+\. kart, )?(\d{1,2}[a-j]|(üst|alt) [+−] rayı \(\d{1,2}\. sütun hizası\))$/);
      // Adımlar alçaktan yükseğe: jumper'lar başta, dışarı giden teller sonda.
      const groups = guide.steps.map((s) => s.group);
      expect(groups.indexOf('lead') === -1 || groups.lastIndexOf('jumper') < groups.indexOf('lead')).toBe(true);
      // Şebekeli devrede uyarı.
      if (doc.parts.some((p) => p.type === 'transformer')) expect(guide.warnings.some((w) => w.includes('230 V'))).toBe(true);
    });
  }

  it('Blink: LED\'in anot ve katot delikleri, direnç renk kodu, Arduino telleri', () => {
    const doc = exampleDoc('ard-blink')!;
    const guide = buildSolderGuide(doc, planBreadboard(doc));
    const led = guide.steps.find((s) => s.title.startsWith('LED1'))!;
    expect(led.note).toMatch(/Uzun bacak \(anot, \+\) \d+[a-j]/);
    expect(guide.materials.find((m) => m.name.startsWith('Direnç 220'))!.detail).toContain('kırmızı–kırmızı–kahverengi–altın');
    expect(guide.steps.filter((s) => s.group === 'lead').map((s) => s.title)).toEqual(expect.arrayContaining(['ARD1 D13']));
  });
});
