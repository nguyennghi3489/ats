# Styles

Global stylesheets, imported once in `src/main.ts` in this order:

| File         | What it holds                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| `fonts.css`  | Be Vietnam Pro 400 / 500 / 700, self-hosted from `@fontsource/be-vietnam-pro` |
| `tokens.css` | Design tokens as CSS custom properties on `:root`, with dark overrides        |
| `base.css`   | Minimal reset, body font and colours, the `:focus-visible` ring               |

Values come from the design page `01 · Foundations` (ATS / Foundations, Light and Dark specimens,
Opacity token unit verification). `tokens.test.ts` pins each value to the design.

## Naming rule

Components use **semantic token names, never raw hex** (or `rgb()`, or named colours). Write
`color: var(--color-muted)`, not `color: #66645D`. A raw colour skips dark mode and drifts from the
design. `tokens.test.ts` fails if any `.vue` file under `src/` contains a hex colour.

- Colours: `--color-<role>`, where the role says what the colour is for, not what it looks like:
  `--color-surface`, `--color-ink`, `--color-danger`. Paired roles add a suffix: `-surface` for the
  background, `-ink` for text on it, `-line` for its border, `-icon` for its icon
  (`--color-success-surface`, `--color-success-ink`, `--color-success-icon`).
- Everything else: `--<category>-<step>`: `--space-4`, `--radius-sm`, `--font-size-sm`,
  `--line-height-sm`, `--font-weight-medium`, `--opacity-disabled`, `--touch-target-min`.
- Spacing steps are multiples of 4 px: `--space-1` is 4 px, `--space-6` is 24 px. The design uses
  only 4 / 8 / 12 / 16 / 24 / 32 px.
- Pair each font size with the line height of the same step (`--font-size-sm` with `--line-height-sm`).
- Need a value that is missing? Add a semantic token here for both themes, rather than a literal in a
  component.

## Themes

Light is the default. Dark mode is `data-theme="dark"` on `<html>`; it overrides only the `--color-*`
tokens and `color-scheme`. Every colour token must be defined in both blocks (the test checks this).
Setting and saving the theme is a separate feature; these stylesheets only react to the attribute.

## Tokens

| Token                                         | Light                       | Dark      | Use                                       |
| --------------------------------------------- | --------------------------- | --------- | ----------------------------------------- |
| `--color-canvas`                              | `#F7F7F2`                   | `#222320` | Page background                           |
| `--color-surface`                             | `#FFFFFF`                   | `#2A2B27` | Cards, dialogs, panels                    |
| `--color-field-surface`                       | `#FCFCFA`                   | `#32332E` | Text fields, selects, textareas           |
| `--color-control`                             | `#FFFFFF`                   | `#32332E` | Secondary buttons, neutral controls       |
| `--color-sidebar`                             | `#EEE9FB`                   | `#2E2C32` | Sidebar, hovered navigation item          |
| `--color-accent`                              | `#E7E1FB`                   | `#494252` | Selected navigation item, hovered button  |
| `--color-ink`                                 | `#292822`                   | `#F4F1E8` | Body text, headings                       |
| `--color-muted`                               | `#66645D`                   | `#C0BEB5` | Secondary text, metadata                  |
| `--color-line`                                | `#B1AFA5`                   | `#76776C` | Borders, dividers                         |
| `--color-action`                              | `#D7ED99`                   | `#CADD96` | Primary button fill                       |
| `--color-action-ink`                          | `#292822`                   | `#292822` | Text on the primary button                |
| `--color-action-line`                         | `#798752`                   | `#798752` | Primary border, pressed state, active tab |
| `--color-danger`                              | `#A42929`                   | `#FFB5AC` | Destructive actions, error title and icon |
| `--color-info-surface` / `-ink`               | `#E7E1FB`                   | `#494252` | Info notice                               |
| `--color-success-surface` / `-ink` / `-icon`  | `#E4F0D3`                   | `#2A2B27` | Success notice                            |
| `--color-error-surface` / `-ink`              | `#F8E2DF`                   | `#2A2B27` | Error notice                              |
| `--color-focus-ring`                          | `#292822`                   | `#F4F1E8` | Focus outline                             |
| `--focus-ring-width` / `--focus-ring-offset`  | `3px` / `0`                 |           | Focus outline geometry                    |
| `--opacity-disabled`                          | `0.45`                      |           | Disabled controls                         |
| `--touch-target-min`                          | `44px`                      |           | Minimum hit area on mobile                |
| `--radius-sm` / `--radius-full`               | `2px` / `9999px`            |           | Controls, notices, dialogs / round marks  |
| `--font-size-xs` / `-sm` / `-lg` / `-xl`      | `12` / `14` / `18` / `24px` |           | Labels / body / titles / page titles      |
| `--font-weight-regular` / `-medium` / `-bold` | `400` / `500` / `700`       |           | Body / labels and buttons / titles        |

## Fonts

Be Vietnam Pro is bundled by Vite from `@fontsource/be-vietnam-pro`; no request goes to a font CDN.
Each weight file declares the Vietnamese, Latin Extended and Latin subsets with `unicode-range`, so the
browser fetches only the subsets a page needs. Add a weight only when the design uses it.
