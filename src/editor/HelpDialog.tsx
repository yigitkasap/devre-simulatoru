// Yardım (tasarım: M12, P14). Masaüstünde ve tablette dört sekmeli pencere: klavye kısayolları, fare ve
// dokunma, simgeler ve renkler, laboratuvar ipuçları; "Kısa turu başlat" ve Esc ile kapanır. Telefonda
// ⋯ sayfasının Yardım sekmesinde kiplere göre dokunma hareketleri.

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { tr } from '../i18n/tr';
import type { WireScale } from './colors';
import { CURRENT_DOT_COLOR, CURRENT_DOT_EDGE, UNKNOWN_WIRE_COLOR, voltageGradient } from './colors';
import { Kbd } from './HintStrip';
import { Icon } from './icons';
import { Rich } from './Rich';

type HelpTab = 'keys' | 'pointer' | 'symbols' | 'lab';
const TABS: readonly HelpTab[] = ['keys', 'pointer', 'symbols', 'lab'];

/** "Ctrl+Z" → tuş kutuları; "tekerlek" gibi sözcükler düz yazı. Seçenekler " ya da " ile ayrılır. */
function Keys({ keys }: { keys: string }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1 text-small text-muted">
      {keys.split(' ya da ').map((option, i) => (
        <span key={option} className="flex items-center gap-1">
          {i > 0 && <span>{tr.help.or}</span>}
          {(option === '+' ? ['+'] : option.split('+')).map((key, j) => (
            <span key={`${key}-${j}`} className="flex items-center gap-1">
              {j > 0 && <span>+</span>}
              {/^[a-zçğıöşü ·]+$/.test(key) && key.length > 3 ? <span>{key}</span> : <Kbd>{key}</Kbd>}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}

function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4 border-b border-app py-1.5 text-sm">
      <span className="min-w-0">{label}</span>
      {children}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="pt-4 pb-1 text-label font-semibold tracking-wide text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function KeysTab() {
  return (
    <div className="grid gap-x-12 md:grid-cols-2">
      {tr.help.keyGroups.map((group) => (
        <Group key={group.title} title={group.title}>
          {group.rows.map(([label, keys]) => (
            <Row key={label} label={label}>
              <Keys keys={keys} />
            </Row>
          ))}
        </Group>
      ))}
      <p className="pt-4 text-small text-muted md:col-span-2">{tr.help.keysNote}</p>
    </div>
  );
}

function PointerTab() {
  return (
    <div className="grid gap-x-12 md:grid-cols-2">
      {[
        { title: tr.help.mouse, rows: tr.help.mouseRows },
        { title: tr.help.touch, rows: tr.help.touchRows },
      ].map((group) => (
        <Group key={group.title} title={group.title}>
          {group.rows.map(([gesture, effect]) => (
            <Row key={gesture} label={<b className="font-semibold">{gesture}</b>}>
              <span className="text-right text-small text-ink-2">{effect}</span>
            </Row>
          ))}
        </Group>
      ))}
    </div>
  );
}

function Sample({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-24 shrink-0 items-center justify-center" aria-hidden="true">
      {children}
    </span>
  );
}

function SymbolsTab({ scale }: { scale: WireScale }) {
  const s = tr.help.symbols;
  const rows: Array<[ReactNode, string, string]> = [
    [<i key="g" className="block h-2.5 w-20 rounded-full" style={{ background: voltageGradient(scale) }} />, s.wire, s.wireText],
    [
      <svg key="u" width="80" height="10">
        <path d="M2 5H78" stroke={UNKNOWN_WIRE_COLOR} strokeWidth={3} strokeDasharray="6 5" />
      </svg>,
      s.unknown,
      s.unknownText,
    ],
    [
      <svg key="d" width="80" height="12">
        {[10, 30, 50, 70].map((cx) => (
          <circle key={cx} cx={cx} cy={6} r={3.6} fill={CURRENT_DOT_COLOR} stroke={CURRENT_DOT_EDGE} />
        ))}
      </svg>,
      s.dots,
      s.dotsText,
    ],
    [
      <svg key="e" width="22" height="22" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="var(--color-danger)" />
        <path d="M10 5.5v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="14.2" r="1.2" fill="white" />
      </svg>,
      s.error,
      s.errorText,
    ],
    [
      <svg key="w" width="22" height="22" viewBox="0 0 20 20">
        <path d="M10 1.5l9 16H1z" fill="var(--color-paused)" stroke="var(--color-warn)" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M10 7v5" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="10" cy="14.6" r="1" fill="var(--color-ink)" />
      </svg>,
      s.warning,
      s.warningText,
    ],
    [
      <svg key="p" width="20" height="20">
        <circle cx="10" cy="10" r="6" fill="var(--color-panel)" stroke="var(--color-pin)" strokeWidth={2.2} />
      </svg>,
      s.pin,
      s.pinText,
    ],
    [
      <svg key="j" width="40" height="20">
        <path d="M2 10H38M20 2V18" stroke="var(--color-symbol)" strokeWidth={2} />
        <circle cx="20" cy="10" r="3.4" fill="var(--color-symbol)" />
      </svg>,
      s.junction,
      s.junctionText,
    ],
    [<i key="s" className="block h-6 w-16 rounded-[3px] border border-dashed border-accent bg-accent-soft/60" />, s.selection, s.selectionText],
    [
      <svg key="t" width="80" height="10">
        <path d="M2 5H78" stroke="var(--color-earth)" strokeWidth={1.5} strokeDasharray="4 3" />
      </svg>,
      s.earth,
      s.earthText,
    ],
  ];
  return (
    <div className="grid gap-x-12 md:grid-cols-2">
      {rows.map(([sample, title, text]) => (
        <div key={title} className="flex items-center gap-3 border-b border-app py-2.5">
          <Sample>{sample}</Sample>
          <span className="text-sm">
            <b className="font-semibold">{title}</b>
            <span className="block text-small text-ink-2">{text}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function LabTab() {
  return (
    <ul className="grid gap-x-12 gap-y-1 pt-3 md:grid-cols-2">
      {tr.help.labTips.map(([title, text]) => (
        <li key={title} className="flex flex-col gap-0.5 border-b border-app py-2.5">
          <b className="text-sm font-semibold">{title}</b>
          <span className="text-small leading-normal text-ink-2">
            <Rich text={text} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HelpDialog({ scale, onTour, onClose }: { scale: WireScale; onTour: () => void; onClose: () => void }) {
  const titleId = useId();
  const [tab, setTab] = useState<HelpTab>('keys');
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    rootRef.current?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')?.focus();
    return () => opener?.focus?.({ preventScroll: true });
  }, []);
  const onTabKeys = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length]!;
    setTab(next);
    e.currentTarget.querySelector<HTMLElement>(`#help-tab-${next}`)?.focus();
  };
  return (
    <div className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={rootRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
          // Odak pencerenin içinde döner.
          if (e.key === 'Tab') {
            const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]') ?? [])];
            const first = items[0];
            const last = items[items.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
        className="flex h-[min(700px,calc(100dvh-2rem))] w-[min(960px,100%)] flex-col overflow-hidden rounded-2xl bg-panel shadow-[0_16px_40px_rgba(29,39,51,0.2)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-5">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-[24px] font-semibold">
              {tr.help.title}
            </h2>
            <span className="text-sm text-muted">
              {tr.help.subtitleBefore} <Kbd>?</Kbd> {tr.help.subtitleAfter}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onTour} className="h-9 rounded-lg border border-line-2 bg-panel px-3 text-sm font-medium hover:bg-panel-2">
              {tr.help.tour}
            </button>
            <button type="button" onClick={onClose} aria-label={tr.help.close} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-app">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div role="tablist" aria-label={tr.help.title} onKeyDown={onTabKeys} className="flex shrink-0 overflow-x-auto border-b border-line px-4 pt-2">
          {TABS.map((t) => (
            <button
              key={t}
              id={`help-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={t === tab}
              aria-controls="help-panel"
              tabIndex={t === tab ? 0 : -1}
              onClick={() => setTab(t)}
              className={`-mb-px h-12 shrink-0 border-b-2 px-3 text-[15px] font-medium whitespace-nowrap ${
                t === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {tr.help.tabs[t]}
            </button>
          ))}
        </div>
        <div id="help-panel" role="tabpanel" aria-labelledby={`help-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
          {tab === 'keys' && <KeysTab />}
          {tab === 'pointer' && <PointerTab />}
          {tab === 'symbols' && <SymbolsTab scale={scale} />}
          {tab === 'lab' && <LabTab />}
        </div>
      </div>
    </div>
  );
}

/** Telefonda ⋯ → Yardım (P14): kiplere göre dokunma hareketleri ve kısa tur. */
export function PhoneHelp({ onTour }: { onTour: () => void }) {
  const pill: Record<string, string> = { kur: 'bg-app text-ink-2', bagla: 'bg-accent-soft text-accent-ink', olc: 'bg-ok-soft text-ok' };
  return (
    <div className="flex flex-col">
      {tr.help.phoneGroups.map((group) => (
        <section key={group.mode} className="flex flex-col">
          <h3 className="flex items-center gap-2 pt-3 pb-0.5 text-[13px] font-semibold text-muted">
            <span className={`rounded-xs px-1.5 py-px text-[11px] font-bold tracking-wide ${pill[group.mode] ?? ''}`}>{tr.phone.modes[group.mode as 'kur'].toLocaleUpperCase('tr-TR')}</span>
            {group.title}
          </h3>
          {group.rows.map(([gesture, effect]) => (
            <div key={gesture} className="flex gap-3 border-b border-app py-2.5 text-[14.5px]">
              <b className="w-[120px] shrink-0 font-semibold">{gesture}</b>
              <span className="text-ink-2">{effect}</span>
            </div>
          ))}
        </section>
      ))}
      <button type="button" onClick={onTour} className="mt-3 h-12 rounded-xl border border-line-2 bg-panel text-[15px] font-medium">
        {tr.help.tourAgain}
      </button>
    </div>
  );
}
