// Baraj sayfasının seviye mantığı: bantlar, hedefler ve devre panelinin katları (gerçek simülasyonla:
// ıslaklık, transistör bölgesi, dal akımları, tek ışıkta susturma).

import { describe, expect, it } from 'vitest';
import { currentText, loopChain } from '../src/baraj/DevrePaneli';
import {
  bandOf,
  carries,
  circuitClosed,
  flowToward,
  katDevreleri,
  milliamps,
  stopAbove,
  stopBelow,
  STOP_TARGETS,
  targetReached,
  type FrameData,
} from '../src/baraj/seviye';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import type { DeviceStatus } from '../src/sim/devices';

function load(id: ExampleId, tank: Record<string, number | string>): CircuitDoc {
  const doc = exampleDoc(id)!;
  const h1 = doc.parts.find((p) => p.type === 'tank')!;
  return updatePart(doc, h1.id, { props: { ...h1.props, ...tank } });
}
const simOf = (doc: CircuitDoc) => new CircuitSimulator(buildConnectivity(doc).netlist, { timeStep: 2e-3 });
function frameOf(sim: CircuitSimulator, doc: CircuitDoc): FrameData {
  const statuses = new Map<string, DeviceStatus>();
  const live = new Map<string, { brightness?: number }>();
  const pinFlows = new Map<string, readonly number[]>();
  for (const part of doc.parts) {
    if (!sim.measure(part.id)) continue;
    const status = sim.status(part.id);
    statuses.set(part.id, status);
    const pins = sim.pinCurrents(part.id);
    if (pins) pinFlows.set(part.id, pins);
    if (part.type === 'led') live.set(part.id, { brightness: status.brightness ?? 0 });
  }
  return { statuses, live, pinFlows };
}
const wetOf = (sim: CircuitSimulator, doc: CircuitDoc) => sim.status(doc.parts.find((p) => p.type === 'tank')!.id).wetProbes ?? [];

describe('Baraj sayfası: seviye mantığı', () => {
  it('bant, prob yüksekliği geçilince artar; sunum kumandası bir üst / alt seviyeye gider', () => {
    expect([0, 37.4, 37.5, 62.5, 87.4, 87.5, 100].map(bandOf)).toEqual([0, 0, 1, 2, 2, 3, 3]);
    expect(STOP_TARGETS).toEqual({ 0: 25, 1: 50, 2: 75, 3: 95 });
    expect([20, 50, 58, 75, 95].map(stopAbove)).toEqual([1, 2, 2, 3, null]);
    expect([20, 50, 58, 75, 95].map(stopBelow)).toEqual([null, 0, 0, 1, 2]);
  });

  it('hedefe akış ve hedefi geçince durma', () => {
    expect(flowToward(20, 50)).toBe('fill');
    expect(flowToward(80, 50)).toBe('drain');
    expect(flowToward(50.3, 50)).toBe('stop');
    expect(targetReached(49.9, 50, 'fill')).toBe(false);
    expect(targetReached(50.01, 50, 'fill')).toBe(true);
    expect(targetReached(50.2, 50, 'drain')).toBe(false);
    expect(targetReached(49.99, 50, 'drain')).toBe(true);
  });

  it('akım yazısı: 10 mA ve üstü bir ondalık, altı iki ondalık; 5 µA altı 0', () => {
    expect(milliamps(14.46e-3)).toEqual({ value: 14.46, decimals: 1 });
    expect(milliamps(0.43e-3).decimals).toBe(2);
    expect(milliamps(1e-6)).toEqual({ value: 0, decimals: 0 });
    expect([14.46e-3, 0.4321e-3, 1e-6, null].map(currentText)).toEqual(['≈ 14,5 mA', '≈ 0,43 mA', '0 mA', '—']);
  });

  it('çubuk gösterge %50: Kat 1 ıslak, Q1 doyumda, akım yolu probdan LED’e; üstteki katlar açık', () => {
    const doc = load('baraj-cubuk', { level: 50, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const [k1, k2, k3] = katDevreleri(doc, frameOf(sim, doc), wetOf(sim, doc));
    expect([k1, k2, k3].map((k) => [k!.level, k!.wet, k!.region, k!.silencer])).toEqual([
      [1, true, 'saturation', null],
      [2, false, 'cutoff', null],
      [3, false, 'cutoff', null],
    ]);
    expect(k1!.labels).toEqual({ rb: 'RB1', c: 'C1', rp: 'RP1', q: 'Q1', rc: 'RC1', led: 'LED1' });
    expect(k1!.values).toEqual({ rb: 10e3, c: 10e-6, rp: 100e3, rc: 470 });
    const c = k1!.currents!;
    expect(c.base).toBeGreaterThan(0.3e-3);
    expect(c.base).toBeLessThan(0.6e-3);
    expect(c.led).toBeGreaterThan(14e-3);
    expect(c.emitter).toBeCloseTo(c.base + c.collector, 6);
    expect(carries(c.capacitor)).toBe(false);
    expect(k1!.baseVoltage!).toBeGreaterThan(0.5);
    expect(circuitClosed(k1!)).toBe(true);
    expect(loopChain(k1!, 'B1')).toEqual(['B1 +', 'ortak prob', 'su', 'Prob 1', 'RB1', 'Q1', 'toprak', 'B1 −']);
    for (const k of [k2!, k3!]) {
      expect(circuitClosed(k)).toBe(false);
      expect(carries(k.currents!.led)).toBe(false);
    }
  });

  it('çubuk gösterge: su probun altına inince prob yolu kesiliyor, bazı bir süre kondansatör besliyor', () => {
    let doc = load('baraj-cubuk', { level: 50, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const h1 = doc.parts.find((p) => p.type === 'tank')!;
    doc = updatePart(doc, h1.id, { props: { ...h1.props, level: 30 } });
    sim.update(buildConnectivity(doc).netlist);
    sim.runUntil(2.04);
    const k1 = katDevreleri(doc, frameOf(sim, doc), wetOf(sim, doc))[0]!;
    expect(k1.wet).toBe(false);
    expect(k1.region).not.toBe('cutoff');
    expect(circuitClosed(k1)).toBe(false);
    expect(carries(k1.currents!.capacitor)).toBe(true);
    expect(carries(k1.currents!.base)).toBe(true);
  });

  it('tek ışık %75: Q4 Kat 1’i susturuyor (baz ≈ 0 V, akım Q4’ten toprağa); Kat 2 yanıyor', () => {
    const doc = load('baraj-tek-isik', { level: 75, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const [k1, k2, k3] = katDevreleri(doc, frameOf(sim, doc), wetOf(sim, doc));
    expect(k1!.silencer).toMatchObject({ label: 'Q4', resistor: 'RS4', resistance: 10e3, wet: true, region: 'saturation' });
    expect(k1!.silenced).toBe(true);
    expect(k1!.region).toBe('cutoff');
    expect(k1!.baseVoltage!).toBeLessThan(0.05);
    expect(carries(k1!.currents!.base)).toBe(false);
    expect(carries(k1!.currents!.led)).toBe(false);
    expect(carries(k1!.silencer!.currents!.collector)).toBe(true);
    expect(carries(k1!.silencer!.currents!.base)).toBe(true);
    expect(loopChain(k1!, 'B1')).toEqual(['B1 +', 'ortak prob', 'su', 'Prob 1', 'RB1', 'Q4', 'toprak', 'B1 −']);
    expect(k2!.silencer).toMatchObject({ label: 'Q5', wet: false, region: 'cutoff' });
    expect(k2!.silenced).toBe(false);
    expect(k2!.region).toBe('saturation');
    expect(k2!.currents!.led).toBeGreaterThan(14e-3);
    expect(k3!.silencer).toBeNull();
    expect(k3!.wet).toBe(false);
  });

  it('saf su (1 MΩ): su yüksek ama baz akımı çok küçük, LED’ler zor görünür', () => {
    const doc = load('baraj-cubuk', { level: 75, mode: 'stop', waterResistance: 1e6 });
    const sim = simOf(doc);
    sim.runUntil(5);
    const katlar = katDevreleri(doc, frameOf(sim, doc), wetOf(sim, doc));
    for (const k of katlar.slice(0, 2)) {
      expect(k.wet).toBe(true);
      expect(k.currents!.base).toBeLessThan(20e-6);
      expect(k.brightness).toBeLessThan(0.3);
    }
  });

  it('simülasyon yokken akımlar ve bölgeler boş, değerler parçalardan', () => {
    const doc = exampleDoc('baraj-tek-isik')!;
    const katlar = katDevreleri(doc, null, [true, true, false, false]);
    expect(katlar.map((k) => [k.wet, k.region, k.currents, k.baseVoltage])).toEqual([
      [true, null, null, null],
      [false, null, null, null],
      [false, null, null, null],
    ]);
    expect(katlar[0]!.silencer).toMatchObject({ label: 'Q4', currents: null, region: null });
    expect(katlar.map((k) => circuitClosed(k))).toEqual([false, false, false]);
  });
});
