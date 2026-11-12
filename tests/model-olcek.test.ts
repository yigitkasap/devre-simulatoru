// 3B modellerin kılıfları ("3B: okunurluk önce"): modeller gerçek ölçüde DEĞİL, sade ve küçük çizilir; ama kılıf
// biçimi doğru kalır. (1) dimensions.ts'teki sayılar veri sayfalarındaki aralıkların içinde (biçim oranlarının
// kaynağı); (2) kılıf seçimi (BC107 TO-18, IRF510 TO-220, öbürleri TO-92; pil 9 V blok ya da AA yatağı; kutupsuz
// kondansatör kapasiteye göre); (3) tahta dışı parçalar tek katsayıyla SIDE_MAX birime küçültülür (oran korunur);
// (4) modellerin üçgen sayısı sınırlı. Ayak izi ve çakışma kuralları: tests/tezgah-sade.test.ts.
// Kaynaklar: docs/KARARLAR.md → "3B modeller: gerçek ölçüler" (kılıflar) ve "3B: okunurluk önce" (ölçek).

import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { SIDE_MAX, holeXZ } from '../src/bench3d/breadboard';
import { AA, BUZZER, E10, MOTOR, PP3, RELAY, SPEAKER, TO18, TO220, TO92, batteryFootprint, batteryPack, mm, nonPolarPackage, transistorPackage } from '../src/bench3d/dimensions';
import { OVER } from '../src/bench3d/parts';
import { CATALOG } from '../src/model/catalog';
import type { Part } from '../src/model/types';
import type { DeviceType, Props } from '../src/sim/netlist';

// Modeller yazı dokusu çizer: düğümde boş bir tuval yeter (yalnızca geometri gerekir).
const ctx2d: unknown = new Proxy(
  {},
  {
    get: (_t, key) => (key === 'measureText' ? () => ({ width: 10 }) : key === 'createLinearGradient' || key === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => undefined),
    set: () => true,
  },
);
(globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d }) };

const { buildPartModel } = await import('../src/bench3d/registry');

function build(type: DeviceType, props: Props = {}): Object3D {
  const part: Part = { id: 'p1', type, label: 'X1', x: 0, y: 0, rotation: 0, props: { ...CATALOG[type].defaultProps, ...props } };
  const root = buildPartModel(part).root;
  root.updateMatrixWorld(true);
  return root;
}

/** Adı verilen gövde parçalarının ortak kutusu (mm): [x, y, z]. */
function sizeMm(root: Object3D, name: string): [number, number, number] {
  const box = new Box3();
  let found = 0;
  root.traverse((o) => {
    if (o.name !== name) return;
    found++;
    box.union(new Box3().setFromObject(o));
  });
  expect(found, `"${name}" adlı gövde parçası`).toBeGreaterThan(0);
  const s = box.getSize(new Vector3());
  return [s.x * 2.54, s.y * 2.54, s.z * 2.54];
}

const has = (root: Object3D, name: string): boolean => {
  let found = false;
  root.traverse((o) => {
    if (o.name === name) found = true;
  });
  return found;
};

function triangles(root: Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

const within = (value: number, min: number, max: number, what: string) => {
  expect(value, what).toBeGreaterThanOrEqual(min);
  expect(value, what).toBeLessThanOrEqual(max);
};

describe('3B modeller: kılıflar', () => {
  it('1 birim = 2,54 mm: breadboard’da komşu iki delik 1 birim arayla', () => {
    const a = holeXZ({ kind: 'strip', board: 0, col: 10, row: 2 }, 30);
    const b = holeXZ({ kind: 'strip', board: 0, col: 11, row: 2 }, 30);
    const c = holeXZ({ kind: 'strip', board: 0, col: 10, row: 3 }, 30);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(1, 6);
    expect(Math.abs(c.z - a.z)).toBeCloseTo(1, 6);
    expect(mm(2.54)).toBeCloseTo(1, 9);
  });

  it('ölçüler veri sayfalarındaki aralıkların içinde', () => {
    // TO-18: NXP/Philips BC107 veri sayfası, SOT18/13.
    within(TO18.can, 4.55, 4.7, 'TO-18 kapak çapı (D1)');
    within(TO18.flange, 5.3, 5.45, 'TO-18 flanş çapı (D)');
    within(TO18.height, 4.74, 5.31, 'TO-18 yükseklik (A)');
    within(TO18.tabWidth, 0.94, 1.03, 'TO-18 sekme genişliği (j)');
    within(TO18.tabLength, 0.9, 1.1, 'TO-18 sekme boyu (k)');
    within(TO18.lead, 0.41, 0.47, 'TO-18 bacak çapı (b)');
    expect(TO18.leadCircle).toBe(2.54);
    // TO-92: onsemi CASE 29-11 (JEDEC TO-226AA).
    within(TO92.diameter, 4.45, 5.2, 'TO-92 çap');
    within(TO92.height, 4.32, 5.33, 'TO-92 yükseklik');
    within(TO92.depth, 3.18, 4.19, 'TO-92 derinlik');
    within(TO92.lead, 0.407, 0.533, 'TO-92 bacak');
    expect(TO92.pitch).toBe(1.27);
    // TO-220AB: Vishay IRF510.
    within(TO220.width, 10.0, 10.51, 'TO-220 genişlik (E)');
    within(TO220.thickness, 4.25, 4.65, 'TO-220 kalınlık (A)');
    within(TO220.overall, 14.85, 15.49, 'TO-220 gövde + tırnak (D)');
    within(TO220.hole, 3.54, 3.94, 'TO-220 delik (ØP)');
    expect(TO220.pitch).toBe(2.54);
    // Öbürleri: tek değerli veri sayfası ölçüleri (en çok değerler).
    expect([BUZZER.diameter, BUZZER.height]).toEqual([12, 9.5]);
    expect([RELAY.length, RELAY.width, RELAY.height]).toEqual([29, 13, 25.5]);
    expect([MOTOR.diameter, MOTOR.length]).toEqual([26, 44.7]);
    expect(SPEAKER.basket).toBe(50.5);
    within(PP3.length, 46.5, 48.5, '6LR61 boy');
    within(PP3.width, 24.5, 26.5, '6LR61 en');
    within(PP3.height, 15.5, 17.5, '6LR61 yükseklik');
    within(AA.diameter, 13.5, 14.5, 'LR6 çap');
    within(AA.length, 49.2, 50.5, 'LR6 boy');
    expect(E10.thread).toBe(10);
  });

  it('transistör kılıfı modele göre: BC107 metal TO-18, IRF510 TO-220, öbürleri TO-92', () => {
    expect(transistorPackage('BC107')).toBe('to18');
    expect(transistorPackage('IRF510')).toBe('to220');
    for (const m of ['BC547B', 'BF245A', '2N5457', '2N7000', '', 'genel']) expect(transistorPackage(m), m).toBe('to92');
    const bc107 = build('npn', { model: 'BC107' });
    expect(has(bc107, 'to18-kapak') && !has(bc107, 'to92')).toBe(true);
    const bc547 = build('npn', { model: 'BC547B' });
    expect(has(bc547, 'to92') && !has(bc547, 'to18-kapak')).toBe(true);
    const irf = build('nmos', { model: 'IRF510' });
    expect(has(irf, 'to220-govde') && !has(irf, 'to92')).toBe(true);
    for (const [type, model] of [['nmos', '2N7000'], ['njfet', 'BF245A'], ['njfet', '2N5457'], ['pnp', ''], ['scr', 'MCR100-6']] as const) {
      expect(has(build(type, model ? { model } : {}), 'to92'), `${type} ${model}`).toBe(true);
    }
  });

  it('TO-18 (BC107): metal kapak, flanş ve sekme durur; ayak izine sığacak kadar küçültülmüş', () => {
    const root = build('npn', { model: 'BC107' });
    for (const name of ['to18-kapak', 'to18-flans', 'to18-tepe', 'to18-sekme']) expect(has(root, name), name).toBe(true);
    const can = sizeMm(root, 'to18-kapak');
    const flange = sizeMm(root, 'to18-flans');
    // Flanş kapaktan geniş (gerçek oran 5,4 / 4,65); ikisi de gerçek ölçüden küçük.
    expect(flange[2] / can[2]).toBeCloseTo(TO18.flange / TO18.can, 1);
    expect(Math.max(...flange)).toBeLessThan(TO18.flange);
  });

  it('TO-92: D kesitli (düz yüz), gerçeğinden ince', () => {
    const [depth, height, width] = sizeMm(build('njfet', { model: 'BF245A' }), 'to92');
    expect(depth).toBeLessThan(width);
    expect(depth).toBeLessThanOrEqual(2 * OVER * 2.54 + 0.01);
    expect(height).toBeLessThanOrEqual(TO92.height + 0.01);
    expect(width).toBeLessThanOrEqual(TO92.diameter + 0.2);
  });

  it('TO-220 (IRF510, 7805, LM317): siyah gövde + delikli metal tırnak durur; ince ve kısa', () => {
    for (const [type, props] of [['nmos', { model: 'IRF510' }], ['reg7805', {}], ['lm317', {}]] as const) {
      const root = build(type, props);
      const body = sizeMm(root, 'to220-govde').sort((a, b) => a - b);
      const tab = sizeMm(root, 'to220-tirnak').sort((a, b) => a - b);
      // Tırnak gövdeden uzun (üstünden taşar), aynı genişlikte.
      expect(tab[2]!, type).toBeGreaterThan(body[1]!);
      expect(Math.abs(tab[1]! - body[2]!), type).toBeLessThan(0.3);
      expect(body[2]!, type).toBeLessThan(TO220.width);
      expect(body[0]! + tab[0]!, type).toBeLessThanOrEqual(2 * OVER * 2.54 + 0.01);
    }
  });

  it('tahta dışı parçalar (pil, motor, hoparlör, lamba, röle): biçim gerçek parçanınki, en büyük boyut SIDE_MAX birim', () => {
    const max = (root: Object3D) => {
      const s = new Box3().setFromObject(root).getSize(new Vector3());
      return Math.max(s.x, s.y, s.z);
    };
    for (const [type, props] of [['motor', {}], ['speaker', {}], ['lamp', {}], ['relay', {}], ['battery', { voltage: 9 }], ['battery', { voltage: 5 }], ['battery', { voltage: 12 }], ['transformer', {}]] as const) {
      expect(max(build(type, props)), type).toBeLessThanOrEqual(SIDE_MAX + 1e-6);
    }
    // Oranlar korunur (model tek katsayıyla küçültülür).
    const motor = sizeMm(build('motor'), 'motor');
    expect(motor[0] / motor[1]).toBeCloseTo(MOTOR.length / MOTOR.diameter, 1);
    const relay = sizeMm(build('relay'), 'role');
    expect(relay[0] / relay[2]).toBeCloseTo(RELAY.length / RELAY.width, 1);
    expect(relay[1] / relay[2]).toBeCloseTo(RELAY.height / RELAY.width, 1);
    const speaker = build('speaker');
    expect(sizeMm(speaker, 'hoparlor-cember')[0] / sizeMm(speaker, 'hoparlor-miknatis')[0]).toBeCloseTo(SPEAKER.basket / SPEAKER.magnet, 1);
    const lamp = build('lamp');
    expect(sizeMm(lamp, 'lamba-balon')[0] / sizeMm(lamp, 'lamba-dis')[0]).toBeCloseTo(E10.bulb / E10.thread, 1);
    const block = sizeMm(build('battery', { voltage: 9 }), 'pp3');
    expect(block[0] / block[2]).toBeCloseTo(PP3.length / PP3.width, 1);
    expect(block[0] / block[1]).toBeCloseTo(PP3.length / PP3.height, 1);
  });

  it('buzzer: tahtada alçak, oval bir disk (ayak izine sığar)', () => {
    const buzzer = sizeMm(build('buzzer'), 'buzzer');
    expect(buzzer[1]).toBeLessThan(BUZZER.height);
    expect(Math.max(buzzer[0], buzzer[2])).toBeLessThan(BUZZER.diameter);
  });

  it('pil: 7,5–10,5 V arası 9 V blok, öbür gerilimlerde AA yatağı (hücre sayısı gerilime göre)', () => {
    expect(batteryPack(9)).toEqual({ kind: 'pp3' });
    expect(batteryPack(1.5)).toEqual({ kind: 'aa', cells: 1, layers: 1, perLayer: 1 });
    expect(batteryPack(3)).toEqual({ kind: 'aa', cells: 2, layers: 1, perLayer: 2 });
    expect(batteryPack(5)).toEqual({ kind: 'aa', cells: 3, layers: 1, perLayer: 3 });
    expect(batteryPack(6)).toEqual({ kind: 'aa', cells: 4, layers: 1, perLayer: 4 });
    expect(batteryPack(12)).toEqual({ kind: 'aa', cells: 8, layers: 2, perLayer: 4 });
    expect(batteryPack(24)).toEqual({ kind: 'aa', cells: 8, layers: 2, perLayer: 4 });
    expect(has(build('battery', { voltage: 9 }), 'pp3')).toBe(true);
    for (const [volts, cells] of [[1.5, 1], [5, 3], [12, 8], [9, 0]] as const) {
      const root = build('battery', { voltage: volts });
      for (let i = 0; i < cells; i++) {
        const cell = sizeMm(root, `aa-${i}`);
        // Hücrenin oranı gerçek (boy / çap ≈ 3,5).
        expect(cell[0] / Math.max(cell[1], cell[2]), `${volts} V, ${i + 1}. hücre`).toBeCloseTo(AA.length / AA.diameter, 1);
      }
      expect(has(root, `aa-${cells}`)).toBe(false);
      // Masada kapladığı yer modelin kutusunu içerir ve SIDE_MAX birimi geçmez.
      const box = new Box3().setFromObject(root).getSize(new Vector3());
      const foot = batteryFootprint(volts);
      expect(box.x, `${volts} V`).toBeLessThanOrEqual(foot.w + 0.05);
      expect(box.z, `${volts} V`).toBeLessThanOrEqual(foot.d + 0.05);
      expect(Math.max(foot.w, foot.d), `${volts} V`).toBeLessThanOrEqual(SIDE_MAX + 1e-6);
    }
  });

  it('kutupsuz kondansatör kapasiteye göre: ≤ 10 nF disk, ≤ 1 µF çok katmanlı (damla), üstü kutu film', () => {
    expect([nonPolarPackage(1e-9), nonPolarPackage(10e-9), nonPolarPackage(68e-9), nonPolarPackage(1e-6), nonPolarPackage(2.2e-6)]).toEqual(['disc', 'disc', 'mlcc', 'mlcc', 'film']);
    const disc = sizeMm(build('capacitor', { kind: 'film', capacitance: 10e-9 }), 'kondansator');
    const mlcc = sizeMm(build('capacitor', { kind: 'film', capacitance: 100e-9 }), 'kondansator');
    const film = sizeMm(build('capacitor', { kind: 'film', capacitance: 2.2e-6 }), 'kondansator');
    // Disk yassı (çap > kalınlık), film kutu en yüksek; üçü de 2,5 mm sınırından ince (yarım delik taşma kuralı).
    expect(disc[0]).toBeGreaterThan(disc[2] * 1.5);
    expect(film[1]).toBeGreaterThan(mlcc[1]);
    for (const s of [disc, mlcc, film]) expect(s[2]).toBeLessThanOrEqual(2 * OVER * 2.54 + 0.01);
  });

  // Sınırlar ölçülen sayıların ≈ %15 üstü (bacakların eklem küreleri dahil: bacak başına ≈ 250 üçgen, eski modellerde de aynı).
  it('modellerin üçgen sayısı sınırlı (telefonda kare hızı düşmesin)', () => {
    const budget: [string, Object3D, number][] = [
      ['BC107 (TO-18)', build('npn', { model: 'BC107' }), 1250],
      ['BF245A (TO-92)', build('njfet', { model: 'BF245A' }), 1100],
      ['IRF510 (TO-220)', build('nmos', { model: 'IRF510' }), 1150],
      ['buzzer', build('buzzer'), 850],
      ['röle', build('relay'), 450],
      ['motor', build('motor'), 600],
      ['hoparlör', build('speaker'), 1300],
      ['lamba', build('lamp'), 2000],
      ['9 V pil', build('battery', { voltage: 9 }), 1000],
      ['3 × AA', build('battery', { voltage: 5 }), 1550],
      ['8 × AA', build('battery', { voltage: 12 }), 2700],
      ['kondansatör (çok katmanlı)', build('capacitor', { kind: 'film', capacitance: 100e-9 }), 950],
    ];
    for (const [name, root, max] of budget) expect(triangles(root), name).toBeLessThanOrEqual(max);
  });
});
