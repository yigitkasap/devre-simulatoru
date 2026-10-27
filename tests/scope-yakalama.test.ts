// Osiloskopun tetikli yakalaması: ekran sinyalin periyodundan ve motorun olağan adımından çok
// kısa olduğunda (≤ 100 µs/bölme) ekran tetik anından başlar, ince adımlarla doğru çizilir ve
// ekranın her yenilenmesinde aynı yerde durur.

import { describe, expect, it } from 'vitest';
import { buildScopeView } from '../src/editor/scopeView';
import { CircuitSimulator, OscilloscopeDevice, scopeSettings } from '../src/sim';
import { SCOPE_BUCKETS } from '../src/sim/scope';
import { circuit } from './helpers';

const F = 440;
const PEAK = 10;

function sine(timePerDiv: number, extra: Record<string, string | number | boolean> = {}) {
  const props = { timePerDiv, voltsPerDivA: 5, ...extra };
  const sim = new CircuitSimulator(
    circuit()
      .acsource('AC1', 'a', 'gnd', { amplitude: PEAK, frequency: F })
      .ground('G1', 'gnd')
      .resistor('R1', 'a', 'gnd', 1000)
      .oscilloscope('O1', 'a', 'nc', 'gnd', props)
      .build(),
  );
  const scope = () => sim.device('O1') as OscilloscopeDevice;
  /** Arayüz gibi: kare başına bir ilerletme, ekran, yeniden kurma. */
  const frame = (dt = 1 / 60) => {
    const result = sim.advance(dt, 6000);
    expect(result.ok).toBe(true);
    const view = buildScopeView(scope().recorder, scopeSettings(props), [true, false]);
    scope().recorder.perFrame = true;
    scope().recorder.rearm();
    return { view, steps: result.steps };
  };
  return { sim, scope, frame };
}

/** Ekrandaki A çizgisinin noktaları (ekran birimleri: x 0..500, y aşağı doğru). */
function points(path: string): Array<[number, number]> {
  return [...path.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

describe('Osiloskop: tetikli yakalama (kısa ekran)', () => {
  for (const timePerDiv of [50e-6, 10e-6, 1e-6]) {
    it(`${timePerDiv * 1e6} µs/bölme: ekran tetiklenir, yükselen kenarda 0 V'tan başlar ve sinüsü izler`, () => {
      const { frame } = sine(timePerDiv);
      for (let i = 0; i < 5; i++) frame();
      const { view } = frame();
      expect(view.triggered).toBe(true);
      const pts = points(view.channels[0].path);
      expect(pts.length).toBeGreaterThan(SCOPE_BUCKETS * 0.9);
      // y = 200 − v / (5 V/bölme) · 50 → v = (200 − y) / 10.
      const v = (k: number) => (200 - pts[k]![1]) / 10;
      const screen = timePerDiv * 10;
      // Tetik seviyesi zarfın ortası: kaba adımlarla bulunan tepeler yüzünden 0 V'tan en çok %1 sapar.
      expect(Math.abs(v(0))).toBeLessThan(0.01 * PEAK);
      // Ekranın sonuna kadar: 10·sin(2π·440·ekran) kadar yükselir (tetik anı sinüsün sıfır geçişi).
      expect(v(pts.length - 1) - v(0)).toBeCloseTo(PEAK * Math.sin(2 * Math.PI * F * screen), 1);
      expect(view.channels[0].stats!.frequency).toBeCloseTo(F, -1);
    });
  }

  it('her karede aynı yerden başlar (titremez); yakalama karede yüzlerce adımla sınırlı', () => {
    const { frame } = sine(10e-6);
    for (let i = 0; i < 3; i++) frame();
    const starts: number[] = [];
    let most = 0;
    for (let i = 0; i < 10; i++) {
      const { view, steps } = frame();
      starts.push(points(view.channels[0].path)[0]![1]);
      most = Math.max(most, steps);
    }
    expect(Math.max(...starts) - Math.min(...starts)).toBeLessThan(0.5);
    // Olağan adım ≈ periyot/50 (45 µs): 1/60 s ≈ 370 adım; yakalama ≈ 250 adım ekler.
    expect(most).toBeLessThan(1200);
  });

  it('sinyal durunca yakalama eskir: ekran kayan kayda döner', () => {
    const { sim, scope, frame } = sine(10e-6);
    for (let i = 0; i < 3; i++) frame();
    expect(scope().recorder.trace()).not.toBeNull();
    sim.update(
      circuit()
        .acsource('AC1', 'a', 'gnd', { amplitude: 0, frequency: F })
        .ground('G1', 'gnd')
        .resistor('R1', 'a', 'gnd', 1000)
        .oscilloscope('O1', 'a', 'nc', 'gnd', { timePerDiv: 10e-6, voltsPerDivA: 5 })
        .build(),
    );
    for (let i = 0; i < 30; i++) frame();
    expect(scope().recorder.trace()).toBeNull();
    expect(frame().view.triggered).toBe(false);
  });

  it('uzun ekranda (5 ms/bölme) eski davranış: geçmişten tetiklenir', () => {
    const { frame } = sine(5e-3);
    for (let i = 0; i < 10; i++) frame();
    const { view } = frame();
    expect(view.triggered).toBe(true);
    expect(view.channels[0].stats!.peakToPeak).toBeCloseTo(2 * PEAK, 0);
  });
});
