import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findBannedWord } from './match.js';

const banned = ['пидр', 'хуй', 'бля'];

test('finds a banned root inside a word', () => {
  assert.equal(findBannedWord('походу я спидраню бан', banned), 'пидр');
  assert.equal(findBannedWord('ну ты и ПИДР', banned), 'пидр');
});

test('finds a banned word written in latin', () => {
  assert.equal(findBannedWord('ну huy знает', banned), 'хуй');
});

test('skips a banned root that sits inside an exception word', () => {
  assert.equal(findBannedWord('походу я спидраню бан', banned, ['спидран']), undefined);
  assert.equal(findBannedWord('Спидран за 5 минут', banned, ['спидран']), undefined);
});

test('an exception word does not hide real swearing next to it', () => {
  assert.equal(findBannedWord('спидраню, бля', banned, ['спидран']), 'бля');
  assert.equal(findBannedWord('спидран пидр', banned, ['спидран']), 'пидр');
});

test('ignores empty exception entries', () => {
  assert.equal(findBannedWord('пидр', banned, ['', '  ']), 'пидр');
});
