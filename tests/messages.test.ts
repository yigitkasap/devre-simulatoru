// Editörün mesajları: toprak tuzağı tespiti, yanan LED için seri ön direnç önerisi.

import { describe, expect, it } from 'vitest';
import { e24AtLeast, earthTrapItem, findEarthTrap, seriesResistor, suggestedResistor } from '../src/editor/messages';
import { exampleDoc } from '../src/examples';
import { buildConnectivity } from '../src/model/connectivity';
import { updatePart } from '../src/model/docOps';
import type { CircuitDoc } from '../src/model/types';
import { compileNetlist } from '../src/sim';

const compile = (doc: CircuitDoc) => compileNetlist(buildConnectivity(doc).netlist);
const label = (doc: CircuitDoc, id: string) => doc.parts.find((p) => p.id === id)!.label;

describe('toprak tuzağı', () => {
  it('köprüde prob toprağı yükün − ucundaysa bir diyot kısa devre olur', () => {
    const doc = exampleDoc('toprak-tuzagi')!;
    const trap = findEarthTrap(doc, compile(doc));
    expect(trap).not.toBeNull();
    expect(trap!.shorted.map((id) => label(doc, id))).toEqual(['D4']);
    expect(trap!.instruments.map((id) => label(doc, id)).sort()).toEqual(['FG1', 'OSC1']);
    expect(trap!.comPoints).toHaveLength(2);
    const item = earthTrapItem(trap!, doc);
    expect(item.title).toBe('Toprak tuzağı');
    expect(item.detail).toContain('D4 kısa devre oldu');
    expect(item.badgeIds).toEqual(trap!.shorted);
  });

  it('osiloskop topraktan yalıtılınca tuzak kalmaz', () => {
    const doc = exampleDoc('toprak-tuzagi')!;
    const scope = doc.parts.find((p) => p.type === 'oscilloscope')!;
    const isolated = updatePart(doc, scope.id, { props: { ...scope.props, earthed: false } });
    expect(findEarthTrap(isolated, compile(isolated))).toBeNull();
  });

  it('topraklı tek cihazlı devrede tuzak yok', () => {
    const doc = exampleDoc('yarim-dalga')!;
    expect(findEarthTrap(doc, compile(doc))).toBeNull();
  });
});

describe('yanan LED: ön direnç önerisi', () => {
  it('E24 dizisinde bir üst değer', () => {
    expect(e24AtLeast(357.5)).toBe(360);
    expect(e24AtLeast(157.5)).toBe(160);
    expect(e24AtLeast(1000)).toBe(1000);
    expect(e24AtLeast(9.15)).toBe(10);
  });

  it('R = (V_kaynak − V_f) / 20 mA', () => {
    expect(suggestedResistor(9, 1.85)).toBe(360);
    expect(suggestedResistor(1.5, 1.85)).toBeNull();
  });

  it('LED ile direnç arasında seri ampermetre olsa da seri direnç bulunur', () => {
    const doc = exampleDoc('led-on-direnc')!;
    const led = doc.parts.find((p) => p.type === 'led')!;
    const r1 = doc.parts.find((p) => p.label === 'R1')!;
    expect(seriesResistor(led.id, compile(doc))).toBe(r1.id);
  });
});
