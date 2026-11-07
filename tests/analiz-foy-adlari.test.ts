// Analiz v2: föy grafiklerinde föyün adları (eksenler, eğri ve iz adları, kartlar, CSV), Deney 5'in
// transfer işareti ("I_{D} (V_{GS} = 0, V_{DS} ≈ 9,6 V)", I_{DSS} değil) ve grafik yazılarının yerleşimi
// (işaret yazıları çizgilerle çakışmaz, sığmayan adlar alttaki açıklamaya geçer).

import { describe, expect, it } from 'vitest';
import { legendLayout, pickSpot, segmentHitsBox, textWidth, type Box } from '../src/editor/analysis/chartText';
import { dcPointValue, runDcSweep, sweepParams } from '../src/editor/analysis/dcsweep';
import { foyNames, resolveFoyPlan, resolveFoyQuantity } from '../src/editor/analysis/foyPlan';
import { quantityKey } from '../src/editor/analysis/quantities';
import { familyText, foyMarks, sweepAxes, sweepCsv, zeroMark } from '../src/editor/analysis/SweepPane';
import { netIndex } from '../src/editor/analysis/traces';
import { exampleDoc, type ExampleId } from '../src/examples';
import { FOY_GRAPHS, type FoyQuantity } from '../src/i18n/foyGraphs';
import type { SweepSpec } from '../src/model/analysis';
import { buildConnectivity } from '../src/model/connectivity';

const doc = (id: string) => exampleDoc(id as ExampleId)!;
const namesApi = (id: string) => {
  const d = doc(id);
  return { circuit: d, sweepParams: sweepParams(d), idx: netIndex(d, buildConnectivity(d)) };
};
const sweepOf = (example: string, key: string): SweepSpec => {
  const p = resolveFoyPlan(FOY_GRAPHS[example]!.find((g) => g.key === key)!, doc(example))!;
  if (p.kind !== 'sweep') throw new Error('tarama değil');
  return p.sweep;
};

describe('Analiz v2: föy grafiklerinde föyün adları', () => {
  it('her föy grafiğinin her büyüklüğünün föydeki adı var, devrede çözülüyor ve kartta "föy adı (devredeki adı)" yazıyor', () => {
    let graphs = 0;
    for (const [example, defs] of Object.entries(FOY_GRAPHS)) {
      for (const d of defs) {
        graphs++;
        const names = foyNames({ example, key: d.key }, doc(example));
        expect(names, `${example}/${d.key}`).not.toBeNull();
        const plan = d.plan;
        if (plan.kind === 'bode') {
          expect(names!.bode!.inputKey, example).not.toBeNull();
          expect(names!.bode!.outputKey, example).not.toBeNull();
          expect(d.detail).toContain(`${plan.input.name} (FG1)`);
          expect(d.detail).toContain(`${plan.output.name} (OSC1 B)`);
          continue;
        }
        const qs: FoyQuantity[] = [...plan.y, ...(plan.x ? [plan.x] : [])];
        for (const f of qs) {
          expect(f.name, `${example}/${d.key}`).toMatch(/\S/);
          const q = resolveFoyQuantity(f, doc(example));
          expect(q, `${example}/${d.key} ${f.name}`).not.toBeNull();
          expect(names!.quantities.get(quantityKey(q!))).toBe(f.name);
          // Kartta föydeki ad, ardından parantez içinde ya da "=" ile devredeki ad.
          expect(d.detail, `${example}/${d.key}`).toMatch(new RegExp(`${f.name.replace(/[{}()[\]\\]/g, '\\$&')} [(=]`));
        }
        if (plan.kind === 'sweep') {
          expect(d.detail).toMatch(/· x: .+ \(.+\), y: .+ \(.+\)$/);
          expect(names!.param?.name).toBe(plan.param.name);
        }
      }
    }
    expect(graphs).toBe(26);
  });

  it('Deney 5 çıkış ailesi: eksenler V_{DS} ve I_{D}, eğriler "V_{GS} = 0 V; −0,2 V; −0,4 V", taranan V_{DD}; CSV başlığı düz yazı, V_{GS} eksiyle', () => {
    const api = namesApi('jfet-karakteristik');
    const ref = { example: 'jfet-karakteristik', key: 'id-vds' };
    const spec = sweepOf('jfet-karakteristik', 'id-vds');
    const a = sweepAxes(api, spec, ref);
    expect(a.x.name).toBe('V_{DS}');
    expect(a.ys.map((y) => y.name)).toEqual(['I_{D}']);
    expect(a.param?.name).toBe('V_{DD}');
    expect(a.family).toMatchObject({ name: 'V_{GS}', sign: -1, foy: true });
    expect(spec.family!.values.map((v) => familyText(a.family!, v))).toEqual(['0 V', '−0,2 V', '−0,4 V']);
  });

  it('CSV: başlık "VGS (V);VDD (V);VDS (V);ID (A)", ikinci eğrinin satırları −0,2 ile başlıyor', async () => {
    const api = namesApi('jfet-karakteristik');
    const ref = { example: 'jfet-karakteristik', key: 'id-vds' };
    const spec = { ...sweepOf('jfet-karakteristik', 'id-vds'), ranges: [{ from: 0, to: 1, step: 0.5 }] };
    const curves = runDcSweep({ netlist: buildConnectivity(api.circuit).netlist, ...spec });
    const text = await sweepCsv(api, spec, curves, ';', ref).text();
    const rows = text.replace(/^﻿/, '').trim().split('\r\n');
    expect(rows[0]).toBe('VGS (V);VDD (V);VDS (V);ID (A)');
    expect(rows[4]!.startsWith('-0,2;')).toBe(true);
  });

  it('föy dışı (ya da föy kaydı olmayan) taramada devredeki adlar kalır', () => {
    const api = namesApi('jfet-karakteristik');
    const a = sweepAxes(api, sweepOf('jfet-karakteristik', 'id-vds'));
    expect(a.x.name).toBe('V1');
    expect(a.ys.map((y) => y.name)).toEqual(['A1']);
    expect(a.family).toMatchObject({ name: 'PS1 · 2. çıkış', sign: 1, foy: false });
    expect(familyText(a.family!, 0.2)).toBe('200 mV');
  });

  it('kullanıcının değiştirdiği büyüklük devredeki adını korur (föy grafiğinde de)', () => {
    const api = namesApi('jfet-karakteristik');
    const ref = { example: 'jfet-karakteristik', key: 'id-vds' };
    const spec = sweepOf('jfet-karakteristik', 'id-vds');
    const j1 = api.circuit.parts.find((p) => p.label === 'J1')!.id;
    const a = sweepAxes(api, { ...spec, y: [...spec.y, { kind: 'terminal', part: j1, quantity: 'id' }] }, ref);
    expect(a.ys.map((y) => y.name)).toEqual(['I_{D}', 'J1 · ID']);
  });

  it('Deney 5 transfer: işaret "I_{D} (V_{GS} = 0, V_{DS} ≈ 9,6 V) = 4,12 mA" (I_{DSS} değil), V_{P} ≈ −1,74 V; eğri "V_{DD} = 10 V"', () => {
    const api = namesApi('jfet-karakteristik');
    const ref = { example: 'jfet-karakteristik', key: 'id-vgs' };
    const spec = sweepOf('jfet-karakteristik', 'id-vgs');
    const netlist = buildConnectivity(api.circuit).netlist;
    const marks = foyMarks(ref, runDcSweep({ netlist, ...spec }), api.circuit, (q, v, step) => dcPointValue(netlist, spec, v, step, q))!;
    expect(marks.vp!).toBeCloseTo(-1.74, 1);
    expect(marks.zero!.value * 1e3).toBeCloseTo(4.12, 1);
    expect(marks.zero!.at).toBeCloseTo(9.59, 1);
    const a = sweepAxes(api, spec, ref);
    expect(zeroMark(a, marks.zero!)).toBe('I_{D} (V_{GS} = 0, V_{DS} ≈ 9,6 V) = 4,12 mA');
    expect(`${a.family!.name} = ${familyText(a.family!, 10)}`).toBe('V_{DD} = 10 V');
    expect(a.x.name).toBe('V_{GS}');
  });

  it('zaman grafiklerinde föy adları: doğrultucuda V_{i} ve V_{o}, kenetleyicide V_{g} ve V_{ç}, yükselteçte V_{s} ve V_{CE}, anahtarda V_{S} ve I_{LED}', () => {
    const names = (example: string, key: string) => [...foyNames({ example, key }, doc(example))!.quantities.values()];
    expect(names('yarim-dalga', 'giris-cikis')).toEqual(['V_{i}', 'V_{o}']);
    expect(names('negatif-kenetleyici', 'giris-cikis')).toEqual(['V_{g}', 'V_{ç}']);
    expect(names('bjt-yukseltec', 'giris-cikis')).toEqual(['V_{s}', 'V_{CE}']);
    expect(names('bjt-anahtar', 'anahtar')).toEqual(['V_{S}', 'I_{LED}']);
    expect(names('diyot-karakteristigi', 'iv-xy')).toEqual(['V_{o}', 'V_{i}']);
    expect(names('gerilim-katlayici', 'katlayici')).toEqual(['V_{p} (C1)', 'V_{p} (C2)', 'V_{ç}']);
  });
});

describe('Analiz v2: grafik yazılarının yerleşimi', () => {
  const plot: Box = { x: 40, y: 20, w: 400, h: 200 };
  it('yatay işaretin yazısı dikey işaret çizgisinin üstüne gelmez (V_{P} çizgisinin sağına geçer)', () => {
    const vp = [80, 20, 80, 220] as const;
    const h = [40, 60, 440, 60] as const;
    const w = 180;
    const at = (x: number, baseline: number): Box => ({ x, y: baseline - 10, w, h: 13 });
    const spot = pickSpot([at(46, 73), at(46, 56), at(86, 73), at(86, 56)], { lines: [vp, h], curves: [], boxes: [] }, plot);
    expect(spot.x).toBe(86);
    expect(segmentHitsBox(vp, spot)).toBe(false);
    expect(segmentHitsBox(h, spot)).toBe(false);
  });

  it('eğriye değen aday, değmeyenden sonra gelir; grafik alanının dışı hiç seçilmez', () => {
    const curve = [40, 200, 440, 40] as const;
    const a: Box = { x: 230, y: 115, w: 40, h: 13 };
    const b: Box = { x: 60, y: 30, w: 40, h: 13 };
    const outside: Box = { x: 430, y: 30, w: 40, h: 13 };
    expect(segmentHitsBox(curve, a)).toBe(true);
    expect(pickSpot([outside, a, b], { lines: [], curves: [curve], boxes: [] }, plot)).toBe(b);
  });

  it('açıklama satırları: sığmayan ad alt satıra geçer', () => {
    const l = legendLayout([100, 100, 100], 260);
    expect(l.items.map((i) => i.row)).toEqual([0, 0, 1]);
    expect(l.rows).toBe(2);
    expect(legendLayout([], 260).rows).toBe(0);
  });

  it('alt simgeli yazının genişliği alt simgesiz düz yazıdan küçük (alt simge 0,75 em)', () => {
    expect(textWidth('V_{GS} = −0,2 V', 11)).toBeLessThan(textWidth('VGS  = −0,2 V', 11));
    expect(textWidth('PS1 1. çıkış = 10 V', 11)).toBeGreaterThan(textWidth('V_{DD} = 10 V', 11));
  });
});
