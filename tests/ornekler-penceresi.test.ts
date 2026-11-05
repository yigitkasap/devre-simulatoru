// Örnekler penceresinin içeriği (src/editor/examplesIndex.ts): grupların sırası ve yan listedeki
// işaretleri, kısa adlar, arama (Türkçe karakterlere duyarsız, parça adlarında da) ve başlıktaki eşleşme.

import { describe, expect, it } from 'vitest';
import { EXAMPLE_IDS } from '../src/examples';
import { FAULT_SCENARIOS } from '../src/examples/faultScenarios';
import { entryCount, entryTexts, exampleSections, normalize, searchSections, sectionOf, titleMatch } from '../src/editor/examplesIndex';
import { tr } from '../src/i18n/tr';

const sections = exampleSections();

describe('Örnekler penceresi: gruplar', () => {
  it('önce Akdeniz klasörü (Deney 1–9, baraj, arıza bulma), sonra genel gruplar; her örnek ve arıza görevi bir kez', () => {
    const folder = sections.filter((s) => s.folder === 'akdeniz');
    expect(folder.map((s) => s.mark)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'P', '!']);
    expect(folder.map((s) => s.short)).toEqual([
      'Diyot karakteristikleri',
      'Doğrultucular',
      'Kenetleyici ve katlayıcı',
      'Kırpıcılar',
      'FET karakteristikleri',
      'FET yükselteci',
      'BJT’li yükselteç',
      'MOSFET’li yükselteç',
      'Transistör anahtar',
      'Baraj projesi',
      'Arıza bulma',
    ]);
    expect(folder.map((s) => s.overline)).toEqual([
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `DENEY ${n}`),
      'PROJE',
      'ARIZA BULMA',
    ]);
    // Föydeki tam ad ve amaç.
    expect(folder[0]!.title).toBe('Diyot karakteristiklerinin incelenmesi');
    expect(folder[0]!.aim).toBe('Diyodun akımının gerilimle nasıl değiştiğini (I-V eğrisini) ölçüp incelemek.');
    // Genel gruplar klasörden sonra, üst yazısız; Akdeniz klasöründe 31 devre.
    const general = sections.filter((s) => s.folder === null);
    expect(sections.indexOf(general[0]!)).toBe(folder.length);
    expect(general.filter((s) => s.mark !== '!').every((s) => s.overline === null && s.mark === '')).toBe(true);
    expect(entryCount(folder)).toBe(31);
    const examples = sections.flatMap((s) => s.entries.filter((e) => e.kind === 'example').map((e) => e.id));
    const faults = sections.flatMap((s) => s.entries.filter((e) => e.kind === 'fault').map((e) => e.id));
    expect([...examples].sort()).toEqual([...EXAMPLE_IDS].sort());
    expect([...faults].sort()).toEqual(FAULT_SCENARIOS.map((s) => s.id).sort());
    expect(entryCount(sections)).toBe(EXAMPLE_IDS.length + FAULT_SCENARIOS.length);
  });

  it('kartta föy örneğinde şekil çipi, ekte "Föyde yok · ek"; tek satırlık cümle tr.examples.cues', () => {
    expect(entryTexts({ kind: 'example', id: 'alt-kirpici' })).toMatchObject({ chip: 'Şekil-13d', extra: false, title: 'Tek yönlü kırpıcı (3 V ve 2 V)' });
    expect(entryTexts({ kind: 'example', id: 'schottky-1n4001' })).toMatchObject({ chip: null, extra: true });
    expect(entryTexts({ kind: 'example', id: 'gerilim-bolucu' })).toMatchObject({ chip: null, extra: false, cue: tr.examples.cues['gerilim-bolucu'] });
    expect(tr.examples.cues['bjt-anahtar']).toContain('kesimdeyken');
  });

  it('açık örneğin ve arıza görevinin grubu', () => {
    expect(sectionOf(sections, 'yarim-dalga', null)?.key).toBe('dogrultucu');
    expect(sectionOf(sections, null, 'ariza-bjt')?.key).toBe('ariza:akdeniz');
    expect(sectionOf(sections, null, 'ariza-led')?.key).toBe('ariza');
    expect(sectionOf(sections, null, null)).toBeNull();
  });
});

describe('Örnekler penceresi: arama', () => {
  const ids = (q: string) => searchSections(sections, q).flatMap((s) => s.entries.map((e) => e.id));

  it('Türkçe karakterlere duyarsız; başlıkta, cümlede, açıklamada ve grup adında', () => {
    expect(normalize('Doğrultmaç ŞIĞ İz')).toBe('dogrultmac sig iz');
    expect(ids('dogrultmac')).toEqual(expect.arrayContaining(['yarim-dalga', 'kopru-dogrultmac']));
    expect(ids('DOĞRULTMAÇ')).toEqual(ids('dogrultmac'));
    // Grup adı: "Kırpıcılar" grubunun bütün kartları.
    expect(ids('kirpici devreler')).toEqual(['seri-kirpici', 'paralel-kirpici', 'cift-kirpici', 'alt-kirpici']);
  });

  it('devredeki parçaların adlarında ve modellerinde (zener, 555, BC107)', () => {
    expect(ids('zener')).toContain('zener-karakteristigi');
    expect(ids('555')).toEqual(expect.arrayContaining(['555-astabil', '555-monostabil', '555-ses']));
    expect(ids('bc107')).toEqual(expect.arrayContaining(['bjt-yukseltec', 'bjt-anahtar', 'baraj-cubuk']));
  });

  it('eşleşme yoksa boş; başlıktaki eşleşmenin yeri', () => {
    expect(entryCount(searchSections(sections, 'qqqzzz'))).toBe(0);
    expect(titleMatch('Yarım dalga doğrultmaç', 'DOGRULT')).toEqual([12, 19]);
    expect(titleMatch('Yarım dalga doğrultmaç', 'zener')).toBeNull();
  });
});
