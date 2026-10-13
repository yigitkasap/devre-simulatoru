// Yüklenen örneğin açıklama kartı: kurulum, tahmin sorusu ve simülasyon çalışınca açılan cevap.

import type { ExampleId } from '../examples';
import { tr } from '../i18n/tr';
import { Icon } from './icons';
import { Rich } from './Rich';

export function ExampleCard({
  id,
  revealed,
  collapsed,
  onCollapsed,
  onClose,
}: {
  id: ExampleId;
  revealed: boolean;
  /** Küçültülmüş kart yalnızca başlığı gösterir (devreyi sığdırırken bilinsin diye durum yukarıdadır). */
  collapsed: boolean;
  onCollapsed: (collapsed: boolean) => void;
  onClose: () => void;
}) {
  const texts = tr.examples.texts[id];
  return (
    <aside
      className="absolute top-2 left-2 z-10 w-[min(22rem,calc(100%-1rem))] rounded-lg border border-line bg-panel/95 text-sm shadow-lg"
      aria-label={texts.title}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => onCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? tr.examples.expand : tr.examples.collapse}
          title={collapsed ? tr.examples.expand : tr.examples.collapse}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Icon name="chevron" className={`h-4 w-4 shrink-0 text-muted transition-transform ${collapsed ? '' : 'rotate-90'}`} />
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">{tr.examples.badge}</span>
          <span className="truncate font-semibold">{texts.title}</span>
        </button>
        <button type="button" onClick={onClose} className="rounded p-1 text-muted hover:bg-app" aria-label={tr.examples.close}>
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {!collapsed && (
        <div className="space-y-2 border-t border-line px-3 py-2.5 text-xs leading-relaxed">
          <p>
            <Rich text={texts.description} />
          </p>
          <div className="rounded-md bg-[#fff8e6] px-2.5 py-2">
            <p className="font-semibold text-warn">{tr.examples.predict}</p>
            <p className="mt-0.5">
              <Rich text={texts.question} />
            </p>
          </div>
          <div className={`rounded-md px-2.5 py-2 ${revealed ? 'bg-[#e9f7ef]' : 'bg-app'}`} aria-live="polite">
            <p className={`font-semibold ${revealed ? 'text-[#1f7a45]' : 'text-muted'}`}>{tr.examples.answer}</p>
            <p className={`mt-0.5 ${revealed ? '' : 'text-muted italic'}`}>
              {revealed ? <Rich text={texts.answer} /> : tr.examples.answerHidden}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
