// Baraj sayfasının seviye mantığı: bantlar, hedefler, Durum tablosu satırları (gerçek simülasyonla)
// ve şemadaki seviye bantları.

import { describe, expect, it } from 'vitest';
import {
  bandOf,
  durumRows,
  flowToward,
  ledState,
  levelBands,
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
import type { DeviceStatus, Measurement } from '../src/sim/devices';

function load(id: ExampleId, tank: Record<string, number | string>): CircuitDoc {
  const doc = exampleDoc(id)!;
  const h1 = doc.parts.find((p) => p.type === 'tank')!;
  return updatePart(doc, h1.id, { props: { ...h1.props, ...tank } });
}
const simOf = (doc: CircuitDoc) => new CircuitSimulator(buildConnectivity(doc).netlist, { timeStep: 2e-3 });
function frameOf(sim: CircuitSimulator, doc: CircuitDoc): FrameData {
  const statuses = new Map<string, DeviceStatus>();
  const live = new Map<string, { brightness?: number }>();
  const measurements = new Map<string, Measurement>();
  for (const part of doc.parts) {
    const m = sim.measure(part.id);
    if (!m) continue;
    measurements.set(part.id, m);
    const status = sim.status(part.id);
    statuses.set(part.id, status);
    if (part.type === 'led') live.set(part.id, { brightness: status.brightness ?? 0 });
  }
  return { statuses, live, measurements };
}
const wetOf = (sim: CircuitSimulator, doc: CircuitDoc) => sim.status(doc.parts.find((p) => p.type === 'tank')!.id).wetProbes ?? [];
const never = () => false;

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

  it('LED durumu: yanıyor / çok zayıf / sönüyor / sönük; akım mA', () => {
    expect(ledState(0.8, false)).toBe('on');
    expect(ledState(0.1, false)).toBe('dim');
    expect(ledState(0.1, true)).toBe('fading');
    expect(ledState(0.01, true)).toBe('off');
    expect(milliamps(14.4e-3)).toEqual({ value: 14.4, decimals: 0 });
    expect(milliamps(0.52e-3).decimals).toBe(1);
    expect(milliamps(35e-6).decimals).toBe(2);
    expect(milliamps(1e-6)).toEqual({ value: 0, decimals: 0 });
  });

  it('çubuk gösterge %50: Seviye 1 ıslak, Q1 doyumda, yeşil yanıyor; üstteki katlar kesimde', () => {
    const doc = load('baraj-cubuk', { level: 50, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const rows = durumRows(doc, frameOf(sim, doc), wetOf(sim, doc), never);
    expect(rows.map((r) => r.level)).toEqual([3, 2, 1]);
    expect(rows.map((r) => [r.wet, r.region, r.working, r.led])).toEqual([
      [false, 'cutoff', false, 'off'],
      [false, 'cutoff', false, 'off'],
      [true, 'saturation', true, 'on'],
    ]);
    expect(rows[2]!.current!).toBeGreaterThan(14e-3);
    expect(rows.every((r) => r.note === null)).toBe(true);
  });

  it('çubuk gösterge: su probun altına inince kat bir süre çalışır, not "C1 boşalıyor"', () => {
    let doc = load('baraj-cubuk', { level: 50, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const h1 = doc.parts.find((p) => p.type === 'tank')!;
    doc = updatePart(doc, h1.id, { props: { ...h1.props, level: 30 } });
    sim.update(buildConnectivity(doc).netlist);
    sim.runUntil(2.04);
    const row1 = durumRows(doc, frameOf(sim, doc), wetOf(sim, doc), never)[2]!;
    expect(row1.wet).toBe(false);
    expect(row1.region).not.toBe('cutoff');
    expect(row1.note).toEqual({ kind: 'discharging', capacitor: 'C1' });
  });

  it('tek ışık %75: Q4 yeşili susturuyor, yalnız sarı yanıyor', () => {
    const doc = load('baraj-tek-isik', { level: 75, mode: 'stop' });
    const sim = simOf(doc);
    sim.runUntil(2);
    const rows = durumRows(doc, frameOf(sim, doc), wetOf(sim, doc), never);
    expect(rows.map((r) => [r.wet, r.region, r.led])).toEqual([
      [false, 'cutoff', 'off'],
      [true, 'saturation', 'on'],
      [true, 'cutoff', 'off'],
    ]);
    expect(rows[2]!.note).toEqual({ kind: 'silenced', by: 'Q4' });
    expect(rows[1]!.note).toBeNull();
  });

  it('saf su (1 MΩ): su yüksek ama elektroliz gerilimi ve suyun direnci baz akımını keser, LED’ler sönük', () => {
    const doc = load('baraj-cubuk', { level: 75, mode: 'stop', waterResistance: 1e6 });
    const sim = simOf(doc);
    sim.runUntil(5);
    const rows = durumRows(doc, frameOf(sim, doc), wetOf(sim, doc), never);
    expect(rows.slice(1).map((r) => r.wet)).toEqual([true, true]);
    for (const r of rows.slice(1)) expect(r.led === 'dim' || r.led === 'off').toBe(true);
  });

  it('şemada her katın bandı o katın parçalarını içine alır, bantlar üst üste binmez', () => {
    for (const id of ['baraj-cubuk', 'baraj-tek-isik'] as const) {
      const doc = exampleDoc(id)!;
      const bands = levelBands(doc);
      expect(bands.map((b) => b.level)).toEqual([3, 2, 1]);
      for (let i = 1; i < bands.length; i++) expect(bands[i]!.box.y).toBeGreaterThanOrEqual(bands[i - 1]!.box.y + bands[i - 1]!.box.h);
      for (const { level, box } of bands) {
        const q = doc.parts.find((p) => p.label === `Q${level}`)!;
        expect(q.x).toBeGreaterThan(box.x);
        expect(q.x).toBeLessThan(box.x + box.w);
        expect(q.y).toBeGreaterThan(box.y);
        expect(q.y).toBeLessThan(box.y + box.h);
      }
    }
  });
});
