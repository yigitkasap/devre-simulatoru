// Cihaz rafı (tasarım: M05a, M06a–c; N01): devrede osiloskop, fonksiyon üreteci ya da DC güç kaynağı
// varken tuvalin altında açılır. Cihazlar ön panelleriyle yan yana ya da tek tek (sekmeli) gösterilir.
// Üst kenardaki tutamaçla yüksekliği değişir; küçültülünce yalnızca başlık kalır.

import { useRef, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { tr } from '../i18n/tr';
import type { Part } from '../model/types';
import type { DeviceStatus } from '../sim/devices';
import type { PropValue } from '../sim/netlist';
import { Icon } from './icons';
import { DcSupplyFace, FuncGenFace } from './InstrumentFaces';
import { Segmented } from './RackControls';
import { ScopeFace } from './ScopeFace';
import type { ScopeView } from './scopeView';
import { TankFace } from './TankControls';

export type RackLayout = 'side' | 'single';

/** Rafın başlığı (px); küçültülünce yalnızca bu kalır. */
export const RACK_HEADER = 40;

export interface DeviceRackProps {
  readonly devices: readonly Part[];
  readonly layout: RackLayout;
  readonly onLayout: (layout: RackLayout) => void;
  /** Tek tek düzeninde gösterilen cihaz. */
  readonly activeId: string;
  readonly onActive: (id: string) => void;
  readonly collapsed: boolean;
  readonly onCollapsed: (collapsed: boolean) => void;
  /** Rafın toplam yüksekliği (px; başlık dahil). */
  readonly height: number;
  /** Tutamaçla sürüklenince yeni yükseklik (px). */
  readonly onResize: (height: number) => void;
  /** Sürükleme bitti (devre kalan alana sığdırılsın). */
  readonly onResizeEnd: () => void;
  readonly scopeView: (id: string) => ScopeView | null;
  readonly status: (id: string) => DeviceStatus;
  readonly running: boolean;
  readonly pinConnected: (id: string, pin: number) => boolean;
  readonly onChange: (id: string, patch: Record<string, PropValue>) => void;
  readonly onAuto: (id: string) => void;
  readonly onJack: (id: string, pin: number) => void;
}

const NAMES: Partial<Record<Part['type'], () => string>> = {
  oscilloscope: () => tr.scope.title,
  funcgen: () => tr.rack.funcgen,
  dcsupply: () => tr.rack.dcsupply,
  tank: () => tr.rack.tank,
};

export function DeviceRack(props: DeviceRackProps) {
  const { devices, layout, collapsed, height } = props;
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const single = layout === 'single' || devices.length === 1;
  const active = devices.find((d) => d.id === props.activeId) ?? devices[0]!;
  const bodyHeight = Math.max(0, height - RACK_HEADER);
  // Ekran yüksekliği rafın yüksekliğine göre (M05a: 192, M06b: 212, M06a: 272).
  const screenHeight = bodyHeight >= 420 ? 272 : bodyHeight >= 330 ? 212 : 192;

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: height };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (d) props.onResize(d.startHeight + (d.startY - e.clientY));
  };
  const onHandleUp = () => {
    if (dragRef.current) props.onResizeEnd();
    dragRef.current = null;
  };
  const onHandleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowUp' ? 24 : e.key === 'ArrowDown' ? -24 : 0;
    if (step === 0) return;
    e.preventDefault();
    props.onResize(height + step);
    props.onResizeEnd();
  };

  const face = (part: Part, sideBySide: boolean) => {
    const common = {
      onChange: (patch: Record<string, PropValue>) => props.onChange(part.id, patch),
      onJack: (pin: number) => props.onJack(part.id, pin),
    };
    if (part.type === 'oscilloscope') {
      return (
        <ScopeFace
          key={part.id}
          {...common}
          part={part}
          view={props.scopeView(part.id)}
          connected={[props.pinConnected(part.id, 0), props.pinConnected(part.id, 1)]}
          screenHeight={screenHeight}
          onAuto={() => props.onAuto(part.id)}
          className={sideBySide ? 'shrink-0' : 'flex-1'}
          style={sideBySide ? { width: Math.round((screenHeight * 5) / 4) + 400 } : undefined}
        />
      );
    }
    if (part.type === 'funcgen') {
      return <FuncGenFace key={part.id} {...common} part={part} className={sideBySide ? 'min-w-[260px] flex-1' : 'w-full max-w-[460px]'} />;
    }
    if (part.type === 'tank') {
      return (
        <TankFace
          key={part.id}
          {...common}
          part={part}
          status={props.status(part.id)}
          running={props.running}
          className={sideBySide ? 'w-[300px] shrink-0' : 'w-full max-w-[440px]'}
        />
      );
    }
    return (
      <DcSupplyFace
        key={part.id}
        {...common}
        part={part}
        status={props.status(part.id)}
        running={props.running}
        connected={[
          props.pinConnected(part.id, 0) || props.pinConnected(part.id, 1),
          props.pinConnected(part.id, 2) || props.pinConnected(part.id, 3),
        ]}
        className={sideBySide ? 'w-[252px] shrink-0' : 'w-full max-w-[440px]'}
      />
    );
  };

  return (
    <section
      aria-label={tr.rack.title}
      className="relative flex shrink-0 flex-col border-t border-rack-line bg-rack"
      style={{ height: collapsed ? RACK_HEADER : height }}
    >
      {!collapsed && (
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={tr.rack.resize}
          aria-valuenow={Math.round(height)}
          tabIndex={0}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
          onKeyDown={onHandleKey}
          className="absolute inset-x-0 -top-1.5 z-10 flex h-3 cursor-row-resize justify-center outline-none focus-visible:bg-accent/20"
        >
          <span className="mt-1 h-1 w-10 rounded-full bg-rack-line" aria-hidden="true" />
        </div>
      )}
      <div className="flex h-10 shrink-0 items-center gap-2 pr-2 pl-3">
        <b className="text-small font-semibold">{tr.rack.title}</b>
        {single && devices.length > 1 ? (
          <div role="tablist" aria-label={tr.rack.title} className="flex min-w-0 gap-1 overflow-x-auto">
            {devices.map((d) => {
              const selected = d.id === active.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    props.onActive(d.id);
                    if (collapsed) props.onCollapsed(false);
                  }}
                  className={`h-[30px] shrink-0 rounded-[7px] border px-2.5 text-small font-medium whitespace-nowrap ${
                    selected ? 'border-stopped bg-panel text-ink' : 'border-transparent text-ink-2 hover:bg-panel/50'
                  }`}
                >
                  {d.label} · {NAMES[d.type]?.()}
                </button>
              );
            })}
          </div>
        ) : devices.length === 1 ? (
          <span className="h-[30px] rounded-[7px] border border-stopped bg-panel px-2.5 text-small leading-7 font-medium">
            {active.label} · {NAMES[active.type]?.()}
          </span>
        ) : (
          <span className="text-label text-muted">{tr.rack.countSide(devices.length)}</span>
        )}
        <span className="flex-1" />
        {devices.length > 1 && (
          <Segmented<RackLayout>
            label={tr.rack.layout}
            className="w-[180px]"
            options={[
              { value: 'side', text: tr.rack.side },
              { value: 'single', text: tr.rack.single },
            ]}
            value={layout}
            onChange={props.onLayout}
          />
        )}
        <button
          type="button"
          onClick={() => props.onCollapsed(!collapsed)}
          aria-label={collapsed ? tr.rack.expand : tr.rack.collapse}
          aria-expanded={!collapsed}
          title={collapsed ? tr.rack.expand : tr.rack.collapse}
          className="flex h-9 w-9 items-center justify-center rounded-md text-ink hover:bg-panel/50"
        >
          <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} />
        </button>
      </div>
      {!collapsed && (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto overscroll-contain px-3 pb-3">
          {single ? face(active, false) : devices.map((d) => face(d, true))}
        </div>
      )}
    </section>
  );
}
