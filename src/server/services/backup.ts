import { resolve } from 'path';
import { mkdirSync, readdirSync, unlinkSync } from 'fs';
import { sqlite } from '../db/client.js';

const BACKUP_DIR = resolve(process.cwd(), 'data', 'backups');
const KEEP = 7;

/** Consistent copy of the live database (safe while the server is writing); keeps the last 7 */
export async function backupDatabase() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `bot-center-${new Date().toISOString().slice(0, 10)}.db`;
  await sqlite.backup(resolve(BACKUP_DIR, name));

  const old = readdirSync(BACKUP_DIR).filter((f) => /^bot-center-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -KEEP);
  for (const f of old) unlinkSync(resolve(BACKUP_DIR, f));
  console.log(`💾 Database backed up to data/backups/${name}`);
}
