// Son devreler: yerine başka devre açılan devrelerin kaydı (editor/recentCircuits.ts).

import { describe, expect, it } from 'vitest';
import { RECENT_LIMIT, restoreRecent, withRecent, worthRemembering } from '../src/editor/recentCircuits';
import { exampleDoc } from '../src/examples';
import { EMPTY_ANALYSIS } from '../src/model/analysis';
import { removeItems } from '../src/model/docOps';
import { emptyDoc } from '../src/model/types';

const led = exampleDoc('led-on-direnc')!;
const divider = exampleDoc('gerilim-bolucu')!;
const edited = removeItems(led, [led.parts[0]!.id], []);

describe('Son devreler', () => {
  it('boş devre ve hiç değiştirilmemiş örnek kaydedilmez; değiştirilmiş örnek ve örnek dışı devre kaydedilir', () => {
    expect(worthRemembering(emptyDoc(), null)).toBe(false);
    expect(worthRemembering(led, led)).toBe(false);
    expect(worthRemembering(exampleDoc('led-on-direnc')!, led)).toBe(false);
    expect(worthRemembering(edited, led)).toBe(true);
    expect(worthRemembering(led, null)).toBe(true);
  });

  it('yeni kayıt başa geçer; aynı devre iki kez girmez; en çok 5 kayıt', () => {
    let list = withRecent([], edited, EMPTY_ANALYSIS, 'LED ve ön direnç', 1);
    list = withRecent(list, divider, EMPTY_ANALYSIS, 'Gerilim bölücü', 2);
    expect(list.map((e) => e.title)).toEqual(['Gerilim bölücü', 'LED ve ön direnç']);
    // Aynı devre yeniden: eskisi çıkar, yenisi başta (zamanı güncel).
    list = withRecent(list, edited, EMPTY_ANALYSIS, 'LED ve ön direnç', 3);
    expect(list.map((e) => [e.title, e.savedAt])).toEqual([
      ['LED ve ön direnç', 3],
      ['Gerilim bölücü', 2],
    ]);
    for (let i = 0; i < 8; i++) list = withRecent(list, { ...divider, parts: divider.parts.slice(0, i % divider.parts.length + 1).map((p) => ({ ...p, label: `${p.label}${i}` })) }, EMPTY_ANALYSIS, `D${i}`, 10 + i);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[0]!.title).toBe('D7');
  });

  it('kayıt geri yüklenince devre aynı (parçalar, kablolar)', () => {
    const [entry] = withRecent([], edited, EMPTY_ANALYSIS, 'LED ve ön direnç', 1);
    expect(entry!.parts).toBe(edited.parts.length);
    const restored = restoreRecent(entry!);
    expect(restored?.doc.parts.map((p) => p.label)).toEqual(edited.parts.map((p) => p.label));
    expect(restored?.doc.wires).toHaveLength(edited.wires.length);
    expect(restoreRecent({ ...entry!, data: '{bozuk' })).toBeNull();
  });
});
