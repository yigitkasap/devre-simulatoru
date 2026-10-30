// Sayfaya gömme (C4, C5, C8; N7, N8): /embed/ adresinin parametreleri ve iframe kodu. Hazır örnek
// adıyla (?ornek=rc-dolma), kendi devresi # kısmında sıkıştırılmış (#d=…, paylaşım bağlantısı gibi).
// Gömülü görünüm hiçbir şeyi kaydetmez: tarayıcıdaki otomatik kayda dokunmaz.

import { encodeDoc } from './share';
import type { CircuitDoc } from './types';

export interface EmbedOptions {
  /** Sade: yalnız tezgâh ve ince üst şerit; Tam: bütün uygulama. */
  readonly view: 'sade' | 'tam';
  /** Parça ve kablo değişmez (anahtar, potansiyometre gibi kullanma denetimleri ve ölçü aletleri serbest). */
  readonly readOnly: boolean;
  /** Şeritte Oynat ve Başa al. */
  readonly controls: boolean;
  /** Defter paneli (parçaların değerleri ve canlı ölçümler). */
  readonly notebook: boolean;
  /** Şeritte "Simülatörde aç" (yeni sekmede tam uygulama). */
  readonly fullLink: boolean;
}

export const DEFAULT_EMBED: EmbedOptions = { view: 'sade', readOnly: true, controls: true, notebook: false, fullLink: true };
export const DEFAULT_EMBED_HEIGHT = 560;
export const EMBED_HEIGHT_LIMITS = { min: 320, max: 1200 } as const;

/** Adres parametreleri: yalnız varsayılandan farklı olanlar yazılır (salt okunur her zaman açıkça). */
const PARAM = { example: 'ornek', readOnly: 'salt-okunur', view: 'gorunum', controls: 'oynat', notebook: 'defter', fullLink: 'tam-ekran' } as const;

/** /embed/ adresinin sorgu kısmından ayarlar ve (varsa) örneğin adı. Parametresi olmayan ayar varsayılandır; salt okunur yalnız `salt-okunur=1` ile. */
export function parseEmbedParams(search: string): EmbedOptions & { readonly example: string | null } {
  const q = new URLSearchParams(search);
  const flag = (key: string, fallback: boolean) => {
    const v = q.get(key);
    return v === null ? fallback : v === '1';
  };
  return {
    example: q.get(PARAM.example),
    view: q.get(PARAM.view) === 'tam' ? 'tam' : 'sade',
    readOnly: q.get(PARAM.readOnly) === '1',
    controls: flag(PARAM.controls, DEFAULT_EMBED.controls),
    notebook: flag(PARAM.notebook, DEFAULT_EMBED.notebook),
    fullLink: flag(PARAM.fullLink, DEFAULT_EMBED.fullLink),
  };
}

/**
 * Gömülü görünümün adresi. `pageUrl` simülatörün ana sayfası (ör. https://…/devre-simulatoru/).
 * Örnek değişmemişse adıyla, değilse devre # kısmında.
 */
export function embedSrc(pageUrl: string, options: EmbedOptions, source: { readonly example: string } | { readonly doc: CircuitDoc }): string {
  const base = `${pageUrl.split('#')[0]!.split('?')[0]!.replace(/\/?$/, '/')}embed/`;
  const q: string[] = [];
  if ('example' in source) q.push(`${PARAM.example}=${encodeURIComponent(source.example)}`);
  if (options.readOnly) q.push(`${PARAM.readOnly}=1`);
  if (options.view === 'tam') q.push(`${PARAM.view}=tam`);
  if (options.view === 'sade') {
    if (options.controls !== DEFAULT_EMBED.controls) q.push(`${PARAM.controls}=${options.controls ? 1 : 0}`);
    if (options.notebook !== DEFAULT_EMBED.notebook) q.push(`${PARAM.notebook}=${options.notebook ? 1 : 0}`);
    if (options.fullLink !== DEFAULT_EMBED.fullLink) q.push(`${PARAM.fullLink}=${options.fullLink ? 1 : 0}`);
  }
  const query = q.length > 0 ? `?${q.join('&')}` : '';
  return 'doc' in source ? `${base}${query}#d=${encodeDoc(source.doc)}` : `${base}${query}`;
}

/** Sayfaya yapıştırılacak iframe kodu (tasarımdaki biçim: N7). */
export function iframeCode(src: string, height: number, title: string): string {
  // & olduğu gibi kalır (tasarımdaki gibi okunaklı; "&salt-okunur" bir HTML adı değil), tırnak ve < kaçırılır.
  const attr = (s: string) => s.replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return [
    `<iframe src="${attr(src)}"`,
    `  width="100%" height="${Math.round(height)}" style="border: 0"`,
    `  allow="fullscreen" loading="lazy"`,
    `  title="${attr(title)}"></iframe>`,
  ].join('\n');
}
