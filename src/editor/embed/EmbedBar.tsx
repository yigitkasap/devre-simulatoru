// Gömülü sade görünümün ince üst şeridi (N8): simge, devrenin adı, "Salt okunur"; sağda Başa al,
// Oynat / Duraklat ve "Simülatörde aç" (yeni sekmede tam uygulama).

import { tr } from '../../i18n/tr';
import type { SimStatus } from '../useSimulation';
import { Icon } from '../icons';
import { Logo } from '../TopBar';
import { useTouchUi } from '../touchUi';

export function EmbedBar({
  title,
  readOnly,
  controls,
  openHref,
  status,
  onPlay,
  onPause,
  onReset,
}: {
  title: string;
  readOnly: boolean;
  /** Oynat ve Başa al gösterilsin mi. */
  controls: boolean;
  /** "Simülatörde aç" bağlantısı (yoksa gösterilmez). */
  openHref: string | null;
  status: SimStatus;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
}) {
  const touch = useTouchUi();
  const running = status === 'running';
  const h = touch ? 'h-11 min-w-11 justify-center' : 'h-9';
  return (
    <header aria-label={tr.embed.barLabel} className="flex shrink-0 items-center gap-2.5 border-b border-line bg-panel py-1.5 pr-2 pl-3 max-[480px]:gap-1.5 max-[480px]:pr-1 max-[480px]:pl-2.5">
      <span className="flex shrink-0 [&_svg]:h-6 [&_svg]:w-6">
        <Logo />
      </span>
      <h1 className="m-0 min-w-0 truncate text-small font-semibold">{title}</h1>
      {readOnly && (
        <span title={tr.embed.readOnlyBadge} className="flex shrink-0 items-center gap-1 rounded-full bg-app px-2 py-0.5 text-label text-muted">
          <Icon name="lock" className="h-3 w-3" />
          {/* Dar çerçevede yalnız kilit: devrenin adına yer kalsın. */}
          <span className="max-[480px]:sr-only">{tr.embed.readOnlyBadge}</span>
        </span>
      )}
      <span className="flex-1" />
      {controls && (
        <>
          <button type="button" onClick={onReset} aria-label={tr.embed.reset} className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-small text-ink-2 hover:bg-app ${h}`}>
            <Icon name="restart" className="h-4 w-4" />
            <span aria-hidden="true" className="max-[420px]:hidden">
              {tr.embed.reset}
            </span>
          </button>
          <button
            type="button"
            onClick={running ? onPause : onPlay}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-small font-semibold hover:brightness-110 ${running ? 'bg-ink text-on-ink' : 'bg-ok text-white'} ${h}`}
          >
            <Icon name={running ? 'pause' : 'play'} className="h-4 w-4" />
            {running ? tr.sim.pause : tr.sim.play}
          </button>
        </>
      )}
      {openHref && (
        <a
          href={openHref}
          target="_blank"
          rel="noopener"
          aria-label={tr.embed.open}
          title={tr.embed.open}
          className={`flex shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}
        >
          <Icon name="external" className="h-[18px] w-[18px]" />
        </a>
      )}
    </header>
  );
}
