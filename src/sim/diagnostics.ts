// Topoloji kontrollerinin ve simülasyonun ürettiği hata/uyarılar.
// Çözücü metin üretmez; yalnızca kod ve sayısal parametre döndürür. Türkçe metinler
// src/i18n/tr.ts içindedir.

/** Hata simülasyonu başlatmaz; uyarı ve bilgi başlatır (bilgi: bir sorun değil, açıklama). */
export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticCode =
  /** Toprak sembolü var ama devreye bağlı değil (uyarı; toprak isteğe bağlıdır). */
  | 'ground-unconnected'
  /** Yalnızca ideal gerilim kaynakları, ideal ampermetreler ve kablolardan oluşan döngü. */
  | 'voltage-loop'
  /** Bir bileşenin bir ucu hiçbir yere bağlı değil. */
  | 'floating-pin'
  /** Toprak varken devrenin bir parçası toprağa bağlı değil; gerilimleri kendi sıfır noktasına göre (bilgi). */
  | 'floating-island'
  /** Ampermetre doğrudan bir pilin iki ucuna bağlanmış. */
  | 'ammeter-parallel'
  /** Pilden, iç direncine göre çok büyük akım çekiliyor. */
  | 'short-circuit'
  /** LED'den mutlak en büyük değerinden fazla akım geçti ve LED yandı. */
  | 'led-burned'
  /** Newton-Raphson en küçük zaman adımında da yakınsamadı. */
  | 'nr-failed'
  /** LU ayrıştırmasında sıfır pivot (tekil matris). */
  | 'singular-matrix';

export interface Diagnostic {
  readonly severity: DiagnosticSeverity;
  readonly code: DiagnosticCode;
  /** İlgili bileşenler; arayüz bunları tuvalde vurgular. */
  readonly elementIds: readonly string[];
  /** İlgili ağların anahtarları; arayüz bu ağlardaki kabloları vurgular. */
  readonly netKeys: readonly string[];
  /** Boşta uç uyarısında hangi pin olduğu. */
  readonly pin?: number;
  /** Mesajda kullanılacak sayısal değerler (akım, gerilim...). */
  readonly params?: Readonly<Record<string, number>>;
}

export function hasErrors(list: readonly Diagnostic[]): boolean {
  return list.some((d) => d.severity === 'error');
}
