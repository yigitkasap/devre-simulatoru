// Tahtada kur, 4. aşama: takma kuralları (bacak aralığı, dolu delik, klavyeyle takma, sabit düzenli
// kılıflar, döndürme ve taşıma).

import { describe, expect, it } from 'vitest';
import { mountOf, planBreadboard, type Hole } from '../src/bench3d/breadboard';
import { holeLabel, parseHole } from '../src/bench3d/holes';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan, emptyBuild, type Build } from '../src/model/build';
import { fixedHoles, isFixed, legRange, movePlaced, moveLeg, placePart, reaches, rotatePlaced, secondLegHoles, typedHole } from '../src/tahta/rules';

const h = (name: string, cols = 30): Hole => parseHole(name, cols)!;
const names = (holes: readonly Hole[], cols = 30) => holes.map((x) => holeLabel(x, cols));

describe('Bacak aralığı (README, 5. karar)', () => {
  it('direnç ve diyot 3–8 delik, LED ve kondansatör 1–3; iki bacak aynı satırda ya da sütunda', () => {
    expect(legRange('resistor')).toEqual({ min: 3, max: 8 });
    expect(legRange('diode')).toEqual({ min: 3, max: 8 });
    expect(legRange('led')).toEqual({ min: 1, max: 3 });
    expect(legRange('capacitor')).toEqual({ min: 1, max: 3 });
    expect(reaches('resistor', h('7h'), h('10h'), 30)).toBe(true);
    expect(reaches('resistor', h('7h'), h('15h'), 30)).toBe(true);
    expect(reaches('resistor', h('7h'), h('16h'), 30)).toBe(false);
    expect(reaches('resistor', h('7h'), h('9h'), 30)).toBe(false);
    // T3'teki hatalı kurulum: R1 6b–6e (aynı sütun, 3 delik) takılabilir.
    expect(reaches('resistor', h('6b'), h('6e'), 30)).toBe(true);
    // Çapraz takılmaz.
    expect(reaches('resistor', h('7h'), h('11j'), 30)).toBe(false);
    expect(reaches('led', h('11g'), h('12g'), 30)).toBe(true);
    expect(reaches('led', h('11g'), h('15g'), 30)).toBe(false);
    // Orta kanal 3 birim: e'den f'ye LED uzanır, direnç de.
    expect(reaches('led', h('5e'), h('5f'), 30)).toBe(true);
  });

  it('öbür iki bacaklılar planın aralığının çevresinde ([aralık − 1, aralık + 2])', () => {
    expect(legRange('fuse')).toEqual({ min: 8, max: 11 });
    expect(legRange('inductor')).toEqual({ min: 1, max: 4 });
    expect(legRange('buzzer')).toEqual({ min: 2, max: 5 });
    expect(legRange('ldr')).toEqual({ min: 1, max: 3 });
  });

  it('ikinci bacak için uygun delikler: uzanan ve boş olanlar (yeşil halka)', () => {
    const build: Build = { ...emptyBuild(30), parts: { x: { holes: ['10h', '14h'] } } };
    const ok = names(secondLegHoles('resistor', h('7h'), 30, new Set(['10h', '14h'])));
    expect(ok).toContain('11h');
    expect(ok).not.toContain('10h');
    expect(ok).not.toContain('16h');
    expect(ok).toContain('7e');
    expect(build.parts.x).toBeDefined();
  });
});

describe('Takma ve dolu delik', () => {
  it('dolu deliğe takılmaz; uzanmayan bacak takılmaz; yerinden alınan parça kendi deliklerine dönebilir', () => {
    let build = emptyBuild(30);
    const r1 = placePart(build, 'resistor', 'r1', { holes: [h('2c'), h('6c')], extra: [] });
    expect(r1.ok).toBe(true);
    build = (r1 as { build: Build }).build;
    expect(placePart(build, 'resistor', 'r2', { holes: [h('6c'), h('10c')], extra: [] })).toEqual({ ok: false, reason: 'occupied' });
    expect(placePart(build, 'resistor', 'r2', { holes: [h('7c'), h('8c')], extra: [] })).toEqual({ ok: false, reason: 'reach' });
    const wired: Build = { ...build, wires: [{ a: '10c', b: '20c', color: 'orange' }] };
    expect(placePart(wired, 'resistor', 'r2', { holes: [h('7c'), h('10c')], extra: [] })).toEqual({ ok: false, reason: 'occupied' });
    const lead: Build = { ...build, leads: [{ part: 'b1', pin: 0, hole: '7c' }] };
    expect(placePart(lead, 'resistor', 'r2', { holes: [h('7c'), h('11c')], extra: [] })).toEqual({ ok: false, reason: 'occupied' });
    // Aynı parça kendi deliklerinden birine yeniden takılabilir (taşıma).
    expect(placePart(build, 'resistor', 'r1', { holes: [h('6c'), h('10c')], extra: [] }).ok).toBe(true);
  });

  it('klavyeyle takma: yazılan delik adı (büyük harf, boşluk önemsiz; ray adları)', () => {
    expect(names([typedHole('11h', 30)!])).toEqual(['11h']);
    expect(names([typedHole(' 11H ', 30)!])).toEqual(['11h']);
    expect(names([typedHole('alt + rayı (5. sütun hizası)', 30)!])).toEqual(['alt + rayı (5. sütun hizası)']);
    expect(typedHole('31a', 30)).toBeNull();
    expect(typedHole('x', 30)).toBeNull();
  });
});

describe('Sabit düzenli kılıflar', () => {
  it('transistör aynı satırda 3 ardışık delik; R ile C B E ↔ E B C', () => {
    expect(names(fixedHoles('npn', h('2h'), 0, 30)!.holes)).toEqual(['2h', '3h', '4h']);
    expect(names(fixedHoles('npn', h('2h'), 1, 30)!.holes)).toEqual(['4h', '3h', '2h']);
    expect(fixedHoles('npn', h('29h'), 0, 30)).toBeNull();
    expect(fixedHoles('npn', h('üst + rayı (5. sütun hizası)'), 0, 30)).toBeNull();
  });

  it('Dalga 1: TO-220 ve KBP sıralı (gerçek bacak sırası), PC817 orta kanalın üstünde, düğme kanalın iki yanında', () => {
    // 7805 IN-GND-OUT; LM317 ADJ-OUT-IN (pinler IN, ADJ, OUT); KBP + ~ ~ − (pinler ~, +, ~, −).
    expect(names(fixedHoles('reg7805', h('5c'), 0, 30)!.holes)).toEqual(['5c', '6c', '7c']);
    expect(names(fixedHoles('lm317', h('5c'), 0, 30)!.holes)).toEqual(['7c', '5c', '6c']);
    expect(names(fixedHoles('bridge', h('5c'), 0, 30)!.holes)).toEqual(['6c', '5c', '7c', '8c']);
    // PC817: 1 A, 2 K alt sırada (f); 3 E, 4 C üst sırada (e).
    const opto = fixedHoles('opto', h('10a'), 0, 30)!;
    expect(names(opto.holes)).toEqual(['10f', '11f', '10e', '11e']);
    expect(opto.extra).toHaveLength(0);
    const button = fixedHoles('pushbutton', h('12j'), 0, 30)!;
    expect(names(button.holes)).toEqual(['12d', '12g']);
    expect(names(button.extra)).toEqual(['14d', '14g']);
    const op = fixedHoles('opamp', h('10f'), 0, 30)!;
    expect(op.holes).toHaveLength(5);
    expect(op.extra).toHaveLength(3);
  });

  it('bütün örneklerde her sabit düzenli kılıf planBreadboard’un deliklerine bu kurallarla oturur', () => {
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      for (const [partId, at] of plan.onBoard) {
        const part = doc.parts.find((p) => p.id === partId)!;
        if (!isFixed(part.type)) continue;
        const want = [...names(at.holes, plan.cols), '|', ...names(at.extraHoles ?? [], plan.cols)].join(' ');
        const all = [...at.holes, ...(at.extraHoles ?? [])];
        const found = all.some((anchor) =>
          [0, 1].some((o) => [-3, -2, -1, 0].some((d) => {
            if (anchor.kind !== 'strip') return false;
            const f = fixedHoles(part.type, { ...anchor, col: anchor.col + d }, o as 0 | 1, plan.cols);
            return f !== null && [...names(f.holes, plan.cols), '|', ...names(f.extra, plan.cols)].join(' ') === want;
          })),
        );
        expect(found, `${id} ${part.label} (${mountOf(part.type)}): ${want}`).toBe(true);
      }
    }
  });
});

describe('Döndürme ve taşıma', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const build = buildFromPlan(planBreadboard(doc));
  const id = (label: string) => doc.parts.find((p) => p.label === label)!.id;

  it('R: LED’in bacakları yer değiştirir, transistörün sırası ters döner, DIP aynı deliklerde döner', () => {
    const led = rotatePlaced(build, 'led', id('LED1'));
    expect(led.ok && led.build.parts[id('LED1')]!.holes).toEqual(['12g', '11g']);
    const q = rotatePlaced(build, 'npn', id('Q1'));
    expect(q.ok && q.build.parts[id('Q1')]!.holes).toEqual(['4h', '3h', '2h']);
    const op = exampleDoc('opamp-evirmeyen')!;
    const opBuild = buildFromPlan(planBreadboard(op));
    const u = op.parts.find((p) => p.type === 'opamp')!.id;
    const turned = rotatePlaced(opBuild, 'opamp', u);
    expect(turned.ok).toBe(true);
    const before = new Set([...opBuild.parts[u]!.holes, ...opBuild.parts[u]!.extra!]);
    const after = turned.ok ? [...turned.build.parts[u]!.holes, ...turned.build.parts[u]!.extra!] : [];
    expect(after.every((x) => before.has(x))).toBe(true);
    expect(turned.ok && turned.build.parts[u]!.holes).not.toEqual(opBuild.parts[u]!.holes);
  });

  it('gövdeden sürükleme bütün bacakları kaydırır; bacağın ucundan sürükleme yalnızca o bacağı', () => {
    // Yukarı (g) taşınamaz: 11g LED1'in deliği. Aşağı (i) taşınabilir.
    expect(movePlaced(build, 'resistor', id('R2'), 0, -1)).toEqual({ ok: false, reason: 'occupied' });
    const down = movePlaced(build, 'resistor', id('R2'), 0, 1);
    expect(down.ok && down.build.parts[id('R2')]!.holes).toEqual(['7i', '11i']);
    expect(movePlaced(build, 'resistor', id('R2'), 30, 0)).toEqual({ ok: false, reason: 'board' });
    const leg = moveLeg(build, 'resistor', id('R2'), 1, h('13h'));
    expect(leg.ok && leg.build.parts[id('R2')]!.holes).toEqual(['7h', '13h']);
    expect(moveLeg(build, 'resistor', id('R2'), 1, h('8h'))).toEqual({ ok: false, reason: 'reach' });
  });
});
