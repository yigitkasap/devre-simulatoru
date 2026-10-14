// Sağdaki İnceleme paneli (masaüstü, 320–336 px; tasarım: M01–M07, N01). Sekmeler: İncele (seçili
// parçanın canlı ölçümleri ve özellikleri), Örnek (açık örneğin sorusu ve cevabı), Mesajlar (hata ve
// uyarılar). Telefonda 6. aşamaya kadar eski özellik penceresi, örnek kartı ve mesaj paneli kullanılır.

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { tr } from '../i18n/tr';
import { ExampleTab, type ExampleTabProps } from './ExampleTab';
import { Icon, type IconName } from './icons';
import { InspectTab, type InspectTabProps } from './InspectTab';
import { MessagesTab, type MessagesTabProps } from './MessagesTab';

export type InspectorTab = 'inspect' | 'example' | 'messages';

const TABS: readonly InspectorTab[] = ['inspect', 'example', 'messages'];

export interface InspectorProps {
  readonly width: number;
  /** Ölç düzeninde 48 px'lik şeride iner (N01). */
  readonly collapsed: boolean;
  /** Şeritten bir sekmeyi açar (panel genişler). */
  readonly onExpand: (tab: InspectorTab) => void;
  readonly tab: InspectorTab;
  readonly onTab: (tab: InspectorTab) => void;
  readonly inspect: InspectTabProps;
  readonly example: ExampleTabProps;
  readonly messages: MessagesTabProps;
}

const TAB_ICONS: Record<InspectorTab, IconName> = { inspect: 'search', example: 'book', messages: 'chat' };

export function Inspector({ width, collapsed, onExpand, tab, onTab, inspect, example, messages }: InspectorProps) {
  const errors = messages.items.filter((i) => i.severity === 'error').length;
  const count = messages.items.length;

  if (collapsed) {
    return (
      <nav aria-label={tr.inspector.collapsedLabel} className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-line bg-panel pt-2">
        <button
          type="button"
          onClick={() => onExpand(tab)}
          aria-label={tr.inspector.open}
          title={tr.inspector.open}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-app"
        >
          <Icon name="collapseLeft" />
        </button>
        {TABS.map((t) => {
          const label =
            t === 'messages' && count > 0
              ? `${tr.inspector.tabs.messages}: ${tr.messages.counts(errors, count - errors)}`
              : tr.inspector.tabs[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onExpand(t)}
              aria-label={label}
              title={label}
              className="relative flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-app"
            >
              <Icon name={TAB_ICONS[t]} />
              {t === 'messages' && count > 0 && (
                <span
                  className={`absolute top-1.5 right-1.5 h-[9px] w-[9px] rounded-full border-[1.5px] border-panel ${errors > 0 ? 'bg-danger' : 'bg-paused'}`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  // Sekmeler arasında ok tuşlarıyla (N02).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
    onTab(next);
    e.currentTarget.querySelector<HTMLElement>(`#inspector-tab-${next}`)?.focus();
  };

  return (
    <aside
      aria-label={tr.inspector.label}
      className="flex min-h-0 shrink-0 flex-col border-l border-line bg-panel"
      style={{ width }}
    >
      <div role="tablist" aria-label={tr.inspector.label} onKeyDown={onKeyDown} className="flex shrink-0 border-b border-line px-2">
        {TABS.map((t) => {
          const selected = t === tab;
          return (
            <button
              key={t}
              id={`inspector-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`inspector-panel-${t}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onTab(t)}
              className={`-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 text-sm font-medium ${
                selected ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tr.inspector.tabs[t]}
              {t === 'messages' && count > 0 && (
                <span
                  className={`rounded-full px-1.5 py-px font-mono text-[11px] font-semibold text-white ${errors > 0 ? 'bg-danger' : 'bg-warn'}`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div
        id={`inspector-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`inspector-tab-${tab}`}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === 'inspect' && <InspectTab {...inspect} />}
        {tab === 'example' && <ExampleTab {...example} />}
        {tab === 'messages' && <MessagesTab {...messages} />}
      </div>
    </aside>
  );
}
