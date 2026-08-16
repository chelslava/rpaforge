import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import electron from 'vite-plugin-electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import pkg from './package.json';

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function copyPublicPlugin() {
  return {
    name: 'copy-public',
    async closeBundle() {
      const publicDir = path.resolve(__dirname, 'public');
      const distDir = path.resolve(__dirname, 'dist');

      const distExists = await exists(distDir);
      if (!distExists) {
        await fs.mkdir(distDir, { recursive: true });
      }

      const pubExists = await exists(publicDir);
      if (pubExists) {
        const files = await fs.readdir(publicDir);
        for (const file of files) {
          if (file === 'locales') continue;
          const srcPath = path.join(publicDir, file);
          const destPath = path.join(distDir, file);
          const stat = await fs.stat(srcPath);
          if (stat.isDirectory()) {
            await fs.cp(srcPath, destPath, { recursive: true });
          } else {
            await fs.copyFile(srcPath, destPath);
          }
        }
      }
    }
  };
}

function copyLocalesPlugin() {
  return {
    name: 'copy-locales',
    async closeBundle() {
      const srcLocalesDir = path.resolve(__dirname, 'src/i18n/locales');
      const distLocalesDir = path.resolve(__dirname, 'dist/locales');

      const distExists = await exists(distLocalesDir);
      if (!distExists) {
        await fs.mkdir(distLocalesDir, { recursive: true });
      }

      const srcExists = await exists(srcLocalesDir);
      if (srcExists) {
        const langDirs = await fs.readdir(srcLocalesDir);
        for (const langDir of langDirs) {
          const srcLangDir = path.join(srcLocalesDir, langDir);
          const distLangDir = path.join(distLocalesDir, langDir);
          const langExists = await exists(srcLangDir);
          if (langExists) {
            await fs.mkdir(distLangDir, { recursive: true });
            const files = await fs.readdir(srcLangDir);
            for (const file of files) {
              if (file.endsWith('.json')) {
                await fs.copyFile(
                  path.join(srcLangDir, file),
                  path.join(distLangDir, file)
                );
              }
            }
          }
        }
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
            lib: {
              entry: 'electron/preload.ts',
              formats: ['cjs'],
            },
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                inlineDynamicImports: true,
                entryFileNames: 'preload.cjs',
              },
            },
            commonjsOptions: {
              transformMixedEsModules: true,
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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@xyflow') || id.includes('node_modules/reactflow')) return 'xyflow-vendor';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'react-vendor';
          if (id.includes('node_modules/react-icons')) return 'icons-vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
  },
});
