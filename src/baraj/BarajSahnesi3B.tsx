// Baraj sahnesi, three.js (barajScene.ts) ve üstündeki HTML katmanı (README "Baraj sayfası" 11): prob ve
// lamba numaraları (lambayla aynı numara ve renk), ıslak prob ucunda yeşil halka, "Ortak +9 V" yazısı,
// su seviyesi tutamağı (role="slider"; yalnızca yukarı-aşağı oku; telefonda yok), isteğe bağlı yüzde
// ölçeği ve iyonlar ("Göster" çipleri). Konumlar 3B noktaların ekrana izdüşümünden; sahne boyu ya da
// kamera değişince yeniden hesaplanır. Lambaya tıklamak o katın devresini açar (onLamp). Bu modül tembel
// yüklenir; WebGL yoksa BarajSahnesi (SVG) kullanılır.

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
  readonly className?: string;
}

const WATER = '#2f7fc4';
const LAMP_ORDER = [
  { key: 'green', n: 1 },
  { key: 'yellow', n: 2 },
  { key: 'red', n: 3 },
] as const;

export default function BarajSahnesi3B({ level, wet, lamps, running, textPx, scale: showScale = false, handle = true, ions, currents, onPreview, onCommit, onLamp, className = '' }: BarajSahnesi3BProps) {
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

  const lampText = LAMP_ORDER.slice()
    .reverse()
    .map(({ key }) => `${tr.baraj.lampNames[key]} ${lamps[key] > 0.3 ? tr.baraj.lampOn : tr.baraj.lampOff}`)
    .join(', ');
  const label = tr.baraj.sceneLabel(Math.round(level), lampText) + (ions && ions.channels.length > 0 ? ` ${tr.baraj.ions.sceneLabel}` : '');

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
