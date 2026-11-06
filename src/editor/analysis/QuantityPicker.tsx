// Büyüklük seçici (analiz v2): aranabilir, gruplu liste (Ölçü aletleri, Parçalar, Düğümler). Çoklu
// seçimde her satır açılıp kapanan bir düğme (aria-pressed); tek seçimde tıklanan büyüklük eklenir.
// "Şemadan seç" küçük bir bağlantı olarak kalır (şemada düğüme ya da parçaya tıklama).

import { useId, useMemo, useState } from 'react';
import { tr } from '../../i18n/tr';
import { Icon } from '../icons';
import { filterOptions, type QuantityGroup, type QuantityOption } from './quantities';

const GROUPS: readonly QuantityGroup[] = ['meters', 'parts', 'nodes'];

export function QuantityPicker({
  options,
  selected,
  onToggle,
  onFromSchematic,
  touch = false,
  autoFocus = false,
  maxHeight,
}: {
  options: readonly QuantityOption[];
  /** Seçili (ya da grafikte olan) büyüklüklerin anahtarları. */
  selected: ReadonlySet<string>;
  onToggle: (option: QuantityOption) => void;
  onFromSchematic?: () => void;
  touch?: boolean;
  autoFocus?: boolean;
  /** Listenin en büyük yüksekliği (px); verilmezse içerik kadar. */
  maxHeight?: number;
}) {
  const t = tr.analysis.picker;
  const [query, setQuery] = useState('');
  const shown = useMemo(() => filterOptions(options, query), [options, query]);
  const idBase = useId();
  const row = `flex w-full items-center gap-2 rounded-md px-2.5 text-left hover:bg-panel-2 ${touch ? 'min-h-11' : 'min-h-9'}`;
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <label className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-panel px-2.5 focus-within:border-accent ${touch ? 'h-11' : 'h-9'}`}>
          <Icon name="search" className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t.search}
            placeholder={t.search}
            autoFocus={autoFocus}
            className={`min-w-0 flex-1 bg-transparent outline-none ${touch ? 'text-base' : 'text-small'}`}
          />
        </label>
        {onFromSchematic && (
          <button type="button" onClick={onFromSchematic} className={`shrink-0 rounded-md px-1.5 text-small font-medium text-accent-ink hover:underline ${touch ? 'h-11' : 'h-9'}`}>
            {t.fromSchematic}
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto overscroll-contain" style={maxHeight ? { maxHeight } : undefined}>
        {shown.length === 0 && <p className="m-0 px-1 py-2 text-small text-muted">{t.none}</p>}
        {GROUPS.map((group) => {
          const items = shown.filter((o) => o.group === group);
          if (items.length === 0) return null;
          const headId = `${idBase}-${group}`;
          return (
            <div key={group} role="group" aria-labelledby={headId} className="flex flex-col">
              <h4 id={headId} className="m-0 px-2.5 pt-1 pb-1 text-label font-semibold tracking-[0.04em] text-muted uppercase">
                {t.groups[group]}
              </h4>
              {items.map((o) => {
                const on = selected.has(o.key);
                return (
                  <button key={o.key} type="button" aria-pressed={on} onClick={() => onToggle(o)} className={`${row} ${on ? 'bg-accent-soft' : ''}`}>
                    <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${on ? 'border-accent bg-accent text-white' : 'border-line-2'}`}>
                      {on && <Icon name="check" className="h-3 w-3" />}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col py-1">
                      <b className="truncate font-mono text-small font-semibold">{o.name}</b>
                      <span className="truncate text-label text-muted">{o.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
