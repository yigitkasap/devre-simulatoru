// Tahtada kur, 6. aşama: Denetle. Bütün örneklerde planBreadboard yerleşimi 0 sorun; T3'ün iki hatası
// (R1 aynı şeritte, LED1 ters); her sorun türü; uçları yer değiştirince elektrikçe aynı kalan parçalar.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { buildFromPlan, occupiedHoles, type Build } from '../src/model/build';
import type { CircuitDoc } from '../src/model/types';
import { checkBuild, maxAssignment } from '../src/tahta/check';
import { countWord, holeAt, problemText, problemTitle } from '../src/tahta/explain';

const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
const labelOf = (doc: CircuitDoc, id: string | null) => doc.parts.find((p) => p.id === id)?.label ?? null;
const summary = (doc: CircuitDoc, build: Build) => checkBuild(doc, build, planBreadboard(doc)).problems.map((p) => `${p.part ? labelOf(doc, p.part) : `kablo ${p.wire!.a}–${p.wire!.b}`} ${p.kind}`);
const withHoles = (build: Build, id: string, holes: string[]): Build => ({ ...build, parts: { ...build.parts, [id]: { ...build.parts[id]!, holes } } });

describe('Eşleşme (Macar yöntemi)', () => {
  it('toplamı en büyük birebir atama', () => {
    expect(maxAssignment([[3, 1], [3, 2]])).toEqual([0, 1]);
    expect(maxAssignment([[1, 5, 0], [5, 1, 0], [0, 0, 2]])).toEqual([1, 0, 2]);
    expect(maxAssignment([])).toEqual([]);
  });
});

describe('Bütün örneklerde planBreadboard yerleşimi: Denetle 0 sorun', () => {
  for (const id of EXAMPLE_IDS) {
    it(id, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      if (plan.boards > 1) return;
      expect(checkBuild(doc, buildFromPlan(plan), plan).problems).toEqual([]);
    });
  }
});

describe('Sorun türleri (Deney 9, transistör anahtar)', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const plan = planBreadboard(doc);
  const right = buildFromPlan(plan);
  const R1 = idOf(doc, 'R1');
  const R2 = idOf(doc, 'R2');
  const Q1 = idOf(doc, 'Q1');
  const LED1 = idOf(doc, 'LED1');

  it('T3: R1 6b–6e (iki bacağı aynı şeritte) ve LED1 ters; bu sırayla, numaralanacak iki sorun', () => {
    const t3 = withHoles(withHoles(right, R1, ['6b', '6e']), LED1, ['12g', '11g']);
    const result = checkBuild(doc, t3, plan);
    expect(summary(doc, t3)).toEqual(['R1 sameStrip', 'LED1 reversed']);
    const [r1, led] = result.problems;
    expect(r1!.pins.map((p) => p.hole)).toEqual(['6b', '6e']);
    expect(r1!.onRail).toBe(false);
    // Şemada R1, FG1'in TTL çıkışı ile Q1'in bazı arasında.
    expect(r1!.pins.map((p) => `${labelOf(doc, p.expected!.part)}#${p.expected!.pin}`)).toEqual(['FG1#1', 'Q1#1']);
    // Şekil-24: LED1 transistöre paralel; anodu (12g) şemada kollektöre (ve R2'ye), katodu (11g) emetöre bağlı.
    expect(led!.pins.map((p) => p.hole)).toEqual(['12g', '11g']);
    expect(`${labelOf(doc, led!.pins[0]!.expected!.part)}#${led!.pins[0]!.expected!.pin}`).toBe('Q1#0');
    expect(`${labelOf(doc, led!.pins[1]!.expected!.part)}#${led!.pins[1]!.expected!.pin}`).toBe('Q1#2');
  });

  it('ters takılmış: transistörün bacak sırası, aletin kabloları (yer değiştirmiş)', () => {
    expect(summary(doc, withHoles(right, Q1, ['4h', '3h', '2h']))).toEqual(['Q1 reversed']);
    const ps = right.leads.filter((l) => labelOf(doc, l.part) === 'PS1');
    const swapped: Build = { ...right, leads: right.leads.map((l) => (l === ps[0] ? { ...l, hole: ps[1]!.hole } : l === ps[1] ? { ...l, hole: ps[0]!.hole } : l)) };
    expect(summary(doc, swapped)).toEqual(['PS1 reversed']);
  });

  it('direncin uçları yer değiştirince sorun yok (elektrikçe aynı)', () => {
    expect(summary(doc, withHoles(right, R2, ['11h', '7h']))).toEqual([]);
  });

  it('bağlı değil: kutudaki parça, takılmamış alet kablosu, boş şeritteki bacak', () => {
    const { [R2]: _, ...rest } = right.parts;
    const box = checkBuild(doc, { ...right, parts: rest }, plan).problems;
    expect(box.map((p) => [labelOf(doc, p.part), p.kind, p.inBox])).toEqual([['R2', 'notConnected', true]]);
    const com = right.leads.find((l) => labelOf(doc, l.part) === 'FG1' && l.pin === 2)!;
    const unplugged = checkBuild(doc, { ...right, leads: right.leads.filter((l) => l !== com) }, plan).problems;
    expect(unplugged.map((p) => [labelOf(doc, p.part), p.kind, p.pins.map((q) => q.hole)])).toEqual([['FG1', 'notConnected', [null]]]);
    // R2'nin 2. ucu boş bir şeritte (15h): kollektöre (ve LED1'in anoduna) bağlı değil.
    const floating = checkBuild(doc, withHoles(right, R2, ['7h', '15h']), plan).problems;
    expect(floating.map((p) => [labelOf(doc, p.part), p.kind])).toEqual([['R2', 'notConnected']]);
    expect(floating[0]!.pins.map((p) => [p.pin, p.hole, labelOf(doc, p.expected?.part ?? null), p.joined])).toEqual([[1, '15h', 'Q1', null]]);
  });

  it('fazladan bağlantı: başka ağın şeridindeki bacak; iki ağı birleştiren ara kablo kendisi sorun', () => {
    const r2 = checkBuild(doc, withHoles(right, R2, ['7h', '12h']), plan).problems;
    expect(r2.map((p) => [labelOf(doc, p.part), p.kind])).toEqual([['R2', 'extra']]);
    expect(labelOf(doc, r2[0]!.pins[0]!.joined!.part)).not.toBeNull();
    // 2d (FG1 TTL'nin şeridi) ile 7i (+ besleme şeridi) arasına kablo.
    const shorted: Build = { ...right, wires: [...right.wires, { a: '2d', b: '7i', color: 'blue' }] };
    const result = checkBuild(doc, shorted, plan).problems;
    expect(result.map((p) => [p.part, p.kind, p.wire?.a, p.wire?.b])).toEqual([[null, 'extra', '2d', '7i']]);
    expect(result[0]!.wire!.sides.map((s) => labelOf(doc, s.part)).every((l) => l !== null)).toBe(true);
  });

  it('eksik kablo: baza giden kablo yoksa tek sorun (bağlı değil)', () => {
    const missing: Build = { ...right, wires: right.wires.filter((w) => !(w.a === '6e' && w.b === '3f')) };
    expect(missing.wires.length).toBe(right.wires.length - 1);
    expect(checkBuild(doc, missing, plan).problems.map((p) => p.kind)).toEqual(['notConnected']);
  });

  it('boş tahta: her parça ve her alet kablosu bağlı değil', () => {
    const empty: Build = { cols: right.cols, parts: {}, wires: [], leads: [] };
    const problems = checkBuild(doc, empty, plan).problems;
    expect(problems.map((p) => labelOf(doc, p.part))).toEqual(['R1', 'Q1', 'R2', 'LED1', 'PS1', 'FG1']);
    expect(problems.every((p) => p.kind === 'notConnected')).toBe(true);
  });
});

describe('Kondansatör: elektrolitik ters takılınca sorun, kutupsuz takılınca değil', () => {
  it('örneklerdeki tahtaya takılan kondansatörler', () => {
    let seen = 0;
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      if (plan.boards > 1) continue;
      const right = buildFromPlan(plan);
      for (const part of doc.parts.filter((p) => p.type === 'capacitor' && right.parts[p.id])) {
        const [a, b] = right.parts[part.id]!.holes;
        const problems = checkBuild(doc, withHoles(right, part.id, [b!, a!]), plan).problems;
        const electrolytic = part.props.kind !== 'film';
        expect(problems.map((p) => [labelOf(doc, p.part), p.kind]), `${id} ${part.label}`).toEqual(electrolytic ? [[part.label, 'reversed']] : []);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(3);
  });
});

describe('Bütün örneklerde tek hata → tek sorun, doğru parça ve tür', { timeout: 120_000 }, () => {
  const POLAR = new Set(['diode', 'zener', 'schottky', 'led', 'buzzer']);
  const SYM = new Set(['resistor', 'inductor', 'ldr', 'ntc', 'fuse', 'switch', 'pushbutton']);
  for (const id of EXAMPLE_IDS) {
    it(id, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      if (plan.boards > 1) return;
      const right = buildFromPlan(plan);
      const got = (b: Build) => checkBuild(doc, b, plan).problems.map((p) => `${labelOf(doc, p.part) ?? 'kablo'} ${p.kind}`);
      for (const part of doc.parts) {
        const at = right.parts[part.id];
        if (!at) continue;
        const { [part.id]: _, ...rest } = right.parts;
        expect(got({ ...right, parts: rest }), `${id}: ${part.label} kutuda`).toEqual([`${part.label} notConnected`]);
        if (at.holes.length !== 2) continue;
        const swapped = withHoles(right, part.id, [at.holes[1]!, at.holes[0]!]);
        const polar = POLAR.has(part.type) || (part.type === 'capacitor' && part.props.kind !== 'film');
        if (polar) expect(got(swapped), `${id}: ${part.label} ters`).toEqual([`${part.label} reversed`]);
        if (SYM.has(part.type) || (part.type === 'capacitor' && part.props.kind === 'film')) expect(got(swapped), `${id}: ${part.label} çevrik`).toEqual([]);
      }
      for (const lead of right.leads) {
        const label = labelOf(doc, lead.part)!;
        expect(got({ ...right, leads: right.leads.filter((l) => l !== lead) }), `${id}: ${label}#${lead.pin} takılmadı`).toEqual([`${label} notConnected`]);
      }
    });
  }
});

describe('Bütün örneklerde fazladan kablo ve transistör bacak sırası', { timeout: 120_000 }, () => {
  for (const id of EXAMPLE_IDS) {
    it(id, () => {
      const doc = exampleDoc(id)!;
      const plan = planBreadboard(doc);
      if (plan.boards > 1) return;
      const right = buildFromPlan(plan);
      const got = (b: Build) => checkBuild(doc, b, plan).problems.map((p) => `${labelOf(doc, p.part) ?? 'kablo'} ${p.kind}`);
      // İki ayrı ağın şeritlerindeki boş delikler arasına kablo.
      const used = occupiedHoles(right);
      const strips = new Map<string, string>();
      for (const part of doc.parts) {
        right.parts[part.id]?.holes.forEach((h, pin) => {
          const m = /^(\d+)([a-j])$/.exec(h);
          if (!m) return;
          const half = 'abcde'.includes(m[2]!) ? 'abcde' : 'fghij';
          const free = [...half].map((r) => `${m[1]}${r}`).find((x) => !used.has(x));
          if (free) strips.set(free, plan.netOf.get(`${part.id}#${pin}`)!);
        });
      }
      const entries = [...strips];
      const pair = entries.flatMap(([a, na], i) => entries.slice(i + 1).filter(([, nb]) => nb !== na).map(([b]) => [a, b] as const))[0];
      if (pair) expect(got({ ...right, wires: [...right.wires, { a: pair[0], b: pair[1], color: 'blue' }] }), `${id}: ${pair.join('–')}`).toEqual(['kablo extra']);
      for (const part of doc.parts) {
        const at = right.parts[part.id];
        if (!at || !['npn', 'pnp', 'njfet', 'pjfet', 'nmos', 'pmos'].includes(part.type)) continue;
        const nets = [0, 2].map((pin) => plan.netOf.get(`${part.id}#${pin}`));
        if (nets[0] === nets[1]) continue;
        expect(got(withHoles(right, part.id, [at.holes[2]!, at.holes[1]!, at.holes[0]!])), `${id}: ${part.label}`).toEqual([`${part.label} reversed`]);
      }
    });
  }
});

describe('Sorun kartının metinleri (T3)', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const plan = planBreadboard(doc);
  const right = buildFromPlan(plan);
  const t3 = withHoles(withHoles(right, idOf(doc, 'R1'), ['6b', '6e']), idOf(doc, 'LED1'), ['12g', '11g']);
  const [r1, led] = checkBuild(doc, t3, plan).problems;

  it('başlık kademeye göre: sayı, yer, açıklama', () => {
    expect([1, 2, 3, 4].map((level) => problemTitle(doc, r1!, 0, level))).toEqual(['1. sorun', 'R1 çevresinde', 'R1 · iki bacağı aynı şeritte', 'R1 · iki bacağı aynı şeritte']);
    expect(problemTitle(doc, led!, 1, 2)).toBe('LED1 çevresinde');
    expect(problemTitle(doc, led!, 1, 3)).toBe('LED1 · ters takılmış');
  });

  it('açıklamalar', () => {
    expect(problemText(doc, r1!)).toBe(
      'R1’in bacakları 6b ve 6e’de. Aynı şeritteki beş delik birbirine bağlıdır: direncin iki ucu aynı düğüme düşer, R1 devre dışı kalır. Şemada R1, FG1’in TTL darbe çıkışı ile Q1’in baz (B) ucu arasında.',
    );
    expect(problemText(doc, led!)).toBe(
      'LED1 ters takılmış: anot ucu 12g’de, katot ucu 11g’de. Şemada anot ucu Q1’in kollektör (C) ucu ile, katot ucu Q1’in emetör (E) ucu ile aynı düğümde. LED’in uzun bacağı anottur.',
    );
    const q = checkBuild(doc, withHoles(right, idOf(doc, 'Q1'), ['4h', '3h', '2h']), plan).problems[0]!;
    expect(problemTitle(doc, q, 0, 3)).toBe('Q1 · bacak sırası yanlış');
    expect(problemText(doc, q)).toMatch(/^Q1’in bacakları yanlış sırada: kollektör \(C\) ucu 4h’de, baz \(B\) ucu 3h’de, emetör \(E\) ucu 2h’de\. Şemada /);
    const wire = checkBuild(doc, { ...right, wires: [...right.wires, { a: '2d', b: '7i', color: 'blue' }] }, plan).problems[0]!;
    expect(problemTitle(doc, wire, 0, 2)).toBe('2d – 7i kablosu çevresinde');
    expect(problemText(doc, wire)).toMatch(/^2d – 7i kablosu iki ayrı düğümü birleştiriyor: bir yanında .+, öbür yanında .+ var\. Şemada bunlar bağlı değil\.$/);
    const { [idOf(doc, 'R2')]: _, ...rest } = right.parts;
    expect(problemText(doc, checkBuild(doc, { ...right, parts: rest }, plan).problems[0]!)).toBe('R2 kutuda; henüz tahtaya takılmadı. Şemada R2, PS1’in 1. çıkışının + ucu ile Q1’in kollektör (C) ucu arasında.');
    const floating = checkBuild(doc, withHoles(right, idOf(doc, 'R2'), ['7h', '15h']), plan).problems[0]!;
    expect(problemText(doc, floating)).toMatch(/^R2’nin 2\. ucu \(15h\) Q1’in kollektör \(C\) ucu ile bağlı değil: tahtada aralarında bağlantı yok\.$/);
  });

  it('delik ekleri ve sayılar', () => {
    expect(['6e', '12a', '3h', 'üst + rayı (12. sütun hizası)'].map(holeAt)).toEqual(['6e’de', '12a’da', '3h’de', 'üst + rayında (12. sütun hizası)']);
    expect([1, 2, 10, 11].map(countWord)).toEqual(['bir', 'iki', 'on', '11']);
  });
});
