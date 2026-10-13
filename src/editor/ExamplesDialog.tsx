// Örnek devreler penceresi: üst çubuktaki "Örnekler" düğmesiyle açılır. Örnekler konularına göre
// gruplanır; birine tıklayınca devre yüklenir ve pencere kapanır.

import { useEffect, useId, useRef } from 'react';
import { EXAMPLE_GROUPS, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';

export interface ExamplesDialogProps {
  readonly activeExample: ExampleId | null;
  readonly onLoad: (id: ExampleId) => void;
  readonly onClose: () => void;
}

export function ExamplesDialog({ activeExample, onLoad, onClose }: ExamplesDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  let number = 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-ink/30 p-3 sm:items-center sm:p-6"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        className="flex max-h-[calc(100dvh-1.5rem)] w-[min(56rem,100%)] flex-col rounded-xl border border-line bg-panel shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 id={titleId} className="font-semibold">
              {tr.examples.dialogTitle}
            </h2>
            <p className="text-xs text-muted">{tr.examples.dialogHint}</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-muted hover:bg-app"
            aria-label={tr.examples.dialogClose}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {EXAMPLE_GROUPS.map((group) => (
            <section key={group.id} className="mb-4 last:mb-1">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{tr.examples.groups[group.id]}</h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {group.ids.map((id) => {
                  number += 1;
                  const texts = tr.examples.texts[id];
                  const active = activeExample === id;
                  return (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => onLoad(id)}
                        aria-pressed={active}
                        aria-label={texts.title}
                        className={`flex h-full w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left ${
                          active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-app'
                        }`}
                      >
                        <span
                          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app text-[11px] font-semibold text-muted"
                          aria-hidden="true"
                        >
                          {number}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{texts.title}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted">
                            <Rich text={texts.description} />
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
