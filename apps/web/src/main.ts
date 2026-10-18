import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n';
import { createAppRouter } from './router';

createApp(App).use(i18n).use(createPinia()).use(createAppRouter()).mount('#app');
