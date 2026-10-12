// Parça bilgi kartı (yalnızca masaüstü): kütüphanede üzerine gelinen ya da yerleştirilmekte olan
// parçanın sembolü, adı ve tek cümlelik açıklaması tuvalin sağ altında gösterilir.

import { tr } from '../i18n/tr';
import type { DeviceType } from '../sim/netlist';
import type { ResistorStyle } from './settings';
import { SymbolIcon } from './symbols';

export function PartInfo({ type, resistorStyle }: { type: DeviceType; resistorStyle: ResistorStyle }) {
  return (
    <aside
      className="pointer-events-none absolute right-2 bottom-10 z-10 hidden w-60 rounded-lg border border-line bg-panel/95 p-3 shadow-md md:block"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-20 shrink-0 items-center justify-center rounded-md bg-paper">
          <SymbolIcon type={type} resistorStyle={resistorStyle} className="h-10 w-16" />
        </div>
        <p className="text-sm font-semibold">{tr.devices.names[type]}</p>
      </div>
      <p className="mt-2 text-xs leading-snug text-muted">{tr.devices.descriptions[type]}</p>
      <p className="mt-1.5 text-[11px] text-muted">{tr.library.hint}</p>
    </aside>
  );
}
