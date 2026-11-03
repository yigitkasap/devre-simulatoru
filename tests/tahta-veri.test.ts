// Tahtada kur, 1. aşama: kurulum verisi (delik adları, dosyada okuma ve kaydetme, geri al ve yinele).

import { describe, expect, it } from 'vitest';
import { BB, planBreadboard } from '../src/bench3d/breadboard';
import { holeName } from '../src/bench3d/guide';
import { allHoles, connectedHoles, holeLabel, parseHole, sameHole } from '../src/bench3d/holes';
import { editorReducer, initialEditorState } from '../src/editor/state';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { autoWireColor, buildFromPlan, emptyBuild, occupiedHoles, type Build } from '../src/model/build';
import { removeItems } from '../src/model/docOps';
import { parseDoc, serializeDoc, toSerializable } from '../src/model/serialize';
import { decodeDoc, encodeDoc } from '../src/model/share';
import type { CircuitDoc } from '../src/model/types';

const load = (id: (typeof EXAMPLE_IDS)[number]) => exampleDoc(id)!;
const roundTrip = (doc: CircuitDoc) => parseDoc(JSON.parse(serializeDoc(doc)));

describe('Delik adları', () => {
  it('yarım ve tam boyda her delik adından geri okunur; adlar lehim rehberiyle aynı', () => {
    for (const cols of [BB.halfCols, BB.cols]) {
      const holes = allHoles(cols);
      const names = holes.map((h) => holeLabel(h, cols));
      expect(new Set(names).size).toBe(holes.length);
      holes.forEach((h, i) => expect(sameHole(parseHole(names[i]!, cols)!, h), names[i]).toBe(true));
    }
    expect(holeLabel({ kind: 'strip', board: 0, col: 12, row: 2 }, 30)).toBe('12c');
    expect(holeLabel({ kind: 'rail', board: 0, rail: 0, k: 0 }, 30)).toBe('üst + rayı (2. sütun hizası)');
    expect(holeLabel({ kind: 'rail', board: 0, rail: 2, k: 24 }, 30)).toBe('alt − rayı (30. sütun hizası)');
    const plan = planBreadboard(load('bjt-anahtar'));
    for (const at of plan.onBoard.values()) for (const h of at.holes) expect(holeName(h, plan)).toBe(holeLabel(h, plan.cols));
  });

  it('kartta olmayan delik okunmaz; bağlı delikler şeritte 5, rayda 25 ya da 50', () => {
    for (const bad of ['31a', '0c', '12k', 'üst + rayı (1. sütun hizası)', '12', '']) expect(parseHole(bad, 30), bad).toBeNull();
    expect(parseHole('31a', 63)).not.toBeNull();
    expect(connectedHoles(parseHole('11h', 30)!, 30).map((h) => holeLabel(h, 30))).toEqual(['11f', '11g', '11h', '11i', '11j']);
    expect(connectedHoles(parseHole('üst − rayı (5. sütun hizası)', 30)!, 30)).toHaveLength(25);
    expect(connectedHoles(parseHole('alt + rayı (5. sütun hizası)', 63)!, 63)).toHaveLength(50);
  });
});

describe('Kurulum verisi', () => {
  it('T1 örneği (Deney 9): planBreadboard yerleşimi R1 2c–6c, Q1 2h-3h-4h, R2 7h–11h, LED1 11g–12g', () => {
    const doc = load('bjt-anahtar');
    const build = buildFromPlan(planBreadboard(doc));
    const holes = (label: string) => build.parts[doc.parts.find((p) => p.label === label)!.id]!.holes;
    expect(build.cols).toBe(30);
    expect(holes('R1')).toEqual(['2c', '6c']);
    expect(holes('Q1')).toEqual(['2h', '3h', '4h']);
    expect(holes('R2')).toEqual(['7h', '11h']);
    expect(holes('LED1')).toEqual(['11g', '12g']);
  });

  it('bütün örneklerde plan → kurulum → dosya → kurulum aynı; bir delikte tek uç', () => {
    for (const id of EXAMPLE_IDS) {
      const doc = load(id);
      const build = buildFromPlan(planBreadboard(doc));
      const ends = [...Object.values(build.parts).flatMap((p) => [...p.holes, ...(p.extra ?? [])]), ...build.wires.flatMap((w) => [w.a, w.b]), ...build.leads.map((l) => l.hole)];
      expect(occupiedHoles(build).size, id).toBe(ends.length);
      const back = roundTrip({ ...doc, build });
      expect(back?.build, id).toEqual(build);
      expect(back?.parts).toEqual(doc.parts);
    }
  });

  it('kurulumsuz belge eskisi gibi (build alanı yazılmaz); paylaşım bağlantısı kurulumu taşır', () => {
    const doc = load('bjt-anahtar');
    expect('build' in toSerializable(doc)).toBe(false);
    expect(roundTrip(doc)?.build).toBeUndefined();
    const build = buildFromPlan(planBreadboard(doc));
    expect(decodeDoc(encodeDoc({ ...doc, build }))?.build).toEqual(build);
  });

  it('bozuk kurulum okunmaz, şema yine okunur', () => {
    const doc = load('bjt-anahtar');
    const good = buildFromPlan(planBreadboard(doc));
    const r1 = doc.parts.find((p) => p.label === 'R1')!.id;
    const bad: Build[] = [
      { ...good, parts: { ...good.parts, [r1]: { holes: ['2c', '99c'] } } },
      { ...good, parts: { ...good.parts, [r1]: { holes: ['2c'] } } },
      { ...good, parts: { ...good.parts, [r1]: { holes: ['2c', good.parts[doc.parts.find((p) => p.label === 'Q1')!.id]!.holes[0]!] } } },
      { ...good, cols: 40 },
    ];
    for (const build of bad) {
      const back = roundTrip({ ...doc, build });
      expect(back).not.toBeNull();
      expect(back!.parts).toEqual(doc.parts);
      expect(back!.build).toBeUndefined();
    }
    // Şemada olmayan parçanın kaydı atlanır, kurulumun kalanı okunur.
    const orphan = roundTrip({ ...doc, build: { ...good, parts: { ...good.parts, p999: { holes: ['20a', '24a'] } } } });
    expect(orphan?.build).toEqual(good);
  });

  it('geri al ve yinele kurulumu da kapsar; silinen parça tahtadan kalkar', () => {
    const doc = { ...load('bjt-anahtar'), build: emptyBuild(30) };
    const r1 = doc.parts.find((p) => p.label === 'R1')!.id;
    let state = initialEditorState(doc);
    const placed: CircuitDoc = { ...doc, build: { ...doc.build, parts: { [r1]: { holes: ['2c', '6c'] } } } };
    state = editorReducer(state, { type: 'commit', doc: placed });
    const wired: CircuitDoc = { ...placed, build: { ...placed.build!, wires: [{ a: '6a', b: '10a', color: 'orange' }] } };
    state = editorReducer(state, { type: 'commit', doc: wired });
    state = editorReducer(state, { type: 'undo' });
    expect(state.doc.build?.wires).toEqual([]);
    expect(state.doc.build?.parts[r1]?.holes).toEqual(['2c', '6c']);
    state = editorReducer(state, { type: 'undo' });
    expect(state.doc.build?.parts).toEqual({});
    state = editorReducer(state, { type: 'redo' });
    state = editorReducer(state, { type: 'redo' });
    expect(state.doc.build).toEqual(wired.build);
    const removed = removeItems(wired, [r1], []);
    expect(removed.build?.parts[r1]).toBeUndefined();
    expect(removed.build?.wires).toEqual(wired.build!.wires);
  });

  it('kablo rengi: + rayına giden kırmızı, − rayına giden siyah, öbürleri sırayla', () => {
    let build = emptyBuild(30);
    const add = (a: string, b: string) => {
      const color = autoWireColor(build, a, b);
      build = { ...build, wires: [...build.wires, { a, b, color }] };
      return color;
    };
    expect(add('3a', 'üst + rayı (3. sütun hizası)')).toBe('red');
    expect(add('alt − rayı (4. sütun hizası)', '4j')).toBe('black');
    expect([add('5a', '9a'), add('5b', '9b'), add('5c', '9c')]).toEqual(['orange', 'yellow', 'green']);
  });
});
