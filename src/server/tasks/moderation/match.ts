/** Normalize text for profanity detection: translit latin→cyrillic + homoglyphs */
export function normalizeForCheck(text: string): string {
  const lower = text.toLowerCase();
  // Step 1: replace multi-char latin combos → cyrillic
  const multi: [string, string][] = [
    ['shch', 'щ'], ['sch', 'щ'], ['sh', 'ш'], ['ch', 'ч'], ['zh', 'ж'],
    ['ts', 'ц'], ['ya', 'я'], ['yu', 'ю'], ['yo', 'ё'], ['ye', 'е'],
    ['uy', 'уй'], ['iy', 'ий'], ['ey', 'ей'], ['oy', 'ой'], ['ay', 'ай'],
  ];
  let result = lower;
  for (const [lat, cyr] of multi) {
    result = result.split(lat).join(cyr);
  }
  // Step 2: single char translit
  const single: Record<string, string> = {
    'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'z': 'з',
    'i': 'и', 'j': 'й', 'k': 'к', 'l': 'л', 'm': 'м', 'n': 'н', 'o': 'о',
    'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у', 'f': 'ф', 'h': 'х',
    'c': 'ц', 'w': 'в', 'x': 'кс', 'y': 'й', 'q': 'к',
  };
  result = result.replace(/[a-z]/g, (ch) => single[ch] ?? ch);
  return result;
}

/** Cut every allowed word out of the text, so a banned root inside it (спидран → пидр) does not count */
function stripAllowed(text: string, allowedWords: string[]): string {
  let result = text;
  for (const word of allowedWords) {
    const w = word.trim().toLowerCase();
    if (w) result = result.split(w).join(' ');
  }
  return result;
}

/** First banned word found in the text (original + translit normalized), ignoring exception words */
export function findBannedWord(text: string, bannedWords: string[], allowedWords: string[] = []): string | undefined {
  const lower = stripAllowed(text.toLowerCase(), allowedWords);
  const normalized = stripAllowed(normalizeForCheck(text), allowedWords);
  return bannedWords.find((word) => {
    const w = word.toLowerCase();
    return lower.includes(w) || normalized.includes(w);
  });
}
