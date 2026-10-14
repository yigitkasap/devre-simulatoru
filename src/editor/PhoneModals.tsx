// Telefonda karartmalı (modal) sayfalar (tasarım: P13, P14): Dosya ve paylaşım, ⋯ (görünüm, paylaş,
// ayarlar) ve Ölç kipinde "Düzenlemek için durdurulsun mu?" sorusu. Odak içeride başlar, Esc ve
// karartmaya dokunmak kapatır, kapanınca odak açan düğmeye döner.

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import type { SaveState } from './autosave';
import { Icon, type IconName } from './icons';
import type { Settings } from './settings';
import { PhoneHelp } from './HelpDialog';
import { SettingsFields } from './TopBar';

function ModalSheet({ label, top, onClose, children }: { label: string; top: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, [href], input, textarea')?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div className="fixed inset-0 z-50">
      <div className="scrim-in absolute inset-0 bg-ink/40" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="sheet-in absolute inset-x-0 bottom-0 flex flex-col rounded-t-xl bg-panel shadow-[0_-4px_18px_rgba(29,39,51,0.2)]"
        style={{ top: `calc(${top}px + env(safe-area-inset-top))` }}
      >
        <button type="button" onClick={onClose} aria-label={tr.phone.close} className="flex h-[30px] w-full shrink-0 items-center justify-center rounded-t-xl" tabIndex={-1}>
          <i className="block h-[5px] w-9 rounded-[3px] bg-line-2" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}

function MenuItem({ icon, label, note, onClick, expanded, accent = false }: { icon: IconName; label: string; note?: string; onClick: () => void; expanded?: boolean; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className={`flex min-h-[52px] w-full items-center gap-3 border-b border-app py-2 text-left text-[15px] font-medium ${accent ? 'text-accent-ink' : 'text-ink'}`}
    >
      <Icon name={icon} className="h-5 w-5 shrink-0" />
      <span>
        {label}
        {note && <span className="block text-[13px] font-normal text-muted">{note}</span>}
      </span>
    </button>
  );
}

// --- Dosya (P13) ---------------------------------------------------------------------------

export interface FileSheetProps {
  readonly title: string;
  readonly saveState: SaveState;
  /** Paylaşım bölümü açık başlasın (⋯ → Paylaş). */
  readonly shareOpen: boolean;
  readonly shareLink: () => string;
  readonly onClose: () => void;
  readonly onExamples: () => void;
  readonly onNew: () => void;
  readonly onExport: () => void;
  readonly onImport: () => void;
}

export function FileSheet(props: FileSheetProps) {
  const [shareOpen, setShareOpen] = useState(props.shareOpen);
  const [link, setLink] = useState<string | null>(props.shareOpen ? props.shareLink() : null);
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const linkId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const canShare = typeof navigator.share === 'function';

  const toggleShare = () => {
    if (!shareOpen && link === null) setLink(props.shareLink());
    setShareOpen((o) => !o);
  };
  const doCopy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopy('copied');
    } catch {
      // Panoya yazılamadı: bağlantı seçili kalsın, elle kopyalansın.
      areaRef.current?.focus();
      areaRef.current?.setSelectionRange(0, link.length);
      setCopy('failed');
    }
  };

  return (
    <ModalSheet label={tr.phone.fileTitle} top={150} onClose={props.onClose}>
      <div className="flex shrink-0 items-center justify-between pr-2 pb-1 pl-4">
        <div className="flex min-w-0 flex-col">
          <b className="truncate text-[18px] font-semibold">{props.title}</b>
          <span className={`text-[12.5px] ${props.saveState === 'failed' ? 'text-warn' : 'text-ok'}`}>
            {props.saveState === 'failed' ? tr.phone.notSaved : tr.phone.autosaved}
          </span>
        </div>
        <button type="button" onClick={props.onClose} aria-label={tr.phone.close} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-muted active:bg-app">
          <Icon name="close" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        <MenuItem icon="book" label={tr.examples.button} onClick={props.onExamples} />
        <MenuItem icon="fileNew" label={tr.file.newCircuit} note={tr.phone.newNote} onClick={props.onNew} />
        <div className={shareOpen ? 'border-b border-app pb-3.5' : ''}>
          <MenuItem icon="share" label={tr.phone.shareLink} onClick={toggleShare} expanded={shareOpen} accent={shareOpen} />
          {shareOpen && link && (
            <div className="-mt-1 flex flex-col gap-2 pl-8">
              <span className="text-[13.5px] leading-normal text-ink-2">{tr.shareDialog.description}</span>
              <textarea
                id={linkId}
                ref={areaRef}
                readOnly
                rows={3}
                value={link}
                aria-label={tr.phone.shareLink}
                onFocus={(e) => e.target.setSelectionRange(0, e.target.value.length)}
                className="w-full resize-none rounded-[10px] border border-line-2 bg-panel-2 px-2.5 py-2 font-mono text-base leading-snug break-all text-ink"
              />
              <span className="font-mono text-[12.5px] text-muted" role="status">
                {copy === 'failed' ? tr.shareDialog.copyFailed : copy === 'copied' ? tr.shareDialog.copied : tr.shareDialog.length(link.length)}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={doCopy} className="h-12 flex-1 rounded-xl bg-accent text-[15px] font-semibold text-white active:brightness-110">
                  {copy === 'copied' ? tr.shareDialog.copied : tr.shareDialog.copy}
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={() => void navigator.share({ title: props.title, url: link }).catch(() => {})}
                    className="h-12 flex-1 rounded-xl border border-line-2 bg-panel text-[15px] font-medium"
                  >
                    {tr.phone.shareSystem}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <MenuItem icon="download" label={tr.file.exportJson} onClick={props.onExport} />
        <MenuItem icon="upload" label={tr.file.importJson} onClick={props.onImport} />
      </div>
    </ModalSheet>
  );
}

// --- ⋯ Daha fazla (P14) --------------------------------------------------------------------

export interface MoreSheetProps {
  readonly settings: Settings;
  readonly onSettings: (patch: Partial<Settings>) => void;
  readonly onClose: () => void;
  readonly onFit: () => void;
  readonly onShare: () => void;
  readonly onTour: () => void;
  readonly onWelcome: () => void;
}

export function MoreSheet({ settings, onSettings, onClose, onFit, onShare, onTour, onWelcome }: MoreSheetProps) {
  const [tab, setTab] = useState<'help' | 'settings'>('help');
  const quick: Array<{ icon: IconName; label: string; run: () => void; pressed?: boolean }> = [
    { icon: 'fit', label: tr.phone.fit, run: onFit },
    { icon: 'measure', label: tr.phone.nodeVoltages, run: () => onSettings({ nodeVoltages: !settings.nodeVoltages }), pressed: settings.nodeVoltages },
    { icon: 'share', label: tr.phone.share, run: onShare },
  ];
  return (
    <ModalSheet label={tr.phone.moreTitle} top={118} onClose={onClose}>
      <div className="flex shrink-0 flex-col gap-3 px-4">
        <div className="flex gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={q.run}
              aria-pressed={q.pressed}
              className={`flex h-[72px] min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-[13px] font-medium ${
                q.pressed ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel-2 active:bg-app'
              }`}
            >
              <Icon name={q.icon} className="h-[22px] w-[22px]" />
              <span className="max-w-full truncate">{q.label}</span>
            </button>
          ))}
        </div>
        <div role="tablist" aria-label={tr.phone.moreTitle} className="flex gap-0.5 rounded-[10px] bg-app p-0.5">
          {(['help', 'settings'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-11 flex-1 rounded-lg text-sm font-semibold ${tab === t ? 'bg-panel text-ink shadow-sm' : 'text-ink-2'}`}
            >
              {t === 'help' ? tr.help.title : tr.settings.title}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-1" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        {tab === 'help' ? (
          <PhoneHelp onTour={onTour} />
        ) : (
          <div className="pt-3">
            <SettingsFields settings={settings} onChange={onSettings} touch onWelcome={onWelcome} />
          </div>
        )}
      </div>
    </ModalSheet>
  );
}

// --- Ölç kipinde düzenleme girişimi ----------------------------------------------------------

export function StopToEditDialog({ onStop, onCancel }: { onStop: () => void; onCancel: () => void }) {
  const titleId = useId();
  return (
    <div className="fixed inset-0 z-50">
      <div className="scrim-in absolute inset-0 bg-ink/40" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-in absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-xl bg-panel px-4 pt-5 shadow-[0_-4px_18px_rgba(29,39,51,0.2)]"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      >
        <h2 id={titleId} className="text-[18px] font-semibold">
          {tr.phone.stopToEdit}
        </h2>
        <p className="text-[14.5px] leading-normal text-ink-2">{tr.phone.stopToEditText}</p>
        <button type="button" autoFocus onClick={onStop} className="h-12 rounded-xl bg-ink text-[15px] font-semibold text-white active:brightness-125">
          {tr.phone.stopAndEdit}
        </button>
        <button type="button" onClick={onCancel} className="h-12 rounded-xl border border-line-2 bg-panel text-[15px] font-medium">
          {tr.phone.cancel}
        </button>
      </div>
    </div>
  );
}
