/**
 * Copies the telemetry collector into the build output.
 *
 * `tsc` will not emit it: the collector is plain JavaScript (deliberately — it
 * must stay byte-identical to agents/shared/collector.js so this SDK and the
 * challenge page compute the same device identity for the same machine), and
 * `allowJs` cannot be enabled here without colliding with the hand-written
 * collector.d.ts.
 *
 * Without this step the published package imports a module that is not in the
 * tarball, and every consumer's build fails at resolve time.
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

if (!existsSync(dist)) mkdirSync(dist, { recursive: true });

for (const file of ['collector.js', 'collector.d.ts']) {
  copyFileSync(join(root, 'src', file), join(dist, file));
}
