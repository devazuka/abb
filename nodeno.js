// monkeypatch all used Deno api with nodejs equivalent
import { readFile } from 'node:fs/promises'

globalThis.Deno = {
  consoleSize: () => process.stdout,
  writeTextFile: (path, body) => writeFile(path, body, 'utf8'),
  readFile: (path) => readFile(path),
  exit: code => process.exit(code),
  env: { get: key => process.env[key] },
  noColor: process.env.NO_COLOR !== '0',
}


// do this import async so Deno is already polyfilled
await import('./scan.js')

// export MEILI_MASTER_KEY="qfZPJnHuv4w5dQLunFnIxavicv03v4-sGskdq9IwATw"
// export MEILI_URL="https://search.devazuka.com"