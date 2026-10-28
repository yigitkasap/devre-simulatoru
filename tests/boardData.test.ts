// Karta aktar penceresinin verisi: rehber adımlarının plandaki karşılığı, delik etiketleri, takma
// sırasının grupları; baskı devrede eklenen parçalar ve eksik bağlantılar.

import { describe, expect, it } from 'vitest';
import { addedParts, footprintTip, holeLabels, missingConnections, perfboardInfo, shortHole, stepGroups, stepRef, stepTargets, stepWarning } from '../src/bench3d/boardData';
import { planBreadboard } from '../src/bench3d/breadboard';
import { buildSolderGuide } from '../src/bench3d/guide';
import { designPcb } from '../src/bench3d/kicad';
import { routePcb } from '../src/bench3d/router';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';

const perf = (id: (typeof EXAMPLE_IDS)[number]) => {
  const doc = exampleDoc(id)!;
  const plan = planBreadboard(doc);
  const guide = buildSolderGuide(doc, plan);
  return { doc, plan, guide, targets: stepTargets(doc, plan, guide) };
};

describe('Karta aktar: delikli plaket', () => {
  it('bütün örneklerde rehberin her adımı plandaki bir jumper’a, parçaya ya da dış tele karşılık geliyor', () => {
    for (const id of EXAMPLE_IDS) {
      const { plan, guide, targets } = perf(id);
      expect(targets.length, id).toBe(guide.steps.length);
      targets.forEach((target, i) => {
        expect(target, `${id} · ${guide.steps[i]!.title}`).not.toBeNull();
        expect(holeLabels(target!, plan).length, `${id} · ${guide.steps[i]!.title}`).toBeGreaterThan(0);
      });
      const groups = stepGroups(targets, 0);
      expect(groups.reduce((n, g) => n + g.total, 0), id).toBe(guide.steps.length);
    }
  });

  it('555 astabil: gruplar sırayla (Teller, Dirençler, Entegre, Kondansatörler, LED, Dış teller); elektrolitikte + ve − delik', () => {
    const { plan, guide, targets } = perf('555-astabil');
    expect(stepGroups(targets, 0).map((g) => g.name)).toEqual(['Teller', 'Dirençler', 'Entegre', 'Kondansatörler', 'LED', 'Dış teller']);
    const c1 = targets.findIndex((t) => t?.kind === 'part' && t.part.label === 'C1');
    const labels = holeLabels(targets[c1]!, plan).map((l) => l.text);
    expect(labels[0]).toMatch(/^\+ \d+[a-j]$/);
    expect(labels[1]).toMatch(/^− \d+[a-j]$/);
    // Şimdiki adım C1: Kondansatörler grubunda 1. adım; önceki gruplar bitmiş.
    const groups = stepGroups(targets, c1);
    const caps = groups.find((g) => g.name === 'Kondansatörler')!;
    expect(caps.current).toBe(true);
    expect(caps.position).toBe(1);
    expect(groups.find((g) => g.name === 'Teller')!.done).toBe(groups.find((g) => g.name === 'Teller')!.total);
    expect(stepRef(guide.steps[c1]!, targets[c1]!)).toBe('C1');
    expect(stepRef(guide.steps[0]!, targets[0]!)).toBe('Jumper 1');
    // Entegrede yalnızca 1. bacağın deliği yazılır.
    const u1 = targets.find((t) => t?.kind === 'part' && t.part.label === 'U1')!;
    expect(holeLabels(u1, plan).map((l) => l.text)).toEqual([expect.stringMatching(/^1\. bacak \d+f$/)]);
    expect(perfboardInfo(plan)).toBe('Yarım boy · 30 sütun · breadboard düzeni');
  });

  it('transistörde bacak adları, rayda kısa ad; ölçü aleti telinin kartında rehberin uyarısı', () => {
    const { plan, targets } = perf('bjt-anahtar');
    const q = targets.find((t) => t?.kind === 'part' && t.part.type === 'npn')!;
    expect(holeLabels(q, plan).map((l) => l.text.split(' ')[0])).toEqual(['C', 'B', 'E']);
    expect(shortHole({ kind: 'rail', board: 0, rail: 0, k: 0 }, plan)).toMatch(/^\+ ray \d+$/);
    const scoped = perf('voltmetre-yukleme');
    const meter = scoped.targets.findIndex((t) => t?.kind === 'lead' && t.part.type === 'voltmeter');
    if (meter >= 0) expect(stepWarning(scoped.targets[meter]!, scoped.guide)).toMatch(/^Ölçü aletleri/);
  });
});

describe('Karta aktar: baskı devre', () => {
  it('555 astabil: eklenen parçalar kısa adla (dekuplaj, klemens) ve açıklamalarıyla', () => {
    const doc = exampleDoc('555-astabil')!;
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    const added = addedParts(result.design);
    expect(added.length).toBe(result.design.added.length);
    const cd = added.find((a) => a.ref.startsWith('C_D'))!;
    expect(cd.short).toBe('100 nF dekuplaj');
    expect(cd.explanation).toMatch(/^U1 için 100 nF dekuplaj/);
    expect(added.some((a) => /klemensi$|pin başlığı$/.test(a.short))).toBe(true);
    const u1 = result.design.footprints.find((f) => f.ref === 'U1')!;
    expect(footprintTip(u1).name.startsWith('U1 · ')).toBe(true);
  });

  it('eksik bağlantı: hedef ped, aynı ağdaki en yakın ped, uç adı ve uzaklık', () => {
    const doc = exampleDoc('555-astabil')!;
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    const routing = routePcb(result.design);
    // Bir ağın pedini çizilemedi say.
    const target = result.design.footprints.find((f) => f.ref === 'R1')!.pads[1]!;
    const fake = { ...routing, unrouted: [{ net: target.net!, pad: 'R1.2' }] };
    const [row] = missingConnections(doc, result.design, fake);
    expect(row).toBeDefined();
    expect(row!.n).toBe(1);
    expect(row!.to).toBe('R1');
    expect(row!.from).not.toBe('');
    expect(row!.pin).toBe('R1 2. ucu');
    expect(row!.mm).toBeGreaterThan(0);
    expect(row!.b).toEqual({ x: target.x, y: target.y });
  });
});
