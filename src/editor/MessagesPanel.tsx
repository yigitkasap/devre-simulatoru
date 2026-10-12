// Mesaj paneli: topoloji kontrollerinin ve simülasyonun hata/uyarıları (simülasyon günlüğü).
// Bir mesaja tıklayınca ilgili parçalar ve kablolar tuvalde vurgulanır.

import { tr, type DiagnosticContext } from '../i18n/tr';
import type { Diagnostic } from '../sim/diagnostics';
import { Rich } from './Rich';

export interface MessageItem {
  readonly key: string;
  readonly diagnostic: Diagnostic;
}

export function messageKey(d: Diagnostic): string {
  return `${d.code}|${d.elementIds.join(',')}|${d.pin ?? ''}`;
}

export interface MessagesPanelProps {
  readonly items: readonly MessageItem[];
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly selectedKey: string | null;
  readonly onSelect: (item: MessageItem | null) => void;
  readonly context: DiagnosticContext;
}

function SeverityIcon({ severity }: { severity: Diagnostic['severity'] }) {
  return severity === 'error' ? (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="mt-0.5 h-4 w-4 shrink-0 text-[#e8a317]" aria-hidden="true">
      <path d="M8 1.5l7 12.5H1z" fill="currentColor" strokeLinejoin="round" />
      <path d="M8 6v4" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="12" r="0.9" fill="white" />
    </svg>
  );
}

export function MessagesPanel({ items, open, onToggle, selectedKey, onSelect, context }: MessagesPanelProps) {
  const errors = items.filter((i) => i.diagnostic.severity === 'error').length;
  const warnings = items.length - errors;

  return (
    <section className="shrink-0 border-t border-line bg-panel" aria-label={tr.messages.title}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? tr.messages.hide : tr.messages.show}
        className="flex h-8 w-full items-center gap-3 px-3 text-left text-xs hover:bg-app"
      >
        <svg viewBox="0 0 12 12" className={`h-3 w-3 text-muted transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M4 2.5L7.5 6 4 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="font-semibold">{tr.messages.title}</span>
        {errors > 0 && <span className="rounded-full bg-danger px-2 py-0.5 font-medium text-white">{tr.messages.errors(errors)}</span>}
        {warnings > 0 && (
          <span className="rounded-full bg-warn-soft px-2 py-0.5 font-medium text-warn">{tr.messages.warnings(warnings)}</span>
        )}
        {items.length === 0 && <span className="text-muted">{tr.messages.none}</span>}
        {open && items.length > 0 && <span className="ml-auto hidden text-muted md:inline">{tr.messages.hint}</span>}
      </button>

      {open && items.length > 0 && (
        <ul className="max-h-40 overflow-y-auto border-t border-line">
          {items.map((item) => {
            const { title, detail } = tr.diagnostics.describe(item.diagnostic, context);
            const selected = item.key === selectedKey;
            return (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => onSelect(selected ? null : item)}
                  aria-pressed={selected}
                  className={`flex w-full gap-2 px-3 py-1.5 text-left text-xs leading-snug ${
                    selected ? 'bg-accent-soft' : 'hover:bg-app'
                  }`}
                >
                  <SeverityIcon severity={item.diagnostic.severity} />
                  <span>
                    <span className="font-semibold">{title}.</span> <span className="text-ink/85">
                      <Rich text={detail} />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
