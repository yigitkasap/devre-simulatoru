// Resim olarak dışa aktarma (şema ve Analiz grafikleri): ekrandaki SVG temaya göre çizilir, dışa aktarılan
// her zaman açık temanın renkleriyle ve beyaz zeminle. Tema belirteçleri (var(--…)) açık temanın değerleriyle
// yazılır, sayfanın yazı tipleri (IBM Plex) SVG'nin içine gömülür: SVG dosyası tek başına açılır, PNG'ye
// çevrilirken de yazılar ekrandaki gibi çıkar (resim olarak çizilen SVG sayfanın yazı tiplerini göremez).

/** Dışa aktarılan resimlerin zemini (açık temanın paneli). */
export const EXPORT_BACKGROUND = '#ffffff';

const VAR = /var\((--[\w-]+)\)/g;

let light: Map<string, string> | null = null;

/**
 * Açık temanın belirteçleri, sayfanın stil kurallarından: :root'taki (koyu temanınki :root[data-theme='dark'],
 * yalnızca ekranda) bütün özel özellikler, sırayla (sonraki öncekini ezer). Görünümle oynanmaz.
 */
function lightTheme(): Map<string, string> {
  if (light) return light;
  const map = new Map<string, string>();
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) {
        const selectors = rule.selectorText.split(',').map((x) => x.trim());
        if (!selectors.includes(':root')) continue;
        for (const prop of Array.from(rule.style)) if (prop.startsWith('--')) map.set(prop, rule.style.getPropertyValue(prop).trim());
      } else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {
      // Başka kaynaktan yüklenen sayfa okunamaz.
    }
  }
  light = map;
  return map;
}

/** Açık temanın belirteç değerleri (değerin içindeki var(--…) de çözülür; kurallarda yoksa o anki değer). */
export function lightTokens(names: Iterable<string>): Map<string, string> {
  const theme = lightTheme();
  const current = getComputedStyle(document.documentElement);
  const value = (name: string, depth = 0): string => {
    const v = theme.get(name) ?? current.getPropertyValue(name).trim();
    return depth < 5 ? v.replace(VAR, (_, inner: string) => value(inner, depth + 1)) : v;
  };
  return new Map([...names].map((n) => [n, value(n)]));
}

/**
 * Yazıdaki var(--…) belirteçlerini verilen değerlerle değiştirir (bulunamayan siyah). Yazı tipi adlarındaki
 * çift tırnak tek tırnağa çevrilir: değer bir özniteliğin içine yazılıyor, çift tırnak XML'i bozardı.
 */
export function resolveVars(markup: string, values: ReadonlyMap<string, string>): string {
  return markup.replace(VAR, (_, name: string) => (values.get(name) || '#000000').replace(/"/g, "'"));
}

/** Yazıda geçen belirteçlerin adları. */
export function varNames(markup: string): Set<string> {
  return new Set([...markup.matchAll(VAR)].map((m) => m[1]!));
}

/** Açık temanın renkleriyle: yazıdaki bütün belirteçler açık temanın değerleriyle. */
export function withLightColors(markup: string): string {
  return resolveVars(markup, lightTokens(varNames(markup)));
}

// --- Yazı tipleri -------------------------------------------------------------------------------------------

let fontCss: Promise<string> | null = null;

/** Bir @font-face kuralının adreslerini veri adresiyle değiştirir (adres → data:font/woff2;base64,…). */
export function inlineFontUrls(css: string, data: ReadonlyMap<string, string>): string {
  return css.replace(/url\((["']?)([^"')]+)\1\)/g, (all, _q: string, url: string) => {
    const d = data.get(url);
    return d ? `url("${d}")` : all;
  });
}

function base64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

/** Sayfadaki @font-face kuralları (yazı tipleri veri adresi olarak, bir kez hazırlanır). Okunamazsa boş. */
export function embeddedFontCss(): Promise<string> {
  fontCss ??= (async () => {
    const rules: CSSFontFaceRule[] = [];
    const walk = (list: CSSRuleList) => {
      for (const rule of Array.from(list)) {
        if (rule instanceof CSSFontFaceRule) rules.push(rule);
        else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules);
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        walk(sheet.cssRules);
      } catch {
        // Başka kaynaktan yüklenen sayfa okunamaz (yazı tipi yok sayılır).
      }
    }
    const data = new Map<string, string>();
    for (const rule of rules) {
      for (const m of rule.cssText.matchAll(/url\((["']?)([^"')]+)\1\)/g)) {
        const url = m[2]!;
        if (data.has(url) || url.startsWith('data:')) continue;
        try {
          const response = await fetch(new URL(url, rule.parentStyleSheet?.href ?? document.baseURI).href);
          if (response.ok) data.set(url, `data:font/woff2;base64,${base64(await response.arrayBuffer())}`);
        } catch {
          // Yazı tipi gelmezse sistem yazı tipi kullanılır.
        }
      }
    }
    return rules
      .map((r) => inlineFontUrls(r.cssText, data))
      .filter((css) => css.includes('data:'))
      .join('\n');
  })();
  return fontCss;
}

/**
 * Tek başına açılabilen SVG: açık temanın renkleri, gömülü yazı tipleri, XML ad alanı, piksel boyu.
 * İçerik bir <svg> öğesinin çıktısı (outerHTML) ya da işaretlemesidir.
 */
export async function standaloneSvg(markup: string, width: number, height: number): Promise<string> {
  const fonts = await embeddedFontCss();
  let svg = withLightColors(markup);
  svg = svg.replace(/^<svg\b([^>]*)>/, (_, attrs: string) => {
    const clean = attrs.replace(/\s(width|height|xmlns|style|class)="[^"]*"/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${round(width)}" height="${round(height)}"${clean}>${fonts ? `<style>${escapeXml(fonts)}</style>` : ''}`;
  });
  return svg;
}

const round = (v: number) => Math.round(v * 100) / 100;
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Bağımsız SVG'yi resme çevirir (çizilmeyi bekler). */
async function svgImage(svg: string): Promise<HTMLImageElement | null> {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  try {
    await img.decode();
  } catch {
    return null;
  }
  return img;
}

/**
 * SVG'leri alt alta tek PNG'ye çevirir (Bode'da kazanç ve faz): açık temanın renkleri, beyaz zemin, gömülü
 * yazı tipleri; scale piksel yoğunluğu.
 */
export async function svgsToLightPng(parts: readonly { readonly markup: string; readonly width: number; readonly height: number }[], scale = 2): Promise<Blob | null> {
  if (parts.length === 0) return null;
  const images = await Promise.all(parts.map(async (p) => svgImage(await standaloneSvg(p.markup, p.width, p.height))));
  if (images.some((i) => i === null)) return null;
  const width = Math.max(...parts.map((p) => p.width));
  const height = parts.reduce((h, p) => h + p.height, 0);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = EXPORT_BACKGROUND;
  g.fillRect(0, 0, canvas.width, canvas.height);
  let y = 0;
  parts.forEach((p, i) => {
    g.drawImage(images[i]!, 0, Math.round(y * scale), Math.round(p.width * scale), Math.round(p.height * scale));
    y += p.height;
  });
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
