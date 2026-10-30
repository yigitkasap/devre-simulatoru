// Analiz → Grafik (A1): kayıt sabit aralıkta örnek alır (kare örnek anlarında bölünür), izlerin
// değerleri tasarımın referans verisiyle (tests/veri/veri-rc-dolma.json, runUntil ile 5 ms'de bir)
// örtüşür; eksen bölmeleri, birimler ve CSV biçimi.

import { describe, expect, it } from 'vitest';
import { advanceRecorded, intervalForSpeed, niceInterval, TraceRecorder } from '../src/editor/analysis/recorder';
import { axisUnit, niceTicks, tickText, toCsv } from '../src/editor/analysis/format';
import { netIndex, nodeName, traceLabel } from '../src/editor/analysis/traces';
import { parseAnalysis, serializeAnalysis, type TraceDef } from '../src/model/analysis';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import type { CircuitDoc } from '../src/model/types';
import { exampleDoc } from '../src/examples';
import { CircuitSimulator } from '../src/sim';
import rc from './veri/veri-rc-dolma.json';

/** RC dolma örneği, S1 kapalı (referans veri böyle üretildi). */
function rcDoc(): CircuitDoc {
  const doc = exampleDoc('rc-dolma')!;
  return { ...doc, parts: doc.parts.map((p) => (p.type === 'switch' ? { ...p, props: { ...p.props, closed: true } } : p)) };
}

describe('Analiz: grafik kaydı', () => {
  const doc = rcDoc();
  const conn = buildConnectivity(doc);
  const c1 = doc.parts.find((p) => p.label === 'C1')!;
  const r1 = doc.parts.find((p) => p.label === 'R1')!;
  const vTrace: TraceDef = { id: 'v', color: 0, kind: 'voltage', node: pinKey(c1.id, 0), at: { x: 0, y: 0 }, ref: null, refAt: null };
  const iTrace: TraceDef = { id: 'i', color: 1, kind: 'current', part: r1.id };

  it('×1 hızda 5 ms aralık; kare bölünür, V(C1) ve I(R1) referans veriyle %0,1 içinde', () => {
    const sim = new CircuitSimulator(conn.netlist);
    const rec = new TraceRecorder();
    rec.setTraces([vTrace, iTrace]);
    rec.reset(0, 1, sim.hasAcSources);
    expect(rec.interval).toBe(0.005);
    for (let f = 0; f < 37; f++) expect(advanceRecorded(sim, 1 / 60, 6000, Number.POSITIVE_INFINITY, rec, []).result.ok).toBe(true);
    expect(rec.count).toBeGreaterThanOrEqual(120);
    // Örnekler 5 ms'nin katlarında (kare sınırlarında değil). Motor, arayüz ilerletmesinde kalan
    // küçük süreyi bir sonraki çağrıya taşır: örnek anı en çok 20 µs kayar.
    for (let i = 0; i < 10; i++) expect(Math.abs(rec.times[i]! - 0.005 * (i + 1))).toBeLessThan(2e-5);
    for (const [t, v, , iR] of rc as number[][]) {
      if (t! < rec.times[0]! || t! > rec.times[rec.count - 1]!) continue;
      expect(Math.abs(rec.valueAt('v', t!) - v!) / v!).toBeLessThan(1e-3);
      expect(Math.abs(rec.valueAt('i', t!) - iR!) / iR!).toBeLessThan(2e-3);
    }
    // İmleç 100 ms: 6,321 V ve 3,679 mA (N1).
    expect(rec.valueAt('v', 0.1)).toBeCloseTo(6.321, 2);
    expect(rec.valueAt('i', 0.1) * 1e3).toBeCloseTo(3.679, 2);
  });

  it('izlenen istatistikler bütün parçalardan birleştirilir; bellek dolunca aralık iki katına çıkar', () => {
    const sim = new CircuitSimulator(conn.netlist);
    sim.watch([c1.id]);
    const rec = new TraceRecorder();
    rec.setTraces([vTrace]);
    rec.reset(0, 1, false);
    const { stats } = advanceRecorded(sim, 1 / 60, 6000, Number.POSITIVE_INFINITY, rec, [c1.id]);
    const v = stats!.get(c1.id)!.get('m.voltage')!;
    // Karenin tamamı (≈ 16,7 ms): istatistiğin süresi son parçanınki (≈ 1,7 ms) değil.
    expect(v.time).toBeGreaterThan(0.015);
    expect(intervalForSpeed(0.1)).toBe(5e-4);
    expect(niceInterval(0.0042)).toBe(0.002);
  });

  it('AC kaynaklı devrede kare bölünmez (karede bir örnek)', () => {
    const ac = exampleDoc('yarim-dalga')!;
    const sim = new CircuitSimulator(buildConnectivity(ac).netlist);
    expect(sim.hasAcSources).toBe(true);
    const rec = new TraceRecorder();
    const part = ac.parts.find((p) => p.type === 'resistor')!;
    rec.setTraces([{ id: 'i', color: 0, kind: 'current', part: part.id }]);
    rec.reset(0, 1, sim.hasAcSources);
    for (let f = 0; f < 10; f++) advanceRecorded(sim, 1 / 60, 6000, Number.POSITIVE_INFINITY, rec, []);
    expect(rec.count).toBe(10);
  });

  it('iz adları: V(C1) (öbür ucu toprakta), I(R1), fark gerilimi', () => {
    const idx = netIndex(doc, conn);
    expect(traceLabel(vTrace, doc, idx)).toMatchObject({ name: 'V(C1)', detail: 'C1 gerilimi', unit: 'V' });
    expect(traceLabel(iTrace, doc, idx)).toMatchObject({ name: 'I(R1)', detail: 'R1 akımı', unit: 'A' });
    const diff = traceLabel({ ...vTrace, node: pinKey(r1.id, 0), ref: pinKey(c1.id, 0), refAt: { x: 0, y: 0 } }, doc, idx);
    expect(diff.name).toMatch(/^V\(.+, C1\)$/);
    const gnd = doc.parts.find((p) => p.type === 'ground')!;
    expect(nodeName(pinKey(gnd.id, 0), idx)).toBe('0');
  });

  it('analiz bölümü kaydedilip okunur; bozuk veri boş analize döner', () => {
    const a = { traces: [vTrace, iTrace], rows: [], labColumn: true, fit: null };
    expect(parseAnalysis(JSON.parse(JSON.stringify(serializeAnalysis(a))))).toEqual(a);
    expect(parseAnalysis('x')).toEqual({ traces: [], rows: [], labColumn: false, fit: null });
    expect(serializeAnalysis({ traces: [], rows: [], labColumn: false, fit: null })).toBeUndefined();
  });
});

describe('Analiz: eksen ve CSV', () => {
  it('bölmeler 1-2-5 dizisinde, yazılar ondalık virgüllü', () => {
    expect(niceTicks(0, 0.6, 6).ticks.map((v) => tickText(v, 0.1))).toEqual(['0,0', '0,1', '0,2', '0,3', '0,4', '0,5', '0,6']);
    expect(niceTicks(0, 9.97, 5).ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(axisUnit(0.0098, 'A')).toEqual({ scale: 1000, unit: 'mA' });
    expect(axisUnit(0.6, 's')).toEqual({ scale: 1, unit: 's' });
    expect(axisUnit(0.05, 's')).toEqual({ scale: 1000, unit: 'ms' });
  });

  it('CSV: noktalı virgülde ondalık virgül, virgülde nokta; tırnaklanan hücreler', () => {
    expect(toCsv(['t (s)', 'V(C1) (V)'], [[0.1, 6.3209]], ';')).toBe('﻿t (s);V(C1) (V)\r\n0,1;6,3209\r\n');
    expect(toCsv(['a', 'b'], [[0.5, 'x,y']], ',')).toBe('﻿a,b\r\n0.5,"x,y"\r\n');
  });
});
