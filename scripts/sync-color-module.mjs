// The browser and core use the exact same compiled naming algorithm.
import { copyFile } from 'node:fs/promises';
await copyFile(new URL('../dist/core/color-names.js', import.meta.url), new URL('../web/modules/color-names.js', import.meta.url));
