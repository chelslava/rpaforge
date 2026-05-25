import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';
import path from 'node:path';
import fs from 'node:fs';

function copyPublicPlugin() {
  return {
    name: 'copy-public',
    closeBundle() {
      const publicDir = path.resolve(__dirname, 'public');
      const distDir = path.resolve(__dirname, 'dist');
      
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }
      
      if (fs.existsSync(publicDir)) {
        fs.readdirSync(publicDir).forEach(file => {
          if (file === 'locales') return;
          const srcPath = path.join(publicDir, file);
          const destPath = path.join(distDir, file);
          if (fs.statSync(srcPath).isDirectory()) {
            fs.cpSync(srcPath, destPath, { recursive: true });
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        });
      }
    }
  };
}

function copyLocalesPlugin() {
  return {
    name: 'copy-locales',
    closeBundle() {
      const srcLocalesDir = path.resolve(__dirname, 'src/i18n/locales');
      const distLocalesDir = path.resolve(__dirname, 'dist/locales');
      
      if (!fs.existsSync(distLocalesDir)) {
        fs.mkdirSync(distLocalesDir, { recursive: true });
      }
      
      if (fs.existsSync(srcLocalesDir)) {
        fs.readdirSync(srcLocalesDir).forEach(langDir => {
          const srcLangDir = path.join(srcLocalesDir, langDir);
          const distLangDir = path.join(distLocalesDir, langDir);
          if (fs.existsSync(srcLangDir)) {
            fs.mkdirSync(distLangDir, { recursive: true });
            fs.readdirSync(srcLangDir).forEach(file => {
              if (file.endsWith('.json')) {
                fs.copyFileSync(
                  path.join(srcLangDir, file),
                  path.join(distLangDir, file)
                );
              }
            });
          }
        });
      }
    }
  };
}

export default defineConfig({
  plugins: [
    copyLocalesPlugin(),
    copyPublicPlugin(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron/electron',
            rollupOptions: {
              external: ['electron', 'chokidar'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron/electron',
            sourcemap: true,
            minify: false,
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
      {
        entry: 'electron/python-bridge.ts',
        vite: {
          build: {
            outDir: 'dist-electron/electron',
            rollupOptions: {
              external: ['child_process', 'electron'],
            },
          },
        },
      },
    ]),
    react(),
    tailwindcss(),
  ],
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    copyPublicDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
});
