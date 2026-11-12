// 3B modellerin ölçeği: her model gerçek ölçüsünde (1 birim = 2,54 mm, breadboard'un delik aralığı).
// (1) dimensions.ts'teki sayılar veri sayfalarındaki aralıkların içinde; (2) kurulan gövdelerin kutuları bu
// sayılarla aynı; (3) kılıf seçimi (BC107 TO-18, IRF510 TO-220, öbürleri TO-92; pil 9 V blok ya da AA yatağı;
// kutupsuz kondansatör kapasiteye göre); (4) modellerin üçgen sayısı sınırlı (telefonda kare hızı düşmesin).
// Kaynaklar: docs/KARARLAR.md → "3B modeller: gerçek ölçüler".

import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Object3D } from 'three';
import { holeXZ } from '../src/bench3d/breadboard';
import { AA, BUZZER, CERAMIC_DISC, E10, FILM_BOX, MLCC, MOTOR, PP3, RELAY, SPEAKER, TO18, TO220, TO92, batteryFootprint, batteryPack, mm, nonPolarPackage, transistorPackage } from '../src/bench3d/dimensions';
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
const near = (value: number, target: number, what: string, tolerance = 0.15) => expect(Math.abs(value - target), `${what}: ${value.toFixed(2)} mm, beklenen ${target} mm`).toBeLessThanOrEqual(tolerance);

describe('3B modeller: ölçek', () => {
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

  it('TO-18 (BC107): kapak Ø 4,65, flanş Ø 5,4, yükseklik 5,0 mm; üç bacak 2,54 mm’lik dairede', () => {
    const root = build('npn', { model: 'BC107' });
    const can = sizeMm(root, 'to18-kapak');
    near(can[0], TO18.can, 'kapak çapı (x)');
    near(can[2], TO18.can, 'kapak çapı (z)');
    const flange = sizeMm(root, 'to18-flans');
    near(flange[0], TO18.flange, 'flanş çapı');
    near(flange[1], TO18.flangeThickness, 'flanş kalınlığı');
    const box = new Box3();
    root.traverse((o) => {
      if (o.name.startsWith('to18-')) box.union(new Box3().setFromObject(o));
    });
    near(box.getSize(new Vector3()).y * 2.54, TO18.height, 'flanşın altından kapağın tepesine');
  });

  it('TO-92: Ø 4,8 × 4,8 mm, düz yüzden sırta 3,7 mm', () => {
    const [depth, height, width] = sizeMm(build('njfet', { model: 'BF245A' }), 'to92');
    near(depth, TO92.depth, 'derinlik');
    near(height, TO92.height, 'yükseklik');
    near(width, TO92.diameter, 'çap', 0.2);
  });

  it('TO-220 (IRF510, 7805, LM317): gövde 10 × 9,2 mm, tırnakla 15,4 mm, kalınlık 4,5 mm', () => {
    for (const [type, props] of [['nmos', { model: 'IRF510' }], ['reg7805', {}], ['lm317', {}]] as const) {
      const root = build(type, props);
      const body = sizeMm(root, 'to220-govde').sort((a, b) => a - b);
      const tab = sizeMm(root, 'to220-tirnak').sort((a, b) => a - b);
      near(body[2]!, TO220.width, `${type} gövde genişliği`);
      near(body[1]!, TO220.body, `${type} gövde boyu`);
      near(body[0]! + tab[0]!, TO220.thickness, `${type} kalınlık (gövde + tırnak)`);
      near(tab[2]!, TO220.overall, `${type} tırnağın tepesine`);
      near(tab[1]!, TO220.width, `${type} tırnak genişliği`);
    }
  });

  it('buzzer Ø 12 × 9,5 mm; röle 29 × 13 × 25,5 mm; motor Ø 26 × 44,7 mm, mil Ø 4 mm', () => {
    const buzzer = sizeMm(build('buzzer'), 'buzzer');
    near(buzzer[0], BUZZER.diameter, 'buzzer çapı');
    near(buzzer[1], BUZZER.height, 'buzzer yüksekliği');
    const relay = sizeMm(build('relay'), 'role');
    near(relay[0], RELAY.length, 'röle boyu');
    near(relay[1], RELAY.height, 'röle yüksekliği');
    near(relay[2], RELAY.width, 'röle eni');
    const motor = build('motor');
    const body = sizeMm(motor, 'motor');
    near(body[0], MOTOR.length, 'motor boyu');
    near(body[1], MOTOR.diameter, 'motor çapı');
    near(body[2], MOTOR.diameter, 'motor çapı');
    near(sizeMm(motor, 'motor-mil')[1], MOTOR.shaft, 'mil çapı');
  });

  it('hoparlör (FRS 5): sepet Ø 50,5 mm, kulaklarla 68 mm, derinlik 31,5 mm', () => {
    const root = build('speaker');
    near(sizeMm(root, 'hoparlor-cember')[0], SPEAKER.basket, 'sepet çapı');
    near(sizeMm(root, 'hoparlor-kulak')[0], SPEAKER.lugs, 'kulaklarla genişlik');
    near(sizeMm(root, 'hoparlor-miknatis')[0], SPEAKER.magnet, 'mıknatıs çapı');
    const box = new Box3();
    root.traverse((o) => {
      if (o.name.startsWith('hoparlor-')) box.union(new Box3().setFromObject(o));
    });
    near(box.max.y * 2.54, SPEAKER.depth, 'masadan çemberin üstüne');
  });

  it('lamba (E10): vida dişi Ø 10 mm, balon Ø 11 mm, toplam boy 24 mm', () => {
    const root = build('lamp');
    const thread = new Box3();
    const globe = new Box3();
    root.traverse((o) => {
      if (o.name === 'lamba-dis') thread.union(new Box3().setFromObject(o));
      if (o.name === 'lamba-balon') globe.union(new Box3().setFromObject(o));
    });
    near(sizeMm(root, 'lamba-dis')[0], E10.thread, 'vida dişi çapı');
    near(sizeMm(root, 'lamba-balon')[0], E10.bulb, 'balon çapı');
    near((globe.max.y - thread.min.y) * 2.54, E10.length, 'lambanın boyu');
  });

  it('pil: 7,5–10,5 V’ta 9 V’luk blok (48,5 × 26,5 × 17,5 mm), öbür gerilimlerde AA yatağı (hücre Ø 14,5 × 50,5 mm)', () => {
    expect(batteryPack(9)).toEqual({ kind: 'pp3' });
    expect(batteryPack(1.5)).toEqual({ kind: 'aa', cells: 1, layers: 1, perLayer: 1 });
    expect(batteryPack(3)).toEqual({ kind: 'aa', cells: 2, layers: 1, perLayer: 2 });
    expect(batteryPack(5)).toEqual({ kind: 'aa', cells: 3, layers: 1, perLayer: 3 });
    expect(batteryPack(6)).toEqual({ kind: 'aa', cells: 4, layers: 1, perLayer: 4 });
    expect(batteryPack(12)).toEqual({ kind: 'aa', cells: 8, layers: 2, perLayer: 4 });
    expect(batteryPack(24)).toEqual({ kind: 'aa', cells: 8, layers: 2, perLayer: 4 });
    const block = sizeMm(build('battery', { voltage: 9 }), 'pp3');
    near(block[0], PP3.length, 'blok boyu');
    near(block[1], PP3.height, 'blok yüksekliği');
    near(block[2], PP3.width, 'blok eni');
    for (const [volts, cells] of [[1.5, 1], [5, 3], [12, 8]] as const) {
      const root = build('battery', { voltage: volts });
      for (let i = 0; i < cells; i++) {
        const cell = sizeMm(root, `aa-${i}`);
        near(cell[0], AA.length, `${volts} V, ${i + 1}. hücrenin boyu`);
        // 18 kenarlı silindirin kutusu bir eksende köşeden köşeye (tam çap), öbüründe kenardan kenara.
        near(Math.max(cell[1], cell[2]), AA.diameter, `${volts} V, ${i + 1}. hücrenin çapı`);
      }
      expect(has(root, `aa-${cells}`)).toBe(false);
      // Masada kapladığı yer modelin kutusunu içerir.
      const box = new Box3().setFromObject(root).getSize(new Vector3());
      const foot = batteryFootprint(volts);
      expect(box.x).toBeLessThanOrEqual(foot.w + 0.01);
      expect(box.z).toBeLessThanOrEqual(foot.d + 0.01);
    }
    const foot9 = batteryFootprint(9);
    const box9 = new Box3().setFromObject(build('battery', { voltage: 9 })).getSize(new Vector3());
    expect(box9.x).toBeLessThanOrEqual(foot9.w + 0.01);
    expect(box9.z).toBeLessThanOrEqual(foot9.d + 0.01);
  });

  it('kutupsuz kondansatör kapasiteye göre: ≤ 10 nF disk Ø 5 × 2,5; ≤ 1 µF çok katmanlı 4,2 × 3,8 × 2,5; üstü kutu film', () => {
    expect([nonPolarPackage(1e-9), nonPolarPackage(10e-9), nonPolarPackage(68e-9), nonPolarPackage(1e-6), nonPolarPackage(2.2e-6)]).toEqual(['disc', 'disc', 'mlcc', 'mlcc', 'film']);
    const disc = sizeMm(build('capacitor', { kind: 'film', capacitance: 10e-9 }), 'kondansator');
    near(disc[0], CERAMIC_DISC.diameter, 'disk çapı');
    near(disc[2], CERAMIC_DISC.thickness, 'disk kalınlığı');
    const mlcc = sizeMm(build('capacitor', { kind: 'film', capacitance: 100e-9 }), 'kondansator');
    near(mlcc[0], MLCC.width, 'çok katmanlı genişlik');
    near(mlcc[1], MLCC.height, 'çok katmanlı yükseklik');
    near(mlcc[2], MLCC.thickness, 'çok katmanlı kalınlık');
    const film = sizeMm(build('capacitor', { kind: 'film', capacitance: 2.2e-6 }), 'kondansator');
    near(film[0], FILM_BOX.width, 'film genişlik');
    near(film[1], FILM_BOX.height, 'film yükseklik');
    near(film[2], FILM_BOX.thickness, 'film kalınlık');
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
