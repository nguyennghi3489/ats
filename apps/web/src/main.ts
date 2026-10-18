import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { initTheme } from './lib/theme';
import { createAppRouter } from './router';

// The pre-paint script in index.html already set data-theme; this keeps it live and exposes setTheme.
const theme = initTheme();
// Handle for devtools and QA until the account-menu control lands (step 5).
Object.assign(window, { atsTheme: theme });

createApp(App).use(i18n).use(createPinia()).use(createAppRouter()).mount('#app');
