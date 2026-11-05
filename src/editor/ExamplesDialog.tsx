// Örnekler penceresi: üst çubuktaki "Örnekler" düğmesiyle açılır. Masaüstünde solda gruplar (yan
// liste; tıklayınca içerik o gruba kayar, kaydırınca görünen grup vurgulanır), sağda bütün gruplar
// tek kayan listede, kartlarda devrenin küçük şeması. Telefonda iki adım: ana ekranda gruplar
// (Akdeniz Üniversitesi bölümü ve genel gruplar), gruba dokununca o grubun kartları. Arama başlıkta,
// cümlede, açıklamada, grup adında ve devredeki parçaların adlarında arar.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { EXAMPLE_FOLDERS, type ExampleFolderId, type ExampleId } from '../examples';
import type { FaultScenarioId } from '../examples/faultScenarios';
import { tr } from '../i18n/tr';
import { ExamplePreview } from './ExamplePreview';
import {
  entryCount,
  entryExample,
  entryKey,
  entryTexts,
  exampleSections,
  searchSections,
  sectionOf,
  titleMatch,
  type ExampleEntry,
  type ExampleSection,
} from './examplesIndex';
import { Icon } from './icons';
import { Rich } from './Rich';
import type { Settings } from './settings';

export interface ExamplesDialogProps {
  /** Telefon düzeni: tam ekran, iki adımlı gezinme. */
  readonly phone: boolean;
  readonly activeExample: ExampleId | null;
  readonly onLoad: (id: ExampleId) => void;
  /** Örneği aç ve Tahtada kur'a geç (T6): tahta boş gelir, şema sağ panelde. */
  readonly onBoard?: (id: ExampleId) => void;
  /** Hazır arıza senaryosunu aç (Arıza bulma grubu, B2). */
  readonly onFault: (id: FaultScenarioId) => void;
  /** Açık senaryo. */
  readonly activeFault: string | null;
  readonly onClose: () => void;
  /** Kartların küçük şeması için (direnç çizimi, kablo renkleri). */
  readonly settings: Pick<Settings, 'resistorStyle' | 'wireScale'>;
}

const t = () => tr.examples.browser;

export function ExamplesDialog(props: ExamplesDialogProps) {
  return props.phone ? <PhoneExamples {...props} /> : <DesktopExamples {...props} />;
}

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Klasörün logosu (96 px'lik kopya); ince çerçeve koyu zeminde de ayırır. */
function FolderLogo({ folder, size }: { folder: ExampleFolderId; size: number }) {
  const logo = EXAMPLE_FOLDERS.find((f) => f.id === folder)!.logo;
  return <img src={`${BASE}${logo}`} alt={tr.examples.folders[folder].logoAlt} width={size} height={size} className="shrink-0 rounded-full ring-1 ring-line-2" style={{ width: size, height: size }} />;
}

/** Başlıkta aramanın eşleştiği yer warn-soft zeminle işaretli. */
function Highlight({ text, query }: { text: string; query: string }) {
  const m = titleMatch(text, query);
  if (!m) return <Rich text={text} />;
  return (
    <>
      <Rich text={text.slice(0, m[0])} />
      <mark className="rounded-xs bg-warn-soft px-0.5 text-ink">{text.slice(m[0], m[1])}</mark>
      <Rich text={text.slice(m[1])} />
    </>
  );
}

function isActive(entry: ExampleEntry, activeExample: ExampleId | null, activeFault: string | null): boolean {
  return entry.kind === 'example' ? entry.id === activeExample : entry.id === activeFault;
}

/** Kartın çipleri: föy örneğinde şekil, föyde olmayan ekte "Föyde yok · ek", arıza görevinde "Arıza", açık örnekte "Açık". */
function Chips({ entry, active, className = '' }: { entry: ExampleEntry; active: boolean; className?: string }) {
  const texts = entryTexts(entry);
  const chip = 'inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-semibold whitespace-nowrap';
  if (entry.kind === 'example' && !texts.chip && !texts.extra && !active) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {entry.kind === 'fault' && <span className={`${chip} border border-warn-line bg-warn-soft text-warn`}>{t().fault}</span>}
      {texts.chip && <span className={`${chip} border border-line-2 bg-panel font-mono text-ink-2`}>{texts.chip}</span>}
      {texts.extra && <span className={`${chip} border border-line-2 bg-panel text-ink-2`}>{tr.examples.extra}</span>}
      {active && <span className={`${chip} bg-accent text-white`}>{t().open}</span>}
    </span>
  );
}

/** Kartın altındaki küçük "Tahtada kur" (T6). */
function BoardLink({ id, onBoard, touch }: { id: ExampleId; onBoard: (id: ExampleId) => void; touch: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onBoard(id)}
      aria-label={tr.tahta.gorev.onExampleLabel(tr.examples.texts[id].title)}
      className={`flex items-center gap-1.5 rounded-md px-2 font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11 text-[15px]' : 'h-8 text-small'}`}
    >
      <Icon name="board" className="h-4 w-4" />
      {tr.tahta.gorev.onExample}
    </button>
  );
}

/** Bir kart: küçük şema, çipler, başlık ve tek satırlık cümle (hepsi tek "aç" düğmesi); altta Tahtada kur. */
function EntryCard({ entry, props, query, touch }: { entry: ExampleEntry; props: ExamplesDialogProps; query: string; touch: boolean }) {
  const active = isActive(entry, props.activeExample, props.activeFault);
  const texts = entryTexts(entry);
  const open = () => (entry.kind === 'example' ? props.onLoad(entry.id) : props.onFault(entry.id));
  const faultTexts = entry.kind === 'fault' ? tr.fault.scenarios[entry.id] : null;
  const board = props.onBoard && entry.kind === 'example' ? props.onBoard : null;
  return (
    <li
      data-active={active || undefined}
      className={`relative flex min-w-0 flex-col overflow-hidden rounded-lg border bg-panel ${
        active ? 'border-accent shadow-[0_0_0_1px_var(--color-accent),0_0_0_4px_var(--color-accent-soft)]' : 'border-line hover:border-line-2'
      }`}
    >
      <button
        type="button"
        onClick={open}
        aria-label={entry.kind === 'example' ? texts.title : tr.fault.loaded(texts.title)}
        aria-current={active || undefined}
        className="flex flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      >
        <ExamplePreview id={entryExample(entry)} height={touch ? 112 : 128} settings={props.settings} className="border-b border-line" />
        {/* Telefonda çipler kartın sağ üst köşesinde (şemanın üstünde). */}
        {touch && <Chips entry={entry} active={active} className="absolute top-2 right-2 justify-end" />}
        <span className={`flex flex-col gap-1.5 px-3.5 pt-2.5 ${board ? 'pb-1' : 'pb-3'}`}>
          {!touch && <Chips entry={entry} active={active} />}
          <span className="text-[15px] leading-snug font-semibold">
            <Highlight text={texts.title} query={query} />
          </span>
          {faultTexts && <span className="text-[12px] leading-snug font-medium text-ink-2">{faultTexts.experiment}</span>}
          <span className="line-clamp-2 text-[13px] leading-snug text-muted">
            <Rich text={texts.cue} />
          </span>
        </span>
      </button>
      {board && entry.kind === 'example' && (
        <div className={`mt-auto flex justify-end ${touch ? 'px-2 pb-2' : 'px-2 pb-1.5'}`}>
          <BoardLink id={entry.id} onBoard={board} touch={touch} />
        </div>
      )}
    </li>
  );
}

/** Baraj grubunun başlığının yanındaki küçük bağlantı (ayrı sayfa). */
function BarajLink({ touch }: { touch: boolean }) {
  return (
    <a
      href={`${BASE}baraj/`}
      title={tr.baraj.examplesLinkNote}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 text-small font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-7'}`}
    >
      <Icon name="external" className="h-4 w-4" />
      {t().barajLink}
    </a>
  );
}

/** Grubun başlığı: küçük üst yazı, föydeki tam ad, amaç cümlesi; sağda devre sayısı. */
function SectionHeader({ section, count, headingId }: { section: ExampleSection; count: number; headingId: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        {section.overline && <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted">{section.overline}</p>}
        <div className="flex flex-wrap items-center gap-x-2">
          <h3 id={headingId} className="m-0 text-[19px] leading-tight font-semibold">
            {section.title}
          </h3>
          {section.key === 'baraj' && <BarajLink touch={false} />}
        </div>
        {section.aim && <p className="m-0 mt-1 text-[13.5px] leading-snug text-ink-2">{section.aim}</p>}
      </div>
      <span className="shrink-0 pt-0.5 font-mono text-[13px] text-muted">{t().count(count)}</span>
    </div>
  );
}

// --- Masaüstü ----------------------------------------------------------------------------------------------

function DesktopExamples(props: ExamplesDialogProps) {
  const { activeExample, activeFault, onClose } = props;
  const titleId = useId();
  const sections = useMemo(() => exampleSections(), []);
  const total = entryCount(sections);
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchSections(sections, query), [sections, query]);
  const matches = entryCount(shown);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const activeSection = sectionOf(sections, activeExample, activeFault);
  const [current, setCurrent] = useState<string>(activeSection?.key ?? sections[0]!.key);
  /** Yan listeden seçilen grup: kullanıcı kaydırana kadar vurgulu kalır (son grupların başı yukarı gelemez). */
  const pinned = useRef<string | null>(null);

  // Açılışta odak aramada; liste açık örneğe kayar.
  useEffect(() => {
    searchRef.current?.focus();
    const card = listRef.current?.querySelector<HTMLElement>('[data-active]');
    if (card) {
      card.scrollIntoView({ block: 'center' });
      if (activeSection) pinned.current = activeSection.key;
    }
    // Yalnızca açılışta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Kaydırınca görünen grup: başı listenin üstünü geçmiş son grup (en altta son grup). */
  const spy = () => {
    const list = listRef.current;
    if (!list || pinned.current) return;
    const top = list.getBoundingClientRect().top;
    const all = [...list.querySelectorAll<HTMLElement>('[data-section]')];
    let key = all[0]?.dataset.section ?? current;
    for (const el of all) if (el.getBoundingClientRect().top - top <= 24) key = el.dataset.section!;
    if (list.scrollTop + list.clientHeight >= list.scrollHeight - 2 && all.length > 0) key = all[all.length - 1]!.dataset.section!;
    if (key !== current) setCurrent(key);
  };
  const unpin = () => {
    pinned.current = null;
  };

  const goTo = (key: string) => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-section="${CSS.escape(key)}"]`);
    if (!list || !el) return;
    pinned.current = key;
    setCurrent(key);
    list.scrollTo({ top: el.offsetTop - 16 });
  };

  // Yan listede ok tuşları: etkin satırlar arasında odak.
  const onNavKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
    const rows = [...(navRef.current?.querySelectorAll<HTMLButtonElement>('button[data-row]:not(:disabled)') ?? [])];
    if (rows.length === 0) return;
    e.preventDefault();
    const i = rows.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? rows.length - 1 : e.key === 'ArrowDown' ? Math.min(rows.length - 1, i + 1) : Math.max(0, i - 1);
    rows[next]?.focus();
  };

  const q = query.trim();
  const counts = new Map(shown.map((s) => [s.key, s.entries.length]));
  const navRow = (s: ExampleSection) => {
    const n = counts.get(s.key) ?? 0;
    const disabled = q !== '' && n === 0;
    const on = s.key === current && !disabled;
    return (
      <li key={s.key}>
        <button
          type="button"
          data-row
          disabled={disabled}
          aria-current={on ? 'true' : undefined}
          aria-label={t().groupLabel(s.short, n)}
          onClick={() => goTo(s.key)}
          className={`flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm ${
            on ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink hover:bg-app'
          } disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
        >
          <span className={`w-4 shrink-0 text-center font-mono text-[12px] font-semibold ${on ? 'text-accent-ink' : 'text-muted'}`}>{s.mark}</span>
          <span className="min-w-0 flex-1 truncate">{s.short}</span>
          <span className={`shrink-0 font-mono text-[12px] ${on ? 'text-accent-ink' : 'text-muted'}`}>{n}</span>
        </button>
      </li>
    );
  };
  const folderSections = sections.filter((s) => s.folder !== null);
  const generalSections = sections.filter((s) => s.folder === null);
  const folder = EXAMPLE_FOLDERS[0]!.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          } else if (e.key === '/' && !(e.target instanceof HTMLInputElement)) {
            e.preventDefault();
            searchRef.current?.focus();
          }
        }}
        className="flex h-[calc(100dvh-3rem)] w-[min(1160px,100%)] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <header className="flex h-[68px] shrink-0 items-center gap-4 border-b border-line px-5">
          <h2 id={titleId} className="m-0 w-[220px] shrink-0 text-[19px] font-semibold">
            {tr.examples.dialogTitle}
          </h2>
          <label className="mx-auto flex h-10 w-full max-w-[520px] min-w-0 items-center gap-2 rounded-[10px] border border-line-2 bg-panel px-3 text-muted focus-within:border-accent">
            <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                listRef.current?.scrollTo({ top: 0 });
                pinned.current = null;
              }}
              aria-label={t().searchLabel}
              aria-describedby={`${titleId}-hint`}
              placeholder={t().searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            />
            <kbd id={`${titleId}-hint`} title={t().searchHint} className="rounded border border-line-2 px-1.5 font-mono text-[11px] text-muted">
              <span className="sr-only">{t().searchHint}</span>
              <span aria-hidden="true">/</span>
            </kbd>
          </label>
          <div className="flex w-[220px] shrink-0 items-center justify-end gap-2">
            <span className="font-mono text-[13px] text-muted">{t().count(total)}</span>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-app" aria-label={tr.examples.dialogClose}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav ref={navRef} aria-label={t().nav} onKeyDown={onNavKey} className="flex w-[264px] shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain border-r border-line bg-panel-2 px-3 py-4">
            <div className="mb-2 flex items-center gap-2.5 px-1.5">
              <FolderLogo folder={folder} size={36} />
              <span className="min-w-0 leading-tight">
                <span className="block text-sm font-semibold">{t().folderName}</span>
                <span className="block text-[12px] text-muted">{t().folderLine}</span>
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{folderSections.map(navRow)}</ul>
            <hr className="my-3 border-line" />
            <p className="m-0 mb-1 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-muted uppercase">{t().general}</p>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{generalSections.map(navRow)}</ul>
          </nav>
          <div ref={listRef} onScroll={spy} onWheel={unpin} onTouchStart={unpin} onKeyDown={unpin} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-5 pb-8">
            {q && matches > 0 && <p className="m-0 mb-4 text-sm text-ink-2">{t().results(q, matches)}</p>}
            {q && matches === 0 && (
              <div className="flex flex-col items-start gap-2 py-10">
                <p className="m-0 text-base font-semibold">{t().empty}</p>
                <p className="m-0 text-sm text-muted">{t().emptyHint}</p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  className="mt-1 h-9 rounded-lg border border-line-2 px-3 text-small font-semibold text-accent-ink hover:bg-app"
                >
                  {t().clear}
                </button>
              </div>
            )}
            {shown.map((s) =>
              s.entries.length === 0 ? null : (
                <section key={s.key} data-section={s.key} aria-labelledby={`${titleId}-${s.key}`} className="mb-9 flex flex-col gap-4 last:mb-0">
                  <SectionHeader section={s} count={s.entries.length} headingId={`${titleId}-${s.key}`} />
                  <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
                    {s.entries.map((e) => (
                      <EntryCard key={entryKey(e)} entry={e} props={props} query={q} touch={false} />
                    ))}
                  </ul>
                </section>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Telefon -----------------------------------------------------------------------------------------------

function PhoneExamples(props: ExamplesDialogProps) {
  const { activeExample, activeFault, onClose } = props;
  const sections = useMemo(() => exampleSections(), []);
  const total = entryCount(sections);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const shown = useMemo(() => searchSections(sections, query), [sections, query]);
  const q = query.trim();
  const matches = entryCount(shown);
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = useRef<string | null>(null);
  const switched = useRef(false);
  const activeSection = sectionOf(sections, activeExample, activeFault);
  const opened = group ? (sections.find((s) => s.key === group) ?? null) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Ekran değişince liste başa (grup ekranında açık örneğe) döner; odak başlığa, geri dönünce grubun satırına.
  useEffect(() => {
    if (!switched.current) return;
    const list = listRef.current;
    const card = group ? list?.querySelector<HTMLElement>('[data-active]') : null;
    if (card) card.scrollIntoView({ block: 'center' });
    else list?.scrollTo({ top: 0 });
    if (group) headingRef.current?.focus();
    else if (returnTo.current) list?.querySelector<HTMLElement>(`[data-group="${CSS.escape(returnTo.current)}"]`)?.focus();
  }, [group]);
  const show = (key: string | null) => {
    switched.current = true;
    if (key) returnTo.current = key;
    setGroup(key);
  };

  const row = (s: ExampleSection, first: boolean) => (
    <button
      key={s.key}
      type="button"
      data-group={s.key}
      onClick={() => show(s.key)}
      aria-label={t().groupLabel(s.short, s.entries.length)}
      className={`flex min-h-12 w-full items-center gap-3 px-4 text-left active:bg-app ${first ? '' : 'border-t border-line'}`}
    >
      <span className="w-5 shrink-0 text-center font-mono text-[13px] font-semibold text-muted">{s.mark}</span>
      <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{s.short}</span>
      <span className="shrink-0 font-mono text-[13px] text-muted">{s.entries.length}</span>
      <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-muted" />
    </button>
  );
  const folder = EXAMPLE_FOLDERS[0]!.id;
  const folderSections = sections.filter((s) => s.folder !== null);
  const generalSections = sections.filter((s) => s.folder === null);
  const folderTotal = entryCount(folderSections);

  let body: ReactNode;
  if (opened) {
    body = (
      <>
        {opened.aim && <p className="m-0 pb-3 text-[14px] leading-snug text-ink-2">{opened.aim}</p>}
        {opened.key === 'baraj' && (
          <div className="pb-2">
            <BarajLink touch />
          </div>
        )}
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {opened.entries.map((e) => (
            <EntryCard key={entryKey(e)} entry={e} props={props} query="" touch />
          ))}
        </ul>
      </>
    );
  } else if (q) {
    body =
      matches === 0 ? (
        <div className="flex flex-col items-start gap-2 py-6">
          <p className="m-0 text-base font-semibold">{t().empty}</p>
          <p className="m-0 text-sm text-muted">{t().emptyHint}</p>
          <button type="button" onClick={() => setQuery('')} className="mt-1 h-11 rounded-lg border border-line-2 px-4 text-[15px] font-semibold text-accent-ink active:bg-app">
            {t().clear}
          </button>
        </div>
      ) : (
        <>
          <p className="m-0 pb-3 text-sm text-ink-2">{t().results(q, matches)}</p>
          {shown.map((s) =>
            s.entries.length === 0 ? null : (
              <section key={s.key} className="mb-6 flex flex-col gap-3">
                <div>
                  {s.overline && <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted">{s.overline}</p>}
                  <h3 className="m-0 text-[17px] leading-tight font-semibold">{s.title}</h3>
                </div>
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {s.entries.map((e) => (
                    <EntryCard key={entryKey(e)} entry={e} props={props} query={q} touch />
                  ))}
                </ul>
              </section>
            ),
          )}
        </>
      );
  } else {
    const activeTitle = activeExample ? tr.examples.texts[activeExample].title : activeFault ? (tr.fault.scenarios[activeFault as FaultScenarioId]?.title ?? null) : null;
    const where = activeSection ? (activeSection.overline ? activeSection.overline.charAt(0) + activeSection.overline.slice(1).toLocaleLowerCase('tr-TR') : activeSection.short) : '';
    body = (
      <>
        {activeSection && activeTitle && (
          <button
            type="button"
            onClick={() => show(activeSection.key)}
            aria-label={t().openGroup(activeTitle)}
            className="mb-3 flex min-h-12 w-full items-center gap-2.5 rounded-xl bg-accent-soft px-4 py-2 text-left text-accent-ink"
          >
            <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-white">{t().open}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{t().openRow(activeTitle, where)}</span>
            <Icon name="chevron" className="h-[18px] w-[18px] shrink-0" />
          </button>
        )}
        <section aria-label={t().folderName} className="overflow-hidden rounded-2xl border border-line">
          <div className="flex items-center gap-3 border-b border-line bg-panel-2 px-4 py-3">
            <FolderLogo folder={folder} size={40} />
            <span className="min-w-0 leading-tight">
              <span className="block text-[15px] font-semibold">{t().folderName}</span>
              <span className="block text-[13px] text-muted">{t().folderSummary(folderTotal)}</span>
            </span>
          </div>
          {folderSections.map((s, i) => row(s, i === 0))}
        </section>
        <p className="m-0 mt-5 mb-2 px-1 text-[12px] font-semibold tracking-[0.08em] text-muted uppercase">{t().general}</p>
        <section aria-label={t().general} className="overflow-hidden rounded-2xl border border-line">
          {generalSections.map((s, i) => row(s, i === 0))}
        </section>
      </>
    );
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={tr.examples.dialogTitle} className="fixed inset-0 z-50 flex flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-14 shrink-0 items-center gap-1 px-2">
        {opened ? (
          <button type="button" onClick={() => show(null)} aria-label={t().back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-app">
            <Icon name="chevron" className="h-[22px] w-[22px] rotate-180" />
          </button>
        ) : (
          <button type="button" onClick={onClose} aria-label={tr.examples.dialogClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-app">
            <Icon name="close" />
          </button>
        )}
        <div className="min-w-0 flex-1 leading-tight">
          {opened?.overline && <p className="m-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted">{opened.overline}</p>}
          <h2 ref={headingRef} tabIndex={-1} className={`m-0 truncate font-semibold outline-none ${opened ? 'text-[17px]' : 'text-[19px]'}`}>
            {opened ? opened.title : tr.examples.dialogTitle}
          </h2>
        </div>
        <span className="shrink-0 px-2 font-mono text-[13px] text-muted">{opened ? opened.entries.length : q ? matches : total}</span>
      </div>
      {!opened && (
        <div className="shrink-0 px-4 pb-3">
          <label className="flex h-12 items-center gap-2 rounded-[10px] border border-line-2 px-3 text-muted focus-within:border-accent">
            <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t().searchLabel}
              placeholder={t().searchPlaceholder}
              className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
            />
          </label>
        </div>
      )}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        {body}
      </div>
    </div>
  );
}
