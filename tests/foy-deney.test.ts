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
const FOY: Record<LabExperimentNo, { readonly steps: readonly string[]; readonly figures: Partial<Record<ExampleId, FoySekil>> }> = {
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
  // Deney 4'ün tek adımı numarasız ('').
  4: {
    steps: [''],
    figures: {
      'seri-kirpici': { figure: 'Şekil-13a', steps: [''], questions: [''] },
      'paralel-kirpici': { figure: 'Şekil-13b', steps: [''], questions: [''] },
      'cift-kirpici': { figure: 'Şekil-13c', steps: [''], questions: [''] },
      'alt-kirpici': { figure: 'Şekil-13d', steps: [''], questions: [''] },
    },
  },
  5: {
    steps: ['1', '2', '3', '4', '5'],
    figures: {
      'jfet-karakteristik': { figure: 'Şekil-15', steps: ['1', '2', '3', '4', '5'], questions: ['2', '3', '4', '5'] },
    },
  },
  6: {
    steps: ['1', '2', '3', '4'],
    figures: {
      'fet-yukseltec': { figure: 'Şekil-17', steps: ['1', '2', '3', '4'], questions: ['1', '2a', '2b', '3', '4'] },
    },
  },
  7: {
    steps: ['1', '2', '3', '4'],
    figures: {
      'bjt-yukseltec': { figure: 'Şekil-18', steps: ['1', '2', '3', '4'], questions: ['1', '2', '3', '4'] },
    },
  },
  8: {
    steps: ['1', '2', '3', '4', '5'],
    figures: {
      'mosfet-yukseltec': { figure: 'Şekil-21', steps: ['1', '2', '3', '4', '5'], questions: ['3', '4', '5'] },
    },
  },
  9: {
    steps: ['1', '2', '3', '4'],
    figures: {
      'bjt-anahtar': { figure: 'Şekil-24', steps: ['1', '2', '3'], questions: ['3'] },
      'bjt-anahtar-emetor': { figure: 'Şekil-25', steps: ['4'], questions: ['4'] },
    },
  },
};

/** Cevapta aranan, içinde ölçülen sayılar olan bir kalıp (m`…` ile yazılır). */
interface Measured {
  readonly parts: readonly string[];
  readonly values: readonly (number | string)[];
}

/**
 * Ölçülen sayılarla bir kalıp. Sayı olarak verilen her değer cevaptaki bir sayıyla eşleşir ve
 * yazıldığı basamağın yarısı kadar (biraz paylı: son basamağın 0,6’sı) toleransla karşılaştırılır;
 * metin olarak verilenler aynen aranır. Örnek: m`tepe ≈ ${max} V` cevaptaki “tepe ≈ 2,36 V”yi
 * bulur ve ölçülen değeri 2,36 ± 0,006 ile karşılaştırır. Böylece −9,525 gibi yuvarlama sınırındaki
 * bir ölçüm platformdan platforma −9,52 ya da −9,53 çıksa da test düşmez.
 */
function m(parts: TemplateStringsArray, ...values: (number | string)[]): Measured {
  return { parts: [...parts], values };
}

/** Cevaptaki bir sayı (ondalık virgül, eksi “−”); başka bir sayının ortasından başlamaz. */
const NUMBER = '(?<![\\d,])([−+]?\\d+(?:,\\d+)?)';
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Yazılan sayı ölçülen değere, yazıldığı basamağın yarısı kadar yakın mı. */
function close(written: string, value: number): boolean {
  const decimals = written.split(',')[1]?.length ?? 0;
  return Math.abs(Number(written.replace('−', '-').replace(',', '.')) - value) <= 0.6 * 10 ** -decimals;
}

/** Cevap metni kalıpları içeriyor mu: düz metin aynen, m`…` kalıplarındaki sayılar toleransla. */
function says(text: string, ...patterns: (string | Measured)[]) {
  for (const p of patterns) {
    if (typeof p === 'string') {
      expect(text, `cevapta “${p}” yok`).toContain(p);
      continue;
    }
    let source = escapeRegExp(p.parts[0]!);
    const measured: number[] = [];
    let shown = p.parts[0]!;
    p.values.forEach((v, i) => {
      if (typeof v === 'number') {
        source += NUMBER;
        measured.push(v);
        shown += `⟨${v.toPrecision(5)}⟩`;
      } else {
        source += escapeRegExp(v);
        shown += v;
      }
      source += escapeRegExp(p.parts[i + 1]!);
      shown += p.parts[i + 1]!;
    });
    const found = [...text.matchAll(new RegExp(source, 'gu'))].map((match) => match.slice(1) as string[]);
    expect(found.length, `cevapta “${shown}” kalıbı yok`).toBeGreaterThan(0);
    expect(
      found.some((written) => written.every((w, k) => close(w, measured[k]!))),
      `cevapta “${shown}”: yazılan ${found.map((w) => w.join(' / ')).join(' | ')}`,
    ).toBe(true);
  }
}

function answer(id: ExampleId, step: string): string {
  const q = LAB_FIGURE_TEXTS[id]!.questions.find((x) => x.step === step);
  expect(q, `${id}: ${step}. adımın sorusu`).toBeDefined();
  return q!.answer;
}

describe('says: cevaptaki sayılar toleransla', () => {
  it('yazılan basamağın yarısı kadar (0,6 birim) tolerans: −9,525 “−9,52” ile geçer, −9,527 düşer', () => {
    says('çıkış ≈ −9,52 V', m`≈ ${-9.525} V`, m`≈ ${-9.5149} V`);
    expect(() => says('çıkış ≈ −9,52 V', m`≈ ${-9.527} V`)).toThrow();
    says('kazanç ≈ 172', m`≈ ${172.5}`);
    expect(() => says('kazanç ≈ 172', m`≈ ${172.7}`)).toThrow();
    // Sayı başka bir sayının ortasından başlamaz: "0,5 V" içindeki 5, 5 V değildir.
    expect(() => says('0,5 V → 0,13 mA', m`${5} V →`)).toThrow();
    // Metin olarak verilen kısımlar aynen aranır.
    says('2 V’ta 3,64 mA', m`${'2'} V’ta ${3.6446} mA`);
    expect(() => says('2 V’ta 3,64 mA', m`${'3'} V’ta ${3.6446} mA`)).toThrow();
  });
});

describe('Föy kartları: iskelet', () => {
  for (const [no, deney] of Object.entries(FOY) as [string, (typeof FOY)[LabExperimentNo]][]) {
    const n = Number(no) as LabExperimentNo;
    it(`Deney ${n}: amaç, teorik bilgi, şekiller, adımlar ve sorular eksiksiz`, () => {
      const experiment = LAB_EXPERIMENT_TEXTS[n];
      expect(experiment.title.length).toBeGreaterThan(5);
      // Amaç tek satır: klasörde grup başlığının altında da çıkar.
      expect(experiment.aim.length).toBeGreaterThan(10);
      expect(experiment.aim.length).toBeLessThanOrEqual(90);
      expect(experiment.aim).not.toContain('\n');
      expect(experiment.theory.length).toBeGreaterThan(0);
      expect(experiment.theory.some((t) => 'formula' in t)).toBe(true);
      if (n >= 5) expect(experiment.pinout, `Deney ${n}: transistörün bacak bağlantısı`).toBeDefined();

      // Grup adı föydeki deney adı; klasörde amaç satırı.
      const group = (Object.keys(LAB_EXPERIMENTS) as (keyof typeof LAB_EXPERIMENTS)[]).find((g) => LAB_EXPERIMENTS[g] === n)!;
      expect(tr.examples.groups[group]).toBe(`Deney ${n} · ${experiment.title.charAt(0).toUpperCase()}${experiment.title.slice(1)}`);
      expect(labAim(group)).toBe(experiment.aim);

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

  it('föyün dokuz deneyinin hepsi var; her deney grubu bir deney', () => {
    expect(Object.keys(FOY).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.values(LAB_EXPERIMENTS).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Object.keys(LAB_EXPERIMENT_TEXTS).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

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
    says(text, m`0,2 V → ${r02.i * 1e6} µA, ${r02.vd} V`);
    for (const v of [0.5, 1, 2, 5]) {
      const r = row(v);
      says(text, m`${v} V → ${r.i * 1e3} mA, ${r.vd} V`);
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
    const dc = run(withProps(load('diyot-dc'), 'PS1', { voltage1: 5 }), 0).status(idOf(load('diyot-dc'), 'A1')).reading!;
    says(answer('diyot-karakteristigi', '2a'), m`≈ ${max.i * 1e3} mA`, m`V_{i} ≈ ${one.vi} V`, m`≈ ${one.v} V`, m`5 V’ta ölçülen ${dc * 1e3} mA’den`);
    // (5 V − V_D) / 1050 Ω.
    between((5 - max.v) / 1050 - max.i, -0.02e-3, 0.02e-3);
    says(answer('diyot-karakteristigi', '2c'), m`≈ ${max.i * 1e3} mA`, m`≈ ${max.i * 1e3} bölme`);
  });

  it('Şekil-3, 2b: frekans artınca ters tepe akımı büyür (ters toparlanma), 1 mA’e daha küçük girişte ulaşılır', () => {
    const doc = load('diyot-karakteristigi');
    const text = answer('diyot-karakteristigi', '2b');
    const at = (f: number) => sweep(withProps(doc, 'FG1', { frequency: f }), 'D1');
    const k1 = at(1e3);
    says(text, m`≈ ${k1.min.i * 1e3} mA`, m`1 kHz’te ≈ ${k1.rising(1e-3).vi} V`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const s = at(f);
      says(text, m`${label} ≈ ${s.min.i * 1e3} mA`);
      between(s.max.i, 4.2e-3, 4.45e-3);
      if (f === 1e6) says(text, m`1 MHz’te ≈ ${s.rising(1e-3).vi} V`);
    }
  });

  it('Şekil-3, 3. adım (zener): 5 V genlik kırmaz (≈ −4,87 V, ≈ 0,12 mA); 10 V genlikte ≈ −5,37 V’ta ≈ 4,41 mA, ileri ≈ 0,68 V’ta ≈ 8,9 mA', () => {
    const doc = load('zener-karakteristigi');
    const text = answer('zener-karakteristigi', '3');
    const small = sweep(withProps(doc, 'FG1', { amplitude: 10 }), 'Z1');
    says(text, m`≈ ${-small.min.v} V`, m`≈ ${-small.min.i * 1e3} mA`);
    const big = sweep(doc, 'Z1');
    says(text, m`≈ ${big.min.v} V’ta`, m`≈ ${-big.min.i * 1e3} mA`, m`≈ ${big.max.v} V’ta ≈ ${big.max.i * 1e3} mA`);
    // Y-t'de B kanalı 1 kΩ'un gerilimi: + yarıda ≈ 8,9 V, − yarıda ≈ −4,4 V.
    says(text, m`≈ ${big.max.i * 1e3} V’a`, m`≈ ${big.min.i * 1e3} V’a`);
  });

  it('Şekil-3, 3. adım (LED): 0,1 mA ≈ 1,45 V, 1 mA ≈ 1,61 V (1N4001’de ≈ 0,47 V); en büyük akım ≈ 3,15 mA; ters yönde akım yok', () => {
    const led = sweep(load('led-karakteristigi'), 'LED1');
    const diode = sweep(load('diyot-karakteristigi'), 'D1');
    const text = answer('led-karakteristigi', '3');
    says(
      text,
      m`0,1 mA’i ≈ ${led.rising(1e-4).v} V’ta`,
      m`1 mA’i ≈ ${led.rising(1e-3).v} V’ta`,
      m`1 mA ≈ ${diode.rising(1e-3).v} V’ta`,
      m`girişin ≈ ${led.rising(1e-4).vi} V’undan`,
      m`≈ ${led.max.i * 1e3} mA`,
      m`≈ ${led.max.v} V`,
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
    says(text, m`tepe ≈ ${k1.max} V`, m`≈ ${3 - k1.max} V düşer`, m`ortalaması ≈ ${k1.avg} V`, m`≈ ${k1.max / Math.PI} V verir`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const r = halfWave({ 'FG1.frequency': f });
      says(text, m`${label} ≈ ${r.min} V`);
      if (f === 1e5) says(text, m`100 kHz’te ≈ ${r.avg} V’a`);
      if (f === 1e6) says(text, m`1 MHz’te ≈ ${r.avg} V’a`);
    }
    const five = halfWave({ 'FG1.amplitude': 10 });
    says(text, m`tepe ≈ ${five.max} V, ortalama ≈ ${five.avg} V`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      const r = halfWave({ 'FG1.amplitude': 10, 'FG1.frequency': f });
      says(text, m`${label} ≈ ${r.min} V`);
      if (f === 1e6) says(text, m`1 MHz’te ortalama ≈ ${r.avg} V`);
    }
  });

  it('Şekil-4a, 2. adım: 1 µF 1,03–2,20 V, 22 µF 1,75–1,81 V, 470 µF ≈ 1,78 V (≈ 3 mV); R_L = ∞’da ≈ 2,6–2,7 V ve dalgalanma yok', () => {
    const text = answer('yarim-dalga', '2');
    says(text, m`ortalaması ≈ ${halfWave({}).avg} V`);
    const c1 = halfWave({ 'S1.closed': true }, 0.2);
    says(text, m`1 µF’ta çıkış ${c1.min}–${c1.max} V`);
    const c2 = halfWave({ 'S2.closed': true }, 0.2);
    says(text, m`22 µF’ta ${c2.min}–${c2.max} V (dalgalanma ≈ ${c2.max - c2.min} V; ΔV ≈ V_{DC} / (f · R_{L} · C) ≈ ${c2.avg / (1e3 * 1e3 * 22e-6)} V)`);
    const c3 = halfWave({ 'S3.closed': true }, 3);
    says(text, m`470 µF’ta ≈ ${c3.avg} V’ta, dalgalanma ≈ ${(c3.max - c3.min) * 1e3} mV`);
    for (const c of ['S1', 'S2', 'S3']) {
      const open = halfWave({ [`${c}.closed`]: true, 'S4.closed': false }, c === 'S3' ? 3 : 0.2);
      between(open.avg, 2.55, 2.7);
      expect(open.max - open.min).toBeLessThan(5e-3);
    }
    says(text, '≈ 2,6–2,7 V’ta');
  }, 60_000);

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
    says(text, m`tepesi ≈ ${all.max} V`, m`≈ ${(all.max / 1e5) * 1e6} µA`, m`≈ ${(5 - all.max) / 2} V düşürür`, m`Ortalaması ≈ ${all.avg} V`, m`≈ ${(2 * all.max) / Math.PI} V verir`, '2 kHz');
    // Pozitif tepe (t = 11,25 ms) ve negatif tepe (11,75 ms): iletken diyotlar ve kanalların gerilimi.
    const on = (label: string) => sim.measure(idOf(doc, label))!.current > 10e-6;
    sim.runUntil(0.01125);
    expect(['D1', 'D2', 'D3', 'D4'].filter(on)).toEqual(['D1', 'D3']);
    const a = sim.voltageAt(`${osc}#0`)!;
    sim.runUntil(0.01175);
    expect(['D1', 'D2', 'D3', 'D4'].filter(on)).toEqual(['D2', 'D4']);
    const b = sim.voltageAt(`${osc}#1`)!;
    says(text, m`≈ ${a} V’a çıkar`, m`≈ ${b} V’a iner`);
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
    says(text, m`≈ +${sine.out.max} V ile ≈ ${sine.out.min} V`, m`(≈ ${sine.out.max - sine.out.min} V)`, m`ortalaması ≈ ${sine.out.avg} V`);
    between(sine.out.max - sine.out.min - (sine.input.max - sine.input.min), -0.1, 0.1);
    const square = clamp('negatif-kenetleyici', 'square');
    says(text, m`≈ +${square.out.max} V ile ≈ ${square.out.min} V`);
    // Alt seviyedeki eğim: negatif yarının başı ile sonu (t = 0,2 s + 0,5…1 ms).
    const doc = withProps(load('negatif-kenetleyici'), 'FG1', { waveform: 'square' });
    const sim = run(doc, 0.20055);
    const osc = idOf(doc, 'OSC1');
    const start = sim.voltageAt(`${osc}#1`)!;
    sim.runUntil(0.20098);
    says(text, m`≈ ${sim.voltageAt(`${osc}#1`)! - start} V yükselir`);
    // İlk periyot.
    const first = run(load('negatif-kenetleyici'), 0);
    says(text, m`alt tepe ≈ ${period(first, 1e-3, () => first.voltageAt(`${idOf(load('negatif-kenetleyici'), 'OSC1')}#1`)!).min} V`);
  });

  it('Şekil-9b: sinüste ≈ −0,57 / +9,11 V, kare dalgada ≈ −0,52 / +9,53 V; kondansatörün çıkış tarafı +', () => {
    const text = answer('pozitif-kenetleyici', '1');
    const sine = clamp('pozitif-kenetleyici', 'sine');
    says(text, m`≈ ${sine.out.min} V ile ≈ +${sine.out.max} V`, m`ortalaması ≈ +${sine.out.avg} V`);
    const square = clamp('pozitif-kenetleyici', 'square');
    // Üst seviyedeki eğim: pozitif yarının başı ile sonu (t = 0,2 s + 0,05…0,48 ms).
    const sq = withProps(load('pozitif-kenetleyici'), 'FG1', { waveform: 'square' });
    const tilt = run(sq, 0.20005);
    const top = tilt.voltageAt(`${idOf(sq, 'OSC1')}#1`)!;
    tilt.runUntil(0.20048);
    says(text, m`≈ ${square.out.min} V ile ≈ +${square.out.max} V`, m`≈ ${top - tilt.voltageAt(`${idOf(sq, 'OSC1')}#1`)!} V düşer`);
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
    says(text, m`(A) ≈ +${a} V`, m`(B) ≈ ${b} V`, m`V_{p} ≈ ${a} V`, m`A − B ≈ ${a - b} V`, m`(≈ ${5 - a} V;`);
    says(text, m`5 ms’de ≈ ${vp[0.005]!} V`, m`20 ms’de ≈ ${vp[0.02]!} V`, m`0,1 s’de ≈ ${vp[0.1]!} V`);
  });
});

describe('Deney 4: cevaplardaki sayılar', () => {
  /** 10 ms sonra bir periyot boyunca çıkış (B); kare dalgada her yarının ortası da. */
  function clip(id: ExampleId, waveform: 'sine' | 'square') {
    const doc = withProps(load(id), 'FG1', { waveform });
    const sim = run(doc, 0.01);
    const osc = idOf(doc, 'OSC1');
    const values: number[] = [];
    const out = period(sim, 1e-3, () => {
      const v = sim.voltageAt(`${osc}#1`)!;
      values.push(v);
      return v;
    }, 4000);
    return { ...out, high: values[1000]!, low: values[3000]!, sim, doc };
  }

  it('Şekil-13a: sinüste ≈ −9,47 V ile 0; kare dalgada −10 → +10 V sıçramasında ≈ +10,4 V’luk, ≈ 3–4 µs’lik sivri (ters toparlanma)', () => {
    const text = answer('seri-kirpici', '');
    const sine = clip('seri-kirpici', 'sine');
    says(text, m`≈ ${sine.min} V’a iner`, m`≈ ${10 + sine.min} V düşer`);
    between(sine.high, -0.05, 0.05);
    const square = clip('seri-kirpici', 'square');
    says(text, m`negatif yarıda ≈ ${square.low} V`, m`≈ +${square.max} V’a`);
    between(square.high, -0.05, 0.05);
    // Sivrinin süresi: 10 ms'deki sıçramadan sonra çıkışın 5 V'un üstünde kaldığı süre.
    const doc = withProps(load('seri-kirpici'), 'FG1', { waveform: 'square' });
    const sim = run(doc, 0.009999);
    const osc = idOf(doc, 'OSC1');
    let above = 0;
    for (let k = 0; k < 200; k++) {
      sim.advance(0.1e-6);
      if (sim.voltageAt(`${osc}#1`)! > 5) above += 0.1e-6;
    }
    between(above, 3e-6, 4e-6);
    says(text, '≈ 3–4 µs süren');
  });

  it('Şekil-13b: pozitif tepeler ≈ 4,45 V’ta kesilir (≈ 0,55 mA, V_D ≈ 0,45 V), negatif yarı ≈ −9,90 V', () => {
    const text = answer('paralel-kirpici', '');
    const sine = clip('paralel-kirpici', 'sine');
    says(text, m`≈ ${sine.max} V’ta düz kesilir`, m`V_{D} ≈ ${sine.max - 4} V`, m`≈ ${sine.min} V (osiloskobun`);
    // Tepede diyodun akımı: (10 V − 4,45 V) / 10 kΩ.
    says(text, m`diyottan ≈ ${(10 - sine.max) / 10} mA geçtiği`);
    const square = clip('paralel-kirpici', 'square');
    says(text, m`≈ +${square.high} V ve ≈ ${square.low} V`);
  });

  it('Şekil-13c: çıkış ≈ +3,46 V ile ≈ −2,46 V arasında; kare dalgada aynı seviyeler', () => {
    const text = answer('cift-kirpici', '');
    const sine = clip('cift-kirpici', 'sine');
    says(text, m`≈ +${sine.max} V ile ≈ ${sine.min} V`, m`(≈ ${sine.max - 3} V)`);
    const square = clip('cift-kirpici', 'square');
    says(text, m`≈ +${square.high} V ve ≈ ${square.low} V seviyeli`);
  });

  it('Şekil-13d: çıkış ≈ +2,51 V’un altına inemez (D1), D2 hiç iletmez; ≈ +2,51 V ile ≈ +9,90 V arası', () => {
    const text = answer('alt-kirpici', '');
    const sine = clip('alt-kirpici', 'sine');
    says(text, m`≈ +${sine.min} V’un (3 V − V_{D})`, m`≈ +${sine.min} V ile ≈ +${sine.max} V arasında`);
    // D2 iletmez: akımı D1'in tepe akımının %2'sinden küçük ve ortalaması ≈ 0 (kalan ± ≈ 10 µA eklem
    // kapasitesinin yamuk kuralı salınımı, işareti her adımda değişir).
    const d1 = period(sine.sim, 1e-3, () => sine.sim.measure(idOf(sine.doc, 'D1'))!.current);
    const d2 = period(sine.sim, 1e-3, () => sine.sim.measure(idOf(sine.doc, 'D2'))!.current);
    expect(Math.max(d2.max, -d2.min)).toBeLessThan(0.02 * d1.max);
    expect(Math.abs(d2.avg)).toBeLessThan(0.5e-6);
    const square = clip('alt-kirpici', 'square');
    says(text, m`≈ +${square.high} V ile ≈ +${square.low} V arasındadır`);
  });
});

describe('Deney 5: cevaplardaki sayılar', () => {
  /** Şekil-15: V_DD ve V_GG'de V1 (V_DS) ve A1 (I_D). */
  function point(vdd: number, vgg: number) {
    const doc = withProps(load('jfet-karakteristik'), 'PS1', { voltage1: vdd, voltage2: vgg });
    const sim = run(doc, 0);
    return { vds: sim.status(idOf(doc, 'V1')).reading!, id: sim.status(idOf(doc, 'A1')).reading!, sim, doc };
  }
  /** V_DS istenen değere gelene kadar V_DD'yi (ikiye bölerek) ayarlar. */
  function atVds(vds: number, vgg: number) {
    let lo = 0;
    let hi = 20;
    for (let k = 0; k < 30; k++) {
      const mid = (lo + hi) / 2;
      if (point(mid, vgg).vds < vds) lo = mid;
      else hi = mid;
    }
    return { ...point((lo + hi) / 2, vgg), vdd: (lo + hi) / 2 };
  }
  const row = (vds: number, id: number) => m`${vds} V → ${id * 1e3} mA`;

  it('2. adım: V_GS = 0 tablosu; doyum ≈ 1,7 V’tan sonra, 2 → 15 V’ta ≈ %22 artış; 15 V’ta ≈ 67 mW', () => {
    const text = answer('jfet-karakteristik', '2');
    const table = new Map<number, number>();
    for (const v of [0.2, 0.4, 0.6, 1, 1.4, 1.8, 2, 4, 8, 10, 15]) {
      table.set(v, atVds(v, 0).id);
      says(text, row(v, table.get(v)!));
    }
    says(text, m`≈ %${(table.get(15)! / table.get(2)! - 1) * 100} artar`, m`15 V · ${table.get(15)! * 1e3} mA ≈ ${15 * table.get(15)! * 1e3} mW`);
    // 15 V'luk V_DS için V_DD ≈ 15,45 V ("Simülasyonda:" satırı).
    between(atVds(15, 0).vdd, 15.4, 15.5);
    expect(LAB_FIGURE_TEXTS['jfet-karakteristik']!.steps[1]!.sim).toContain('V_{DD} ≈ 15,45 V');
  });

  it('3. adım: V_GS = −0,2 V ve −0,4 V tabloları; kapı akımı ≈ 11 pA', () => {
    const text = answer('jfet-karakteristik', '3');
    for (const vgg of [0.2, 0.4]) for (const v of [0.2, 1, 2, 8, 15]) says(text, row(v, atVds(v, vgg).id));
    const { sim, doc } = point(10, 0.4);
    says(text, m`(≈ ${Math.abs(sim.measure(idOf(doc, 'RG'))!.current) * 1e12} pA)`);
  });

  it('4. adım: −1,5 V ≈ 79 µA, −1,6 V ≈ 27 µA, −1,7 V ≈ 2,2 µA, −1,72 V ≈ 0,55 µA, −1,74 V’ta sıfır', () => {
    const text = answer('jfet-karakteristik', '4');
    says(text, m`−1,5 V’ta ≈ ${point(10, 1.5).id * 1e6} µA`, m`−1,6 V’ta ≈ ${point(10, 1.6).id * 1e6} µA`, m`−1,7 V’ta ≈ ${point(10, 1.7).id * 1e6} µA`, m`−1,72 V’ta ≈ ${point(10, 1.72).id * 1e6} µA`);
    expect(point(10, 1.74).id).toBeLessThan(1e-9);
  });

  it('5. adım: doyum doğrusunu V_DS = 0’a uzatınca I_DSS ≈ 3,52 mA; oranlardan V_P ≈ −1,74 V', () => {
    const text = answer('jfet-karakteristik', '5');
    const i2 = atVds(2, 0).id;
    const i15 = atVds(15, 0).id;
    const slope = (i15 - i2) / 13;
    says(text, m`2 V’ta ${i2 * 1e3} mA, 15 V’ta ${i15 * 1e3} mA`, m`I_{DSS} ≈ ${(i2 - 2 * slope) * 1e3} mA`, m`eğim ≈ ${slope * 1e3} mA/V`);
    for (const vgg of [0.2, 0.4]) {
      const ratio = atVds(8, vgg).id / atVds(8, 0).id;
      // 1 − V_GS / |V_P| = √oran → V_P.
      says(text, m`V_{P} ≈ ${-vgg / (1 - Math.sqrt(ratio))} V`);
      if (vgg === 0.2) says(text, m`≈ ${ratio}`);
    }
    expect(load('jfet-karakteristik').parts.find((p) => p.label === 'J1')!.props).toMatchObject({ idss: 0.00352, pinchOff: -1.74 });
  });
});

/** Yükselteç: `settle` sonra bir periyot (1 kHz) boyunca drain (ya da kollektör), kapının en büyük gerilimi ve R_g'nin akımı. */
function amplifier(doc: CircuitDoc, out: string, settle = 0.05) {
  const sim = run(doc, settle);
  const q = idOf(doc, out);
  const fg = idOf(doc, 'FG1');
  const rg = doc.parts.find((p) => p.label === 'RG' || p.label === 'RB')!.id;
  let atMin = 0;
  let atMax = 0;
  let gate = Number.NEGATIVE_INFINITY;
  let ig = 0;
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const r = period(sim, 1e-3, () => {
    const v = sim.voltageAt(`${q}#0`)!;
    if (v < lo) {
      lo = v;
      atMin = sim.voltageAt(`${fg}#0`)!;
    }
    if (v > hi) {
      hi = v;
      atMax = sim.voltageAt(`${fg}#0`)!;
    }
    gate = Math.max(gate, sim.voltageAt(`${q}#1`)!);
    ig = Math.max(ig, Math.abs(sim.measure(rg)!.current));
    return v;
  });
  const amplitude = doc.parts.find((p) => p.label === 'FG1')!.props.amplitude as number;
  return { ...r, gain: (r.max - r.min) / amplitude, atMin, atMax, gate, ig, sim };
}

describe('Deney 6: cevaplardaki sayılar', () => {
  const fet = (props: Record<string, number>, rd?: number) => {
    let doc = withProps(load('fet-yukseltec'), 'FG1', props);
    if (rd !== undefined) doc = withProps(doc, 'RD', { resistance: rd });
    return doc;
  };
  /** Dinlenme noktası (giriş 0): V_DS ve I_D. */
  function rest(doc: CircuitDoc) {
    const sim = run(withProps(doc, 'FG1', { amplitude: 0 }), 0.01);
    const j = idOf(doc, 'J1');
    return { vds: sim.measure(j)!.voltage, id: sim.pinCurrents(j)![0]! };
  }

  it('1. adım: R_d = 10 · 1,74 / (2 · 3,52 mA) ≈ 2,47 kΩ → 2,7 kΩ; V_GS = 0’da I_D ≈ 3,81 mA, V_DS ≈ 4,70 V; kazanç ≈ 10,1', () => {
    const text = answer('fet-yukseltec', '1');
    const doc = load('fet-yukseltec');
    expect(doc.parts.find((p) => p.label === 'RD')!.props.resistance).toBe(2700);
    expect(doc.parts.find((p) => p.label === 'RG')!.props.resistance).toBe(10000);
    expect(doc.parts.find((p) => p.label === 'PS1')!.props.voltage1).toBe(15);
    const op = rest(doc);
    says(text, m`≈ ${(10 * 1.74) / (2 * 3.52e-3) / 1e3} kΩ`, m`formül ≈ ${(2 * 3.52e-3 * 2700) / 1.74} verir`, m`I_{D} ≈ ${op.id * 1e3} mA`, m`≈ ${op.vds} V`);
    between(15 - op.id * 2700 - op.vds, -0.01, 0.01);
    says(text, m`kazanç ≈ ${amplifier(doc, 'J1').gain}`);
  });

  it('2a ve 2b: 0,5 V t-t’de drain 2,11–7,14 V (≈ 5,03 V t-t, K ≈ 10,1), r_o ≈ 15 kΩ; faz 180°', () => {
    const doc = load('fet-yukseltec');
    const r = amplifier(doc, 'J1');
    const op = rest(doc);
    const text = answer('fet-yukseltec', '2a');
    says(text, m`drain ${r.min} V ile ${r.max} V`, m`≈ ${r.max - r.min} V tepe-tepe`, m`≈ ${r.gain} (0,1 V`, m`(${op.vds} V) ≈ ${r.max - op.vds} V üstüne, ≈ ${op.vds - r.min} V altına`);
    says(text, m`0,1 V tepe-tepe girişte de ≈ ${amplifier(fet({ amplitude: 0.1 }), 'J1').gain}`, m`≈ ${1 / (0.0177 * op.id) / 1e3} kΩ`);
    // Faz: drain'in en alt noktası girişin pozitif tepesinde, en üst noktası negatif tepesinde.
    between(r.atMin, 0.24, 0.26);
    between(r.atMax, -0.26, -0.24);
    says(answer('fet-yukseltec', '2b'), '180°', m`(≈ ${r.min} V)`, m`(≈ ${r.max} V)`);
  });

  it('3. adım: 1 V t-t 1,36–9,36 V (≈ 8,0); 2 V t-t 1,20–12,87 V, kapı ≈ 0,66 V, ≈ 34 µA; 4 V t-t’de drain ≈ 14,98 V’a çıkar', () => {
    const text = answer('fet-yukseltec', '3');
    const one = amplifier(fet({ amplitude: 1 }), 'J1');
    says(text, m`çıkış ${one.min}–${one.max} V (${one.max - one.min} V tepe-tepe, kazanç ≈ ${one.gain})`);
    const two = amplifier(fet({ amplitude: 2 }), 'J1');
    says(text, m`girişte ${two.min}–${two.max} V`, m`kapı ≈ ${two.gate} V’ta`, m`≈ ${two.ig * 1e6} µA`, m`drain ≈ ${two.min} V’a`);
    const four = amplifier(fet({ amplitude: 4 }), 'J1');
    says(text, m`(≈ ${four.max} V)`);
  });

  it('4. adım: kayma −0,5 V ve R_D = 3,3 kΩ’da V_DS ≈ 8,23 V, kazanç ≈ 9,8, 2 V t-t’de kapı akımı ≈ 0,1 µA; kuplajlı devre 2 V t-t’de ortalama 4,67 → 7,89 V, çıkış 1,24–14,49 V', () => {
    const text = answer('fet-yukseltec', '4');
    says(text, m`V_{DS} ≈ ${rest(fet({ offset: -0.5 }, 3300)).vds} V`, m`kazanç ≈ ${amplifier(fet({ offset: -0.5 }, 3300), 'J1').gain}`, m`≈ ${amplifier(fet({ offset: -0.5, amplitude: 2 }, 3300), 'J1').ig * 1e6} µA’de`);
    const coupled = (amplitude: number) => amplifier(withProps(load('fet-yukseltec-kuplajli'), 'FG1', { amplitude }), 'J1', 0.5);
    const small = coupled(0.5);
    const big = coupled(2);
    says(text, m`ortalaması ${small.avg} V’tan ${big.avg} V’a`, m`çıkış yine ${big.min}–${big.max} V`);
    expect(LAB_FIGURE_TEXTS['fet-yukseltec']!.questions.find((q) => q.step === '4')!.link).toBe('fet-yukseltec-kuplajli');
  });
});

describe('Deney 7: cevaplardaki sayılar', () => {
  const bjt = (props: Record<string, number | string>, rb?: number) => {
    let doc = withProps(load('bjt-yukseltec'), 'FG1', props);
    if (rb !== undefined) doc = withProps(doc, 'RB', { resistance: rb });
    return doc;
  };
  /** Dinlenme noktası (giriş 0, kayma `offset`): V_CE, I_C, I_B, V_BE. */
  function rest(offset: number, rb?: number) {
    const doc = bjt({ amplitude: 0, offset }, rb);
    const sim = run(doc, 0.005);
    const q = idOf(doc, 'Q1');
    const [ic, ib] = sim.pinCurrents(q)!;
    return { vce: sim.measure(q)!.voltage, ic: ic!, ib: ib!, vbe: sim.voltageAt(`${q}#1`)! };
  }
  const gainAt = (props: Record<string, number | string>, rb?: number) => {
    const f = (props.frequency as number | undefined) ?? 1e3;
    const doc = bjt(props, rb);
    const sim = run(doc, 0.005 + 20 / f);
    const q = idOf(doc, 'Q1');
    const r = period(sim, 1 / f, () => sim.voltageAt(`${q}#0`)!);
    return { ...r, gain: (r.max - r.min) / ((props.amplitude as number | undefined) ?? 0.2) };
  };

  it('1. adım: K = 200 · 1 kΩ / 10 kΩ = 20, kayma ≈ 0,68 + 0,30 ≈ 0,98 V; ölçülen 16,3; β_ac ≈ 179, r_π ≈ 0,8 kΩ, düzeltilmiş ≈ 16,5; R_B = 8,2 kΩ’da ≈ 19,5', () => {
    const text = answer('bjt-yukseltec', '1');
    const doc = load('bjt-yukseltec');
    expect(doc.parts.find((p) => p.label === 'Q1')!.props.beta).toBe(200);
    expect(doc.parts.find((p) => p.label === 'FG1')!.props.offset).toBe(0.98);
    const op = rest(0.98);
    says(text, m`≈ ${op.vbe} V + ${op.ib * 1e4} V ≈ 0,98 V`);
    const g = gainAt({});
    says(text, m`kazanç ${g.gain} (0,2 V tepe-tepe girişte kollektör ${g.min}–${g.max} V)`);
    // Küçük işaret β'sı: kaymayı ±10 mV değiştirince ΔI_C / ΔI_B.
    const lo = rest(0.97);
    const hi = rest(0.99);
    const bac = (hi.ic - lo.ic) / (hi.ib - lo.ib);
    const rpi = (bac * 0.025852) / op.ic;
    says(text, m`β_{ac} ≈ ${bac}`, m`(≈ ${op.ic / op.ib})`, m`≈ ${rpi / 1e3} kΩ`, m`≈ ${(bac * 1000) / (10000 + rpi + 50)} (50 Ω`);
    const op82 = rest(0.928, 8200);
    const g82 = gainAt({ offset: 0.928 }, 8200);
    says(text, m`V_{CE} = ${op82.vce} V, I_{C} = ${op82.ic * 1e3} mA`, m`kazanç ${g82.gain}`, m`kollektör ${g82.min}–${g82.max} V`);
  });

  it('2. adım: 0,98 V’ta V_CE ≈ 6,02 V, I_C ≈ 5,98 mA, I_B ≈ 29,5 µA; 0,9 V → 7,35 V, 1,05 V → 4,90 V; K ≈ 16,3, 180°', () => {
    const text = answer('bjt-yukseltec', '2');
    const op = rest(0.98);
    says(text, m`V_{CE} ≈ ${op.vce} V, I_{C} ≈ ${op.ic * 1e3} mA, I_{B} ≈ ${op.ib * 1e6} µA (β_{DC} ≈ ${op.ic / op.ib})`);
    const a = rest(0.9).vce;
    const b = rest(1.05).vce;
    says(text, m`0,9 V’ta V_{CE} ≈ ${a} V, 1,05 V’ta ≈ ${b} V`, m`≈ ${((a - b) / 0.15) * 0.1} V kaydırır`);
    const g = gainAt({});
    says(text, m`kollektör ${g.min} V ile ${g.max} V arasında, yani ${g.max - g.min} V tepe-tepe`, m`K_{υ} ≈ ${g.gain}`);
    // Faz: girişin pozitif tepesinde (t = 10,25 ms) kollektör en altta.
    const doc = load('bjt-yukseltec');
    const sim = run(doc, 0.01025);
    between(sim.voltageAt(`${idOf(doc, 'Q1')}#0`)!, g.min - 0.02, g.min + 0.05);
  });

  it('3. adım: genlikle kazanç 16,2 → 11,8 (doyum ve kesim); frekansla 16,3 → 5,6; üst kesim 350–400 kHz arasında', () => {
    const text = answer('bjt-yukseltec', '3');
    const k0 = gainAt({}).gain;
    says(text, m`0,4 V tepe-tepe girişte kazanç ≈ ${gainAt({ amplitude: 0.4 }).gain}`);
    const a6 = gainAt({ amplitude: 0.6 });
    says(text, m`0,6 V’ta ≈ ${a6.gain} (kollektör ${a6.min}–${a6.max} V)`);
    const a8 = gainAt({ amplitude: 0.8 });
    says(text, m`≈ ${a8.min} V’ta düzleşir (doyum), kazanç ≈ ${a8.gain}`);
    const a10 = gainAt({ amplitude: 1 });
    says(text, m`(≈ ${a10.max} V) düzleşir (kesim), kazanç ≈ ${a10.gain}`);
    for (const [f, label] of [
      [1e4, '10 kHz’te'],
      [1e5, '100 kHz’te'],
      [5e5, '500 kHz’te'],
      [1e6, '1 MHz’te'],
    ] as const) {
      says(text, m`${label} ≈ ${gainAt({ frequency: f }).gain}`);
    }
    expect(gainAt({ frequency: 3.5e5 }).gain).toBeGreaterThan(k0 / Math.SQRT2);
    expect(gainAt({ frequency: 4e5 }).gain).toBeLessThan(k0 / Math.SQRT2);
    says(text, m`(≈ ${k0 / Math.SQRT2})`);
  }, 60_000);

  it('4. adım: kare dalgada kollektör ≈ 4,43 / 7,69 V; yükselme süresi ≈ 1 µs (0,35 / 370 kHz ≈ 0,95 µs)', () => {
    const text = answer('bjt-yukseltec', '4');
    const doc = bjt({ waveform: 'square' });
    const q = idOf(doc, 'Q1');
    const sim = run(doc, 0.01);
    const r = period(sim, 1e-3, () => sim.voltageAt(`${q}#0`)!);
    says(text, m`kollektör ≈ ${r.min} V, alçak yarısında ≈ ${r.max} V (${r.max - r.min} V tepe-tepe`);
    // 10,5 ms'de giriş düşer, kollektör yükselir: %10'dan %90'a geçen süre.
    const edge = run(doc, 0.0104999);
    const lo = r.min + 0.1 * (r.max - r.min);
    const hi = r.min + 0.9 * (r.max - r.min);
    let t10 = Number.NaN;
    let t90 = Number.NaN;
    for (let k = 0; k < 200; k++) {
      edge.advance(0.02e-6);
      const v = edge.voltageAt(`${q}#0`)!;
      if (Number.isNaN(t10) && v >= lo) t10 = edge.time;
      if (Number.isNaN(t90) && v >= hi) t90 = edge.time;
    }
    says(text, m`≈ ${(t90 - t10) * 1e6} µs’de`, m`≈ 0,35 / 370 kHz ≈ ${0.35 / 370e3 * 1e6} µs`);
  });
});

describe('Deney 8: cevaplardaki sayılar', () => {
  const mos = (props: Record<string, number>) => withProps(load('mosfet-yukseltec'), 'FG1', props);
  /** 1 periyot boyunca drain; çukurun girişin tepesinden kaç derece sonra geldiği. */
  function drain(props: Record<string, number>) {
    const f = props.frequency ?? 1e3;
    const doc = mos(props);
    const sim = run(doc, 0.01 + 5 / f);
    const m = idOf(doc, 'M1');
    const fg = idOf(doc, 'FG1');
    let tMin = 0;
    let tIn = 0;
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let k = 0;
    const r = period(sim, 1 / f, () => {
      const v = sim.voltageAt(`${m}#0`)!;
      const vi = sim.voltageAt(`${fg}#0`)!;
      if (v < lo) {
        lo = v;
        tMin = k;
      }
      if (vi > hi) {
        hi = vi;
        tIn = k;
      }
      k += 1;
      return v;
    }, 4000);
    return { ...r, gain: (r.max - r.min) / ((props.amplitude as number | undefined) ?? 0.1), lag: ((tMin - tIn) / 4000) * 360 };
  }
  const vds = (offset: number) => {
    const doc = mos({ amplitude: 0, offset });
    return run(doc, 0.005).measure(idOf(doc, 'M1'))!.voltage;
  };

  it('3. adım: 10 mV t-t’de K ≈ 172 (6,62–8,35 V); g_m ≈ 0,193 S, hesap ≈ 193, 100 Hz’te ≈ 191; 0,1 V t-t’de 2,25–13,97 V (≈ 117); 1 mV kayma ≈ 0,19 V', () => {
    const text = answer('mosfet-yukseltec', '3');
    const small = drain({ amplitude: 0.01 });
    says(text, m`drain ${small.min}–${small.max} V`, m`≈ ${small.max - small.min} V tepe-tepe`, m`K_{υ} ≈ ${small.gain} ve`);
    const doc = mos({ amplitude: 0 });
    const sim = run(doc, 0.005);
    const id = sim.pinCurrents(idOf(doc, 'M1'))![0]!;
    const k = doc.parts.find((p) => p.label === 'M1')!.props.k as number;
    const gm = 2 * Math.sqrt(k * id);
    says(text, m`I_{D} ≈ ${id * 1e3} mA`, m`≈ ${gm} S`, m`≈ ${gm * 1000}. 100 Hz’te ölçülen kazanç ≈ ${drain({ amplitude: 0.01, frequency: 100 }).gain}`);
    const big = drain({});
    says(text, m`≈ ${big.min} V ile ${big.max} V`, m`oran ≈ ${big.gain})`);
    says(text, m`3,907 V’ta ${vds(3.907)} V; 3,897 V’ta ≈ ${vds(3.897)} V; 3,917 V’ta ≈ ${vds(3.917)} V`, m`≈ ${(vds(3.897) - vds(3.917)) / 20} V kaydırır`);
  }, 60_000);

  it('4. adım: ≈ 180° (tepede ≈ 6,73 V, çukurda ≈ 8,29 V); 1 kHz’te çukur ≈ 27° gecikir, 100 Hz’te ≈ 3°', () => {
    const text = answer('mosfet-yukseltec', '4');
    const doc = mos({ amplitude: 0.01 });
    const sim = run(doc, 0.00525);
    const at = sim.voltageAt(`${idOf(doc, 'M1')}#0`)!;
    sim.runUntil(0.00575);
    says(text, m`tepesinde ≈ ${at} V, çukurunda ≈ ${sim.voltageAt(`${idOf(doc, 'M1')}#0`)!} V`);
    const lag = drain({ amplitude: 0.01 }).lag;
    says(text, m`≈ ${lag}° sonra gelir (faz farkı ≈ ${180 + lag}°)`, m`≈ ${drain({ amplitude: 0.01, frequency: 100 }).lag}°’ye iner`);
  }, 60_000);

  it('5. adım: 0,05 V t-t 3,60–11,40 V (≈ 156); 0,2 V t-t 0,68–14,99 V; 1 V t-t ≈ 0,01–14,99 V (≈ 15)', () => {
    const text = answer('mosfet-yukseltec', '5');
    const a5 = drain({ amplitude: 0.05 });
    says(text, m`0,05 V tepe-tepede ${a5.min}–${a5.max} V, oran ≈ ${a5.gain}`);
    const a20 = drain({ amplitude: 0.2 });
    says(text, m`(${a20.min}–${a20.max} V)`);
    const a100 = drain({ amplitude: 1 });
    says(text, m`≈ ${a100.min} V ile ${a100.max} V`, m`(oran ≈ ${a100.gain})`);
    // Pozitif yarıda en büyük akım V_DD / R_D ≈ 15 mA.
    between((15 - a100.min) / 1000, 14.9e-3, 15.1e-3);
  });
});

describe('Deney 9: cevaplardaki sayılar', () => {
  /** Girişin (TTL) yüksek (0,25 s) ve alçak (0,75 s) yarısında transistör ve LED. */
  function both(id: 'bjt-anahtar' | 'bjt-anahtar-emetor') {
    const doc = load(id);
    const sim = run(doc, 0);
    const q = idOf(doc, 'Q1');
    const led = idOf(doc, 'LED1');
    const at = (t: number) => {
      sim.runUntil(t);
      const [ic, ib] = sim.pinCurrents(q)!;
      return {
        ttl: sim.voltageAt(`${idOf(doc, 'FG1')}#1`)!,
        ib: ib!,
        ic: ic!,
        vce: sim.measure(q)!.voltage,
        vb: sim.voltageAt(`${q}#1`)!,
        ve: sim.voltageAt(`${q}#2`)!,
        region: sim.status(q).region,
        led: sim.measure(led)!.current,
        vled: sim.measure(led)!.voltage,
      };
    };
    return { high: at(0.25), low: at(0.75) };
  }

  it('Şekil-24, 3. adım: giriş 0 V’ta LED ≈ 10,22 mA ile yanar (≈ 1,79 V), 5 V’ta doyum (I_B ≈ 0,43 mA, β·I_B ≈ 85 mA, I_C ≈ 11,95 mA, V_CE ≈ 0,05 V), LED söner', () => {
    const text = answer('bjt-anahtar', '3');
    const { high, low } = both('bjt-anahtar');
    expect(low.region).toBe('cutoff');
    says(text, m`≈ ${low.led * 1e3} mA`, m`gerilimi ≈ ${low.vled} V`);
    expect(high.region).toBe('saturation');
    expect(Math.abs(high.led)).toBeLessThan(1e-6);
    const beta = load('bjt-anahtar').parts.find((p) => p.label === 'Q1')!.props.beta as number;
    says(
      text,
      m`TTL ≈ ${high.ttl} V`,
      m`(${high.ttl} V − ${high.vb} V) / 10 kΩ ≈ ${high.ib * 1e3} mA`,
      m`β · I_{B} ≈ ${beta * high.ib * 1e3} mA`,
      m`≈ ${(12 - high.vce) / 1000 * 1e3} mA’den`,
      m`I_{C} ≈ ${high.ic * 1e3} mA, V_{CE} ≈ ${high.vce} V`,
    );
  });

  it('Şekil-25, 4. adım: giriş 5 V’ta LED ≈ 2,55 mA (aktif, V_CE ≈ 7,78 V, emetör ≈ 4,22 V, V_BE ≈ 0,66 V, I_B ≈ 12 µA); 0 V’ta söner', () => {
    const text = answer('bjt-anahtar-emetor', '4');
    const { high, low } = both('bjt-anahtar-emetor');
    const other = both('bjt-anahtar');
    expect(high.region).toBe('active');
    says(
      text,
      m`≈ ${high.led * 1e3} mA, Şekil-24’teki ≈ ${other.low.led * 1e3} mA’in`,
      m`(V_{CE} ≈ ${high.vce} V)`,
      m`≈ ${high.vb - high.ve} V geriden`,
      m`Emetör ≈ ${high.ve} V’ta; akım I ≈ (${high.ve} V − ${high.vled} V) / 1 kΩ ≈ ${high.led * 1e3} mA`,
      m`≈ ${high.ib * 1e6} µA`,
    );
    between(other.low.led / high.led, 3.8, 4.2);
    expect(low.region).toBe('cutoff');
    expect(Math.abs(low.led)).toBeLessThan(1e-6);
  });
});
