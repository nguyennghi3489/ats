import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from '../App.vue';
import { createAppRouter } from './index';

async function mountAt(path: string) {
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  return mount(App, { global: { plugins: [router, createPinia()] } });
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
});
