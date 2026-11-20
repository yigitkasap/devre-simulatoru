// Kablo düzenleme (kablo-duzen, 2026-11-19): köşeli kablonun yalnızca tıklanan parçasını silmek (kablo ikiye
// bölünür), ucu sürükleyip bacağa, kabloya ve kablo ucuna bağlamak, iki kablonun birleşmesi, tek adımda geri alma
// ve netlistin doğru güncellenmesi.
import { describe, expect, it } from 'vitest';
import { buildConnectivity, pinKey, wireKey } from '../src/model/connectivity';
import { removeItems } from '../src/model/docOps';
import { pinPositions } from '../src/model/geometry';
import { DOC_VERSION, type CircuitDoc, type Part, type Point } from '../src/model/types';
import { deleteSegment, dragEndpoint, mergeAtEnd, moveWireEnd, splitForDelete } from '../src/model/wireEdit';
import { editorReducer, initialEditorState, segmentSelection } from '../src/editor/state';

const P = (x: number, y: number): Point => ({ x, y });

const resistor = (id: string, x: number, y: number): Part => ({ id, type: 'resistor', label: id.toUpperCase(), x, y, rotation: 0, props: { resistance: 1000 } });

/** Bağlantı listesinden ağlar: her anahtarın kökü (birleşim-bul). */
function nets(doc: CircuitDoc) {
  const { netlist } = buildConnectivity(doc);
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let r = k;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const add = (k: string) => {
    if (!parent.has(k)) parent.set(k, k);
  };
  for (const el of netlist.elements) for (const pin of el.pins) add(pin);
  for (const l of netlist.links) {
    add(l.a);
    add(l.b);
    const a = find(l.a);
    const b = find(l.b);
    if (a !== b) parent.set(a, b);
  }
  return { same: (a: string, b: string) => find(a) === find(b) };
}

const doc = (parts: Part[], wires: { id: string; points: Point[] }[]): CircuitDoc => ({ version: DOC_VERSION, parts, wires });

describe('kablo düzenleme', () => {
  // Köşeli kablo: (0,0) → (10,0) → (10,10) → (20,10): üç düz parça.
  const zigzag = { id: 'w1', points: [P(0, 0), P(10, 0), P(10, 10), P(20, 10)] };

  it('ortadaki parça silinince kablo ikiye bölünür, uçlar yerinde kalır', () => {
    const next = deleteSegment(doc([], [zigzag]), 'w1', 1);
    expect(next.wires).toHaveLength(2);
    expect(next.wires.find((w) => w.id === 'w1')!.points).toEqual([P(0, 0), P(10, 0)]);
    expect(next.wires.find((w) => w.id === 'w2')!.points).toEqual([P(10, 10), P(20, 10)]);
  });

  it('uç parçası silinince kablo kısalır; tek parçalı kablo bütünüyle silinir', () => {
    const first = deleteSegment(doc([], [zigzag]), 'w1', 0);
    expect(first.wires).toEqual([{ id: 'w1', points: [P(10, 0), P(10, 10), P(20, 10)] }]);
    const last = deleteSegment(doc([], [zigzag]), 'w1', 2);
    expect(last.wires).toEqual([{ id: 'w1', points: [P(0, 0), P(10, 0), P(10, 10)] }]);
    const single = deleteSegment(doc([], [{ id: 'w1', points: [P(0, 0), P(10, 0)] }]), 'w1', 0);
    expect(single.wires).toHaveLength(0);
  });

  it('seçimdeki parçası seçili kablo bölünür, tamamı seçili kablo silinir; yeni kimlik çakışmaz', () => {
    const d = doc([], [zigzag, { id: 'w3', points: [P(0, 30), P(10, 30)] }]);
    const split = splitForDelete(d, ['w1', 'w3'], { w1: 1 });
    expect(split.cut).toBe(1);
    expect(split.whole).toEqual(['w3']);
    const after = removeItems(split.doc, [], split.whole);
    expect(after.wires.map((w) => w.id).sort()).toEqual(['w1', 'w4']);
  });

  it('parça silinince netlist: iki yan ayrı düğümde', () => {
    const r1 = resistor('r1', 0, 0);
    const r2 = resistor('r2', 40, 20);
    const [a] = pinPositions(r1);
    const [, b] = pinPositions(r2);
    const w = { id: 'w1', points: [a!, P(a!.x, 10), P(b!.x, 10), b!] };
    const before = doc([r1, r2], [w]);
    expect(nets(before).same(pinKey('r1', 0), pinKey('r2', 1))).toBe(true);
    const after = deleteSegment(before, 'w1', 1);
    expect(after.wires).toHaveLength(2);
    expect(nets(after).same(pinKey('r1', 0), pinKey('r2', 1))).toBe(false);
    expect(buildConnectivity(after).danglingEnds).toHaveLength(2);
  });

  it('uç sürüklenince yalnızca son parça uzar/kısalır; hizasızsa dik açıyla köşe eklenir', () => {
    // Son parça yatay (10,10) → (20,10): ucu (30,10)'a uzat.
    expect(dragEndpoint(zigzag.points, 'end', P(30, 10))).toEqual([P(0, 0), P(10, 0), P(10, 10), P(30, 10)]);
    // Kısalt.
    expect(dragEndpoint(zigzag.points, 'end', P(15, 10))).toEqual([P(0, 0), P(10, 0), P(10, 10), P(15, 10)]);
    // Hizasız: son parçanın yönünde devam, sonra dik.
    expect(dragEndpoint(zigzag.points, 'end', P(30, 20))).toEqual([P(0, 0), P(10, 0), P(10, 10), P(30, 10), P(30, 20)]);
    // Baş ucu da: ilk parça yatay, (-5,0)'a uzar.
    expect(dragEndpoint(zigzag.points, 'start', P(-5, 0))).toEqual([P(-5, 0), P(10, 0), P(10, 10), P(20, 10)]);
    // Geriye, son köşenin öbür yanına: geri dönen kıvrım kalmaz.
    expect(dragEndpoint([P(0, 0), P(10, 0)], 'end', P(-10, 0))).toEqual([P(0, 0), P(-10, 0)]);
  });

  it('boşta ucu bacağa bağlama: bacakla aynı düğüm, bacaktan ayırma: parça yerinde', () => {
    const r1 = resistor('r1', 40, 0);
    const [pin] = pinPositions(r1);
    const w = { id: 'w1', points: [P(0, 0), P(10, 0)] };
    const before = doc([r1], [w]);
    expect(nets(before).same(wireKey('w1'), pinKey('r1', 0))).toBe(false);
    const after = moveWireEnd(before, 'w1', 'end', pin!, true);
    expect(after.wires[0]!.points[after.wires[0]!.points.length - 1]).toEqual(pin);
    expect(nets(after).same(wireKey('w1'), pinKey('r1', 0))).toBe(true);
    // Geri çek: bacaktan ayrılır, parça kıpırdamaz.
    const away = moveWireEnd(after, 'w1', 'end', P(10, 5), true);
    expect(away.parts).toEqual(after.parts);
    expect(nets(away).same(wireKey('w1'), pinKey('r1', 0))).toBe(false);
  });

  it('ucu başka bir kablonun ortasına bırakmak T bağlantısı yapar (birleşme yok)', () => {
    const before = doc([], [{ id: 'w1', points: [P(0, 0), P(0, 5)] }, { id: 'w2', points: [P(-10, 10), P(10, 10)] }]);
    const after = moveWireEnd(before, 'w1', 'end', P(0, 10), true);
    expect(after.wires).toHaveLength(2);
    expect(nets(after).same(wireKey('w1'), wireKey('w2'))).toBe(true);
    expect(buildConnectivity(after).junctions).toContainEqual(P(0, 10));
  });

  it('ucu başka bir kablonun ucuna bırakmak, arada başka bağlantı yoksa iki kabloyu birleştirir', () => {
    const r1 = resistor('r1', -40, 0);
    const r2 = resistor('r2', 60, 20);
    const [, a] = pinPositions(r1);
    const [b] = pinPositions(r2);
    const w1 = { id: 'w1', points: [a!, P(0, a!.y)] };
    const w2 = { id: 'w2', points: [P(10, 20), P(10, b!.y), b!] };
    const before = doc([r1, r2], [w1, w2]);
    const after = moveWireEnd(before, 'w1', 'end', P(10, 20), true);
    expect(after.wires).toHaveLength(1);
    expect(after.wires[0]!.id).toBe('w1');
    expect(after.wires[0]!.points[0]).toEqual(a);
    expect(after.wires[0]!.points[after.wires[0]!.points.length - 1]).toEqual(b);
    expect(nets(after).same(pinKey('r1', 1), pinKey('r2', 0))).toBe(true);
    expect(buildConnectivity(after).danglingEnds).toHaveLength(0);
    // Sürükleme sırasında (bırakmadan) birleşmez.
    expect(moveWireEnd(before, 'w1', 'end', P(10, 20), false).wires).toHaveLength(2);
  });

  it('birleşme yok: noktada bacak, üçüncü kablo ya da geçen kablo varsa', () => {
    const r1 = resistor('r1', 40, 0);
    const [pin] = pinPositions(r1);
    const withPin = doc([r1], [{ id: 'w1', points: [P(0, 0), pin!] }, { id: 'w2', points: [pin!, P(pin!.x, 20)] }]);
    expect(mergeAtEnd(withPin, 'w1', 'end').merged).toBeNull();
    const three = doc([], [
      { id: 'w1', points: [P(0, 0), P(10, 0)] },
      { id: 'w2', points: [P(10, 0), P(20, 0)] },
      { id: 'w3', points: [P(10, 0), P(10, 10)] },
    ]);
    expect(mergeAtEnd(three, 'w1', 'end').merged).toBeNull();
    const through = doc([], [
      { id: 'w1', points: [P(0, 0), P(10, 0)] },
      { id: 'w2', points: [P(10, 0), P(20, 0)] },
      { id: 'w3', points: [P(10, -10), P(10, 10)] },
    ]);
    expect(mergeAtEnd(through, 'w1', 'end').merged).toBeNull();
    const pair = doc([], [
      { id: 'w1', points: [P(0, 0), P(10, 0)] },
      { id: 'w2', points: [P(10, 0), P(10, 10)] },
    ]);
    const merged = mergeAtEnd(pair, 'w1', 'end');
    expect(merged.merged).toBe('w2');
    expect(merged.doc.wires).toEqual([{ id: 'w1', points: [P(0, 0), P(10, 0), P(10, 10)] }]);
  });

  it('her işlem tek adımda geri alınır (sürükleme önizleme + bitiş; silme commit)', () => {
    const start = doc([], [zigzag]);
    let state = initialEditorState(start);
    // Uç sürükleme: birkaç önizleme, sonra bitiş.
    state = editorReducer(state, { type: 'preview', doc: moveWireEnd(start, 'w1', 'end', P(25, 10), false) });
    state = editorReducer(state, { type: 'preview', doc: moveWireEnd(start, 'w1', 'end', P(30, 10), false) });
    state = editorReducer(state, { type: 'preview', doc: moveWireEnd(start, 'w1', 'end', P(30, 10), true) });
    state = editorReducer(state, { type: 'end-preview', before: start });
    expect(state.past).toHaveLength(1);
    state = editorReducer(state, { type: 'undo' });
    expect(state.doc).toBe(start);
    // Parça silme.
    state = editorReducer(state, { type: 'select', selection: segmentSelection('w1', 1) });
    const split = splitForDelete(state.doc, state.selection.wires, state.selection.segments);
    state = editorReducer(state, { type: 'commit', doc: removeItems(split.doc, [], split.whole) });
    expect(state.doc.wires).toHaveLength(2);
    state = editorReducer(state, { type: 'undo' });
    expect(state.doc).toBe(start);
  });

  it('seçimdeki parça sırası geçersiz kalınca ayıklanır', () => {
    let state = initialEditorState(doc([], [zigzag]));
    state = editorReducer(state, { type: 'select', selection: segmentSelection('w1', 2) });
    state = editorReducer(state, { type: 'commit', doc: deleteSegment(state.doc, 'w1', 1) });
    // w1 artık tek parçalı: 2. parça yok, seçim kablonun tamamı olur.
    expect(state.selection.wires).toEqual(['w1']);
    expect(state.selection.segments).toBeUndefined();
  });
});
