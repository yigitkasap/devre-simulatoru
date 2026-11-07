// Analiz v2: föydeki grafikler (i18n/foyGraphs). Her föy şeklinin grafikleri devrede kurulur ve sonuçları
// simülasyonla ölçülür: beklenen sayılar föy kartlarından ve örneklerin açıklamalarından.

import { describe, expect, it } from 'vitest';
import { runDcSweep } from '../src/editor/analysis/dcsweep';
import { resolveFoyPlan, type ResolvedFoyPlan } from '../src/editor/analysis/foyPlan';
import { traceValue } from '../src/editor/analysis/recorder';
import { foyMarks, sweepAt } from '../src/editor/analysis/SweepPane';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../src/examples';
import { labFigure } from '../src/i18n/foy';
import { foyEyebrow, FOY_GRAPHS, type FoyGraphDef } from '../src/i18n/foyGraphs';
import type { Quantity } from '../src/model/analysis';
import { buildConnectivity } from '../src/model/connectivity';
import { CircuitSimulator } from '../src/sim';

const def = (example: string, key: string): FoyGraphDef => FOY_GRAPHS[example]!.find((g) => g.key === key)!;
const plan = (example: string, key: string): ResolvedFoyPlan => resolveFoyPlan(def(example, key), exampleDoc(example as ExampleId)!)!;

/** Zaman grafiğinin büyüklükleri [from, until] aralığında dt adımla: her büyüklüğün en küçüğü ve en büyüğü. */
function record(example: string, key: string, from: number, until: number, dt: number) {
  const p = plan(example, key);
  if (p.kind !== 'time') throw new Error('zaman grafiği değil');
  const sim = new CircuitSimulator(buildConnectivity(exampleDoc(example as ExampleId)!).netlist);
  expect(sim.runUntil(from).ok).toBe(true);
  const qs: Quantity[] = [...p.y, ...(p.x ? [p.x] : [])];
  const lo = qs.map(() => Infinity);
  const hi = qs.map(() => -Infinity);
  for (let t = from; t <= until; t += dt) {
    expect(sim.runUntil(t).ok).toBe(true);
    qs.forEach((q, i) => {
      const v = traceValue(sim, q);
      lo[i] = Math.min(lo[i]!, v);
      hi[i] = Math.max(hi[i]!, v);
    });
  }
  return { lo, hi, pp: hi.map((h, i) => h - lo[i]!) };
}

/** Zaman grafiğinin ilk iki büyüklüğü (giriş, çıkış), girişin pozitif tepesinde (1 kHz; [from, from + 1 ms]). */
function atPositivePeak(example: string, key: string, from: number) {
  const p = plan(example, key);
  if (p.kind !== 'time') throw new Error('zaman grafiği değil');
  const sim = new CircuitSimulator(buildConnectivity(exampleDoc(example as ExampleId)!).netlist);
  expect(sim.runUntil(from).ok).toBe(true);
  let best = { input: -Infinity, output: Number.NaN };
  for (let t = from; t <= from + 1e-3; t += 1e-5) {
    expect(sim.runUntil(t).ok).toBe(true);
    const input = traceValue(sim, p.y[0]!);
    if (input > best.input) best = { input, output: traceValue(sim, p.y[1]!) };
  }
  return best;
}

describe('Analiz v2: föydeki grafikler', { timeout: 120_000 }, () => {
  it('föydeki her şeklin en az bir grafiği var; hepsi devrede kuruluyor; kart yazıları', () => {
    for (const id of EXAMPLE_IDS) if (labFigure(id)) expect(FOY_GRAPHS[id]?.length ?? 0, id).toBeGreaterThan(0);
    for (const [example, defs] of Object.entries(FOY_GRAPHS)) {
      expect(labFigure(example as ExampleId), example).not.toBeNull();
      for (const d of defs) expect(resolveFoyPlan(d, exampleDoc(example as ExampleId)!), `${example}/${d.key}`).not.toBeNull();
    }
    expect(foyEyebrow(def('jfet-karakteristik', 'id-vds'))).toBe('ADIM 2–3 · ÇIKIŞ KARAKTERİSTİĞİ');
    expect(foyEyebrow(def('fet-yukseltec', 'bode'))).toBe('EK · FREKANS YANITI');
    expect(foyEyebrow(def('seri-kirpici', 'giris-cikis'))).toBe('GİRİŞ VE ÇIKIŞ');
    // Parçası silinmiş devrede kurulmaz.
    const doc = exampleDoc('jfet-karakteristik')!;
    expect(resolveFoyPlan(def('jfet-karakteristik', 'id-vds'), { ...doc, parts: doc.parts.filter((p) => p.label !== 'A1') })).toBeNull();
  });

  it('Deney 1 Şekil-2 (adım 1): D1’in I–V eğrisi; 5 V’ta I ≈ 4,44 mA, V_D ≈ 0,56 V', () => {
    const p = plan('diyot-dc', 'iv-dc');
    if (p.kind !== 'sweep') throw new Error('tarama değil');
    const [curve] = runDcSweep({ netlist: buildConnectivity(exampleDoc('diyot-dc')!).netlist, ...p.sweep });
    expect(curve!.points.length).toBe(15);
    const last = curve!.points[curve!.points.length - 1]!;
    expect(last[0]).toBe(5);
    expect(last[1]).toBeCloseTo(0.56, 1);
    expect(last[2]! * 1e3).toBeCloseTo(4.44, 1);
  });

  it('Deney 1 Şekil-3 (adım 2a, 3): X-Y’de en büyük akım D1 ≈ 4,2 mA, LED ≈ 3,2 mA; zenerde ters yönde ≈ 4,4 mA', () => {
    // y = OSC1 · B = 1 kΩ'un gerilimi (1 V ↔ 1 mA); 1 kHz, bir periyot.
    expect(record('diyot-karakteristigi', 'iv-xy', 0.01, 0.011, 1e-5).hi[0]).toBeCloseTo(4.2, 1);
    // Açıklamadaki "≈ 3,2 mA" bir ondalığa yuvarlanmış: 3,15 ile 3,25 arası.
    expect(Math.abs(record('led-karakteristigi', 'iv-xy', 0.01, 0.011, 1e-5).hi[0]! - 3.2)).toBeLessThanOrEqual(0.05 + 1e-3);
    expect(record('zener-karakteristigi', 'iv-xy', 0.01, 0.011, 1e-5).lo[0]).toBeCloseTo(-4.4, 0);
  });

  it('Deney 2–4: doğrultmaç, kenetleyici, katlayıcı ve kırpıcıların çıkışı açıklamadaki sayılarla', () => {
    const v = {
      yarim: record('yarim-dalga', 'giris-cikis', 0.02, 0.021, 1e-5).hi[1],
      kopru: record('kopru-dogrultmac', 'giris-cikis', 0.02, 0.021, 1e-5).hi[1],
      negatif: record('negatif-kenetleyici', 'giris-cikis', 0.2, 0.201, 1e-5).hi[1],
      pozitif: record('pozitif-kenetleyici', 'giris-cikis', 0.2, 0.201, 1e-5).lo[1],
      katlayici: record('gerilim-katlayici', 'katlayici', 0.4, 0.401, 1e-5).hi[2],
      seriLo: record('seri-kirpici', 'giris-cikis', 0.02, 0.021, 1e-5).lo[1],
      // Pozitif yarıda çıkış kırpılmış (≈ 0 V): girişin tepesinde. (En büyük değer değil: diyot kesime
      // geçerken 1N4001'in ters toparlanma akımı kısa bir ≈ 0,2 V sıçrama yapar.)
      seriAtPeak: atPositivePeak('seri-kirpici', 'giris-cikis', 0.02),
      altLo: record('alt-kirpici', 'giris-cikis', 0.02, 0.021, 1e-5).lo[1],
      altHi: record('alt-kirpici', 'giris-cikis', 0.02, 0.021, 1e-5).hi[1],
    };
    expect.soft(v.yarim).toBeCloseTo(2.36, 1);
    expect.soft(v.kopru).toBeCloseTo(4.36, 1);
    expect.soft(v.negatif).toBeCloseTo(0.6, 0);
    expect.soft(v.pozitif).toBeCloseTo(-0.6, 0);
    expect.soft(v.katlayici).toBeCloseTo(9.2, 0);
    expect.soft(v.seriLo).toBeCloseTo(-9.47, 1);
    expect.soft(v.seriAtPeak.input).toBeGreaterThan(9.9);
    expect.soft(v.seriAtPeak.output).toBeCloseTo(0, 1);
    expect.soft(v.altLo).toBeCloseTo(2.51, 1);
    expect.soft(v.altHi).toBeCloseTo(9.9, 1);
  });

  it('Deney 5: V_GS = 0 eğrisinin doyumu V_DS = 0’a uzatılınca I_DSS ≈ 3,52 mA (föy kartı); transferde V_P ≈ −1,74 V, V_GS = 0’da I_D ≈ 4,12 mA', () => {
    const doc = exampleDoc('jfet-karakteristik')!;
    const netlist = buildConnectivity(doc).netlist;
    const out = plan('jfet-karakteristik', 'id-vds');
    if (out.kind !== 'sweep') throw new Error('tarama değil');
    const [zero] = runDcSweep({ netlist, ...out.sweep });
    // Doyum bölgesi (V_DS 2 … 15 V) en küçük kareler doğrusu.
    const sat = zero!.points.filter((p) => p[1]! >= 2);
    const n = sat.length;
    const mx = sat.reduce((s, p) => s + p[1]!, 0) / n;
    const my = sat.reduce((s, p) => s + p[2]!, 0) / n;
    const slope = sat.reduce((s, p) => s + (p[1]! - mx) * (p[2]! - my), 0) / sat.reduce((s, p) => s + (p[1]! - mx) ** 2, 0);
    expect((my - slope * mx) * 1e3).toBeCloseTo(3.52, 1);
    expect(sweepAt(zero!.points, 2, 8) * 1e3).toBeCloseTo(4.02, 1);
    const tf = plan('jfet-karakteristik', 'id-vgs');
    if (tf.kind !== 'sweep') throw new Error('tarama değil');
    // İşaret V_{GS} = 0'daki akım (4,12 mA, V_{DS} ≈ 9,6 V); föy kartındaki I_{DSS} (3,52 mA) yukarıdaki uzatmayla.
    const marks = foyMarks({ example: 'jfet-karakteristik', key: 'id-vgs' }, runDcSweep({ netlist, ...tf.sweep }))!;
    expect(marks.vp!).toBeCloseTo(-1.74, 1);
    expect(marks.zero!.value * 1e3).toBeCloseTo(4.12, 1);
  });

  it('Deney 6–8: giriş ve çıkış; kazanç FET ≈ 10, BJT ≈ 16; MOSFET’te çıkış ≈ 2,3 V ile 14,0 V arasında; Bode grafiği kuruluyor', () => {
    const fet = record('fet-yukseltec', 'giris-cikis', 0.05, 0.052, 1e-5);
    expect(fet.pp[1]! / fet.pp[0]!).toBeCloseTo(10, 0);
    const bjt = record('bjt-yukseltec', 'giris-cikis', 0.05, 0.052, 1e-5);
    expect(bjt.pp[1]! / bjt.pp[0]! / 16).toBeCloseTo(1, 1);
    const mos = record('mosfet-yukseltec', 'giris-cikis', 0.05, 0.052, 1e-5);
    expect(mos.lo[1]).toBeCloseTo(2.3, 0);
    expect(mos.hi[1]).toBeCloseTo(14, 0);
    for (const id of ['fet-yukseltec', 'bjt-yukseltec', 'mosfet-yukseltec']) expect(plan(id, 'bode').kind).toBe('bode');
  });

  it('Deney 9: TTL 0/5 V; ortak emetörde LED ≈ 10 mA (giriş 0 V’ta), emetörde ≈ 2,55 mA (giriş 5 V’ta)', () => {
    const a = record('bjt-anahtar', 'anahtar', 0.05, 1.05, 0.01);
    expect(a.lo[0]).toBeCloseTo(0, 1);
    expect(a.hi[0]).toBeCloseTo(5, 1);
    expect(a.hi[1]! * 1e3).toBeCloseTo(10, 0);
    const e = record('bjt-anahtar-emetor', 'anahtar', 0.05, 1.05, 0.01);
    expect(e.hi[1]! * 1e3).toBeCloseTo(2.55, 1);
    expect(e.lo[1]! * 1e3).toBeCloseTo(0, 1);
  });
});
