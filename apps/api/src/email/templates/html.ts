const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

/** Markup produced by the `html` tag: already escaped, so it is inserted as is. */
export class SafeHtml {
  constructor(private readonly markup: string) {}

  toString(): string {
    return this.markup;
  }
}

type HtmlValue = SafeHtml | string | number | readonly HtmlValue[];

function render(value: HtmlValue): string {
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(render).join('');
  return escapeHtml(String(value));
}

/**
 * Template literal tag for email markup. Every interpolated value is HTML-escaped unless it is
 * itself `SafeHtml` (a nested `html` result): html`<p>${name}</p>`.
 */
export function html(strings: TemplateStringsArray, ...values: HtmlValue[]): SafeHtml {
  return new SafeHtml(
    strings.reduce(
      (markup, string, index) =>
        markup + string + (index < values.length ? render(values[index] as HtmlValue) : ''),
      '',
    ),
  );
}
