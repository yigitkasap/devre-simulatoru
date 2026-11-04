// Örnek devreler penceresi: üst çubuktaki "Örnekler" düğmesiyle açılır. Örnekler konularına göre
// gruplanır; birine tıklayınca devre yüklenir ve pencere kapanır. Telefonda tam ekran, aramalı ve
// açılır kapanır gruplu liste (tasarım: P12). Klasördeki gruplar (Akdeniz Üniversitesi · Fizik Bölümü:
// föyün deneyleri, baraj, arıza bulma) ana listede değil, klasörün kendi görünümünde.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { EXAMPLE_FOLDERS, exampleGroup, folderGroups, groupFolder, type ExampleFolderId, type ExampleId } from '../examples';
import { FAULT_SCENARIOS, faultFolder, faultScenario, type FaultScenarioId } from '../examples/faultScenarios';
import { tr } from '../i18n/tr';
import { ExtraTag } from './ExampleTab';
import { Icon } from './icons';
import { Rich } from './Rich';

export interface ExamplesDialogProps {
  /** Telefon düzeni: tam ekran liste (P12). */
  readonly phone: boolean;
  readonly activeExample: ExampleId | null;
  readonly onLoad: (id: ExampleId) => void;
  /** Örneği aç ve Tahtada kur'a geç (T6): tahta boş gelir, şema sağ panelde. */
  readonly onBoard?: (id: ExampleId) => void;
  /** Hazır arıza senaryosunu aç (Arıza bul grubu, B2). */
  readonly onFault: (id: FaultScenarioId) => void;
  /** Açık senaryo. */
  readonly activeFault: string | null;
  readonly onClose: () => void;
}

export function ExamplesDialog(props: ExamplesDialogProps) {
  return props.phone ? <PhoneExamples {...props} /> : <DesktopExamples {...props} />;
}

const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

/** Klasördeki devre sayısı: örnekler ve arıza bulma görevleri. */
function folderCount(folder: ExampleFolderId): number {
  return folderGroups(folder).reduce((n, g) => n + g.ids.length, 0) + FAULT_SCENARIOS.filter((s) => faultFolder(s) === folder).length;
}

/** Pencerenin açıldığı görünüm: açık örnek ya da arıza görevi bir klasördeyse o klasör. */
function startFolder(activeExample: ExampleId | null, activeFault: string | null): ExampleFolderId | null {
  const group = activeExample ? exampleGroup(activeExample) : undefined;
  if (group) return groupFolder(group);
  const scenario = activeFault ? faultScenario(activeFault) : undefined;
  return scenario ? faultFolder(scenario) : null;
}

/** Klasörün logosu (96 px'lik kopya; 2× ekranda 48 px'e kadar keskin); ince çerçeve koyu zeminde de ayırır. */
function FolderLogo({ folder, size }: { folder: ExampleFolderId; size: number }) {
  const logo = EXAMPLE_FOLDERS.find((f) => f.id === folder)!.logo;
  return <img src={`${BASE}${logo}`} alt={tr.examples.folders[folder].logoAlt} width={size} height={size} className="shrink-0 rounded-full ring-1 ring-line-2" style={{ width: size, height: size }} />;
}

/** Örnek kartındaki "Tahtada kur" (T6). */
function BoardButton({ id, onBoard, className }: { id: ExampleId; onBoard: (id: ExampleId) => void; className: string }) {
  return (
    <button
      type="button"
      onClick={() => onBoard(id)}
      aria-label={tr.tahta.gorev.onExampleLabel(tr.examples.texts[id].title)}
      className={`flex items-center gap-1.5 rounded-lg bg-accent-soft font-semibold text-accent-ink hover:brightness-95 ${className}`}
    >
      <Icon name="board" className="h-4 w-4" />
      {tr.tahta.gorev.onExample}
    </button>
  );
}

function DesktopExamples({ activeExample, onLoad, onBoard, onFault, activeFault, onClose }: ExamplesDialogProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLButtonElement>(null);
  const folderTitleRef = useRef<HTMLHeadingElement>(null);
  const [folder, setFolder] = useState<ExampleFolderId | null>(() => startFolder(activeExample, activeFault));
  const switched = useRef(false);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);
  // Görünüm değişince liste başa döner; odak klasörün başlığına (geri dönünce klasör kartına) gider.
  useEffect(() => {
    if (!switched.current) return;
    listRef.current?.scrollTo({ top: 0 });
    (folder ? folderTitleRef.current : cardRef.current)?.focus();
  }, [folder]);
  const show = (next: ExampleFolderId | null) => {
    switched.current = true;
    setFolder(next);
  };

  // Numaralar her görünümde 1'den başlar.
  let number = 0;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-scrim/30 p-3 sm:items-center sm:p-6"
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
        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {folder === null ? (
            EXAMPLE_FOLDERS.map((f) => (
              <button
                key={f.id}
                ref={cardRef}
                type="button"
                onClick={() => show(f.id)}
                aria-label={`${tr.examples.folders[f.id].title}. ${tr.examples.folders[f.id].summary(folderCount(f.id))}`}
                className="mb-4 flex w-full items-center gap-3.5 rounded-xl border border-line px-4 py-3 text-left hover:bg-app"
              >
                <FolderLogo folder={f.id} size={48} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold">{tr.examples.folders[f.id].title}</span>
                  <span className="mt-0.5 block text-xs text-muted">{tr.examples.folders[f.id].summary(folderCount(f.id))}</span>
                </span>
                <Icon name="chevron" className="h-5 w-5 shrink-0 text-muted" />
              </button>
            ))
          ) : (
            <div className="mb-4">
              <button type="button" onClick={() => show(null)} className="-ml-1.5 flex h-8 items-center gap-1 rounded-md px-1.5 text-sm font-medium text-accent-ink hover:bg-app">
                <Icon name="chevron" className="h-4 w-4 rotate-180" />
                {tr.examples.back}
              </button>
              <div className="mt-2 flex items-center gap-3">
                <FolderLogo folder={folder} size={40} />
                <h3 ref={folderTitleRef} tabIndex={-1} className="text-base font-semibold outline-none">
                  {tr.examples.folders[folder].title}
                </h3>
              </div>
            </div>
          )}
          {folderGroups(folder).map((group) => (
            <section key={group.id} className="mb-4 last:mb-1">
              <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{tr.examples.groups[group.id]}</h3>
              <ul className="grid gap-2 md:grid-cols-2">
                {group.ids.map((id) => {
                  number += 1;
                  const texts = tr.examples.texts[id];
                  const active = activeExample === id;
                  return (
                    <li key={id} className="relative">
                      <button
                        type="button"
                        onClick={() => onLoad(id)}
                        aria-pressed={active}
                        aria-label={texts.title}
                        className={`flex h-full w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left ${onBoard ? 'pb-10' : ''} ${
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
                          <span className="block text-sm font-semibold">
                            {texts.title}
                            <ExtraTag id={id} className="ml-1.5" />
                          </span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted">
                            <Rich text={texts.description} />
                          </span>
                        </span>
                      </button>
                      {onBoard && <BoardButton id={id} onBoard={onBoard} className="absolute bottom-2 left-11 h-7 px-2.5 text-xs" />}
                    </li>
                  );
                })}
              </ul>
              {group.id === 'baraj' && <BarajLink />}
            </section>
          ))}
          <section className="mb-1">
            <h3 className="mb-0.5 text-xs font-semibold tracking-wide text-muted uppercase">{tr.fault.group}</h3>
            <p className="m-0 mb-1.5 text-xs text-muted">{tr.fault.groupNote}</p>
            <ul className="grid gap-2 md:grid-cols-2">
              {FAULT_SCENARIOS.filter((s) => faultFolder(s) === folder).map((s) => {
                const texts = tr.fault.scenarios[s.id];
                const active = activeFault === s.id;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onFault(s.id)}
                      aria-pressed={active}
                      aria-label={tr.fault.loaded(texts.title)}
                      className={`flex h-full w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left ${active ? 'border-accent bg-accent-soft' : 'border-line hover:bg-app'}`}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-warn-soft text-warn" aria-hidden="true">
                        <Icon name="wrench" className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{texts.title}</span>
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted">
                          {texts.experiment} · <Rich text={texts.symptom} />
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

/** Baraj projesinin ayrı sayfası (büyük sahne, ışık kulesi, kontroller). */
function BarajLink({ touch = false }: { touch?: boolean }) {
  return (
    <a
      href={`${BASE}baraj/`}
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

function PhoneExamples({ activeExample, onLoad, onBoard, onFault, activeFault, onClose }: ExamplesDialogProps) {
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<ExampleFolderId | null>(() => startFolder(activeExample, activeFault));
  const activeGroup = activeExample ? exampleGroup(activeExample) : undefined;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set([activeGroup ?? folderGroups(folder)[0]!.id]));
  const listRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const switched = useRef(false);
  // Numaralar her görünümde (ana liste, klasör) 1'den başlar; aramada örnek kendi görünümündeki numarasıyla.
  const numbers = useMemo(() => {
    const map = new Map<ExampleId, number>();
    for (const f of [null, ...EXAMPLE_FOLDERS.map((x) => x.id)]) {
      let n = 0;
      for (const g of folderGroups(f)) for (const id of g.ids) map.set(id as ExampleId, ++n);
    }
    return map;
  }, []);
  const q = normalize(query.trim());
  const groupsOf = (f: ExampleFolderId | null) =>
    folderGroups(f)
      .map((g) => ({
        ...g,
        ids: (g.ids as readonly ExampleId[]).filter((id) => {
          if (!q) return true;
          const t = tr.examples.texts[id];
          return normalize(t.title).includes(q) || normalize(t.description).includes(q) || normalize(tr.examples.groups[g.id]).includes(q);
        }),
      }))
      .filter((g) => g.ids.length > 0);
  const faultsOf = (f: ExampleFolderId | null) =>
    FAULT_SCENARIOS.filter((s) => {
      if (faultFolder(s) !== f) return false;
      if (!q) return true;
      const t = tr.fault.scenarios[s.id];
      return normalize(t.title).includes(q) || normalize(t.symptom).includes(q) || normalize(tr.fault.group).includes(q);
    });
  const groups = groupsOf(folder);
  const faults = faultsOf(folder);
  // Ana ekrandaki arama klasörlerin içini de bulur: eşleşenler klasörün başlığı altında. Klasör ekranındaki
  // arama yalnızca klasörde arar.
  const nested =
    folder === null && q
      ? EXAMPLE_FOLDERS.map((f) => ({ id: f.id, groups: groupsOf(f.id), faults: faultsOf(f.id) })).filter((x) => x.groups.length + x.faults.length > 0)
      : [];
  // Sağ üstteki sayı: o an görünen listedeki kartlar (örnekler ve arıza görevleri).
  const cards = (gs: readonly { ids: readonly string[] }[], fs: readonly unknown[]) => gs.reduce((n, g) => n + g.ids.length, 0) + fs.length;
  const count = cards(groups, faults) + nested.reduce((n, x) => n + cards(x.groups, x.faults), 0);
  const faultsOpen = q !== '' || open.has('ariza') || activeFault !== null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  // Görünüm değişince liste başa döner, odak başlığa gider.
  useEffect(() => {
    if (!switched.current) return;
    listRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [folder]);
  const show = (next: ExampleFolderId | null) => {
    switched.current = true;
    setQuery('');
    setFolder(next);
    // Klasöre girince gruplarından biri açık gelir (açık örnek o klasördeyse onun grubu).
    if (next && !folderGroups(next).some((g) => open.has(g.id))) {
      const first = activeGroup && groupFolder(activeGroup) === next ? activeGroup : folderGroups(next)[0]!.id;
      setOpen((s) => new Set([...s, first]));
    }
  };
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderGroup = (group: ReturnType<typeof groupsOf>[number]) => {
    const expanded = q !== '' || open.has(group.id);
    return (
      <section key={group.id} className="border-b border-app">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => toggle(group.id)}
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
                        <ExtraTag id={id} className="ml-1.5" />
                        {active && (
                          <span className="ml-1.5 rounded-xs bg-accent px-1.5 py-px align-[2px] text-[11px] font-semibold text-white">{tr.phone.exampleOpen}</span>
                        )}
                      </b>
                      <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-muted">
                        <Rich text={texts.description} />
                      </span>
                    </span>
                  </button>
                  {onBoard && <BoardButton id={id} onBoard={onBoard} className="mt-1.5 ml-8 h-11 px-3.5 text-[15px]" />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    );
  };
  const renderFaults = (list: typeof faults) =>
    list.length > 0 && (
      <section className="border-b border-app">
        <button
          type="button"
          aria-expanded={faultsOpen}
          onClick={() => toggle('ariza')}
          className="flex min-h-[52px] w-full items-center gap-2.5 text-left text-[15px] font-semibold"
        >
          <Icon name={faultsOpen ? 'chevronDown' : 'chevron'} className="h-[18px] w-[18px] shrink-0 text-muted" />
          <span className="min-w-0 flex-1">{tr.fault.group}</span>
          <span className="font-mono text-[13px] font-medium text-muted">{list.length}</span>
        </button>
        {faultsOpen && (
          <ul className="flex flex-col gap-2 pt-2 pb-3">
            {list.map((s) => {
              const texts = tr.fault.scenarios[s.id];
              const active = activeFault === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onFault(s.id)}
                    aria-current={active || undefined}
                    aria-label={tr.fault.loaded(texts.title)}
                    className={`flex w-full items-start gap-3 rounded-xl text-left ${active ? 'border-2 border-accent bg-accent-soft/50 p-[11px]' : 'border border-line p-3 active:bg-app'}`}
                  >
                    <Icon name="wrench" className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                    <span className="min-w-0">
                      <b className="block text-[15px] font-semibold">{texts.title}</b>
                      <span className="mt-0.5 line-clamp-2 block text-[13.5px] leading-snug text-muted">
                        {texts.experiment} · <Rich text={texts.symptom} />
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

  return (
    <div role="dialog" aria-modal="true" aria-label={tr.examples.dialogTitle} className="fixed inset-0 z-50 flex flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="flex h-14 shrink-0 items-center gap-1 px-2">
        {folder ? (
          <button type="button" onClick={() => show(null)} aria-label={tr.examples.back} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-app">
            <Icon name="chevron" className="h-[22px] w-[22px] rotate-180" />
          </button>
        ) : (
          <button type="button" onClick={onClose} aria-label={tr.examples.dialogClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-app">
            <Icon name="close" />
          </button>
        )}
        <h2 ref={headingRef} tabIndex={-1} className={`min-w-0 font-semibold outline-none ${folder ? 'text-base leading-tight' : 'text-[19px]'}`}>
          {folder ? tr.examples.folders[folder].title : tr.examples.dialogTitle}
        </h2>
        <span className="ml-auto shrink-0 pr-2 pl-2 font-mono text-[13px] text-muted">{count}</span>
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
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        {count === 0 && <p className="py-3 text-sm text-muted">{tr.phone.examplesNone}</p>}
        {folder === null &&
          !q &&
          EXAMPLE_FOLDERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => show(f.id)}
              aria-label={`${tr.examples.folders[f.id].title}, ${folderCount(f.id)} devre`}
              className="flex min-h-14 w-full items-center gap-3 border-b border-app py-2.5 text-left active:bg-app"
            >
              <FolderLogo folder={f.id} size={44} />
              <b className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">{tr.examples.folders[f.id].title}</b>
              <span className="font-mono text-[13px] font-medium text-muted">{folderCount(f.id)}</span>
              <Icon name="chevron" className="h-[18px] w-[18px] shrink-0 text-muted" />
            </button>
          ))}
        {groups.map(renderGroup)}
        {renderFaults(faults)}
        {nested.map((x) => (
          <div key={x.id}>
            <div className="flex items-center gap-2 pt-4 pb-1 text-[13px] font-semibold text-muted">
              <FolderLogo folder={x.id} size={24} />
              {tr.examples.folders[x.id].title}
            </div>
            {x.groups.map(renderGroup)}
            {renderFaults(x.faults)}
          </div>
        ))}
      </div>
    </div>
  );
}
