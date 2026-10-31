// Arıza bulma (B2), 1. aşama: arıza netlist kurulurken uygulanır, şema ve motor değişmez.
// Örnek senaryo (docs/tasarim-v3 "Arıza bulma"): BC107 yükselteçte RC'nin kollektör tarafındaki bacağı
// kopuk → VC ≈ 0,01 V, VB ≈ 0,55 V, Q1 doyumda; kopuk uçta 10 MΩ'lık ölçüm 12 V × 10 MΩ / (10 MΩ +
// 5,6 kΩ) ≈ 11,99 V.

import { describe, expect, it } from 'vitest';
import { atOperatingPoint } from '../src/editor/analysis/bode';
import { exampleDoc, type ExampleId } from '../src/examples';
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
  const doc = exampleDoc('bjt-yukseltec')!;
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
  const doc = exampleDoc('bjt-yukseltec')!;
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
  const doc = exampleDoc('bjt-yukseltec')!;
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
  const doc = exampleDoc('bjt-yukseltec')!;
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
  const doc = exampleDoc('bjt-yukseltec')!;
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

