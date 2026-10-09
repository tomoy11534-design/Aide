import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    // Tailscale 経由（https://〇〇.ts.net）でほかの端末から開けるようにする
    allowedHosts: ['.ts.net'],
    // OneDrive 内のフォルダではファイル変更の通知が届かないことがあるため、定期的に確認して検知する
    // 登録データのファイル（data/）は画面のコードではないので監視しない
    watch: { usePolling: true, interval: 500, ignored: ['**/data/**'] },
  },
});
