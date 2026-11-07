// Şemayı indir / yazdır penceresi: önizleme (dışa aktarılacak resmin kendisi), seçenekler (başlık satırı,
// o anki değerlerle), PNG, SVG ve Yazdır. Ekranın teması ne olursa olsun açık renkler ve beyaz zemin.
// Devrenin o anki durumu pencere açılırken alınır: devre çalışırken pencere her karede yeniden hazırlamaz.
// Yazdırırken yalnızca şema basılır (#sema-yazdir, global.css'teki @media print), A4, yönü şeklin en-boy
// oranına göre. Telefonda PNG paylaşım sayfasıyla (Web Share API; desteklenmiyorsa indirilir).

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ExampleId } from '../examples';
import { labFigure } from '../i18n/foy';
import { tr } from '../i18n/tr';
import type { Connectivity } from '../model/connectivity';
import type { CircuitDoc } from '../model/types';
import { formatSI } from '../sim/units';
import { canSharePng, datedName, saveFile } from './analysis/format';
import { voltageStops } from './colors';
import { standaloneSvg, svgsToLightPng } from './exportImage';
import { Icon } from './icons';
import { circuitMarkup, composeSchematic, headerMeta, type SchematicImage } from './schematicExport';
import type { Settings } from './settings';
import { useTouchUi } from './touchUi';
import type { SimFrame } from './useSimulation';

interface Prepared extends SchematicImage {
  /** Bağımsız SVG (açık renkler, gömülü yazı tipleri) ve önizlemenin adresi. */
  readonly svg: string;
  readonly url: string;
}

/** Sitenin adresi (başlık satırında): "yigitkasap.github.io/devre-simulatoru". */
const siteAddress = () => new URL(import.meta.env.BASE_URL, window.location.origin).href.replace(/^https?:\/\//, '').replace(/\/$/, '');

export function SchematicExportDialog({
  doc,
  connectivity,
  frame,
  settings,
  title,
  example,
  onClose,
}: {
  doc: CircuitDoc;
  connectivity: Connectivity;
  /** Simülasyonun o anki karesi (durmuşsa null): "O anki değerlerle" için. */
  frame: SimFrame | null;
  settings: Pick<Settings, 'resistorStyle' | 'wireScale'>;
  title: string;
  example: ExampleId | null;
  onClose: () => void;
}) {
  const t = tr.schematicExport;
  const titleId = useId();
  const touch = useTouchUi();
  const [snap] = useState(() => ({ doc, connectivity, frame, settings }));
  const [withHeader, setWithHeader] = useState(true);
  const [live, setLive] = useState(false);
  const [image, setImage] = useState<Prepared | null>(null);
  const [state, setState] = useState<'preparing' | 'ready' | 'empty' | 'failed'>('preparing');
  const [printing, setPrinting] = useState(false);
  const pngShare = useMemo(() => touch && canSharePng(), [touch]);
  const figure = example ? labFigure(example) : null;
  const header = useMemo(
    () => (withHeader ? { title, meta: headerMeta({ foy: figure ? t.foy(figure.experiment, figure.figure) : null, date: new Date(), site: siteAddress() }) } : null),
    [withHeader, title, figure, t],
  );
  const dialogRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // Çizim: seçenekler değişince yeniden.
  useEffect(() => {
    let cancelled = false;
    setState('preparing');
    void (async () => {
      if (snap.doc.parts.length === 0) {
        setState('empty');
        return;
      }
      // O anki değerlerle: sağ altta gerilim renk ölçeği (ekrandaki çipin aynısı, açık temanın renkleri).
      const legend = live && snap.frame ? { label: tr.sim.legendChip(formatSI(snap.frame.vmax, 'V', { trim: true })), colors: voltageStops(snap.settings.wireScale, 'light') } : null;
      const composed = composeSchematic(await circuitMarkup(snap.doc, snap.connectivity, live ? snap.frame : null, snap.settings), header, undefined, legend);
      if (!composed) {
        setState('empty');
        return;
      }
      const svg = await standaloneSvg(composed.markup, composed.width, composed.height);
      if (cancelled) return;
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setImage({ ...composed, svg, url });
      setState('ready');
    })().catch(() => {
      if (!cancelled) setState('failed');
    });
    return () => {
      cancelled = true;
    };
  }, [snap, live, header]);

  // Yazdırma: şema sayfaya (yalnızca kâğıtta görünür) ve sayfa yönü; yazdırma bitince kaldırılır.
  useEffect(() => {
    if (!printing || !image) return undefined;
    const page = document.createElement('style');
    page.textContent = `@page { size: A4 ${image.height > image.width ? 'portrait' : 'landscape'}; margin: 12mm; }`;
    document.head.appendChild(page);
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      page.remove();
    };
  }, [printing, image]);

  const ready = state === 'ready' && image !== null;
  const png = async () => {
    if (!image) return;
    const blob = await svgsToLightPng([image], 2);
    if (blob) await saveFile(datedName(t.fileName, 'png'), blob, pngShare);
  };
  const svg = () => image && void saveFile(datedName(t.fileName, 'svg'), new Blob([image.svg], { type: 'image/svg+xml' }));
  const check = `flex items-start gap-3 rounded-lg px-1 ${touch ? 'min-h-11 py-2' : 'py-1.5'}`;
  // Telefonda üç düğme tek satırda: yazılar kırılmasın diye PNG biraz geniş, SVG'nin yazısı kısa.
  const button = `flex items-center justify-center gap-1.5 rounded-lg font-semibold whitespace-nowrap disabled:opacity-50 ${touch ? 'h-[52px] min-w-0 flex-1 px-2 text-[15px]' : 'h-10 px-4 text-small'}`;
  const ghost = `${button} border border-line-2 bg-panel text-ink hover:bg-panel-2`;
  const solid = `${button} bg-accent text-white hover:brightness-105 ${touch ? 'flex-[1.5]' : ''}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim/30 p-4 max-sm:items-stretch max-sm:p-0"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(900px,100%)] w-[min(46rem,100%)] flex-col rounded-2xl border border-line bg-panel shadow-2xl max-sm:max-h-full max-sm:rounded-none max-sm:border-0"
        style={touch ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
      >
        <div className="flex items-center gap-3 px-6 pt-5 pb-3 max-sm:px-4">
          <h2 id={titleId} className="m-0 flex-1 text-[20px] font-semibold">
            {t.title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t.close} className={`flex shrink-0 items-center justify-center rounded-lg text-muted hover:bg-app ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}>
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-6 pb-4 max-sm:px-4">
          <figure className="m-0 flex flex-col gap-1.5">
            <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-line bg-app p-3">
              {state === 'empty' ? (
                <p className="m-0 text-small text-muted">{t.empty}</p>
              ) : state === 'failed' ? (
                <p role="alert" className="m-0 text-small text-warn">
                  {t.failed}
                </p>
              ) : image ? (
                <img src={image.url} alt={t.previewLabel(t.size(image.width, image.height))} className={`block max-h-[46vh] max-w-full rounded-md shadow-sm ${state === 'preparing' ? 'opacity-60' : ''}`} />
              ) : (
                <p className="m-0 text-small text-muted">{t.preparing}</p>
              )}
            </div>
            {image && state !== 'empty' && (
              <figcaption className="flex justify-between text-label text-muted">
                <span>{t.preview}</span>
                <span className="font-mono">{t.size(image.width, image.height)}</span>
              </figcaption>
            )}
          </figure>
          <fieldset className="m-0 flex flex-col gap-0.5 border-0 p-0">
            <legend className="mb-1 p-0 text-label font-semibold text-muted">{t.options}</legend>
            <label className={check}>
              <input type="checkbox" checked={withHeader} onChange={(e) => setWithHeader(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-accent" />
              <span className="flex flex-col">
                <span className="text-small font-semibold">{t.header}</span>
                <span className="text-label text-muted">{t.headerNote}</span>
              </span>
            </label>
            <label className={`${check} ${snap.frame === null ? 'opacity-60' : ''}`}>
              <input type="checkbox" checked={live} disabled={snap.frame === null} onChange={(e) => setLive(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-accent" />
              <span className="flex flex-col">
                <span className="text-small font-semibold">{t.live}</span>
                <span className="text-label text-muted">{snap.frame === null ? t.liveOff : t.liveNote}</span>
              </span>
            </label>
          </fieldset>
          <p className="m-0 text-label leading-snug text-muted">{t.note}</p>
        </div>
        <div
          className={`flex shrink-0 items-center gap-2 border-t border-line px-6 pt-3 max-sm:px-4 ${touch ? '' : 'justify-end pb-4'}`}
          style={touch ? { paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' } : undefined}
        >
          <button type="button" onClick={() => setPrinting(true)} disabled={!ready} className={ghost}>
            <Icon name="printer" className="h-4 w-4" />
            {t.print}
          </button>
          <button type="button" onClick={svg} disabled={!ready} aria-label={t.svg} className={ghost}>
            <Icon name="download" className="h-4 w-4" />
            {touch ? t.svgShort : t.svg}
          </button>
          <button type="button" onClick={() => void png()} disabled={!ready} className={solid}>
            <Icon name={pngShare ? 'share' : 'download'} className="h-4 w-4" />
            {pngShare ? t.pngShare : t.png}
          </button>
        </div>
      </div>
      {printing && image && createPortal(<div id="sema-yazdir" className="hidden print:block" dangerouslySetInnerHTML={{ __html: image.svg }} />, document.body)}
    </div>
  );
}
