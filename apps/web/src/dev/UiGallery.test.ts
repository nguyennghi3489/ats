import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import { ICON_NAMES } from '../components/ui/icons';
import { createAppRouter } from '../router';
import UiGallery from './UiGallery.vue';

describe('UI gallery', () => {
  // Demos such as AtsNavItem render RouterLinks, as they do inside the app.
  const wrapper = mount(UiGallery, {
    global: { plugins: [createAppRouter(createMemoryHistory(), true)] },
  });
  const demo = () => wrapper.get('[data-testid="ui-demo-AtsIcon"]');

  it('lists every *.demo.vue under components/ui', () => {
    expect(
      wrapper.findAll('[data-testid^="ui-demo-"]').map((d) => d.attributes('data-testid')),
    ).toEqual([
      'ui-demo-AtsBadge',
      'ui-demo-AtsButton',
      'ui-demo-AtsIcon',
      'ui-demo-AtsIconButton',
      'ui-demo-AtsNavItem',
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
