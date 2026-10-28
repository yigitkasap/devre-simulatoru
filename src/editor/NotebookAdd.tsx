// Defterin sonundaki parça ekleme satırı (tasarım v3: D1) ve "Bütün parçalar" penceresi.
//
// Satıra yazınca adı eşleşen parçalar ve o parçayı içeren örnekler listelenir; Enter (ya da tıklama)
// vurgulu parçayı ekler, oklar vurguyu taşır, Esc temizler. Açık bir kartın boşta ucu varsa parça
// o uca bağlı eklenir ("zincirle ekle"), yoksa şemanın görünen alanında boş bir yere. Altındaki
// "Bütün parçalara göz at" kategorili ızgarayı açar.

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { EXAMPLE_IDS, exampleDoc, type ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { CATEGORIES } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';
import { Kbd } from './HintStrip';
import { Icon } from './icons';
import type { Settings } from './settings';
import { SymbolIcon } from './symbols';
import { useTouchUi } from './touchUi';

const t = tr.notebook;
const ALL_TYPES = CATEGORIES.flatMap((c) => c.types);
const CATEGORY_OF = new Map<DeviceType, string>(CATEGORIES.flatMap((c) => c.types.map((type) => [type, tr.library.categories[c.id]] as const)));
const MAX_PARTS = 4;
const MAX_EXAMPLES = 3;

/** Türkçe karakterleri sadeleştirerek arar ("kondansator" → "Kondansatör"). */
function normalize(text: string): string {
  return text.toLocaleLowerCase('tr-TR').replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u');
}

/** Bir parça türünü içeren örnekler (örnek sırasıyla). */
const examplesWith = (() => {
  const cache = new Map<DeviceType, ExampleId[]>();
  return (type: DeviceType): ExampleId[] => {
    let list = cache.get(type);
    if (!list) {
      list = EXAMPLE_IDS.filter((id) => exampleDoc(id)?.parts.some((p) => p.type === type));
      cache.set(type, list);
    }
    return list;
  };
})();

export interface AddPartRowProps {
  readonly settings: Settings;
  /** Eklenecek parçanın bağlanacağı uç ("R1’in 2. ucu"); yoksa null (boş yere eklenir). */
  readonly chainTo: string | null;
  readonly onAdd: (type: DeviceType) => void;
  readonly onOpenExample: (id: ExampleId) => void;
}

export function AddPartRow({ settings, chainTo, onAdd, onOpenExample }: AddPartRowProps) {
  const touch = useTouchUi();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [gridOpen, setGridOpen] = useState(false);
  const listId = useId();
  const q = normalize(query.trim());
  const parts = useMemo(() => (q ? ALL_TYPES.filter((type) => normalize(tr.devices.names[type]).includes(q)).slice(0, MAX_PARTS) : []), [q]);
  const examples = useMemo(() => (parts[0] ? examplesWith(parts[0]).slice(0, MAX_EXAMPLES) : []), [parts]);
  const options = [...parts.map((type) => ({ kind: 'part' as const, type })), ...examples.map((id) => ({ kind: 'example' as const, id }))];
  useEffect(() => setActive(0), [q]);

  const choose = (index: number) => {
    const option = options[index];
    if (!option) return;
    if (option.kind === 'part') onAdd(option.type);
    else onOpenExample(option.id);
    setQuery('');
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (options.length === 0) return;
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape' && query) {
      e.stopPropagation();
      setQuery('');
    }
  };
  const open = q !== '';
  return (
    <>
      <div data-tour="parts" className={`flex shrink-0 flex-col overflow-hidden rounded-lg bg-panel ${open ? 'border-2 border-accent' : 'border border-line focus-within:border-accent'}`}>
        <label className={`flex items-center gap-2.5 px-3.5 ${touch ? 'h-14' : 'h-[52px]'} ${open ? 'border-b border-line' : ''}`}>
          <Icon name="plus" className="h-[18px] w-[18px] shrink-0 text-accent" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.addPlaceholder}
            aria-label={t.addLabel}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          />
          {open && options.length > 0 && <Kbd size="sm">Enter</Kbd>}
        </label>
        {open && (
          <div id={listId} role="listbox" aria-label={t.addLabel} className="flex flex-col pb-1">
            {parts.length === 0 && <p className="px-3.5 py-3 text-small text-muted">{tr.library.noResults}</p>}
            {parts.map((type, i) => (
              <button
                key={type}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                aria-selected={active === i}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={`flex w-full items-center gap-3.5 px-3.5 text-left ${touch ? 'min-h-14' : 'min-h-14'} ${active === i ? 'bg-accent-soft' : ''}`}
              >
                <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="max-h-[18px] w-[34px] shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-[15px] font-semibold">{tr.devices.names[type]}</span>
                  <span className="text-label text-ink-2">{CATEGORY_OF.get(type)}</span>
                </span>
                <span className="shrink-0 text-label text-accent-ink">{chainTo ? t.addChained(chainTo) : t.addFree}</span>
              </button>
            ))}
            {examples.length > 0 && <span className="px-3.5 pt-2.5 pb-1 text-[11px] font-semibold tracking-[0.04em] text-muted uppercase">{tr.examples.section}</span>}
            {examples.map((id, j) => {
              const i = parts.length + j;
              return (
                <button
                  key={id}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={active === i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center gap-3 px-3.5 text-left text-sm ${touch ? 'min-h-11' : 'min-h-11'} ${active === i ? 'bg-accent-soft' : ''}`}
                >
                  <Icon name="book" className="h-[18px] w-[18px] shrink-0 text-muted" />
                  {tr.examples.texts[id].title}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setGridOpen(true)}
        className={`flex shrink-0 items-center gap-2 self-start px-1 text-small text-accent-ink hover:underline ${touch ? 'h-11' : 'h-10'}`}
      >
        <Icon name="parts" className="h-4 w-4" />
        {t.browseAll(ALL_TYPES.length)}
      </button>
      {gridOpen && (
        <PartsGridDialog
          settings={settings}
          chainTo={chainTo}
          onAdd={(type) => {
            setGridOpen(false);
            onAdd(type);
          }}
          onClose={() => setGridOpen(false)}
        />
      )}
    </>
  );
}

/** Bütün parçalar: kategorili ızgara; tıklanan parça eklenir, pencere kapanır. */
function PartsGridDialog({ settings, chainTo, onAdd, onClose }: { settings: Settings; chainTo: string | null; onAdd: (type: DeviceType) => void; onClose: () => void }) {
  const touch = useTouchUi();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>('button[data-part]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[calc(100dvh-2rem)] w-[min(760px,100%)] flex-col overflow-hidden rounded-2xl bg-panel shadow-lg"
      >
        <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 id={titleId} className="flex-1 text-heading font-semibold">
            {t.allParts}
          </h2>
          {chainTo && <span className="text-small text-accent-ink">{t.addChained(chainTo)}</span>}
          <button type="button" onClick={onClose} aria-label={t.closeAll} className={`flex items-center justify-center rounded-md hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" />
          </button>
        </header>
        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
          {CATEGORIES.map((c) => (
            <section key={c.id} aria-label={tr.library.categories[c.id]} className="flex flex-col gap-2">
              <h3 className="text-label font-semibold text-muted">{tr.library.categories[c.id]}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {c.types.map((type) => (
                  <button
                    key={type}
                    type="button"
                    data-part={type}
                    onClick={() => onAdd(type)}
                    title={tr.devices.descriptions[type].replace(/\*\*|\[\[|\]\]/g, '')}
                    className={`flex items-center gap-2.5 rounded-lg border border-line px-3 text-left text-sm hover:border-accent hover:bg-accent-soft ${touch ? 'min-h-14' : 'min-h-12'}`}
                  >
                    <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="max-h-[18px] w-[30px] shrink-0" />
                    <span className="min-w-0 flex-1">{tr.devices.names[type]}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
