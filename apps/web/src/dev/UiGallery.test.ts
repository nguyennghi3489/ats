import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { ICON_NAMES } from '../components/ui/icons';
import { i18n, setLocale } from '../i18n';
import en from '../i18n/locales/en.json';
import vi from '../i18n/locales/vi.json';
import { createAppRouter } from '../router';
import UiGallery from './UiGallery.vue';

describe('UI gallery', () => {
  setLocale('vi');
  // Demos such as AtsNavItem render RouterLinks, as they do inside the app; the auth layout demo uses i18n.
  const wrapper = mount(UiGallery, {
    global: { plugins: [createAppRouter(createMemoryHistory(), true), i18n] },
  });

  describe('auth layout demo', () => {
    const authDemo = () => wrapper.get('[data-testid="auth-layout-demo"]');

    it('shows the layout with sample content in a light, a dark and a 360 px panel', () => {
      const panels = authDemo().findAll('[data-panel]');

      expect(panels.map((panel) => panel.attributes('data-panel'))).toEqual([
        'light',
        'dark',
        'mobile',
      ]);
      expect(panels[0]!.attributes('data-theme')).toBe('light');
      expect(panels[1]!.attributes('data-theme')).toBe('dark');
      expect(panels[2]!.attributes('style')).toContain('width: 360px');
      for (const panel of panels) {
        expect(panel.find('.auth-layout').exists()).toBe(true);
        expect(panel.get('h1').text()).toBeTruthy();
        expect(panel.find('[data-testid="auth-subtitle"]').exists()).toBe(true);
        expect(panel.find('.auth-layout__body input').exists()).toBe(true);
        expect(panel.find('.auth-layout__footer a').exists()).toBe(true);
      }
    });

    it('switches the whole demo to English and back from any switch', async () => {
      const viTitle = authDemo().get('h1').text();

      await authDemo().findAll('[role="group"] button')[1]!.trigger('click');

      const panel = authDemo().get('[data-panel="light"]');
      expect(panel.get('[data-testid="auth-brand"]').text()).toContain(en.auth.layout.brand);
      expect(panel.get('h1').text()).not.toBe(viTitle);
      expect(document.documentElement.lang).toBe('en');

      await authDemo().findAll('[role="group"] button')[0]!.trigger('click');

      expect(panel.get('[data-testid="auth-brand"]').text()).toContain(vi.auth.layout.brand);
      expect(panel.get('h1').text()).toBe(viTitle);
    });
  });
  describe('page layout demos', () => {
    const layoutDemo = () => wrapper.get('[data-testid="layout-demo-AtsPage"]');

    it('lists every *.demo.vue under components/layout', () => {
      expect(
        wrapper.findAll('[data-testid^="layout-demo-"]').map((d) => d.attributes('data-testid')),
      ).toEqual(['layout-demo-AtsPage']);
      expect(layoutDemo().get('h2').text()).toBe('AtsPage');
    });

    it('shows the list, empty-state and breadcrumb examples in full-width light, dark and 360 px panels', () => {
      const panels = layoutDemo().findAll('[data-panel]');

      expect(panels.map((panel) => panel.attributes('data-panel'))).toEqual([
        'light',
        'dark',
        'mobile',
      ]);
      expect(panels[0]!.attributes('data-theme')).toBe('light');
      expect(panels[1]!.attributes('data-theme')).toBe('dark');
      expect(panels[2]!.attributes('style')).toContain('width: 360px');
      for (const panel of panels) {
        expect(panel.classes()).toContain('ui-gallery__panel--page');
        const list = panel.get('[data-example="list"]');
        expect(list.get('.ats-page-header h1').text()).toBeTruthy();
        expect(list.find('.ats-page-header__actions button').exists()).toBe(true);
        expect(list.find('.ats-page-body--flush table').exists()).toBe(true);
        const empty = panel.get('[data-example="empty"]');
        expect(empty.find('.ats-page-body--centered .ats-empty-state').exists()).toBe(true);
        const record = panel.get('[data-example="breadcrumb"]');
        expect(record.find('.ats-page-header__breadcrumb a').exists()).toBe(true);
        expect(record.find('.ats-page-body--default').exists()).toBe(true);
        expect(panel.find('[data-example="long-title"] .ats-page-header__actions').exists()).toBe(
          true,
        );
      }
    });
  });

  const demo = () => wrapper.get('[data-testid="ui-demo-AtsIcon"]');

  it('lists every *.demo.vue under components/ui', () => {
    expect(
      wrapper.findAll('[data-testid^="ui-demo-"]').map((d) => d.attributes('data-testid')),
    ).toEqual([
      'ui-demo-AtsBadge',
      'ui-demo-AtsButton',
      'ui-demo-AtsDialog',
      'ui-demo-AtsEmptyState',
      'ui-demo-AtsIcon',
      'ui-demo-AtsIconButton',
      'ui-demo-AtsMenu',
      'ui-demo-AtsNavItem',
      'ui-demo-AtsNotice',
      'ui-demo-AtsRadioGroup',
      'ui-demo-AtsSelect',
      'ui-demo-AtsTable',
      'ui-demo-AtsTabs',
      'ui-demo-AtsTextarea',
      'ui-demo-AtsTextField',
    ]);
    expect(demo().get('h2').text()).toBe('AtsIcon');
  });

  it('renders each demo in a light, a dark and a 360 px panel', () => {
    const panels = demo().findAll('[data-panel]');

    expect(panels.map((panel) => panel.attributes('data-panel'))).toEqual([
      'light',
      'dark',
      'mobile',
    ]);
    expect(panels[0]!.attributes('data-theme')).toBe('light');
    expect(panels[1]!.attributes('data-theme')).toBe('dark');
    expect(panels[2]!.attributes('data-theme')).toBeUndefined();
    expect(panels[2]!.attributes('style')).toContain('width: 360px');
  });

  it('shows all icons in every panel', () => {
    for (const panel of demo().findAll('[data-panel]')) {
      expect(panel.findAll('svg.ats-icon')).toHaveLength(ICON_NAMES.length);
    }
  });
});
