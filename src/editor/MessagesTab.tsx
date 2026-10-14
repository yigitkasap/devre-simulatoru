// İnceleme paneli → Mesajlar sekmesi (tasarım: M07a, M07b): topoloji kontrollerinin ve simülasyonun
// hata/uyarıları. Hata ve uyarı renkle birlikte biçim ve simgeyle de ayrılır (dolu daire / üçgen).
// Bir mesaja tıklayınca ilgili parçalar ve kablolar tuvalde vurgulanır.

import { tr, type DiagnosticContext } from '../i18n/tr';
import type { Diagnostic } from '../sim/diagnostics';
import type { MessageItem } from './MessagesPanel';
import { Rich } from './Rich';

export interface MessagesTabProps {
  readonly items: readonly MessageItem[];
  readonly selectedKey: string | null;
  readonly onSelect: (item: MessageItem | null) => void;
  readonly context: DiagnosticContext;
}

export function SeverityMark({ severity, size = 20 }: { severity: Diagnostic['severity']; size?: number }) {
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

export function MessagesTab({ items, selectedKey, onSelect, context }: MessagesTabProps) {
  const errors = items.filter((i) => i.diagnostic.severity === 'error').length;
  const warnings = items.length - errors;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 px-5 pt-5">
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
      <p className="px-1 text-small font-semibold">{tr.messages.counts(errors, warnings)}</p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const { severity, elementIds } = item.diagnostic;
          const { title, detail } = tr.diagnostics.describe(item.diagnostic, context);
          const selected = item.key === selectedKey;
          const target = elementIds.length > 0 ? elementIds.map((id) => context.label(id)).join(', ') : tr.messages.circuitTarget;
          const error = severity === 'error';
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onSelect(selected ? null : item)}
                aria-pressed={selected}
                className={`flex w-full gap-2.5 rounded-[10px] p-3 text-left ${
                  selected
                    ? error
                      ? 'border-[1.5px] border-danger bg-danger-soft'
                      : 'border-[1.5px] border-warn bg-warn-soft'
                    : 'border border-line bg-panel hover:bg-panel-2'
                }`}
              >
                <SeverityMark severity={severity} />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={`text-label font-semibold ${error ? 'text-danger-ink' : 'text-warn'}`}>
                    {error ? tr.messages.severity.error : tr.messages.severity.warning} · {target}
                  </span>
                  <b className="font-semibold">{title}</b>
                  <span className="text-small leading-normal text-ink-2">
                    <Rich text={detail} />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="p-1 text-label text-muted">{tr.messages.hint}</p>
    </div>
  );
}
