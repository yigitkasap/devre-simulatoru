// Tahtada kur oturumu: Denetle denemeleri, açılan ipuçları ve süre (sonuç kartı ve görev raporu için).
// Saf hesap.
//
// İpucu kademeleri (README → Tahtada kur, 10) her sorunda ayrı: 1 sayı (Denetle'nin kendisi, ipucu
// sayılmaz), 2 yer, 3 açıklama, 4 örnek yerleşim. Yeniden denetlemede aynı sorun (aynı parça, aynı tür)
// açılmış kademesini korur. Fazladan ara kablonun örnek yerleşimi yoktur (kablo çıkarılır): 3 kademe.

import type { CheckResult, Problem, ProblemKind } from './check';

export const HINT_NAMES = ['sayı', 'yer', 'açıklama', 'örnek yerleşim'] as const;

export interface CheckRecord {
  /** Oturumun başından geçen süre (ms). */
  readonly at: number;
  readonly problems: ReadonlyArray<{ readonly id: string; readonly kind: ProblemKind }>;
}

export interface HintRecord {
  readonly at: number;
  readonly problem: string;
  readonly level: number;
}

export interface BoardSession {
  /** Başlangıç (Date.now()). */
  readonly started: number;
  readonly checks: readonly CheckRecord[];
  readonly hints: readonly HintRecord[];
  /** Sorun → açık kademe (1–4). */
  readonly levels: Readonly<Record<string, number>>;
  /** Son Denetle'nin sonucu (denetlenmediyse null). */
  readonly result: CheckResult | null;
  /** Sorunların yeri tahtada ve şemada işaretli (İşaretleri gizle ile kapanır). */
  readonly marks: boolean;
}

export function startSession(now: number): BoardSession {
  return { started: now, checks: [], hints: [], levels: {}, result: null, marks: true };
}

export function maxLevel(problem: Problem): number {
  return problem.part === null ? 3 : 4;
}

export function levelOf(session: BoardSession, problem: Problem): number {
  return session.levels[problem.id] ?? 1;
}

export function recordCheck(session: BoardSession, result: CheckResult, now: number): BoardSession {
  const levels: Record<string, number> = {};
  for (const p of result.problems) levels[p.id] = session.levels[p.id] ?? 1;
  return {
    ...session,
    checks: [...session.checks, { at: now - session.started, problems: result.problems.map((p) => ({ id: p.id, kind: p.kind })) }],
    levels,
    result,
  };
}

/** Sorunun bir sonraki kademesini açar (son kademedeyse değişmez). */
export function openHint(session: BoardSession, problem: Problem, now: number): BoardSession {
  const level = levelOf(session, problem);
  if (level >= maxLevel(problem)) return session;
  return { ...session, levels: { ...session.levels, [problem.id]: level + 1 }, hints: [...session.hints, { at: now - session.started, problem: problem.id, level: level + 1 }] };
}
