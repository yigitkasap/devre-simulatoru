// Tahtada kur raporu (.json): devre dosyasının yanına "rapor" bölümü (arıza raporuyla aynı biçim).
// Teslim dosyasında da kullanılır (T6): son kurulum devrede, her Denetle sonucu, açılan ipuçları, süre.

import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import { problemShort } from './explain';
import { sessionStats, type BoardSession } from './session';

const seconds = (ms: number) => Math.round(ms / 100) / 10;

export function boardReport(doc: CircuitDoc, session: BoardSession, title: string, now: number): Record<string, unknown> {
  const d = tr.tahta.denetle;
  const stats = sessionStats(session, now);
  const last = session.checks[session.checks.length - 1];
  const described = new Map(session.checks.flatMap((c) => c.problems).map((p) => [p.id, problemShort(doc, p)]));
  return {
    tur: 'tahtada-kur',
    devre: title,
    tarih: new Date(now).toISOString(),
    sonuc: last === undefined ? null : last.problems.length === 0 ? d.solved : d.unsolved(last.problems.length),
    sure_sn: seconds(stats.duration),
    denetle: session.checks.map((c, i) => ({ sira: i + 1, sn: seconds(c.at), sorunlar: c.problems.map((p) => problemShort(doc, p)) })),
    ipuclari: session.hints.map((h) => ({ sn: seconds(h.at), sorun: described.get(h.problem) ?? h.problem, kademe: d.levels[h.level - 1] ?? String(h.level) })),
  };
}
