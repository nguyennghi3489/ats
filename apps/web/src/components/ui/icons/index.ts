/**
 * The ATS icon set, redrawn from the masters on the design page "01 · Foundations" (`ATS/Icon/*`).
 *
 * Each icon keeps the grid it was drawn on in the design (`grid`, used as the viewBox) and is a list of
 * stroked paths. AtsIcon renders them with `stroke="currentColor"`, so an icon always takes the text
 * colour of its parent: never put a colour here.
 *
 * Adding an icon: draw it on its design grid, add it to ICONS, and add its name to the list in
 * AtsIcon.spec.ts.
 */
export interface IconDefinition {
  /** Width and height of the design frame, in px. */
  grid: number;
  /** Path data, stroked with currentColor, round caps and joins. */
  paths: readonly string[];
}

export const ICONS = {
  // ATS/Icon/Archive box · 16
  'archive-box': {
    grid: 16,
    paths: ['M2.5 3h11v3h-11z', 'M3.5 6v7h9V6', 'M6.5 8.5h3'],
  },
  // ATS/Icon/Chevron down · 14
  'chevron-down': {
    grid: 14,
    paths: ['M3.5 5.25 7 8.75l3.5-3.5'],
  },
  // ATS/Icon/Close · 16
  close: {
    grid: 16,
    paths: ['M4 4l8 8', 'M12 4l-8 8'],
  },
  // ATS/Icon/Edit · 16
  edit: {
    grid: 16,
    paths: ['M10.75 2.75l2.5 2.5L6 12.5l-3.25.75.75-3.25z', 'M9.25 4.25l2.5 2.5'],
  },
  // ATS/Icon/Empty · 32: a list page under a magnifier
  empty: {
    grid: 32,
    paths: [
      'M20 13V5H7v22h9',
      'M11 10h5',
      'M11 14h5',
      'M11 18h3',
      'M25 21a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
      'M24 24l3.5 3.5',
    ],
  },
  // ATS/Icon/Error · 20
  error: {
    grid: 20,
    paths: ['M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z', 'M10 6v4.5', 'M10 13.5v.01'],
  },
  // ATS/Icon/Info · 20
  info: {
    grid: 20,
    paths: ['M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z', 'M10 9v4.5', 'M10 6.5v.01'],
  },
  // "..." of the account trigger in ATS/App chrome/Desktop · 16: three dots
  more: {
    grid: 16,
    paths: [
      'M3.75 8a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z',
      'M8.75 8a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z',
      'M13.75 8a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0z',
    ],
  },
  // ATS/Icon/Profile · 16
  profile: {
    grid: 16,
    paths: [
      'M10.5 5.25a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
      'M3 13.5c.5-2.5 2.5-4 5-4s4.5 1.5 5 4',
    ],
  },
  // ATS/Icon/Spinner · 16: a three-quarter ring, open at the top right
  spinner: {
    grid: 16,
    paths: ['M13.5 8A5.5 5.5 0 1 1 8 2.5'],
  },
  // ATS/Icon/Success · 20
  success: {
    grid: 20,
    paths: ['M17.5 10a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0z', 'M6.75 10.25 9 12.5l4.25-4.5'],
  },
  // ATS/Icon/Trash · 16
  trash: {
    grid: 16,
    paths: [
      'M2.5 4.5h11',
      'M6 4.5V2.75h4V4.5',
      'M3.75 4.5l.75 8.75h7l.75-8.75',
      'M6.5 7v4',
      'M9.5 7v4',
    ],
  },
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof ICONS;

export const ICON_NAMES = Object.keys(ICONS) as IconName[];
