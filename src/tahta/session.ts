// Tahtada kur oturumu: Denetle denemeleri, açılan ipuçları ve süre (sonuç kartı ve görev raporu için).
// Saf hesap.
//
// İpucu kademeleri (README → Tahtada kur, 10) her sorunda ayrı: 1 sayı (Denetle'nin kendisi, ipucu
// sayılmaz), 2 yer, 3 açıklama, 4 örnek yerleşim. Yeniden denetlemede aynı sorun (aynı parça, aynı tür)
// açılmış kademesini korur. Fazladan ara kablonun örnek yerleşimi yoktur (kablo çıkarılır): 3 kademe.

import type { CheckResult, Problem, ProblemKind } from './check';

/** Denetle sonucundaki bir sorunun kaydı (rapor ve özet için). */
export interface ProblemRecord {
  readonly id: string;
  readonly kind: ProblemKind;
  readonly part: string | null;
  readonly wire: { readonly a: string; readonly b: string } | null;
  readonly onRail: boolean;
}

export interface CheckRecord {
  /** Oturumun başından geçen süre (ms). */
  readonly at: number;
  readonly problems: readonly ProblemRecord[];
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
  /** Son Denetle'deki kurulum (karşılaştırma anahtarı); kurulum değiştiyse sonuç eskimiştir. */
  readonly checkedBuild: string | null;
  /** Sorunların yeri tahtada ve şemada işaretli (İşaretleri gizle ile kapanır). */
  readonly marks: boolean;
}

export function startSession(now: number): BoardSession {
  return { started: now, checks: [], hints: [], levels: {}, result: null, checkedBuild: null, marks: true };
}

export function maxLevel(problem: Problem): number {
  return problem.part === null ? 3 : 4;
}

export function levelOf(session: BoardSession, problem: Problem): number {
  return session.levels[problem.id] ?? 1;
}

export function recordCheck(session: BoardSession, result: CheckResult, now: number, buildKey: string | null = null): BoardSession {
  const levels: Record<string, number> = {};
  for (const p of result.problems) levels[p.id] = session.levels[p.id] ?? 1;
  const problems = result.problems.map((p) => ({ id: p.id, kind: p.kind, part: p.part, wire: p.wire ? { a: p.wire.a, b: p.wire.b } : null, onRail: p.onRail }));
  return { ...session, checks: [...session.checks, { at: now - session.started, problems }], levels, result, checkedBuild: buildKey };
}

/** Sorunun bir sonraki kademesini açar (son kademedeyse değişmez). */
export function openHint(session: BoardSession, problem: Problem, now: number): BoardSession {
  const level = levelOf(session, problem);
  if (level >= maxLevel(problem)) return session;
  return { ...session, levels: { ...session.levels, [problem.id]: level + 1 }, hints: [...session.hints, { at: now - session.started, problem: problem.id, level: level + 1 }] };
}

/** Son Denetle sorunsuz (ve kurulum o andan beri aynı). */
export function solved(session: BoardSession | null, buildKey: string): boolean {
  return session !== null && session.result !== null && session.result.problems.length === 0 && session.checkedBuild === buildKey;
}

export interface SessionStats {
  readonly checks: number;
  readonly hints: number;
  /** Açılan en yüksek kademe (2–4); ipucu açılmadıysa null. */
  readonly deepest: number | null;
  /** Bütün denemelerde görülen sorunlar, ilk görüldükleri sırayla (aynı sorun bir kez). */
  readonly problems: readonly ProblemRecord[];
  /** Süre (ms): son Denetle sorunsuzsa o ana kadar, değilse şimdiye kadar. */
  readonly duration: number;
}

export function sessionStats(session: BoardSession, now: number): SessionStats {
  const seen = new Map<string, ProblemRecord>();
  for (const check of session.checks) for (const p of check.problems) if (!seen.has(p.id)) seen.set(p.id, p);
  const last = session.checks[session.checks.length - 1];
  const duration = last && last.problems.length === 0 ? last.at : now - session.started;
  const deepest = session.hints.length > 0 ? Math.max(...session.hints.map((h) => h.level)) : null;
  return { checks: session.checks.length, hints: session.hints.length, deepest, problems: [...seen.values()], duration };
}
