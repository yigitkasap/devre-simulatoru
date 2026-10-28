// Hata, uyarı ve bilgi mesajlarının ortak parçaları (defterin sorun kartları): önem işareti (renkle
// birlikte biçim de ayrılır: dolu daire / üçgen / i) ve düzeltme düğmesinin türü.

import type { MessageSeverity } from './messages';

/** Seçili mesajın altındaki düzeltme düğmesi (Onar, "R1'i 360 Ω yap"). */
export interface MessageAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly run: () => void;
}

export function SeverityMark({ severity, size = 20 }: { severity: MessageSeverity; size?: number }) {
  if (severity === 'info') {
    return (
      <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
        <circle cx="10" cy="10" r="9" fill="var(--color-info-ink)" />
        <path d="M10 9v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
        <circle cx="10" cy="5.8" r="1.2" fill="white" />
      </svg>
    );
  }
  return severity === 'error' ? (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      <circle cx="10" cy="10" r="9" fill="var(--color-danger)" />
      <path d="M10 5.5v5.5" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <circle cx="10" cy="14.2" r="1.2" fill="white" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 20 20" className="shrink-0" aria-hidden="true">
      <path d="M10 1.5l9 16H1z" fill="var(--color-paused)" stroke="var(--color-warn)" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M10 7v5" stroke="var(--color-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10" cy="14.6" r="1" fill="var(--color-ink)" />
    </svg>
  );
}
