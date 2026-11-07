// Şemanın çizim biçimi: ekranda (varsayılan) ya da dışa aktarılan resimde (Şemayı indir / yazdır). Dışa
// aktarılırken kablo renkleri her zaman açık temanınki; sade çizimde (o anki değerler kapalı) föy gibi az
// mürekkep: ölçü aletinin boş göstergesi çizilmez, cihazların ekranları beyaz zeminli, ince çerçeveli ve
// koyu yazılı (ayarlı değerler kalır).

import { createContext, useContext } from 'react';

export interface DrawStyle {
  /** Dışa aktarılan resim: renkler açık temanın. */
  readonly exporting: boolean;
  /** Sade çizim: boş gösterge yok, cihaz ekranları siyah-beyaz. */
  readonly plain: boolean;
}

export const DrawStyleContext = createContext<DrawStyle>({ exporting: false, plain: false });

export const useDrawStyle = (): DrawStyle => useContext(DrawStyleContext);
