// Arıza bulma (B2), 1. aşama: arıza netlist kurulurken uygulanır, şema ve motor değişmez.
// Örnek senaryo (docs/tasarim-v3 "Arıza bulma"): BC107 yükselteçte RC'nin kollektör tarafındaki bacağı
// kopuk → VC ≈ 0,01 V, VB ≈ 0,55 V, Q1 doyumda; kopuk uçta 10 MΩ'lık ölçüm 12 V × 10 MΩ / (10 MΩ +
// 5,6 kΩ) ≈ 11,99 V.

import { describe, expect, it } from 'vitest';
import { atOperatingPoint } from '../src/editor/analysis/bode';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity, pinKey, wireKey } from '../src/model/connectivity';
import { faultFits, faultValid, type Fault } from '../src/model/faults';
import { pinPositions } from '../src/model/geometry';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { maskFrame, visibleLive } from '../src/editor/fault/mask';
import { legLabel, measureResistance, METER_ID, meterPart, wireMeter } from '../src/editor/fault/meter';
import { addEntry, entryName, NEW_SESSION, parseSession } from '../src/editor/fault/session';
import { faultCandidates, faultExplain, placeLabel, placeMatches, randomFault } from '../src/editor/fault/judge';
import { netIndex } from '../src/editor/analysis/traces';
import { faultFromPlace, kindsFor, makeFault, placeOptions, rowKey } from '../src/editor/task/faultRows';
import { FAULT_SCENARIOS } from '../src/examples/faultScenarios';
import { scenarioTask } from '../src/editor/fault/scenarios';
import { BURNT_PROP, faultedLook } from '../src/editor/fault/look';
import { insertAmmeter } from '../src/editor/fault/ammeter';
import { meterIntact, remapFaults, removeAmmeter, removedMeters, unplugAll, type InsertedMeter } from '../src/model/meters';
import { addPart, addWire, removeItems, replaceWirePoints } from '../src/model/docOps';
import { boxesIntersect, partBounds } from '../src/model/geometry';
import { meterDisplayRect, meterFlipped, partTextBoxes } from '../src/editor/PartView';
import { canAddType, respectsTask, type TaskDef } from '../src/model/task';
import { tr } from '../src/i18n/tr';
import type { SimFrame } from '../src/editor/useSimulation';
import { parseTask, parseTaskPayload } from '../src/model/task';
import { toSerializable } from '../src/model/serialize';

const partId = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;

/** Arızalı devreyi DC çalışma noktasında başlatır; `meter` verilirse oraya topraktan 10 MΩ'lık voltmetre. */
function run(doc: CircuitDoc, faults: readonly Fault[], meter?: string, seconds = 0.2): CircuitSimulator {
  let netlist = buildConnectivity(doc, faults).netlist;
  if (meter) {
    const ground = pinKey(partId(doc, 'GND1'), 0);
    netlist = { ...netlist, elements: [...netlist.elements, { id: 'olcum', type: 'voltmeter', props: { mode: 'dc', resistance: 10e6 }, pins: [meter, ground] }] };
  }
  const sim = new CircuitSimulator(atOperatingPoint(netlist));
  expect(sim.runUntil(seconds).ok).toBe(true);
  return sim;
}
const reading = (sim: CircuitSimulator, id: string) => sim.status(id).reading ?? NaN;

describe('Arıza bulma: arıza netlist kurulurken uygulanır', () => {
  const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
  const RC = partId(doc, 'RC');
  const Q1 = partId(doc, 'Q1');
  const open: Fault = { kind: 'open', at: { part: RC, pin: 1 } };

  it('RC’nin 1. bacağı kollektör tarafında (Q1 kollektörüne giden kablonun başında)', () => {
    const rc = doc.parts.find((p) => p.id === RC)!;
    const toCollector = doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!;
    expect(pinPositions(rc)[1]).toEqual(toCollector.points[0]);
    expect(faultValid(open, doc)).toBe(true);
  });

  it('sağlam devre (DC voltmetreyle, çıkıştaki AC ortalanır): VC ≈ 5,99 V, VB ≈ 0,64 V, Q1 aktif', () => {
    expect(reading(run(doc, [], pinKey(Q1, 0)), 'olcum')).toBeCloseTo(5.99, 1);
    const sim = run(doc, [], pinKey(Q1, 1));
    expect(reading(sim, 'olcum')).toBeCloseTo(0.64, 2);
    expect(sim.status(Q1).region).toBe('active');
  });

  it('RC kollektör bacağı kopuk: VC ≈ 0,01 V, VB ≈ 0,55 V, Q1 doyumda; kopuk uçta 10 MΩ ile 11,99 V, yanındaki düğümde 0,01 V', () => {
    const sim = run(doc, [open]);
    const vc = sim.voltageAt(pinKey(Q1, 0))!;
    const vb = sim.voltageAt(pinKey(Q1, 1))!;
    expect(Math.abs(vc - 0.01)).toBeLessThan(0.006);
    expect(vb).toBeCloseTo(0.55, 2);
    expect(sim.status(Q1).region).toBe('saturation');
    // Bacak ile bağlı olduğu düğüm ayrı okunur: aynı noktada iki farklı gerilim.
    const leg = run(doc, [open], pinKey(RC, 1));
    expect(reading(leg, 'olcum')).toBeCloseTo((12 * 10e6) / (10e6 + 5600), 2);
    const node = run(doc, [open], wireKey(doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!.id));
    expect(Math.abs(reading(node, 'olcum') - 0.01)).toBeLessThan(0.006);
  });

  it('şemanın çizimi ve uyarıları değişmez (kavşaklar, bağlanmamış uçlar)', () => {
    const a = buildConnectivity(doc);
    const b = buildConnectivity(doc, [open]);
    expect(b.junctions).toEqual(a.junctions);
    expect([...b.unconnectedPins]).toEqual([...a.unconnectedPins]);
    expect(b.danglingEnds).toEqual(a.danglingEnds);
    expect(b.netlist.elements.length).toBe(a.netlist.elements.length);
  });

  it('kopuk kablo ucu: kablonun kendisi öbür ucundaki düğümde, kopuk uçtaki bacak ayrı kalır', () => {
    // RC'yi kollektöre bağlayan kablo (w3) kollektör ucunda kopuk: devre RC bacağı kopukmuş gibi davranır.
    const w = doc.wires.find((x) => x.points.some((p) => p.x === 44 && p.y === 0))!;
    const fault: Fault = { kind: 'open', at: { wire: w.id, end: 1 } };
    expect(faultValid(fault, doc)).toBe(true);
    const sim = run(doc, [fault]);
    expect(sim.voltageAt(pinKey(Q1, 0))!).toBeLessThan(0.05);
    expect(sim.voltageAt(wireKey(w.id))!).toBeGreaterThan(11.9);
  });

  it('kısa devre: Q1 kollektörü ile emetörü arası → VC = 0', () => {
    const sim = run(doc, [{ kind: 'short', at: { part: Q1, pin: 0 }, to: { part: Q1, pin: 2 } }]);
    expect(Math.abs(sim.voltageAt(pinKey(Q1, 0))!)).toBeLessThan(1e-6);
  });

  it('yanlış değer: RC 5,6 kΩ yerine 560 Ω → kollektör beslemeye yaklaşır (VC ≈ 11,4 V)', () => {
    const fault: Fault = { kind: 'value', part: RC, value: 560 };
    expect(faultValid(fault, doc)).toBe(true);
    const vc = run(doc, [fault]).voltageAt(pinKey(Q1, 0))!;
    expect(vc).toBeGreaterThan(11);
    expect(vc).toBeLessThan(11.8);
    // Belge değişmez.
    expect(doc.parts.find((p) => p.id === RC)!.props.resistance).toBe(5600);
  });

  it.each([
    ['diyot-yonu', 'D1', 'reversed'],
    ['led-on-direnc', 'LED1', 'reversed'],
    ['led-on-direnc', 'LED1', 'burnt'],
  ] as const)('%s: %s %s → ampermetre akım göstermez', (example, label, kind) => {
    const d = exampleDoc(example as ExampleId)!;
    const id = partId(d, label);
    const fault: Fault = { kind, part: id };
    expect(faultValid(fault, d)).toBe(true);
    const ammeter = partId(d, 'A1');
    expect(Math.abs(reading(run(d, []), ammeter))).toBeGreaterThan(1e-3);
    expect(Math.abs(reading(run(d, [fault]), ammeter))).toBeLessThan(1e-6);
  });

  it('tür parçaya uygun olmalı: dirence ters takılma ya da yanma olmaz; kutupsuz kondansatör ters takılmaz', () => {
    const rc = doc.parts.find((p) => p.id === RC)!;
    expect(faultFits('reversed', rc)).toBe(false);
    expect(faultFits('burnt', rc)).toBe(false);
    expect(faultFits('value', rc)).toBe(true);
    const c1 = doc.parts.find((p) => p.label === 'C1')!;
    expect(faultFits('reversed', c1)).toBe(true);
    expect(faultFits('reversed', { ...c1, props: { ...c1.props, kind: 'film' } })).toBe(false);
    expect(faultValid({ kind: 'open', at: { part: RC, pin: 2 } }, doc)).toBe(false);
    expect(faultValid({ kind: 'open', at: { wire: 'w1' } }, doc)).toBe(false);
    expect(faultValid({ kind: 'value', part: RC, value: -1 }, doc)).toBe(false);
  });
});

describe('Arıza bulma görevi: bağlantıdan okuma ve otomatik göstergeler', () => {
  const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
  const base = { name: 'Deney 7 · arıza bul', instruction: '', editable: [], allowNew: false, targets: [], predict: false };

  it('görev: belirti, arızalar, ölçü aletleri; eksik alanlarda varsayılan (göstergeler gizli, aletler V Ω osiloskop)', () => {
    const t = parseTask({ ...base, fault: { symptom: 'Çıkış yok', faults: [{ kind: 'open', at: { part: 'p3', pin: 1 } }, { kind: 'uydurma' }] } })!;
    expect(t.fault).toEqual({
      symptom: 'Çıkış yok',
      faults: [{ kind: 'open', at: { part: 'p3', pin: 1 } }],
      tools: { voltage: true, resistance: true, scope: true, ammeter: false },
      hideIndicators: true,
      askExpected: false,
    });
    // Eski (hedefli) görevde arıza yok.
    expect(parseTask(base)!.fault).toBeUndefined();
  });

  it('belgeyle uyuşmayan arıza (olmayan parça, uygun olmayan tür) atlanır', () => {
    const payload = {
      format: 1,
      gorev: { ...base, fault: { symptom: '', faults: [{ kind: 'open', at: { part: 'yok', pin: 0 } }, { kind: 'burnt', part: 'p3' }, { kind: 'value', part: 'p3', value: 560 }] } },
      devre: toSerializable(doc),
    };
    expect(parseTaskPayload(payload)!.task.fault!.faults).toEqual([{ kind: 'value', part: 'p3', value: 560 }]);
  });

  it('defterin karesi: yalnızca ölçü aletleri ve cihazlar; kablo gerilimleri ve uyarılar yok', () => {
    const ids = (type: string) => doc.parts.filter((p) => p.type === type).map((p) => p.id);
    const all = new Map(doc.parts.map((p) => [p.id, { voltage: 1, current: 1, power: 1 }]));
    const frame = { wireVoltages: new Map([['w1', 12]]), wireSummaries: new Map(), partFlows: new Map(), pinFlows: new Map(), live: new Map(), measurements: all, statuses: new Map(), summaries: new Map(), meterTexts: new Map(), runtime: [{ code: 'short-circuit' }], alarms: new Set(['p1']) } as unknown as SimFrame;
    const masked = maskFrame(frame, doc);
    expect([...masked.measurements.keys()].sort()).toEqual([...ids('oscilloscope'), ...ids('funcgen'), ...ids('dcsupply')].sort());
    expect(masked.wireVoltages.size).toBe(0);
    expect(masked.runtime).toEqual([]);
    expect(masked.alarms.size).toBe(0);
  });

  it('şemadaki görseller: LED ışığı ve motor kalır; kondansatörün dolması, direncin ısınması, manyetik alan gider', () => {
    expect(visibleLive({ brightness: 0.8, charge: 0.4, powerRatio: 2, field: 0.1, angle: 1 })).toEqual({ brightness: 0.8, angle: 1 });
  });
});

describe('Multimetre (R1): uçların adları, Ω, simülasyondaki yeri', () => {
  const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
  const part = (label: string) => doc.parts.find((p) => p.label === label)!;
  const RC = part('RC').id;
  const collector = doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!;

  it('bacak adları: iki bacaklı dirençte konum, transistörde uç adı, kaynakta "ucu", toprakta adı', () => {
    expect(legLabel(part('RC'), 1)).toBe('RC alt bacağı');
    expect(legLabel(part('RC'), 0)).toBe('RC üst bacağı');
    expect(legLabel(part('Q1'), 0)).toBe('Q1 kollektör bacağı');
    expect(legLabel(part('C1'), 0)).toBe('C1 + bacağı');
    expect(legLabel(part('PS1'), 0)).toBe('PS1 1+ ucu');
    expect(legLabel(part('GND1'), 0)).toBe('GND1');
  });

  it('Ω (güç kapalı): RC’nin iki bacağı ≈ 5,6 kΩ (devrenin geri kalanı ≈ 4,3 MΩ paralel); RC kopukken üst bacak ile kollektör arası MΩ’lar', () => {
    const healthy = buildConnectivity(doc).netlist;
    expect(measureResistance(healthy, pinKey(RC, 0), pinKey(RC, 1))!).toBeCloseTo(5600, -2);
    expect(measureResistance(healthy, pinKey(RC, 0), wireKey(collector.id))!).toBeCloseTo(5600, -2);
    const faulty = buildConnectivity(doc, [{ kind: 'open', at: { part: RC, pin: 1 } }]).netlist;
    expect(measureResistance(faulty, pinKey(RC, 0), pinKey(RC, 1))!).toBeCloseTo(5600, -2);
    expect(measureResistance(faulty, pinKey(RC, 0), wireKey(collector.id))!).toBeGreaterThan(1e6);
  });

  it('simülasyonda görünmez voltmetre: iç direnç 10 MΩ, uçları kırmızı ve siyah ucun yerine bağlanır', () => {
    const mm = meterPart('ac');
    expect(mm).toMatchObject({ id: METER_ID, type: 'voltmeter', props: { mode: 'ac', resistance: 10e6, ideal: false } });
    const netlist = buildConnectivity({ ...doc, parts: [...doc.parts, mm] }).netlist;
    const red = { spot: { part: RC, pin: 1 }, at: { x: 44, y: -4 } };
    const black = { spot: { wire: collector.id }, at: { x: 44, y: -2 } };
    expect(wireMeter(netlist, 'dc', red, black).elements.find((e) => e.id === METER_ID)!.pins).toEqual([pinKey(RC, 1), wireKey(collector.id)]);
    // Ω kipinde ya da uç eksikken boşta kalır.
    expect(wireMeter(netlist, 'ohm', red, black)).toBe(netlist);
    expect(wireMeter(netlist, 'dc', red, null)).toBe(netlist);
  });
});

describe('Ölçüm günlüğü (4. aşama)', () => {
  const entry = { key: 'dc|p4#0|p2#0', name: entryName('dc', 'Q1 kollektör', null), mode: 'dc' as const, text: '6,442 mV', value: 0.006442 };

  it('ad: siyah uç topraktaysa yalnız kırmızı ucun yeri; değilse ikisi; Ω’da R', () => {
    expect(entry.name).toBe('V(Q1 kollektör)');
    expect(entryName('ac', 'Q1 baz', 'Q1 emetör bacağı')).toBe('V(Q1 baz, Q1 emetör bacağı)');
    expect(entryName('ohm', 'RC üst bacağı', 'RC alt bacağı')).toBe('R(RC üst bacağı, RC alt bacağı)');
  });

  it('aynı nokta ve kip tekrar yazılmaz; oturum kaydedilip okunur (beklenen değer dahil)', () => {
    const once = addEntry(NEW_SESSION, entry);
    expect(addEntry(once, { ...entry, text: '6,5 mV' })).toBe(once);
    const two = addEntry(once, { ...entry, key: 'ohm|p3#0|p3#1', mode: 'ohm', name: 'R(RC üst bacağı, RC alt bacağı)', text: 'OL', value: null });
    const saved = JSON.parse(JSON.stringify({ ...two, log: [{ ...two.log[0]!, expected: 6 }, two.log[1]!], hints: 2 }));
    const back = parseSession(saved);
    expect(back.log.map((e) => [e.name, e.text, e.value, e.expected])).toEqual([
      ['V(Q1 kollektör)', '6,442 mV', 0.006442, 6],
      ['R(RC üst bacağı, RC alt bacağı)', 'OL', null, undefined],
    ]);
    expect(back.hints).toBe(2);
    expect(parseSession('bozuk')).toEqual(NEW_SESSION);
  });
});

describe('Bildirim ve "Bulundu" (5. aşama)', () => {
  const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
  const idx = netIndex(doc, buildConnectivity(doc));
  const id = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  const [RC, Q1] = [id('RC'), id('Q1')];
  const open: Fault = { kind: 'open', at: { part: RC, pin: 1 } };
  const collectorWire = doc.wires.find((w) => w.points.some((p) => p.x === 44 && p.y === 0))!;

  it('yerin adı: iki bacaklı parçada bacağın bağlı olduğu düğüm, transistörde uç adı, parçanın kendisi, kablo', () => {
    expect(placeLabel({ part: RC, pin: 1 }, doc, idx)).toBe('RC · Q1 kollektör tarafındaki bacak');
    expect(placeLabel({ part: Q1, pin: 1 }, doc, idx)).toBe('Q1 · baz bacağı');
    expect(placeLabel({ part: Q1 }, doc, idx)).toBe('Q1 · NPN transistör');
    expect(placeLabel({ wire: collectorWire.id }, doc, idx)).toBe('Kablo · Q1 kollektör');
  });

  it('kopuk bacak: o bacak ya da aynı noktadaki kablo ucu doğru; tür yanlışsa, öbür bacak ya da parçanın kendisi yanlış', () => {
    expect(placeMatches(open, { part: RC, pin: 1 }, 'open', doc, idx)).toBe(true);
    expect(placeMatches(open, { wire: collectorWire.id }, 'open', doc, idx)).toBe(true);
    expect(placeMatches(open, { part: RC, pin: 1 }, 'value', doc, idx)).toBe(false);
    expect(placeMatches(open, { part: RC, pin: 0 }, 'open', doc, idx)).toBe(false);
    expect(placeMatches(open, { part: RC }, 'open', doc, idx)).toBe(false);
  });

  it('kısa devre: iki düğümden birine dokunan yer; parçanın kendisi iki düğüme birden dokunmalı. Değer: parça ya da bacağı', () => {
    const short: Fault = { kind: 'short', at: { part: Q1, pin: 0 }, to: { part: Q1, pin: 2 } };
    expect(placeMatches(short, { part: Q1 }, 'short', doc, idx)).toBe(true);
    expect(placeMatches(short, { wire: collectorWire.id }, 'short', doc, idx)).toBe(true);
    expect(placeMatches(short, { part: id('RB') }, 'short', doc, idx)).toBe(false);
    const value: Fault = { kind: 'value', part: RC, value: 560 };
    expect(placeMatches(value, { part: RC }, 'value', doc, idx)).toBe(true);
    expect(placeMatches(value, { part: RC, pin: 0 }, 'value', doc, idx)).toBe(true);
    expect(faultExplain(value, doc, idx).title).toBe('RC şemadaki 5,6 kΩ yerine 560 Ω');
  });

  it('rastgele arıza: adayların hepsi belgeyle uyumlu; ölçü aletlerine, kaynaklara ve toprağa arıza konmaz; öncekinden farklı', () => {
    const all = faultCandidates(doc, idx);
    expect(all.length).toBeGreaterThan(5);
    expect(all.every((f) => faultValid(f, doc))).toBe(true);
    const banned = new Set(doc.parts.filter((p) => ['oscilloscope', 'funcgen', 'dcsupply', 'ground'].includes(p.type)).map((p) => p.id));
    expect(all.some((f) => ('part' in f && banned.has(f.part)) || (f.kind === 'open' && 'part' in f.at && banned.has(f.at.part)))).toBe(false);
    expect(randomFault(doc, idx, () => 0, all[0])).not.toEqual(all[0]);
  });
});

describe('Görev oluştur → Arıza bulma (6. aşama, R4)', () => {
  const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
  const idx = netIndex(doc, buildConnectivity(doc));
  const id = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  const [RC, C1] = [id('RC'), id('C1')];

  it('yerler: bacaklar, parçalar ve kablo uçları; ölçü aletlerine ve toprağa arıza konmaz', () => {
    const opts = placeOptions(doc, idx);
    expect(opts.find((o) => o.key === `p:${RC}:1`)!.label).toBe('RC · Q1 kollektör tarafındaki bacak');
    expect(opts.some((o) => o.key === `p:${id('OSC1')}`)).toBe(false);
    expect(opts.filter((o) => o.group === 'wire').length).toBe(doc.wires.length * 2);
  });

  it('türler yere göre; yer ve türden arıza, değer ve kısa devrenin öbür ucu korunur', () => {
    expect(kindsFor(`p:${RC}:1`, doc)).toEqual(['open', 'short']);
    expect(kindsFor(`p:${RC}`, doc)).toEqual(['value', 'short']);
    expect(kindsFor(`p:${C1}`, doc)).toEqual(['value', 'reversed', 'short']);
    expect(makeFault(`p:${RC}`, 'value', doc)).toEqual({ kind: 'value', part: RC, value: 56000 });
    expect(makeFault(`p:${RC}`, 'value', doc, { kind: 'value', part: RC, value: 560 })).toEqual({ kind: 'value', part: RC, value: 560 });
    const open = makeFault(`p:${RC}:1`, 'open', doc)!;
    expect(rowKey(open)).toBe(`p:${RC}:1`);
  });

  it('şemadan seçilen yer: bacak → kopuk; kabloda yakın uç; kısa devrede "ile" öbür ucu değiştirir', () => {
    expect(faultFromPlace({ part: RC, pin: 1 }, { x: 44, y: -4 }, doc, undefined, 'at')).toEqual({ kind: 'open', at: { part: RC, pin: 1 } });
    const w = doc.wires.find((x) => x.points.some((p) => p.x === 44 && p.y === 0))!;
    expect(faultFromPlace({ wire: w.id }, { x: 44, y: -0.5 }, doc, undefined, 'at')).toEqual({ kind: 'open', at: { wire: w.id, end: 1 } });
    const short = { kind: 'short' as const, at: { part: RC, pin: 0 }, to: { part: RC, pin: 1 } };
    expect(faultFromPlace({ wire: w.id }, { x: 44, y: -4 }, doc, short, 'to')).toEqual({ ...short, to: { wire: w.id, end: 0 } });
  });
});

describe('Hazır senaryolar (8. aşama): açıklamadaki sayılar simülatörde', () => {
  /** Multimetre (10 MΩ) iki nokta arasında; devredeki ölçü aletlerinin okumaları da. */
  function measure(ex: ExampleId, faults: readonly Fault[], a: string, b: string, t: number, op = false) {
    const doc = exampleDoc(ex)!;
    const netlist = buildConnectivity(doc, faults).netlist;
    const withMeter = { ...netlist, elements: [...netlist.elements, { id: 'olcum', type: 'voltmeter' as const, props: { mode: 'dc', resistance: 10e6 }, pins: [a, b] }] };
    const sim = new CircuitSimulator(op ? atOperatingPoint(withMeter) : withMeter);
    expect(sim.runUntil(t).ok).toBe(true);
    const meters = Object.fromEntries(doc.parts.filter((p) => p.type === 'voltmeter' || p.type === 'ammeter').map((p) => [p.label, reading(sim, p.id)]));
    return { mm: reading(sim, 'olcum'), ...meters } as Record<string, number>;
  }
  const s = Object.fromEntries(FAULT_SCENARIOS.map((x) => [x.id, x]));
  const pin = (ex: ExampleId, label: string, n: number) => pinKey(partId(exampleDoc(ex)!, label), n);

  it('her senaryonun metni var, görevi geçerli (belgeyle uyumlu arıza, belirti, kimlik)', () => {
    expect(Object.keys(tr.fault.scenarios).sort()).toEqual(FAULT_SCENARIOS.map((x) => x.id).sort());
    for (const x of FAULT_SCENARIOS) {
      const { doc, task } = scenarioTask(x.id)!;
      expect(task.fault!.faults.every((f) => faultValid(f, doc))).toBe(true);
      expect(task.fault!.scenario).toBe(x.id);
      expect(task.fault!.symptom.length).toBeGreaterThan(10);
    }
  });

  it('LED yanmış: anot 5,00 V (sağlam 1,78 V), R1 iki ucu 0 V (sağlam 3,2 V)', () => {
    const ex = 'led-on-direnc';
    const f = s['ariza-led']!.faults;
    const g = pin(ex, 'GND1', 0);
    expect(measure(ex, f, pin(ex, 'LED1', 0), g, 0.05).mm).toBeCloseTo(5.0, 2);
    expect(measure(ex, [], pin(ex, 'LED1', 0), g, 0.05).mm).toBeCloseTo(1.78, 2);
    expect(Math.abs(measure(ex, f, pin(ex, 'R1', 0), pin(ex, 'R1', 1), 0.05).mm)).toBeLessThan(1e-6);
    expect(measure(ex, [], pin(ex, 'R1', 0), pin(ex, 'R1', 1), 0.05).mm).toBeCloseTo(3.2, 1);
  });

  it('diyot ters: diyodun uçları 5,00 V (sağlam 0,56 V), R1’in uçlarındaki V1 0,1 mV (sağlam 4,44 V)', () => {
    const ex = 'diyot-dc';
    const f = s['ariza-diyot']!.faults;
    const d1 = [pin(ex, 'D1', 0), pin(ex, 'D1', 1)] as const;
    const r1 = [pin(ex, 'R1', 0), pin(ex, 'R1', 1)] as const;
    expect(measure(ex, f, ...d1, 0.05).mm).toBeCloseTo(5.0, 2);
    expect(measure(ex, [], ...d1, 0.05).mm).toBeCloseTo(0.56, 2);
    expect(measure(ex, f, ...r1, 0.05).V1 * 1000).toBeCloseTo(0.1, 1);
    expect(measure(ex, [], ...r1, 0.05).V1).toBeCloseTo(4.44, 2);
  });

  it('köprüde D2 anot kopuk: R_L ortalaması 1,43 V (sağlam 2,62 V); anot bacağı −0,63 V, bağlı olduğu düğüm 0 V', () => {
    const ex = 'kopru-dogrultmac';
    const f = s['ariza-dogrultucu']!.faults;
    const rl = [pin(ex, 'RL', 0), pin(ex, 'RL', 1)] as const;
    expect(measure(ex, f, ...rl, 0.2).mm).toBeCloseTo(1.43, 2);
    expect(measure(ex, [], ...rl, 0.2).mm).toBeCloseTo(2.62, 2);
    const g = pin(ex, 'GND1', 0);
    expect(measure(ex, f, pin(ex, 'D2', 0), g, 0.2).mm).toBeCloseTo(-0.63, 2);
    // D2'nin anodu köprünün alt ucunda (B): D3'ün katoduyla aynı kablo.
    const node = exampleDoc(ex)!.wires.find((w) => w.points.some((p) => p.x === 28 && p.y === 6))!;
    expect(Math.abs(measure(ex, f, wireKey(node.id), g, 0.2).mm)).toBeLessThan(1e-6);
  });

  it('JFET source kopuk: A1 ≈ 1 µA (sağlam 4,1 mA), V1 10,0 V; source bacağı 1,73 V (V_P = −1,74 V)', () => {
    const ex = 'jfet-karakteristik';
    const f = s['ariza-jfet']!.faults;
    const g = pin(ex, 'GND1', 0);
    const healthy = measure(ex, [], pin(ex, 'J1', 0), g, 0.05);
    expect(healthy.A1! * 1000).toBeCloseTo(4.1, 1);
    const faulty = measure(ex, f, pin(ex, 'J1', 0), g, 0.05);
    expect(faulty.V1).toBeCloseTo(10.0, 2);
    expect(faulty.A1!).toBeLessThan(2.5e-6);
    expect(measure(ex, f, pin(ex, 'J1', 2), g, 0.05).mm).toBeCloseTo(1.73, 2);
  });

  it('BJT (Şekil-18): RC kopuk; kollektör 6,3 mV (sağlam 6,05 V), RC ucu 12,00 V, baz 0,60 V (sağlam 0,68 V)', () => {
    const ex = 'bjt-yukseltec';
    const f = s['ariza-bjt']!.faults;
    const g = pin(ex, 'GND1', 0);
    // Kollektörden R_C'ye giden kablo (osiloskobun B kablosu (44, −14)'te ayrılır).
    const w = exampleDoc(ex)!.wires.find((x) => x.points.some((p) => p.x === 44 && p.y === -14))!;
    expect(measure(ex, f, wireKey(w.id), g, 0.2, true).mm * 1000).toBeCloseTo(6.3, 1);
    expect(measure(ex, [], wireKey(w.id), g, 0.2, true).mm).toBeCloseTo(6.05, 1);
    expect(measure(ex, f, pin(ex, 'RC', 1), g, 0.2, true).mm).toBeCloseTo(12.0, 2);
    expect(measure(ex, f, pin(ex, 'Q1', 1), g, 0.2, true).mm).toBeCloseTo(0.6, 2);
    expect(measure(ex, [], pin(ex, 'Q1', 1), g, 0.2, true).mm).toBeCloseTo(0.68, 2);
  });
});

describe('3B’de gözle görülen arızalar (karar 1)', () => {
  it('ters takılmış parça 180° döner, yanlış değerli direncin değeri (renk bantları) değişir, yanmış LED yanık; kopuk bağlantı görünmez', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const led = doc.parts.find((p) => p.label === 'LED1')!;
    const r1 = doc.parts.find((p) => p.label === 'R1')!;
    expect(faultedLook(doc, [{ kind: 'open', at: { part: r1.id, pin: 0 } }])).toBe(doc);
    const look = faultedLook(doc, [{ kind: 'reversed', part: led.id }, { kind: 'value', part: r1.id, value: 3300 }]);
    expect(look.parts.find((p) => p.id === led.id)!.rotation).toBe((led.rotation + 180) % 360);
    expect(look.parts.find((p) => p.id === r1.id)!.props.resistance).toBe(3300);
    expect(faultedLook(doc, [{ kind: 'burnt', part: led.id }]).parts.find((p) => p.id === led.id)!.props[BURNT_PROP]).toBe(true);
    // Uçlar aynı noktalarda kalır (kablolar yerinde).
    const before = pinPositions(led).map((p) => `${p.x},${p.y}`).sort();
    const after = pinPositions(look.parts.find((p) => p.id === led.id)!).map((p) => `${p.x},${p.y}`).sort();
    expect(after).toEqual(before);
  });
});

describe('Arıza bulmada ampermetre (hoca izin verdiyse)', () => {
  const base: TaskDef = { name: 'Arıza', instruction: '', editable: [], allowNew: true, targets: [], predict: false };
  const tools = { voltage: true, resistance: true, scope: true, ammeter: true };
  const withAmmeter: TaskDef = { ...base, fault: { symptom: '', faults: [], tools, hideIndicators: true, askExpected: false } };
  const noAmmeter: TaskDef = { ...base, allowNew: false, fault: { symptom: '', faults: [], tools: { ...tools, ammeter: false }, hideIndicators: true, askExpected: false } };
  const none = { before: [], after: [] };
  const plug = (doc: CircuitDoc, wire: string, at: { x: number; y: number }) => {
    const r = insertAmmeter(doc, wire, at);
    if ('error' in r) throw new Error(r.error);
    return r;
  };
  /** Ampermetrenin tuvalde kapladığı yer: gövde, ekran ve ad (gösterge yanı kayıttan). */
  const footprint = (doc: CircuitDoc, meter: InsertedMeter) => {
    const part = doc.parts.find((p) => p.id === meter.part)!;
    const flip = meter.flip ?? meterFlipped(part, doc.parts.filter((p) => p.id !== meter.part).map((p) => partBounds(p)));
    return [partBounds(part), meterDisplayRect(part, flip), ...partTextBoxes(part, flip)];
  };
  /** Ucu bu noktada biten kablo. */
  const wireAt = (doc: CircuitDoc, x: number, y: number) => doc.wires.find((w) => [w.points[0]!, w.points.at(-1)!].some((q) => q.x === x && q.y === y))!.id;
  /** Kutular gerçekten kesişiyor (kenara değmek sayılmaz). */
  const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    boxesIntersect(a, b) && Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-9 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-9;
  const longWire = (doc: CircuitDoc) => doc.wires.find((x) => x.points.length === 2 && Math.abs(x.points[1]!.x - x.points[0]!.x) + Math.abs(x.points[1]!.y - x.points[0]!.y) >= 10) ?? doc.wires[0]!;

  it('eklenebilen tür: arıza bulmada yalnızca ampermetre (izin varsa); hedefli görevde "Yeni parça eklenebilir"e göre hepsi', () => {
    expect(canAddType(withAmmeter, 'ammeter')).toBe(true);
    expect(canAddType(withAmmeter, 'resistor')).toBe(false);
    expect(canAddType(noAmmeter, 'ammeter')).toBe(false);
    expect(canAddType(base, 'resistor')).toBe(true);
    expect(canAddType({ ...base, allowNew: false }, 'resistor')).toBe(false);
  });

  it('bekçi (ekleme işlevinin kendisi): panelden, yapıştırmayla ya da sürükle-bırakla gelen parça reddedilir; ampermetre yalnızca kabloya takılarak', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const resistor = addPart(doc, 'resistor', { x: 40, y: 20 }, 0).doc;
    const loose = addPart(doc, 'ammeter', { x: 40, y: 20 }, 0).doc;
    const pasted = addPart(loose, 'resistor', { x: 60, y: 20 }, 0).doc;
    expect(respectsTask(doc, resistor, withAmmeter, none)).toBe(false);
    expect(respectsTask(doc, loose, withAmmeter, none)).toBe(false);
    expect(respectsTask(doc, pasted, withAmmeter, none)).toBe(false);
    const w = longWire(doc);
    const r = plug(doc, w.id, w.points[0]!);
    expect(respectsTask(doc, r.doc, withAmmeter, { before: [], after: [r.meter] })).toBe(true);
    expect(respectsTask(doc, r.doc, noAmmeter, { before: [], after: [r.meter] })).toBe(false);
    // Kaydı olmayan (takılmamış) ampermetreyle aynı belge: reddedilir.
    expect(respectsTask(doc, r.doc, withAmmeter, none)).toBe(false);
    // Hedefli görevde (yeni parça eklenebilir) davranış değişmedi.
    expect(respectsTask(doc, resistor, base)).toBe(true);
  });

  it("elle kablo reddedilir (\"Yeni parça eklenebilir\" açık olsa da): kopuk bacağın yanına çekilen kablo, PS1'in boştaki 2+ ucundan çekilen kablo, kablo silme ve taşıma", () => {
    const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
    const task: TaskDef = { ...withAmmeter, fault: { ...withAmmeter.fault!, faults: [{ kind: 'open', at: { part: partId(doc, 'RC'), pin: 1 } }] } };
    // RC'nin kopuk bacağı (44, -4) ile kollektör düğümü arasına yandan kablo.
    const bypass = addWire(doc, [{ x: 44, y: -4 }, { x: 47, y: -4 }, { x: 47, y: -2 }, { x: 44, y: -2 }]).doc;
    expect(bypass.wires.length).toBe(doc.wires.length + 1);
    expect(respectsTask(doc, bypass, task, none)).toBe(false);
    const ps1 = doc.parts.find((p) => p.label === 'PS1')!;
    const plus2 = pinPositions(ps1)[2]!;
    const fromPs = addWire(doc, [plus2, { x: plus2.x, y: -16 }]).doc;
    expect(fromPs.wires.length).toBe(doc.wires.length + 1);
    expect(respectsTask(doc, fromPs, task, none)).toBe(false);
    expect(respectsTask(doc, removeItems(doc, [], [doc.wires[2]!.id]), task, none)).toBe(false);
    const w11 = doc.wires.find((w) => w.points[0]!.x === 44 && w.points[0]!.y === -2)!;
    expect(respectsTask(doc, replaceWirePoints(doc, w11.id, w11.points.map((q) => ({ x: q.x, y: q.y - 1 }))), task, none)).toBe(false);
    // Takılı ampermetrenin ucuna sonradan çekilen kablo da reddedilir (bölünmeden doğmadı).
    const r = plug(doc, w11.id, { x: 50, y: -2 });
    expect(respectsTask(doc, r.doc, task, { before: [], after: [r.meter] })).toBe(true);
    const pin = pinPositions(r.doc.parts.find((p) => p.id === r.meter.part)!)[0]!;
    const extra = addWire(r.doc, [pin, { x: pin.x, y: 4 }]).doc;
    expect(respectsTask(r.doc, extra, task, { before: [r.meter], after: [r.meter] })).toBe(false);
  });

  it('takılı ampermetre: yeri değişmez (taşıma, döndürme reddedilir), kaldırılınca kablo eski hâline döner; devrenin kendi ampermetresi silinemez', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const w = longWire(doc);
    const r = plug(doc, w.id, w.points[0]!);
    const m = { before: [r.meter], after: [r.meter] };
    const moved = { ...r.doc, parts: r.doc.parts.map((p) => (p.id === r.meter.part ? { ...p, x: p.x + 2 } : p)) };
    expect(respectsTask(r.doc, moved, withAmmeter, m)).toBe(false);
    const turned = { ...r.doc, parts: r.doc.parts.map((p) => (p.id === r.meter.part ? { ...p, rotation: (p.rotation === 90 ? 0 : 90) as 0 | 90 } : p)) };
    expect(respectsTask(r.doc, turned, withAmmeter, m)).toBe(false);
    const swapped = { ...r.doc, parts: r.doc.parts.map((p) => (p.id === r.meter.part ? { ...p, type: 'resistor' as const } : p)) };
    expect(respectsTask(r.doc, swapped, withAmmeter, m)).toBe(false);
    // Ayarı (DC/AC) değişebilir.
    const ac = { ...r.doc, parts: r.doc.parts.map((p) => (p.id === r.meter.part ? { ...p, props: { ...p.props, mode: 'ac' } } : p)) };
    expect(respectsTask(r.doc, ac, withAmmeter, m)).toBe(true);
    // Kaldırma (Sil): bekçinin önünde kablo eski hâline getirilir.
    const deleted = removeItems(r.doc, [r.meter.part], []);
    expect(removedMeters(r.doc, deleted, [r.meter])).toEqual([r.meter]);
    expect(respectsTask(r.doc, unplugAll(deleted, [r.meter]), withAmmeter, { before: [r.meter], after: [] })).toBe(true);
    expect(respectsTask(r.doc, deleted, withAmmeter, { before: [r.meter], after: [] })).toBe(false);
    const a1 = doc.parts.find((p) => p.label === 'A1')!.id;
    expect(respectsTask(r.doc, removeItems(r.doc, [a1], []), withAmmeter, m)).toBe(false);
    // Geri al: ampermetresiz belgede kayıt takılı sayılmaz.
    expect(meterIntact(r.doc, r.meter)).toBe(true);
    expect(meterIntact(doc, r.meter)).toBe(false);
  });

  it('A1 tıklanan yerde kablonun üstünde, kablonun yönünde oturur; kollektör → OSC1 B kablosunda OSC1 A kablosuna ve RC yazısına binmez', () => {
    const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
    const w11 = doc.wires.find((w) => w.points[0]!.x === 44 && w.points[0]!.y === -2)!;
    const w10 = doc.wires.find((w) => w.points.at(-1)!.x === 58 && w.points.at(-1)!.y === -4)!;
    for (const x of [46, 50, 54, 57]) {
      const r = plug(doc, w11.id, { x, y: -2 });
      const a = r.doc.parts.find((p) => p.id === r.meter.part)!;
      // Kablonun üstünde: yatay, uçları kablo üzerinde; kablo iki yarıya bölündü (bağlantı kablosu yok).
      expect(a.rotation).toBe(0);
      expect(a.y).toBe(-2);
      expect(r.meter.links).toEqual([]);
      expect(r.doc.wires.length).toBe(doc.wires.length + 1);
      const [p0, p1] = pinPositions(a);
      expect(r.doc.wires.find((w) => w.id === w11.id)!.points.at(-1)).toEqual(p0);
      expect(r.doc.wires.find((w) => w.id === r.meter.half)!.points[0]).toEqual(p1);
      // Gövde, ekran ve ad: başka parça, yazı ya da kablo yok.
      const own = footprint(r.doc, r.meter);
      for (const p of doc.parts) for (const box of [partBounds(p), ...partTextBoxes(p, false)]) expect(own.some((b) => overlaps(b, box))).toBe(false);
      for (let i = 1; i < w10.points.length; i++) {
        const [q0, q1] = [w10.points[i - 1]!, w10.points[i]!];
        expect(own.some((b) => Math.max(q0.x, q1.x) > b.x && Math.min(q0.x, q1.x) < b.x + b.w && Math.max(q0.y, q1.y) > b.y && Math.min(q0.y, q1.y) < b.y + b.h)).toBe(false);
      }
    }
  });

  /** Emiter kablosu: Q1'in emiterinden toprağa (kısa, 8 birim). */
  const emitterWire = (doc: CircuitDoc) => doc.wires.find((x) => x.points[0]!.x === 44 && x.points[0]!.y === 8)!;

  it('"Buraya ampermetre tak": kısa kablo parçasında (emiter kablosu) yanına konur, iki bağlantı kablosu; emiter akımını ölçer (≈ kollektör akımı), devre değişmez; kaldırınca kablo eski hâline döner', () => {
    const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
    const w = emitterWire(doc);
    const r = plug(doc, w.id, { x: 44, y: 12 });
    expect(r.doc.parts.find((p) => p.id === r.meter.part)!.type).toBe('ammeter');
    expect(r.meter.links.length).toBe(2);
    expect(r.doc.wires.length).toBe(doc.wires.length + 3);
    expect(respectsTask(doc, r.doc, withAmmeter, { before: [], after: [r.meter] })).toBe(true);
    const sim = new CircuitSimulator(atOperatingPoint(buildConnectivity(r.doc).netlist));
    sim.runUntil(0.2);
    expect(Math.abs(reading(sim, r.meter.part)) * 1000).toBeCloseTo(1.08, 1);
    expect(reading(run(r.doc, [], pinKey(partId(doc, 'Q1'), 0)), 'olcum')).toBeCloseTo(5.99, 1);
    expect(removeAmmeter(r.doc, r.meter)).toEqual(doc);
    expect(unplugAll(removeItems(r.doc, [r.meter.part], []), [r.meter])).toEqual(doc);
  });

  it('kablo ucundaki arıza ikinci yarıya taşınır; kopuk emiter bacağında ampermetre sıfıra yakın akım gösterir; kayıt saklanıp geri okunur', () => {
    const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
    const w = emitterWire(doc);
    const r = plug(doc, w.id, { x: 44, y: 12 });
    expect(remapFaults([{ kind: 'open', at: { wire: w.id, end: 1 } }], [r.meter])).toEqual([{ kind: 'open', at: { wire: r.meter.half, end: 1 } }]);
    expect(remapFaults([{ kind: 'open', at: { wire: w.id, end: 0 } }], [r.meter])).toEqual([{ kind: 'open', at: { wire: w.id, end: 0 } }]);
    const q1 = doc.parts.find((p) => p.label === 'Q1')!;
    const emitter = pinPositions(q1).findIndex((q) => q.x === 44 && q.y === 8);
    expect(emitter).toBeGreaterThanOrEqual(0);
    const sim = new CircuitSimulator(atOperatingPoint(buildConnectivity(r.doc, [{ kind: 'open', at: { part: q1.id, pin: emitter } }]).netlist));
    sim.runUntil(0.2);
    expect(Math.abs(reading(sim, r.meter.part))).toBeLessThan(1e-6);
    const saved: readonly InsertedMeter[] = parseSession(JSON.parse(JSON.stringify({ ...NEW_SESSION, meters: [r.meter] }))).meters;
    expect(saved).toEqual([r.meter]);
    // Kollektör kablosu (RC ile Q1 arası, OSC1 B'ye T): ampermetreye çakışmasız yer yok, takılmaz.
    const w3 = doc.wires.find((x) => x.points.some((p) => p.x === 44 && p.y === 0))!;
    expect(insertAmmeter(doc, w3.id, { x: 44, y: -3 })).toEqual({ error: 'crowded' });
    // Çok kısa kablo parçası: takılmaz.
    const short = doc.wires.find((x) => x.points.length === 2 && Math.abs(x.points[0]!.x - x.points[1]!.x) + Math.abs(x.points[0]!.y - x.points[1]!.y) < 3);
    if (short) expect(insertAmmeter(doc, short.id, short.points[0]!)).toEqual({ error: 'short' });
  });

  it('üst rayda RB bağlantısının sağı: ampermetre bağlantıyla köşe arasında kablonun üstünde, göstergesi altta (üstte OSC1 A kablosu); solunda bağlantının solunda kalır; tam bağlantıda takılmaz', () => {
    const doc = exampleDoc('bjt-yukseltec-kuplajli')!;
    const w1 = doc.wires.find((x) => x.points.at(-1)!.x === 44 && x.points.at(-1)!.y === -12)!;
    // Eskiden şemanın en üstüne gidip OSC1 A kablosunu kesiyordu.
    const right = plug(doc, w1.id, { x: 39, y: -16 });
    expect([right.meter.x, right.meter.y, right.meter.rotation, right.meter.links.length, right.meter.flip]).toEqual([40, -16, 0, 0, true]);
    // RB'nin bağlandığı nokta (36, -16): solunda RB ile RC'nin toplamı akar; ampermetre dokunulan yanda kalır.
    const left = plug(doc, w1.id, { x: 34, y: -16 });
    expect(left.meter.made[0]!.points.at(-1)!.x).toBeLessThanOrEqual(36);
    expect(left.meter.made[1]!.points[0]!.x).toBeLessThanOrEqual(36);
    // Tam bağlantının üstünde: hangi kol olduğu belirsiz, takılmaz.
    expect(insertAmmeter(doc, w1.id, { x: 36, y: -16 })).toEqual({ error: 'junction' });
    // RC'nin hemen üstündeki dikey parça (4 birim): yanda da yer yok (sağda OSC1 A, solda RB kablosu).
    expect(insertAmmeter(doc, w1.id, { x: 44, y: -14 })).toEqual({ error: 'crowded' });
  });

  it('kollektör (drain) akımı o koldaki en az bir kablodan ölçülür; okunan değer simülasyondaki kollektör (drain) akımıyla aynı (bjt-yukseltec-kuplajli, bjt-anahtar, fet-yukseltec-kuplajli, mosfet-yukseltec-rs)', () => {
    /** Koldaki kablolar (yalnızca kollektör ya da drain akımı geçen kısımları) ve transistör. */
    type Branch = { wire: (doc: CircuitDoc) => string; keep?: (at: { x: number; y: number }) => boolean };
    const branches: readonly { id: ExampleId; transistor: string; wires: readonly Branch[] }[] = [
      // Üst rayda RB'nin bağlandığı noktanın (36, -16) solundan RB akımı da geçer.
      { id: 'bjt-yukseltec-kuplajli', transistor: 'Q1', wires: [{ wire: (d) => wireAt(d, 44, -12), keep: (at) => (at.y === -16 && at.x > 36) || at.x === 44 }, { wire: (d) => wireAt(d, 44, 0) }] },
      // Şekil-24: LED kolu R2'nin ucunda ayrılır; R2'nin altından kollektöre giden kablodan yalnızca I_C geçer.
      { id: 'bjt-anahtar', transistor: 'Q1', wires: [{ wire: (d) => wireAt(d, 44, 8) }] },
      { id: 'fet-yukseltec-kuplajli', transistor: 'J1', wires: [{ wire: (d) => wireAt(d, 44, -12) }, { wire: (d) => wireAt(d, 44, 0) }] },
      { id: 'mosfet-yukseltec-rs', transistor: 'M1', wires: [{ wire: (d) => wireAt(d, 44, -12) }, { wire: (d) => wireAt(d, 44, 0) }] },
    ];
    for (const { id, transistor, wires } of branches) {
      const doc = exampleDoc(id)!;
      const sim = new CircuitSimulator(atOperatingPoint(buildConnectivity(doc).netlist));
      sim.runUntil(0.2);
      const t = doc.parts.find((p) => p.label === transistor)!;
      // Ampermetresiz devrede transistörün kollektör (drain) ucundan giren akım; fonksiyon üreteci
      // çalışırken ampermetre gibi bir periyodun ortalaması (BJT'de üstel eğri ortalamayı büyütür).
      const collector = Math.abs(sim.averagePinCurrents(t.id)![0]!);
      let measured = 0;
      const seen = new Set<string>();
      for (const { wire, keep } of wires) {
        const w = doc.wires.find((x) => x.id === wire(doc))!;
        let simulated = 0;
        for (let i = 0; i + 1 < w.points.length; i++) {
          const [a, b] = [w.points[i]!, w.points[i + 1]!];
          const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          // Her noktaya dokunulur; aynı yer bir kez, kablo başına en çok üç yer simüle edilir.
          for (let k = 0; k <= len && simulated < 3; k++) {
            const at = { x: a.x + Math.sign(b.x - a.x) * k, y: a.y + Math.sign(b.y - a.y) * k };
            if (keep && !keep(at)) continue;
            const r = insertAmmeter(doc, w.id, at);
            if ('error' in r) continue;
            const key = `${r.meter.x},${r.meter.y},${r.meter.rotation},${JSON.stringify(r.meter.made[0]!.points.at(-1))}`;
            if (seen.has(key)) continue;
            seen.add(key);
            simulated++;
            const s2 = new CircuitSimulator(atOperatingPoint(buildConnectivity(r.doc).netlist));
            s2.runUntil(0.2);
            // Pencerelerin denk gelişinden kalan fark binde 2'den az.
            expect(Math.abs(Math.abs(reading(s2, r.meter.part)) / collector - 1), `${id} ${w.id} ${at.x},${at.y}`).toBeLessThan(2e-3);
            measured++;
          }
        }
      }
      expect(measured, id).toBeGreaterThan(0);
    }
  }, 20_000);

  it('bütün örneklerde: ampermetre kablonun üstünde ya da en çok 3 birim yanında; bağlantı kabloları kabloları yalnızca dik keser, bağlantı noktasından geçmez; gösterge kablo üstüne binmez; boşlukla dokunulan nokta arasında bağlantı yok', () => {
    type Pt = { readonly x: number; readonly y: number };
    type Seg = readonly [Pt, Pt];
    const segs = (pts: readonly Pt[]): Seg[] => pts.slice(1).map((q, i) => [pts[i]!, q] as const);
    const between = (p: number, a: number, b: number) => p > Math.min(a, b) && p < Math.max(a, b);
    /** Aynı doğru üstünde ortak uzunluk (dik kesişme serbest). */
    const alongside = ([a, b]: Seg, [c, d]: Seg) => {
      const sv = a.x === b.x;
      if (sv !== (c.x === d.x) || (sv ? a.x !== c.x : a.y !== c.y)) return false;
      const [s0, s1] = sv ? [Math.min(a.y, b.y), Math.max(a.y, b.y)] : [Math.min(a.x, b.x), Math.max(a.x, b.x)];
      const [o0, o1] = sv ? [Math.min(c.y, d.y), Math.max(c.y, d.y)] : [Math.min(c.x, d.x), Math.max(c.x, d.x)];
      return Math.min(s1, o1) - Math.max(s0, o0) > 1e-9;
    };
    const interior = (q: Pt, [a, b]: Seg) => (a.x === b.x ? q.x === a.x && between(q.y, a.y, b.y) : q.y === a.y && between(q.x, a.x, b.x));
    /** Kablo parçası kutunun içinden geçiyor (kenara değmek sayılmaz). */
    const through = ([a, b]: Seg, r: { x: number; y: number; w: number; h: number }) =>
      a.x === b.x
        ? a.x > r.x && a.x < r.x + r.w && Math.min(Math.max(a.y, b.y), r.y + r.h) - Math.max(Math.min(a.y, b.y), r.y) > 1e-9
        : a.y > r.y && a.y < r.y + r.h && Math.min(Math.max(a.x, b.x), r.x + r.w) - Math.max(Math.min(a.x, b.x), r.x) > 1e-9;
    let placed = 0;
    let beside = 0;
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const ends = [...doc.wires.flatMap((w) => [w.points[0]!, w.points.at(-1)!].map((q) => ({ q, owner: w.id }))), ...doc.parts.flatMap((p) => pinPositions(p).map((q) => ({ q, owner: '' })))];
      const corners = doc.wires.flatMap((w) => w.points.slice(1, -1));
      for (const w of doc.wires) {
        segs(w.points).forEach(([a, b], i) => {
          if (a.x !== b.x && a.y !== b.y) return;
          const at = { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
          const r = insertAmmeter(doc, w.id, at);
          if ('error' in r) return;
          placed++;
          const where = `${id} ${w.id}#${i}`;
          const links = new Set(r.meter.links);
          const part = r.doc.parts.find((p) => p.id === r.meter.part)!;
          const vertical = a.x === b.x;
          // Kablodan uzaklık: yakın ucu en çok 3 birim.
          const off = Math.min(...pinPositions(part).map((q) => Math.abs(vertical ? q.x - a.x : q.y - a.y)));
          expect(off, where).toBeLessThanOrEqual(3);
          if (links.size > 0) beside++;
          const linkSegs = r.meter.made.filter((m) => links.has(m.id)).flatMap((m) => segs(m.points));
          const rest = r.doc.wires.filter((x) => !links.has(x.id)).flatMap((x) => segs(x.points));
          for (const l of linkSegs) {
            for (const o of rest) expect(alongside(l, o), where).toBe(false);
            for (const q of [...ends.map((e) => e.q), ...corners]) expect(interior(q, l), where).toBe(false);
          }
          // Gösterge kutusu hiçbir kablonun üstünde değil.
          const display = meterDisplayRect(part, r.meter.flip ?? false);
          for (const s of r.doc.wires.flatMap((x) => segs(x.points))) expect(through(s, display), where).toBe(false);
          // Boşluk (P1–P2) ile dokunulan nokta arasında bu kablo parçasına değen başka kablo ya da parça ucu yok.
          const P1 = r.meter.made[0]!.points.at(-1)!;
          const P2 = r.meter.made[1]!.points[0]!;
          const key = (q: Pt) => (vertical ? q.y : q.x);
          const lo = Math.min(key(at), key(P1), key(P2));
          const hi = Math.max(key(at), key(P1), key(P2));
          const inside = ends.filter(({ q, owner }) => owner !== w.id && (vertical ? q.x === a.x : q.y === a.y) && key(q) > lo && key(q) < hi && between(key(q), key(a), key(b)));
          expect(inside, where).toEqual([]);
        });
      }
    }
    expect(placed).toBeGreaterThan(100);
    expect(beside).toBeGreaterThan(10);
    // Bütün örnekleri (74) dolaşır: paralel testlerde 5 s'yi aşabilir.
  }, 30_000);
});

