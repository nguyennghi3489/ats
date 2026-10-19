<!--
  Dev-only gallery at /dev/ui (absent from production builds, see src/router/index.ts). It collects every
  src/components/ui/**/*.demo.vue and shows each one in a light panel, a dark panel and a 360 px panel
  (the 360 px panel follows the app theme). Developer tooling, not product copy: no i18n here.
  After them comes the auth page layout (src/features/auth/AuthLayout.vue) with sample sign-in content,
  in full-width light and dark panels and a 360 px panel. Its sample copy is kept here in both languages
  so the VI / EN switch changes every visible word, as it will on the real auth pages.
  The root is a <div>: each AuthLayout brings its own <main>.
-->
<script setup lang="ts">
import { type Component, computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AtsButton from '../components/ui/AtsButton.vue';
import AtsTextField from '../components/ui/AtsTextField.vue';
import AuthLayout from '../features/auth/AuthLayout.vue';
import type { Locale } from '../i18n';

const modules = import.meta.glob<Component>('../components/ui/**/*.demo.vue', {
  eager: true,
  import: 'default',
});

const demos = Object.entries(modules)
  .map(([path, component]) => ({
    name: path.replace(/^.*\//, '').replace(/\.demo\.vue$/, ''),
    component,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const panels = [
  { id: 'light', title: 'Light', theme: 'light', style: undefined },
  { id: 'dark', title: 'Dark', theme: 'dark', style: undefined },
  { id: 'mobile', title: '360 px', theme: undefined, style: { width: '360px' } },
] as const;

const { locale } = useI18n({ useScope: 'global' });

// Synthetic sample copy for the auth layout demo, in both languages (developer tooling only).
const authSamples: Record<
  Locale,
  {
    title: string;
    subtitle: string;
    email: string;
    password: string;
    submit: string;
    forgot: string;
    signUp: string;
  }
> = {
  vi: {
    title: 'Đăng nhập',
    subtitle: 'Tiếp tục vào tài khoản nhà tuyển dụng.',
    email: 'Email',
    password: 'Mật khẩu',
    submit: 'Đăng nhập',
    forgot: 'Quên mật khẩu?',
    signUp: 'Chưa có tài khoản? Đăng ký',
  },
  en: {
    title: 'Sign in',
    subtitle: 'Continue to your employer account.',
    email: 'Email',
    password: 'Password',
    submit: 'Sign in',
    forgot: 'Forgot password?',
    signUp: 'No account yet? Sign up',
  },
};

const authSample = computed(() => authSamples[locale.value as Locale]);
const sampleEmail = ref('minh.anh@example.com');
const samplePassword = ref('');
</script>

<template>
  <div class="ui-gallery" data-testid="ui-gallery">
    <h1 class="ui-gallery__title">UI gallery</h1>
    <section
      v-for="demo in demos"
      :key="demo.name"
      class="ui-gallery__demo"
      :data-testid="`ui-demo-${demo.name}`"
    >
      <h2 class="ui-gallery__name">{{ demo.name }}</h2>
      <div class="ui-gallery__panels">
        <div
          v-for="panel in panels"
          :key="panel.id"
          class="ui-gallery__panel"
          :data-panel="panel.id"
          :data-theme="panel.theme"
          :style="panel.style"
        >
          <h3 class="ui-gallery__panel-title">{{ panel.title }}</h3>
          <component :is="demo.component" />
        </div>
      </div>
    </section>

    <section class="ui-gallery__demo" data-testid="auth-layout-demo">
      <h2 class="ui-gallery__name">AuthLayout</h2>
      <div class="ui-gallery__panels ui-gallery__panels--stacked">
        <div
          v-for="panel in panels"
          :key="panel.id"
          class="ui-gallery__panel ui-gallery__panel--page"
          :data-panel="panel.id"
          :data-theme="panel.theme"
          :style="panel.style"
        >
          <h3 class="ui-gallery__panel-title">{{ panel.title }}</h3>
          <AuthLayout :title="authSample.title" :subtitle="authSample.subtitle">
            <form class="ui-gallery__auth-form" @submit.prevent>
              <AtsTextField
                v-model="sampleEmail"
                :label="authSample.email"
                type="email"
                autocomplete="off"
              />
              <AtsTextField
                v-model="samplePassword"
                :label="authSample.password"
                type="password"
                autocomplete="off"
              />
              <AtsButton type="submit" block>{{ authSample.submit }}</AtsButton>
            </form>
            <template #footer>
              <a href="#">{{ authSample.forgot }}</a> ·
              <a href="#">{{ authSample.signUp }}</a>
            </template>
          </AuthLayout>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ui-gallery {
  padding: var(--space-6);
}

.ui-gallery__title {
  margin: 0 0 var(--space-6);
  font-size: var(--font-size-xl);
}

.ui-gallery__demo + .ui-gallery__demo {
  margin-top: var(--space-8);
}

.ui-gallery__name {
  margin: 0 0 var(--space-3);
  font-size: var(--font-size-lg);
}

.ui-gallery__panels {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
  align-items: flex-start;
}

/* Each panel sets its own background and text colour so its data-theme takes effect inside it. */
.ui-gallery__panel {
  box-sizing: border-box;
  flex: 1 1 320px;
  padding: var(--space-4);
  border: 1px solid var(--color-line);
  border-radius: var(--radius-sm);
  background: var(--color-canvas);
  color: var(--color-ink);
}

.ui-gallery__panel[data-panel='mobile'] {
  flex: 0 0 auto;
}

/* The auth layout is a whole page: full-width panels, one under the other, without inner padding. */
.ui-gallery__panels--stacked {
  flex-flow: column nowrap;
  align-items: stretch;
}

.ui-gallery__panel--page {
  flex: none;
  max-width: 100%;
  padding: 0;
}

.ui-gallery__panel--page > .ui-gallery__panel-title {
  margin: 0;
  padding: var(--space-2) var(--space-4);
}

.ui-gallery__auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.ui-gallery__panel-title {
  margin: 0 0 var(--space-3);
  color: var(--color-muted);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}
</style>
