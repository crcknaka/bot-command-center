import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './client.js';
import { resolve } from 'path';

export function runMigrations() {
  const migrationsFolder = resolve(process.cwd(), 'drizzle');
  console.log('📦 Running database migrations...');
  migrate(db, { migrationsFolder });
  console.log('✅ Migrations complete');
}
