import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const fontDir = join(root, 'public', 'fonts');

const FONT_VERSION = '5.1.0';

const fonts = [
  ['noto-sans', 'noto-sans-latin-700-normal.woff2'],
  ['noto-sans', 'noto-sans-vietnamese-700-normal.woff2'],
  ['noto-sans', 'noto-sans-cyrillic-700-normal.woff2'],
  ['noto-sans-sc', 'noto-sans-sc-chinese-simplified-700-normal.woff2'],
  ['noto-sans-jp', 'noto-sans-jp-japanese-700-normal.woff2'],
  ['noto-sans-kr', 'noto-sans-kr-korean-700-normal.woff2'],
  ['noto-sans-arabic', 'noto-sans-arabic-arabic-700-normal.woff2'],
  ['noto-sans-thai', 'noto-sans-thai-thai-700-normal.woff2'],
];

await mkdir(fontDir, { recursive: true });

for (const [packageName, fileName] of fonts) {
  const url = `https://cdn.jsdelivr.net/npm/@fontsource/${packageName}@${FONT_VERSION}/files/${fileName}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await writeFile(join(fontDir, fileName), Buffer.from(await response.arrayBuffer()));
  console.log(`Downloaded ${fileName}`);
}
