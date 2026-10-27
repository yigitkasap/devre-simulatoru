// Arduino işlemcisinin (avr8js + derlenmiş programlar) tembel yüklenmesi. Devre modeli
// (devices/arduino.ts) işlemciyi buradan ister; henüz yüklenmediyse yüklemeyi başlatır ve o ana
// kadar kart çalışmıyor (pinleri giriş) sayılır. Arayüz devrede Arduino görünce önceden yükler;
// testler ve taramalar `./load` modülünü doğrudan içe aktarır.

import type { Atmega328 } from './mcu';

export interface ArduinoRuntime {
  /** Programı yüklenmiş yeni bir işlemci; bilinmeyen programda null. */
  create(program: string): Atmega328 | null;
}

let runtime: ArduinoRuntime | null = null;
let loading: Promise<void> | null = null;

export function setArduinoRuntime(next: ArduinoRuntime): void {
  runtime = next;
}

export function arduinoRuntime(): ArduinoRuntime | null {
  return runtime;
}

export function loadArduinoRuntime(): Promise<void> {
  loading ??= import('./load').then(() => undefined);
  return loading;
}
