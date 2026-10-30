// Paylaş penceresi (N7): iki sekme, "Bağlantı | Sayfaya göm". Bağlantı sekmesi devreyi adresin #
// kısmına yazar; Sayfaya göm, /embed/ adresli iframe kodu verir (ayarlar, yükseklik, Moodle adımları,
// gizlilik notu). Gömme ayarları bu tarayıcıda hatırlanır.

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { DOCS_URL } from '../config';
import { exampleDoc, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { DEFAULT_EMBED, DEFAULT_EMBED_HEIGHT, EMBED_HEIGHT_LIMITS, embedSrc, iframeCode, type EmbedOptions } from '../model/embed';
import { serializeDoc } from '../model/serialize';
import { shareUrl } from '../model/share';
import type { CircuitDoc } from '../model/types';
import { Icon } from './icons';
import { useTouchUi } from './touchUi';

export type ShareTab = 'link' | 'embed';

const EMBED_KEY = 'devre-simulatoru:gomme';

function loadEmbedSettings(): { options: EmbedOptions; height: number } {
  try {
    const saved = JSON.parse(window.localStorage.getItem(EMBED_KEY) ?? 'null') as { options?: Partial<EmbedOptions>; height?: number } | null;
    const height = Number(saved?.height);
    return {
      options: { ...DEFAULT_EMBED, ...(saved?.options ?? {}) },
      height: Number.isFinite(height) && height >= EMBED_HEIGHT_LIMITS.min && height <= EMBED_HEIGHT_LIMITS.max ? height : DEFAULT_EMBED_HEIGHT,
    };
  } catch {
    return { options: DEFAULT_EMBED, height: DEFAULT_EMBED_HEIGHT };
  }
}

/** "**kalın**" işaretli metin. */
function boldMarked(text: string): ReactNode {
  return text.split('**').map((part, i) => (i % 2 === 1 ? <b key={i} className="font-semibold">{part}</b> : <Fragment key={i}>{part}</Fragment>));
}

/** Panoya yazar; olmazsa alanı seçip false döner (elle kopyalansın). */
async function copyText(text: string, field: HTMLInputElement | HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    field?.focus();
    field?.setSelectionRange(0, text.length);
    return false;
  }
}

export function ShareDialog({
  doc,
  example,
  title,
  initialTab = 'link',
  onClose,
}: {
  doc: CircuitDoc;
  /** Açık örnek; devre değişmemişse gömme adresi örneğin adıyla kurulur. */
  example: ExampleId | null;
  title: string;
  initialTab?: ShareTab;
  onClose: () => void;
}) {
  const t = tr.shareDialog;
  const titleId = useId();
  const touch = useTouchUi();
  const [tab, setTab] = useState<ShareTab>(initialTab);
  const link = useMemo(() => shareUrl(doc, window.location.href), [doc]);
  const tabs: readonly ShareTab[] = ['link', 'embed'];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4 max-sm:items-stretch max-sm:p-0"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(880px,100%)] w-[min(38rem,100%)] flex-col rounded-2xl border border-line bg-panel shadow-2xl max-sm:max-h-full max-sm:rounded-none max-sm:border-0"
        style={touch ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        <div className="flex flex-wrap items-center gap-3 px-6 pt-5 pb-3 max-sm:px-4">
          <h2 id={titleId} className="m-0 flex-1 text-[20px] font-semibold">
            {t.title}
          </h2>
          <div role="tablist" aria-label={t.tabsLabel} className="flex rounded-full bg-app p-1 max-sm:order-3 max-sm:w-full">
            {tabs.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${titleId}-${id}`}
                aria-selected={tab === id}
                aria-controls={`${titleId}-panel`}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => setTab(id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                  const next = tab === 'link' ? 'embed' : 'link';
                  setTab(next);
                  document.getElementById(`${titleId}-${next}`)?.focus();
                }}
                className={`flex items-center justify-center gap-1.5 rounded-full px-3.5 text-small font-medium max-sm:flex-1 ${touch ? 'h-11' : 'h-9'} ${
                  tab === id ? 'bg-ink text-panel' : 'text-ink-2 hover:text-ink'
                }`}
              >
                <Icon name={id === 'link' ? 'share' : 'code'} className="h-4 w-4" />
                {t.tabs[id]}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} aria-label={t.close} className={`flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div
          role="tabpanel"
          id={`${titleId}-panel`}
          aria-labelledby={`${titleId}-${tab}`}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 max-sm:px-4"
          style={touch ? { paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' } : undefined}
        >
          {tab === 'link' ? <LinkPane link={link} /> : <EmbedPane doc={doc} example={example} title={title} />}
        </div>
      </div>
    </div>
  );
}

function LinkPane({ link }: { link: string }) {
  const t = tr.shareDialog;
  const touch = useTouchUi();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    // Açılışta bağlantı seçili (iOS Safari salt okunur alanda select() ile seçmiyor; aralık da verilir).
    if (touch) return;
    inputRef.current?.focus();
    inputRef.current?.setSelectionRange(0, link.length);
  }, [link, touch]);
  return (
    <div className="flex flex-col gap-3 pt-1 text-small">
      <p className="m-0 text-ink-2">{t.description}</p>
      <div className="flex gap-2">
        <input
          ref={inputRef}
          readOnly
          aria-label={t.linkLabel}
          value={link}
          onFocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
          className={`min-w-0 flex-1 rounded-lg border border-line bg-app px-3 font-mono ${touch ? 'h-11 text-[16px]' : 'h-10 text-xs'}`}
        />
        <button
          type="button"
          onClick={async () => setState((await copyText(link, inputRef.current)) ? 'copied' : 'failed')}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 font-semibold text-white hover:brightness-110 ${touch ? 'h-11' : 'h-10'}`}
        >
          <Icon name="copy" className="h-4 w-4" />
          {state === 'copied' ? t.copied : t.copy}
        </button>
      </div>
      <p className="m-0 text-label text-muted">{state === 'failed' ? t.copyFailed : t.length(link.length)}</p>
    </div>
  );
}

function Switch({ label, note, checked, disabled = false, onChange }: { label: string; note?: string; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  const touch = useTouchUi();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center justify-between gap-3 text-left text-small disabled:opacity-50 ${touch ? 'min-h-11' : 'min-h-9'}`}
    >
      <span className="flex min-w-0 flex-col">
        <span>{label}</span>
        {note && <span className="text-label text-muted">{note}</span>}
      </span>
      <span aria-hidden="true" className={`relative h-6 w-10 shrink-0 rounded-full ${checked ? 'bg-accent' : 'bg-line-2'}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-panel shadow ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function EmbedPane({ doc, example, title }: { doc: CircuitDoc; example: ExampleId | null; title: string }) {
  const t = tr.embed;
  const touch = useTouchUi();
  const [settings, setSettings] = useState(loadEmbedSettings);
  const { options, height } = settings;
  const [heightText, setHeightText] = useState(String(height));
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const update = (next: { options?: Partial<EmbedOptions>; height?: number }) => {
    setCopy('idle');
    setSettings((s) => {
      const merged = { options: { ...s.options, ...next.options }, height: next.height ?? s.height };
      try {
        window.localStorage.setItem(EMBED_KEY, JSON.stringify(merged));
      } catch {
        // Depolama kapalı: ayarlar yalnızca bu pencerede.
      }
      return merged;
    });
  };
  // Örnek değişmemişse kısa adres (?ornek=…), değilse devre adresin # kısmında.
  const pristine = useMemo(() => {
    const original = example ? exampleDoc(example) : null;
    return original !== null && serializeDoc(original) === serializeDoc(doc);
  }, [doc, example]);
  const code = useMemo(() => {
    const page = new URL(import.meta.env.BASE_URL, window.location.origin).href;
    const src = embedSrc(page, options, pristine && example ? { example } : { doc });
    return iframeCode(src, height, t.frameTitle(title));
  }, [doc, example, height, options, pristine, t, title]);
  const full = options.view === 'tam';
  const commitHeight = () => {
    const v = Math.round(Number(heightText.replace(',', '.')));
    const clamped = Number.isFinite(v) && heightText.trim() !== '' ? Math.min(EMBED_HEIGHT_LIMITS.max, Math.max(EMBED_HEIGHT_LIMITS.min, v)) : height;
    setHeightText(String(clamped));
    update({ height: clamped });
  };

  return (
    <div className="flex flex-col gap-4 pt-1 text-small">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{t.view}</span>
        <div role="radiogroup" aria-label={t.view} className="flex rounded-full bg-app p-1 max-sm:w-full">
          {(['sade', 'tam'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={options.view === v}
              onClick={() => update({ options: { view: v } })}
              className={`rounded-full px-3.5 text-label font-medium max-sm:flex-1 ${touch ? 'h-11' : 'h-8'} ${options.view === v ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
            >
              {t.views[v]}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 max-sm:grid-cols-1">
        <Switch label={t.readOnly} note={t.readOnlyNote} checked={options.readOnly} onChange={(on) => update({ options: { readOnly: on } })} />
        <Switch label={t.controls} checked={full || options.controls} disabled={full} onChange={(on) => update({ options: { controls: on } })} />
        <Switch label={t.notebook} checked={full || options.notebook} disabled={full} onChange={(on) => update({ options: { notebook: on } })} />
        <Switch label={t.fullLink} checked={!full && options.fullLink} disabled={full} onChange={(on) => update({ options: { fullLink: on } })} />
      </div>
      {full && <p className="m-0 -mt-2 text-label text-muted">{t.fullApp}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{t.code}</span>
          <label className="flex items-center gap-2 text-label text-muted">
            {t.height}
            <input
              aria-label={t.heightLabel}
              inputMode="numeric"
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
              onBlur={commitHeight}
              onKeyDown={(e) => e.key === 'Enter' && commitHeight()}
              className={`w-16 rounded-md border border-line-2 bg-panel px-2 text-right font-mono text-ink ${touch ? 'h-11 text-[16px]' : 'h-8 text-small'}`}
            />
            px
          </label>
        </div>
        <textarea
          ref={codeRef}
          readOnly
          aria-label={t.code}
          value={code}
          rows={5}
          onFocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
          className={`w-full resize-none rounded-lg border border-line bg-app px-3.5 py-3 font-mono leading-relaxed break-all text-ink ${touch ? 'text-[16px]' : 'text-[12.5px]'}`}
        />
        {!pristine && <p className="m-0 text-label text-muted">{t.custom}</p>}
        <button
          type="button"
          onClick={async () => setCopy((await copyText(code, codeRef.current)) ? 'copied' : 'failed')}
          className={`flex items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-white hover:brightness-110 ${touch ? 'h-12' : 'h-11'}`}
        >
          <Icon name={copy === 'copied' ? 'check' : 'copy'} className="h-4 w-4" />
          {copy === 'copied' ? t.copiedShort : t.copy}
        </button>
        {copy === 'failed' && <p className="m-0 text-label text-warn">{t.copyFailed}</p>}
        <span className="sr-only" role="status">
          {copy === 'copied' ? t.copied : ''}
        </span>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">{t.moodle}</span>
          <a
            href={`${DOCS_URL}/moodle-gomme.md`}
            target="_blank"
            rel="noopener"
            aria-label={t.recipeLabel}
            className={`flex items-center gap-1 text-label font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : ''}`}
          >
            {t.recipe}
            <Icon name="external" className="h-3.5 w-3.5" />
          </a>
        </div>
        <ol className="m-0 flex list-none flex-col gap-2 p-0">
          {t.steps.map((step, i) => (
            <li key={i} className="flex gap-3 leading-snug">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-app font-mono text-label font-semibold">
                {i + 1}
              </span>
              <span className="pt-0.5">{boldMarked(step)}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="m-0 flex gap-2 rounded-lg bg-app px-3.5 py-3 text-label leading-snug text-ink-2">
        <Icon name="shield" className="mt-px h-4 w-4 shrink-0" />
        {t.privacy}
      </p>
    </div>
  );
}
