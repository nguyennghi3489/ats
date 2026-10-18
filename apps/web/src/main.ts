import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { initTheme } from './lib/theme';
import { createAppRouter } from './router';

// The pre-paint script in index.html already set data-theme; this keeps it live and exposes setTheme.
const theme = initTheme();
// Handle for devtools and QA until the account-menu control lands (step 5).
Object.assign(window, { atsTheme: theme });

createApp(App).use(createPinia()).use(createAppRouter()).mount('#app');
