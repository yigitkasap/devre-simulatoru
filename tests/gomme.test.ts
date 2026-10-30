// Gömme (C4, C5, C8): /embed/ adresinin parametreleri, örnek adıyla ya da # kısmında devre, iframe kodu;
// salt okunur kural (görevdeki kilitle aynı: anahtar açılıp kapanır, parça silinemez).

import { describe, expect, it } from 'vitest';
import { exampleDoc } from '../src/examples';
import { DEFAULT_EMBED, embedSrc, iframeCode, parseEmbedParams } from '../src/model/embed';
import { docFromHash } from '../src/model/share';
import { respectsTask } from '../src/model/task';

const PAGE = 'https://yigitkasap.github.io/devre-simulatoru/';
const rc = exampleDoc('rc-dolma')!;

describe('Gömme', () => {
  it('varsayılan ayarlarla örnek: tasarımdaki adres ve iframe kodu', () => {
    const src = embedSrc(PAGE, DEFAULT_EMBED, { example: 'rc-dolma' });
    expect(src).toBe('https://yigitkasap.github.io/devre-simulatoru/embed/?ornek=rc-dolma&salt-okunur=1');
    expect(iframeCode(src, 560, 'Devre simülatörü: RC dolma')).toBe(
      [
        '<iframe src="https://yigitkasap.github.io/devre-simulatoru/embed/?ornek=rc-dolma&salt-okunur=1"',
        '  width="100%" height="560" style="border: 0"',
        '  allow="fullscreen" loading="lazy"',
        '  title="Devre simülatörü: RC dolma"></iframe>',
      ].join('\n'),
    );
    expect(iframeCode(src, 400, 'a "b" <c>')).toContain('title="a &quot;b&quot; &lt;c>"');
  });

  it('adres ayarları geri okunur; yalnız varsayılandan farklı olanlar yazılır; tam uygulamada şerit ayarı yok', () => {
    const options = { view: 'sade', readOnly: false, controls: false, notebook: true, fullLink: false } as const;
    const src = embedSrc(`${PAGE}#d=eski`, options, { example: 'rc-dolma' });
    expect(src).toBe(`${PAGE}embed/?ornek=rc-dolma&oynat=0&defter=1&tam-ekran=0`);
    expect(parseEmbedParams(new URL(src).search)).toEqual({ ...options, example: 'rc-dolma' });
    expect(parseEmbedParams('?ornek=rc-dolma&salt-okunur=1')).toEqual({ ...DEFAULT_EMBED, example: 'rc-dolma' });
    expect(embedSrc(PAGE.slice(0, -1), { ...options, view: 'tam', readOnly: true }, { example: 'x' })).toBe(`${PAGE}embed/?ornek=x&salt-okunur=1&gorunum=tam`);
  });

  it('kendi devresi # kısmında; adresten aynı devre okunur', () => {
    const changed = { ...rc, parts: rc.parts.map((p) => (p.label === 'R1' ? { ...p, props: { ...p.props, resistance: 2200 } } : p)) };
    const src = embedSrc(PAGE, DEFAULT_EMBED, { doc: changed });
    expect(src).toMatch(/^https:\/\/yigitkasap\.github\.io\/devre-simulatoru\/embed\/\?salt-okunur=1#d=/);
    const back = docFromHash(new URL(src).hash)!;
    expect(back.parts.find((p) => p.label === 'R1')!.props.resistance).toBe(2200);
  });

  it('salt okunur: anahtar açılıp kapanır, ölçü aletinin ayarı değişir; parça değeri, silme ve kablo değişmez', () => {
    const readOnly = { name: '', instruction: '', editable: [], allowNew: false, targets: [] };
    const change = (label: string, props: Record<string, number | string | boolean>) => ({ ...rc, parts: rc.parts.map((p) => (p.label === label ? { ...p, props: { ...p.props, ...props } } : p)) });
    expect(respectsTask(rc, change('S1', { closed: true }), readOnly)).toBe(true);
    expect(respectsTask(rc, change('R1', { resistance: 2200 }), readOnly)).toBe(false);
    expect(respectsTask(rc, { ...rc, parts: rc.parts.filter((p) => p.label !== 'R1') }, readOnly)).toBe(false);
    expect(respectsTask(rc, { ...rc, wires: rc.wires.slice(1) }, readOnly)).toBe(false);
  });
});
