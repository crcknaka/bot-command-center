import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The database lives under the working directory, so the tests get an empty one of their own
const projectRoot = process.cwd();
process.chdir(mkdtempSync(join(tmpdir(), 'bcc-test-')));

const { db } = await import('../db/client.js');
const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { users, bots, channels, posts } = await import('../db/schema.js');
const { eq } = await import('drizzle-orm');
const { claimPost, publishPostNow, sendTestMessage, PublishError } = await import('./publish.js');

let channelId: number;
const newPost = (status: 'draft' | 'queued' | 'published' = 'draft') =>
  db.insert(posts).values({ channelId, content: 'текст', status }).returning().get();
const statusOf = (id: number) => db.select().from(posts).where(eq(posts.id, id)).get()!.status;

before(() => {
  migrate(db, { migrationsFolder: resolve(projectRoot, 'drizzle') });
  const user = db.insert(users).values({ email: 'a@b.c', name: 'A', passwordHash: 'x' }).returning().get();
  const bot = db.insert(bots).values({ ownerId: user.id, token: 'fake', name: 'Bot' }).returning().get();
  channelId = db.insert(channels).values({ botId: bot.id, chatId: '-1', title: 'Канал' }).returning().get().id;
});

test('a post can be claimed for sending only once', () => {
  const post = newPost('queued');
  assert.equal(claimPost(post.id)?.status, 'publishing');
  assert.equal(claimPost(post.id), null, 'second claim must lose — this is what prevents a duplicate in the channel');
});

test('a published post cannot be claimed again', () => {
  assert.equal(claimPost(newPost('published').id), null);
});

test('publishing with a stopped bot is refused and leaves the draft untouched', async () => {
  const post = newPost('draft');
  await assert.rejects(publishPostNow(post.id), (err: unknown) => err instanceof PublishError && err.status === 400);
  assert.equal(statusOf(post.id), 'draft');
});

test('publishing an already published post is refused', async () => {
  const post = newPost('published');
  await assert.rejects(publishPostNow(post.id), (err: unknown) => err instanceof PublishError && err.status === 400);
});

test('a test send with a stopped bot is refused and saves nothing', async () => {
  const before = db.select().from(posts).all().length;
  await assert.rejects(sendTestMessage(channelId, 'проверка'), (err: unknown) => err instanceof PublishError && err.status === 400);
  assert.equal(db.select().from(posts).all().length, before);
});

test('a test send to a missing chat is refused', async () => {
  await assert.rejects(sendTestMessage(999999, 'проверка'), (err: unknown) => err instanceof PublishError && err.status === 404);
});
