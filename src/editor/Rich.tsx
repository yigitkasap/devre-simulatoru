// Formüllerdeki alt simgeler. Metinlerde alt simge `_{...}` ile işaretlenir ve ekranda
// gerçek alt simge (<sub>) olarak çizilir: "R_{iç}" → R<sub>iç</sub>.

import { Fragment, type ReactNode } from 'react';

const SUBSCRIPT = /_\{([^}]*)\}/g;

export function Rich({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(SUBSCRIPT)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(text.slice(last, index));
    nodes.push(
      <sub key={index} className="text-[0.8em]">
        {match[1]}
      </sub>,
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return <Fragment>{nodes}</Fragment>;
}

/** Düz metin gereken yerler için (title, aria-label): "R_{iç}" → "Riç". */
export function plainText(text: string): string {
  return text.replace(SUBSCRIPT, '$1');
}
