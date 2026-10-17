// Ses ve koruma: hoparlör (Thiele-Small eşdeğeri), aktif buzzer, sigorta (I²t ve en küçük eritme
// akımı). Beklenen değerler fazör çözümünden, veri sayfalarından ve sigortanın ısıl denkleminden.

import { describe, expect, it } from 'vitest';
import { exampleDoc, type ExampleId } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { CircuitSimulator } from '../src/sim';
import { BuzzerDevice, FuseDevice, fuseBlowTime, SPEAKER, SpeakerDevice, SPEAKER_REFERENCE_CURRENT } from '../src/sim/devices/sound';
import { circuit } from './helpers';

/** Hoparlörün empedansı (karmaşık): R_e + jωL_e + (1/R_es + jωC_mes + 1/(jωL_ces))⁻¹. */
function speakerImpedance(f: number): [number, number] {
  const w = 2 * Math.PI * f;
  const cmes = SPEAKER.qes / (2 * Math.PI * SPEAKER.fs * SPEAKER.re);
  const lces = 1 / ((2 * Math.PI * SPEAKER.fs) ** 2 * cmes);
  const res = (SPEAKER.re * SPEAKER.qms) / SPEAKER.qes;
  const yr = 1 / res;
  const yi = w * cmes - 1 / (w * lces);
  const d = yr * yr + yi * yi;
  return [SPEAKER.re + yr / d, w * SPEAKER.le - yi / d];
}

/** Sinüsle sürülen hoparlörün akım genliği ve fazı (kilitlemeli ölçüm, bir periyot). */
function drive(f: number, amplitude = 1) {
  const s = new CircuitSimulator(
    circuit().acsource('S', 'a', 'g', { waveform: 'sine', amplitude, frequency: f, offset: 0 }).ground('G', 'g').add('speaker', 'K', ['a', 'g']).build(),
  );
  s.runUntil(40 / f);
  const n = 400;
  let si = 0;
  let co = 0;
  const start = s.time;
  for (let k = 1; k <= n; k++) {
    const t = start + k / (f * n);
    s.runUntil(t);
    const i = s.measure('K')!.current;
    si += i * Math.sin(2 * Math.PI * f * t);
    co += i * Math.cos(2 * Math.PI * f * t);
  }
  return { s, amplitude: (2 / n) * Math.hypot(si, co), phase: Math.atan2(co, si) };
}

describe('Hoparlör (Visaton FRS 5, 8 Ω)', () => {
  it('rezonansta (290 Hz) empedans R_e + R_es ≈ 19,9 Ω; 1 kHz’te fazör çözümüyle %1 ve 1° içinde', () => {
    for (const f of [290, 1000]) {
      const [re, im] = speakerImpedance(f);
      const r = drive(f);
      expect(Math.abs(1 / r.amplitude / Math.hypot(re, im) - 1)).toBeLessThan(0.01);
      expect(Math.abs(-r.phase - Math.atan2(im, re))).toBeLessThan((1 * Math.PI) / 180);
    }
    expect(Math.hypot(...speakerImpedance(290))).toBeCloseTo(19.9, 1);
  });

  it('1 kHz’te 1 W: zarın ivmesi (C_mes’in akımı) ≈ referans (ses örneklerinin tepesi ≈ 1); doğru akım ses vermez', () => {
    // 1 W: I_etkin = √(1/|Z|·cos φ)…; doğrudan 1 W verecek genlik.
    const [re] = speakerImpedance(1000);
    const z = Math.hypot(...speakerImpedance(1000));
    const amplitude = z * Math.sqrt(2 / re);
    const r = drive(1000, amplitude);
    const speaker = r.s.device('K') as SpeakerDevice;
    const recent = speaker.sound.slice(-200).map((p) => Math.abs(p.v) / SPEAKER_REFERENCE_CURRENT);
    // 1 kHz f_s'nin 3,4 katı: askının (L_ces) payı yüzünden kütlenin akımı toplamın 1/(1 − (f_s/f)²) ≈ 1,09 katı.
    expect(Math.max(...recent)).toBeGreaterThan(0.95);
    expect(Math.max(...recent)).toBeLessThan(1.15);
    const dc = new CircuitSimulator(circuit().battery('B', 'a', 'g', 1).ground('G', 'g').add('speaker', 'K', ['a', 'g']).build());
    dc.runUntil(0.2);
    expect(dc.measure('K')!.current).toBeCloseTo(1 / SPEAKER.re, 4);
    const last = (dc.device('K') as SpeakerDevice).sound.slice(-50).map((p) => Math.abs(p.v));
    expect(Math.max(...last)).toBeLessThan(1e-4);
  });

  it('12 V doğru akım (20 W) bobini ısıtır: anma gücü 5 W aşılınca uyarı', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 12).ground('G', 'g').add('speaker', 'K', ['a', 'g']).build());
    s.runUntil(0.3);
    expect(s.runtimeDiagnostics.map((d) => d.code)).not.toContain('resistor-overpower');
    s.runUntil(1.5);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('resistor-overpower');
  });
});

describe('Aktif buzzer (CMI-1295IC-0585T)', () => {
  const run = (volts: number) => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', volts).ground('G', 'g').add('buzzer', 'Z', ['a', 'g']).build());
    s.runUntil(0.01);
    return s;
  };
  it('5 V’ta 30 mA ve öter (85 dB); 2,5 V’ta ötmez; ters bağlanınca akım geçmez', () => {
    const on = run(5);
    expect(on.measure('Z')!.current).toBeCloseTo(0.03, 3);
    expect(on.status('Z').sounding).toBe(true);
    expect(on.status('Z').spl).toBeCloseTo(85, 1);
    const low = run(2.5);
    expect(low.status('Z').sounding).toBe(false);
    const reverse = run(-5);
    expect(Math.abs(reverse.measure('Z')!.current)).toBeLessThan(1e-6);
    expect(reverse.status('Z').sounding).toBe(false);
    expect((on.device('Z') as BuzzerDevice).sound.length).toBeGreaterThan(0);
  });
});

describe('Sigorta (Littelfuse 217, 1 A hızlı)', () => {
  const fused = (current: number) => {
    // Sabit akım: pil, sigorta ve akımı belirleyen direnç (sigortanın 0,096 Ω'u da hesaba katılır).
    const volts = 12;
    return new CircuitSimulator(
      circuit().battery('B', 'p', 'g', volts).ground('G', 'g').add('fuse', 'F', ['p', 'a']).resistor('R', 'a', 'g', volts / current - 0.09635).build(),
    );
  };
  const blowTime = (current: number, limit: number) => {
    const s = fused(current);
    while (!(s.device('F') as FuseDevice).blown && s.time < limit) s.runUntil(s.time + limit / 400);
    return { s, t: (s.device('F') as FuseDevice).blown ? s.time : Number.POSITIVE_INFINITY };
  };

  it('IEC 60127-2 hızlı sigorta noktaları: 2,75 A 10 ms–2 s, 4 A 3–300 ms, 10 A ≤ 20 ms (ısıl denklemle %3 içinde)', () => {
    for (const [current, lo, hi] of [
      [2.75, 0.01, 2],
      [4, 0.003, 0.3],
      [10, 0, 0.02],
    ] as const) {
      const want = fuseBlowTime(current);
      expect(want).toBeGreaterThan(lo);
      expect(want).toBeLessThan(hi);
      const { t } = blowTime(current, 2 * want);
      expect(Math.abs(t / want - 1)).toBeLessThan(0.03);
    }
    // Çok büyük akımda erime süresi I²t / I²’ye iner.
    expect(fuseBlowTime(100) * 100 * 100).toBeCloseTo(1.042, 1);
  });

  it('1,5 A’de atmaz (en küçük eritme akımı 1,8 A); atan sigorta açık devre, uyarı verir ve Onar ile yeniden iletir', () => {
    const { s: safe } = blowTime(1.5, 2);
    expect((safe.device('F') as FuseDevice).blown).toBe(false);
    expect(safe.measure('R')!.current).toBeCloseTo(1.5, 3);
    const { s } = blowTime(4, 0.5);
    s.runUntil(s.time + 0.01);
    expect(s.measure('R')!.current).toBeCloseTo(0, 6);
    expect(s.runtimeDiagnostics.map((d) => d.code)).toContain('fuse-blown');
    expect(s.repair('F')).toBe(true);
    s.runUntil(s.time + 1e-3);
    expect(s.measure('R')!.current).toBeCloseTo(4, 2);
  });
});

function example(id: ExampleId) {
  let doc: CircuitDoc = exampleDoc(id)!;
  const sim = new CircuitSimulator(buildConnectivity(doc).netlist);
  const idOf = (label: string) => doc.parts.find((p) => p.label === label)!.id;
  return {
    sim,
    idOf,
    set(label: string, props: Record<string, number | boolean>) {
      const part = doc.parts.find((p) => p.label === label)!;
      doc = updatePart(doc, part.id, { props: { ...part.props, ...props } });
      sim.update(buildConnectivity(doc).netlist);
    },
  };
}

describe('Ses ve koruma örnekleri: metindeki sayılar', () => {
  it('Hoparlör: 440 Hz’te ≈ 0,12 A ve ≈ 79 dB; 290 Hz’te 0,10 A ama ≈ 83 dB; 100 Hz’te ≈ 57 dB', () => {
    const e = example('hoparlor');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const at = (frequency: number) => {
      e.set('FG1', { frequency });
      // Ses düzeyi 50 ms'lik ortalamadan: 26 dB'lik düşüş ≈ 0,5 s'de oturur.
      e.sim.runUntil(e.sim.time + 0.8);
      return { amps: e.sim.status(e.idOf('A1')).reading ?? 0, spl: e.sim.status(e.idOf('HP1')).spl ?? 0 };
    };
    const a440 = at(440);
    expect(a440.amps).toBeCloseTo(0.12, 2);
    expect(a440.spl).toBeCloseTo(78.6, 0);
    const a290 = at(290);
    expect(a290.amps).toBeCloseTo(0.101, 2);
    expect(a290.spl).toBeCloseTo(82.7, 0);
    expect(at(100).spl).toBeCloseTo(56.9, 0);
    expect(e.sim.runtimeDiagnostics).toEqual([]);
  });

  it('Sıcaklık alarmı: 25 °C’ta baz 0,27 V ve sessiz; 52 °C’ta sessiz, 53 °C’ta öter; 55 °C’ta 4,8 V ve 28 mA', () => {
    const e = example('buzzer-sicaklik');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    const at = (temperature: number) => {
      e.set('NTC1', { temperature });
      e.sim.runUntil(e.sim.time + 0.05);
      return e.sim.status(e.idOf('BZ1'));
    };
    expect(at(25).sounding).toBe(false);
    expect(e.sim.measure(e.idOf('R1'))!.voltage).toBeCloseTo(0.27, 2);
    expect(at(52).sounding).toBe(false);
    expect(at(53).sounding).toBe(true);
    at(55);
    expect(e.sim.measure(e.idOf('BZ1'))!.voltage).toBeCloseTo(4.83, 1);
    expect(e.sim.measure(e.idOf('BZ1'))!.current).toBeCloseTo(0.028, 3);
  });

  it('Sigorta: lamba 0,5 A ve ilk an ≈ 5,7 A’de atmaz (ısınma ≈ %8); kısa devrede ≈ 76 A, 0,17 ms’de atar; Onar ile yeniden', () => {
    const e = example('sigorta');
    expect(e.sim.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    let peak = 0;
    while (e.sim.time < 0.3) {
      e.sim.runUntil(e.sim.time + 1e-4);
      peak = Math.max(peak, e.sim.measure(e.idOf('A1'))!.current);
    }
    expect(peak).toBeGreaterThan(5.4);
    expect(peak).toBeLessThan(6.1);
    expect(e.sim.measure(e.idOf('A1'))!.current).toBeCloseTo(0.5, 2);
    expect(e.sim.status(e.idOf('F1')).heating!).toBeCloseTo(0.077, 2);
    e.set('S2', { closed: true });
    const fuse = () => e.sim.device(e.idOf('F1')) as FuseDevice;
    const t0 = e.sim.time;
    while (!fuse().blown && e.sim.time < t0 + 0.01) e.sim.runUntil(e.sim.time + 1e-6);
    expect(fuse().blown).toBe(true);
    expect((e.sim.time - t0) * 1e3).toBeCloseTo(0.17, 1);
    expect(fuse().blowCurrent).toBeCloseTo(76, -1);
    expect(e.sim.runtimeDiagnostics.map((d) => d.code)).toContain('fuse-blown');
  });
});
