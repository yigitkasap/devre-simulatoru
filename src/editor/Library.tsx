// Parça kütüphanesi (tasarım: C-Kutuphane). Biçimleri:
//   full    masaüstünde solda sabit panel (232/256 px): arama, kategoriler, altta seçili parçanın bilgisi
//   rail    56 px şerit: kütüphaneyi aç, ara ve son kullanılan parçalar
// Telefonda kütüphane yerine alttaki Parça sayfası kullanılır (PhoneSheets).
// Sıkışık masaüstünde (900–1279 px) şeritteki "aç" düğmesi tam paneli tuvalin üstünde açılır kart
// olarak gösterir (LibraryFlyout); kart tuval alanının içinde durur, alttaki çubukları kapatmaz.
// Örnekler üst çubuktaki "Örnekler" penceresindedir.

import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { tr } from '../i18n/tr';
import { CATEGORIES, type Category } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';
import { Icon } from './icons';
import type { Settings } from './settings';
import type { EditorAction, Tool } from './state';
import { SymbolIcon } from './symbols';

/** Türkçe karakterleri sadeleştirerek arar ("kondansator" → "Kondansatör"). */
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

const CATEGORY_OF = new Map<DeviceType, Category>(CATEGORIES.flatMap((c) => c.types.map((t) => [t, c.id] as const)));

export type LibraryMode = 'full' | 'rail';

export interface LibraryProps {
  readonly mode: LibraryMode;
  /** Tam panelin genişliği (px). */
  readonly width: number;
  readonly tool: Tool;
  readonly settings: Settings;
  readonly dispatch: Dispatch<EditorAction>;
  readonly onDragTypeChange: (type: DeviceType | null) => void;
  /** Açılır kartı kapatır. */
  readonly onClose: () => void;
  /** Tam paneli şeride daraltır. */
  readonly onCollapse: () => void;
  /** Şeritten kütüphaneyi açar; `search` true ise arama kutusuna odaklanılır. */
  readonly onExpand: (search: boolean) => void;
  /** Açıldığında arama kutusuna odaklanılsın mı (şeritteki "Parça ara")? */
  readonly focusSearch: number;
  /** Dokunmatik ekran: parçaya dokununca parça doğrudan tuvale eklenir (sürükle-bırak yok). */
  readonly touch: boolean;
  readonly onAddPart: (type: DeviceType) => void;
  /** Fareyle üzerine gelinen parça (bilgi alanı için); null: yok. */
  readonly onPreview: (type: DeviceType | null) => void;
  /** Bilgi alanında anlatılan parça. */
  readonly infoType: DeviceType;
  /** Son kullanılan parçalar (şerit). */
  readonly recent: readonly DeviceType[];
  /** Şeritten açılan kart açık mı (şeritteki düğmenin durumu için)? */
  readonly flyoutOpen?: boolean;
}

/** Şeritteki "aç" düğmesi: açılır kartın dışarı tıklama denetimi bu düğmeyi saymaz. */
const TOGGLE_ATTR = 'data-library-toggle';

export function Library(props: LibraryProps) {
  const { mode } = props;
  if (mode === 'rail') return <Rail {...props} />;
  return (
    <aside
      className="flex h-full shrink-0 flex-col border-r border-line bg-panel"
      style={{ width: props.width }}
      aria-label={tr.library.title}
    >
      <LibraryPanel {...props} />
    </aside>
  );
}

/**
 * Şeritten açılan kart (sıkışık masaüstü): tam panel, tuval alanının sol kenarında. Dışarı tıklayınca,
 * Esc'e basınca ya da bir parça seçilince kapanır.
 */
export function LibraryFlyout(props: Omit<LibraryProps, 'mode'>) {
  const rootRef = useRef<HTMLElement>(null);
  const { onClose } = props;
  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Element;
      if (rootRef.current?.contains(target) || target.closest?.(`[${TOGGLE_ATTR}]`)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <aside
      ref={rootRef}
      aria-label={tr.library.title}
      className="absolute inset-y-0 left-0 z-30 flex flex-col rounded-r-lg border-r border-line bg-panel shadow-lg"
      style={{ width: props.width }}
    >
      <LibraryPanel {...props} mode="flyout" />
    </aside>
  );
}

/** Başlık, arama, kategorili liste ve (masaüstünde) bilgi alanı. */
function LibraryPanel({
  mode,
  tool,
  settings,
  dispatch,
  onDragTypeChange,
  onClose,
  onCollapse,
  focusSearch,
  touch,
  onAddPart,
  onPreview,
  infoType,
}: Omit<LibraryProps, 'mode'> & { mode: LibraryMode | 'flyout' }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (focusSearch > 0) searchRef.current?.focus();
  }, [focusSearch]);

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    return CATEGORIES.map((cat) => ({
      ...cat,
      types: cat.types.filter(
        (type) =>
          q === '' ||
          normalize(tr.devices.names[type]).includes(q) ||
          normalize(tr.devices.descriptions[type]).includes(q) ||
          normalize(tr.library.categories[cat.id]).includes(q),
      ),
    })).filter((cat) => cat.types.length > 0);
  }, [query]);

  const choose = (type: DeviceType) => {
    if (touch) {
      // Dokunmatikte imleci izleyen önizleme olmadığı için "seç, sonra tuvale dokun" belirsizdir:
      // parça doğrudan görünen alanın ortasına eklenir.
      onAddPart(type);
    } else {
      dispatch({ type: 'set-tool', tool: { kind: 'place', type, rotation: 0 } });
    }
    if (mode === 'flyout') onClose();
  };

  const category = CATEGORY_OF.get(infoType);

  return (
    <>
      <div className="flex items-center justify-between pt-3 pr-2 pb-2 pl-4">
        <h2 className="text-[15px] font-semibold">{tr.library.title}</h2>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-app max-desk:h-10 max-desk:w-10"
          onClick={mode === 'flyout' ? onClose : onCollapse}
          aria-label={mode === 'flyout' ? tr.library.close : tr.library.collapse}
          title={mode === 'flyout' ? tr.library.close : tr.library.collapse}
        >
          <Icon name={mode === 'flyout' ? 'close' : 'collapseLeft'} />
        </button>
      </div>
      <div className="px-3 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-md border border-line-2 px-2.5 text-muted focus-within:border-accent">
          <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
          <span className="sr-only">{tr.library.searchLabel}</span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr.library.search}
            className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
          />
        </label>
      </div>

      <nav
        className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto overscroll-contain px-2 pb-2"
        onPointerLeave={(e) => e.pointerType === 'mouse' && onPreview(null)}
      >
        {groups.length === 0 && <p className="px-2 py-3 text-sm text-muted">{tr.library.noResults}</p>}
        {groups.map((cat, i) => (
          <section key={cat.id}>
            <h3 className={`px-2 pb-1 text-label font-semibold text-muted ${i === 0 ? 'pt-2' : 'pt-2.5'}`}>
              {tr.library.categories[cat.id]}
            </h3>
            <ul className="flex flex-col gap-px">
              {cat.types.map((type) => {
                const active = tool.kind === 'place' && tool.type === type;
                return (
                  <li key={type}>
                    <PartButton
                      type={type}
                      active={active}
                      touch={touch}
                      settings={settings}
                      onChoose={choose}
                      onPreview={onPreview}
                      onDragTypeChange={onDragTypeChange}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>

      <div aria-live="polite" className="flex flex-col gap-1.5 border-t border-line bg-panel-2 px-3.5 pt-3 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <b className="text-sm font-semibold">{tr.devices.names[infoType]}</b>
          {category && <span className="text-[11px] text-muted">{tr.library.categories[category]}</span>}
        </div>
        <p className="text-small leading-[1.45] text-ink-2">{tr.devices.descriptions[infoType]}</p>
        <span className="text-label text-muted">{tr.library.hint}</span>
      </div>
    </>
  );
}

function PartButton({
  type,
  active,
  touch,
  settings,
  onChoose,
  onPreview,
  onDragTypeChange,
  rail = false,
}: {
  type: DeviceType;
  active: boolean;
  touch: boolean;
  settings: Settings;
  onChoose: (type: DeviceType) => void;
  onPreview: (type: DeviceType | null) => void;
  onDragTypeChange: (type: DeviceType | null) => void;
  rail?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={!touch}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', type);
        e.dataTransfer.effectAllowed = 'copy';
        onDragTypeChange(type);
      }}
      onDragEnd={() => onDragTypeChange(null)}
      onClick={() => onChoose(type)}
      // Önizleme yalnızca gerçek farede değişir: iOS Safari'de dokunuşun ürettiği "üzerine gelme"
      // olayı sayfayı değiştirirse ilk dokunuşta tıklama gönderilmez.
      onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview(type)}
      onPointerLeave={(e) => rail && e.pointerType === 'mouse' && onPreview(null)}
      aria-pressed={active}
      aria-label={rail ? tr.library.add(tr.devices.names[type]) : undefined}
      title={rail ? tr.devices.names[type] : undefined}
      className={`no-callout flex items-center text-left text-sm font-medium ${
        rail
          ? 'h-10 w-11 justify-center rounded-md'
          : 'h-[34px] w-full gap-2.5 rounded-[7px] px-2 max-desk:h-10'
      } ${active ? 'bg-accent-soft text-accent-ink' : 'text-ink hover:bg-app'} ${touch ? '' : 'cursor-grab'}`}
    >
      <span className="flex h-5 w-8 shrink-0 items-center justify-center">
        <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="max-h-5 w-8" />
      </span>
      {!rail && tr.devices.names[type]}
    </button>
  );
}

/** 56 px şerit: kütüphaneyi aç, ara ve son kullanılan parçalar. */
function Rail({ tool, settings, dispatch, onDragTypeChange, onExpand, onClose, touch, onAddPart, onPreview, recent, flyoutOpen }: LibraryProps) {
  const choose = (type: DeviceType) => {
    if (touch) onAddPart(type);
    else dispatch({ type: 'set-tool', tool: { kind: 'place', type, rotation: 0 } });
  };
  const open = flyoutOpen === true;
  return (
    <nav
      aria-label={tr.toolbar.library}
      className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2"
    >
      <button
        type="button"
        onClick={() => (open ? onClose() : onExpand(false))}
        aria-label={tr.library.open}
        aria-expanded={open}
        {...{ [TOGGLE_ATTR]: '' }}
        title={tr.library.open}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-accent-soft text-accent-ink hover:brightness-95"
      >
        <Icon name="parts" className="h-[22px] w-[22px]" />
      </button>
      <button
        type="button"
        onClick={() => onExpand(true)}
        {...{ [TOGGLE_ATTR]: '' }}
        aria-label={tr.library.searchLabel}
        title={tr.library.searchLabel}
        className="flex h-11 w-11 items-center justify-center rounded-[10px] text-ink hover:bg-app"
      >
        <Icon name="search" />
      </button>
      <span className="my-1.5 h-px w-7 bg-line" aria-hidden="true" />
      <span className="text-[10px] font-semibold text-muted" aria-hidden="true">
        {tr.library.recent}
      </span>
      <ul aria-label={tr.library.recentLabel} className="flex flex-col items-center gap-1">
        {recent.map((type) => (
          <li key={type}>
            <PartButton
              type={type}
              active={tool.kind === 'place' && tool.type === type}
              touch={touch}
              settings={settings}
              onChoose={choose}
              onPreview={onPreview}
              onDragTypeChange={onDragTypeChange}
              rail
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}
