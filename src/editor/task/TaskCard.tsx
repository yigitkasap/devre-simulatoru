// Öğrenci görünümünde görev kartı (C1, N5): defterin en üstünde. Hedef satırları canlı kontrol edilir
// (tutunca yeşil tik, ölçülen değer); ölçülemeyen hedefte kısa yol ("Bode ile ölç", "Oynat").
// Kart "not vermez" diye yazar; "Teslim dosyası (.json)" devreyi indirir.
// Önce tahmin (B1): görevde açıksa öğrenci önce her hedefe tahminini, isteğe bağlı gerekçesini ve ne
// kadar emin olduğunu yazar ve kaydeder (ölçülenler o zamana kadar gizli, simülasyon ve ölçüm kapalı);
// sonra satırda tahmin, fark ve güven ölçülenin yanında. "Eminim" deyip ölçülenden uzak kalan tahminde
// not çıkar (kavram yanılgısını bilgi eksiğinden ayırır).

import { useState } from 'react';
import { tr } from '../../i18n/tr';
import { CONFIDENCES, confidentMiss, predictionAgrees, predictionError, REASON_LIMIT, type Confidence, type Predictions, type TaskDef } from '../../model/task';
import { formatNumber } from '../../sim/units';
import { Icon } from '../icons';
import { plainText, Rich } from '../Rich';
import { useTouchUi } from '../touchUi';
import { readPrediction, valueText } from './targets';

export interface TargetStatus {
  readonly id: string;
  readonly name: string;
  readonly unit: string;
  readonly goal: string;
  readonly measured: number | null;
  readonly met: boolean;
  /** Ölçülemiyorsa kısa yol. */
  readonly shortcut: 'bode' | 'play' | null;
}

export function TaskCard({
  task,
  statuses,
  predictions,
  started,
  onPredict,
  onReason,
  onConfidence,
  onLock,
  onBode,
  onPlay,
  onSubmit,
  onExit,
}: {
  task: TaskDef;
  statuses: readonly TargetStatus[];
  predictions: Predictions;
  /** Simülasyon başladı (çalışıyor ya da duraklatıldı). */
  started: boolean;
  onPredict: (id: string, value: number | null) => void;
  onReason: (id: string, text: string) => void;
  onConfidence: (id: string, confidence: Confidence) => void;
  onLock: () => void;
  onBode: () => void;
  onPlay: () => void;
  onSubmit: () => void;
  onExit: () => void;
}) {
  const t = tr.task.card;
  const touch = useTouchUi();
  const met = statuses.filter((s) => s.met).length;
  // Tahmin aşaması: kaydedilene kadar ölçülenler ve kısa yollar gizli.
  const predicting = task.predict && !predictions.locked;
  const written = statuses.filter((s) => predictions.values[s.id] !== undefined).length;
  const rated = statuses.filter((s) => predictions.confidence[s.id] !== undefined).length;
  const ready = written === statuses.length && rated === statuses.length;
  return (
    <section data-notebook="task" aria-label={t.label(task.name)} className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-line bg-panel p-4">
      <div className="flex items-center gap-2 text-label">
        <Icon name="target" className="h-4 w-4 text-accent-ink" />
        <span className="font-semibold text-accent-ink">{predicting ? t.predictTitle : t.kicker}</span>
        <span className="flex-1" />
        {statuses.length > 0 && !predicting && (
          <span className="font-mono text-muted" aria-label={t.progress(met, statuses.length)}>
            {`${met} / ${statuses.length}`}
          </span>
        )}
      </div>
      <h2 className="m-0 text-[17px] font-semibold">{task.name}</h2>
      {task.instruction && (
        <p className="m-0 text-small leading-snug whitespace-pre-line text-ink-2">
          <Rich text={task.instruction} />
        </p>
      )}
      {predicting && <p className="m-0 rounded-lg bg-accent-soft px-3 py-2 text-small leading-snug text-accent-ink">{t.predictIntro}</p>}
      {statuses.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {statuses.map((s) => {
            const target = task.targets.find((x) => x.id === s.id);
            const prediction = predictions.values[s.id];
            const confidence = predictions.confidence[s.id];
            const reason = predictions.reasons[s.id] ?? '';
            const error = prediction !== undefined ? predictionError(prediction, s.measured) : null;
            const miss = target !== undefined && prediction !== undefined && confidentMiss(target, prediction, s.measured, confidence);
            return (
              <li key={s.id} className="flex flex-col gap-2 border-t border-line py-2.5">
                <span className="flex items-center gap-3">
                  {!predicting && (
                    <span
                      aria-label={s.met ? t.met : t.notMet}
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.met ? 'bg-ok-soft text-ok' : 'border-2 border-line-2'}`}
                    >
                      {s.met && <Icon name="check" className="h-3.5 w-3.5" />}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-small font-semibold">
                      <Rich text={s.name} />
                    </span>
                    <span className="font-mono text-label text-muted">{s.goal}</span>
                    {task.predict && !predicting && prediction !== undefined && (
                      <span className="font-mono text-label text-ink-2">
                        {t.prediction(valueText(prediction, s.unit))}
                        {error !== null && ` · ${t.predictionError(formatNumber(error, error < 10 ? 1 : 0))}`}
                        {confidence && ` · ${t.confidence[confidence]}`}
                      </span>
                    )}
                  </span>
                  {predicting ? (
                    <PredictionInput status={s} value={prediction} touch={touch} onValue={(v) => onPredict(s.id, v)} />
                  ) : s.measured !== null ? (
                    <b className={`shrink-0 font-mono text-small font-semibold tabular ${s.met ? 'text-ok-ink' : 'text-warn'}`}>{valueText(s.measured, s.unit)}</b>
                  ) : s.shortcut ? (
                    <button
                      type="button"
                      onClick={s.shortcut === 'bode' ? onBode : onPlay}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-3 text-label font-semibold text-accent-ink hover:brightness-95 ${touch ? 'h-11' : 'h-8'}`}
                    >
                      <Icon name={s.shortcut === 'bode' ? 'bode' : 'play'} className="h-3.5 w-3.5" />
                      {s.shortcut === 'bode' ? t.measureBode : t.play}
                    </button>
                  ) : (
                    <span className="shrink-0 text-label text-muted">—</span>
                  )}
                </span>
                {predicting && (
                  <>
                    <input
                      aria-label={t.reasonLabel(plainText(s.name))}
                      placeholder={t.reasonPlaceholder}
                      maxLength={REASON_LIMIT}
                      value={reason}
                      onChange={(e) => onReason(s.id, e.target.value)}
                      className={`w-full rounded-lg border border-line-2 bg-panel px-2.5 ${touch ? 'h-11 text-[16px]' : 'h-9 text-sm'}`}
                    />
                    <span role="radiogroup" aria-label={t.confidenceLabel(plainText(s.name))} className="flex rounded-lg bg-app p-0.5">
                      {CONFIDENCES.map((c) => (
                        <button
                          key={c}
                          type="button"
                          role="radio"
                          aria-checked={confidence === c}
                          onClick={() => onConfidence(s.id, c)}
                          className={`flex-1 rounded-md px-1 text-label font-medium ${touch ? 'h-11' : 'h-8'} ${confidence === c ? 'bg-panel font-semibold text-accent-ink shadow-sm' : 'text-ink-2 hover:text-ink'}`}
                        >
                          {t.confidence[c]}
                        </button>
                      ))}
                    </span>
                  </>
                )}
                {task.predict && !predicting && reason !== '' && <span className="text-label leading-snug text-ink-2 italic">{t.reason(reason)}</span>}
                {miss && (
                  <span className="flex items-start gap-1.5 text-label leading-snug text-warn">
                    <Icon name="warning" className="mt-px h-3.5 w-3.5 shrink-0" />
                    {t.confidentMiss}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {predicting ? (
        <>
          <span className="text-label text-muted">
            {t.predictCount(written, statuses.length)}
            {written === statuses.length && rated < statuses.length && ` · ${t.needConfidence}`}
          </span>
          <button
            type="button"
            disabled={!ready}
            onClick={onLock}
            className={`flex items-center justify-center gap-2 rounded-xl bg-accent text-small font-semibold text-white hover:brightness-110 disabled:opacity-50 ${touch ? 'h-11' : 'h-10'}`}
          >
            <Icon name="lock" className="h-4 w-4" />
            {t.lock}
          </button>
        </>
      ) : (
        <>
          {task.predict && <PredictionStatus task={task} statuses={statuses} predictions={predictions} started={started} />}
          <button type="button" onClick={onSubmit} className={`flex items-center justify-center gap-2 rounded-xl border border-line-2 text-small font-semibold hover:bg-panel-2 ${touch ? 'h-11' : 'h-10'}`}>
            <Icon name="download" className="h-4 w-4" />
            {t.submit}
          </button>
        </>
      )}
      <p className="m-0 flex gap-1.5 text-label leading-snug text-muted">
        <Icon name="info" className="mt-px h-3.5 w-3.5 shrink-0" />
        {t.note}
      </p>
      <button type="button" onClick={onExit} className={`self-start text-label font-medium text-accent-ink hover:underline ${touch ? 'min-h-11' : ''}`}>
        {t.exit}
      </button>
    </section>
  );
}

/**
 * Tahminler kaydedildikten sonraki satır: "Oynat'a bas" → devre çalışınca "Ölçülüyor…" → hedeflerin
 * hepsi ölçülünce karşılaştırma sonucu (kaç tahmin ölçülenle uyuştu).
 */
function PredictionStatus({ task, statuses, predictions, started }: { task: TaskDef; statuses: readonly TargetStatus[]; predictions: Predictions; started: boolean }) {
  const t = tr.task.card;
  if (statuses.length > 0 && statuses.every((s) => s.measured !== null)) {
    const agreed = statuses.filter((s) => {
      const target = task.targets.find((x) => x.id === s.id);
      const prediction = predictions.values[s.id];
      return target !== undefined && prediction !== undefined && predictionAgrees(target, prediction, s.measured);
    }).length;
    return <p className="m-0 text-small font-semibold text-ink">{t.compared(agreed, statuses.length)}</p>;
  }
  return <p className={`m-0 text-label ${started ? 'text-ink-2' : 'text-ok-ink'}`}>{started ? t.measuring : t.locked}</p>;
}

/**
 * Tahmin alanı: "6 V", "5,9", "500k"; birim hedefinki (dB'de birimsiz). Yazarken geçerli sayı hemen
 * sayılır (sayaç ve "Tahminleri kaydet"); geçersiz yazı uyarısı kutudan çıkınca gösterilir.
 */
function PredictionInput({ status, value, touch, onValue }: { status: TargetStatus; value: number | undefined; touch: boolean; onValue: (v: number | null) => void }) {
  const t = tr.task.card;
  const [text, setText] = useState(() => (value !== undefined ? valueText(value, status.unit) : ''));
  const [invalid, setInvalid] = useState(false);
  return (
    <span className="flex w-28 shrink-0 flex-col items-end gap-0.5">
      <input
        aria-label={t.predictLabel(plainText(status.name))}
        aria-invalid={invalid}
        placeholder={status.unit || '–'}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const next = e.target.value;
          setText(next);
          const read = readPrediction(next, status.unit);
          onValue(read.value);
          if (!read.invalid) setInvalid(false);
        }}
        onBlur={() => {
          const read = readPrediction(text, status.unit);
          setInvalid(read.invalid);
          if (read.value !== null) setText(valueText(read.value, status.unit));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className={`w-full rounded-lg border bg-panel px-2 text-right font-mono ${invalid ? 'border-warn' : 'border-line-2'} ${touch ? 'h-11 text-[16px]' : 'h-9 text-sm'}`}
      />
      {invalid && <span className="text-label text-warn">{t.invalid}</span>}
    </span>
  );
}
