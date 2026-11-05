// Parçanın isteğe bağlı notu: kayıt biçimi (eski devreler aynen açılır), güncelleme, şemadaki yeri,
// etiketle birlikte gösterim; KiCad referansına ve ağ adlarına girmez.

import { describe, expect, it } from 'vitest';
import { designPcb, kicadPcb } from '../src/bench3d/kicad';
import { labelLayout, partTextBoxes } from '../src/editor/PartView';
import { exampleDoc } from '../src/examples';
import { NOTE_MAX, nextLabel, partTitle, updatePart } from '../src/model/docOps';
import { parseDoc, serializeDoc } from '../src/model/serialize';
import type { CircuitDoc, Part } from '../src/model/types';

const raw = (parts: unknown[]) => ({ version: 1, parts, wires: [] });
const resistor = (extra: Record<string, unknown> = {}) => ({ id: 'p1', type: 'resistor', label: 'R1', x: 0, y: 0, rotation: 0, props: { resistance: 1000 }, ...extra });

describe('Parça notu', () => {
  it('kayıt: not saklanır, boşlukları kırpılır, en çok 24 karakter; notsuz eski devrede alan hiç yok', () => {
    const doc = parseDoc(raw([resistor({ note: '  Toplam  ' })]))!;
    expect(doc.parts[0]!.note).toBe('Toplam');
    expect(JSON.parse(serializeDoc(doc)).parts[0].note).toBe('Toplam');
    const long = parseDoc(raw([resistor({ note: 'x'.repeat(40) })]))!;
    expect(long.parts[0]!.note).toHaveLength(NOTE_MAX);
    const old = parseDoc(raw([resistor()]))!;
    expect('note' in old.parts[0]!).toBe(false);
    expect('note' in JSON.parse(serializeDoc(old)).parts[0]).toBe(false);
    // Metin olmayan ya da boş not yok sayılır.
    expect('note' in parseDoc(raw([resistor({ note: 5 })]))!.parts[0]!).toBe(false);
    expect('note' in parseDoc(raw([resistor({ note: '   ' })]))!.parts[0]!).toBe(false);
  });

  it('güncelleme: not eklenir ve değişir, boş not alanı kaldırır; etiket ve sonraki etiket numarası notla değişmez', () => {
    const doc = parseDoc(raw([resistor()]))!;
    const noted = updatePart(doc, 'p1', { note: ' Elde ' });
    expect(noted.parts[0]!.note).toBe('Elde');
    expect(noted.parts[0]!.label).toBe('R1');
    expect(nextLabel(noted, 'resistor')).toBe('R2');
    const cleared = updatePart(noted, 'p1', { note: '' });
    expect('note' in cleared.parts[0]!).toBe(false);
    // Not verilmeyen güncelleme notu korur.
    expect(updatePart(noted, 'p1', { props: { resistance: 220 } }).parts[0]!.note).toBe('Elde');
    expect(partTitle(noted.parts[0]!)).toBe('R1 · Elde');
    expect(partTitle(doc.parts[0]!)).toBe('R1');
  });

  it('şemada: yatay parçada ad bir satır yukarı çıkar, not adın yerine gelir; dikeyde ad, not ve değer üst üste', () => {
    const base: Part = { id: 'p1', type: 'resistor', label: 'R1', x: 0, y: 0, rotation: 0, props: { resistance: 1000 } };
    const flat = labelLayout(base, false);
    const flatNote = labelLayout({ ...base, note: 'Toplam' }, false);
    expect(flat.noteY).toBeNull();
    expect(flatNote.noteY).toBe(flat.nameY);
    expect(flatNote.nameY).toBeLessThan(flat.nameY);
    expect(flatNote.valueY).toBe(flat.valueY);
    const up = labelLayout({ ...base, rotation: 90, note: 'Toplam' }, false);
    expect(up.nameY).toBeLessThan(up.noteY!);
    expect(up.noteY).toBeLessThan(up.valueY);
    // Yazı kutuları: ad, değer ve not (çakışma ve kablo kuralları notu da kapsar).
    expect(partTextBoxes({ ...base, note: 'Toplam' }, false)).toHaveLength(3);
    expect(partTextBoxes(base, false)).toHaveLength(2);
  });

  it('KiCad ve PCB: referans ve ağ adları etiketle, not girmez (BCD örneği, S4 · D (8))', () => {
    const doc = exampleDoc('bcd-7-segment') as CircuitDoc;
    expect(doc.parts.find((p) => p.label === 'S4')!.note).toBe('D (8)');
    const result = designPcb(doc);
    if (!result.ok) throw new Error(result.reason);
    const text = kicadPcb(result.design, 'BCD');
    expect(text).toContain('"S4"');
    expect(text).not.toContain('D (8)');
  });

  it('örnek notları: BCD anahtarları, yarım toplayıcının ve yürüyen ışığın LED’leri', () => {
    const notes = (id: Parameters<typeof exampleDoc>[0]) => Object.fromEntries(exampleDoc(id)!.parts.filter((p) => p.note).map((p) => [p.label, p.note]));
    expect(notes('bcd-7-segment')).toEqual({ S4: 'D (8)', S3: 'C (4)', S2: 'B (2)', S1: 'A (1)' });
    expect(notes('yarim-toplayici')).toEqual({ LED1: 'Toplam', LED2: 'Elde' });
    expect(notes('yuruyen-isik')).toEqual(Object.fromEntries(Array.from({ length: 10 }, (_, k) => [`LED${k}`, `Q${k}`])));
  });
});
