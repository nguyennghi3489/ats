import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { initTheme } from './lib/theme';
import { createAppRouter, installRouteGuards } from './router';

// The pre-paint script in index.html already set data-theme; this keeps it live and exposes setTheme.
const theme = initTheme();
// Handle for devtools and QA until the account-menu control lands (step 5).
Object.assign(window, { atsTheme: theme });

const pinia = createPinia();
const router = createAppRouter();
// Before `use(router)`, which starts the first navigation, so even that one is guarded.
installRouteGuards(router, pinia);

createApp(App).use(i18n).use(pinia).use(router).mount('#app');
