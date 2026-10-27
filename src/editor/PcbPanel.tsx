// Lehim rehberinin "Baskı devre (PCB) olarak üret" bölümü: kartın üstten görünüşü (pedler, iki
// yüzün bakır yolları, serigrafi), yol çizimi ve tasarım kuralı durumu, üretim (Gerber) ve KiCad
// indirmeleri. Yollar pencere açıldıktan sonra çizilir (büyük kartta ≈ 0,1 s).

import { useEffect, useMemo, useState } from 'react';
import { fabricationZip } from '../bench3d/gerber';
import { boardSize, designPcb, kicadZip, refAnchor, slug, type PcbDesign } from '../bench3d/kicad';
import { checkPcb, RULES, routePcb, type DrcResult, type Routing } from '../bench3d/router';
import { tr } from '../i18n/tr';
import type { CircuitDoc } from '../model/types';

const t = tr.pcb;

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

const COPPER = ['#e5533d', '#4f8df7'] as const;
const PAD = '#d4a943';
const HOLE = '#0c1f14';

function PcbPreview({ design, routing }: { design: PcbDesign; routing: Routing | null }) {
  const o = design.outline;
  return (
    <svg viewBox={`${o.x0 - 1} ${o.y0 - 1} ${o.x1 - o.x0 + 2} ${o.y1 - o.y0 + 2}`} className="h-auto max-h-80 w-full" role="img" aria-label={t.previewLabel}>
      <rect x={o.x0} y={o.y0} width={o.x1 - o.x0} height={o.y1 - o.y0} rx={0.6} fill="#1d5a32" />
      {routing &&
        ([1, 0] as const).map((layer) =>
          routing.tracks
            .filter((track) => track.layer === layer)
            .map((track, i) => <line key={`${layer}-${i}`} x1={track.x0} y1={track.y0} x2={track.x1} y2={track.y1} stroke={COPPER[layer]} strokeWidth={track.width} strokeLinecap="round" opacity={0.9} />),
        )}
      {design.footprints.map((f) => (
        <g key={f.ref}>
          {f.silk.map(([x0, y0, x1, y1], i) => (
            <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#f1f1ea" strokeWidth={0.15} />
          ))}
          {f.circles.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="none" stroke="#f1f1ea" strokeWidth={0.15} />
          ))}
          {f.pads.map((p, i) =>
            p.npth ? (
              <circle key={i} cx={p.x} cy={p.y} r={p.size / 2} fill={HOLE} />
            ) : (
              <g key={i}>
                {p.shape === 'rect' ? <rect x={p.x - p.size / 2} y={p.y - p.size / 2} width={p.size} height={p.size} fill={PAD} /> : <circle cx={p.x} cy={p.y} r={p.size / 2} fill={PAD} />}
                <circle cx={p.x} cy={p.y} r={p.drill / 2} fill={HOLE} />
              </g>
            ),
          )}
          {!f.pads.some((p) => p.npth) && (
            <text x={refAnchor(f).x} y={refAnchor(f).y + 0.45} fontSize={1.3} textAnchor="middle" fill="#f1f1ea">
              {f.ref}
            </text>
          )}
        </g>
      ))}
      {routing?.vias.map((v, i) => (
        <g key={`v${i}`}>
          <circle cx={v.x} cy={v.y} r={RULES.via / 2} fill={PAD} />
          <circle cx={v.x} cy={v.y} r={RULES.viaDrill / 2} fill={HOLE} />
        </g>
      ))}
    </svg>
  );
}

interface Routed {
  readonly design: PcbDesign;
  readonly routing: Routing;
  readonly drc: DrcResult;
}

export function PcbSection({ doc, button }: { doc: CircuitDoc; button: string }) {
  const result = useMemo(() => designPcb(doc), [doc]);
  const [routed, setRouted] = useState<Routed | null>(null);
  useEffect(() => {
    if (!result.ok) return;
    const { design } = result;
    // Önce pencere çizilsin.
    const timer = window.setTimeout(() => {
      const routing = routePcb(design);
      setRouted({ design, routing, drc: checkPcb(design, routing) });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [result]);

  if (!result.ok) {
    return (
      <section className="mt-5 rounded-lg border border-line p-3 print:hidden" aria-labelledby="pcb-baslik">
        <h3 id="pcb-baslik" className="mb-1 text-heading font-semibold">
          {t.title}
        </h3>
        <p className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-small text-warn" role="note">
          {result.reason}
        </p>
      </section>
    );
  }
  const { design } = result;
  const current = routed?.design === design ? routed : null;
  const unrouted = current?.routing.unrouted.length ?? 0;
  const violation = current?.drc.violations[0];
  const clean = current !== null && unrouted === 0 && violation === undefined && [...current.drc.islands.values()].every((n) => n === 1);
  const status = !current ? t.routing : unrouted > 0 ? t.unrouted(unrouted, current.routing.connections) : violation ? t.drcFailed(violation) : t.routed(current.routing.connections, current.routing.vias.length);
  return (
    <section className="mt-5 rounded-lg border border-line p-3 print:hidden" aria-labelledby="pcb-baslik">
      <h3 id="pcb-baslik" className="mb-1 text-heading font-semibold">
        {t.title}
      </h3>
      <p className="text-small text-ink-2">{t.text}</p>
      <div className="mt-3 rounded-md bg-panel-2 p-2">
        <PcbPreview design={design} routing={current?.routing ?? null} />
      </div>
      <p className="mt-2 text-small">{t.size(boardSize(design))}</p>
      <p className={`mt-1 text-small ${current && !clean ? 'text-warn' : 'text-ink-2'}`} role="status">
        {status}
      </p>
      {design.added.length > 0 && (
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-small text-ink-2">
          {design.added.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!clean}
          onClick={() => {
            if (!current) return;
            const base = slug(fileBase());
            save(fabricationZip(current.design, current.routing, base), `${base}-uretim.zip`);
          }}
          className={`rounded-md bg-accent font-medium text-white disabled:opacity-50 ${button}`}
        >
          {t.fabrication}
        </button>
        <button
          type="button"
          onClick={() => {
            const zip = kicadZip(doc, fileBase(), current ?? undefined);
            if (zip.ok) save(zip.data, zip.name);
          }}
          className={`rounded-md border border-line-2 bg-panel font-medium hover:bg-panel-2 ${button}`}
        >
          {t.download}
        </button>
      </div>
      <p className="mt-3 text-small text-ink-2">{t.order}</p>
    </section>
  );
}
