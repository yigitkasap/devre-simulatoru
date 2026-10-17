// Fizik 5: gerçek dünya sınırları. LED'in ve 1N4001'in ters gerilimi, direncin güç sınırı,
// elektrolitik kondansatörün ters gerilimi. Her uyarı için bir "çıkar" ve bir "çıkmaz" testi;
// AC devrede uyarı periyot içinde yanıp sönmez; eski kayıtlar eski davranışı korur.

import { describe, expect, it } from 'vitest';
import { itemFromDiagnostic } from '../src/editor/messages';
import { EXAMPLE_IDS, exampleDoc } from '../src/examples';
import { CATALOG, partProp } from '../src/model/catalog';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import { CircuitSimulator, type Diagnostic } from '../src/sim';
import { circuit } from './helpers';

const RATING_CODES = ['reverse-voltage', 'resistor-overpower', 'capacitor-reverse'];
const find = (s: CircuitSimulator, code: string) => s.runtimeDiagnostics.find((d) => d.code === code);
const ratings = (s: CircuitSimulator) => s.runtimeDiagnostics.filter((d) => RATING_CODES.includes(d.code));
const sine = (amplitude: number, frequency = 50) => ({ waveform: 'sine', amplitude, frequency, offset: 0, internalResistance: 0 });
const describeIt = (d: Diagnostic, type: string, label: string) =>
  itemFromDiagnostic(d, { label: () => label, type: () => type as never });

describe('Fizik 5: LED’in ters gerilimi (en fazla 5 V)', () => {
  it('çıkar: 9 V ters gerilimde uyarı ve görev tanımındaki metin', () => {
    const s = new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').resistor('R', 'a', 'b', 470).led('L', 'g', 'b').build());
    s.advance(0);
    const d = find(s, 'reverse-voltage')!;
    expect(d.severity).toBe('warning');
    expect(d.elementIds).toEqual(['L']);
    expect(d.params!.voltage).toBeCloseTo(9, 6);
    expect(describeIt(d, 'led', 'D1').detail).toContain('LED ters yönde 9 V görüyor; gerçek bir LED en fazla 5 V’a dayanır ve bozulabilir.');
  });

  it('çıkmaz: 3 V ters gerilimde ya da ileri yönde', () => {
    const reverse = new CircuitSimulator(circuit().battery('B', 'a', 'g', 3).ground('G', 'g').resistor('R', 'a', 'b', 470).led('L', 'g', 'b').build());
    reverse.advance(0);
    expect(find(reverse, 'reverse-voltage')).toBeUndefined();
    const forward = new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').resistor('R', 'a', 'b', 470).led('L', 'b', 'g').build());
    forward.advance(0);
    expect(find(forward, 'reverse-voltage')).toBeUndefined();
  });

  it('AC’de (10 V tepe) uyarı her karede durur, yarım periyotta sönmez', () => {
    const s = new CircuitSimulator(circuit().acsource('S', 'a', 'g', sine(10)).ground('G', 'g').resistor('R', 'a', 'b', 1000).led('L', 'b', 'g').build());
    s.advance(0.1);
    for (let k = 0; k < 12; k++) {
      s.advance(1 / 600);
      const d = find(s, 'reverse-voltage');
      expect(d, `kare ${k}`).toBeDefined();
      expect(d!.params!.voltage).toBeGreaterThan(9.5);
    }
  });
});

describe('Fizik 5: 1N4001’in ters gerilimi (VRRM = 50 V)', () => {
  const reversed = (volts: number, model: string) =>
    new CircuitSimulator(circuit().battery('B', 'a', 'g', volts).ground('G', 'g').resistor('R', 'a', 'k', 10e3).add('diode', 'D', ['g', 'k'], { model }).build());

  it('çıkar: 60 V ters gerilimde', () => {
    const s = reversed(60, '1N4001');
    s.advance(0);
    const d = find(s, 'reverse-voltage')!;
    expect(d.params!.limit).toBe(50);
    expect(d.params!.voltage).toBeGreaterThan(59.9);
    expect(describeIt(d, 'diode', 'D1').detail).toContain('1N4001 ters yönde');
  });

  it('çıkmaz: 40 V ters gerilimde; veri sayfası olmayan genel modelde 60 V’ta da', () => {
    const s = reversed(40, '1N4001');
    s.advance(0);
    expect(find(s, 'reverse-voltage')).toBeUndefined();
    const generic = reversed(60, 'genel');
    generic.advance(0);
    expect(find(generic, 'reverse-voltage')).toBeUndefined();
  });
});

describe('Fizik 5: direncin güç sınırı', () => {
  const loaded = (props: Record<string, string | number>) =>
    new CircuitSimulator(circuit().battery('B', 'a', 'g', 9).ground('G', 'g').add('resistor', 'R', ['a', 'g'], { resistance: 100, ...props }).build());

  it('çıkar: 9 V, 100 Ω (0,81 W) varsayılan 1/4 W dirençte; tuvalde ısınma oranı 3,24', () => {
    const s = loaded({});
    s.advance(0);
    const d = find(s, 'resistor-overpower')!;
    expect(d.params!.power).toBeCloseTo(0.81, 9);
    expect(d.params!.rating).toBe(0.25);
    expect(s.status('R').powerRatio).toBeCloseTo(3.24, 9);
    expect(describeIt(d, 'resistor', 'R1').detail).toContain('güç sınırı 0,25 W');
  });

  it('çıkmaz: aynı devrede 1 W’lık dirençte', () => {
    const s = loaded({ powerRating: '1' });
    s.advance(0);
    expect(find(s, 'resistor-overpower')).toBeUndefined();
    expect(s.status('R').powerRatio).toBeCloseTo(0.81, 9);
  });

  it('AC’de ortalama güç sayılır: 10 V tepe, 220 Ω’da ortalama 0,227 W (tepe 0,45 W) uyarı vermez; 100 Ω’da 0,5 W verir', () => {
    const at = (r: number) => {
      const s = new CircuitSimulator(circuit().acsource('S', 'a', 'g', sine(10)).ground('G', 'g').resistor('R', 'a', 'g', r).build());
      s.advance(0.1);
      s.advance(0.005);
      return s;
    };
    const low = at(220);
    expect(find(low, 'resistor-overpower')).toBeUndefined();
    expect(low.status('R').powerRatio! * 0.25).toBeCloseTo(50 / 220, 2);
    const high = at(100);
    expect(find(high, 'resistor-overpower')!.params!.power).toBeCloseTo(0.5, 2);
  });

  it('eski kayıt (güç sınırı yok) 1/4 W sayılır; seçenekler 1/8 – 5 W', () => {
    expect(partProp('resistor', { resistance: 100 }, 'powerRating')).toBe('0.25');
    expect(CATALOG.resistor.propDefs.find((d) => d.key === 'powerRating')).toMatchObject({ options: ['0.125', '0.25', '0.5', '1', '2', '5'] });
  });
});

describe('Fizik 5: elektrolitik kondansatörün ters gerilimi (en fazla 1 V)', () => {
  const charged = (props: Record<string, string | number>, volts = 9) =>
    new CircuitSimulator(
      circuit().battery('B', 'a', 'g', volts).ground('G', 'g').resistor('R', 'a', 'c', 1000).add('capacitor', 'C', ['g', 'c'], { capacitance: 100e-6, ...props }).build(),
    );

  it('çıkar: elektrolitik ters bağlı, −9 V', () => {
    const s = charged({ kind: 'electrolytic' });
    s.runUntil(1);
    const d = find(s, 'capacitor-reverse')!;
    expect(d.params!.voltage).toBeGreaterThan(8.9);
    expect(d.params!.limit).toBe(1);
    expect(describeIt(d, 'capacitor', 'C1').detail).toContain('elektrolitik kondansatör ters yönde');
  });

  it('çıkmaz: seramik/film ters bağlı; elektrolitik doğru yönde; elektrolitik −0,8 V’ta', () => {
    const film = charged({ kind: 'film' });
    film.runUntil(1);
    expect(find(film, 'capacitor-reverse')).toBeUndefined();
    const forward = new CircuitSimulator(
      circuit().battery('B', 'a', 'g', 9).ground('G', 'g').resistor('R', 'a', 'c', 1000).add('capacitor', 'C', ['c', 'g'], { capacitance: 100e-6, kind: 'electrolytic' }).build(),
    );
    forward.runUntil(1);
    expect(find(forward, 'capacitor-reverse')).toBeUndefined();
    const small = charged({ kind: 'electrolytic' }, 0.8);
    small.runUntil(1);
    expect(find(small, 'capacitor-reverse')).toBeUndefined();
  });

  it('eski kayıt (tür yok) kutupsuz: uyarı yok, sembolde + yok; yeni kondansatör elektrolitik', () => {
    const legacy = charged({});
    legacy.runUntil(1);
    expect(find(legacy, 'capacitor-reverse')).toBeUndefined();
    expect(partProp('capacitor', { capacitance: 1e-6 }, 'kind')).toBe('film');
    expect(CATALOG.capacitor.defaultProps.kind).toBe('electrolytic');
  });

  it('AC kuplajında (sıfır çevresinde ≈ ±4,2 V) elektrolitik uyarı verir, film vermez', () => {
    const coupled = (kind: string) => {
      const s = new CircuitSimulator(
        circuit().acsource('S', 'a', 'g', sine(5, 1000)).ground('G', 'g').add('capacitor', 'C', ['a', 'o'], { capacitance: 1e-6, kind }).resistor('R', 'o', 'g', 100).build(),
      );
      s.advance(0.02);
      s.advance(0.002);
      return s;
    };
    expect(find(coupled('electrolytic'), 'capacitor-reverse')).toBeDefined();
    expect(find(coupled('film'), 'capacitor-reverse')).toBeUndefined();
  });
});

describe('Fizik 5: örneklerde gereksiz uyarı yok', () => {
  it('bütün örnekler (anahtarlı ve haznesi dolu durumlar dahil) sınır uyarısı vermez', () => {
    const variants: Array<{ name: string; doc: NonNullable<ReturnType<typeof exampleDoc>> }> = [];
    for (const id of EXAMPLE_IDS) {
      const doc = exampleDoc(id)!;
      variants.push({ name: id, doc });
      for (const sw of doc.parts.filter((p) => p.type === 'switch' && p.props.closed !== true)) {
        variants.push({ name: `${id} ${sw.label}`, doc: updatePart(doc, sw.id, { props: { ...sw.props, closed: true } }) });
      }
      const tank = doc.parts.find((p) => p.type === 'tank');
      if (tank) variants.push({ name: `${id} dolu`, doc: updatePart(doc, tank.id, { props: { ...tank.props, level: 100, mode: 'stop' } }) });
    }
    for (const { name, doc } of variants) {
      const s = new CircuitSimulator(buildConnectivity(doc).netlist);
      s.advance(s.isTransient ? 0.3 : 0);
      for (let k = 0; k < (s.isTransient ? 10 : 1); k++) {
        s.advance(s.isTransient ? 0.01 : 0);
        expect(ratings(s).map((d) => d.code), name).toEqual([]);
      }
    }
    // Bütün örnekleri ve varyantlarını çözer: yüklü makinede 5 s'lik varsayılan süre yetmeyebilir.
  }, 60000);
});
