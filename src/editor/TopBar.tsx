// Üst araç çubuğu: araçlar, düzenleme, görünüm ve ayarlar.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import { Icon, type IconName } from './icons';
import type { Settings } from './settings';

export function ToolButton({
  icon,
  label,
  title,
  onClick,
  active = false,
  disabled = false,
  showLabel = false,
}: {
  icon: IconName;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm transition-colors disabled:opacity-35 ${
        active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-app'
      }`}
    >
      <Icon name={icon} className="h-[18px] w-[18px]" />
      {showLabel && <span className="hidden xl:inline">{label}</span>}
    </button>
  );
}

function Separator() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden="true" />;
}

export interface TopBarProps {
  readonly toolKind: 'select' | 'wire' | 'place';
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasSelection: boolean;
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  readonly onToggleLibrary: () => void;
  readonly onSelectTool: () => void;
  readonly onWireTool: () => void;
  readonly onRotate: () => void;
  readonly onDelete: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  /** Sağ tarafa eklenecek ek düğmeler. */
  readonly extra?: ReactNode;
  readonly onNew: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
  readonly onShare: () => void;
}

export function TopBar(props: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
      <button
        type="button"
        className="rounded-md p-1.5 hover:bg-app md:hidden"
        onClick={props.onToggleLibrary}
        aria-label={tr.toolbar.library}
        title={tr.toolbar.library}
      >
        <Icon name="menu" />
      </button>
      <div className="mr-2 flex shrink-0 items-center gap-2 pl-1">
        <img src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/favicon.svg`} alt="" className="h-6 w-6" />
        <h1 className="hidden text-sm font-semibold sm:block">{tr.site.name}</h1>
      </div>

      <FileMenu onNew={props.onNew} onExport={props.onExport} onImport={props.onImport} onShare={props.onShare} />
      <Separator />

      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
        <ToolButton
          icon="pointer"
          label={tr.toolbar.select}
          title={tr.toolbar.selectTitle}
          active={props.toolKind === 'select'}
          onClick={props.onSelectTool}
          showLabel
        />
        <ToolButton
          icon="wire"
          label={tr.toolbar.wire}
          title={tr.toolbar.wireTitle}
          active={props.toolKind === 'wire'}
          onClick={props.onWireTool}
          showLabel
        />
        <Separator />
        <ToolButton
          icon="rotate"
          label={tr.toolbar.rotate}
          title={tr.toolbar.rotateTitle}
          onClick={props.onRotate}
          disabled={!props.hasSelection && props.toolKind !== 'place'}
        />
        <ToolButton
          icon="trash"
          label={tr.toolbar.remove}
          title={tr.toolbar.removeTitle}
          onClick={props.onDelete}
          disabled={!props.hasSelection}
        />
        <Separator />
        <ToolButton icon="undo" label={tr.toolbar.undo} title={tr.toolbar.undoTitle} onClick={props.onUndo} disabled={!props.canUndo} />
        <ToolButton icon="redo" label={tr.toolbar.redo} title={tr.toolbar.redoTitle} onClick={props.onRedo} disabled={!props.canRedo} />
        {/* Telefonda iki parmakla yakınlaştırılır; yer açmak için bu düğmeler gizlenir. */}
        <div className="hidden items-center gap-0.5 sm:flex">
          <Separator />
          <ToolButton icon="zoomOut" label={tr.toolbar.zoomOut} title={tr.toolbar.zoomOut} onClick={props.onZoomOut} />
          <ToolButton icon="zoomIn" label={tr.toolbar.zoomIn} title={tr.toolbar.zoomIn} onClick={props.onZoomIn} />
          <ToolButton icon="fit" label={tr.toolbar.fit} title={tr.toolbar.fit} onClick={props.onFit} />
        </div>
        {props.extra}
      </div>

      <SettingsMenu settings={props.settings} onChange={props.onSettings} />
    </header>
  );
}

/** Açılır menülerin ortak davranışı: dışarı tıklayınca ya da Esc ile kapanır. */
function useDismiss(open: boolean, setOpen: (open: boolean) => void) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);
  return rootRef;
}

function FileMenu({
  onNew,
  onExport,
  onImport,
  onShare,
}: {
  onNew: () => void;
  onExport: () => void;
  onImport: () => void;
  onShare: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);
  const items: Array<{ label: string; action: () => void }> = [
    { label: tr.file.newCircuit, action: onNew },
    { label: tr.file.exportJson, action: onExport },
    { label: tr.file.importJson, action: onImport },
    { label: tr.file.share, action: onShare },
  ];
  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex h-8 items-center gap-1.5 rounded-md px-2 text-sm ${open ? 'bg-accent-soft text-accent' : 'hover:bg-app'}`}
      >
        <Icon name="file" className="h-[18px] w-[18px]" />
        <span className="hidden sm:inline">{tr.file.menu}</span>
      </button>
      {open && (
        <div role="menu" className="absolute top-10 left-0 z-40 w-60 rounded-lg border border-line bg-panel py-1 text-sm shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.action();
              }}
              className="block w-full px-3 py-1.5 text-left hover:bg-app"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsMenu({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useDismiss(open, setOpen);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <ToolButton icon="settings" label={tr.toolbar.settings} title={tr.toolbar.settings} onClick={() => setOpen((o) => !o)} active={open} />
      {open && (
        <div className="absolute top-10 right-0 z-40 w-60 rounded-lg border border-line bg-panel p-3 shadow-lg" role="dialog" aria-label={tr.settings.title}>
          <p className="text-xs font-semibold text-muted">{tr.settings.resistorStyle}</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['zigzag', 'iec'] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onChange({ resistorStyle: style })}
                aria-pressed={settings.resistorStyle === style}
                className={`rounded-md border px-2 py-2 text-xs ${
                  settings.resistorStyle === style ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-app'
                }`}
              >
                <svg viewBox="-44 -12 88 24" className="mx-auto mb-1 h-5 w-16" aria-hidden="true">
                  {style === 'zigzag' ? (
                    <polyline
                      points="-40,0 -24,0 -21,-7 -15,7 -9,-7 -3,7 3,-7 9,7 15,-7 21,7 24,0 40,0"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  ) : (
                    <g stroke="currentColor" strokeWidth={2} fill="none">
                      <path d="M-40,0 H-22 M22,0 H40" />
                      <rect x={-22} y={-7} width={44} height={14} />
                    </g>
                  )}
                </svg>
                {style === 'zigzag' ? tr.settings.zigzag : tr.settings.iec}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
