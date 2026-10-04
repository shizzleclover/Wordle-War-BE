/**
 * Word validation using the Free Dictionary API + Datamuse for theme checking.
 * 
 * Strategy:
 * 1. isRealWord() — checks if a word exists in the English dictionary
 *    via the Free Dictionary API (dictionaryapi.dev).
 * 2. isWordRelatedToTheme() — checks semantic relationship via Datamuse
 *    with a relaxed threshold so valid themed words aren't rejected.
 */

const fs = require('fs');
const path = require('path');

// Load dictionaries into memory for fast lookup
const dictionaries = {
  4: new Set(),
  5: new Set(),
  6: new Set(),
  7: new Set()
};

for (const length of [4, 5, 6, 7]) {
  try {
    const p = path.join(__dirname, '..', 'data', `words-${length}.json`);
    if (fs.existsSync(p)) {
      const wordsArray = JSON.parse(fs.readFileSync(p, 'utf8'));
      dictionaries[length] = new Set(wordsArray);
    }
  } catch (err) {
    console.error(`[DynamicValidator] Failed to load words-${length}.json`, err);
  }
}

/**
 * Checks if a word is a real English word.
 * Uses fast local dictionary for lengths 4-7. Falls back to Free Dictionary API for others.
 */
async function isRealWord(word) {
  const cleanWord = word.toLowerCase();
  const len = cleanWord.length;

  if (dictionaries[len] && dictionaries[len].size > 0) {
    return dictionaries[len].has(cleanWord);
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`;
    const response = await fetch(url);
    // 200 = word exists, 404 = not a real word
    return response.ok;
  } catch (error) {
    console.error('[DynamicValidator] Dictionary API failed:', error.message);
    // If the API is down, be lenient — allow the word
    return true;
  }
}

/**
 * Validates a word against a theme using the Datamuse API.
 * Uses 'means like' (ml) with a RELAXED threshold.
 * Any score > 0 means there is some semantic relationship.
 */
async function isWordRelatedToTheme(word, theme) {
  if (theme === 'none') return true;

  try {
    const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(theme)}&sp=${encodeURIComponent(word)}&max=5`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[DynamicValidator] Datamuse API error: ${response.status}`);
      // If Datamuse is down, fall back to dictionary check only
      return true;
    }

    const data = await response.json();
    
    // If the word appears in results at all, it's related enough
    const match = data.find(item => item.word.toLowerCase() === word.toLowerCase());
    return !!match;
  } catch (error) {
    console.error('[DynamicValidator] Datamuse fetch failed:', error.message);
    // If API fails, be lenient
    return true;
  }
}

module.exports = { isRealWord, isWordRelatedToTheme };
