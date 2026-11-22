// Örnekler penceresinin Akdeniz Üniversitesi klasörü: yalnızca föyün dokuz deneyi klasörde; föyde olmayan
// devreler (diyot ve transistör ekleri, baraj projesi) ve genel gruplar ana listede; föye dayanan arıza senaryoları klasörde, dayanmayan ana listede. Örnek
// kimlikleri (?ornek= adresleri) ve sırası klasörden bağımsız.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_GROUPS, EXAMPLE_IDS, exampleGroup, folderGroups, groupFolder, type ExampleId } from '../src/examples';
import { FAULT_SCENARIOS, faultFolder } from '../src/examples/faultScenarios';
import { LAB_FIGURE_TEXTS } from '../src/i18n/foy';

describe('Örnek klasörleri', () => {
  it('Akdeniz klasöründe yalnızca Deney 1–9; baraj ve föyde olmayan ekler ana listede', () => {
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
    ]);
    expect(folderGroups(null).map((g) => g.id)).toEqual(['temel', 'aletler', 'yariiletken', 'elektromanyetizma', 'sensorler', 'ses', 'entegreler', 'lojik', 'arduino', 'baraj']);
  });

  it('her grup tam bir yerde; örnek kimlikleri ve sırası değişmedi', () => {
    const shown = [...folderGroups(null), ...folderGroups('akdeniz')];
    expect(new Set(shown.map((g) => g.id)).size).toBe(EXAMPLE_GROUPS.length);
    expect(EXAMPLE_IDS).toEqual(EXAMPLE_GROUPS.flatMap((g) => g.ids));
    expect(exampleGroup('bjt-yukseltec')).toBe('bjt-yukseltec');
    expect(groupFolder(exampleGroup('rc-dolma')!)).toBeNull();
    expect(groupFolder(exampleGroup('baraj-tek-isik')!)).toBeNull();
  });

  it('föye dayanan arıza senaryoları klasörde, temel devredeki (LED) ana listede', () => {
    const inFolder = FAULT_SCENARIOS.filter((s) => faultFolder(s) === 'akdeniz').map((s) => s.id);
    const outside = FAULT_SCENARIOS.filter((s) => faultFolder(s) === null).map((s) => s.id);
    expect(inFolder).toEqual(['ariza-diyot', 'ariza-dogrultucu', 'ariza-jfet', 'ariza-bjt']);
    expect(outside).toEqual(['ariza-led']);
  });
});

describe('Föyde olmayan devreler', () => {
  it('klasördeki her örneğin föyde şekli var; eski ekler ana listedeki "Diyot ve transistör devreleri" grubunda', () => {
    for (const g of folderGroups('akdeniz')) for (const id of g.ids as readonly ExampleId[]) expect(LAB_FIGURE_TEXTS[id], id).toBeDefined();
    const moved: ExampleId[] = ['schottky-1n4001', 'kopru-diyot', 'tristor-mandal', 'fet-yukseltec-kuplajli', 'bjt-yukseltec-kuplajli', 'mosfet-yukseltec-rs'];
    for (const id of moved) expect(exampleGroup(id), id).toBe('yariiletken');
    expect(groupFolder('yariiletken')).toBeNull();
  });
});
