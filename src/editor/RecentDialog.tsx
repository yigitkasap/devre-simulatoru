// Son devreler listesi (recentCircuits.ts): masaüstünde pencere (Daha fazla → Son devreler…, Örnekler
// penceresinin yan listesindeki "Son devreler"), telefonda Daha fazla sayfasının alt görünümü ve Örnekler'in
// ana ekranındaki satır. Bir kayda basınca devre geri yüklenir; kurulu devre de (boş ya da değişmemiş örnek
// değilse) listeye girer, bildirimde Geri al durur.

import { useEffect, useId, useRef } from 'react';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import type { RecentEntry } from './recentCircuits';

/** "9 Kasım 23:14" (bu yıl), yoksa "9 Kasım 2025 23:14". */
export function recentTime(savedAt: number, now = Date.now()): string {
  const d = new Date(savedAt);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  const day = d.toLocaleDateString('tr-TR', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  const time = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
}

export function RecentList({ entries, onOpen, touch }: { entries: readonly RecentEntry[]; onOpen: (entry: RecentEntry) => void; touch: boolean }) {
  const t = tr.recent;
  if (entries.length === 0) return <p className="m-0 py-2 text-sm leading-normal text-muted">{t.empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {entries.map((e) => (
        <li key={`${e.savedAt}-${e.data.length}`}>
          <button
            type="button"
            onClick={() => onOpen(e)}
            aria-label={t.openLabel(e.title, recentTime(e.savedAt))}
            className={`flex w-full items-center gap-3 rounded-lg border border-line bg-panel px-3 text-left hover:bg-panel-2 active:bg-panel-2 ${touch ? 'min-h-14 py-2' : 'min-h-12 py-1.5'}`}
          >
            <Icon name="file" className="h-5 w-5 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 leading-tight">
              <span className={`block truncate font-semibold ${touch ? 'text-[15px]' : 'text-sm'}`}>{e.title}</span>
              <span className="block truncate text-[13px] text-muted">
                {recentTime(e.savedAt)} · {t.parts(e.parts)}
              </span>
            </span>
            <span className={`shrink-0 font-semibold text-accent-ink ${touch ? 'text-[15px]' : 'text-small'}`}>{t.open}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Masaüstü (ve tablet) penceresi. */
export function RecentDialog({ entries, onOpen, onClose, touch }: { entries: readonly RecentEntry[]; onOpen: (entry: RecentEntry) => void; onClose: () => void; touch: boolean }) {
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('ul button, button')?.focus();
  }, []);
  return (
    <div className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(520px,100%)] flex-col gap-3 overflow-hidden rounded-2xl border border-line bg-panel px-5 py-4 shadow-2xl"
      >
        <div className="flex items-center gap-3">
          <h2 id={titleId} className="m-0 min-w-0 flex-1 text-[19px] font-semibold">
            {tr.recent.title}
          </h2>
          <button type="button" onClick={onClose} aria-label={tr.recent.close} className={`flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <p className="m-0 text-small leading-normal text-ink-2">{tr.recent.note}</p>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <RecentList entries={entries} onOpen={onOpen} touch={touch} />
        </div>
      </div>
    </div>
  );
}
