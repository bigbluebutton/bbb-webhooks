/* Read mapped-events.json and raw-events.json from the current directory and
 * print them in a human-readable format (new files with a -pretty suffix).
 * Overwrites existing files.
 */

import { open, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

(async () => {
  await rm(join(__dirname, 'mapped-events-pretty.json'), { force: true });
  const mHandle = await open(join(__dirname, 'mapped-events.json'), 'r');
  for await (const line of mHandle.readLines()) {
    // Parse JSON and write it pretty-printed (2 spaces) to the suffixed file
    // Append a newline to the end of the file
    await writeFile(
      join(__dirname, 'mapped-events-pretty.json'),
      JSON.stringify(JSON.parse(line), null, 2) + '\n', { flag: 'a' },
    );
  }

  await rm(join(__dirname, 'raw-events-pretty.json'), { force: true });
  const rHandle = await open(join(__dirname, 'raw-events.json'), 'r');
  for await (const line of rHandle.readLines()) {
    await writeFile(
      join(__dirname, 'raw-events-pretty.json'),
      JSON.stringify(JSON.parse(line), null, 2) + '\n', { flag: 'a' },
    );
  }
})();
