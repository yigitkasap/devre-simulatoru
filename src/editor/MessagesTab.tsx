// İnceleme paneli → Mesajlar sekmesi (tasarım: M07a, M07b): topoloji kontrollerinin ve simülasyonun
// hata/uyarıları. Hata ve uyarı renkle birlikte biçim ve simgeyle de ayrılır (dolu daire / üçgen).
// Bir mesaja tıklayınca ilgili parçalar ve kablolar tuvalde vurgulanır.

import type { ReactNode } from 'react';
import { tr, type DiagnosticContext } from '../i18n/tr';
import type { MessageItem, MessageSeverity } from './messages';
import { Rich } from './Rich';
import { useTouchUi } from './touchUi';

/** Seçili mesajın altındaki düzeltme düğmesi (Onar, "R1'i 360 Ω yap"). */
export interface MessageAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly run: () => void;
}

export interface MessagesTabProps {
  readonly items: readonly MessageItem[];
  readonly selectedKey: string | null;
  readonly onSelect: (item: MessageItem | null) => void;
  readonly context: DiagnosticContext;
  /** Bir mesajın düzeltme düğmeleri (seçiliyken gösterilir). */
  readonly actions: (item: MessageItem) => readonly MessageAction[];
  /** Listenin üstünde (telefon: "Simülasyon başlamadı" kutusu). */
  readonly header?: ReactNode;
}

export function SeverityMark({ severity, size = 20 }: { severity: MessageSeverity; size?: number }) {
  if (severity === 'info') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="var(--color-info-ink)" />
        <path d="M10 9v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="5.8" r="1.2" fill="white" />
      </svg>
    );
  }
  return severity === 'error' ? (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="var(--color-danger)" />
      <path d="M10 5.5v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1.2" fill="white" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      <path d="M10 1.5l9 16H1z" fill="var(--color-paused)" stroke="var(--color-warn)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 7v5" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.6" r="1" fill="var(--color-ink)" />
    </svg>
  );
}

export function MessagesTab({ items, selectedKey, onSelect, context, actions, header }: MessagesTabProps) {
  const touch = useTouchUi();
  const errors = items.filter((i) => i.severity === 'error').length;
  const warnings = items.filter((i) => i.severity === 'warning').length;
  const infos = items.length - errors - warnings;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 px-5 pt-5">
        {header}
        <span className="flex items-center gap-2 text-heading font-semibold">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--color-ok)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="10" cy="10" r="7.5" />
            <path d="M6.5 10l2.5 2.5 4.5-5" />
          </svg>
          {tr.messages.none}
        </span>
        <p className="text-small text-muted">{tr.messages.noneDetail}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-3">
      {header}
      <p className="px-1 text-small font-semibold">{tr.messages.counts(errors, warnings, infos)}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const { severity, elementIds, title, detail } = item;
          const selected = item.key === selectedKey;
          const target = elementIds.length > 0 ? context.label(elementIds[0]!) : tr.messages.circuitTarget;
          const error = severity === 'error';
          const info = severity === 'info';
          const buttons = selected ? actions(item) : [];
          return (
            <li
              key={item.key}
              className={`rounded-[10px] ${
                selected
                  ? error
                    ? 'border-[1.5px] border-danger bg-danger-soft'
                    : info
                      ? 'border-[1.5px] border-info-ink bg-info-soft'
                      : 'border-[1.5px] border-warn bg-warn-soft'
                  : 'border border-line bg-panel hover:bg-panel-2'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(selected ? null : item)}
                aria-pressed={selected}
                className="flex w-full gap-2.5 p-3 text-left"
              >
                <SeverityMark severity={severity} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={`text-label font-semibold ${error ? 'text-danger-ink' : info ? 'text-info-ink' : 'text-warn'}`}>
                    {tr.messages.severity[severity]} · {target}
                  </span>
                  <b className="font-semibold">{title}</b>
                  <span className="text-small leading-normal text-ink-2">
                    <Rich text={detail} />
                  </span>
                </span>
              </button>
              {buttons.length > 0 && (
                <div className="flex flex-wrap gap-2 pr-3 pb-3 pl-[42px]">
                  {buttons.map((action) => (
                    <button
                      key={action.label}
                      type="button"
                      onClick={action.run}
                      className={`rounded-[7px] px-3 ${touch ? 'h-11 text-sm' : 'h-9 text-small'} ${
                        action.primary ? 'bg-ink font-semibold text-white hover:brightness-125' : 'border border-line-2 bg-panel font-medium hover:bg-panel-2'
                      }`}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="p-1 text-label text-muted">{tr.messages.hint}</p>
    </div>
  );
}
