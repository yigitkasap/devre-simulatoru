// Sunum turu (sunum-turu, 2026-11-19): 15 adım, kısa metin ve kartın yeri (ekranın içinde, çerçeveyi örtmeden).
import { describe, expect, it } from 'vitest';
import { cardPlace, PRESENTATION_STEPS } from '../src/editor/PresentationTour';

describe('sunum turu', () => {
  it('15 adım; ilki ve sonuncusu ortada (hedefsiz), metinler en çok iki cümle', () => {
    expect(PRESENTATION_STEPS).toHaveLength(15);
    expect(PRESENTATION_STEPS[0]!.target).toBeNull();
    expect(PRESENTATION_STEPS[14]!.target).toBeNull();
    for (const s of PRESENTATION_STEPS.slice(1, 14)) expect(s.target).not.toBeNull();
    for (const s of PRESENTATION_STEPS) {
      expect(s.title.length).toBeGreaterThan(0);
      const sentences = s.text.split(/[.?!](?:\s|$)/).filter((x) => x.trim().length > 0);
      expect(sentences.length, s.text).toBeLessThanOrEqual(2);
    }
  });

  it('Örnekler penceresi yalnızca 3. adımda; Deney 1 adımları diyot-dc, Deney 2 ve 3B adımları yarım dalga', () => {
    expect(PRESENTATION_STEPS.map((s) => s.scene.examples === true)).toEqual(PRESENTATION_STEPS.map((_, i) => i === 2));
    expect(PRESENTATION_STEPS.slice(3, 8).every((s) => s.scene.example === 'diyot-dc')).toBe(true);
    expect(PRESENTATION_STEPS.slice(8, 13).every((s) => s.scene.example === 'yarim-dalga')).toBe(true);
    expect(PRESENTATION_STEPS.slice(9, 12).every((s) => s.scene.view === 'bench')).toBe(true);
  });

  const card = { w: 340, h: 190 };
  const inside = (p: { x: number; y: number }, c: { w: number; h: number }, s: { w: number; h: number }) =>
    p.x >= 0 && p.y >= 0 && p.x + c.w <= s.w && p.y + c.h <= s.h;
  const overlaps = (p: { x: number; y: number }, c: { w: number; h: number }, f: { x: number; y: number; w: number; h: number }) =>
    p.x < f.x + f.w && p.x + c.w > f.x && p.y < f.y + f.h && p.y + c.h > f.y;

  it('masaüstü: kart ekranın içinde ve küçük çerçeveyi örtmüyor (köşelerde, kenarlarda)', () => {
    const screen = { w: 1920, h: 1080 };
    for (const f of [
      { x: 1363, y: 4, w: 114, h: 48 },
      { x: 1809, y: 2, w: 107, h: 52 },
      { x: 4, y: 4, w: 100, h: 40 },
      { x: 1530, y: 217, w: 381, h: 280 },
      { x: 1376, y: 968, w: 136, h: 52 },
      { x: 700, y: 500, w: 200, h: 80 },
    ]) {
      const p = cardPlace(f, card, screen, false);
      expect(inside(p, card, screen), JSON.stringify(f)).toBe(true);
      expect(overlaps(p, card, f), JSON.stringify(f)).toBe(false);
    }
    // Çerçevesiz: ortada.
    const c = cardPlace(null, card, screen, false);
    expect(c.x).toBeCloseTo((1920 - 340) / 2);
    expect(c.y).toBeCloseTo((1080 - 190) / 2);
  });

  it('telefon: kart altta; çerçeve alttaysa üstte', () => {
    const screen = { w: 390, h: 844 };
    const phoneCard = { w: 366, h: 190 };
    expect(cardPlace({ x: 282, y: 2, w: 60, h: 56 }, phoneCard, screen, true).y).toBe(844 - 190 - 12);
    expect(cardPlace({ x: 217, y: 772, w: 169, h: 68 }, phoneCard, screen, true).y).toBe(12);
    expect(cardPlace(null, phoneCard, screen, true).y).toBe(844 - 190 - 12);
  });
});
