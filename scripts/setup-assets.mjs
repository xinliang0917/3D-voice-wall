import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');

const assets = [
  {
    from: join(root, 'node_modules', 'harfbuzzjs', 'hb.wasm'),
    to: join(publicDir, 'hb', 'hb.wasm'),
  },
];

await mkdir(join(publicDir, 'hb'), { recursive: true });
await mkdir(join(publicDir, 'fonts'), { recursive: true });

for (const asset of assets) {
  await copyFile(asset.from, asset.to);
}

await writeFile(
  join(publicDir, 'fonts', '.keep'),
  'Font files are placed here by the download script.\n',
  'utf8',
);

console.log('Assets copied to public/.');
