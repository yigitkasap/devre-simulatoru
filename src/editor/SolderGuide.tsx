// Lehim rehberi penceresi: 3B tezgâhtaki breadboard yerleşimi, delikli plaket (Perma-Proto) için
// üstten şema, malzeme listesi ve adım adım takma sırası. Yazdırılabilir.

import { useEffect, useMemo, useRef } from 'react';
import { BB, boardWidth, boardZ, colX, holeXZ, netColors, planBreadboard, railHoles, railX, railZ, stripRowZ, type BreadboardPlan, type Hole } from '../bench3d/breadboard';
import { buildSolderGuide } from '../bench3d/guide';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';

const t = tr.solderGuide;

function BoardDiagram({ doc, plan }: { doc: CircuitDoc; plan: BreadboardPlan }) {
  const w = boardWidth(plan.cols);
  const d = BB.depth;
  const height = boardZ(plan.boards - 1) + d;
  const colorOf = netColors(plan);
  const at = (h: Hole) => {
    const { x, z } = holeXZ(h, plan.cols);
    return { x: x + w / 2, y: z + d / 2 };
  };
  const label = (id: string) => doc.parts.find((p) => p.id === id)?.label ?? '';
  return (
    <svg viewBox={`-1 -1 ${w + 2} ${height + 2}`} className="h-auto w-full" role="img" aria-label={t.diagramLabel}>
      {Array.from({ length: plan.boards }, (_, b) => {
        const oy = boardZ(b);
        return (
          <g key={b} transform={`translate(0 ${oy})`}>
            <rect x={0} y={0} width={w} height={d} rx={0.6} fill="#f3f1ea" stroke="#c9c4b5" strokeWidth={0.15} />
            {[0, 1, 2, 3].map((rail) => (
              <line key={rail} x1={2} x2={w - 2} y1={railZ(rail) + d / 2 + (rail === 0 || rail === 2 ? -0.75 : 0.75)} y2={railZ(rail) + d / 2 + (rail === 0 || rail === 2 ? -0.75 : 0.75)} stroke={rail === 0 || rail === 3 ? '#d0342c' : '#2b62c4'} strokeWidth={0.12} />
            ))}
            {Array.from({ length: plan.cols }, (_, c) =>
              Array.from({ length: 10 }, (_, r) => (
                <rect key={`${c}-${r}`} x={colX(c + 1, plan.cols) + w / 2 - 0.22} y={stripRowZ(r) + d / 2 - 0.22} width={0.44} height={0.44} fill="#9aa0a6" />
              )),
            )}
            {[0, 1, 2, 3].map((rail) =>
              Array.from({ length: railHoles(plan.cols) }, (_, k) => (
                <rect key={`${rail}-${k}`} x={railX(k, plan.cols) + w / 2 - 0.22} y={railZ(rail) + d / 2 - 0.22} width={0.44} height={0.44} fill="#9aa0a6" />
              )),
            )}
            {Array.from({ length: plan.cols }, (_, c) => c + 1)
              .filter((c) => c === 1 || c % 5 === 0)
              .map((c) => (
                <text key={c} x={colX(c, plan.cols) + w / 2} y={stripRowZ(0) + d / 2 - 0.8} fontSize={0.7} textAnchor="middle" fill="#6b6f75">
                  {c}
                </text>
              ))}
            {'abcdefghij'.split('').map((letter, r) => (
              <text key={letter} x={0.9} y={stripRowZ(r) + d / 2 + 0.25} fontSize={0.7} textAnchor="middle" fill="#6b6f75">
                {letter}
              </text>
            ))}
          </g>
        );
      })}
      {plan.jumpers.map((j, i) => {
        const a = at(j.a);
        const b = at(j.b);
        return <line key={`j${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorOf(j.net)} strokeWidth={0.38} strokeLinecap="round" opacity={0.9} />;
      })}
      {[...plan.onBoard.values()].map((p) => {
        const pts = [...p.holes, ...(p.extraHoles ?? [])].map(at);
        const xs = pts.map((q) => q.x);
        const ys = pts.map((q) => q.y);
        const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        const name = label(p.partId);
        if (p.mount === 'dip8') {
          return (
            <g key={p.partId}>
              <rect x={Math.min(...xs) - 0.5} y={cy - 1.2} width={Math.max(...xs) - Math.min(...xs) + 1} height={2.4} rx={0.2} fill="#24262a" />
              <circle cx={Math.min(...xs) - 0.1} cy={cy} r={0.3} fill="#5c6067" />
              <text x={cx} y={cy + 0.3} fontSize={0.8} textAnchor="middle" fill="#fff">{name}</text>
            </g>
          );
        }
        return (
          <g key={p.partId}>
            <polyline points={pts.map((q) => `${q.x},${q.y}`).join(' ')} fill="none" stroke="#5f6670" strokeWidth={0.18} />
            {pts.map((q, i) => (
              <circle key={i} cx={q.x} cy={q.y} r={0.3} fill="#5f6670" />
            ))}
            <rect x={cx - 1.3} y={cy - 0.55} width={2.6} height={1.1} rx={0.3} fill="#fff" stroke="#5f6670" strokeWidth={0.1} />
            <text x={cx} y={cy + 0.3} fontSize={0.8} textAnchor="middle" fill="#1d2733">{name}</text>
          </g>
        );
      })}
      {plan.leads.map((l, i) => {
        const a = at(l.hole);
        return (
          <g key={`l${i}`}>
            <circle cx={a.x} cy={a.y} r={0.42} fill={colorOf(l.net)} stroke="#1d2733" strokeWidth={0.08} />
          </g>
        );
      })}
    </svg>
  );
}

export function SolderGuideDialog({ doc, onClose, touch }: { doc: CircuitDoc; onClose: () => void; touch: boolean }) {
  const plan = useMemo(() => planBreadboard(doc), [doc]);
  const guide = useMemo(() => buildSolderGuide(doc, plan), [doc, plan]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const button = touch ? 'h-11 px-4 text-sm' : 'h-9 px-3 text-small';
  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div
        id="lehim-rehberi"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lehim-rehberi-baslik"
        className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-panel shadow-xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 border-b border-app px-4 py-3 print:hidden">
          <h2 id="lehim-rehberi-baslik" ref={titleRef} tabIndex={-1} className="flex-1 text-title font-semibold outline-none">
            {t.title}
          </h2>
          <button type="button" onClick={() => window.print()} className={`rounded-md border border-line-2 bg-panel font-medium hover:bg-panel-2 ${button}`}>
            {t.print}
          </button>
          <button type="button" onClick={onClose} className={`rounded-md bg-accent font-medium text-white ${button}`}>
            {t.close}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 print:overflow-visible">
          <h2 className="mb-1 hidden text-title font-semibold print:block">{t.title}</h2>
          <p className="text-small text-ink-2">{t.intro}</p>
          <p className="mt-2 text-small">
            <b>{t.board}:</b> {guide.board}
          </p>
          {guide.warnings.map((w) => (
            <p key={w} className="mt-2 rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-small text-warn" role="note">
              {w}
            </p>
          ))}
          <div className="mt-3 rounded-lg border border-line p-2">
            <BoardDiagram doc={doc} plan={plan} />
          </div>
          <h3 className="mt-5 mb-2 text-heading font-semibold">{t.materials}</h3>
          <table className="w-full border-collapse text-small">
            <tbody>
              {guide.materials.map((m) => (
                <tr key={m.name} className="border-b border-app align-top">
                  <td className="py-1.5 pr-3 font-medium">{m.labels.length > 1 ? `${m.labels.length} × ` : ''}{m.name}</td>
                  <td className="py-1.5 pr-3 text-ink-2">{m.detail}</td>
                  <td className="py-1.5 font-mono text-label text-muted">{m.labels.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-5 mb-2 text-heading font-semibold">{t.steps}</h3>
          <ol className="flex list-decimal flex-col gap-2 pl-6 text-small">
            {guide.steps.map((s, i) => (
              <li key={i} className="break-inside-avoid">
                <span className="font-medium">{s.title}</span>: <span className="font-mono">{s.holes}</span>
                {s.note && <span className="block text-ink-2">{s.note}</span>}
              </li>
            ))}
          </ol>
          <h3 className="mt-5 mb-2 text-heading font-semibold">{t.checksTitle}</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-6 text-small text-ink-2">
            {t.checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
