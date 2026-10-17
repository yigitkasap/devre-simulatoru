// Sağdaki İnceleme paneli (masaüstü 320–336 px, tablet 320–340 px; tasarım: M01–M07, N01, T01, T02).
// Sekmeler: İncele (seçili parçanın canlı ölçümleri ve özellikleri), Örnek (açık örneğin ne işe yaradığı ve
// günlük hayattaki yeri), tablette Cihazlar (ön paneller; masaüstünde raf tuvalin altında) ve Mesajlar (hata ve
// uyarılar). Tablette dokunmatik boyutlar.

import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { ExampleTab, type ExampleTabProps } from './ExampleTab';
import { Icon, type IconName } from './icons';
import { InspectTab, type InspectTabProps } from './InspectTab';
import { MessagesTab, type MessagesTabProps } from './MessagesTab';
import { TouchUi } from './touchUi';

export type InspectorTab = 'inspect' | 'example' | 'devices' | 'messages';

const DESK_TABS: readonly InspectorTab[] = ['inspect', 'example', 'messages'];

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
  /** Tablet: dokunmatik boyutlar. */
  readonly touch?: boolean;
  /** Tablet: Cihazlar sekmesinin içeriği (devrede cihaz varken). */
  readonly devices?: ReactNode;
  /** Tablet: İncele sekmesinde seçili parçanın dokunmatik sayfası (yoksa İncele sekmesi). */
  readonly inspectBody?: ReactNode;
  /** Panelde basılan tuşlar (Esc: tuvale dön). */
  readonly onKeyDown?: (e: ReactKeyboardEvent) => void;
}

const TAB_ICONS: Record<InspectorTab, IconName> = { inspect: 'search', example: 'book', devices: 'devices', messages: 'chat' };

export function Inspector({ width, collapsed, onExpand, tab: requested, onTab, inspect, example, messages, touch = false, devices, inspectBody, onKeyDown: onPanelKey }: InspectorProps) {
  const TABS: readonly InspectorTab[] = devices ? ['inspect', 'example', 'devices', 'messages'] : DESK_TABS;
  const tab = TABS.includes(requested) ? requested : 'inspect';
  const errors = messages.items.filter((i) => i.severity === 'error').length;
  const warnings = messages.items.filter((i) => i.severity === 'warning').length;
  const infos = messages.items.length - errors - warnings;
  // Rozet yalnızca hata ve uyarıları sayar; bilgi bir sorun değildir.
  const count = errors + warnings;

  if (collapsed) {
    return (
      <nav data-tour="inspect" aria-label={tr.inspector.collapsedLabel} className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-line bg-panel pt-2">
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
            t === 'messages' && count + infos > 0
              ? `${tr.inspector.tabs.messages}: ${tr.messages.counts(errors, warnings, infos)}`
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
      data-tour="inspect"
      onKeyDown={onPanelKey}
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
              className={`-mb-px flex items-center gap-1.5 border-b-2 font-medium ${touch ? 'h-12 px-2.5 text-[15px]' : 'h-11 px-3 text-sm'} ${
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
        <TouchUi.Provider value={touch}>
          {tab === 'inspect' && (inspectBody ?? <InspectTab {...inspect} />)}
          {tab === 'example' && <ExampleTab {...example} />}
          {tab === 'devices' && devices}
          {tab === 'messages' && <MessagesTab {...messages} />}
        </TouchUi.Provider>
      </div>
    </aside>
  );
}
