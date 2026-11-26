// Sky Courier's entry program (Node 22, standard library only): the game is this
// directory's game/ folder, plain static files a desktop browser loads offline
// (game/index.html and its ES modules, no library and no network request), and the
// program hands it in. It copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Fail here, loudly, on a screenshot the scorer would refuse: the gate takes 3 or 4
// PNG or JPEG renders of at most 256 KiB each. Checking the magic bytes too catches
// a mislabelled file (a WebP renamed .jpg) that a size check alone would wave past.
const MAX_SCREENSHOT_BYTES = 262144;
function checkScreenshots(dir: string): string[] {
  if (!existsSync(dir)) throw new Error(`screenshots/ is missing: the gate wants 3 or 4 renders`);
  const names = readdirSync(dir).filter((n) => /\.(png|jpe?g)$/i.test(n)).sort();
  if (names.length < 3 || names.length > 4) {
    throw new Error(`screenshots/ holds ${names.length} renders: the gate wants 3 or 4`);
  }
  for (const name of names) {
    const path = join(dir, name);
    const size = statSync(path).size;
    if (size > MAX_SCREENSHOT_BYTES) {
      throw new Error(`${name} is ${size} bytes: over the gate's ${MAX_SCREENSHOT_BYTES}-byte cap`);
    }
    const head = readFileSync(path).subarray(0, 4);
    const isJpeg = head[0] === 0xff && head[1] === 0xd8;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    if (!isJpeg && !isPng) throw new Error(`${name} is neither JPEG nor PNG by its magic bytes`);
  }
  return names;
}
const screenshotNames = checkScreenshots(join(here, 'screenshots'));

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps: only text_max_bytes shapes the bytes; the others refuse an
// entry the scorer would refuse (more than 4 screenshots or one over 256 KiB; more
// than 993 files in game/ or 48 MiB of game files, in all, or a path under game/
// over 1000 bytes).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Sky Courier handed in: game/ + ${screenshotNames.length} screenshots (${screenshotNames.join(', ')}) + dossier.json -> ${out}`);
