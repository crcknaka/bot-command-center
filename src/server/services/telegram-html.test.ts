import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeForTelegram, visibleLength } from './telegram-html.js';

test('keeps the tags Telegram supports', () => {
  const html = '<b>Жирный</b> <i>курсив</i> <a href="https://euc.one">ссылка</a> <code>x</code>';
  assert.equal(sanitizeForTelegram(html), html);
});

test('turns <br> and block tags into line breaks instead of sending them', () => {
  assert.equal(sanitizeForTelegram('Строка<br>вторая<br/>третья'), 'Строка\nвторая\nтретья');
  assert.equal(sanitizeForTelegram('<p>Абзац</p><p>Второй</p>'), 'Абзац\nВторой');
  assert.equal(sanitizeForTelegram('<ul><li>раз</li><li>два</li></ul>'), '• раз\n• два');
});

test('drops unsupported tags but keeps their text', () => {
  assert.equal(sanitizeForTelegram('<img src="x.png">Текст <script>alert(1)</script><h2>Заголовок</h2>'), 'Текст alert(1)Заголовок');
  assert.equal(sanitizeForTelegram('<span style="color:red">красный</span>'), 'красный');
  assert.equal(sanitizeForTelegram('<span class="tg-spoiler">спойлер</span>'), '<span class="tg-spoiler">спойлер</span>');
});

test('escapes stray &, < and > that would break parsing', () => {
  assert.equal(sanitizeForTelegram('Скорость < 50 км/ч & запас > 20%'), 'Скорость &lt; 50 км/ч &amp; запас &gt; 20%');
  assert.equal(sanitizeForTelegram('Tom &amp; Jerry &lt;3'), 'Tom &amp; Jerry &lt;3');
});

test('closes tags left open and ignores closing tags without a pair', () => {
  assert.equal(sanitizeForTelegram('<b>не закрыт <i>вложен'), '<b>не закрыт <i>вложен</i></b>');
  assert.equal(sanitizeForTelegram('лишний</b> хвост'), 'лишний хвост');
  assert.equal(sanitizeForTelegram('<b>перекрёст <i>тегов</b> тут</i>'), '<b>перекрёст <i>тегов</i></b> тут');
});

test('drops links without a usable address', () => {
  assert.equal(sanitizeForTelegram('<a href="javascript:alert(1)">клик</a>'), 'клик');
  assert.equal(sanitizeForTelegram('<a>клик</a>'), 'клик');
  assert.equal(sanitizeForTelegram('<a href="https://a.b/?x=1&y=2" target="_blank">клик</a>'), '<a href="https://a.b/?x=1&amp;y=2">клик</a>');
});

test('visibleLength counts what the reader sees', () => {
  assert.equal(visibleLength('<b>абв</b> &amp; <a href="https://very.long/url">г</a>'), 7);
});
