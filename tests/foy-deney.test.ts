// Föy deneylerinin kartları: föyün iskeleti (deneyler, şekiller, adım numaraları, sorular) eksiksiz
// mi ve cevaplardaki sayılar simülasyonda ölçülenlerle aynı mı. Cevap metni, testin ölçüp föy
// biçiminde yazdığı sayıyı içermiyorsa test düşer.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_GROUPS, EXTRA_EXAMPLES, LAB_EXPERIMENTS, type ExampleId, type LabExperimentNo } from '../src/examples';
import { LAB_EXPERIMENT_TEXTS, LAB_FIGURE_TEXTS, labAim } from '../src/i18n/foy';
import { tr } from '../src/i18n/tr';
import type { CircuitDoc } from '../src/model/types';
import type { CircuitSimulator } from '../src/sim';
import { between, idOf, load, nodeOf, run, withProps } from './ornek-yardimci';

/** Föydeki bir şekil: şekil numarası, o şekle ait adımlar ve soruların adımları (föydeki sırayla). */
interface FoySekil {
  readonly figure: string;
  readonly steps: readonly string[];
  readonly questions: readonly string[];
}

/**
 * Föyün iskeleti (Elektronik Lab. Deney Föyü): deney → örnek → şekil. Bir deneyin bütün adımları
 * şekillerine dağıtılmıştır; aynı şekli kullanan örnekler (zener ve LED Şekil-3'ün diyot yerine
 * takılan parçaları) aynı adımı paylaşır.
 */
const FOY: Partial<Record<LabExperimentNo, { readonly steps: readonly string[]; readonly figures: Partial<Record<ExampleId, FoySekil>> }>> = {
  1: {
    steps: ['1', '2a', '2b', '2c', '3'],
    figures: {
      'diyot-dc': { figure: 'Şekil-2', steps: ['1'], questions: ['1'] },
      'diyot-karakteristigi': { figure: 'Şekil-3', steps: ['2a', '2b', '2c'], questions: ['2a', '2b', '2c'] },
      'zener-karakteristigi': { figure: 'Şekil-3', steps: ['3'], questions: ['3'] },
      'led-karakteristigi': { figure: 'Şekil-3', steps: ['3'], questions: ['3'] },
    },
  },
  2: {
    steps: ['1', '2', '3'],
    figures: {
      'yarim-dalga': { figure: 'Şekil-4a', steps: ['1', '2'], questions: ['1', '2'] },
      'kopru-dogrultmac': { figure: 'Şekil-5a', steps: ['3'], questions: ['3'] },
    },
  },
  3: {
    steps: ['1', '2'],
    figures: {
      'negatif-kenetleyici': { figure: 'Şekil-9a', steps: ['1'], questions: ['1'] },
      'pozitif-kenetleyici': { figure: 'Şekil-9b', steps: ['1'], questions: ['1'] },
      'gerilim-katlayici': { figure: 'Şekil-10', steps: ['2'], questions: ['2'] },
    },
  },
};

/** Bir sayıyı kartlardaki gibi yazar: ondalık virgül, eksi işareti "−". */
const num = (x: number, digits: number) => x.toFixed(digits).replace('.', ',').replace('-', '−');

/** Cevap metni, testin ölçtüğü sayıları (kartlardaki biçimiyle) içeriyor mu. */
function says(text: string, ...parts: string[]) {
  for (const p of parts) expect(text, `cevapta “${p}” yok`).toContain(p);
}

function answer(id: ExampleId, step: string): string {
  const q = LAB_FIGURE_TEXTS[id]!.questions.find((x) => x.step === step);
  expect(q, `${id}: ${step}. adımın sorusu`).toBeDefined();
  return q!.answer;
}

describe('Föy kartları: iskelet', () => {
  for (const [no, deney] of Object.entries(FOY) as [string, NonNullable<(typeof FOY)[LabExperimentNo]>][]) {
    const n = Number(no) as LabExperimentNo;
    it(`Deney ${n}: amaç, teorik bilgi, şekiller, adımlar ve sorular eksiksiz`, () => {
      const experiment = LAB_EXPERIMENT_TEXTS[n];
      expect(experiment, `Deney ${n} bilgisi`).toBeDefined();
      expect(experiment!.title.length).toBeGreaterThan(5);
      // Amaç tek satır: klasörde grup başlığının altında da çıkar.
      expect(experiment!.aim.length).toBeGreaterThan(10);
      expect(experiment!.aim.length).toBeLessThanOrEqual(90);
      expect(experiment!.aim).not.toContain('\n');
      expect(experiment!.theory.length).toBeGreaterThan(0);
      expect(experiment!.theory.some((t) => 'formula' in t)).toBe(true);
      if (n >= 5) expect(experiment!.pinout, `Deney ${n}: transistörün bacak bağlantısı`).toBeDefined();

      // Grup adı föydeki deney adı; klasörde amaç satırı.
      const group = (Object.keys(LAB_EXPERIMENTS) as (keyof typeof LAB_EXPERIMENTS)[]).find((g) => LAB_EXPERIMENTS[g] === n)!;
      expect(tr.examples.groups[group]).toBe(`Deney ${n} · ${experiment!.title.charAt(0).toUpperCase()}${experiment!.title.slice(1)}`);
      expect(labAim(group)).toBe(experiment!.aim);

      // Grubun föydeki bütün örneklerinin şekli var; ek örneklerin yok (eski kart düzeni).
      const ids = EXAMPLE_GROUPS.find((g) => g.id === group)!.ids as readonly ExampleId[];
      expect(ids.filter((id) => !EXTRA_EXAMPLES.has(id))).toEqual(Object.keys(deney.figures));
      for (const id of ids.filter((x) => EXTRA_EXAMPLES.has(x))) expect(LAB_FIGURE_TEXTS[id], id).toBeUndefined();

      const covered = new Set<string>();
      for (const [id, sekil] of Object.entries(deney.figures) as [ExampleId, FoySekil][]) {
        const figure = LAB_FIGURE_TEXTS[id];
        expect(figure, `${id}: föy kartı`).toBeDefined();
        expect(figure!.experiment).toBe(n);
        expect(figure!.figure).toBe(sekil.figure);
        expect(figure!.steps.map((s) => s.no), `${id}: adımlar`).toEqual(sekil.steps);
        for (const s of figure!.steps) {
          expect(s.text.length, `${id}: ${s.no}. adımın açıklaması`).toBeGreaterThan(20);
          expect(s.sim.length, `${id}: ${s.no}. adımın "Simülasyonda:" satırı`).toBeGreaterThan(20);
          covered.add(s.no);
        }
        expect(figure!.questions.map((q) => q.step), `${id}: sorular`).toEqual(sekil.questions);
        for (const q of figure!.questions) {
          expect(q.question.length, `${id}: ${q.step}. adımın sorusu`).toBeGreaterThan(20);
          // Cevap simülasyonda ölçülen sayılara dayanır.
          expect(q.answer, `${id}: ${q.step}. adımın cevabı`).toMatch(/\d/);
          expect(q.answer.length).toBeGreaterThan(80);
          if (q.link) expect(EXAMPLE_GROUPS.some((g) => (g.ids as readonly ExampleId[]).includes(q.link!))).toBe(true);
        }
      }
      // Deneyin bütün adımları şekillerin kartlarında.
      expect([...covered].sort()).toEqual([...deney.steps].sort());
    });
  }

  it('föyde olmayan deney numarası yok', () => {
    for (const figure of Object.values(LAB_FIGURE_TEXTS)) expect(FOY[figure!.experiment], `Deney ${figure!.experiment}`).toBeDefined();
  });
});

/** X-Y'deki gibi: bir periyot boyunca ince adımlarla girişi, akımı ve parçanın gerilimini örnekler. */
function sweep(doc: CircuitDoc, part: string, periods = 5) {
  const fg = doc.parts.find((p) => p.type === 'funcgen')!;
  const T = 1 / (fg.props.frequency as number);
  const sim = run(doc, periods * T);
  const r = idOf(doc, 'R1');
  const d = idOf(doc, part);
  const points: { vi: number; i: number; v: number }[] = [];
  for (let k = 0; k < 4000; k++) {
    expect(sim.advance(T / 2000).ok).toBe(true);
    points.push({ vi: sim.voltageAt(`${fg.id}#0`)!, i: sim.measure(r)!.current, v: sim.measure(d)!.voltage });
  }
  const max = points.reduce((a, b) => (b.i > a.i ? b : a));
  const min = points.reduce((a, b) => (b.i < a.i ? b : a));
  /** Akımın `level`'ı yükselirken ilk geçtiği nokta. */
  const rising = (level: number) => points.find((p, k) => k > 0 && points[k - 1]!.i < level && p.i >= level)!;
  return { max, min, rising, sim };
}

describe('Deney 1: cevaplardaki sayılar', () => {
  it('Şekil-2, 1. adım: ölçüm tablosu; eşik silisyumunki; ters yönde < 1 µA', () => {
    const doc = load('diyot-dc');
    const text = answer('diyot-dc', '1');
    const at = (v: number): CircuitSimulator => run(withProps(doc, 'PS1', { voltage1: v }), 0);
    const row = (v: number) => {
      const sim = at(v);
      return { i: sim.status(idOf(doc, 'A1')).reading!, vd: sim.measure(idOf(doc, 'D1'))!.voltage, vo: sim.status(idOf(doc, 'V1')).reading! };
    };
    const r02 = row(0.2);
    says(text, `0,2 V → ${num(r02.i * 1e6, 0)} µA, ${num(r02.vd, 2)} V`);
    for (const v of [0.5, 1, 2, 5]) {
      const r = row(v);
      says(text, `${num(v, v < 1 ? 1 : 0)} V → ${num(r.i * 1e3, 2)} mA, ${num(r.vd, 2)} V`);
      // V_D = V_i − V_o.
      between(v - r.vo - r.vd, -1e-3, 1e-3);
    }
    // Akım 0,3–0,4 V'a kadar küçük, sonra hızla artar: 0,3 V'ta < 25 µA, 0,6 V'ta > 0,2 mA.
    expect(row(0.3).i).toBeLessThan(25e-6);
    expect(row(0.6).i).toBeGreaterThan(0.2e-3);
    says(text, 'silisyum');
  });

  it('Şekil-3, 2a ve 2c: X-Y’de en büyük akım ≈ 4,23 mA (50 Ω seri); 1 mA girişin ≈ 1,5 V’unda, diyotta ≈ 0,47 V', () => {
    const doc = load('diyot-karakteristigi');
    const { max, rising } = sweep(doc, 'D1');
    const one = rising(1e-3);
    says(answer('diyot-karakteristigi', '2a'), `≈ ${num(max.i * 1e3, 2)} mA`, `V_{i} ≈ ${num(one.vi, 1)} V`, `≈ ${num(one.v, 2)} V`, '4,44 mA');
    // (5 V − V_D) / 1050 Ω.
    between((5 - max.v) / 1050 - max.i, -0.02e-3, 0.02e-3);
    says(answer('diyot-karakteristigi', '2c'), `≈ ${num(max.i * 1e3, 2)} mA`, `≈ ${num(max.i * 1e3, 1)} bölme`);
  });

  it('Şekil-3, 2b: frekans artınca ters tepe akımı büyür (ters toparlanma), 1 mA’e daha küçük girişte ulaşılır', () => {
    const doc = load('diyot-karakteristigi');
    const text = answer('diyot-karakteristigi', '2b');
    const at = (f: number) => sweep(withProps(doc, 'FG1', { frequency: f }), 'D1');
    const k1 = at(1e3);
    says(text, `≈ ${num(k1.min.i * 1e3, 2)} mA`, `1 kHz’te ≈ ${num(k1.rising(1e-3).vi, 2)} V`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const s = at(f);
      says(text, `${label} ≈ ${num(s.min.i * 1e3, 1)} mA`);
      between(s.max.i, 4.2e-3, 4.45e-3);
      if (f === 1e6) says(text, `1 MHz’te ≈ ${num(s.rising(1e-3).vi, 2)} V`);
    }
  });

  it('Şekil-3, 3. adım (zener): 5 V genlik kırmaz (≈ −4,87 V, ≈ 0,12 mA); 10 V genlikte ≈ −5,37 V’ta ≈ 4,41 mA, ileri ≈ 0,68 V’ta ≈ 8,9 mA', () => {
    const doc = load('zener-karakteristigi');
    const text = answer('zener-karakteristigi', '3');
    const small = sweep(withProps(doc, 'FG1', { amplitude: 10 }), 'Z1');
    says(text, `≈ ${num(-small.min.v, 2)} V`, `≈ ${num(-small.min.i * 1e3, 2)} mA`);
    const big = sweep(doc, 'Z1');
    says(text, `≈ ${num(big.min.v, 2)} V’ta`, `≈ ${num(-big.min.i * 1e3, 2)} mA`, `≈ ${num(big.max.v, 2)} V’ta ≈ ${num(big.max.i * 1e3, 1)} mA`);
    // Y-t'de B kanalı 1 kΩ'un gerilimi: + yarıda ≈ 8,9 V, − yarıda ≈ −4,4 V.
    says(text, `≈ ${num(big.max.i * 1e3, 1)} V’a`, `≈ ${num(big.min.i * 1e3, 1)} V’a`);
  });

  it('Şekil-3, 3. adım (LED): 0,1 mA ≈ 1,45 V, 1 mA ≈ 1,61 V (1N4001’de ≈ 0,47 V); en büyük akım ≈ 3,15 mA; ters yönde akım yok', () => {
    const led = sweep(load('led-karakteristigi'), 'LED1');
    const diode = sweep(load('diyot-karakteristigi'), 'D1');
    const text = answer('led-karakteristigi', '3');
    says(
      text,
      `0,1 mA’i ≈ ${num(led.rising(1e-4).v, 2)} V’ta`,
      `1 mA’i ≈ ${num(led.rising(1e-3).v, 2)} V’ta`,
      `1 mA ≈ ${num(diode.rising(1e-3).v, 2)} V’ta`,
      `girişin ≈ ${num(led.rising(1e-4).vi, 1)} V’undan`,
      `≈ ${num(led.max.i * 1e3, 2)} mA`,
      `≈ ${num(led.max.v, 2)} V`,
    );
    expect(Math.abs(led.min.i)).toBeLessThan(1e-6);
  });
});

/** Bir periyot boyunca (n örnekle) bir büyüklüğün en büyük, en küçük ve ortalama değeri. */
function period(sim: CircuitSimulator, T: number, value: () => number, n = 2000) {
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  let sum = 0;
  for (let k = 0; k < n; k++) {
    expect(sim.advance(T / n).ok).toBe(true);
    const v = value();
    max = Math.max(max, v);
    min = Math.min(min, v);
    sum += v;
  }
  return { max, min, avg: sum / n };
}

describe('Deney 2: cevaplardaki sayılar', () => {
  /** Yarım dalga: R_L'nin gerilimi, 10 periyot sonra bir periyot boyunca. */
  function halfWave(props: Record<string, number | boolean>, until?: number) {
    let doc = load('yarim-dalga');
    for (const [label, value] of Object.entries(props)) doc = withProps(doc, label.split('.')[0]!, { [label.split('.')[1]!]: value });
    const f = doc.parts.find((p) => p.label === 'FG1')!.props.frequency as number;
    const sim = run(doc, until ?? 10 / f);
    const d = idOf(doc, 'D1');
    return period(sim, 1 / f, () => sim.voltageAt(`${d}#1`)!);
  }

  it('Şekil-4a, 1. adım: 1 kHz’te tepe ≈ 2,36 V (3 V genlik), ortalama ≈ 0,69 V; frekans artınca ters toparlanmayla negatif yarı geçer; 5 V genlikte de aynı', () => {
    const text = answer('yarim-dalga', '1');
    const k1 = halfWave({});
    says(text, `tepe ≈ ${num(k1.max, 2)} V`, `≈ ${num(3 - k1.max, 2)} V düşer`, `ortalaması ≈ ${num(k1.avg, 2)} V`, `≈ ${num(k1.max / Math.PI, 2)} V verir`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const r = halfWave({ 'FG1.frequency': f });
      says(text, `${label} ≈ ${num(r.min, 2)} V`);
      if (f === 1e5) says(text, `100 kHz’te ≈ ${num(r.avg, 2)} V’a`);
      if (f === 1e6) says(text, `1 MHz’te ≈ ${num(r.avg, 2)} V’a`);
    }
    const five = halfWave({ 'FG1.amplitude': 10 });
    says(text, `tepe ≈ ${num(five.max, 2)} V, ortalama ≈ ${num(five.avg, 2)} V`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const r = halfWave({ 'FG1.amplitude': 10, 'FG1.frequency': f });
      says(text, `${label} ≈ ${num(r.min, 2)} V`);
      if (f === 1e6) says(text, `1 MHz’te ortalama ≈ ${num(r.avg, 2)} V`);
    }
  });

  it('Şekil-4a, 2. adım: 1 µF 1,03–2,20 V, 22 µF 1,75–1,81 V, 470 µF ≈ 1,78 V (≈ 3 mV); R_L = ∞’da ≈ 2,6–2,7 V ve dalgalanma yok', () => {
    const text = answer('yarim-dalga', '2');
    says(text, `ortalaması ≈ ${num(halfWave({}).avg, 2)} V`);
    const c1 = halfWave({ 'S1.closed': true }, 0.2);
    says(text, `1 µF’ta çıkış ${num(c1.min, 2)}–${num(c1.max, 2)} V`);
    const c2 = halfWave({ 'S2.closed': true }, 0.2);
    says(text, `22 µF’ta ${num(c2.min, 2)}–${num(c2.max, 2)} V (dalgalanma ≈ ${num(c2.max - c2.min, 2)} V; ΔV ≈ V_{DC} / (f · R_{L} · C) ≈ ${num(c2.avg / (1e3 * 1e3 * 22e-6), 2)} V)`);
    const c3 = halfWave({ 'S3.closed': true }, 3);
    says(text, `470 µF’ta ≈ ${num(c3.avg, 2)} V’ta, dalgalanma ≈ ${num((c3.max - c3.min) * 1e3, 0)} mV`);
    for (const c of ['S1', 'S2', 'S3']) {
      const open = halfWave({ [`${c}.closed`]: true, 'S4.closed': false }, c === 'S3' ? 3 : 0.2);
      between(open.avg, 2.55, 2.7);
      expect(open.max - open.min).toBeLessThan(5e-3);
    }
    says(text, '≈ 2,6–2,7 V’ta');
  });

  it('Şekil-5a, 3. adım: tepe ≈ 4,36 V (iki diyot × ≈ 0,32 V, ≈ 44 µA), ortalama ≈ 2,63 V, çıkış 2 kHz; pozitif yarıda D1 ile D3, negatif yarıda D2 ile D4', () => {
    const doc = load('kopru-dogrultmac');
    const text = answer('kopru-dogrultmac', '3');
    const sim = run(doc, 0.01);
    const rl = idOf(doc, 'RL');
    const osc = idOf(doc, 'OSC1');
    // İki yarıda da aynı tepe: çıkışın frekansı girişinkinin iki katı.
    const first = period(sim, 0.5e-3, () => sim.measure(rl)!.voltage, 1000);
    const second = period(sim, 0.5e-3, () => sim.measure(rl)!.voltage, 1000);
    between(first.max - second.max, -0.01, 0.01);
    const all = { max: first.max, avg: (first.avg + second.avg) / 2 };
    says(text, `tepesi ≈ ${num(all.max, 2)} V`, `≈ ${num((all.max / 1e5) * 1e6, 0)} µA`, `≈ ${num((5 - all.max) / 2, 2)} V düşürür`, `Ortalaması ≈ ${num(all.avg, 2)} V`, `≈ ${num((2 * all.max) / Math.PI, 2)} V verir`, '2 kHz');
    // Pozitif tepe (t = 11,25 ms) ve negatif tepe (11,75 ms): iletken diyotlar ve kanalların gerilimi.
    const on = (label: string) => sim.measure(idOf(doc, label))!.current > 10e-6;
    sim.runUntil(0.01125);
    expect(['D1', 'D2', 'D3', 'D4'].filter(on)).toEqual(['D1', 'D3']);
    const a = sim.voltageAt(`${osc}#0`)!;
    sim.runUntil(0.01175);
    expect(['D1', 'D2', 'D3', 'D4'].filter(on)).toEqual(['D2', 'D4']);
    const b = sim.voltageAt(`${osc}#1`)!;
    says(text, `≈ ${num(a, 2)} V’a çıkar`, `≈ ${num(b, 2)} V’a iner`);
  });
});

describe('Deney 3: cevaplardaki sayılar', () => {
  /** Kenetleyici: 0,2 s sonra bir periyot boyunca A (giriş) ve B (çıkış). */
  function clamp(id: 'negatif-kenetleyici' | 'pozitif-kenetleyici', waveform: 'sine' | 'square') {
    const doc = withProps(load(id), 'FG1', { waveform });
    const sim = run(doc, 0.2);
    const osc = idOf(doc, 'OSC1');
    const out = period(sim, 1e-3, () => sim.voltageAt(`${osc}#1`)!);
    const input = period(sim, 1e-3, () => sim.voltageAt(`${osc}#0`)!);
    return { out, input, sim, osc };
  }

  it('Şekil-9a: sinüste çıkış ≈ +0,57 / −9,11 V (tepe-tepe girişinkiyle aynı), kare dalgada ≈ +0,52 / −9,52 V, alt seviyede ≈ 0,2 V eğim; ilk periyotta alt tepe ≈ −8,49 V', () => {
    const text = answer('negatif-kenetleyici', '1');
    const sine = clamp('negatif-kenetleyici', 'sine');
    says(text, `≈ +${num(sine.out.max, 2)} V ile ≈ ${num(sine.out.min, 2)} V`, `(≈ ${num(sine.out.max - sine.out.min, 1)} V)`, `ortalaması ≈ ${num(sine.out.avg, 2)} V`);
    between(sine.out.max - sine.out.min - (sine.input.max - sine.input.min), -0.1, 0.1);
    const square = clamp('negatif-kenetleyici', 'square');
    says(text, `≈ +${num(square.out.max, 2)} V ile ≈ ${num(square.out.min, 2)} V`);
    // Alt seviyedeki eğim: negatif yarının başı ile sonu (t = 0,2 s + 0,5…1 ms).
    const doc = withProps(load('negatif-kenetleyici'), 'FG1', { waveform: 'square' });
    const sim = run(doc, 0.20055);
    const osc = idOf(doc, 'OSC1');
    const start = sim.voltageAt(`${osc}#1`)!;
    sim.runUntil(0.20098);
    between(sim.voltageAt(`${osc}#1`)! - start, 0.15, 0.25);
    says(text, '≈ 0,2 V yükselir');
    // İlk periyot.
    const first = run(load('negatif-kenetleyici'), 0);
    says(text, `alt tepe ≈ ${num(period(first, 1e-3, () => first.voltageAt(`${idOf(load('negatif-kenetleyici'), 'OSC1')}#1`)!).min, 2)} V`);
  });

  it('Şekil-9b: sinüste ≈ −0,57 / +9,11 V, kare dalgada ≈ −0,52 / +9,53 V; kondansatörün çıkış tarafı +', () => {
    const text = answer('pozitif-kenetleyici', '1');
    const sine = clamp('pozitif-kenetleyici', 'sine');
    says(text, `≈ ${num(sine.out.min, 2)} V ile ≈ +${num(sine.out.max, 2)} V`, `ortalaması ≈ +${num(sine.out.avg, 2)} V`);
    const square = clamp('pozitif-kenetleyici', 'square');
    says(text, `≈ ${num(square.out.min, 2)} V ile ≈ +${num(square.out.max, 2)} V`, '≈ 0,2 V düşer');
    // Elektrolitiğin + ucu (0. uç) çıkış tarafında ve pozitif dolu.
    const doc = load('pozitif-kenetleyici');
    const node = nodeOf(doc);
    expect(node('C1', 0)).toBe(node('D1', 1));
    between(run(doc, 0.2).measure(idOf(doc, 'C1'))!.voltage, 3.5, 5);
  });

  it('Şekil-10: V_p ≈ 4,63 V, V_ç = A − B ≈ 9,25 V; dolma 5 ms ≈ 3,64 V, 20 ms ≈ 4,37 V, 0,1 s ≈ 4,58 V', () => {
    const doc = load('gerilim-katlayici');
    const text = answer('gerilim-katlayici', '2');
    const osc = idOf(doc, 'OSC1');
    const sim = run(doc, 0);
    const vp: Record<string, number> = {};
    for (const t of [0.005, 0.02, 0.1, 0.5]) {
      sim.runUntil(t);
      vp[t] = sim.voltageAt(`${osc}#0`)!;
      // İki kondansatör aynı gerilime dolar.
      between(vp[t]! + sim.voltageAt(`${osc}#1`)!, -0.01, 0.01);
    }
    const a = vp[0.5]!;
    const b = sim.voltageAt(`${osc}#1`)!;
    says(text, `(A) ≈ +${num(a, 2)} V`, `(B) ≈ ${num(b, 2)} V`, `V_{p} ≈ ${num(a, 2)} V`, `A − B ≈ ${num(a - b, 2)} V`, `(≈ ${num(5 - a, 2)} V;`);
    says(text, `5 ms’de ≈ ${num(vp[0.005]!, 2)} V`, `20 ms’de ≈ ${num(vp[0.02]!, 2)} V`, `0,1 s’de ≈ ${num(vp[0.1]!, 2)} V`);
  });
});
