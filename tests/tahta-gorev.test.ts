// Tahtada kur, 9. aşama: görev (T6). Görev bağlantısında Tahtada kur ayarları ve başlangıç tahtası;
// başlangıç tahtası (boş, güç rayları bağlı, seçili parçalar takılı); Denetle hakkı.

import { describe, expect, it } from 'vitest';
import { planBreadboard } from '../src/bench3d/breadboard';
import { exampleDoc } from '../src/examples';
import { DEFAULT_BOARD_TASK, parseTask, taskFromHash, taskUrl, type TaskDef } from '../src/model/task';
import type { CircuitDoc } from '../src/model/types';
import { checksLeft, keepLocked, leadKey, locksOf, startBuild, wireKey } from '../src/tahta/task';

const idOf = (doc: CircuitDoc, label: string) => doc.parts.find((p) => p.label === label)!.id;
const labelOf = (doc: CircuitDoc, id: string) => doc.parts.find((p) => p.id === id)!.label;

describe('Tahtada kur görevi (T6)', () => {
  const doc = exampleDoc('bjt-anahtar')!;
  const plan = planBreadboard(doc);

  it('görev bağlantısı ayarları ve başlangıç tahtasını taşır; eksik ya da geçersiz alanlar varsayılana döner', () => {
    const board = { start: 'parts', parts: [idOf(doc, 'Q1')], checks: 'three', maxHint: 3, showConnected: false, allowPlay: false } as const;
    const task: TaskDef = { name: 'Deney 9 · tahtada kur', instruction: '', editable: [], allowNew: false, targets: [], predict: false, board };
    const withBuild = { ...doc, build: startBuild(doc, plan, board) };
    const back = taskFromHash(new URL(taskUrl(task, withBuild, 'https://x.test/devre/')).hash)!;
    expect(back.task.board).toEqual(board);
    expect(back.doc.build?.parts[idOf(doc, 'Q1')]?.holes).toEqual(['2h', '3h', '4h']);
    expect(parseTask({ name: 'a', board: {} })!.board).toEqual(DEFAULT_BOARD_TASK);
    expect(parseTask({ name: 'a', board: { start: 'x', checks: 'y', maxHint: 9, parts: [1, 'p2'] } })!.board).toEqual({ ...DEFAULT_BOARD_TASK, parts: ['p2'] });
    expect(parseTask({ name: 'a' })!.board).toBeUndefined();
  });

  it('başlangıç: boş tahta; güç rayları bağlı (raylar arası kablolar ve kaynağın ray kabloları); seçili parçalar takılı', () => {
    const empty = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start: 'empty' });
    expect([Object.keys(empty.parts).length, empty.wires.length, empty.leads.length]).toEqual([0, 0, 0]);
    const rails = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start: 'rails' });
    expect(Object.keys(rails.parts)).toEqual([]);
    expect(rails.wires.every((w) => w.a.includes('rayı') && w.b.includes('rayı'))).toBe(true);
    expect(rails.wires.length).toBe(2);
    expect(rails.leads.map((l) => `${labelOf(doc, l.part)}#${l.pin}`)).toEqual(['PS1#0', 'PS1#1']);
    const parts = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start: 'parts', parts: [idOf(doc, 'Q1')] });
    expect(Object.keys(parts.parts).map((id) => labelOf(doc, id))).toEqual(['Q1']);
    expect(parts.wires).toEqual(rails.wires);
    // Hazır parçalar planBreadboard'un yerinde.
    expect(parts.parts[idOf(doc, 'Q1')]!.holes).toEqual(['2h', '3h', '4h']);
  });

  it('hazır gelenler kilitli; Tahtayı boşalt yalnızca öğrencinin taktıklarını kaldırır', () => {
    const start = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start: 'parts', parts: [idOf(doc, 'Q1')] });
    const locks = locksOf(start)!;
    expect([...locks.parts].map((id) => labelOf(doc, id))).toEqual(['Q1']);
    expect(locks.wires.size).toBe(2);
    expect([...locks.leads]).toEqual(start.leads.map((l) => leadKey(l.part, l.pin)));
    // Öğrenci R1'i taktı, bir kablo ve FG1'in kablosunu ekledi.
    const fg = idOf(doc, 'FG1');
    const student = {
      ...start,
      parts: { ...start.parts, [idOf(doc, 'R1')]: { holes: ['2c', '6c'] } },
      wires: [...start.wires, { a: '6a', b: '3j', color: 'orange' as const }],
      leads: [...start.leads, { part: fg, pin: 1, hole: '2a' }],
    };
    expect(keepLocked(student, locks)).toEqual(start);
    expect(student.wires.filter((w) => locks.wires.has(wireKey(w))).length).toBe(2);
    // Boş başlangıçta kilit yok; boşaltınca tahta boş.
    const empty = startBuild(doc, plan, { ...DEFAULT_BOARD_TASK, start: 'empty' });
    expect(locksOf(empty)).toBeNull();
    expect(keepLocked(student, null)).toEqual({ cols: start.cols, parts: {}, wires: [], leads: [] });
  });

  it('Denetle hakkı: sınırsız, 3 kez, teslimde', () => {
    expect(checksLeft(undefined, 5)).toBeNull();
    expect(checksLeft({ ...DEFAULT_BOARD_TASK, checks: 'unlimited' }, 9)).toBeNull();
    expect([0, 1, 2, 3, 4].map((n) => checksLeft({ ...DEFAULT_BOARD_TASK, checks: 'three' }, n))).toEqual([3, 2, 1, 0, 0]);
    expect(checksLeft({ ...DEFAULT_BOARD_TASK, checks: 'submit' }, 0)).toBe(0);
  });
});
