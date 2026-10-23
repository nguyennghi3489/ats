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

## Tabs

`<AtsTabs v-model="section" :label="t('…')"><AtsTab value="plan" :label="t('…')" /></AtsTabs>` is the
design's `ATS / Tab` row. Labels come from the caller, already translated (stage names are data and
stay as they are); the components hold no text of their own.

- `AtsTabs`: `role="tablist"`; `v-model` is the selected tab's `value`; `label` is the row's
  accessible name. Arrow Left/Right move focus and selection to the previous/next enabled tab
  (wrapping), Home/End to the first/last; disabled tabs are skipped.
- `AtsTab`: `value`, `label`, `disabled`. Renders `role="tab"` with `aria-selected`; only the selected
  tab (or the first enabled one when nothing is selected) has `tabindex="0"`. Pass `aria-controls` to
  point at the panel. Disabled is `aria-disabled`, so a disabled selected tab keeps the Tab stop.
  With `href` the tab is an `<a>` (tabs with their own URL): a plain click selects it and the caller
  navigates on the `v-model` change; Ctrl/Cmd/Shift/Alt-click is left to the browser.
- Selected: bold label and a 2 px underline; the underline space is reserved in every state, so the
  row never shifts. The label box is 72 px wide and long labels wrap. Desktop 38 px for one line
  (minimum 36); below 768 px 46 px (minimum 44). The 3 px focus ring is drawn outside the tab.

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

## Notice

`<AtsNotice tone="error" :title="t('…')">{{ t('…') }}</AtsNotice>` is the design's `ATS/Notice`: inline
feedback with an icon, an optional title and the message (default slot). Text comes from the caller,
already translated (API error codes are translated by the caller, decisions §12).

- `tone`: `info` (default), `success` or `error`. Each draws its own 16 px decorative icon, so the
  meaning never rests on colour alone.
- `title`: optional, bold. Without it only the message renders.
- `error` is `role="alert"`; `info` and `success` are `role="status"`, so screen readers announce
  them when they are inserted.
- Inset 12 / 16 px, icon/copy gap 12 px, title/message gap 4 px. Text always wraps; nothing is clipped.
- Light: each tone has its fill. Dark: info keeps a fill; success and error sit on the surface colour.
  The whole error notice (icon, title, message) takes `--color-danger`.

## Menu

`<AtsMenu :heading="t('…')"><template #trigger="{ props }"><AtsIconButton v-bind="props" icon="edit"
:label="t('…')" /></template><AtsMenuItem :label="t('…')" icon="profile" @select="open" /></AtsMenu>` is
the design's `ATS/Menu` with `ATS/Menu item`. Labels and the heading come from the caller, already
translated; pass only the actions the user may perform (decisions §3).

- `AtsMenu`: bind the `trigger` slot's `props` to a Button or Icon button; they carry the id,
  `aria-haspopup="menu"`, `aria-expanded`, `aria-controls` and the open handlers. `heading` is an
  optional uppercase group heading that also names the menu (otherwise the trigger names it).
  `placement`: `bottom-start` (default) or `bottom-end`.
- The panel (`role="menu"`) opens in a teleport layer on `<body>`, under the trigger, flipped above
  it when there is no room below and kept 8 px inside the viewport. It copies the trigger's nearest
  `data-theme`, so a dark area keeps a dark menu.
- Keyboard: Enter, Space or Arrow Down on the trigger open it on the first item, Arrow Up on the last.
  Arrow Up/Down (wrapping) and Home/End move between enabled items; a letter jumps to the next enabled
  item starting with it; Enter/Space select; Escape closes and refocuses the trigger; Tab closes and
  moves on. Clicking outside closes it.
- `AtsMenuItem`: `label`, `icon` (an `AtsIcon` name, decorative), `disabled` (`aria-disabled`, skipped
  by the keys, emits nothing), `danger` (label in `--color-danger`), `to` (a vue-router location; the
  item is then a link). Selecting closes the menu, returns focus to the trigger, then emits `select`.
- Items are 40 px on desktop and 44 px (`--touch-target-min`) below 768 px, inset 8/12, icon/text gap 8. Hover and focus take the highlighted fill; keyboard focus adds the 3 px ring outside.
