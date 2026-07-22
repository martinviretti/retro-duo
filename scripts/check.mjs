import { readdir, readFile, access } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
const jsFiles = files.filter((file) => extname(file) === '.js' || extname(file) === '.mjs');
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${relative(root, file)}: ${result.stderr.trim()}`);
}

const htmlFiles = files.filter((file) => extname(file) === '.html');
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const references = [...html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)]
    .map((match) => match[1])
    .filter((value) => !/^(?:https?:|mailto:|tel:|data:)/.test(value));
  for (const reference of references) {
    const target = join(root, reference);
    try {
      await access(target);
    } catch {
      failures.push(`${relative(root, file)} referencia un archivo inexistente: ${reference}`);
    }
  }
  if (!html.includes('<meta name="viewport"')) failures.push(`${relative(root, file)} no tiene viewport.`);
  if (!html.includes('<html lang="es"')) failures.push(`${relative(root, file)} no declara lang="es".`);
}

const forbidden = files.filter((file) => /\.(?:bin|gen|smd|rom|iso|cue|chd)$/i.test(file));
if (forbidden.length) failures.push(`Se detectaron posibles archivos comerciales: ${forbidden.map((file) => relative(root, file)).join(', ')}`);

if (failures.length) {
  console.error(`Validación fallida (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`OK: ${jsFiles.length} scripts, ${htmlFiles.length} páginas y ${files.length} archivos validados.`);
