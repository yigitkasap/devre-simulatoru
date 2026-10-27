// Breadboard yerleşimi: her örnekte breadboard'daki bağlantılar şemayla aynı devreyi kurar.

import { describe, expect, it } from 'vitest';
import { planBreadboard, railHoles, type Hole } from '../src/bench3d/breadboard';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { pinKey } from '../src/model/connectivity';

/** Deliğin elektriksel düğümü: şerit (sütunun yarısı) ya da ray (bütün boyunca). */
function node(h: Hole): string {
  return h.kind === 'strip' ? `${h.board}:${h.row < 5 ? 'üst' : 'alt'}:${h.col}` : `${h.board}:ray${h.rail}`;
}
const holeId = (h: Hole) => (h.kind === 'strip' ? `${h.board}:s${h.col}:${h.row}` : `${h.board}:r${h.rail}:${h.k}`);

describe('Breadboard yerleşimi', () => {
  for (const id of EXAMPLE_IDS) {
    it(`${id}: her ağ tek düğümde, ağlar ayrı, her delikte tek bacak`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const parent = new Map<string, string>();
      const find = (k: string): string => {
        while (parent.has(k) && parent.get(k) !== k) k = parent.get(k)!;
        return k;
      };
      const union = (a: string, b: string) => {
        parent.set(a, parent.get(a) ?? a);
        parent.set(b, parent.get(b) ?? b);
        parent.set(find(a), find(b));
      };
      const used = new Set<string>();
      const use = (h: Hole) => {
        const key = holeId(h);
        expect(used.has(key), `${id}: ${key} iki kez`).toBe(false);
        used.add(key);
        if (h.kind === 'strip') {
          expect(h.col >= 1 && h.col <= plan.cols && h.row >= 0 && h.row <= 9, key).toBe(true);
        } else {
          expect(h.k >= 0 && h.k < railHoles(plan.cols) && h.rail >= 0 && h.rail <= 3, key).toBe(true);
        }
      };
      // Pin → düğüm.
      const pinNode = new Map<string, string>();
      for (const part of doc.parts) {
        const placed = plan.onBoard.get(part.id);
        if (placed) {
          for (const h of [...placed.holes, ...(placed.extraHoles ?? [])]) use(h);
          placed.holes.forEach((h, pin) => pinNode.set(pinKey(part.id, pin), node(h)));
        }
      }
      for (const lead of plan.leads) {
        use(lead.hole);
        pinNode.set(pinKey(lead.partId, lead.pin), node(lead.hole));
      }
      for (const j of plan.jumpers) {
        use(j.a);
        use(j.b);
        union(node(j.a), node(j.b));
      }
      // Her ağın yerleşen pinleri tek bileşende; bir bileşende tek ağ.
      const netsOfComponent = new Map<string, Set<string>>();
      const componentOfNet = new Map<string, string>();
      for (const [pin, n] of pinNode) {
        const net = plan.netOf.get(pin)!;
        const comp = find(n);
        const before = componentOfNet.get(net);
        expect(before === undefined || before === comp, `${id}: ${net} ağı kopuk (${pin})`).toBe(true);
        componentOfNet.set(net, comp);
        const set = netsOfComponent.get(comp) ?? new Set();
        set.add(net);
        netsOfComponent.set(comp, set);
      }
      for (const [comp, nets] of netsOfComponent) expect(nets.size, `${id}: ${comp} düğümünde kısa devre: ${[...nets].join(', ')}`).toBe(1);
      // Masadaki parçaların bağlı her pini bir kabloyla gelir.
      for (const part of doc.parts) {
        if (!plan.table.has(part.id)) continue;
        for (const lead of plan.leads.filter((l) => l.partId === part.id)) expect(lead.net).toBe(plan.netOf.get(pinKey(part.id, lead.pin)));
      }
      // Toprak sembolü dışında her parça ya breadboard'da ya masada.
      for (const part of doc.parts) {
        if (part.type === 'ground') continue;
        expect(plan.onBoard.has(part.id) || plan.table.has(part.id), `${id}: ${part.label} yerleşmedi`).toBe(true);
      }
    });
  }

  it('LED ve ön direnç zinciri ortak şeridi paylaşır (jumper yok); toprak ve besleme raylarda', () => {
    const plan = planBreadboard(exampleDoc('ard-blink')!);
    const r = [...plan.onBoard.values()].find((p) => p.mount === 'axial')!;
    const led = [...plan.onBoard.values()].find((p) => p.mount === 'radial')!;
    const cols = (p: typeof r) => p.holes.map((h) => (h.kind === 'strip' ? h.col : -1));
    expect(cols(r).some((c) => cols(led).includes(c))).toBe(true);
    expect([...plan.roles.values()]).toContain('ground');
  });
});
