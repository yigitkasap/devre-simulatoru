// Tahtada kur, 5. aşama: ara kablolar (kendiliğinden renk, dolu delik, renk değiştirme) ve ölçü aleti
// kablolarını deliğe takma; takılmamış alet kabloları aletin önünde sarkar.

import { describe, expect, it } from 'vitest';
import { planBreadboard, type Hole } from '../src/bench3d/breadboard';
import { parseHole } from '../src/bench3d/holes';
import { exampleDoc } from '../src/examples';
import { buildFromPlan, emptyBuild, type Build } from '../src/model/build';
import { pinKey } from '../src/model/connectivity';
import type { CircuitDoc } from '../src/model/types';
import { boardCircuit } from '../src/tahta/circuit';
import { planFromBuild, WIRE_HEX } from '../src/tahta/plan';
import { addWire, plugLead, recolorWire, removeWire, unplugLead } from '../src/tahta/wiring';

const h = (name: string, cols = 30): Hole => parseHole(name, cols)!;
const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
const ok = (result: ReturnType<typeof addWire>): Build => {
  if (!result.ok) throw new Error(result.reason);
  return result.build;
};
const PLUS = 'üst + rayı (5. sütun hizası)';
const MINUS = 'alt − rayı (5. sütun hizası)';

describe('Ara kablolar (K)', () => {
  it('renk kendiliğinden: + rayına giden kırmızı, − rayına giden siyah, öbürleri sırayla', () => {
    let b = emptyBuild(30);
    b = ok(addWire(b, h(PLUS), h('5a')));
    b = ok(addWire(b, h('6j'), h(MINUS)));
    b = ok(addWire(b, h('7a'), h('9a')));
    b = ok(addWire(b, h('7b'), h('12b')));
    b = ok(addWire(b, h('üst − rayı (8. sütun hizası)'), h('14a')));
    b = ok(addWire(b, h('7c'), h('20c')));
    expect(b.wires.map((w) => w.color)).toEqual(['red', 'black', 'orange', 'yellow', 'black', 'green']);
    expect(b.wires[0]).toEqual({ a: PLUS, b: '5a', color: 'red' });
  });

  it('elle seçilen renk kullanılır; renk sonradan değişir, kablo çıkarılır', () => {
    let b = ok(addWire(emptyBuild(30), h(PLUS), h('5a'), 'blue'));
    expect(b.wires[0]!.color).toBe('blue');
    b = recolorWire(b, 0, 'white');
    expect(b.wires[0]!.color).toBe('white');
    expect(recolorWire(b, 3, 'red')).toBe(b);
    expect(removeWire(b, 0).wires).toEqual([]);
    expect(removeWire(b, 5)).toBe(b);
  });

  it('iki uç aynı delikte olamaz; dolu deliğe (bacak, kablo ucu, alet kablosu) takılmaz', () => {
    const doc = exampleDoc('bjt-anahtar')!;
    const plan = buildFromPlan(planBreadboard(doc));
    expect(addWire(plan, h('20a'), h('20a'))).toEqual({ ok: false, reason: 'same' });
    // R1 2c–6c'de; LED1 11g–12g'de.
    expect(addWire(plan, h('2c'), h('20a'))).toEqual({ ok: false, reason: 'occupied' });
    expect(addWire(plan, h('20a'), h('12g'))).toEqual({ ok: false, reason: 'occupied' });
    const withWire = ok(addWire(plan, h('20a'), h('22a')));
    expect(addWire(withWire, h('22a'), h('25a'))).toEqual({ ok: false, reason: 'occupied' });
    const lead = withWire.leads[0]!;
    expect(addWire(withWire, h(lead.hole), h('25a'))).toEqual({ ok: false, reason: 'occupied' });
    // Aynı şeridin boş deliği serbest.
    expect(addWire(plan, h('2d'), h('20a')).ok).toBe(true);
  });

  it('ara kablo tahtada iki iletkeni birleştirir', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const r = idOf(doc, 'R1');
    const at: Build = { ...emptyBuild(30), parts: { [r]: { holes: ['5a', '9a'] } } };
    const node = (b: Build, pin: number) => boardCircuit(doc, b).nodeOf.get(pinKey(r, pin));
    expect(node(at, 0)).not.toBe(node(at, 1));
    const wired = ok(addWire(at, h('5e'), h('9e')));
    expect(node(wired, 0)).toBe(node(wired, 1));
  });
});

describe('Ölçü aleti kabloları', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const schematic = planBreadboard(doc);
  const full = buildFromPlan(schematic);
  const lead = full.leads[0]!;
  const bare: Build = { ...full, leads: full.leads.filter((l) => !(l.part === lead.part && l.pin === lead.pin)) };

  it('uca tıklayıp deliğe takma; takılı kablo yeni deliğe taşınır; çıkarılınca sarkar', () => {
    const plugged = plugLead(bare, lead.part, lead.pin, h('20a'));
    expect(plugged.ok).toBe(true);
    if (!plugged.ok) return;
    expect(plugged.build.leads.filter((l) => l.part === lead.part && l.pin === lead.pin)).toEqual([{ part: lead.part, pin: lead.pin, hole: '20a' }]);
    const moved = plugLead(plugged.build, lead.part, lead.pin, h('21a'));
    expect(moved.ok && moved.build.leads.filter((l) => l.part === lead.part && l.pin === lead.pin).map((l) => l.hole)).toEqual(['21a']);
    // Kendi deliğine yeniden takmak serbest.
    expect(plugLead(plugged.build, lead.part, lead.pin, h('20a')).ok).toBe(true);
    // Dolu delik (R1'in bacağı).
    expect(plugLead(bare, lead.part, lead.pin, h('2c'))).toEqual({ ok: false, reason: 'occupied' });
    expect(unplugLead(plugged.build, lead.part, lead.pin).leads).toEqual(bare.leads);
    expect(unplugLead(bare, lead.part, lead.pin)).toBe(bare);
  });

  it('takılmamış alet kablosu tezgâhta aletin önünde sarkar; takılınca sarkmaz', () => {
    expect(planFromBuild(doc, full, schematic).loose).toEqual([]);
    const loose = planFromBuild(doc, bare, schematic).loose!;
    expect(loose.map((l) => [l.partId, l.pin])).toEqual([[lead.part, lead.pin]]);
    const empty = planFromBuild(doc, emptyBuild(30), schematic);
    expect(empty.loose!.length).toBe(schematic.leads.length);
    expect(empty.leads).toEqual([]);
  });

  it('ara kablolar tezgâhta seçilen renkle çizilir', () => {
    const b = ok(addWire(full, h('20a'), h('22a'), 'purple'));
    const plan = planFromBuild(doc, b, schematic);
    expect(plan.jumpers[plan.jumpers.length - 1]!.color).toBe(WIRE_HEX.purple);
  });
});
