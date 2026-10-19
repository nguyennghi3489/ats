<!--
  List table (design page "01 · Foundations": ATS/Table header cell, ATS/Table cell, ATS/Table header
  row, ATS/Table row, "QA · Table row spacing"). A semantic <table>: the optional `caption` is visually
  hidden and names the table; every column header is a <th scope="col">.
  Header 44 px with uppercase muted labels. Rows are at least 56 px (88 px below 768 px) and grow with
  the tallest cell; cells are top-aligned with an 8/12 inset; one divider under each row.
  With `rowTo`, the first cell of each row holds the row's RouterLink (one Tab stop per row), a click
  anywhere else on the row navigates too, and a trailing chevron shows the row leads somewhere.
  Below 768 px the columns marked `hideOnMobile` are hidden and text wraps.
  Labels and cell text come from the caller, already translated or masked (decisions §13); paging is
  the caller's job too (§11).
-->
<script lang="ts">
export interface TableColumn {
  /** Row property shown by default, and the name of the `#cell-<key>` slot. */
  key: string;
  /** Header label, already translated. */
  label: string;
  /** CSS width of the column, for example `40%` or `160px`. */
  width?: string;
  /** Hide this column below the mobile breakpoint. */
  hideOnMobile?: boolean;
}
</script>

<script setup lang="ts" generic="T extends object">
/* global MouseEvent, HTMLElement -- DOM types, which no-undef does not know in .vue files */
import { RouterLink, useRouter, type RouteLocationRaw } from 'vue-router';
import AtsIcon from './AtsIcon.vue';

const props = withDefaults(
  defineProps<{
    columns: readonly TableColumn[];
    rows: readonly T[];
    /** Row property that identifies a row. */
    rowKey: keyof T & string;
    /** Where a row leads. Makes rows clickable and adds the chevron column. */
    rowTo?: (row: T) => RouteLocationRaw;
    /** Accessible name of the table, already translated. Visually hidden. */
    caption?: string;
  }>(),
  { rowTo: undefined, caption: undefined },
);

defineSlots<{
  [K in `cell-${string}`]?: (props: { row: T }) => unknown;
}>();

const router = useRouter();

const keyOf = (row: T) => row[props.rowKey] as PropertyKey;
const valueOf = (row: T, key: string) => (row as Record<string, unknown>)[key];

/** Clicks outside the link navigate like the link; controls and modified clicks keep their own. */
function onRowClick(row: T, event: MouseEvent) {
  if (!props.rowTo || event.defaultPrevented || event.button !== 0) return;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('a, button, input, select, textarea, label, [role="button"]')) return;
  if (globalThis.getSelection?.()?.toString()) return;
  void router.push(props.rowTo(row));
}
</script>

<template>
  <div class="ats-table">
    <table class="ats-table__table">
      <caption v-if="caption" class="ats-table__caption">
        {{
          caption
        }}
      </caption>
      <thead>
        <tr class="ats-table__head-row">
          <th
            v-for="column in columns"
            :key="column.key"
            scope="col"
            class="ats-table__header"
            :class="{ 'ats-table__col--hide-mobile': column.hideOnMobile }"
            :style="column.width ? { width: column.width } : undefined"
          >
            {{ column.label }}
          </th>
          <td v-if="rowTo" class="ats-table__header ats-table__chevron-head"></td>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="keyOf(row)"
          class="ats-table__row"
          :class="{ 'ats-table__row--link': rowTo }"
          @click="onRowClick(row, $event)"
        >
          <td
            v-for="(column, index) in columns"
            :key="column.key"
            class="ats-table__cell"
            :class="{ 'ats-table__col--hide-mobile': column.hideOnMobile }"
          >
            <RouterLink v-if="rowTo && index === 0" class="ats-table__link" :to="rowTo(row)">
              <slot :name="`cell-${column.key}`" :row="row">{{ valueOf(row, column.key) }}</slot>
            </RouterLink>
            <slot v-else :name="`cell-${column.key}`" :row="row">{{
              valueOf(row, column.key)
            }}</slot>
          </td>
          <td v-if="rowTo" class="ats-table__cell ats-table__chevron">
            <span class="ats-table__chevron-icon"><AtsIcon name="chevron-down" :size="14" /></span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.ats-table {
  width: 100%;
  min-width: 0;
}

.ats-table__table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  background: var(--color-surface);
  color: var(--color-ink);
}

/* Visually hidden, still read as the table's name. */
.ats-table__caption {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  border: 0;
  white-space: normal;
}

.ats-table__head-row {
  height: 44px;
}

.ats-table__header {
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  border-bottom: 1px solid var(--color-line);
  background: var(--color-canvas);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  line-height: var(--line-height-xs);
  text-align: start;
  text-transform: uppercase;
  vertical-align: middle;
  overflow-wrap: anywhere;
}

.ats-table__row {
  height: 56px;
}

.ats-table__cell {
  padding-block: var(--space-2);
  padding-inline: var(--space-3);
  border-bottom: 1px solid var(--color-line);
  font-size: var(--font-size-sm);
  line-height: var(--line-height-sm);
  text-align: start;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.ats-table__row--link {
  cursor: pointer;
}

.ats-table__row--link:hover .ats-table__cell {
  background: var(--color-accent);
}

.ats-table__row--link:focus-within .ats-table__cell {
  background: var(--color-accent);
}

.ats-table__link {
  display: block;
  color: inherit;
  text-decoration: none;
}

/* The trailing chevron column takes only the room the icon needs. */
.ats-table__chevron,
.ats-table__chevron-head {
  width: 1%;
}

/* chevron-down turned to point right (the set has no right chevron), centred on the first text line. */
.ats-table__chevron-icon {
  display: flex;
  height: var(--line-height-sm);
  align-items: center;
  justify-content: center;
}

.ats-table__chevron-icon :deep(svg) {
  transform: rotate(-90deg);
}

@media (max-width: 767px) {
  .ats-table__row {
    height: 88px;
  }

  .ats-table__col--hide-mobile {
    display: none;
  }
}
</style>
