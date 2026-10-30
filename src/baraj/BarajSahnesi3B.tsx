// Baraj sahnesi, three.js (barajScene.ts) ve üstündeki HTML katmanı (README "Baraj sayfası" 11): prob ve
// lamba numaraları (lambayla aynı numara ve renk), ıslak prob ucunda yeşil halka, "Ortak +9 V" yazısı,
// su seviyesi tutamağı (role="slider"; yalnızca yukarı-aşağı oku; telefonda yok), isteğe bağlı yüzde
// ölçeği ve iyonlar ("Göster" çipleri). Konumlar 3B noktaların ekrana izdüşümünden; sahne boyu ya da
// kamera değişince yeniden hesaplanır. Lambaya tıklamak o katın devresini açar (onLamp). Bu modül tembel
// yüklenir; WebGL yoksa BarajSahnesi (SVG) kullanılır.
//
// "İçini göster" (README 13, B6): sağ alttaki aç / kapa düğmesi (basılıyken koyu). Açıkken ana görünümde
// "Kablo kanalı · beton içinde" etiketi ve evin çevresinde kesikli mavi çerçeve; sağ üstte evin yakın
// planı (sahne ikinci kamerayla bu pencereye çizer): kat numaraları ve "Devre kartı · 3 kat", "Klemens",
// "9 V pil", "Prob kabloları", "Lamba kablosu → kule" etiketleri.

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ANION_COLOR, CATION_COLOR, ionsOnLine, jiggle, seeded, type IonView, type PlacedIon } from '../editor/ions';
import { tr } from '../i18n/tr';
import { TANK_PROBE_HEIGHTS, type TankMode } from '../sim/devices/tank';
import { BarajScene } from './barajScene';
import { SceneIon, type Lamps } from './BarajSahnesi';
import { LEVEL_COLORS, type LevelNo } from './seviye';

export interface BarajSahnesi3BProps {
  readonly level: number;
  readonly wet: readonly boolean[];
  readonly lamps: Lamps;
  readonly mode: TankMode;
  readonly running: boolean;
  /** Yazıların ekrandaki boyu (px). */
  readonly textPx: number;
  readonly scale?: boolean;
  readonly handle?: boolean;
  readonly ions?: IonView;
  /** Her probdan suya akan akım (A): kabarcıklar; simülasyon yoksa null. */
  readonly currents: readonly number[] | null;
  readonly onPreview: (level: number | null) => void;
  readonly onCommit: (level: number) => void;
  readonly onLamp?: (level: LevelNo) => void;
  /** Tüm devre açık (masaüstü): sahne dar, kamera "all" ön ayarında. */
  readonly narrow?: boolean;
  /** İçini göster açık mı; düğmeye basınca onXray. */
  readonly xray?: boolean;
  readonly onXray?: (on: boolean) => void;
  readonly className?: string;
}

const WATER = '#2f7fc4';
const LAMP_ORDER = [
  { key: 'green', n: 1 },
  { key: 'yellow', n: 2 },
  { key: 'red', n: 3 },
] as const;

export default function BarajSahnesi3B({ level, wet, lamps, running, textPx, scale: showScale = false, handle = true, ions, currents, onPreview, onCommit, onLamp, narrow = false, xray = false, onXray, className = '' }: BarajSahnesi3BProps) {
  const host = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<BarajScene | null>(null);
  const [, setLayout] = useState(0);
  useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    const scene = new BarajScene(el, { onLayout: () => setLayout((n) => n + 1) });
    sceneRef.current = scene;
    // Denetim betikleri (ios-kontrol) sahneye buradan ulaşır.
    (window as unknown as { __baraj3b?: BarajScene }).__baraj3b = scene;
    setLayout((n) => n + 1);
    return () => {
      delete (window as unknown as { __baraj3b?: BarajScene }).__baraj3b;
      sceneRef.current = null;
      scene.dispose();
    };
  }, []);
  const scene = sceneRef.current;
  useEffect(() => {
    scene?.setState({ level, wet, lamps, currents: running ? currents : null });
  });
  useEffect(() => scene?.setXray(xray), [scene, xray]);
  // Tutamak ve problar her genişlikte kadrajda (Tüm devrede dar sahnenin kamerası).
  useEffect(() => scene?.setFraming(narrow ? 'all' : null, handle), [scene, narrow, handle]);
  // Evin yakın planı: masaüstünde sağ üstte (520 × 380'e kadar), dar sahnede üstte tam genişlik.
  const hostW = host.current?.clientWidth ?? 0;
  const hostH = host.current?.clientHeight ?? 0;
  const inset = (() => {
    if (!xray || hostW === 0) return null;
    if (hostW < 640) {
      const w = hostW - 24;
      return { x: 12, y: 72, w, h: Math.round(Math.min(w * 0.62, hostH * 0.42)) };
    }
    const w = Math.round(Math.min(520, Math.max(340, hostW * 0.38)));
    return { x: hostW - w - 24, y: 24, w, h: Math.round((w * 380) / 520) };
  })();
  useEffect(() => scene?.setInset(inset), [scene, inset?.x, inset?.y, inset?.w, inset?.h]);

  const lampText = LAMP_ORDER.slice()
    .reverse()
    .map(({ key }) => `${tr.baraj.lampNames[key]} ${lamps[key] > 0.3 ? tr.baraj.lampOn : tr.baraj.lampOff}`)
    .join(', ');
  const label =
    tr.baraj.sceneLabel(Math.round(level), lampText) + (ions && ions.channels.length > 0 ? ` ${tr.baraj.ions.sceneLabel}` : '') + (xray ? ` ${tr.baraj.ici.sceneLabel}` : '');

  // --- Tutamak: sürükleme ve tuşlar (ekran y'si ↔ seviye: ölçeğin %0 ve %100 noktaları arası) -----------
  const drag = useRef<{ pointer: number; offset: number; level: number } | null>(null);
  const toLevel = (y: number) => {
    if (!scene || !host.current) return level;
    const top = host.current.getBoundingClientRect().top;
    const y0 = scene.screen(scene.points.staff(0)).y;
    const y1 = scene.screen(scene.points.staff(100)).y;
    return Math.min(100, Math.max(0, ((y - top - y0) / (y1 - y0)) * 100));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !scene || !host.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const surfaceY = scene.screen(scene.points.staff(level)).y + host.current.getBoundingClientRect().top;
    drag.current = { pointer: e.pointerId, offset: surfaceY - e.clientY, level };
    onPreview(level);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    d.level = toLevel(e.clientY + d.offset);
    onPreview(d.level);
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    onCommit(Math.round(d.level));
    onPreview(null);
  };
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
    let next: number | null = null;
    if (e.key in steps) next = Math.round(level) + steps[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 100;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    onCommit(Math.min(100, Math.max(0, next)));
  };

  const at = (p: Parameters<BarajScene['screen']>[0]) => scene?.screen(p) ?? { x: -999, y: -999 };
  const badge = Math.round(Math.max(22, textPx * 1.7));
  const fs = Math.round(textPx);
  /** Yakın plan penceresinin altında kalan ana görünüm etiketleri gizlenir (pencere aynı tuvale çizilir, HTML onu örtemez). */
  const covered = (x: number, y: number) => inset !== null && x > inset.x - 12 && x < inset.x + inset.w + 12 && y > inset.y - 12 && y < inset.y + inset.h + 12;

  // --- İyonlar: probların uçları arasında, ekran koordinatlarında (SVG sahnesindeki çizimle aynı) --------
  const ionLayer = (() => {
    if (!scene || !ions || level <= TANK_PROBE_HEIGHTS[0]) return null;
    const tips = [0, 1, 2, 3].map((k) => at(scene.points.tip(k)));
    const r = Math.max(4.5, textPx * 0.38);
    const placed: PlacedIon[] = [];
    for (const ch of ions.channels) {
      const a = tips[ch.from]!;
      const b = tips[ch.to]!;
      const dir = Math.sign(b.y - a.y);
      const span = Math.abs(b.y - a.y);
      for (let c = 0; c < 3; c++) {
        const p0 = { x: a.x - 4 - 3 * c, y: a.y + 6 * dir };
        const p1 = { x: b.x - 4 - 3 * c, y: b.y - 6 * dir };
        const between = tips.some((t, k) => k !== ch.from && k !== ch.to && t.y > Math.min(a.y, b.y) && t.y < Math.max(a.y, b.y));
        const control = { x: (a.x + b.x) / 2 - (between ? 40 : 18) - 10 * c, y: (a.y + b.y) / 2 };
        const perSign = Math.max(2, Math.round(span / 55));
        placed.push(...ionsOnLine(`${ch.from}-${ch.to}-${c}`, p0, control, p1, ch.phase, perSign, ch.from * 7 + ch.to * 3 + c, ions.clock, 2.2));
      }
    }
    // Suyun kesitinde yerinde kıpırdayan iyonlar (akım yokken de).
    const surface = at(scene.points.water(-1, level)).y;
    const bed = at(scene.points.water(-1, 0)).y;
    const left = at(scene.points.water(-9, level)).x;
    const right = tips[0]!.x - 20;
    const still: PlacedIon[] = [];
    if (bed - surface > 30 && right > left) {
      for (let n = 0; n < 24; n++) {
        const j = jiggle(300 + n, ions.clock, 2.4);
        still.push({ key: `s${n}`, x: left + seeded(400 + n) * (right - left) + j.dx, y: surface + 12 + seeded(200 + n) * (bed - surface - 24) + j.dy, cation: n % 2 === 0 });
      }
    }
    return (
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        {still.map((ion) => (
          <SceneIon key={ion.key} ion={ion} r={r * 0.8} opacity={0.55} />
        ))}
        {placed.map((ion) => (
          <SceneIon key={ion.key} ion={ion} r={r} />
        ))}
      </svg>
    );
  })();

  // --- Yüzde ölçeği: kesit yüzünde dikey çizgi, her %10'da çentik, %20'de yazı --------------------------
  const scaleLayer =
    scene && showScale ? (
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full">
        {(() => {
          const a = at(scene.points.staff(0));
          const b = at(scene.points.staff(100));
          return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeWidth={3} opacity={0.9} />;
        })()}
        {Array.from({ length: 11 }, (_, i) => i * 10).map((p) => {
          const q = at(scene.points.staff(p));
          return (
            <g key={p}>
              <line x1={q.x} x2={q.x + (p % 50 === 0 ? 12 : 7)} y1={q.y} y2={q.y} stroke="#2c3846" strokeWidth={p % 50 === 0 ? 2 : 1.2} />
              {p % 20 === 0 && (
                <text x={q.x - 6} y={q.y + fs * 0.34} textAnchor="end" fontSize={fs} fill="#1d2733" stroke="#ffffff" strokeWidth={fs * 0.29} paintOrder="stroke" style={{ fontFamily: 'var(--font-mono)' }}>
                  {`%${p}`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    ) : null;

  const handlePos = scene ? at(scene.points.staff(level)) : null;
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: 'linear-gradient(#b9d3ea, #dfeaf3 60%, #eef3f6)' }}>
      <div ref={host} role="img" aria-label={label} className="absolute inset-0" />
      {scaleLayer}
      {ionLayer}
      {/* İyon açıklaması: yalnızca iyonlar açıkken (sahnenin üst ortasında). */}
      {ionLayer && (
        <div aria-hidden="true" className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#c3cad2] bg-white/90 px-3 py-1 whitespace-nowrap text-[#1d2733]" style={{ fontSize: Math.round(fs * 0.85) }}>
          {(
            [
              ['cation', CATION_COLOR, '+', tr.baraj.ions.cation],
              ['anion', ANION_COLOR, '−', tr.baraj.ions.anion],
              ['gas', '#e9f6ff', '', tr.baraj.ions.gas],
            ] as const
          ).map(([key, color, sign, text]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-white text-[11px] leading-none font-bold text-white" style={{ background: color, borderColor: key === 'gas' ? '#5f8fb8' : '#ffffff' }}>
                {sign}
              </span>
              {text}
            </span>
          ))}
        </div>
      )}
      {scene && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {/* Problar: numaralı rozet (lambayla aynı renk), ıslak ucunda yeşil halka; ortak prob "+" ve adı. */}
          {[0, 1, 2, 3].map((k) => {
            const collar = at(scene.points.collar(k));
            const tip = at(scene.points.tip(k));
            const colors = k > 0 ? LEVEL_COLORS[k as LevelNo] : null;
            if (covered(collar.x, collar.y) || covered(tip.x, tip.y)) return null;
            return (
              <div key={k}>
                {k > 0 && wet[k] && (
                  <span
                    className="absolute rounded-full border-[3px] border-[#34d27a] shadow-[0_0_0_4px_rgba(52,210,122,0.25)]"
                    style={{ left: tip.x - 14, top: tip.y - 14, width: 28, height: 28 }}
                  />
                )}
                {colors ? (
                  <span
                    className="absolute flex items-center justify-center rounded-full font-bold shadow-[0_2px_6px_rgba(0,0,0,0.25)]"
                    style={{ left: collar.x + 14, top: collar.y - badge / 2, width: badge, height: badge, background: colors.badge, color: colors.badgeInk, fontSize: Math.round(badge * 0.55) }}
                  >
                    {k}
                  </span>
                ) : (
                  <span
                    className="absolute flex items-center gap-1.5 rounded-lg bg-white/90 px-2 font-semibold text-[#1d2733]"
                    style={{ left: collar.x + 14, top: collar.y - badge / 2, height: badge, fontSize: fs }}
                  >
                    <span aria-hidden="true" className="font-bold">
                      +
                    </span>
                    {tr.baraj.common}
                  </span>
                )}
              </div>
            );
          })}
          {/* Lambalar: solunda numara (yeşil 1, sarı 2, kırmızı 3). */}
          {LAMP_ORDER.map(({ n }) => {
            const p = at(scene.points.lamp(n));
            const radius = scene.scaleAt(scene.points.lamp(n), 0.5);
            const colors = LEVEL_COLORS[n];
            if (covered(p.x, p.y)) return null;
            return (
              <span
                key={n}
                className="absolute flex items-center justify-center rounded-full font-bold"
                style={{ left: p.x - radius - badge - 10, top: p.y - badge / 2, width: badge, height: badge, background: colors.badge, color: colors.badgeInk, fontSize: Math.round(badge * 0.55) }}
              >
                {n}
              </span>
            );
          })}
        </div>
      )}
      {/* Lambaya tıklamak o katın devresini gösterir (en az 44 px'lik alan). */}
      {scene &&
        onLamp &&
        LAMP_ORDER.map(({ key, n }) => {
          const p = at(scene.points.lamp(n));
          const size = Math.max(44, Math.round(scene.scaleAt(scene.points.lamp(n), 1.2)));
          const name = tr.baraj.panel.lampButton(n, tr.baraj.lampNames[key]);
          if (covered(p.x, p.y)) return null;
          return (
            <button
              key={n}
              type="button"
              aria-label={name}
              title={name}
              onClick={() => onLamp(n)}
              className="absolute rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-accent"
              style={{ left: p.x - size / 2, top: p.y - size / 2, width: size, height: size }}
            />
          );
        })}
      {/* İçini göster: kablo kanalı etiketi ve evin çevresinde kesikli çerçeve (ana görünüm). */}
      {scene && xray && <IciEtiketleri scene={scene} fs={fs} covered={covered} />}
      {scene && inset && <YakinPlan scene={scene} rect={inset} fs={fs} />}
      {onXray && (
        <button
          type="button"
          aria-pressed={xray}
          onClick={() => onXray(!xray)}
          className={`absolute z-10 flex h-11 items-center gap-2 rounded-full border pr-[18px] pl-3.5 text-body font-semibold shadow-[0_4px_12px_rgba(29,39,51,0.2)] ${hostW < 640 ? 'right-3' : 'right-6 bottom-6'} ${
            xray ? 'border-ink bg-ink text-on-ink' : 'border-line-2 bg-panel text-ink hover:bg-panel-2'
          }`}
          style={{ bottom: hostW < 640 ? 'calc(16px + env(safe-area-inset-bottom))' : undefined }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2.5" y="2.5" width="15" height="15" rx="2" strokeDasharray="3 2.2" />
            <path d="M6 14V9h3.5v5H13V6" />
          </svg>
          {tr.baraj.ici.button}
        </button>
      )}
      {/* Su yüzeyindeki tutamak: yalnızca yukarı-aşağı oku. */}
      {handle && handlePos && (
        <div
          role="slider"
          tabIndex={0}
          aria-label={tr.baraj.handle}
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(level)}
          aria-valuetext={tr.baraj.handleText(Math.round(level))}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onKeyDown}
          className="absolute flex cursor-ns-resize touch-none items-center justify-center rounded-full border-2 bg-white shadow-[0_3px_10px_rgba(0,0,0,0.18)] outline-none focus-visible:ring-[3px] focus-visible:ring-accent focus-visible:ring-offset-2"
          style={{ left: handlePos.x - 22, top: handlePos.y - 20, width: 44, height: 40, borderColor: WATER, color: WATER }}
        >
          <svg width="12" height="18" viewBox="0 0 14 20" aria-hidden="true">
            <path d="M7 1L1 7h12zM7 19l6-6H1z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** Kablo renkleri: Prob 1 yeşil, Prob 2 sarı, Prob 3 kırmızı, ortak prob siyah. */
const WIRE_COLORS = ['#1b7d44', '#e8b10f', '#d92d20', '#1d1f23'] as const;

const LABEL = 'absolute flex h-7 items-center gap-1.5 rounded-lg border border-[#c4cad2] bg-white/95 px-2.5 font-semibold whitespace-nowrap text-[#1d2733] shadow-[0_2px_6px_rgba(29,39,51,0.12)]';

/** Ana görünümde: kablo kanalının etiketi ve kontrol evinin çevresinde kesikli mavi çerçeve. */
function IciEtiketleri({ scene, fs, covered }: { scene: BarajScene; fs: number; covered: (x: number, y: number) => boolean }) {
  const c = scene.screen(scene.points.conduit());
  const corners = scene.points.houseCorners().map((p) => scene.screen(p));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const box = { x: Math.min(...xs) - 6, y: Math.min(...ys) - 6, w: Math.max(...xs) - Math.min(...xs) + 12, h: Math.max(...ys) - Math.min(...ys) + 12 };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {!covered(box.x + box.w / 2, box.y + box.h / 2) && (
        <span className="absolute rounded-lg border-2 border-dashed border-[#1f6feb]" style={{ left: box.x, top: box.y, width: box.w, height: box.h }} />
      )}
      {!covered(c.x + 60, c.y) && (
      <>
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <line x1={c.x} y1={c.y} x2={c.x + 34} y2={c.y} stroke="#1f6feb" strokeWidth={1.5} />
        <circle cx={c.x} cy={c.y} r={3} fill="#1f6feb" />
      </svg>
      <span className={LABEL} style={{ left: c.x + 34, top: c.y - 14, fontSize: Math.round(fs * 0.9) }}>
        <span className="flex gap-0.5">
          {WIRE_COLORS.map((color) => (
            <span key={color} className="h-3.5 w-1 rounded-sm" style={{ background: color }} />
          ))}
        </span>
        {tr.baraj.ici.conduit}
      </span>
      </>
      )}
    </div>
  );
}

/** Evin yakın planı: sahne bu dikdörtgene ikinci kamerayla çizer; burada çerçeve, kat numaraları ve etiketler. */
function YakinPlan({ scene, rect, fs }: { scene: BarajScene; rect: { x: number; y: number; w: number; h: number }; fs: number }) {
  const h = scene.points.house;
  const at = (p: Parameters<BarajScene['insetScreen']>[0]) => scene.insetScreen(p);
  const k = rect.w / 520;
  const labels: Array<{ key: string; text: string; p: { x: number; y: number }; dx: number; dy: number }> = [
    { key: 'pcb', text: tr.baraj.ici.pcb, p: at(h.pcb), dx: -10, dy: -46 },
    { key: 'battery', text: tr.baraj.ici.battery, p: at(h.battery), dx: -90, dy: 16 },
    { key: 'terminal', text: tr.baraj.ici.terminal, p: at(h.terminal), dx: 60, dy: 40 },
    { key: 'probes', text: tr.baraj.ici.probeCables, p: at(h.probeCables), dx: 70, dy: 60 },
    { key: 'lamp', text: tr.baraj.ici.lampCable, p: at(h.lampCable), dx: 70, dy: 30 },
  ];
  const size = Math.round(fs * 0.85);
  const clampX = (x: number, half: number) => Math.min(rect.w - half - 8, Math.max(half + 8, x));
  const clampY = (y: number) => Math.min(rect.h - 22, Math.max(22, y));
  return (
    <figure
      role="img"
      aria-label={tr.baraj.ici.insetLabel}
      className="pointer-events-none absolute m-0 overflow-visible rounded-[6px] border-2 border-[#1f6feb] shadow-[0_10px_28px_rgba(29,39,51,0.22)]"
      style={{ left: rect.x - 2, top: rect.y - 2, width: rect.w + 4, height: rect.h + 4 }}
    >
      <div aria-hidden="true" className="absolute inset-0.5">
        <svg className="absolute inset-0 h-full w-full overflow-visible">
          {labels.map((l) => {
            const half = (l.text.length * size * 0.55) / 2 + 10;
            return <line key={l.key} x1={l.p.x} y1={l.p.y} x2={clampX(l.p.x + l.dx * k, half)} y2={clampY(l.p.y + l.dy * k)} stroke="#1f6feb" strokeWidth={1.5} />;
          })}
          {labels.map((l) => (
            <circle key={l.key} cx={l.p.x} cy={l.p.y} r={3} fill="#1f6feb" />
          ))}
        </svg>
        <span className="absolute top-2.5 left-2.5 flex h-7 items-center rounded-lg bg-[#1f6feb] px-2.5 font-semibold text-white" style={{ fontSize: size }}>
          {tr.baraj.ici.house}
        </span>
        {h.rows.map((p, i) => {
          const q = at(p);
          const n = (3 - i) as LevelNo;
          const colors = LEVEL_COLORS[n];
          return (
            <span
              key={n}
              className="absolute flex h-5 w-5 -translate-x-full -translate-y-1/2 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ left: q.x - 6, top: q.y, background: colors.badge, color: colors.badgeInk }}
            >
              {n}
            </span>
          );
        })}
        {labels.map((l) => {
          const half = (l.text.length * size * 0.55) / 2 + 10;
          return (
            <span key={l.key} className={`${LABEL} -translate-x-1/2 -translate-y-1/2`} style={{ left: clampX(l.p.x + l.dx * k, half), top: clampY(l.p.y + l.dy * k), fontSize: size }}>
              {l.text}
            </span>
          );
        })}
      </div>
    </figure>
  );
}
