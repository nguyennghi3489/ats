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
