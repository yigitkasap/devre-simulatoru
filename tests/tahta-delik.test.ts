// Bir delik tek tel ya da tek bacak alır (kullanıcı kuralı, 3B tezgâh paketi 7. madde): Tahtada kur'un
// yerleşiminde (planBreadboard → buildFromPlan; örnek yerleşim ipucu, görevlerin hazır kabloları ve beklenen
// delikleri) hiçbir delikte iki şey yok. Bütün örnekler (81).

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan } from '../src/model/build';
import { DEFAULT_BOARD_TASK } from '../src/model/task';
import { startBuild } from '../src/tahta/task';

/** Kurulumdaki bütün uçlar (bacaklar, ara kabloların iki ucu, alet kabloları), delik adıyla. */
function ends(build: ReturnType<typeof buildFromPlan>): string[] {
  return [
    ...Object.values(build.parts).flatMap((p) => [...p.holes, ...(p.extra ?? [])]),
    ...build.wires.flatMap((w) => [w.a, w.b]),
    ...build.leads.map((l) => l.hole),
  ];
}

const doubled = (list: readonly string[]) => list.filter((h, i) => list.indexOf(h) !== i);

describe('Tahtada kur: bir delikte tek tel ya da tek bacak', () => {
  it('81 örnek', () => {
    expect(EXAMPLE_IDS.length).toBe(81);
  });

  for (const id of EXAMPLE_IDS) {
    it(`${id}: yerleşimde ve görevlerin başlangıç tahtalarında hiçbir delikte iki şey yok`, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      const full = buildFromPlan(plan);
      expect(doubled(ends(full)), `${id}: aynı delikte iki uç`).toEqual([]);
      for (const start of ['rails', 'parts'] as const) {
        const begin = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start, parts: doc.parts.map((p) => p.id) });
        expect(doubled(ends(begin)), `${id} (${start}): aynı delikte iki uç`).toEqual([]);
      }
    });
  }
});
