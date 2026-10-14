// Telefonda üst şerit (tasarım: C-TelUst): devrenin adı ve kayıt durumu (dokununca Dosya sayfası), kip
// rozeti (Kur, Bağla, Ölç + zaman, Duraklatıldı), sorun sayısı ve ⋯. Üst şerit yalnızca bilgi verir;
// eylemler alttaki çubukta.

import { tr } from '../i18n/tr';
import { formatSI } from '../sim/units';
import type { SaveState } from './autosave';
import { Icon } from './icons';

export type PhoneMode = 'kur' | 'bagla' | 'olc' | 'pause';

export interface PhoneTopStripProps {
  readonly title: string;
  readonly saveState: SaveState;
  readonly mode: PhoneMode;
  /** Simülasyon zamanı (s). */
  readonly time: number;
  readonly errors: number;
  readonly warnings: number;
  /** Sorun sayısı gösterilsin mi (simülasyon çalışırken ya da başlayamayınca). */
  readonly showIssues: boolean;
  readonly moreOpen: boolean;
  readonly onFile: () => void;
  readonly onIssues: () => void;
  readonly onMore: () => void;
}

const CHIP: Record<PhoneMode, string> = {
  kur: 'bg-app text-ink-2',
  bagla: 'bg-accent-soft text-accent-ink',
  olc: 'bg-ok-soft text-ok-ink',
  pause: 'bg-warn-soft text-warn',
};

/** Sitenin simgesi: koyu kare üzerinde turuncu dalga. */
function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 44 44" aria-hidden="true" className="shrink-0">
      <rect width="44" height="44" rx="9" fill="#1d2733" />
      <path d="M8 22c3.5-10 7-10 10.5 0s7 10 10.5 0 5-8 7-6" fill="none" stroke="#f05a28" strokeWidth="3.6" strokeLinecap="round" />
    </svg>
  );
}

export function PhoneTopStrip(props: PhoneTopStripProps) {
  const { mode } = props;
  const count = props.errors + props.warnings;
  const timed = mode === 'olc' || mode === 'pause';
  return (
    <header className="shrink-0 border-b border-line bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <h1 className="sr-only">{tr.site.name}</h1>
      <div className="flex h-[52px] items-center gap-1.5 pr-1 pl-2">
        <button
          type="button"
          onClick={props.onFile}
          aria-haspopup="dialog"
          aria-label={tr.phone.fileButton(props.title)}
          className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] pr-1.5 pl-0.5 text-left active:bg-app"
        >
          <Logo />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] leading-5 font-semibold">{props.title}</span>
            <span className={`text-[11px] leading-4 whitespace-nowrap ${props.saveState === 'failed' ? 'text-warn' : 'text-muted'}`}>
              {props.saveState === 'failed' ? tr.toolbar.saveFailed : tr.toolbar.saved}
            </span>
          </span>
          <Icon name="chevronDown" className="h-4 w-4 shrink-0" />
        </button>
        <span
          role="status"
          aria-label={`${tr.phone.modeLabel(tr.phone.modes[mode])}${timed ? `, ${formatSI(props.time, 's', { digits: 3 })}` : ''}`}
          className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-label font-semibold whitespace-nowrap ${CHIP[mode]}`}
        >
          {mode === 'olc' && <i className="block h-2 w-2 rounded-full bg-ok" aria-hidden="true" />}
          {mode === 'pause' && (
            <svg width="8" height="9" viewBox="0 0 8 9" aria-hidden="true">
              <rect x="0" y="0" width="3" height="9" fill="var(--color-paused)" />
              <rect x="5" y="0" width="3" height="9" fill="var(--color-paused)" />
            </svg>
          )}
          <span aria-hidden="true">{tr.phone.modes[mode]}</span>
          {timed && (
            <span className="font-mono font-medium tabular" aria-hidden="true">
              {formatSI(props.time, 's', { digits: 3 })}
            </span>
          )}
        </span>
        {props.showIssues && count > 0 && (
          <button
            type="button"
            onClick={props.onIssues}
            aria-label={tr.phone.issues(count)}
            className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] px-1.5 active:bg-app"
          >
            <span
              className={`flex h-[26px] items-center gap-1 rounded-full px-2 font-mono text-label font-semibold text-white ${
                props.errors > 0 ? 'bg-danger' : 'bg-warn'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 4v7" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                <circle cx="10" cy="15.5" r="1.8" fill="#fff" />
              </svg>
              {count}
            </span>
          </button>
        )}
        <button
          type="button"
          onClick={props.onMore}
          aria-haspopup="dialog"
          aria-expanded={props.moreOpen}
          aria-label={tr.phone.more}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${props.moreOpen ? 'bg-accent-soft' : 'active:bg-app'}`}
        >
          <Icon name="more" className="h-[22px] w-[22px]" />
        </button>
      </div>
    </header>
  );
}

/**
 * Yatay telefonda yan panelin başlığı (tasarım: L01): devrenin adı ▾ ve altında kip (Ölç · zaman),
 * sorun sayısı ve ⋯. Üst şerit yoktur; bu başlık onun yerini tutar.
 */
export function PhoneSideHeader(props: PhoneTopStripProps) {
  const { mode } = props;
  const count = props.errors + props.warnings;
  const timed = mode === 'olc' || mode === 'pause';
  const tone = mode === 'olc' ? 'text-ok-ink' : mode === 'pause' ? 'text-warn' : mode === 'bagla' ? 'text-accent-ink' : 'text-muted';
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-1 border-b border-line pr-1 pl-3">
      <h1 className="sr-only">{tr.site.name}</h1>
      <button
        type="button"
        onClick={props.onFile}
        aria-haspopup="dialog"
        aria-label={tr.phone.fileButton(props.title)}
        className="flex h-11 min-w-0 flex-1 flex-col justify-center rounded-[10px] text-left active:bg-app"
      >
        <b className="flex min-w-0 items-center gap-1 text-[14.5px] leading-5 font-semibold">
          <span className="truncate">{props.title}</span>
          <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0" />
        </b>
        <span className={`flex items-center gap-1.5 text-[11.5px] leading-4 ${tone}`}>
          {mode === 'olc' && <i className="block h-[7px] w-[7px] rounded-full bg-ok" aria-hidden="true" />}
          {tr.phone.modes[mode]}
          {timed && <span className="font-mono tabular">· {formatSI(props.time, 's', { digits: 3 })}</span>}
        </span>
      </button>
      <span role="status" className="sr-only">
        {tr.phone.modeLabel(tr.phone.modes[mode])}
      </span>
      {props.showIssues && count > 0 && (
        <button
          type="button"
          onClick={props.onIssues}
          aria-label={tr.phone.issues(count)}
          className="flex h-11 min-w-11 shrink-0 items-center justify-center rounded-[10px] active:bg-app"
        >
          <span className={`flex h-6 items-center rounded-full px-2 font-mono text-label font-semibold text-white ${props.errors > 0 ? 'bg-danger' : 'bg-warn'}`}>
            !{count}
          </span>
        </button>
      )}
      <button
        type="button"
        onClick={props.onMore}
        aria-haspopup="dialog"
        aria-expanded={props.moreOpen}
        aria-label={tr.phone.more}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] ${props.moreOpen ? 'bg-accent-soft' : 'active:bg-app'}`}
      >
        <Icon name="more" className="h-[22px] w-[22px]" />
      </button>
    </div>
  );
}
