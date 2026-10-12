// Tüm bileşen modellerinin ortak arayüzü.
//
// Bir zaman adımı şöyle çözülür:
//   1. stampStatic   — adım boyunca değişmeyen katkılar (dirençler, kaynaklar, kondansatörün C/h'si).
//                      Doğrusal devrelerde bu matris aynı h için bir kez LU ayrıştırılır.
//   2. stampStep     — her adımda değişen sağ taraf katkıları (kondansatörün Ieq'su).
//   3. stampNonlinear — Newton-Raphson iterasyonuna bağlı katkılar (diyot, LED).
//   4. updateIterate — NR çözümünden sonra eklem gerilimlerini sınırla/güncelle.
//   5. accept        — adım kabul edilince durumu kaydet (kondansatör gerilimi vb.).

import { MnaSystem, nodeVoltage } from '../mna';
import type { DeviceType, Props } from '../netlist';

export interface StepContext {
  /** Zaman adımı h (s). Kondansatörsüz devrelerde (DC çözüm) 0. */
  readonly h: number;
  /** Bağımsız kaynakların ölçeği (0..1). Yalnızca "kaynak adımlama" yedeğinde 1'den küçüktür. */
  readonly sourceScale: number;
}

export interface Measurement {
  /** Pin 0 ile pin 1 arasındaki gerilim: v(pin0) − v(pin1) (V). */
  readonly voltage: number;
  /** Pin 0'dan girip bileşenin içinden pin 1'e akan akım (A). */
  readonly current: number;
  /** Bileşenin harcadığı güç P = V·I (W). Negatifse bileşen güç veriyordur (ör. pil). */
  readonly power: number;
}

export interface DeviceStatus {
  /** Pil: dış yük iç dirençten küçük (kısa devre). */
  readonly shortCircuit?: boolean;
  /** LED: mutlak en büyük akım aşıldı, LED yandı. */
  readonly burned?: boolean;
  /** LED: yandığı andaki akım (A). */
  readonly burnCurrent?: number;
  /** LED: akım nominal değerin (20 mA) üstünde ama henüz yanmadı. */
  readonly overCurrent?: boolean;
  /** LED: 0..1 arası, gamma düzeltmeli parlaklık. */
  readonly brightness?: number;
}

export interface DeviceInit {
  readonly id: string;
  readonly props: Props;
  /** Önce pin düğümleri, ardından iç düğümler (bilinmeyen indeksi; −1 = toprak). */
  readonly nodes: readonly number[];
  /** Akım bilinmeyenlerinin satırları. */
  readonly branches: readonly number[];
}

export abstract class Device {
  abstract readonly type: DeviceType;
  readonly id: string;
  readonly props: Props;
  readonly nodes: readonly number[];
  readonly branches: readonly number[];

  constructor(init: DeviceInit) {
    this.id = init.id;
    this.props = init.props;
    this.nodes = init.nodes;
    this.branches = init.branches;
  }

  /** Newton-Raphson gerektiren doğrusal olmayan bir bileşen mi? */
  get nonlinear(): boolean {
    return false;
  }

  /** Zamana bağlı (enerji depolayan) bir bileşen mi? */
  get reactive(): boolean {
    return false;
  }

  stampStatic(_sys: MnaSystem, _ctx: StepContext): void {}
  stampStep(_sys: MnaSystem, _ctx: StepContext): void {}
  stampNonlinear(_sys: MnaSystem): void {}

  /** NR çözümünden sonra çağrılır. Bu bileşen yakınsadıysa true döner. */
  updateIterate(_x: Float64Array): boolean {
    return true;
  }

  /** Başarısız bir adım denemesinden sonra NR durumunu son kabul edilen adıma döndürür. */
  restoreIterate(): void {}

  /** Adım kabul edildi: durumu kaydet. */
  accept(_x: Float64Array, _ctx: StepContext): void {}

  /** Akım sınırı aşıldıysa durumu değiştirir (ör. LED yanar) ve true döner. */
  checkLimits(_x: Float64Array): boolean {
    return false;
  }

  /** Topoloji kontrolü için: bu bileşenin içindeki ideal gerilim dalları (düğüm çiftleri). */
  idealVoltageBranches(): Array<readonly [number, number]> {
    return [];
  }

  abstract measure(x: Float64Array): Measurement;

  status(_x: Float64Array): DeviceStatus {
    return {};
  }

  /** Devre yeniden derlendiğinde (ör. değer değişince) önceki örneğin durumunu devralır. */
  adoptState(_prev: Device): void {}

  /** Yanmış bir bileşeni onarır; durum değiştiyse true döner. */
  repair(): boolean {
    return false;
  }

  protected v(x: Float64Array, nodeIndex: number): number {
    return nodeVoltage(x, this.nodes[nodeIndex]!);
  }

  /** İki uçlu bileşenler için ortak ölçüm: V = v0 − v1, P = V·I. */
  protected twoTerminal(x: Float64Array, current: number): Measurement {
    const voltage = this.v(x, 0) - this.v(x, 1);
    return { voltage, current, power: voltage * current };
  }
}

export interface DeviceModel {
  readonly type: DeviceType;
  readonly pinCount: number;
  /** Bileşenin kendine ait iç düğüm sayısı (ör. pilin ideal kaynak ile iç direnci arasındaki düğüm). */
  readonly internalNodes: number;
  /** MNA'ya eklediği akım bilinmeyeni sayısı. */
  readonly branchCount: number;
  create(init: DeviceInit): Device;
}
