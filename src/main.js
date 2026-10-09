import { createApp } from 'vue';
import App from './app.vue';
import { startSync } from './lib/sync.js';
import './style.css';

createApp(App).mount('#app');
// 画面はブラウザの控えですぐに表示し、裏でデータファイルを読み込んで同期する
startSync();
