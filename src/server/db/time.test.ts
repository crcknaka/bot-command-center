import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sqlTime } from './time.js';

test('matches the format of SQLite datetime("now")', () => {
  assert.equal(sqlTime(new Date('2026-10-11T09:05:03.123Z')), '2026-10-11 09:05:03');
  assert.equal(sqlTime('2026-10-11T09:05:03.123Z'), '2026-10-11 09:05:03');
  assert.equal(sqlTime('2026-10-11 09:05:03'), '2026-10-11 09:05:03');
});

test('a row stored today sorts after today\'s midnight', () => {
  // The bug this guards against: comparing against an ISO string put today's rows into yesterday
  const stored = '2026-10-11 10:00:00';
  assert.ok(stored >= sqlTime(new Date('2026-10-11T00:00:00.000Z')));
  assert.ok(stored < sqlTime(new Date('2026-10-12T00:00:00.000Z')));
});
