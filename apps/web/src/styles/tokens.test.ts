// Node types for this test only: it reads stylesheets and .vue sources from disk.
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Vitest stubs CSS imports (even `?raw`), so the stylesheets are read from disk.
const stylesheet = (name: string) => readFileSync(join(process.cwd(), 'src/styles', name), 'utf8');
const tokensCss = stylesheet('tokens.css');
const baseCss = stylesheet('base.css');
const fontsCss = stylesheet('fonts.css');

// Values read from docs/design/01-foundations: "ATS / Foundations", "Light specimen", "Dark specimen",
// "Opacity token unit verification", and the dialog/button/navigation specimens that use them.
const LIGHT: Record<string, string> = {
  '--color-canvas': '#F7F7F2',
  '--color-surface': '#FFFFFF',
  '--color-field-surface': '#FCFCFA',
  '--color-control': '#FFFFFF',
  '--color-ink': '#292822',
  '--color-muted': '#66645D',
  '--color-line': '#B1AFA5',
  '--color-sidebar': '#EEE9FB',
  '--color-accent': '#E7E1FB',
  '--color-action': '#D7ED99',
  '--color-action-ink': '#292822',
  '--color-action-line': '#798752',
  '--color-danger': '#A42929',
  '--color-info-surface': '#E7E1FB',
  '--color-info-ink': '#292822',
  '--color-success-surface': '#E4F0D3',
  '--color-success-ink': '#292822',
  '--color-success-icon': '#798752',
  '--color-error-surface': '#F8E2DF',
  '--color-error-ink': '#292822',
  '--color-focus-ring': '#292822',
};

const DARK: Record<string, string> = {
  '--color-canvas': '#222320',
  '--color-surface': '#2A2B27',
  '--color-field-surface': '#32332E',
  '--color-control': '#32332E',
  '--color-ink': '#F4F1E8',
  '--color-muted': '#C0BEB5',
  '--color-line': '#76776C',
  '--color-sidebar': '#2E2C32',
  '--color-accent': '#494252',
  '--color-action': '#CADD96',
  '--color-action-ink': '#292822',
  '--color-action-line': '#798752',
  '--color-danger': '#FFB5AC',
  '--color-info-surface': '#494252',
  '--color-info-ink': '#F4F1E8',
  '--color-success-surface': '#2A2B27',
  '--color-success-ink': '#F4F1E8',
  '--color-success-icon': '#CADD96',
  '--color-error-surface': '#2A2B27',
  '--color-error-ink': '#F4F1E8',
  '--color-focus-ring': '#F4F1E8',
};

const SCALE: Record<string, string> = {
  '--space-1': '4px',
  '--space-2': '8px',
  '--space-3': '12px',
  '--space-4': '16px',
  '--space-6': '24px',
  '--space-8': '32px',
  '--radius-sm': '2px',
  '--font-size-xs': '12px',
  '--font-size-sm': '14px',
  '--font-size-lg': '18px',
  '--font-size-xl': '24px',
  '--font-weight-regular': '400',
  '--font-weight-medium': '500',
  '--font-weight-bold': '700',
  '--focus-ring-width': '3px',
  '--focus-ring-offset': '0',
  '--opacity-disabled': '0.45',
  '--touch-target-min': '44px',
};

const HEX = /#[0-9a-fA-F]{3,8}\b/;

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

describe('design tokens', () => {
  let style: HTMLStyleElement;

  beforeEach(() => {
    style = document.createElement('style');
    style.textContent = tokensCss;
    document.head.append(style);
  });

  afterEach(() => {
    style.remove();
    document.documentElement.removeAttribute('data-theme');
  });

  it.each(Object.entries(LIGHT))('light %s is %s', (name, value) => {
    expect(token(name).toUpperCase()).toBe(value);
  });

  it.each(Object.entries(DARK))('dark %s is %s once data-theme="dark" is set', (name, value) => {
    document.documentElement.setAttribute('data-theme', 'dark');

    expect(token(name).toUpperCase()).toBe(value);
  });

  it('switches back to light when the dark attribute is removed', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(token('--color-canvas').toUpperCase()).toBe(DARK['--color-canvas']);

    document.documentElement.removeAttribute('data-theme');
    expect(token('--color-canvas').toUpperCase()).toBe(LIGHT['--color-canvas']);
  });

  it('defines every colour token for both themes', () => {
    const declared = (block: string) =>
      [...block.matchAll(/(--color-[a-z-]+)\s*:/g)].map((match) => match[1]).sort();
    const [light, dark] = tokensCss.split(
      /:root\[data-theme=['"]dark['"]\],\s*\[data-theme=['"]dark['"]\]\s*\{/,
    );

    expect(declared(light!)).toEqual(Object.keys(LIGHT).sort());
    expect(declared(dark!)).toEqual(Object.keys(DARK).sort());
  });

  it('applies dark colours to the subtree of any element with data-theme="dark"', () => {
    const panel = document.createElement('div');
    panel.setAttribute('data-theme', 'dark');
    document.body.append(panel);

    const value = getComputedStyle(panel).getPropertyValue('--color-canvas').trim();
    panel.remove();

    expect(value.toUpperCase()).toBe(DARK['--color-canvas']);
    expect(token('--color-canvas').toUpperCase()).toBe(LIGHT['--color-canvas']);
  });

  it('applies light colours to the subtree of data-theme="light" inside a dark page', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const panel = document.createElement('div');
    panel.setAttribute('data-theme', 'light');
    document.body.append(panel);

    const value = getComputedStyle(panel).getPropertyValue('--color-ink').trim();
    panel.remove();

    expect(value.toUpperCase()).toBe(LIGHT['--color-ink']);
  });

  it.each(Object.entries(SCALE))('%s is %s in both themes', (name, value) => {
    expect(token(name)).toBe(value);
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(token(name)).toBe(value);
  });

  it('puts Be Vietnam Pro first in the font stack with system fallbacks', () => {
    const stack = token('--font-family-sans');

    expect(stack.startsWith("'Be Vietnam Pro'")).toBe(true);
    expect(stack).toMatch(/system-ui/);
    expect(stack).toMatch(/sans-serif$/);
  });
});

describe('base stylesheet', () => {
  it('takes every colour from tokens, never a raw hex', () => {
    expect(baseCss).not.toMatch(HEX);
  });

  it('uses the token font stack and token colours on body', () => {
    const body = /\bbody\s*\{([^}]*)\}/.exec(baseCss)?.[1] ?? '';

    expect(body).toMatch(/font-family:\s*var\(--font-family-sans\)/);
    expect(body).toMatch(/background(-color)?:\s*var\(--color-canvas\)/);
    expect(body).toMatch(/color:\s*var\(--color-ink\)/);
  });

  it('draws the focus-visible ring from tokens', () => {
    const focus = /:focus-visible\s*\{([^}]*)\}/.exec(baseCss)?.[1] ?? '';

    expect(focus).toMatch(/var\(--focus-ring-width\)/);
    expect(focus).toMatch(/var\(--color-focus-ring\)/);
    expect(focus).toMatch(/outline-offset:\s*var\(--focus-ring-offset\)/);
  });
});

describe('fonts', () => {
  it('self-hosts only the weights the design uses', () => {
    const imports = [...fontsCss.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(imports).toEqual([
      '@fontsource/be-vietnam-pro/400.css',
      '@fontsource/be-vietnam-pro/500.css',
      '@fontsource/be-vietnam-pro/700.css',
    ]);
  });

  it('never points at a third-party font host', () => {
    expect(fontsCss).not.toMatch(/https?:\/\//);
    expect(baseCss).not.toMatch(/https?:\/\//);
    expect(tokensCss).not.toMatch(/https?:\/\//);
  });

  it('ships the Vietnamese subset of each imported weight', () => {
    for (const weight of [400, 500, 700]) {
      const css = readFileSync(
        join(process.cwd(), 'node_modules/@fontsource/be-vietnam-pro', `${weight}.css`),
        'utf8',
      );
      expect(css).toContain(`be-vietnam-pro-vietnamese-${weight}-normal.woff2`);
      expect(css).not.toMatch(/https?:\/\//);
    }
  });
});

describe('app entry', () => {
  it('imports the fonts, tokens and base stylesheets once, before the app mounts', () => {
    const main = readFileSync(join(process.cwd(), 'src/main.ts'), 'utf8');
    const styles = [...main.matchAll(/^import\s+['"](\.\/styles\/[^'"]+)['"];$/gm)].map(
      (match) => match[1],
    );

    expect(styles).toEqual(['./styles/fonts.css', './styles/tokens.css', './styles/base.css']);
  });
});

describe('components', () => {
  it('use semantic tokens instead of raw hex colours', () => {
    const src = join(process.cwd(), 'src');
    const vueFiles = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((file) =>
      file.endsWith('.vue'),
    );
    const offenders = vueFiles.filter((file) => HEX.test(readFileSync(join(src, file), 'utf8')));

    expect(offenders).toEqual([]);
  });
});
