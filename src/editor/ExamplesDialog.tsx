// Örnek devreler penceresi: üst çubuktaki "Örnekler" düğmesiyle açılır. Örnekler konularına göre
// gruplanır; birine tıklayınca devre yüklenir ve pencere kapanır. Telefonda tam ekran, aramalı ve
// açılır kapanır gruplu liste (tasarım: P12).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EXAMPLE_GROUPS, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';

export interface ExamplesDialogProps {
  /** Telefon düzeni: tam ekran liste (P12). */
  readonly phone: boolean;
  readonly activeExample: ExampleId | null;
  readonly onLoad: (id: ExampleId) => void;
  readonly onClose: () => void;
}

export function ExamplesDialog(props: ExamplesDialogProps) {
  return props.phone ? <PhoneExamples {...props} /> : <DesktopExamples {...props} />;
}

function DesktopExamples({ activeExample, onLoad, onClose }: ExamplesDialogProps) {
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
              {group.id === 'baraj' && <BarajLink />}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Baraj projesinin ayrı sayfası (büyük sahne, ışık kulesi, kontroller). */
function BarajLink({ touch = false }: { touch?: boolean }) {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return (
    <a
      href={`${base}baraj/`}
      className={`mt-2 flex items-center gap-2.5 rounded-lg border border-accent bg-accent-soft/60 text-left text-accent-ink hover:bg-accent-soft ${
        touch ? 'min-h-[52px] px-3 py-2.5' : 'px-3 py-2'
      }`}
    >
      <Icon name="external" className="h-5 w-5 shrink-0" />
      <span className="min-w-0">
        <span className={`block font-semibold ${touch ? 'text-[15px]' : 'text-sm'}`}>{tr.baraj.examplesLink}</span>
        <span className={`block leading-snug text-ink-2 ${touch ? 'text-[13.5px]' : 'text-xs'}`}>{tr.baraj.examplesLinkNote}</span>
      </span>
    </a>
  );
}

/** Türkçe karakterleri sadeleştirerek arar. */
function normalize(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u');
}

function PhoneExamples({ activeExample, onLoad, onClose }: ExamplesDialogProps) {
  const titleId = useId();
  const [query, setQuery] = useState('');
  const activeGroup = EXAMPLE_GROUPS.find((g) => (g.ids as readonly ExampleId[]).includes(activeExample as ExampleId))?.id;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([activeGroup ?? EXAMPLE_GROUPS[0]!.id]));
  const total = EXAMPLE_GROUPS.reduce((n, g) => n + g.ids.length, 0);
  const numbers = useMemo(() => {
    const map = new Map<ExampleId, number>();
    let n = 0;
    for (const g of EXAMPLE_GROUPS) for (const id of g.ids) map.set(id as ExampleId, ++n);
    return map;
  }, []);
  const q = normalize(query.trim());
  const groups = EXAMPLE_GROUPS.map((g) => ({
    ...g,
    ids: (g.ids as readonly ExampleId[]).filter((id) => {
      if (!q) return true;
      const t = tr.examples.texts[id];
      return normalize(t.title).includes(q) || normalize(t.description).includes(q) || normalize(tr.examples.groups[g.id]).includes(q);
    }),
  })).filter((g) => g.ids.length > 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-panel"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex h-14 shrink-0 items-center gap-1 px-2">
        <button type="button" onClick={onClose} aria-label={tr.examples.dialogClose} className="flex h-11 w-11 items-center justify-center rounded-[10px] active:bg-app">
          <Icon name="close" />
        </button>
        <h2 id={titleId} className="text-[19px] font-semibold">
          {tr.examples.dialogTitle}
        </h2>
        <span className="ml-auto pr-2 font-mono text-[13px] text-muted">{total}</span>
      </div>
      <div className="shrink-0 px-4 pb-2">
        <label className="flex h-11 items-center gap-2 rounded-[10px] border border-line-2 px-3 text-muted focus-within:border-accent">
          <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={tr.phone.examplesSearchLabel}
            placeholder={tr.phone.examplesSearch}
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
        </label>
        <span className="mt-2 block text-[13px] text-muted">{tr.phone.examplesHint}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        {groups.length === 0 && <p className="py-3 text-sm text-muted">{tr.phone.examplesNone}</p>}
        {groups.map((group) => {
          const expanded = q !== '' || open.has(group.id);
          return (
            <section key={group.id} className="border-b border-app">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() =>
                  setOpen((s) => {
                    const next = new Set(s);
                    if (next.has(group.id)) next.delete(group.id);
                    else next.add(group.id);
                    return next;
                  })
                }
                className="flex min-h-[52px] w-full items-center gap-2.5 text-left text-[15px] font-semibold"
              >
                <Icon name={expanded ? 'chevronDown' : 'chevron'} className="h-[18px] w-[18px] shrink-0 text-muted" />
                <span className="min-w-0 flex-1">{tr.examples.groups[group.id]}</span>
                <span className="font-mono text-[13px] font-medium text-muted">{group.ids.length}</span>
              </button>
              {expanded && group.id === 'baraj' && <BarajLink touch />}
              {expanded && (
                <ul className="flex flex-col gap-2 pb-3 pt-2">
                  {group.ids.map((id) => {
                    const texts = tr.examples.texts[id];
                    const active = activeExample === id;
                    return (
                      <li key={id}>
                        <button
                          type="button"
                          onClick={() => onLoad(id)}
                          aria-current={active || undefined}
                          aria-label={texts.title}
                          className={`flex w-full items-start gap-3 rounded-xl text-left ${active ? 'border-2 border-accent bg-accent-soft/50 p-[11px]' : 'border border-line p-3 active:bg-app'}`}
                        >
                          <span className={`w-5 shrink-0 pt-px text-right font-mono text-[13px] font-semibold ${active ? 'text-accent-ink' : 'text-muted'}`} aria-hidden="true">
                            {numbers.get(id)}
                          </span>
                          <span className="min-w-0">
                            <b className="block text-[15px] font-semibold">
                              {texts.title}
                              {active && (
                                <span className="ml-1.5 rounded-xs bg-accent px-1.5 py-px align-[2px] text-[11px] font-semibold text-white">{tr.phone.exampleOpen}</span>
                              )}
                            </b>
                            <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-muted">
                              <Rich text={texts.description} />
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
        })}
      </div>
    </div>
  );
}
