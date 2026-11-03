// Örnekler penceresinin Akdeniz Üniversitesi klasörü: föyün dokuz deneyi ve baraj projesi klasörde,
// genel gruplar ana listede; föye dayanan arıza senaryoları klasörde, dayanmayan ana listede. Örnek
// kimlikleri (?ornek= adresleri) ve sırası klasörden bağımsız.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, exampleGroup, folderGroups, groupFolder } from '../src/examples';
import { FAULT_SCENARIOS, faultFolder } from '../src/examples/faultScenarios';

describe('Örnek klasörleri', () => {
  it('Deney 1–9 ve baraj Akdeniz klasöründe, genel gruplar ana listede', () => {
    expect(folderGroups('akdeniz').map((g) => g.id)).toEqual([
      'diyot-karakteristigi',
      'dogrultucu',
      'kenetleyici',
      'kirpici',
      'fet-karakteristigi',
      'fet-yukseltec',
      'bjt-yukseltec',
      'mosfet-yukseltec',
      'anahtar',
      'baraj',
    ]);
    expect(folderGroups(null).map((g) => g.id)).toEqual(['temel', 'aletler', 'elektromanyetizma', 'sensorler', 'ses', 'entegreler', 'arduino']);
  });

  it('her grup tam bir yerde; örnek kimlikleri ve sırası değişmedi', () => {
    const shown = [...folderGroups(null), ...folderGroups('akdeniz')];
    expect(new Set(shown.map((g) => g.id)).size).toBe(EXAMPLE_GROUPS.length);
    expect(EXAMPLE_IDS).toEqual(EXAMPLE_GROUPS.flatMap((g) => g.ids));
    expect(exampleGroup('bjt-yukseltec')).toBe('bjt-yukseltec');
    expect(groupFolder(exampleGroup('rc-dolma')!)).toBeNull();
    expect(groupFolder(exampleGroup('baraj-tek-isik')!)).toBe('akdeniz');
  });

  it('föye dayanan arıza senaryoları klasörde, temel devredeki (LED) ana listede', () => {
    const inFolder = FAULT_SCENARIOS.filter((s) => faultFolder(s) === 'akdeniz').map((s) => s.id);
    const outside = FAULT_SCENARIOS.filter((s) => faultFolder(s) === null).map((s) => s.id);
    expect(inFolder).toEqual(['ariza-diyot', 'ariza-dogrultucu', 'ariza-jfet', 'ariza-bjt']);
    expect(outside).toEqual(['ariza-led']);
  });
});
