// Karta aktar penceresi (tasarım v3: K1–K4, L1–L2). İki sekme: Delikli plaket (lehim rehberi) ve
// Baskı devre (PCB); ikisinde de kart 3B (src/bench3d/boardScene.ts, ışık ve kamera tezgâhla aynı).
// Masaüstünde ekranın neredeyse tamamı: solda sahne (üstünde bilgi çipi ve araç hapı), sağda 368 px
// panel. Telefonda tam ekran sayfa: sekmeler, 340 px sahne, altında durum ya da "Şimdi tak" kartı,
// en altta sabit birincil düğme. Son seçilen sekme hatırlanır. Hesap kodu (planBreadboard,
// buildSolderGuide, designPcb, routePcb, checkPcb, fabricationZip, kicadZip) değişmez; Yazdır bugünkü
// yazdırılabilir rehberi açık temada basar (SolderGuide.tsx).

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { addedParts, footprintTip, holeLabels, missingConnections, perfboardInfo, stepGroups, stepRef, stepTargets, stepWarning, type MissingConnection, type StepTarget } from '../bench3d/boardData';
import { buildPcbBoard, buildPerfboard, type BoardModel } from '../bench3d/boardModels';
import { BoardScene, type BoardSide } from '../bench3d/boardScene';
import { planBreadboard } from '../bench3d/breadboard';
import { fabricationZip } from '../bench3d/gerber';
import { buildSolderGuide, type SolderGuide } from '../bench3d/guide';
import { boardSize, designPcb, kicadZip, slug, type PcbDesign } from '../bench3d/kicad';
import { checkPcb, routePcb, type DrcResult, type Routing } from '../bench3d/router';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';
import { Icon, type IconName } from './icons';
import { PrintableGuide } from './SolderGuide';

type Tab = 'perf' | 'pcb';
const TAB_KEY = 'devre-simulatoru:karta-sekme';
const t = tr.karta;

function readTab(): Tab {
  try {
    return localStorage.getItem(TAB_KEY) === 'pcb' ? 'pcb' : 'perf';
  } catch {
    return 'perf';
  }
}
function writeTab(tab: Tab) {
  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {
    // Depolama kapalı: seçim yalnızca bu açılışta geçerli.
  }
}

function save(data: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dosya adı JSON indirmesindeki gibi (devre-2026-10-28). */
const fileBase = () => `${tr.file.fileName}-${new Date().toISOString().slice(0, 10)}`;

// --- Ortak parçalar --------------------------------------------------------------------------------

/** Sahnenin üstündeki cam görünümlü kutu (bilgi çipi, araç hapı). */
const GLASS = 'border border-line bg-panel/85 shadow-[0_8px_24px_rgba(0,0,0,0.1)] backdrop-blur-[10px]';

/** Aç / kapa seçimi (araç hapındaki iki parçalı düğmeler). */
function Seg<V extends string>({ label, value, options, onChange, size }: { label: string; value: V; options: ReadonlyArray<{ value: V; label: string }>; onChange: (v: V) => void; size: 'desk' | 'touch' }) {
  return (
    <div role="group" aria-label={label} className="flex gap-0.5 rounded-[20px] bg-panel-2 p-[3px]">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`rounded-full whitespace-nowrap ${size === 'touch' ? 'h-11 min-w-11 px-3 text-small' : 'h-[34px] px-3.5 text-small'} ${
              on ? 'bg-panel font-semibold text-ink shadow-sm' : 'text-ink-2 hover:bg-panel/60'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function RoundButton({ icon, label, onClick, size }: { icon: IconName; label: string; onClick: () => void; size: 'desk' | 'touch' }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={`flex shrink-0 items-center justify-center rounded-full text-ink hover:bg-panel-2 ${size === 'touch' ? 'h-11 w-11' : 'h-9 w-9'}`}>
      <Icon name={icon} className="h-[17px] w-[17px]" />
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="h-[22px] w-px shrink-0 bg-line-2" />;

/** Açılır satır (telefonda bölümler, masaüstünde "Gümrük ve üretici seçenekleri"). */
function Disclosure({ label, value, children, big }: { label: string; value?: string; children: ReactNode; big?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-line">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2.5 text-left ${big ? 'min-h-12 text-[15px]' : 'min-h-10 text-small text-ink-2'}`}
      >
        <span className="min-w-0 flex-1">{label}</span>
        {value && <span className="min-w-0 truncate text-small text-muted">{value}</span>}
        <Icon name={open ? 'chevronDown' : 'chevron'} className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

const Heading = ({ children, aside }: { children: ReactNode; aside?: ReactNode }) => (
  <div className="mb-2 flex items-center justify-between gap-2">
    <h3 className="m-0 text-small font-semibold tracking-[0.02em] text-muted">{children}</h3>
    {aside}
  </div>
);

// --- 3B sahne ----------------------------------------------------------------------------------------

interface SceneApi {
  zoom(factor: number): void;
  fit(): void;
  focus(key: string): void;
}

/** Kart sahnesi ve üstündeki HTML katmanı ([data-anchor] öğeleri 3B noktalara taşınır). */
function BoardView({
  model,
  side,
  highlight,
  dark,
  apiRef,
  onHover,
  anchors,
  children,
  className,
  label,
}: {
  model: BoardModel | null;
  side: BoardSide;
  highlight: string | null;
  dark: boolean;
  apiRef: { current: SceneApi | null };
  onHover: (ref: string | null) => void;
  anchors: ReactNode;
  children: ReactNode;
  className: string;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BoardScene | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const [failed, setFailed] = useState(false);
  const lastModel = useRef<BoardModel | null>(null);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let scene: BoardScene;
    try {
      scene = new BoardScene(el, { onHover: (ref) => hoverRef.current(ref) });
    } catch {
      setFailed(true);
      return undefined;
    }
    sceneRef.current = scene;
    // Denetim betikleri (ios-kontrol) sahneye buradan ulaşır (tezgâhtaki __tezgah gibi).
    (window as unknown as { __kart?: BoardScene }).__kart = scene;
    scene.setOverlay(overlay.current);
    apiRef.current = { zoom: (f) => scene.zoom(f), fit: () => scene.fit(), focus: (k) => scene.focus(k) };
    return () => {
      apiRef.current = null;
      sceneRef.current = null;
      lastModel.current = null;
      delete (window as unknown as { __kart?: BoardScene }).__kart;
      scene.dispose();
    };
  }, [apiRef]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !model || model === lastModel.current) return;
    // İlk kartta sığdırılır; adım ilerleyince ya da Parçalarla / Yalın kart değişince kamera yerinde kalır.
    lastModel.current = model;
    scene.setModel(model);
  }, [model]);
  useEffect(() => sceneRef.current?.setSide(side), [side]);
  useEffect(() => sceneRef.current?.setHighlight(highlight), [highlight, model]);
  useEffect(() => sceneRef.current?.setTheme(dark), [dark]);
  return (
    <div className={`overflow-hidden bg-bench ${/\bfixed\b/.test(className) ? '' : 'relative'} ${className}`}>
      <div ref={host} role="img" aria-label={label} className="absolute inset-0" />
      {failed && <p className="absolute inset-x-6 top-1/2 m-0 -translate-y-1/2 text-center text-body text-ink-2">{t.noWebgl}</p>}
      <div ref={overlay} className="pointer-events-none absolute inset-0">
        {anchors}
      </div>
      {children}
    </div>
  );
}

/** İmleç parçanın üstündeyken koyu ipucu: ad ve kılıf (temadan bağımsız koyu: console belirteci). */
function HoverTip({ name, detail }: { name: string; detail: string }) {
  return (
    <div data-anchor="hover" className="absolute top-0 left-0 z-10">
      <div className="relative mb-2 -translate-x-1/2 -translate-y-full rounded-lg bg-console px-2.5 py-1.5 text-center whitespace-nowrap text-console-ink shadow-[0_6px_16px_rgba(0,0,0,0.2)]">
        <div className="text-small font-semibold">{name}</div>
        {detail && <div className="text-label opacity-75">{detail}</div>}
        <span aria-hidden="true" className="absolute -bottom-[5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-console" />
      </div>
    </div>
  );
}

// --- Baskı devre (PCB) -------------------------------------------------------------------------------

interface Routed {
  readonly design: PcbDesign;
  readonly routing: Routing;
  readonly drc: DrcResult;
}

function usePcb(doc: CircuitDoc) {
  const result = useMemo(() => designPcb(doc), [doc]);
  const [routed, setRouted] = useState<Routed | null>(null);
  useEffect(() => {
    if (!result.ok) return undefined;
    const { design } = result;
    // Önce pencere çizilsin; büyük kartta yol çizimi ≈ 0,1 s.
    const timer = window.setTimeout(() => {
      const routing = routePcb(design);
      setRouted({ design, routing, drc: checkPcb(design, routing) });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [result]);
  const current = result.ok && routed?.design === result.design ? routed : null;
  const missing = useMemo(() => (current && result.ok ? missingConnections(doc, result.design, current.routing) : []), [current, doc, result]);
  const violation = current?.drc.violations[0];
  const clean = current !== null && current.routing.unrouted.length === 0 && violation === undefined && [...current.drc.islands.values()].every((n) => n === 1);
  return { result, current, missing, violation, clean };
}

function StatusBlock({ tone, title, text }: { tone: 'ok' | 'warn' | 'busy'; title: string; text: string }) {
  return (
    <div role="status" className="flex items-start gap-3.5">
      <span
        aria-hidden="true"
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-panel-2 text-muted'}`}
      >
        <Icon name={tone === 'ok' ? 'check' : tone === 'warn' ? 'warning' : 'dots'} className="h-[22px] w-[22px]" />
      </span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <span className={`text-[21px] leading-tight font-bold tracking-[-0.01em] ${tone === 'ok' ? 'text-ok-ink' : tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{title}</span>
        <span className="text-small leading-[1.45] text-ink-2">{text}</span>
      </div>
    </div>
  );
}

function PrimaryButton({ title, note, icon, onClick, disabled }: { title: string; note: string; icon?: IconName; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-[54px] w-full items-center gap-3 rounded-[14px] px-[18px] py-2 text-left ${
        disabled ? 'border border-dashed border-line-2 bg-panel-2 text-muted' : 'bg-accent text-white shadow-[0_6px_16px_rgba(31,111,235,0.28)] hover:brightness-105'
      }`}
    >
      {icon && !disabled && <Icon name={icon} className="h-5 w-5 shrink-0" />}
      <span className="flex min-w-0 flex-col">
        <span className="text-[16px] font-semibold">{title}</span>
        <span className={`text-label ${disabled ? '' : 'opacity-85'}`}>{note}</span>
      </span>
    </button>
  );
}

function OrderSpecs() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const text = tr.pcb.orderSpecs.map(([k, v]) => `${k}: ${v}`).join('\n');
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <section>
      <Heading
        aside={
          <button type="button" onClick={copy} aria-label={tr.pcb.copyLabel} className="flex h-7 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 text-label font-medium text-accent-ink">
            <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />
            {copied ? tr.pcb.copied : tr.pcb.copy}
          </button>
        }
      >
        {tr.pcb.orderTitle}
      </Heading>
      <dl className="m-0">
        {tr.pcb.orderSpecs.map(([k, v], i) => (
          <div key={k} className={`flex h-[30px] items-center justify-between text-body ${i > 0 ? 'border-t border-line' : ''}`}>
            <dt className="text-ink-2">{k}</dt>
            <dd className="m-0 font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AddedChips({ design, active, pinned, onHover, onPin }: { design: PcbDesign; active: string | null; pinned: string | null; onHover: (ref: string | null) => void; onPin: (ref: string) => void }) {
  const added = addedParts(design);
  if (added.length === 0) return null;
  const shown = added.find((a) => a.ref === active);
  return (
    <section>
      <Heading>{tr.pcb.addedTitle}</Heading>
      <div className="flex flex-wrap gap-1.5">
        {added.map((a) => {
          const on = pinned === a.ref;
          return (
            <button
              key={a.ref}
              type="button"
              aria-pressed={on}
              onClick={() => onPin(a.ref)}
              onPointerEnter={() => onHover(a.ref)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover(a.ref)}
              onBlur={() => onHover(null)}
              className={`flex h-[34px] items-center gap-2 rounded-full px-3 text-small ${on ? 'bg-accent-soft text-accent-ink shadow-[inset_0_0_0_1.5px_var(--color-accent)]' : 'bg-panel-2 hover:bg-app'}`}
            >
              <span className="font-mono font-semibold">{a.ref}</span>
              <span className={on ? '' : 'text-muted'}>{a.short}</span>
            </button>
          );
        })}
      </div>
      {shown && <p className="mt-2.5 mb-0 text-small leading-[1.45] text-ink-2">{`${shown.ref}: ${shown.explanation}`}</p>}
    </section>
  );
}

function MissingList({ missing, onShow }: { missing: readonly MissingConnection[]; onShow: (m: MissingConnection) => void }) {
  return (
    <section>
      <Heading>{tr.pcb.missingTitle}</Heading>
      {missing.map((m, i) => (
        <button
          key={m.n}
          type="button"
          onClick={() => onShow(m)}
          aria-label={tr.pcb.showLabel(m.n, m.from, m.to)}
          className={`flex min-h-12 w-full items-center gap-3 text-left ${i > 0 ? 'border-t border-line' : ''}`}
        >
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pin text-label font-bold text-white">
            {m.n}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body font-semibold">{`${m.from} → ${m.to}`}</span>
            <span className="truncate text-label text-muted">{`${m.pin} · ${m.mm} mm`}</span>
          </span>
          <span aria-hidden="true" className="text-small font-medium text-accent-ink">
            {tr.pcb.show}
          </span>
        </button>
      ))}
    </section>
  );
}

function KicadSteps() {
  return (
    <section>
      <Heading>{tr.pcb.kicadTitle}</Heading>
      <ol className="m-0 flex list-none flex-col gap-[7px] p-0">
        {tr.pcb.kicadSteps.map((s, i) => (
          <li key={s} className="flex gap-2.5 text-small text-ink-2">
            <span className="font-mono text-muted">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </section>
  );
}

function MoreNotes() {
  return (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-small leading-[1.45] text-ink-2">
      {[...tr.pcb.about, ...tr.pcb.orderNotes].map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

function PcbTab({ doc, phone, dark, sceneClass, fullscreen, onFullscreen }: { doc: CircuitDoc; phone: boolean; dark: boolean; sceneClass: string; fullscreen: boolean; onFullscreen: () => void }) {
  const { result, current, missing, violation, clean } = usePcb(doc);
  const [withParts, setWithParts] = useState(true);
  const [side, setSide] = useState<BoardSide>('top');
  const [hover, setHover] = useState<string | null>(null);
  const [chipHover, setChipHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const api = useRef<SceneApi | null>(null);
  const design = result.ok ? result.design : null;
  const model = useMemo(() => {
    if (!design) return null;
    return buildPcbBoard(doc, design, current?.routing ?? null, missing, withParts, footprintTip);
  }, [doc, design, current, missing, withParts]);
  const sz = phone ? 'touch' : 'desk';

  if (!result.ok || !design) {
    return (
      <div className={`flex items-center justify-center bg-bench p-8 ${sceneClass}`}>
        <p role="note" className="m-0 max-w-xl rounded-xl border border-warn-line bg-warn-soft px-5 py-4 text-body leading-relaxed text-warn">
          {result.ok ? '' : result.reason}
        </p>
      </div>
    );
  }

  const unrouted = current?.routing.unrouted.length ?? 0;
  const status = !current
    ? { tone: 'busy' as const, title: tr.pcb.routing, text: tr.pcb.about[2]! }
    : unrouted > 0
      ? { tone: 'warn' as const, title: tr.pcb.unroutedTitle(unrouted), text: tr.pcb.unrouted(unrouted, current.routing.connections) }
      : violation
        ? { tone: 'warn' as const, title: tr.pcb.drcTitle, text: tr.pcb.drcFailed(violation) }
        : { tone: 'ok' as const, title: tr.pcb.ready, text: phone ? tr.pcb.routedShort(current.routing.connections, boardSize(design)) : tr.pcb.routed(current.routing.connections, current.routing.vias.length) };
  const failed = current !== null && !clean;
  const fabricate = () => {
    if (!current || !clean) return;
    const base = slug(fileBase());
    save(fabricationZip(current.design, current.routing, base), `${base}-uretim.zip`);
  };
  const kicad = () => {
    const zip = kicadZip(doc, fileBase(), current ?? undefined);
    if (zip.ok) save(zip.data, zip.name);
  };
  const highlight = chipHover ?? pinned;
  const tip = hover ? model?.parts.get(hover) : undefined;
  const showMissing = (m: MissingConnection) => api.current?.focus(`rat-${m.n}`);

  const scene = (
    <BoardView
      model={model}
      side={side}
      highlight={highlight}
      dark={dark}
      apiRef={api}
      onHover={setHover}
      label={tr.pcb.sceneLabel(boardSize(design), withParts, side === 'bottom')}
      className={sceneClass}
      anchors={
        <>
          {missing.map((m) => (
            <div key={m.n} data-anchor={`rat-${m.n}`} className="absolute top-0 left-0">
              <span className="flex h-[30px] w-[30px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-pin text-body font-bold text-white shadow-[0_0_0_4px_rgba(240,90,40,0.25),0_4px_10px_rgba(0,0,0,0.25)]">
                {m.n}
              </span>
            </div>
          ))}
          {tip && <HoverTip name={tip.name} detail={tip.detail} />}
        </>
      }
    >
      {!phone && (
        <span className={`absolute top-[18px] left-5 flex h-8 items-center gap-2 rounded-2xl px-3.5 text-small text-ink-2 ${GLASS}`}>
          <span className="font-mono">{boardSize(design)}</span>
          <span aria-hidden="true" className="text-line-2">
            ·
          </span>
          {tr.pcb.layers}
        </span>
      )}
      <div role="toolbar" aria-label={t.tools} className={`absolute left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2 rounded-[26px] p-[5px] ${GLASS} ${phone ? 'bottom-2.5' : 'bottom-5'}`}>
        <Seg label={tr.pcb.withParts} value={withParts ? 'parts' : 'bare'} options={[{ value: 'parts', label: tr.pcb.withParts }, { value: 'bare', label: tr.pcb.bare }]} onChange={(v) => setWithParts(v === 'parts')} size={sz} />
        <Divider />
        <Seg label={t.side} value={side} options={[{ value: 'top', label: phone ? t.top.split(' ')[0]! : t.top }, { value: 'bottom', label: phone ? t.bottom.split(' ')[0]! : t.bottom }]} onChange={setSide} size={sz} />
        <Divider />
        {phone ? (
          <RoundButton icon={fullscreen ? 'fullscreenExit' : 'fullscreen'} label={fullscreen ? t.fullscreenExit : t.fullscreen} onClick={onFullscreen} size="touch" />
        ) : (
          <div className="flex items-center">
            <RoundButton icon="minus" label={t.zoomOut} onClick={() => api.current?.zoom(1.25)} size="desk" />
            <RoundButton icon="plus" label={t.zoomIn} onClick={() => api.current?.zoom(0.8)} size="desk" />
            <RoundButton icon="fit" label={t.fit} onClick={() => api.current?.fit()} size="desk" />
          </div>
        )}
      </div>
    </BoardView>
  );

  const added = <AddedChips design={design} active={highlight} pinned={pinned} onHover={setChipHover} onPin={(ref) => setPinned((p) => (p === ref ? null : ref))} />;
  const downloads = failed ? (
    <div className="flex flex-col gap-2">
      <PrimaryButton title={tr.pcb.downloadPrimary} note={tr.pcb.downloadPrimaryNote((current?.routing.connections ?? 0) - unrouted)} icon="download" onClick={kicad} />
      <PrimaryButton title={tr.pcb.fabricationLocked} note={tr.pcb.fabricationLockedNote} onClick={() => {}} disabled />
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <PrimaryButton title={tr.pcb.fabrication} note={tr.pcb.fabricationNote} icon="download" onClick={fabricate} disabled={!clean} />
      <button type="button" onClick={kicad} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line-2 text-body font-medium hover:bg-panel-2">
        <Icon name="download" className="h-[17px] w-[17px]" />
        {tr.pcb.download}
      </button>
    </div>
  );

  if (phone) {
    return (
      <>
        {scene}
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 pt-4">
          <StatusBlock {...status} />
          {failed && missing.length > 0 && <MissingList missing={missing} onShow={showMissing} />}
          {failed && <KicadSteps />}
          <div>
            <Disclosure label={tr.pcb.orderShort} value={tr.pcb.orderSummaryShort} big>
              <OrderSpecs />
            </Disclosure>
            <Disclosure label={tr.pcb.addedShort} value={addedParts(design).map((a) => a.ref).join(', ')} big>
              {added}
            </Disclosure>
            <Disclosure label={tr.pcb.moreShort} big>
              <MoreNotes />
            </Disclosure>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 px-4 pt-2.5" style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
          {failed ? (
            <>
              <PrimaryButton title={tr.pcb.downloadPrimary} note={tr.pcb.downloadPrimaryNote((current?.routing.connections ?? 0) - unrouted)} icon="download" onClick={kicad} />
              <p className="m-0 py-1 text-center text-label text-muted">{tr.pcb.fabricationLockedNote}</p>
            </>
          ) : (
            <>
              <PrimaryButton title={tr.pcb.fabrication} note={tr.pcb.fabricationNote} icon="download" onClick={fabricate} disabled={!clean} />
              <button type="button" onClick={kicad} className="h-11 text-body font-medium text-accent-ink">
                {tr.pcb.download}
              </button>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      {scene}
      <aside aria-label={tr.pcb.title} className="flex w-[368px] shrink-0 flex-col gap-[22px] overflow-y-auto overscroll-contain pt-2 pr-3 pb-1 pl-6">
        <StatusBlock {...status} />
        {failed && missing.length > 0 && <MissingList missing={missing} onShow={showMissing} />}
        {downloads}
        {failed && <KicadSteps />}
        <OrderSpecs />
        {added}
        <div className="mt-auto">
          <Disclosure label={tr.pcb.more}>
            <MoreNotes />
          </Disclosure>
        </div>
      </aside>
    </>
  );
}

// --- Delikli plaket (lehim rehberi) -------------------------------------------------------------------

function stepParts(title: string): { ref: string; rest: string } {
  const i = title.indexOf(' · ');
  return i > 0 ? { ref: title.slice(0, i), rest: title.slice(i) } : { ref: title, rest: '' };
}

function NowCard({ guide, targets, step, phone }: { guide: SolderGuide; targets: readonly (StepTarget | null)[]; step: number; phone: boolean }) {
  const s = guide.steps[step];
  if (!s) return null;
  const warning = stepWarning(targets[step] ?? null, guide);
  // Kutup ya da yön notu ve lehim ipucu tek satırda (L1); ölçü aleti / şebeke uyarısı ayrı.
  const note = [s.note, t.plaket.solderTip].filter(Boolean).join(' ');
  return (
    <section aria-live="polite" className={`flex flex-col rounded-2xl bg-panel-2 ${phone ? 'gap-2 p-4' : 'gap-2.5 p-[18px]'}`}>
      <span className="text-label font-semibold tracking-[0.02em] text-accent-ink">{t.plaket.now}</span>
      <span className={`font-bold ${phone ? 'text-[18px]' : 'text-[20px] leading-tight'}`}>{s.title}</span>
      <span className={`font-mono font-semibold ${phone ? 'text-[20px]' : 'text-[22px]'}`}>{s.holes}</span>
      <p className="m-0 flex gap-2 text-small leading-[1.45] text-ink-2">
        <Icon name="info" className="mt-px h-4 w-4 shrink-0 text-paused" />
        {note}
      </p>
      {warning && (
        <p role="note" className="m-0 flex gap-2 text-small leading-[1.45] text-warn">
          <Icon name="warning" className="mt-px h-4 w-4 shrink-0" />
          {warning}
        </p>
      )}
    </section>
  );
}

function MaterialsList({ guide }: { guide: SolderGuide }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-small leading-[1.45] text-ink-2">{guide.board}</p>
      {tr.solderGuide.intro.slice(0, 2).map((p) => (
        <p key={p} className="m-0 text-small leading-[1.45] text-ink-2">
          {p}
        </p>
      ))}
      <ul className="m-0 flex list-none flex-col p-0">
        {guide.materials.map((m, i) => (
          <li key={m.name} className={`flex flex-col py-2 text-small ${i > 0 ? 'border-t border-line' : ''}`}>
            <span className="font-medium">{`${m.labels.length > 1 ? `${m.labels.length} × ` : ''}${m.name}`}</span>
            <span className="text-ink-2">{m.detail}</span>
            {m.labels.length > 0 && <span className="font-mono text-label text-muted">{m.labels.join(', ')}</span>}
          </li>
        ))}
      </ul>
      {guide.warnings.map((w) => (
        <p key={w} role="note" className="m-0 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-small text-warn">
          {w}
        </p>
      ))}
    </div>
  );
}

function ChecksList() {
  return (
    <ul className="m-0 flex list-disc flex-col gap-2 pl-5 text-small leading-[1.45] text-ink-2">
      {tr.solderGuide.checks.map((c) => (
        <li key={c}>{c}</li>
      ))}
    </ul>
  );
}

function PerfTab({ doc, phone, dark, sceneClass, fullscreen, onFullscreen }: { doc: CircuitDoc; phone: boolean; dark: boolean; sceneClass: string; fullscreen: boolean; onFullscreen: () => void }) {
  const plan = useMemo(() => planBreadboard(doc), [doc]);
  const guide = useMemo(() => buildSolderGuide(doc, plan), [doc, plan]);
  const targets = useMemo(() => stepTargets(doc, plan, guide), [doc, plan, guide]);
  const total = guide.steps.length;
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'step' | 'all'>('step');
  const [side, setSide] = useState<BoardSide>('top');
  const [view, setView] = useState<'steps' | 'materials' | 'checks'>('steps');
  const [hover, setHover] = useState<string | null>(null);
  const api = useRef<SceneApi | null>(null);
  const current = Math.min(step, Math.max(0, total - 1));
  const all = mode === 'all';
  const model = useMemo(() => buildPerfboard(plan, targets, all ? total - 1 : current, all ? null : current), [plan, targets, current, all, total]);
  const last = current >= total - 1;
  const go = useCallback((delta: number) => setStep((s) => Math.min(Math.max(0, s + delta), Math.max(0, total - 1))), [total]);
  const next = () => (last ? setView('checks') : go(1));
  const nextRef = last ? '' : stepRef(guide.steps[current + 1]!, targets[current + 1] ?? null);
  const groups = stepGroups(targets, all ? total : current);
  const labels = !all && !phone && targets[current] ? holeLabels(targets[current]!, plan) : [];
  const tipTitle = useMemo(() => {
    const map = new Map<string, { name: string; detail: string }>();
    targets.forEach((target, i) => {
      const s = guide.steps[i]!;
      const key = !target ? '' : target.kind === 'part' ? target.part.label : target.kind === 'jumper' ? `jumper-${target.index}` : `lead-${target.index}`;
      if (key) map.set(key, { name: s.title, detail: s.holes });
    });
    return map;
  }, [targets, guide]);
  const tip = hover ? tipTitle.get(hover) : undefined;

  // Klavye: ← önceki, → sonraki adım (sekmelerde ve metin alanlarında değil). Dinleyici bir kez
  // kaydedilir (bkz. Esc).
  const keyState = useRef({ all, view, go });
  keyState.current = { all, view, go };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { all, view, go } = keyState.current;
      if (all || view !== 'steps' || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest('[role=tab], input, textarea, select')) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sz = phone ? 'touch' : 'desk';
  const scene = (
    <BoardView
      model={model}
      side={side}
      highlight={null}
      dark={dark}
      apiRef={api}
      onHover={setHover}
      label={t.plaket.sceneLabel(current + 1, total, guide.steps[current]?.title ?? '', all, side === 'bottom')}
      className={sceneClass}
      anchors={
        <>
          {labels.map((l, i) => {
            // Bitişik deliklerin etiketleri üst üste binmesin: sola ve sağa açılır, deliğe çizgiyle bağlanır.
            const dx = (i - (labels.length - 1) / 2) * 76;
            return (
              <div key={`${current}-${i}`} data-anchor={`hole-${i}`} className="absolute top-0 left-0">
                <svg aria-hidden="true" width="1" height="1" className="absolute top-0 left-0 overflow-visible">
                  <line x1={0} y1={0} x2={dx} y2={-22} stroke="var(--color-accent)" strokeWidth={1.5} />
                </svg>
                <span
                  className="absolute top-0 left-0 rounded-[7px] bg-accent px-2 py-1 font-mono text-small font-semibold whitespace-nowrap text-white shadow-[0_4px_12px_rgba(31,111,235,0.35)]"
                  style={{ transform: `translate(calc(${dx}px - 50%), calc(-22px - 100%))` }}
                >
                  {l.text}
                </span>
              </div>
            );
          })}
          {tip && <HoverTip name={tip.name} detail={tip.detail} />}
        </>
      }
    >
      {!phone && <span className={`absolute top-[18px] left-5 flex h-8 items-center rounded-2xl px-3.5 text-small text-ink-2 ${GLASS}`}>{perfboardInfo(plan)}</span>}
      <div role="toolbar" aria-label={t.tools} className={`absolute left-1/2 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-2 rounded-[26px] p-[5px] ${GLASS} ${phone ? 'bottom-2.5' : 'bottom-5'}`}>
        <Seg label={t.plaket.mode} value={mode} options={[{ value: 'step', label: t.plaket.stepByStep }, { value: 'all', label: t.plaket.all }]} onChange={setMode} size={sz} />
        <Divider />
        <Seg label={t.side} value={side} options={[{ value: 'top', label: phone ? t.top.split(' ')[0]! : t.top }, { value: 'bottom', label: phone ? t.bottom.split(' ')[0]! : t.bottom }]} onChange={setSide} size={sz} />
        <Divider />
        {phone ? (
          <RoundButton icon={fullscreen ? 'fullscreenExit' : 'fullscreen'} label={fullscreen ? t.fullscreenExit : t.fullscreen} onClick={onFullscreen} size="touch" />
        ) : (
          <div className="flex items-center">
            <RoundButton icon="minus" label={t.zoomOut} onClick={() => api.current?.zoom(1.25)} size="desk" />
            <RoundButton icon="plus" label={t.zoomIn} onClick={() => api.current?.zoom(0.8)} size="desk" />
            <RoundButton icon="fit" label={t.fit} onClick={() => api.current?.fit()} size="desk" />
          </div>
        )}
      </div>
    </BoardView>
  );

  const progress = total > 0 ? ((current + 1) / total) * 100 : 0;
  const counter = (
    <span aria-label={t.plaket.progressLabel(current + 1, total)} className="shrink-0 whitespace-nowrap">
      <span className={`font-bold text-ink ${phone ? 'text-body' : 'text-[18px]'}`}>{current + 1}</span>
      <span className="text-small text-ink-2">{` / ${total}`}</span>
    </span>
  );
  const bar = (
    <span aria-hidden="true" className={`block h-1.5 flex-1 overflow-hidden rounded-full ${phone ? 'bg-app' : 'bg-panel-2'}`}>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
    </span>
  );
  const prevButton = (h: string) => (
    <button type="button" aria-label={t.plaket.prev} title={t.plaket.prev} disabled={current === 0} onClick={() => go(-1)} className={`flex shrink-0 items-center justify-center rounded-[14px] border border-line-2 hover:bg-panel-2 disabled:opacity-40 ${h}`}>
      <Icon name="chevron" className="h-5 w-5 rotate-180" />
    </button>
  );
  const nextButton = (h: string) => (
    <button type="button" onClick={next} className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-accent px-4 text-[16px] font-semibold text-white shadow-[0_6px_16px_rgba(31,111,235,0.28)] hover:brightness-105 ${h}`}>
      <span className="truncate">{last ? t.plaket.finish : t.plaket.next(nextRef)}</span>
      {!last && <Icon name="chevron" className="h-5 w-5 shrink-0" />}
    </button>
  );

  if (phone) {
    const upcoming = guide.steps[current + 1];
    return (
      <>
        {scene}
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto overscroll-contain px-4 pt-4">
          <div className="flex items-center gap-2.5">
            {bar}
            {counter}
          </div>
          <NowCard guide={guide} targets={targets} step={current} phone />
          {upcoming && (
            <p className="m-0 text-small text-muted">
              {`${t.plaket.upcomingLine} `}
              <b className="font-semibold text-ink">{stepRef(upcoming, targets[current + 1] ?? null)}</b>
              {` · ${upcoming.holes}`}
            </p>
          )}
          <div>
            <Disclosure label={t.plaket.materials} big>
              <MaterialsList guide={guide} />
            </Disclosure>
            <Disclosure label={t.plaket.checks} big>
              <ChecksList />
            </Disclosure>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 px-4 pt-2.5" style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
          {prevButton('h-[54px] w-[54px]')}
          {nextButton('h-[54px]')}
        </div>
      </>
    );
  }

  const back = (title: string) => (
    <button type="button" onClick={() => setView('steps')} className="flex h-10 items-center gap-1.5 self-start rounded-lg pr-2 text-body font-medium text-accent-ink hover:bg-panel-2">
      <Icon name="chevron" className="h-4 w-4 rotate-180" />
      {t.plaket.back}
      <span className="sr-only">{` (${title})`}</span>
    </button>
  );
  return (
    <>
      {scene}
      <aside aria-label={t.perf} className="flex w-[368px] shrink-0 flex-col gap-[22px] overflow-y-auto overscroll-contain pt-2 pr-3 pb-1 pl-6">
        {view === 'materials' ? (
          <>
            {back(t.plaket.materials)}
            <Heading>{t.plaket.materials.toLocaleUpperCase('tr')}</Heading>
            <MaterialsList guide={guide} />
          </>
        ) : view === 'checks' ? (
          <>
            {back(t.plaket.checks)}
            <Heading>{tr.solderGuide.checksTitle.toLocaleUpperCase('tr')}</Heading>
            <ChecksList />
          </>
        ) : (
          <>
            <section>
              <div className="flex items-baseline justify-between">
                <span className="text-small font-semibold tracking-[0.02em] text-muted">{t.plaket.order}</span>
                {counter}
              </div>
              <div className="my-2.5 flex">{bar}</div>
              <ul aria-label={t.plaket.groupsLabel} className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {groups.map((g) => {
                  const done = !all && g.done === g.total;
                  const now = !all && g.current;
                  return (
                    <li
                      key={g.name}
                      className={`flex h-[26px] items-center gap-[5px] rounded-full px-2.5 text-label ${now ? 'bg-accent-soft font-semibold text-accent-ink' : done || all ? 'bg-ok-soft text-ok-ink' : 'bg-panel-2 text-muted'}`}
                    >
                      {(done || all) && <Icon name="check" className="h-3 w-3" />}
                      {g.name}
                      <span className="font-mono">{now ? `${g.position}/${g.total}` : g.total}</span>
                      <span className="sr-only">{now ? ` (${t.plaket.groupNow})` : done ? ` (${t.plaket.groupDone})` : ''}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            {!all && <NowCard guide={guide} targets={targets} step={current} phone={false} />}
            {!all && (
              <div className="flex gap-2">
                {prevButton('h-[54px] w-[54px]')}
                {nextButton('h-[54px]')}
              </div>
            )}
            {!all && current + 1 < total && (
              <section>
                <Heading>{t.plaket.upcoming}</Heading>
                {guide.steps.slice(current + 1, current + 4).map((s, i) => {
                  const { ref, rest } = stepParts(s.title);
                  return (
                    <div key={i} className={`flex min-h-10 items-center gap-3 text-small ${i > 0 ? 'border-t border-line' : ''}`}>
                      <span className="w-5 shrink-0 font-mono text-label text-muted">{current + 2 + i}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">
                        <b className="font-semibold text-ink">{ref}</b>
                        {rest}
                      </span>
                      <span className="max-w-[40%] shrink-0 truncate font-mono text-label text-muted">{s.holes}</span>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
        <div className="mt-auto flex gap-1.5 border-t border-line pt-3">
          {(
            [
              ['list', t.plaket.materials, () => setView(view === 'materials' ? 'steps' : 'materials'), view === 'materials'],
              ['shield', t.plaket.checks, () => setView(view === 'checks' ? 'steps' : 'checks'), view === 'checks'],
              ['printer', t.plaket.print, () => window.print(), false],
            ] as const
          ).map(([icon, label, action, on]) => (
            <button
              key={label}
              type="button"
              onClick={action}
              {...(icon === 'printer' ? {} : { 'aria-pressed': on })}
              className={`flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] text-small ${on ? 'bg-accent-soft font-semibold text-accent-ink' : 'text-ink-2 hover:bg-panel-2'}`}
            >
              <Icon name={icon} className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
      </aside>
      <PrintableGuide doc={doc} plan={plan} guide={guide} />
    </>
  );
}

// --- Pencere ------------------------------------------------------------------------------------------

function Tabs({ tab, onTab, phone }: { tab: Tab; onTab: (tab: Tab) => void; phone: boolean }) {
  const order: Tab[] = ['perf', 'pcb'];
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next = e.key === 'Home' ? 'perf' : e.key === 'End' ? 'pcb' : tab === 'perf' ? 'pcb' : 'perf';
    onTab(next);
    e.currentTarget.querySelectorAll<HTMLElement>('[role=tab]')[order.indexOf(next)]?.focus();
  };
  return (
    <div role="tablist" aria-label={t.tabs} onKeyDown={onKeyDown} className={`flex gap-0.5 rounded-full p-[3px] ${phone ? 'w-full bg-app' : 'bg-panel-2'}`}>
      {order.map((v) => {
        const on = v === tab;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            id={`karta-sekme-${v}`}
            aria-selected={on}
            aria-controls="karta-govde"
            tabIndex={on ? 0 : -1}
            onClick={() => onTab(v)}
            className={`flex items-center justify-center gap-[7px] rounded-full text-body whitespace-nowrap ${phone ? 'h-11 flex-1' : 'h-[38px] px-3.5'} ${
              on ? 'bg-ink font-semibold text-panel' : 'text-ink-2 hover:bg-panel'
            }`}
          >
            <Icon name={v === 'perf' ? 'perfboard' : 'chip'} className="h-4 w-4" />
            {v === 'perf' ? t.perf : t.pcb}
          </button>
        );
      })}
    </div>
  );
}

export default function KartaAktarDialog({ doc, title, phone, dark, onClose }: { doc: CircuitDoc; title: string; phone: boolean; dark: boolean; onClose: () => void }) {
  const [tab, setTabState] = useState<Tab>(readTab);
  const [fullscreen, setFullscreen] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTab(next);
  };
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  // Esc: tam ekran sahneden çıkar, yoksa kapatır. Dinleyici bir kez kaydedilir, güncel değerler ref'ten:
  // şemada Esc'ye önce simülatör tepki verip sayfayı yeniden çizer; olay sürerken yeniden kaydedilen
  // dinleyici o olayı kaçırırdı.
  const escRef = useRef({ onClose, fullscreen });
  escRef.current = { onClose, fullscreen };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (escRef.current.fullscreen) setFullscreen(false);
      else escRef.current.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const close = (
    <button type="button" onClick={onClose} aria-label={t.close} title={t.close} className={`flex shrink-0 items-center justify-center rounded-full hover:bg-panel-2 ${phone ? 'h-11 w-11' : 'h-10 w-10'}`}>
      <Icon name="close" className="h-[17px] w-[17px]" />
    </button>
  );
  const tabProps = { doc, phone, dark, fullscreen, onFullscreen: () => setFullscreen((f) => !f) };

  if (phone) {
    const sceneClass = fullscreen ? 'fixed inset-0 z-[60]' : 'mx-3 h-[340px] shrink-0 rounded-2xl';
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="karta-baslik" className="fixed inset-0 z-50 flex flex-col bg-panel" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <header className="flex h-14 shrink-0 items-center pr-1.5 pl-[18px]">
          <h2 id="karta-baslik" ref={titleRef} tabIndex={-1} className="m-0 flex-1 text-[17px] font-semibold outline-none">
            {t.title}
          </h2>
          {close}
        </header>
        <div className="shrink-0 px-3 pb-2.5">
          <Tabs tab={tab} onTab={setTab} phone />
        </div>
        <div id="karta-govde" role="tabpanel" aria-labelledby={`karta-sekme-${tab}`} className="flex min-h-0 flex-1 flex-col">
          {tab === 'pcb' ? <PcbTab key="pcb" {...tabProps} sceneClass={sceneClass} /> : <PerfTab key="perf" {...tabProps} sceneClass={sceneClass} />}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-scrim/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="karta-baslik"
        onClick={(e) => e.stopPropagation()}
        className={`flex h-full w-full flex-col overflow-hidden rounded-[18px] border bg-panel shadow-[0_30px_80px_rgba(0,0,0,0.35)] ${dark ? 'border-line-2' : 'border-transparent'}`}
      >
        <header className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 pr-3.5 pl-6">
          <div className="flex min-w-0 flex-col gap-px">
            <h2 id="karta-baslik" ref={titleRef} tabIndex={-1} className="m-0 text-[18px] font-semibold outline-none">
              {t.title}
            </h2>
            <span className="truncate text-label text-muted">{title}</span>
          </div>
          <Tabs tab={tab} onTab={setTab} phone={false} />
          <div className="flex justify-end">{close}</div>
        </header>
        <div id="karta-govde" role="tabpanel" aria-labelledby={`karta-sekme-${tab}`} className="flex min-h-0 flex-1 px-3 pb-3">
          {tab === 'pcb' ? <PcbTab key="pcb" {...tabProps} sceneClass="min-w-0 flex-1 rounded-[14px]" /> : <PerfTab key="perf" {...tabProps} sceneClass="min-w-0 flex-1 rounded-[14px]" />}
        </div>
      </div>
    </div>
  );
}
