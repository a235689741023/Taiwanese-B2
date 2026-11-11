import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

// Generates dist/sw.js with a precache list of the app shell + data JSON (audio is cached on demand).
function serviceWorker(): Plugin {
  return {
    name: 'taigi-sw',
    apply: 'build',
    closeBundle() {
      const dist = join(__dirname, 'dist');
      const files: string[] = [];
      const walk = (d: string) => {
        for (const f of readdirSync(d)) {
          const p = join(d, f);
          if (statSync(p).isDirectory()) {
            if (f !== 'audio') walk(p);
          } else files.push(relative(dist, p).split('\\').join('/'));
        }
      };
      walk(dist);
      const shell = files.filter((f) => f !== 'sw.js');
      const hash = createHash('sha1');
      for (const f of shell) hash.update(f + statSync(join(dist, f)).size);
      const tpl = readFileSync(join(__dirname, 'sw.template.js'), 'utf8');
      writeFileSync(
        join(dist, 'sw.js'),
        tpl.replace('__VERSION__', hash.digest('hex').slice(0, 10)).replace('__PRECACHE__', JSON.stringify(['./', ...shell])),
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  test: { environment: 'node' },
});
