# UI components

Shared components drawn from the design page `01 · Foundations`. Product screens build on these; a
component nests the existing ones (for example `AtsIcon`) instead of drawing its own.

## Naming rule

Each component `<Name>` is three files side by side in this folder:

| File                 | What it is                                                             |
| -------------------- | ---------------------------------------------------------------------- |
| `Ats<Name>.vue`      | The component                                                          |
| `Ats<Name>.spec.ts`  | Its Vitest component tests                                             |
| `Ats<Name>.demo.vue` | Its states for the dev gallery: no props, renders every variant needed |

Colours come from the semantic tokens in `src/styles/tokens.css`, never raw hex (see
`src/styles/README.md`).

## Dev gallery

`pnpm --filter web dev`, then open `/dev/ui`. `src/dev/UiGallery.vue` picks up every `*.demo.vue` under
this folder and renders it three times: in a light panel, in a dark panel (`data-theme="dark"` on the
panel) and in a 360 px wide panel that follows the app theme. The route exists only in development;
a production build answers `/dev/ui` with the 404 page.

## Icons

`<AtsIcon name="trash" />` renders one of the design's `ATS/Icon/*` masters in `currentColor`, so it
takes the text colour around it.

- `name`: one of `archive-box`, `chevron-down`, `close`, `edit`, `empty`, `error`, `info`, `profile`,
  `spinner`, `success`, `trash`. Any other name is a type error.
- `size`: width and height in px, default `16`. The design sizes are 14 (chevron down), 20 (info,
  success, error) and 32 (empty); the rest are 16.
- `label`: accessible name. Without it the icon is decorative (`aria-hidden="true"`); with it the SVG
  is `role="img"` with that `aria-label`. Pass a translated string.
- `spinner` rotates, and stops under `prefers-reduced-motion: reduce`.

Path data lives in `icons/index.ts`, one entry per icon on its design grid.

## Button

`<AtsButton @click="save">{{ t('…') }}</AtsButton>` is the design's `ATS / Button`. The label is the
default slot, already translated by the caller; the component holds no text of its own.

- `variant`: `primary` (default, the main action) or `outline` (secondary actions).
- `type`: `button` (default, so it never submits a form by accident) or `submit`.
- `disabled`: the native attribute, so the button takes no focus and emits no `click`.
- `pending`: shows the spinner before the label and sets `aria-busy="true"`. Clicks are swallowed (no
  `click`, no form submit) while the button keeps focus. Pass a pending label yourself if it should
  change (for example "Đang lưu").
- `block`: full width of the parent.
- Desktop 36 px high; below 768 px wide at least `--touch-target-min` (44 px), and long labels wrap
  centred. The 3 px focus ring is drawn inside the border, so the size never changes.

## Icon button

`<AtsIconButton icon="trash" :label="t('…')" @click="remove" />` is the design's `ATS / Icon button`: a
square outline button that shows one icon. It holds no text of its own.

- `icon`: an `AtsIcon` name, drawn at 16 px and centred.
- `label`: required accessible name, already translated. It becomes `aria-label` and the native
  `title`; it is never rendered as text.
- `type`: `button` (default) or `submit`.
- `disabled`: the native attribute, so the button takes no focus and emits no `click`.
- `pending`: swaps the icon for the spinner and sets `aria-busy="true"`. Clicks are swallowed (no
  `click`, no form submit) while the button keeps focus.
- 36 × 36 px on desktop, 44 × 44 px (`--touch-target-min`) below 768 px wide. The 3 px focus ring is
  drawn inside the border, so the size never changes.
