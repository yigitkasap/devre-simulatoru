// Osiloskop ekranı (tetikleme, çizgi, ölçümler, Oto ayar) ve AC'ye özgü bilgi kutuları.

import { describe, expect, it } from 'vitest';
import { meterText, partReadout } from '../src/editor/readouts';
import { autoSettings, buildScopeView, SCREEN_H } from '../src/editor/scopeView';
import type { Part } from '../src/model/types';
import { OSCILLOSCOPE_DEFAULTS, ScopeRecorder, scopeSettings } from '../src/sim';

/** 50 Hz, 10 V tepe sinüs (A) ve 3 V DC (B), 20 µs adımlarla `duration` boyunca kaydedilir. */
function recorded(duration: number, timePerDiv = 5e-3, from = 0): ScopeRecorder {
  const rec = new ScopeRecorder(timePerDiv);
  for (let t = from; t <= from + duration; t += 20e-6) rec.record(t, 10 * Math.sin(2 * Math.PI * 50 * t), 3);
  return rec;
}

const settings = scopeSettings({ ...OSCILLOSCOPE_DEFAULTS, voltsPerDivA: 5, voltsPerDivB: 5 });

/** Yol tanımındaki ilk noktanın y koordinatı. */
const firstY = (path: string) => Number(/^M[\d.]+,(-?[\d.]+)/.exec(path)![1]);

describe('Osiloskop ekranı', () => {
  it('periyodik sinyale tetiklenir: ekran sinyalin orta seviyeyi yukarı kestiği anda başlar', () => {
    for (const duration of [0.2, 0.2071, 0.2133]) {
      const view = buildScopeView(recorded(duration), settings, [true, true]);
      expect(view.triggered).toBe(true);
      // Orta seviye 0 V: ekranın dikey ortası (± yarım bölmenin onda biri).
      expect(Math.abs(firstY(view.channels[0].path) - SCREEN_H / 2)).toBeLessThan(3);
    }
  });

  it('ölçümler: tepe-tepe 20 V, etkin 7,07 V, 50 Hz; DC kanal 3 V, frekanssız', () => {
    const view = buildScopeView(recorded(0.2), settings, [true, true]);
    const a = view.channels[0].stats!;
    expect(a.peakToPeak).toBeCloseTo(20, 1);
    expect(a.rms).toBeCloseTo(10 / Math.SQRT2, 1);
    expect(a.frequency).toBeCloseTo(50, 1);
    const b = view.channels[1].stats!;
    expect(b.peakToPeak).toBeCloseTo(0, 9);
    expect(b.mean).toBeCloseTo(3, 9);
    expect(b.frequency).toBeNull();
  });

  it('kesim yoksa (DC) ekran kayar; bağlı olmayan kanal çizilmez', () => {
    const rec = new ScopeRecorder(1e-3);
    for (let t = 0; t <= 0.05; t += 1e-4) rec.record(t, 5, 0);
    const view = buildScopeView(rec, settings, [true, false]);
    expect(view.triggered).toBe(false);
    expect(view.channels[0].path.length).toBeGreaterThan(0);
    expect(view.channels[1]).toEqual({ connected: false, path: '', stats: null });
  });

  it('ekran dışına taşan değer kenarda kesilir', () => {
    const view = buildScopeView(recorded(0.2), scopeSettings({ ...OSCILLOSCOPE_DEFAULTS, voltsPerDivA: 0.5 }), [true, false]);
    const ys = [...view.channels[0].path.matchAll(/,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...ys)).toBeLessThanOrEqual(SCREEN_H + 2);
  });

  it('Oto: 50 Hz’de 5 ms/bölme (≈ 2,5 periyot), 10 V tepede 5 V/bölme; konumlar sıfırlanır', () => {
    const patch = autoSettings(recorded(0.2), settings, [true, true], { frequency: null, peak: null });
    expect(patch).toEqual({ positionA: 0, positionB: 0, timePerDiv: 5e-3, voltsPerDivA: 5, voltsPerDivB: 1 });
  });

  it('Oto, kayıt yokken devredeki kaynaktan: 1 Hz → 0,5 s/bölme, 10 V → 5 V/bölme', () => {
    const patch = autoSettings(null, settings, [true, true], { frequency: 1, peak: 10 });
    expect(patch).toEqual({ positionA: 0, positionB: 0, timePerDiv: 0.5, voltsPerDivA: 5, voltsPerDivB: 5 });
  });
});

describe('AC bilgi kutuları', () => {
  const part = (type: Part['type'], props: Part['props']): Part => ({ id: 'x', type, label: 'X1', x: 0, y: 0, rotation: 0, props });

  it('AC kipindeki voltmetre etkin değeri "~" ile gösterir; DC kipi ortalamayı', () => {
    const m = { voltage: 4.2, current: 0, power: 0 };
    expect(meterText(part('voltmeter', { mode: 'ac', ideal: true }), m, { reading: 7.0711 })).toBe('7,071 V~');
    expect(meterText(part('voltmeter', { mode: 'dc', ideal: true }), m, { reading: 0.0012 })).toBe('1,200 mV');
    const readout = partReadout(part('voltmeter', { mode: 'ac', ideal: true }), m, { reading: 7.0711 })!;
    expect(readout.rows.map((r) => r.value)).toEqual(['7,071 V~', '4,200 V', '0,00 A']);
  });

  it('AC kaynak: tepe, etkin değer, frekans ve periyot', () => {
    const readout = partReadout(
      part('acsource', { waveform: 'sine', amplitude: 10, frequency: 50, offset: 0, internalResistance: 0 }),
      { voltage: 3, current: -0.003, power: -0.009 },
    )!;
    const rows = Object.fromEntries(readout.rows.map((r) => [r.label, r.value]));
    expect(rows['Tepe gerilimi']).toBe('10 V');
    expect(rows['Etkin değer']).toBe('7,07 V');
    expect(rows['Frekans']).toBe('50 Hz');
    expect(rows['Periyot']).toBe('20 ms');
    expect(rows['Verdiği akım']).toBe('3,00 mA');
  });
});
