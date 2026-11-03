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

/** Görevde hazır gelen (kilitli) parçalar, ara kablolar ve alet kabloları: taşınamaz, döndürülemez, silinemez. */
export interface Locks {
  readonly parts: ReadonlySet<string>;
  /** Ara kablo: "a|b". */
  readonly wires: ReadonlySet<string>;
  /** Alet kablosu: "parça#uç". */
  readonly leads: ReadonlySet<string>;
}

export const wireKey = (w: { readonly a: string; readonly b: string }) => `${w.a}|${w.b}`;
export const leadKey = (part: string, pin: number) => `${part}#${pin}`;

/** Tahtada seçili öğe: parça, ara kablo ya da alet kablosu. */
export type LockItem = { readonly kind: 'part'; readonly id: string } | { readonly kind: 'wire'; readonly a: string; readonly b: string } | { readonly kind: 'lead'; readonly part: string; readonly pin: number };

/** Öğe kilitli mi (görevde hazır geldi): Döndür ve Sil pasif, taşıma ve çıkarma yok. */
export function isLocked(locks: Locks | null | undefined, item: LockItem): boolean {
  if (!locks) return false;
  if (item.kind === 'part') return locks.parts.has(item.id);
  if (item.kind === 'wire') return locks.wires.has(wireKey(item));
  return locks.leads.has(leadKey(item.part, item.pin));
}

/** Başlangıç tahtasındaki her şey kilitli; boş başlangıçta kilit yok (null). */
export function locksOf(start: Build): Locks | null {
  const locks = { parts: new Set(Object.keys(start.parts)), wires: new Set(start.wires.map(wireKey)), leads: new Set(start.leads.map((l) => leadKey(l.part, l.pin))) };
  return locks.parts.size + locks.wires.size + locks.leads.size > 0 ? locks : null;
}

/** "Tahtayı boşalt" görevde: yalnızca öğrencinin taktıkları kalkar, kilitliler yerinde kalır. */
export function keepLocked(build: Build, locks: Locks | null): Build {
  if (!locks) return { cols: build.cols, parts: {}, wires: [], leads: [] };
  return {
    cols: build.cols,
    parts: Object.fromEntries(Object.entries(build.parts).filter(([id]) => locks.parts.has(id))),
    wires: build.wires.filter((w) => locks.wires.has(wireKey(w))),
    leads: build.leads.filter((l) => locks.leads.has(leadKey(l.part, l.pin))),
  };
}
