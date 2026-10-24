// A node --test reporter that prints, one per line, the test file of every
// failing test. The mutation check uses it to remember which tests caught a
// mutant, so it can ask those tests first next time.
import { relative } from 'node:path';

export default async function* failingFiles(source) {
  const seen = new Set();
  for await (const event of source) {
    if (event.type !== 'test:fail' || !event.data.file) continue;
    const file = relative(process.cwd(), event.data.file).split('\\').join('/');
    if (seen.has(file)) continue;
    seen.add(file);
    yield `${file}\n`;
  }
}
