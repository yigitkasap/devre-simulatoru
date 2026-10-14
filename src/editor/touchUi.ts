// Telefondaki alt sayfalarda yeniden kullanılan panel bileşenleri (İncele, Örnek, Mesajlar) dokunmatik
// boyutlara geçer: dokunma hedefleri en az 44 px, yazı alanları en az 16 px (iOS yakınlaştırmasın).

import { createContext, useContext } from 'react';

export const TouchUi = createContext(false);

export function useTouchUi(): boolean {
  return useContext(TouchUi);
}
