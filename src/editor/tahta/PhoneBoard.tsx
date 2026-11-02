// Tahtada kur, telefon (T5): alttaki tek sayfanın içeriği. Sırasıyla: takma (parça ya da kablo takılırken:
// adım, Vazgeç, Delik adı yaz), Denetle sonucu (sorun varsa; ilk kademede yalnızca sayı ve "Nerede?"),
// sonuç (sorunsuz), parça kutusu (Tak düğmeleri, takılmamış alet kabloları, Kablo, Bağlı delikler, Denetle).
// Sürükleme yok: önce parça, sonra delikler (büyüteç BoardTop'ta).

import { useState, type ReactNode } from 'react';
import { netColors, type BreadboardPlan } from '../../bench3d/breadboard';
import { tr } from '../../i18n/tr';
import type { Build } from '../../model/build';
import type { CircuitDoc } from '../../model/types';
import type { Problem } from '../../tahta/check';
import { countWord, formatDuration, problemShort } from '../../tahta/explain';
import { isFixed } from '../../tahta/rules';
import { levelOf, sessionStats, solved, type BoardSession } from '../../tahta/session';
import { Icon } from '../icons';
import { partValueText } from '../PartView';
import { boardParts, ProblemCard, requiredLeads, terminalName, type Cabling, type Placing } from './BoardMode';

export interface PhoneBoardSheetProps {
  readonly doc: CircuitDoc;
  readonly build: Build;
  readonly schematicPlan: BreadboardPlan;
  readonly session: BoardSession | null;
  readonly buildKey: string;
  readonly placing: Placing | null;
  readonly cabling: Cabling | null;
  readonly showConnected: boolean;
  readonly onShowConnected: (on: boolean) => void;
  /** Kutudaki parçayı takmaya başla. */
  readonly onPlace: (partId: string) => void;
  readonly onLead: (part: string, pin: number) => void;
  /** Kablo aracını aç / kapat. */
  readonly onWire: () => void;
  /** Takmadan ya da kablodan vazgeç. */
  readonly onCancel: () => void;
  /** Delik adı yazarak tak; ad geçersizse false. */
  readonly onTypeHole: (text: string) => boolean;
  readonly onCheck: () => void;
  readonly onHint: (problem: Problem) => void;
  readonly cue: string | null;
  readonly onReport: () => void;
  readonly onGuide: () => void;
  readonly onReset: () => void;
}

const BUTTON = 'flex h-12 items-center justify-center gap-2 rounded-[12px] px-3 text-[15px] font-semibold';

/** Sayfanın içi kendi içinde kayar (sayfa ve ekran kaymaz); ana düğmeler altta sabit. */
function Layout({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-auto flex-col">
      <div className="flex min-h-0 flex-auto flex-col gap-3 overflow-y-auto overscroll-contain px-4 pt-1 pb-3">{children}</div>
      {footer && <div className="flex shrink-0 flex-col gap-2 border-t border-line px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">{footer}</div>}
    </div>
  );
}

export function PhoneBoardSheet(props: PhoneBoardSheetProps) {
  const { doc, build, schematicPlan, session, placing, cabling } = props;
  const d = tr.tahta.denetle;
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const parts = boardParts(doc, schematicPlan);
  const leads = requiredLeads(schematicPlan);
  const placed = parts.filter((p) => build.parts[p.id] !== undefined).length;
  const plugged = leads.filter((l) => build.leads.some((b) => b.part === l.part && b.pin === l.pin));
  const colorOf = netColors(schematicPlan);
  const done = solved(session, props.buildKey);
  const problems = session?.result && session.result.problems.length > 0 ? session.result.problems : [];
  const checks = session?.checks.length ?? 0;

  // Takma (T5, 1. ekran): parça ya da kablo takılırken.
  if (placing || cabling) {
    const part = placing ? doc.parts.find((p) => p.id === placing.partId) : undefined;
    const leadPart = cabling?.kind === 'lead' ? doc.parts.find((p) => p.id === cabling.part) : undefined;
    const title = part
      ? `${part.label}${partValueText(part) ? ` · ${partValueText(part)}` : ''}`
      : leadPart && cabling?.kind === 'lead'
        ? tr.tahta.phone.leadTitle(`${leadPart.label} ${terminalName(leadPart, cabling.pin)}`)
        : tr.tahta.wireTool;
    const step = part ? (isFixed(part.type) ? tr.tahta.phone.fixedStep : tr.tahta.phone.leg(placing?.first ? 2 : 1)) : cabling?.kind === 'wire' ? tr.tahta.phone.end(cabling.from ? 2 : 1) : '';
    const submit = () => {
      if (props.onTypeHole(typed)) setTyped('');
    };
    return (
      <Layout>
        <div className="flex items-baseline justify-between gap-3">
          <b className="min-w-0 truncate text-[17px] font-semibold">{title}</b>
          {step && <span className="shrink-0 font-mono text-[13px] text-ink-2">{step}</span>}
        </div>
        <p className="m-0 text-[15px] leading-snug text-ink-2">{part && isFixed(part.type) ? tr.tahta.phone.fixedHelp : tr.tahta.phone.help}</p>
        {typing && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label={tr.tahta.holeFieldLabel}
              placeholder="7h"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              className="h-12 min-w-0 flex-1 rounded-[12px] border border-line-2 bg-panel px-3 font-mono text-base text-ink outline-none focus:border-accent"
            />
            <button type="submit" className={`${BUTTON} bg-accent text-white`}>
              {tr.tahta.phone.plug}
            </button>
          </form>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={props.onCancel} className={`${BUTTON} border border-line bg-panel text-ink`}>
            {tr.tahta.cancel}
          </button>
          <button type="button" aria-pressed={typing} onClick={() => setTyping((v) => !v)} className={`${BUTTON} border border-line ${typing ? 'bg-accent-soft text-accent-ink' : 'bg-panel text-ink'}`}>
            <Icon name="pencil" className="h-[18px] w-[18px]" />
            {tr.tahta.phone.typeHole}
          </button>
        </div>
      </Layout>
    );
  }

  // Sonuç (T4'ün telefondaki karşılığı).
  if (done && session) {
    const stats = sessionStats(session, Date.now());
    const rows: [string, string][] = [
      [d.rows.checks, d.times(stats.checks)],
      [d.rows.hints, d.hintsValue(stats.hints, stats.deepest ? d.levels[stats.deepest - 1]! : null)],
      [d.rows.problems, stats.problems.length > 0 ? stats.problems.map((p) => problemShort(doc, p)).join(' · ') : d.none],
      [d.rows.time, formatDuration(stats.duration)],
    ];
    return (
      <Layout>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok-ink">
            <Icon name="check" className="h-6 w-6" />
          </span>
          <div className="flex flex-col">
            <h2 className="m-0 text-[18px] leading-tight font-semibold">{d.okTitle}</h2>
            <span className="text-[13px] text-ink-2">{d.solvedAt(checks)}</span>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{`${d.tag(checks)}. ${d.announce(0)}`}</p>
        <div className="flex flex-col gap-1 rounded-xl bg-panel-2 px-3.5 py-3">
          <b className="text-[15px] font-semibold">{d.playTitle}</b>
          <p className="m-0 text-[15px] leading-snug text-ink-2">{props.cue ?? d.playGeneric}</p>
        </div>
        <dl className="m-0 flex flex-col rounded-xl border border-line px-3.5">
          {rows.map(([k, v], i) => (
            <div key={k} className={`flex items-baseline justify-between gap-4 py-2.5 ${i > 0 ? 'border-t border-line' : ''}`}>
              <dt className="text-[15px] text-ink-2">{k}</dt>
              <dd className="m-0 text-right font-mono text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
        {(
          [
            ['download', d.report, props.onReport],
            ['external', d.guide, props.onGuide],
            ['restart', d.reset, props.onReset],
          ] as const
        ).map(([icon, label, run]) => (
          <button key={label} type="button" onClick={run} className={`${BUTTON} border border-line bg-panel text-ink`}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
            {label}
          </button>
        ))}
      </Layout>
    );
  }

  // Denetle (T5, 3. ekran): ilk kademede yalnızca sayı ve "Nerede?"; sonra sorun kartları.
  if (problems.length > 0 && session) {
    const first = problems.every((p) => levelOf(session, p) <= 1);
    const again = (
      <button type="button" onClick={props.onCheck} className={`${BUTTON} bg-accent text-white`}>
        <Icon name="check" className="h-[18px] w-[18px]" />
        {d.again}
      </button>
    );
    return (
      <Layout
        footer={
          first ? (
            <div className="grid grid-cols-[2fr_3fr] gap-2">
              <button type="button" onClick={() => problems.forEach((p) => props.onHint(p))} className={`${BUTTON} bg-accent-soft text-accent-ink`}>
                <Icon name="bulb" className="h-[18px] w-[18px]" />
                {tr.tahta.phone.where}
              </button>
              {again}
            </div>
          ) : (
            again
          )
        }
      >
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
            <Icon name="warning" className="h-6 w-6" />
          </span>
          <div className="flex flex-col">
            <h2 className="m-0 text-[18px] leading-tight font-semibold">{d.title(problems.length)}</h2>
            <span className="text-[13px] text-ink-2">{d.tag(checks)}</span>
          </div>
        </div>
        <p className="sr-only" aria-live="polite">{`${d.tag(checks)}. ${d.announce(problems.length)}`}</p>
        {first ? (
          <>
            <p className="m-0 text-[15px] leading-snug text-ink-2">{tr.tahta.phone.intro(countWord(problems.length))}</p>
            <ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label={d.levelsLabel(d.levels[0]!)}>
              {d.levels.map((name, k) => (
                <li key={name} className={`rounded-full border px-2 py-0.5 text-label ${k === 0 ? 'border-danger-soft bg-danger-soft text-danger-ink' : 'border-line text-muted'}`}>
                  {name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0" aria-label={d.title(problems.length)}>
              {problems.map((p, i) => (
                <ProblemCard key={p.id} doc={doc} problem={p} index={i} level={levelOf(session, p)} touch onHint={props.onHint} />
              ))}
            </ol>
          </>
        )}
        <p className="m-0 text-label text-muted">{d.stats(checks, session.hints.length)}</p>
        <BoxBody {...props} parts={parts} leads={leads} placed={placed} plugged={plugged.length} colorOf={colorOf} compact />
      </Layout>
    );
  }

  // Parça kutusu (T5, 2. ekran).
  return (
    <Layout
      footer={
        <button type="button" onClick={props.onCheck} className={`${BUTTON} bg-accent text-white`}>
          <Icon name="check" className="h-[18px] w-[18px]" />
          {checks === 0 ? d.check : d.again}
        </button>
      }
    >
      <BoxBody {...props} parts={parts} leads={leads} placed={placed} plugged={plugged.length} colorOf={colorOf} compact={false} />
    </Layout>
  );
}

/** Parça kutusu: parçalar (takılıysa delikleri, değilse Tak), takılmamış alet kabloları, Kablo ve Bağlı delikler. */
function BoxBody(
  props: PhoneBoardSheetProps & {
    parts: ReturnType<typeof boardParts>;
    leads: ReturnType<typeof requiredLeads>;
    placed: number;
    plugged: number;
    colorOf: (net: string) => string;
    compact: boolean;
  },
) {
  const { doc, build, parts, leads } = props;
  const open = leads.filter((l) => !build.leads.some((b) => b.part === l.part && b.pin === l.pin));
  const wireOn = props.cabling?.kind === 'wire';
  return (
    <>
      <div className="flex items-baseline justify-between">
        <h2 className={`m-0 font-semibold ${props.compact ? 'text-[15px]' : 'text-[18px]'}`}>{tr.tahta.phone.box}</h2>
        <span className="font-mono text-[13px] text-ink-2">{tr.tahta.placedCount(props.placed, parts.length)}</span>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {parts.map((part) => {
          const at = build.parts[part.id];
          const value = partValueText(part);
          return (
            <li key={part.id} className="flex min-h-12 items-center gap-3 rounded-[12px] border border-line bg-panel pr-1.5 pl-3">
              <b className="w-11 shrink-0 text-[15px] font-semibold">{part.label}</b>
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink-2">
                {tr.devices.names[part.type]}
                {value ? ` ${value}` : ''}
              </span>
              {at ? (
                <span className="flex items-center gap-1 pr-1.5 font-mono text-[13px] text-ok-ink">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {at.holes.join(' · ')}
                </span>
              ) : (
                <button type="button" onClick={() => props.onPlace(part.id)} aria-label={tr.tahta.placePart(part.label)} className="flex h-11 items-center rounded-full bg-accent px-4 text-[15px] font-semibold text-white">
                  {tr.tahta.phone.plugPart}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {leads.length > 0 && (
        <>
          <div className="flex items-baseline justify-between">
            <h3 className="m-0 text-label font-semibold tracking-wide text-muted uppercase">{tr.tahta.leads}</h3>
            <span className="font-mono text-[13px] text-ink-2">{tr.tahta.placedCount(props.plugged, leads.length)}</span>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {open.map((l) => {
              const part = doc.parts.find((p) => p.id === l.part);
              if (!part) return null;
              const label = `${part.label} ${terminalName(part, l.pin)}`;
              return (
                <li key={`${l.part}-${l.pin}`}>
                  <button type="button" onClick={() => props.onLead(l.part, l.pin)} aria-label={tr.tahta.leadChip(label)} className="flex h-11 items-center gap-1.5 rounded-full border border-line bg-panel px-3 font-mono text-[13px]">
                    <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full ring-1 ring-line-2" style={{ background: props.colorOf(l.net) }} />
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
          {props.plugged > 0 && <p className="m-0 text-[13px] text-muted">{tr.tahta.phone.plugged(props.plugged)}</p>}
        </>
      )}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" aria-pressed={wireOn} onClick={props.onWire} className={`${BUTTON} border ${wireOn ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-panel text-ink'}`}>
          <Icon name="wire" className="h-[18px] w-[18px]" />
          {tr.tahta.toolWire}
        </button>
        <button type="button" aria-pressed={props.showConnected} onClick={() => props.onShowConnected(!props.showConnected)} className={`${BUTTON} ${props.showConnected ? 'bg-accent-soft text-accent-ink' : 'border border-line bg-panel text-ink'}`}>
          <Icon name="eye" className="h-[18px] w-[18px]" />
          {tr.tahta.phone.connected}
        </button>
      </div>
    </>
  );
}
