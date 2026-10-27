// Arduino'nun işlemcisiz (avr8js'siz) ortak tanımları: devre modeli bunları ilk açılışta kullanır,
// işlemcinin kendisi (mcu.ts) yalnızca devrede Arduino varken yüklenir (runtime.ts).

export const MCU_FREQUENCY = 16e6;

/** Bir pinin işlemci tarafındaki durumu: giriş, çekme dirençli giriş, düşük ya da yüksek çıkış. */
export const PinMode = {
  Input: 0,
  PullUp: 1,
  Low: 2,
  High: 3,
} as const;
export type PinMode = (typeof PinMode)[keyof typeof PinMode];
