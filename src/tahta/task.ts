// Tahtada kur görevi (T6): başlangıç tahtası ve görevin kuralları (Denetle hakkı, ipucu sınırı). Saf hesap.
//
// "Güç rayları bağlı": güç kaynaklarının (pil, DC güç kaynağı, AC kaynak) raylara giden kabloları takılı
// ve raylar arası kablolar (üst ve alt raylar) takılı; planBreadboard yerleşimiyle. "Seçili parçalar
// takılı": bunlara ek olarak seçilen parçalar planBreadboard yerine takılı.

import { type BreadboardPlan } from '../bench3d/breadboard';
import { parseHole } from '../bench3d/holes';
import { buildFromPlan, emptyBuild, type Build } from '../model/build';
import type { BoardTask } from '../model/task';
import type { CircuitDoc } from '../model/types';

const SOURCES = new Set(['battery', 'dcsupply', 'acsource']);

export function startBuild(doc: CircuitDoc, plan: BreadboardPlan, board: BoardTask): Build {
  if (board.start === 'empty') return emptyBuild(plan.cols);
  const full = buildFromPlan(plan);
  const onRail = (name: string) => parseHole(name, plan.cols)?.kind === 'rail';
  const isSource = (id: string) => SOURCES.has(doc.parts.find((p) => p.id === id)?.type ?? '');
  const wires = full.wires.filter((w) => onRail(w.a) && onRail(w.b));
  const leads = full.leads.filter((l) => isSource(l.part) && onRail(l.hole));
  const parts = board.start === 'parts' ? Object.fromEntries(Object.entries(full.parts).filter(([id]) => board.parts.includes(id))) : {};
  return { cols: plan.cols, parts, wires, leads };
}

/** Denetle'ye basılabilir mi (3 kez hakkında 3 denemeden sonra hayır; teslimde Denetle yok). */
export function checksLeft(board: BoardTask | undefined, used: number): number | null {
  if (!board || board.checks === 'unlimited') return null;
  if (board.checks === 'submit') return 0;
  return Math.max(0, 3 - used);
}
