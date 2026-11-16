import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // De backend draait apart; via deze proxy komen site en API van hetzelfde adres,
    // zodat de sessiecookie SameSite=Strict kan blijven.
    proxy: { '/api': 'http://127.0.0.1:8000' },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
