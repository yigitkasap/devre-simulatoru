// Analiz v2: grafik listesi (çipler) devreyle ve paylaşım bağlantısında kaydedilir; eski kayıttaki izler
// tek bir zaman grafiğine dönüşür.

import { describe, expect, it } from 'vitest';
import { exampleDoc } from '../src/examples';
import { EMPTY_ANALYSIS, parseAnalysis, pruneTraces, serializeAnalysis, type AnalysisDoc, type TraceDef } from '../src/model/analysis';
import { decodeShared, encodeDoc, sharedFromHash, shareUrl } from '../src/model/share';

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
