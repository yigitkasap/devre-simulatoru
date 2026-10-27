// PCB yolları: her örnekte bütün bağlantılar çizilir, tasarım kuralı denetimi temiz, her ağ tek
// bakır adası ve yollar ağ dışı bakıra değmez.

import { describe, expect, it } from 'vitest';
import { designPcb } from '../src/bench3d/kicad';
import { checkPcb, gap, routePcb, RULES } from '../src/bench3d/router';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

describe('PCB yolları', () => {
  it('bakır aralığı geometrisi', () => {
    const circle = { kind: 'circle', x: 0, y: 0, r: 1 } as const;
    expect(gap(circle, { kind: 'circle', x: 3, y: 0, r: 1 })).toBeCloseTo(1);
    expect(gap(circle, { kind: 'square', x: 3, y: 0, r: 1 })).toBeCloseTo(1);
    expect(gap({ kind: 'seg', x0: -5, y0: 2, x1: 5, y1: 2, r: 0.5 }, circle)).toBeCloseTo(0.5);
    // Kesişen yollar değer.
    expect(gap({ kind: 'seg', x0: -1, y0: -1, x1: 1, y1: 1, r: 0.1 }, { kind: 'seg', x0: -1, y0: 1, x1: 1, y1: -1, r: 0.1 })).toBeLessThan(0);
    // Kare pedi kesen yol.
    expect(gap({ kind: 'seg', x0: -5, y0: 0, x1: 5, y1: 0, r: 0.1 }, { kind: 'square', x: 0, y: 0, r: 0.8 })).toBeLessThan(0);
    expect(gap({ kind: 'square', x: 0, y: 0, r: 1 }, { kind: 'square', x: 3, y: 4, r: 1 })).toBeCloseTo(Math.hypot(1, 2));
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: bütün bağlantılar çizilir, kurallar temiz, her ağ tek ada`, () => {
      const doc = exampleDoc(id)!;
      const result = designPcb(doc);
      if (!result.ok) return; // şebekeli devre
      const t0 = performance.now();
      const routing = routePcb(result.design);
      const ms = performance.now() - t0;
      expect(routing.unrouted, `${id}: çizilemeyen bağlantılar`).toEqual([]);
      const drc = checkPcb(result.design, routing);
      expect(drc.violations, id).toEqual([]);
      for (const [net, islands] of drc.islands) expect(islands, `${id}: ${net}`).toBe(1);
      // Yolların genişliği kurallarda.
      for (const t of routing.tracks) expect([RULES.signal, RULES.power, RULES.powerNarrow]).toContain(t.width);
      expect(ms, `${id}: ${Math.round(ms)} ms`).toBeLessThan(4000);
    });
  }

  it('aynı kart aynı yolları verir', () => {
    const doc = exampleDoc('baraj-cubuk')!;
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    expect(routePcb(result.design)).toEqual(routePcb(result.design));
  });
});
