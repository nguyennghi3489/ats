import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import en from './locales/en.json';
import viMessages from './locales/vi.json';

// The 404 page in the language picked at start-up (decisions §12).
async function mountNotFound() {
  const [{ default: App }, { createAppRouter }, { i18n }] = await Promise.all([
    import('../App.vue'),
    import('../router'),
    import('./index'),
  ]);
  const router = createAppRouter(createMemoryHistory());
  await router.push('/khong-ton-tai');
  await router.isReady();
  return mount(App, { global: { plugins: [router, createPinia(), i18n] } });
}

describe('404 page language', () => {
  let languages: string[];

  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
    vi.spyOn(navigator, 'languages', 'get').mockImplementation(() => languages);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('shows English with an en-US browser and nothing stored', async () => {
    languages = ['en-US'];
    const wrapper = await mountNotFound();

    const page = wrapper.get('[data-testid="not-found-page"]');
    expect(page.text()).toContain(en.notFound.title);
    expect(page.text()).toContain(en.notFound.backHome);
    expect(page.text()).not.toContain(viMessages.notFound.title);
    expect(document.documentElement.lang).toBe('en');
  });

  it('shows Vietnamese with a French browser and nothing stored', async () => {
    languages = ['fr'];
    const wrapper = await mountNotFound();

    const page = wrapper.get('[data-testid="not-found-page"]');
    expect(page.text()).toContain(viMessages.notFound.title);
    expect(page.text()).toContain(viMessages.notFound.backHome);
    expect(document.documentElement.lang).toBe('vi');
  });

  it('keeps Vietnamese after setLocale("vi") and a reload with an English browser', async () => {
    languages = ['en-US'];
    const { setLocale } = await import('./index');
    setLocale('vi');

    vi.resetModules();
    const wrapper = await mountNotFound();

    expect(wrapper.get('[data-testid="not-found-page"]').text()).toContain(
      viMessages.notFound.title,
    );
    expect(document.documentElement.lang).toBe('vi');
  });
});
