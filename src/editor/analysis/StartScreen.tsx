// Analizin başlangıç ekranı (analiz v2): "Ne çizmek istiyorsun?" ve üç bölüm. Föydeki grafikler (açık
// örnek föydeyse o şeklin adımlarına bağlı hazır grafikler), "Bu devre için" (devredeki parçalara göre en
// çok üç öneri) ve "Kendin kur" (zamana göre, bir değeri tarayarak, frekansa göre, parçanın
// karakteristiği). Boş grafik hiç açılmaz: zamana göre grafik büyüklükler seçilince çizilir.

import { useMemo, useState, type ReactNode } from 'react';
import { tr } from '../../i18n/tr';
import { Icon, type IconName } from '../icons';
import { QuantityPicker } from './QuantityPicker';
import type { QuantityOption } from './quantities';
import { suggestions, type Suggestion } from './suggest';
import type { AnalysisApi } from './useAnalysis';

/** Föy grafiğinin başlangıç ekranındaki kartı (i18n/foyGraphs). */
export interface FoyCard {
  readonly key: string;
  /** Üst yazı: "ADIM 2–3 · ÇIKIŞ KARAKTERİSTİĞİ". */
  readonly eyebrow: string;
  readonly title: string;
  /** Alt satır: taranan ve basamak değerleri. */
  readonly detail: string;
  readonly icon: IconName;
  readonly open: () => void;
}

export interface FoySection {
  readonly heading: string;
  readonly cards: readonly FoyCard[];
}

type Mode = 'home' | 'time' | 'curve';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-label font-semibold tracking-[0.04em] text-muted uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Card({ icon, eyebrow, title, detail, badge, foy = false, onClick, touch }: { icon: IconName; eyebrow?: string; title: string; detail: string; badge?: string; foy?: boolean; onClick: () => void; touch: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left ${foy ? 'border-accent-line bg-accent-soft hover:brightness-[0.98]' : 'border-line bg-panel hover:bg-panel-2'} ${touch ? 'min-h-[64px]' : 'min-h-[60px]'}`}
    >
      <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${foy ? 'bg-panel text-accent-ink' : 'bg-panel-2 text-ink-2'}`}>
        <Icon name={icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {eyebrow && <span className="font-mono text-[10.5px] font-semibold tracking-[0.06em] text-accent-ink uppercase">{eyebrow}</span>}
        <span className="flex items-center gap-1.5">
          <b className="min-w-0 text-small font-semibold text-ink">{title}</b>
          {badge && <span className="shrink-0 rounded-full bg-accent px-1.5 text-[10.5px] font-semibold text-white">{badge}</span>}
        </span>
        <span className="text-label leading-snug text-muted">{detail}</span>
      </span>
    </button>
  );
}

export function StartScreen({ api, foy, touch, phone = false }: { api: AnalysisApi; foy: FoySection | null; touch: boolean; phone?: boolean }) {
  const t = tr.analysis.start;
  const [mode, setMode] = useState<Mode>('home');
  const [chosen, setChosen] = useState<readonly QuantityOption[]>([]);
  const offers = useMemo(() => suggestions(api.circuit), [api.circuit]);
  const curveParts = api.tracer.candidates;
  const allowed = (s: Suggestion) => (s.plan.kind === 'time' ? !api.traceGate : !api.gate);

  const run = (s: Suggestion) => {
    if (s.plan.kind === 'time') api.openTimeGraph(s.plan.traces);
    else if (s.plan.kind === 'bode') api.openGraph({ kind: 'bode' });
    else api.openGraph({ kind: 'curve', part: s.plan.part });
  };
  const btn = `flex items-center justify-center gap-1.5 rounded-md px-3 text-small font-semibold ${touch ? 'h-11' : 'h-9'}`;

  if (mode === 'time') {
    const keys = new Set(chosen.map((o) => o.key));
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode('home')} className={`${btn} border border-line bg-panel text-ink hover:bg-panel-2`}>
            <Icon name="chevron" className="h-4 w-4 rotate-180" />
            {t.back}
          </button>
          <h3 className="m-0 min-w-0 flex-1 truncate text-small font-semibold">{t.timeTitle}</h3>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={() => api.openTimeGraph(chosen.map((o) => o.quantity))}
            className={`${btn} bg-accent text-white hover:brightness-105 disabled:opacity-50`}
          >
            <Icon name="chart" className="h-4 w-4" />
            {t.draw(chosen.length)}
          </button>
        </div>
        <QuantityPicker
          options={api.quantities}
          selected={keys}
          onToggle={(o) => setChosen((c) => (c.some((x) => x.key === o.key) ? c.filter((x) => x.key !== o.key) : [...c, o]))}
          onFromSchematic={() => {
            setMode('home');
            api.startPick();
          }}
          touch={touch}
          autoFocus={!touch}
        />
      </div>
    );
  }

  if (mode === 'curve') {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMode('home')} className={`${btn} border border-line bg-panel text-ink hover:bg-panel-2`}>
            <Icon name="chevron" className="h-4 w-4 rotate-180" />
            {t.back}
          </button>
          <h3 className="m-0 min-w-0 flex-1 truncate text-small font-semibold">{t.curveTitle}</h3>
        </div>
        <div className={`grid gap-2 ${phone ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))]'}`}>
          {curveParts.map((p) => (
            <button key={p.id} type="button" onClick={() => api.openGraph({ kind: 'curve', part: p.id })} className={`${btn} justify-start border border-line bg-panel text-ink hover:bg-panel-2`}>
              <Icon name="curve" className="h-4 w-4 text-muted" />
              <span className="truncate">{`${p.label} · ${tr.devices.names[p.type]}`}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const shownOffers = offers.filter(allowed);
  const custom: { key: string; icon: IconName; title: string; text: string; badge?: string; open: () => void; hidden: boolean }[] = [
    { key: 'time', icon: 'chart', ...t.cards.time, open: () => setMode('time'), hidden: Boolean(api.traceGate) },
    { key: 'bode', icon: 'bode', ...t.cards.bode, open: () => api.openGraph({ kind: 'bode' }), hidden: Boolean(api.gate) },
    {
      key: 'curve',
      icon: 'curve',
      ...t.cards.curve,
      open: () => (curveParts.length === 1 ? api.openGraph({ kind: 'curve', part: curveParts[0]!.id }) : setMode('curve')),
      hidden: Boolean(api.gate) || curveParts.length === 0,
    },
  ];
  const cols = phone ? 'grid-cols-1' : 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]';
  return (
    <div className="flex flex-col gap-4">
      <h2 className={`m-0 font-semibold ${phone ? 'text-[17px]' : 'text-[16px]'}`}>{t.title}</h2>
      {foy && foy.cards.length > 0 && (
        <Section title={foy.heading}>
          <div className={`grid gap-2 ${cols}`}>
            {foy.cards.map((c) => (
              <Card key={c.key} foy icon={c.icon} eyebrow={c.eyebrow} title={c.title} detail={c.detail} onClick={c.open} touch={touch} />
            ))}
          </div>
        </Section>
      )}
      {shownOffers.length > 0 && (
        <Section title={t.suggest}>
          <div className={`grid gap-2 ${cols}`}>
            {shownOffers.map((s) => (
              <Card key={s.key} icon={s.icon} title={s.title} detail={s.detail} onClick={() => run(s)} touch={touch} />
            ))}
          </div>
        </Section>
      )}
      <Section title={t.custom}>
        <div className={`grid gap-2 ${phone ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fill,minmax(200px,1fr))]'}`}>
          {custom
            .filter((c) => !c.hidden)
            .map((c) => (
              <Card key={c.key} icon={c.icon} title={c.title} detail={c.text} {...(c.badge ? { badge: c.badge } : {})} onClick={c.open} touch={touch} />
            ))}
        </div>
      </Section>
      {(api.gate || api.traceGate) && <p className="m-0 text-small leading-snug text-ink-2">{api.gate ?? api.traceGate}</p>}
    </div>
  );
}
