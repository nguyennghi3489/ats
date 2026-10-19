// Node types for this spec only: the sizing tests read the component stylesheets from disk.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, type Component } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import AtsTable from './AtsTable.vue';
import AtsTableCell from './AtsTableCell.vue';

interface Candidate {
  id: number;
  name: string;
  email: string;
  applications: string;
}

const COLUMNS = [
  { key: 'name', label: 'Hồ sơ', width: '40%' },
  { key: 'email', label: 'Liên hệ', hideOnMobile: true },
  { key: 'applications', label: 'Ứng tuyển' },
];

const ROWS: Candidate[] = [
  { id: 1, name: 'Nguyễn Minh Anh', email: 'minh.anh@example.com', applications: '0' },
  { id: 2, name: 'Trần Khánh Linh', email: 'khanh.linh@example.com', applications: '2' },
];

const CAPTION = 'Danh sách hồ sơ';

const Page = defineComponent({ render: () => h('div') });

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Page },
      { path: '/candidates/:id', name: 'candidate', component: Page },
    ],
  });
}

const mounted: { unmount(): void }[] = [];
afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount());
});

async function mountTable(
  props: Record<string, unknown> = {},
  slots: Record<string, unknown> = {},
) {
  const router = makeRouter();
  await router.push('/');
  await router.isReady();
  // AtsTable is generic over the row type; the tests pass loosely typed props and slots.
  const wrapper = mount(AtsTable as Component, {
    props: { columns: COLUMNS, rows: ROWS, rowKey: 'id', caption: CAPTION, ...props },
    slots,
    global: { plugins: [router] },
    attachTo: document.body,
  });
  mounted.push(wrapper);
  return { wrapper, router };
}

const rowTo = (row: Candidate) => ({ name: 'candidate', params: { id: row.id } });

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('AtsTable', () => {
  it('renders a semantic table with column headers scoped to their columns', async () => {
    const { wrapper } = await mountTable();
    const table = wrapper.get('table');
    const headers = table.findAll('thead th');

    expect(headers.map((th) => th.text())).toEqual(['Hồ sơ', 'Liên hệ', 'Ứng tuyển']);
    headers.forEach((th) => expect(th.attributes('scope')).toBe('col'));
    expect(headers[0]!.attributes('style')).toMatch(/width:\s*40%/);
  });

  it('names the table with its caption, kept visually hidden', async () => {
    const { wrapper } = await mountTable();
    const caption = wrapper.get('table > caption');

    expect(caption.text()).toBe(CAPTION);
    expect(caption.classes()).toContain('ats-table__caption');
    // The caption is the first child of the table, which makes it the table's accessible name.
    expect(wrapper.get('table').element.firstElementChild).toBe(caption.element);
  });

  it('renders no caption when none is given', async () => {
    const { wrapper } = await mountTable({ caption: undefined });

    expect(wrapper.find('caption').exists()).toBe(false);
  });

  it('shows row[key] in each cell by default, one row per item keyed by rowKey', async () => {
    const { wrapper } = await mountTable();
    const rows = wrapper.findAll('tbody tr');

    expect(rows).toHaveLength(2);
    expect(rows[0]!.findAll('td').map((td) => td.text())).toEqual([
      'Nguyễn Minh Anh',
      'minh.anh@example.com',
      '0',
    ]);
    expect(rows[1]!.findAll('td').map((td) => td.text())).toEqual([
      'Trần Khánh Linh',
      'khanh.linh@example.com',
      '2',
    ]);
  });

  it('renders the #cell-<key> slot with the row instead of the default', async () => {
    const { wrapper } = await mountTable(
      {},
      {
        'cell-name': ({ row }: { row: Candidate }) =>
          h(AtsTableCell, { primary: row.name, secondary: `Hồ sơ #${row.id}` }),
      },
    );
    const first = wrapper.get('tbody tr').findAll('td')[0]!;

    expect(first.get('.ats-table-cell__primary').text()).toBe('Nguyễn Minh Anh');
    expect(first.get('.ats-table-cell__secondary').text()).toBe('Hồ sơ #1');
  });

  it('marks hideOnMobile columns on the header and on every body cell', async () => {
    const { wrapper } = await mountTable();
    const hidden = '.ats-table__col--hide-mobile';

    expect(wrapper.findAll(`thead th${hidden}`).map((th) => th.text())).toEqual(['Liên hệ']);
    wrapper.findAll('tbody tr').forEach((tr) => {
      const cells = tr.findAll('td');
      expect(cells[1]!.classes()).toContain('ats-table__col--hide-mobile');
      expect(cells[0]!.classes()).not.toContain('ats-table__col--hide-mobile');
      expect(cells[2]!.classes()).not.toContain('ats-table__col--hide-mobile');
    });
  });

  describe('without rowTo', () => {
    it('has no links, no chevron and no clickable rows', async () => {
      const { wrapper } = await mountTable();

      expect(wrapper.find('a').exists()).toBe(false);
      expect(wrapper.find('.ats-table__chevron').exists()).toBe(false);
      expect(wrapper.find('svg').exists()).toBe(false);
      expect(wrapper.find('.ats-table__row--link').exists()).toBe(false);
      // Same number of cells in the header and in each row: no trailing chevron column.
      expect(wrapper.findAll('thead tr > *')).toHaveLength(3);
      wrapper.findAll('tbody tr').forEach((tr) => expect(tr.findAll('td')).toHaveLength(3));
    });

    it('does not navigate when a row is clicked', async () => {
      const { wrapper, router } = await mountTable();

      await wrapper.get('tbody tr').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/');
    });
  });

  describe('with rowTo', () => {
    it('puts one link per row, in the first cell, pointing at the row destination', async () => {
      const { wrapper } = await mountTable({ rowTo });

      wrapper.findAll('tbody tr').forEach((tr, index) => {
        const links = tr.findAll('a');
        expect(links).toHaveLength(1);
        expect(tr.findAll('td')[0]!.find('a').exists()).toBe(true);
        expect(links[0]!.attributes('href')).toBe(`/candidates/${ROWS[index]!.id}`);
        expect(links[0]!.text()).toBe(ROWS[index]!.name);
      });
    });

    it('wraps slotted first-cell content in the link', async () => {
      const { wrapper } = await mountTable(
        { rowTo },
        {
          'cell-name': ({ row }: { row: Candidate }) =>
            h(AtsTableCell, { primary: row.name, secondary: 'Hồ sơ mới' }),
        },
      );
      const link = wrapper.get('tbody tr a');

      expect(link.find('.ats-table-cell__primary').text()).toBe('Nguyễn Minh Anh');
    });

    it('stops Tab once per row: the link is the only focusable element in it', async () => {
      const { wrapper } = await mountTable({ rowTo });

      wrapper.findAll('tbody tr').forEach((tr) => {
        expect(tr.attributes('tabindex')).toBeUndefined();
        expect(tr.findAll(FOCUSABLE)).toHaveLength(1);
      });
      expect(wrapper.findAll(FOCUSABLE)).toHaveLength(ROWS.length);
    });

    it('navigates when the link is activated (Enter on a link fires its click)', async () => {
      const { wrapper, router } = await mountTable({ rowTo });
      const link = wrapper.findAll('tbody tr')[1]!.get('a');

      (link.element as HTMLAnchorElement).focus();
      expect(document.activeElement).toBe(link.element);
      await link.trigger('keydown', { key: 'Enter' });
      await link.trigger('click');
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe('/candidates/2');
    });

    it('navigates when anywhere else on the row is clicked', async () => {
      const { wrapper, router } = await mountTable({ rowTo });
      const row = wrapper.findAll('tbody tr')[1]!;

      await row.findAll('td')[2]!.trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/candidates/2');

      await router.push('/');
      await row.get('.ats-table__chevron').trigger('click');
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/candidates/2');
    });

    it('leaves modified clicks (new tab, new window) to the browser', async () => {
      const { wrapper, router } = await mountTable({ rowTo });

      await wrapper.findAll('tbody tr')[0]!.findAll('td')[2]!.trigger('click', { ctrlKey: true });
      await flushPromises();
      expect(router.currentRoute.value.fullPath).toBe('/');
    });

    it('shows a decorative trailing chevron on each row, with an empty header cell above', async () => {
      const { wrapper } = await mountTable({ rowTo });

      expect(wrapper.findAll('thead th')).toHaveLength(3);
      expect(wrapper.findAll('thead tr > *')).toHaveLength(4);
      wrapper.findAll('tbody tr').forEach((tr) => {
        expect(tr.classes()).toContain('ats-table__row--link');
        const cells = tr.findAll('td');
        expect(cells).toHaveLength(4);
        const chevron = cells[3]!;
        expect(chevron.classes()).toContain('ats-table__chevron');
        expect(chevron.get('svg').attributes('aria-hidden')).toBe('true');
        expect(chevron.text()).toBe('');
      });
    });
  });

  describe('stylesheet', () => {
    // happy-dom does not lay out or apply scoped CSS, so the rules themselves are checked.
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsTable.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';
    const mobile = style.slice(style.indexOf('@media (max-width: 767px)'));
    const rule = (selector: string, css = style) =>
      new RegExp(
        `(?:^|[\\s,}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
      ).exec(css)?.[1] ?? '';

    it('has a 44 px header with uppercase muted labels', () => {
      expect(rule('.ats-table__head-row')).toMatch(/height:\s*44px/);
      const th = rule('.ats-table__header');
      expect(th).toMatch(/text-transform:\s*uppercase/);
      expect(th).toMatch(/color:\s*var\(--color-muted\)/);
      expect(th).toMatch(/padding-inline:\s*var\(--space-3\)/);
    });

    it('has rows at least 56 px high on desktop with top-aligned cells inset 8/12', () => {
      expect(rule('.ats-table__row')).toMatch(/height:\s*56px/);
      const td = rule('.ats-table__cell');
      expect(td).toMatch(/vertical-align:\s*top/);
      expect(td).toMatch(/padding-block:\s*var\(--space-2\)/);
      expect(td).toMatch(/padding-inline:\s*var\(--space-3\)/);
    });

    it('draws one bottom divider per row', () => {
      expect(rule('.ats-table__cell')).toMatch(/border-bottom:\s*1px solid var\(--color-line\)/);
      expect(rule('.ats-table__table')).toMatch(/border-collapse:\s*collapse/);
    });

    it('rotates the chevron-down icon to point right', () => {
      expect(source).toMatch(/name="chevron-down"/);
      expect(style).toMatch(/rotate\(-90deg\)/);
    });

    it('styles hovered and focused clickable rows from tokens', () => {
      expect(style).toMatch(/\.ats-table__row--link:hover[^{]*\{[^}]*var\(--color-/);
      expect(style).toMatch(/\.ats-table__row--link:focus-within[^{]*\{[^}]*var\(--color-/);
    });

    it('on mobile: rows at least 88 px, hideOnMobile columns hidden, text wraps', () => {
      expect(mobile).not.toBe('');
      expect(rule('.ats-table__row', mobile)).toMatch(/height:\s*88px/);
      expect(rule('.ats-table__col--hide-mobile', mobile)).toMatch(/display:\s*none/);
      expect(rule('.ats-table__cell')).toMatch(/overflow-wrap:\s*anywhere/);
      expect(style).not.toMatch(/white-space:\s*nowrap|text-overflow/);
    });

    it('uses no raw colours', () => {
      expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(/);
    });
  });
});

describe('AtsTableCell', () => {
  it('shows the primary text alone when there is no secondary text', () => {
    const wrapper = mount(AtsTableCell, { props: { primary: 'Nội dung ô' } });

    expect(wrapper.get('.ats-table-cell__primary').text()).toBe('Nội dung ô');
    expect(wrapper.find('.ats-table-cell__secondary').exists()).toBe(false);
  });

  it('shows the secondary text below the primary', () => {
    const wrapper = mount(AtsTableCell, {
      props: { primary: 'Nội dung ô', secondary: 'Thông tin phụ có thể xuống dòng.' },
    });
    const parts = wrapper.findAll('.ats-table-cell > *');

    expect(parts.map((p) => p.classes()[0])).toEqual([
      'ats-table-cell__primary',
      'ats-table-cell__secondary',
    ]);
    expect(parts[1]!.text()).toBe('Thông tin phụ có thể xuống dòng.');
  });

  it('sets the secondary text 4 px below in the muted colour, and lets both wrap', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/ui/AtsTableCell.vue'), 'utf8');
    const style = /<style[^>]*>([\s\S]*)<\/style>/.exec(source)?.[1] ?? '';

    expect(style).toMatch(/\.ats-table-cell__secondary\s*\{[^}]*color:\s*var\(--color-muted\)/);
    expect(style).toMatch(/\.ats-table-cell__secondary\s*\{[^}]*margin-top:\s*var\(--space-1\)/);
    expect(style).toMatch(/overflow-wrap:\s*anywhere/);
    expect(style).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgb\(|hsl\(|white-space:\s*nowrap/);
  });
});
