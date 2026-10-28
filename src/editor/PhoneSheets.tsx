// Telefonun Parça ekle sayfası (tasarım: P02; v3'te sol alttaki Parça ekle düğmesi açar): arama,
// kategoriler, sık kullanılanlar; zincirle ekle (seçili parçanın boştaki ucuna bağlı) ve basılı tutup
// şemaya sürükleme. Düğmeler en az 44 px, arama alanının yazısı 16 px (iOS yakınlaştırmasın).

import { useEffect, useMemo, useRef, useState } from 'react';
import { tr } from '../i18n/tr';
import { CATEGORIES, type Category } from '../model/catalog';
import type { DeviceType } from '../sim/netlist';
import { HintText } from './HintStrip';
import { Icon } from './icons';
import type { Settings } from './settings';
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

// --- Parça ekle (P02) ----------------------------------------------------------------------

type PartsCategory = 'favorites' | Category;

/** Sık kullanılanlar: son eklenenler, ardından laboratuvarda en çok kullanılanlar. */
const FAVORITES: readonly DeviceType[] = ['resistor', 'led', 'capacitor', 'ground', 'voltmeter', 'diode', 'battery', 'ammeter', 'switch'];
const LONG_PRESS_MS = 400;
const MOVE_TOLERANCE_PX = 10;

export interface PartsSheetProps {
  readonly settings: Settings;
  readonly recent: readonly DeviceType[];
  /** "Zincirle ekle" açıksa yeni parçanın bağlanacağı uç ("B1’in + ucu"); kapalıysa null. */
  readonly chainTo: string | null;
  readonly onChainOff: () => void;
  readonly onAdd: (type: DeviceType) => void;
  /** Basılı tutup sürüklenen parça bırakıldı (ekran koordinatı). */
  readonly onDrop: (type: DeviceType, clientX: number, clientY: number) => void;
  /** Sürükleme sürerken sayfa saydamlaşır (devre görünsün). */
  readonly onDragging: (dragging: boolean) => void;
  /** Tablet (T02): kategori çipleri yerine başlıklı gruplar, hepsi alt alta. */
  readonly grouped?: boolean;
}

export function PartsSheetBody({ settings, recent, chainTo, onChainOff, onAdd, onDrop, onDragging, grouped = false }: PartsSheetProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PartsCategory>('favorites');
  const [ghost, setGhost] = useState<{ type: DeviceType; x: number; y: number } | null>(null);
  const press = useRef<{ type: DeviceType; id: number; x: number; y: number; timer: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const favorites = useMemo(() => [...new Set([...recent, ...FAVORITES])].slice(0, 9), [recent]);
  const q = normalize(query.trim());
  const sections = useMemo(
    () =>
      CATEGORIES.map((c) => ({
        id: c.id,
        types: c.types.filter(
          (type) =>
            q === '' ||
            normalize(tr.devices.names[type]).includes(q) ||
            normalize(tr.devices.descriptions[type]).includes(q) ||
            normalize(tr.library.categories[c.id]).includes(q),
        ),
      })).filter((c) => c.types.length > 0),
    [q],
  );
  const types = useMemo(() => {
    if (q) {
      return CATEGORIES.flatMap((c) =>
        c.types.filter(
          (type) =>
            normalize(tr.devices.names[type]).includes(q) ||
            normalize(tr.devices.descriptions[type]).includes(q) ||
            normalize(tr.library.categories[c.id]).includes(q),
        ),
      );
    }
    if (category === 'favorites') return favorites;
    return CATEGORIES.find((c) => c.id === category)?.types ?? [];
  }, [q, category, favorites]);

  // Sürüklerken liste kaymasın (iOS: ilk touchmove'da varsayılanı engelle).
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return undefined;
    const block = (e: TouchEvent) => {
      if (press.current?.active && e.cancelable) e.preventDefault();
    };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block);
  }, []);
  useEffect(() => () => window.clearTimeout(press.current?.timer), []);

  const endPress = (drop: { x: number; y: number } | null) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (!p.active) return;
    suppressClick.current = true;
    setGhost(null);
    onDragging(false);
    if (drop) onDrop(p.type, drop.x, drop.y);
  };

  const categories: Array<{ id: PartsCategory; label: string }> = [
    { id: 'favorites', label: tr.phone.favorites },
    ...CATEGORIES.map((c) => ({ id: c.id as PartsCategory, label: tr.library.categories[c.id] })),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5 px-4">
      {chainTo && (
        <div className="flex min-h-10 shrink-0 items-center gap-2 rounded-[10px] bg-accent-soft py-0.5 pr-0.5 pl-3 text-sm text-accent-ink">
          <Icon name="wire" className="h-[18px] w-[18px] shrink-0" />
          <span className="min-w-0 flex-1">
            <HintText text={tr.phone.chain(chainTo)} />
          </span>
          <button
            type="button"
            onClick={onChainOff}
            aria-label={tr.phone.chainOff}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-panel/60"
          >
            <Icon name="close" className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
      <label className="flex h-11 shrink-0 items-center gap-2 rounded-[10px] border border-line-2 px-3 text-muted focus-within:border-accent">
        <Icon name="search" className="h-[18px] w-[18px] shrink-0" />
        <span className="sr-only">{tr.library.searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr.library.search}
          className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
        />
      </label>
      {!query.trim() && !grouped && (
        <div role="tablist" aria-label={tr.library.title} className="no-scrollbar fade-right -mr-4 flex shrink-0 gap-1.5 overflow-x-auto overscroll-contain pr-4">
          {categories.map((c) => {
            const selected = c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setCategory(c.id)}
                className={`h-11 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap ${
                  selected ? 'border-ink bg-ink text-on-ink' : 'border-line-2 bg-panel text-ink'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
      <div ref={gridRef} className="-mx-4 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-2">
        {(grouped ? sections.length === 0 : types.length === 0) ? (
          <p className="py-3 text-sm text-muted">{tr.library.noResults}</p>
        ) : (
          (grouped ? sections : [{ id: null, types }]).map((section) => (
          <section key={section.id ?? 'all'} aria-label={section.id ? tr.library.categories[section.id] : undefined}>
          {section.id && <h3 className="pt-1 pb-1.5 text-label font-semibold text-muted">{tr.library.categories[section.id]}</h3>}
          <ul className="grid grid-cols-3 gap-2 pb-2">
            {section.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  aria-label={tr.library.add(tr.devices.names[type])}
                  onClick={() => {
                    if (suppressClick.current) {
                      suppressClick.current = false;
                      return;
                    }
                    onAdd(type);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                  onPointerDown={(e) => {
                    suppressClick.current = false;
                    const el = e.currentTarget;
                    const pointerId = e.pointerId;
                    const start = { type, id: pointerId, x: e.clientX, y: e.clientY, active: false, timer: 0 };
                    start.timer = window.setTimeout(() => {
                      if (press.current !== start) return;
                      start.active = true;
                      try {
                        el.setPointerCapture(pointerId);
                      } catch {
                        // Dokunmatikte işaretçi zaten örtük olarak yakalanır.
                      }
                      navigator.vibrate?.(10);
                      setGhost({ type, x: start.x, y: start.y });
                      onDragging(true);
                    }, LONG_PRESS_MS);
                    press.current = start;
                  }}
                  onPointerMove={(e) => {
                    const p = press.current;
                    if (!p || p.id !== e.pointerId) return;
                    if (p.active) setGhost({ type: p.type, x: e.clientX, y: e.clientY });
                    else if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > MOVE_TOLERANCE_PX) {
                      window.clearTimeout(p.timer);
                      press.current = null;
                    }
                  }}
                  onPointerUp={(e) => endPress({ x: e.clientX, y: e.clientY })}
                  onPointerCancel={() => endPress(null)}
                  className="no-callout flex h-[84px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-panel px-1 text-[13.5px] font-medium text-ink active:border-accent active:bg-accent-soft/50"
                >
                  <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="h-[26px] w-11" />
                  <span className="max-w-full truncate">{tr.devices.names[type]}</span>
                </button>
              </li>
            ))}
          </ul>
          </section>
          ))
        )}
      </div>
      <p className="-mx-4 shrink-0 border-t border-app px-4 pt-2 pb-2.5 text-[12.5px] text-muted">{tr.phone.addFooter}</p>
      {ghost && (
        <div
          className="pointer-events-none fixed z-[70] flex flex-col items-center gap-1 rounded-xl border-2 border-accent bg-panel/95 px-3 py-2 text-label font-semibold shadow-lg"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, calc(-100% - 24px))' }}
          aria-hidden="true"
        >
          <SymbolIcon type={ghost.type} resistorStyle={settings.resistorStyle} className="h-[26px] w-11" />
          {tr.devices.names[ghost.type]}
        </div>
      )}
    </div>
  );
}
