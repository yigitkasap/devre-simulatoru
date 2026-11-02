// Tahtada kur, 7. aşama: sonuç (T4). Oturum özeti (Denetle, ipucu, sorunlar, süre), kısa sorun adları,
// rapor (.json) ve sonucun kurulum değişince eskimesi.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { exampleDoc } from '../src/examples';
import { buildFromPlan, serializeBuild, type Build } from '../src/model/build';
import type { CircuitDoc } from '../src/model/types';
import { checkBuild } from '../src/tahta/check';
import { formatDuration, problemShort } from '../src/tahta/explain';
import { boardReport } from '../src/tahta/report';
import { openHint, recordCheck, sessionStats, solved, startSession } from '../src/tahta/session';

const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
const withHoles = (build: Build, id: string, holes: string[]): Build => ({ ...build, parts: { ...build.parts, [id]: { ...build.parts[id]!, holes } } });
const key = (b: Build) => JSON.stringify(serializeBuild(b));

describe('Sonuç (T4): T3’ün kurulumu üç denemede düzeltilir', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const plan = planBreadboard(doc);
  const right = buildFromPlan(plan);
  const t3 = withHoles(withHoles(right, idOf(doc, 'R1'), ['6b', '6e']), idOf(doc, 'LED1'), ['12g', '11g']);
  const half = withHoles(t3, idOf(doc, 'R1'), ['2c', '6c']);
  const t0 = 1_000_000;
  let s = startSession(t0);
  const first = checkBuild(doc, t3, plan);
  s = recordCheck(s, first, t0 + 60_000, key(t3));
  s = openHint(s, first.problems[0]!, t0 + 70_000);
  s = openHint(s, first.problems[0]!, t0 + 80_000);
  s = openHint(s, first.problems[1]!, t0 + 90_000);
  s = recordCheck(s, checkBuild(doc, half, plan), t0 + 400_000, key(half));
  s = recordCheck(s, checkBuild(doc, right, plan), t0 + 760_000, key(right));

  it('özet: 3 kez, 3 ipucu (en çok açıklama), sorunlar R1 aynı şeritte · LED1 ters, 12 dk 40 s', () => {
    const stats = sessionStats(s, t0 + 900_000);
    expect(stats.checks).toBe(3);
    expect(stats.hints).toBe(3);
    expect(stats.deepest).toBe(3);
    expect(stats.problems.map((p) => problemShort(doc, p)).join(' · ')).toBe('R1 aynı şeritte · LED1 ters');
    expect(formatDuration(stats.duration)).toBe('12 dk 40 s');
  });

  it('sorunsuz sonuç yalnızca kurulum aynı kaldıkça geçerli', () => {
    expect(solved(s, key(right))).toBe(true);
    expect(solved(s, key(t3))).toBe(false);
    expect(solved(startSession(0), key(right))).toBe(false);
  });

  it('rapor: denemeler, sorunlar, ipuçları ve süre', () => {
    const report = boardReport(doc, s, 'Transistör anahtar: LED kollektörde', t0 + 900_000);
    expect(report).toMatchObject({
      tur: 'tahtada-kur',
      devre: 'Transistör anahtar: LED kollektörde',
      sonuc: 'şemayla aynı',
      sure_sn: 760,
      denetle: [
        { sira: 1, sn: 60, sorunlar: ['R1 aynı şeritte', 'LED1 ters'] },
        { sira: 2, sn: 400, sorunlar: ['LED1 ters'] },
        { sira: 3, sn: 760, sorunlar: [] },
      ],
      ipuclari: [
        { sn: 70, sorun: 'R1 aynı şeritte', kademe: 'yer' },
        { sn: 80, sorun: 'R1 aynı şeritte', kademe: 'açıklama' },
        { sn: 90, sorun: 'LED1 ters', kademe: 'yer' },
      ],
    });
  });

  it('kısa adlar ve süre biçimi', () => {
    const q = checkBuild(doc, withHoles(right, idOf(doc, 'Q1'), ['4h', '3h', '2h']), plan).problems[0]!;
    const wire = checkBuild(doc, { ...right, wires: [...right.wires, { a: '2d', b: '7i', color: 'blue' }] }, plan).problems[0]!;
    const rec = (p: typeof q) => ({ id: p.id, kind: p.kind, part: p.part, wire: p.wire, onRail: p.onRail });
    expect(problemShort(doc, rec(q))).toBe('Q1 bacak sırası');
    expect(problemShort(doc, rec(wire))).toBe('2d – 7i kablosu fazla');
    expect([0, 40_400, 61_000, 3_725_000].map(formatDuration)).toEqual(['0 s', '40 s', '1 dk 1 s', '1 sa 2 dk']);
  });
});
