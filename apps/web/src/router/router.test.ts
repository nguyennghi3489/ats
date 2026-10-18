import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import { i18n } from '../i18n';
import { buildRoutes, createAppRouter } from './index';

async function mountAt(path: string, isDev?: boolean) {
  const router = createAppRouter(createMemoryHistory(), isDev);
  await router.push(path);
  await router.isReady();
  return mount(App, { global: { plugins: [router, createPinia(), i18n] } });
}

describe('router', () => {
  it('renders the placeholder home page at /', async () => {
    const wrapper = await mountAt('/');

    expect(wrapper.find('[data-testid="home-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(false);
  });

  it('renders the 404 page for an unknown URL', async () => {
    const wrapper = await mountAt('/khong-ton-tai/abc');

    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="home-page"]').exists()).toBe(false);
  });

  it('serves the UI gallery at /dev/ui in development', async () => {
    const wrapper = await mountAt('/dev/ui', true);
    await flushPromises();

    expect(wrapper.find('[data-testid="ui-gallery"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(false);
  });

  it('answers /dev/ui with the 404 page in a production build', async () => {
    const wrapper = await mountAt('/dev/ui', false);
    await flushPromises();

    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ui-gallery"]').exists()).toBe(false);
  });

  it('leaves the gallery route out of the production route table', () => {
    expect(buildRoutes(false).map((route) => route.path)).not.toContain('/dev/ui');
    expect(buildRoutes(true).map((route) => route.path)).toContain('/dev/ui');
  });
});
