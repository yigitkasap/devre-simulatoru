// Telefon yardımcıları: bileşen adlarına getirilen ekler, zincirle ekleme ve Bağla kipindeki kablo yolu.

import { describe, expect, it } from 'vitest';
import { ek, toDative } from '../src/i18n/ek';
import { addPart, addWire } from '../src/model/docOps';
import { buildConnectivity, pinKey } from '../src/model/connectivity';
import { partBounds, pinPositions } from '../src/model/geometry';
import { emptyDoc, type CircuitDoc } from '../src/model/types';
import { chainPlacement, firstFreePin, routeAround } from '../src/editor/phoneTools';

describe('ekler', () => {
  it('iyelik eki adın okunuşuna uyar', () => {
    expect(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R20', 'R40', 'R100'].map((l) => ek(l, 'in'))).toEqual([
      'R1’in', 'R2’nin', 'R3’ün', 'R4’ün', 'R5’in', 'R6’nın', 'R7’nin', 'R8’in', 'R9’un', 'R10’un', 'R20’nin', 'R40’ın', 'R100’ün',
    ]);
  });
  it('belirtme ve yönelme ekleri', () => {
    expect(['R1', 'R2', 'R3', 'R6', 'R9'].map((l) => ek(l, 'i'))).toEqual(['R1’i', 'R2’yi', 'R3’ü', 'R6’yı', 'R9’u']);
    expect(['R1', 'R2', 'R6', 'R9'].map((l) => ek(l, 'e'))).toEqual(['R1’e', 'R2’ye', 'R6’ya', 'R9’a']);
    expect(ek('OSC', 'in')).toBe('OSC’nin');
  });
  it('uç adına yönelme eki', () => {
    expect(toDative('B1’in + ucu')).toBe('B1’in + ucuna');
    expect(toDative('OSC1’in A kanalı')).toBe('OSC1’in A kanalına');
    expect(toDative('FG1’in ortak ucu (COM)')).toBe('FG1’in ortak ucuna (COM)');
  });
});

/** Dikey pil (+ üstte) ve ona zincirlenen parçalar. */
function batteryDoc(): CircuitDoc {
  return addPart(emptyDoc(), 'battery', { x: 0, y: 0 }, 90).doc;
}

function chainAdd(doc: CircuitDoc, type: Parameters<typeof addPart>[1], anchor: { partId: string; pin: number }) {
  const place = chainPlacement(doc, type, anchor);
  expect(place).not.toBeNull();
  const added = addPart(doc, type, place!.at, place!.rotation);
  const wired = addWire(added.doc, place!.wire);
  return { doc: wired.doc, id: added.id, place: place! };
}

describe('zincirle ekle', () => {
  it('yeni parçanın 0. ucu çapaya kabloyla bağlanır ve hiçbir parçayla çakışmaz', () => {
    let doc = batteryDoc();
    const b1 = doc.parts[0]!;
    const r = chainAdd(doc, 'resistor', { partId: b1.id, pin: 0 });
    doc = r.doc;
    const r1 = doc.parts.find((p) => p.id === r.id)!;
    // Pilin + ucu üstte; direnç saat yönünde sağa uzanır, kablo yataydır.
    expect(r1.rotation).toBe(0);
    expect(pinPositions(r1)[0]!.y).toBe(pinPositions(b1)[0]!.y);
    const conn = buildConnectivity(doc);
    expect(conn.unconnectedPins.has(pinKey(b1.id, 0))).toBe(false);
    expect(firstFreePin(r1.id, conn.unconnectedPins, doc)).toBe(1);

    // Direncin 2. ucuna LED: aşağı doğru, anot üstte.
    const l = chainAdd(doc, 'led', { partId: r1.id, pin: 1 });
    doc = l.doc;
    const led = doc.parts.find((p) => p.id === l.id)!;
    expect(pinPositions(led)[1]!.y).toBeGreaterThan(pinPositions(led)[0]!.y);
    // Hiçbir iki parçanın kutusu çakışmaz.
    const boxes = doc.parts.map((p) => partBounds(p));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
      }
  });

  it('toprak çapanın altına iner', () => {
    const doc = addPart(emptyDoc(), 'resistor', { x: 0, y: 0 }, 90).doc;
    const r1 = doc.parts[0]!;
    const g = chainAdd(doc, 'ground', { partId: r1.id, pin: 1 });
    const ground = g.doc.parts.find((p) => p.id === g.id)!;
    expect(partBounds(ground).y).toBeGreaterThanOrEqual(pinPositions(r1)[1]!.y);
  });
});

describe('Bağla kipinde kablo yolu', () => {
  it('iki köşe seçeneğinden parçanın içinden geçmeyeni seçer', () => {
    // Direnç (0,0) yatay; (−4,0) ucundan (4,6) noktasına giden kablo önce yatay giderse direncin
    // gövdesinden geçer; önce dikey inmeli.
    const doc = addPart(emptyDoc(), 'resistor', { x: 0, y: 0 }, 0).doc;
    const route = routeAround(doc, { x: -4, y: 0 }, { x: 4, y: 6 });
    expect(route[0]).toEqual({ x: -4, y: 6 });
  });
});
