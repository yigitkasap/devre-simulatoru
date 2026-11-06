// Analiz v2: grafik listesi (çipler) devreyle ve paylaşım bağlantısında kaydedilir; eski kayıttaki izler
// tek bir zaman grafiğine dönüşür.

import { describe, expect, it } from 'vitest';
import { exampleDoc } from '../src/examples';
import { dcNetlist, runDcSweep, sweepValues } from '../src/editor/analysis/dcsweep';
import { traceValue } from '../src/editor/analysis/recorder';
import { sweepAt } from '../src/editor/analysis/SweepPane';
import { filterOptions, quantityOptions } from '../src/editor/analysis/quantities';
import { suggestions } from '../src/editor/analysis/suggest';
import { netIndex } from '../src/editor/analysis/traces';
import { EMPTY_ANALYSIS, parseAnalysis, pruneTraces, serializeAnalysis, type AnalysisDoc, type Quantity, type TraceDef } from '../src/model/analysis';
import { buildConnectivity } from '../src/model/connectivity';
import { decodeShared, encodeDoc, sharedFromHash, shareUrl } from '../src/model/share';
import { CircuitSimulator } from '../src/sim';

const v: TraceDef = { id: 't1', color: 0, kind: 'voltage', node: 'p1#0', at: { x: 1, y: 2 }, ref: null, refAt: null };
const i: TraceDef = { id: 't2', color: 1, kind: 'current', part: 'p2' };

describe('Analiz v2: grafik listesi', () => {
  it('analiz v2’den önceki kayıt: izler tek bir zaman grafiğinde, o grafik açık', () => {
    const old = { traces: [{ ...v, at: [1, 2] }, i], rows: [], labColumn: false, fit: null };
    const a = parseAnalysis(old);
    expect(a.graphs).toEqual([{ id: 'g0', kind: 'time', traces: ['t1', 't2'], x: null }]);
    expect(a.active).toBe('g0');
    // İz yoksa grafik de yok: Analiz başlangıç ekranıyla açılır.
    expect(parseAnalysis({ traces: [], rows: [] }).graphs).toEqual([]);
    expect(parseAnalysis({ traces: [], rows: [] }).active).toBeNull();
  });

  it('grafik türleri okunur; olmayan iz kimlikleri ve bilinmeyen türler atılır, açık grafik geçersizse ilki', () => {
    const raw = {
      traces: [{ ...v, at: [1, 2] }, i],
      graphs: [
        { id: 'a', kind: 'time', traces: ['t1', 'yok'], x: 't2', foy: { example: 'jfet-karakteristik', key: 'id-vds' } },
        { id: 'b', kind: 'bode' },
        { id: 'c', kind: 'curve', part: 'p3' },
        { id: 'd', kind: 'bilinmeyen' },
        { kind: 'time', traces: [] },
      ],
      active: 'd',
    };
    const a = parseAnalysis(raw);
    expect(a.graphs).toEqual([
      { id: 'a', kind: 'time', traces: ['t1'], x: 't2', foy: { example: 'jfet-karakteristik', key: 'id-vds' } },
      { id: 'b', kind: 'bode' },
      { id: 'c', kind: 'curve', part: 'p3' },
    ]);
    expect(a.active).toBe('a');
    expect(parseAnalysis({ ...raw, active: 'c' }).active).toBe('c');
    // Grafik listesi boşsa (bütün grafikler kapatılmış) eski kayıt gibi yorumlanmaz.
    expect(parseAnalysis({ traces: [{ ...v, at: [1, 2] }], graphs: [] }).graphs).toEqual([]);
  });

  it('kaydedilip okunur; yalnızca grafik varsa da yazılır', () => {
    const a: AnalysisDoc = { ...EMPTY_ANALYSIS, graphs: [{ id: 'b', kind: 'bode' }], active: 'b' };
    expect(serializeAnalysis(a)).toBeDefined();
    expect(parseAnalysis(JSON.parse(JSON.stringify(serializeAnalysis(a))))).toEqual(a);
  });

  it('hiçbir zaman grafiğinde kullanılmayan izler atılır (X-Y ekseni de kullanımdır)', () => {
    const a: AnalysisDoc = { ...EMPTY_ANALYSIS, traces: [v, i], graphs: [{ id: 'a', kind: 'time', traces: [], x: 't2' }], active: 'a' };
    expect(pruneTraces(a).traces).toEqual([i]);
    expect(pruneTraces({ ...a, graphs: [] }).traces).toEqual([]);
    // Bütün izler kullanılıyorsa belge aynen döner.
    const all: AnalysisDoc = { ...a, graphs: [{ id: 'a', kind: 'time', traces: ['t1'], x: 't2' }] };
    expect(pruneTraces(all)).toBe(all);
  });
});

describe('Analiz v2: paylaşım bağlantısı', () => {
  const doc = exampleDoc('rc-dolma')!;
  const analysis: AnalysisDoc = { ...EMPTY_ANALYSIS, traces: [v], graphs: [{ id: 'a', kind: 'time', traces: ['t1'], x: null }, { id: 'b', kind: 'bode' }], active: 'b' };

  it('bağlantı devreyle birlikte grafikleri taşır', () => {
    const shared = decodeShared(encodeDoc(doc, analysis));
    expect(shared?.doc.parts).toEqual(doc.parts);
    expect(shared?.analysis).toEqual(analysis);
    const url = shareUrl(doc, 'https://ornek.test/devre-simulatoru/#eski', analysis);
    expect(url.startsWith('https://ornek.test/devre-simulatoru/#d=')).toBe(true);
    expect(sharedFromHash(new URL(url).hash)?.analysis.graphs.map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('analizsiz (eski) bağlantı boş analizle açılır; bozuk bağlantı null, bağlantısız adres undefined', () => {
    expect(decodeShared(encodeDoc(doc))?.analysis).toEqual(EMPTY_ANALYSIS);
    expect(sharedFromHash('#d=bozuk')).toBeNull();
    expect(sharedFromHash('#baska')).toBeUndefined();
  });
});

describe('Analiz v2: büyüklük seçici ve öneriler', () => {
  const setup = (id: Parameters<typeof exampleDoc>[0]) => {
    const doc = exampleDoc(id)!;
    const conn = buildConnectivity(doc);
    return { doc, conn, idx: netIndex(doc, conn), idOf: (label: string) => doc.parts.find((p) => p.label === label)!.id };
  };

  it('JFET deneyi: ölçü aletleri, transistörün büyüklükleri, parçaların V, I, P’si ve adlandırılmış düğümler', () => {
    const { doc, idx } = setup('jfet-karakteristik');
    const options = quantityOptions(doc, idx);
    const names = (group: string) => options.filter((o) => o.group === group).map((o) => o.name);
    expect(names('meters')).toEqual(['A1', 'V1']);
    expect(names('parts')).toEqual(expect.arrayContaining(['J1 · VGS', 'J1 · VDS', 'J1 · ID', 'RD · V', 'RD · I', 'RD · P']));
    expect(names('parts')).not.toContain('J1 · V');
    // Düğümler bağlı bacaklarla, toprak yok; her ad bir kez.
    expect(names('nodes').length).toBeGreaterThan(2);
    expect(names('nodes')).not.toContain('0');
    expect(new Set(options.map((o) => o.key)).size).toBe(options.length);
    expect(filterOptions(options, 'j1 drain').every((o) => `${o.name} ${o.detail}`.toLocaleLowerCase('tr-TR').includes('drain'))).toBe(true);
    expect(filterOptions(options, 'yok-böyle-bir-şey')).toEqual([]);
  });

  it('transistörün büyüklükleri ölçü aletleriyle tutarlı: J1 · ID = A1, J1 · VDS = V1, J1 · VGS = 0 (V_GG = 0)', () => {
    const { conn, idOf } = setup('jfet-karakteristik');
    const sim = new CircuitSimulator(conn.netlist);
    expect(sim.runUntil(0.05).ok).toBe(true);
    const value = (q: Quantity) => traceValue(sim, q);
    const id = value({ kind: 'terminal', part: idOf('J1'), quantity: 'id' });
    const vds = value({ kind: 'terminal', part: idOf('J1'), quantity: 'vds' });
    expect(id).toBeGreaterThan(1e-3);
    expect(vds).toBeGreaterThan(5);
    expect(value({ kind: 'terminal', part: idOf('J1'), quantity: 'vgs' })).toBeCloseTo(0, 6);
    expect(Math.abs(value({ kind: 'meter', part: idOf('A1') }))).toBeCloseTo(id, 6);
    expect(Math.abs(value({ kind: 'meter', part: idOf('V1') }))).toBeCloseTo(vds, 3);
    // Direncin gücü = uçları arası gerilim × akım.
    const rd = idOf('RD');
    expect(value({ kind: 'power', part: rd })).toBeCloseTo(value({ kind: 'across', part: rd }) * value({ kind: 'current', part: rd }), 9);
  });

  it('öneriler devredeki parçalara göre, en çok üç', () => {
    const keys = (id: Parameters<typeof exampleDoc>[0]) => suggestions(exampleDoc(id)!).map((s) => s.key);
    expect(keys('fet-yukseltec')).toEqual(['wave', 'gain', 'family']);
    expect(keys('jfet-karakteristik')).toEqual(['family', 'meters']);
    expect(suggestions(exampleDoc('jfet-karakteristik')!).find((s) => s.key === 'meters')?.title).toBe('A1 ve V1 zamanla');
    expect(keys('diyot-karakteristigi')).toEqual(['wave', 'iv']);
    expect(suggestions(exampleDoc('diyot-karakteristigi')!).find((s) => s.key === 'iv')?.title).toBe('D1’in I–V eğrisi');
    for (const id of ['fet-yukseltec', 'bjt-yukseltec', 'rc-dolma', 'led-on-direnc'] as const) expect(suggestions(exampleDoc(id)!).length).toBeLessThanOrEqual(3);
  });
});

describe('Analiz v2: bir değeri tarayarak (DC tarama)', () => {
  it('aralıklar birleşir: 0 → 1 V (0,1) ve 1 → 5 V (1) = 15 nokta, ortak uç bir kez', () => {
    const xs = sweepValues([{ from: 0, to: 1, step: 0.1 }, { from: 1, to: 5, step: 1 }]);
    expect(xs.length).toBe(15);
    expect(xs.slice(-5)).toEqual([1, 2, 3, 4, 5]);
    expect(sweepValues([{ from: 5, to: 0, step: 1 }])).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('JFET deneyi (Deney 5, adım 2–3): V1 – A1 ailesi föy kartındaki sayılarla (V_DS = 8 V’ta 4,02 / 3,15 / 2,38 mA)', () => {
    const doc = exampleDoc('jfet-karakteristik')!;
    const id = (label: string) => doc.parts.find((p) => p.label === label)!.id;
    const curves = runDcSweep({
      netlist: buildConnectivity(doc).netlist,
      param: { part: id('PS1'), prop: 'voltage1' },
      ranges: [{ from: 0, to: 8, step: 0.2 }, { from: 8, to: 15, step: 1 }],
      family: { param: { part: id('PS1'), prop: 'voltage2' }, values: [0, 0.2, 0.4] },
      x: { kind: 'meter', part: id('V1') },
      y: [{ kind: 'meter', part: id('A1') }],
    });
    expect(curves.map((c) => c.step)).toEqual([0, 0.2, 0.4]);
    expect(curves.every((c) => c.points.length === 48)).toBe(true);
    const at8 = curves.map((c) => sweepAt(c.points, 2, 8));
    expect(at8[0]! * 1e3).toBeCloseTo(4.02, 1);
    expect(at8[1]! * 1e3).toBeCloseTo(3.15, 1);
    expect(at8[2]! * 1e3).toBeCloseTo(2.38, 1);
  });

  it('DC devresi: kondansatör açık, bobin kısa devre, AC kaynağın ve üretecin genliği sıfır', () => {
    const netlist = buildConnectivity(exampleDoc('fet-yukseltec-kuplajli')!).netlist;
    const dc = dcNetlist(netlist);
    expect(dc.elements.some((e) => e.type === 'capacitor')).toBe(false);
    expect(dc.elements.filter((e) => e.type === 'funcgen').every((e) => e.props.amplitude === 0)).toBe(true);
  });
});
