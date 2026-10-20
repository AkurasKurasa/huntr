// Builds the extension for both browsers from extension/ and zips them.
//   Firefox: manifest as-is (background.scripts)   -> deploy/huntr-extension-firefox-upload.zip (upload to addons.mozilla.org)
//   Chrome:  background.service_worker instead      -> client/public/huntr-extension.zip (download on the Setup page)
// Usage: npm run pack:extension
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const src = join(root, 'extension');
const out = join(root, 'build-extension');
rmSync(out, { recursive: true, force: true });

function build(name, edit) {
  const dir = join(out, name, 'huntr-extension');
  mkdirSync(dir, { recursive: true });
  cpSync(src, dir, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  edit(manifest);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return dir;
}

function zip(folder, dest, { contentsOnly }) {
  mkdirSync(resolve(dest, '..'), { recursive: true });
  if (existsSync(dest)) rmSync(dest);
  if (process.platform === 'win32') {
    const path = contentsOnly ? join(folder, '*') : folder;
    execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${path}' -DestinationPath '${dest}'`], { stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-qr', dest, contentsOnly ? '.' : 'huntr-extension'], { cwd: contentsOnly ? folder : resolve(folder, '..'), stdio: 'inherit' });
  }
}

const firefox = build('firefox', () => {});
const chrome = build('chrome', (m) => {
  m.background = { service_worker: 'background.js' };
  delete m.browser_specific_settings; // Firefox-only
});

zip(firefox, join(root, 'deploy', 'huntr-extension-firefox-upload.zip'), { contentsOnly: true }); // manifest at the zip's root, as Mozilla wants
zip(chrome, join(root, 'client', 'public', 'huntr-extension.zip'), { contentsOnly: false }); // unzips to a huntr-extension folder
rmSync(out, { recursive: true, force: true });
console.log('Packed: deploy/huntr-extension-firefox-upload.zip and client/public/huntr-extension.zip');
