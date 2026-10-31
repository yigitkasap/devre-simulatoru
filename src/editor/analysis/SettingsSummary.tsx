// Telefonda Bode ve Eğri izleyicinin ayarları (analiz düzeltmeleri, 7): ölçüm ya da tarama bitince tek
// satırlık özete kapanır, grafik öne çıkar; "Düzenle" ayarları yeniden açar. Bir sonraki ölçüm bitince
// yine kapanır.

import { useEffect, useRef, useState } from 'react';
import { tr } from '../../i18n/tr';
import { Icon } from '../icons';
import { plainText, Rich } from '../Rich';
import { useTouchUi } from '../touchUi';

/** Düzenleniyor mu: ölçüm / tarama (busy) bitince kendiliğinden false olur. */
export function useSettingsEditing(busy: boolean): [boolean, (on: boolean) => void] {
  const [editing, setEditing] = useState(false);
  const wasBusy = useRef(busy);
  useEffect(() => {
    if (wasBusy.current && !busy) setEditing(false);
    wasBusy.current = busy;
  }, [busy]);
  return [editing, setEditing];
}

export function SettingsSummary({ text, onEdit }: { text: string; onEdit: () => void }) {
  const touch = useTouchUi();
  const t = tr.analysis;
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-panel-2 py-1 pr-1 pl-3">
      <span className="min-w-0 flex-1 truncate text-label text-ink-2">
        <Rich text={text} />
      </span>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t.editSettingsLabel(plainText(text))}
        className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 text-label font-semibold text-accent-ink hover:bg-accent-soft ${touch ? 'h-11' : 'h-8'}`}
      >
        <Icon name="settings" className="h-4 w-4" />
        {t.editSettings}
      </button>
    </div>
  );
}
