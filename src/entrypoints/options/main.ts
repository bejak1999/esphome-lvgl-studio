import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { installA11y } from '@/shared/a11y';
import '@/assets/tailwind.css';

const app = createApp(App).use(createPinia());
installA11y(app);
app.mount('#app');
