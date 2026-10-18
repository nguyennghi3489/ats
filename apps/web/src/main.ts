import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router';

createApp(App).use(createPinia()).use(createAppRouter()).mount('#app');
