import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // OneDrive 内のフォルダではファイル変更の通知が届かないことがあるため、定期的に確認して検知する
    watch: { usePolling: true, interval: 500 },
  },
});
