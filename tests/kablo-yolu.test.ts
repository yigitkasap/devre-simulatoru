// Masaüstünde çizilen kablonun yolu (route.ts) ve kablo bitince beklenmeyen bağlantı denetimi
// (wireCheck.ts). Kullanıcı testinde L biçimli yolun köşesi başka bir kablonun köşesine ya da bir uca
// düşüp devreyi fark ettirmeden değiştirmişti (multimetre LED yerine pilin − ucunu ölçtü).

import { describe, expect, it } from 'vitest';
import { routeIssues, routeWire, type RouteObstacles } from '../src/model/route';
import { unexpectedLinks } from '../src/model/wireCheck';
import { addPart, addWire } from '../src/model/docOps';
import { routeL } from '../src/model/wires';
import { wireObstacles } from '../src/editor/wireRoute';
import type { CircuitDoc, Part, Point } from '../src/model/types';

const empty: RouteObstacles = { boxes: [], segments: [], points: [] };
const path = (from: Point, route: Point[]) => [from, ...route];

describe('Kablo yolu: engellerden kaçar', () => {
  it('engel yoksa L (uzaklık büyük olan yön önce, routeL gibi); hizalıysa düz', () => {
    expect(routeWire({ x: 0, y: 0 }, { x: 10, y: 4 }, empty)).toEqual([{ x: 10, y: 0 }, { x: 10, y: 4 }]);
    expect(routeWire({ x: 0, y: 0 }, { x: 3, y: 8 }, empty)).toEqual([{ x: 0, y: 8 }, { x: 3, y: 8 }]);
    expect(routeWire({ x: 0, y: 0 }, { x: 3, y: 8 }, empty, true)).toEqual([{ x: 3, y: 0 }, { x: 3, y: 8 }]);
    expect(routeWire({ x: 0, y: 0 }, { x: 0, y: 8 }, empty)).toEqual([{ x: 0, y: 8 }]);
  });

  it('köşe başka bir kablonun köşesine düşecekse öbür L', () => {
    // (0,0)'dan (10,6)'ya önce yatay L'nin köşesi (10,0) olurdu; orada bir kablonun ucu var.
    const obstacles: RouteObstacles = { boxes: [], segments: [[{ x: 10, y: 0 }, { x: 16, y: 0 }]], points: [{ x: 10, y: 0 }, { x: 16, y: 0 }] };
    expect(routeWire({ x: 0, y: 0 }, { x: 10, y: 6 }, obstacles)).toEqual([{ x: 0, y: 6 }, { x: 10, y: 6 }]);
  });

  it('iki L de kapalıysa Z: köşeler kabloya ve uca düşmez', () => {
    // İki L'nin köşeleri (10,0) ve (0,6): ikisinde de bir uç var.
    const obstacles: RouteObstacles = { boxes: [], segments: [], points: [{ x: 10, y: 0 }, { x: 0, y: 6 }] };
    const route = routeWire({ x: 0, y: 0 }, { x: 10, y: 6 }, obstacles);
    expect(route.length).toBe(3);
    expect(routeIssues(path({ x: 0, y: 0 }, route), obstacles).violations).toBe(0);
  });

  it('başka bir kablonun üstünden boyuna geçmez ve kablonun ucunun üstünden geçmez (T olurdu)', () => {
    // Yatay kablo (2,0)–(8,0): (0,0)'dan (10,0)'a düz yol üstünden geçerdi; uçları (2,0), (8,0).
    const obstacles: RouteObstacles = { boxes: [], segments: [[{ x: 2, y: 0 }, { x: 8, y: 0 }]], points: [{ x: 2, y: 0 }, { x: 8, y: 0 }] };
    const route = routeWire({ x: 0, y: 0 }, { x: 10, y: 0 }, obstacles);
    expect(routeIssues(path({ x: 0, y: 0 }, route), obstacles).violations).toBe(0);
    expect(route.length).toBe(3); // U: aşağıdan ya da yukarıdan dolanır
  });

  it('parça gövdesinin ve yazısının içinden geçmez: hizalı uçlarda U, kısa olanı', () => {
    const body = { x: 4, y: -1, w: 4, h: 2 };
    const label = { x: 5, y: -3, w: 2, h: 1.2 };
    const obstacles: RouteObstacles = { boxes: [body, label], segments: [], points: [] };
    const route = routeWire({ x: 0, y: 0 }, { x: 12, y: 0 }, obstacles);
    expect(routeIssues(path({ x: 0, y: 0 }, route), obstacles).violations).toBe(0);
    // En kısa U: gövdenin kenarı boyunca (kenara değmek içinden geçmek sayılmaz).
    expect(route.length).toBe(3);
    expect(Math.abs(route[0]!.y)).toBe(1);
  });

  it('dik kesmek serbest, ama kesmeyen eşit yol yeğlenir', () => {
    const obstacles: RouteObstacles = { boxes: [], segments: [[{ x: 5, y: -5 }, { x: 5, y: 2 }]], points: [{ x: 5, y: -5 }, { x: 5, y: 2 }] };
    // Önce yatay L dikey kabloyu keser; önce dikey L kesmez (aynı uzunluk, köşe sayısı).
    const route = routeWire({ x: 0, y: 0 }, { x: 10, y: 4 }, obstacles);
    expect(route).toEqual([{ x: 0, y: 4 }, { x: 10, y: 4 }]);
    // Kesmeden gidilemiyorsa keser (bağlantı değildir).
    const across = routeWire({ x: 0, y: 0 }, { x: 10, y: 0 }, obstacles);
    expect(across).toEqual([{ x: 10, y: 0 }]);
  });

  it('temiz yol yoksa en az kurala uymayan seçilir (boş dönmez)', () => {
    const wall = { x: -30, y: 2, w: 60, h: 2 };
    const route = routeWire({ x: 0, y: 0 }, { x: 0, y: 8 }, { boxes: [wall], segments: [], points: [] });
    expect(route.at(-1)).toEqual({ x: 0, y: 8 });
  });
});

// Bir pil (B1: + (0,−3), − (0,3)) ve iki direnç; ızgara biriminde.
const part = (id: string, type: Part['type'], x: number, y: number, rotation: Part['rotation'] = 0): Part => ({ id, type, label: id.toUpperCase(), x, y, rotation, props: {} });

describe('Kablo bitince beklenmeyen bağlantı', () => {
  const base: CircuitDoc = {
    version: 1,
    parts: [part('r1', 'resistor', 0, 0), part('r2', 'resistor', 0, 10), part('r3', 'resistor', 20, 0)],
    wires: [{ id: 'w1', points: [{ x: 4, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 4 }] }],
  };
  const check = (points: Point[]) => {
    const r = addWire(base, points);
    return unexpectedLinks(base, r.doc, r.id!);
  };

  it('iki ucu arasında temiz kablo: yok', () => {
    expect(check([{ x: 4, y: 0 }, { x: 16, y: 0 }])).toEqual([]);
  });

  it('köşesi başka bir kablonun köşesine düşüyor: o kablonun ağındaki uçlar', () => {
    // R1'in 2. ucundan (4,0) R3'ün 1. ucuna (16,0) giderken (10,4)'e (w1'in ucu) inen bir köşe.
    expect(check([{ x: 4, y: 0 }, { x: 4, y: 4 }, { x: 10, y: 4 }, { x: 16, y: 4 }, { x: 16, y: 0 }])).toEqual([['r2#1']]);
  });

  it('başka bir kablonun ucu yeni kablonun üstünde kalıyor (T): bağlantı', () => {
    expect(check([{ x: 4, y: 0 }, { x: 4, y: 4 }, { x: 16, y: 4 }, { x: 16, y: 0 }])).toEqual([['r2#1']]);
  });

  it('bırakılan uç bir kablonun üstündeyse (T) beklenen bağlantıdır', () => {
    expect(check([{ x: 4, y: 0 }, { x: 4, y: 7 }, { x: 10, y: 7 }])).toEqual([]);
  });

  it('uca bırakılan kablo, o ucun üstünden geçen (ona bağlı olmayan) kabloya da bağlanır: beklenmeyen', () => {
    // R3'ün 1. ucunun (16,0) üstünden geçen, R2'ye bağlı bir kablo.
    const over: CircuitDoc = { ...base, wires: [...base.wires, { id: 'w2', points: [{ x: 4, y: 10 }, { x: 4, y: 14 }, { x: 16, y: 14 }, { x: 16, y: -4 }] }] };
    const r = addWire(over, [{ x: 4, y: 0 }, { x: 16, y: 0 }]);
    expect(unexpectedLinks(over, r.doc, r.id!)).toEqual([['r2#1']]);
  });

  it('dik kesişme bağlantı değildir', () => {
    // (7,0)–(7,13) dikey parçası w1'in yatay parçasını (7,10)'da keser.
    expect(check([{ x: 4, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 13 }, { x: 16, y: 13 }, { x: 16, y: 0 }])).toEqual([]);
  });
});

describe('Kullanıcı testindeki durumlar (gerçek parçalarla)', () => {
  // LED devresi: B1 (dikey, + üstte), R1, LED1 (dikey), GND1; multimetre M1 pilin altında (V/Ω ucu pilin
  // ekseninde). Eski L yolu M1'in V/Ω ucunu LED'in anoduna bağlarken pilin ve toprağın üstünden geçip
  // alt hatta ve pilin + ucuna bağlanıyordu (multimetre LED yerine pilin − ucunu ölçtü).
  const build = () => {
    let doc: CircuitDoc = { version: 1, parts: [], wires: [] };
    const put = (type: Part['type'], x: number, y: number, rotation: Part['rotation'] = 0) => {
      const r = addPart(doc, type, { x, y }, rotation);
      doc = r.doc;
      return r.id;
    };
    put('battery', 0, 0, 90);
    put('resistor', 8, -8);
    put('led', 20, 0, 90);
    put('ground', 0, 8);
    put('multimeter', 4, 14);
    return doc;
  };
  const obstaclesOf = (doc: CircuitDoc) => wireObstacles(doc, () => false);
  const draw = (doc: CircuitDoc, from: Point, to: Point, route: (from: Point, to: Point, doc: CircuitDoc) => Point[]) => {
    const r = addWire(doc, [from, ...route(from, to, doc)]);
    return { doc: r.doc, extra: unexpectedLinks(doc, r.doc, r.id!) };
  };
  const steps: [Point, Point][] = [
    [{ x: 0, y: -4 }, { x: 4, y: -8 }], // B1 + → R1
    [{ x: 12, y: -8 }, { x: 20, y: -4 }], // R1 → LED anot
    [{ x: 20, y: 4 }, { x: 0, y: 4 }], // LED katot → B1 −
    [{ x: 0, y: 4 }, { x: 0, y: 8 }], // B1 − → toprak
    [{ x: 0, y: 14 }, { x: 20, y: -4 }], // M1 V/Ω → LED anot
    [{ x: 8, y: 14 }, { x: 20, y: 4 }], // M1 COM → LED katot
  ];

  it('eski L yolu (routeL) multimetrenin ucunu alt hatta da bağlıyordu', () => {
    let doc = build();
    const extras: string[][][] = [];
    for (const [from, to] of steps) {
      const r = draw(doc, from, to, (a, b) => routeL(a, b));
      doc = r.doc;
      extras.push(r.extra);
    }
    expect(extras[4]!.length).toBeGreaterThan(0);
  });

  it('yeni yol hiçbir adımda beklenmeyen bağlantı kurmaz; kabloların hiçbiri gövdeden, yazıdan geçmez', () => {
    let doc = build();
    for (const [from, to] of steps) {
      const obstacles = obstaclesOf(doc);
      const r = draw(doc, from, to, (a, b) => routeWire(a, b, obstacles));
      expect(r.extra, `${JSON.stringify(from)} → ${JSON.stringify(to)}`).toEqual([]);
      const added = r.doc.wires.at(-1)!;
      expect(routeIssues(added.points, obstacles).violations, JSON.stringify(added.points)).toBe(0);
      doc = r.doc;
    }
  });
});
