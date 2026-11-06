// Şemadan seçerken yönerge (analiz): ilk tıklama bekleniyor ya da bir düğüm seçildi, fark gerilimi için
// ikincisi bekleniyor ("Toprağa göre ekle"). Zaman grafiğinin iz listesinde ve başlangıç ekranında.

import { tr } from '../../i18n/tr';
import type { AnalysisApi } from './useAnalysis';

export function PickControls({ api, touch }: { api: AnalysisApi; touch: boolean }) {
  const t = tr.analysis.graph;
  const small = `rounded-lg px-3 text-small font-semibold ${touch ? 'h-11' : 'h-9'}`;
  if (!api.pick) return null;
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-accent-line bg-accent-soft p-2.5 text-small text-accent-ink">
      <span>{api.pick.stage === 'second' ? t.pickSecond(api.pick.name) : t.picking}</span>
      <span className="flex flex-wrap gap-1.5">
        {api.pick.stage === 'second' && (
          <button type="button" onClick={api.addPendingNode} className={`${small} bg-accent text-white`}>
            {t.groundAdd}
          </button>
        )}
        <button type="button" onClick={api.cancelPick} className={`${small} border border-accent-line bg-panel text-ink`}>
          {t.cancel}
        </button>
      </span>
    </div>
  );
}
