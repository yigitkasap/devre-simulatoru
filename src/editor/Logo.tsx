// Sitenin simgesi ("düğüm dalgası"): koyu kare, beyaz dalga, iki ucunda turuncu düğüm. Üst çubukta,
// telefonun üst çubuğunda ve gömme çubuğunda. Renkler global.css'teki --color-logo-* belirteçleri (koyu
// temada karenin 1 px kenarı); public/favicon.svg aynı çizimin 16 px için kalınlaştırılmış kopyası.

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-logo-bg)" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" fill="none" stroke="var(--color-logo-frame)" vectorEffect="non-scaling-stroke" />
      <path d="M8 16C10.5 8.5 13.5 8.5 16 16S21.5 23.5 24 16" fill="none" stroke="var(--color-logo-wave)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="8" cy="16" r="2.6" fill="var(--color-logo-dot)" />
      <circle cx="24" cy="16" r="2.6" fill="var(--color-logo-dot)" />
    </svg>
  );
}
