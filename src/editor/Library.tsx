// Sol panel: parça kütüphanesi. Arama, kategoriler ve sürükle-bırak. Örnekler üst çubuktaki
// "Örnekler" penceresindedir.

import { useMemo, useState, type Dispatch } from 'react';
import { tr } from '../i18n/tr';
import { CATEGORIES } from '../model/catalog';
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

export interface LibraryProps {
  readonly tool: Tool;
  readonly settings: Settings;
  readonly dispatch: Dispatch<EditorAction>;
  readonly onDragTypeChange: (type: DeviceType | null) => void;
  /** Telefonda çekmece olarak açık mı? */
  readonly open: boolean;
  readonly onClose: () => void;
  /** Dokunmatik ekran: parçaya dokununca parça doğrudan tuvale eklenir (sürükle-bırak yok). */
  readonly touch: boolean;
  readonly onAddPart: (type: DeviceType) => void;
  /** Fareyle üzerine gelinen parça (masaüstünde tuvalin sağ altındaki bilgi kartı için); null: yok. */
  readonly onPreview: (type: DeviceType | null) => void;
}

export function Library({
  tool,
  settings,
  dispatch,
  onDragTypeChange,
  open,
  onClose,
  touch,
  onAddPart,
  onPreview,
}: LibraryProps) {
  const [query, setQuery] = useState('');

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
    onClose();
  };

  return (
    <aside
      className={`absolute inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-line bg-panel shadow-xl transition-transform md:static md:z-auto md:translate-x-0 md:shadow-none ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}
      aria-label={tr.library.title}
    >
      <div className="flex items-center justify-between px-3 pt-3">
        <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{tr.library.title}</h2>
        <button
          type="button"
          className="rounded p-1 text-muted hover:bg-app md:hidden"
          onClick={onClose}
          aria-label={tr.library.close}
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      <div className="px-3 py-2">
        <label className="relative block">
          <span className="sr-only">{tr.library.searchLabel}</span>
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr.library.search}
            className="w-full rounded-md border border-line bg-app/60 py-1.5 pr-2 pl-8 text-sm outline-none focus:border-accent focus:bg-panel"
          />
        </label>
      </div>

      <nav
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
        onPointerLeave={(e) => e.pointerType === 'mouse' && onPreview(null)}
      >
        {groups.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted">{tr.library.noResults}</p>
        )}
        {groups.map((cat) => (
          <section key={cat.id} className="mb-2">
            <h3 className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted">{tr.library.categories[cat.id]}</h3>
            <ul>
              {cat.types.map((type) => {
                const active = tool.kind === 'place' && tool.type === type;
                return (
                  <li key={type}>
                    <button
                      type="button"
                      draggable={!touch}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', type);
                        e.dataTransfer.effectAllowed = 'copy';
                        onDragTypeChange(type);
                      }}
                      onDragEnd={() => onDragTypeChange(null)}
                      onClick={() => choose(type)}
                      // Önizleme yalnızca gerçek farede değişir: iOS Safari'de dokunuşun ürettiği
                      // "üzerine gelme" olayı sayfayı değiştirirse ilk dokunuşta tıklama gönderilmez.
                      onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview(type)}
                      aria-pressed={active}
                      className={`no-callout flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${
                        active ? 'bg-accent-soft text-accent' : 'hover:bg-app'
                      }`}
                    >
                      <span className="flex h-7 w-12 shrink-0 items-center justify-center">
                        <SymbolIcon type={type} resistorStyle={settings.resistorStyle} className="max-h-7 w-12" />
                      </span>
                      <span className="font-medium">{tr.devices.names[type]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      </nav>
    </aside>
  );
}
