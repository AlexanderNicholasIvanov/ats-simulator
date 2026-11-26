// Packs dist/ + scripts/exe/server.cjs into release/ats-simulator.exe (a Node single executable application).
// Run `npm run build:exe` (it builds dist/ first). Needs Windows to produce a Windows exe.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const out = join(root, 'release');
const exeName = process.platform === 'win32' ? 'ats-simulator.exe' : 'ats-simulator';
const exe = join(out, exeName);

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html not found: run `npm run build` first.');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const assets = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else assets['/' + relative(dist, full).split(sep).join('/')] = full;
  }
};
walk(dist);
const manifest = join(out, 'manifest.json');
writeFileSync(manifest, JSON.stringify(Object.keys(assets)));

const blob = join(out, 'sea-prep.blob');
const config = join(out, 'sea-config.json');
writeFileSync(
  config,
  JSON.stringify(
    {
      main: join(root, 'scripts', 'exe', 'server.cjs'),
      output: blob,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
      assets: { 'manifest.json': manifest, ...assets },
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
copyFileSync(process.execPath, exe);

const require = createRequire(import.meta.url);
const postject = join(dirname(require.resolve('postject/package.json')), 'dist', 'cli.js');
execFileSync(
  process.execPath,
  [
    postject,
    exe,
    'NODE_SEA_BLOB',
    blob,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ],
  { stdio: 'inherit' },
);
for (const f of [blob, config, manifest]) rmSync(f);

console.log(`built ${relative(root, exe)} (${Math.round(statSync(exe).size / 1e6)} MB, ${Object.keys(assets).length} files)`);
