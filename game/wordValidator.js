const { isRealWord, isWordRelatedToTheme } = require('./dynamicValidator');

const MIN_WORD_LENGTH = Math.max(2, parseInt(process.env.WORD_LENGTH_MIN, 10) || 3)
const MAX_WORD_LENGTH = Math.min(32, parseInt(process.env.WORD_LENGTH_MAX, 10) || 20)

/**
 * Localized and expanded themes to supplement the dynamic API.
 * Includes "Nigeria First" localization.
 */
const localThemes = {
  animals: new Set(['cat', 'dog', 'cow', 'pig', 'fox', 'bear', 'lion', 'wolf', 'deer', 'tiger', 'shark', 'eagle', 'zebra', 'horse', 'mouse', 'donkey', 'monkey', 'rabbit', 'elephant', 'kangaroo', 'gorilla', 'giraffe', 'leopard', 'cheetah', 'hyena', 'vulture', 'penguin', 'dolphin', 'whale', 'octopus', 'camel', 'hamster', 'parrot', 'falcon', 'cobra', 'lizard', 'turtle', 'snail', 'spider', 'beetle']),
  sports: new Set(['run', 'ski', 'golf', 'surf', 'rugby', 'track', 'skate', 'soccer', 'tennis', 'hockey', 'football', 'baseball', 'basketball', 'volleyball', 'badminton', 'boxing', 'karate', 'judo', 'wrestling', 'cycling', 'swimming', 'archery', 'fencing', 'cricket', 'squash', 'rowing', 'sailing', 'hiking', 'racing', 'chess', 'darts']),
  foods: new Set(['pie', 'egg', 'cake', 'soup', 'meat', 'fish', 'rice', 'taco', 'bread', 'pizza', 'pasta', 'apple', 'grape', 'lemon', 'melon', 'orange', 'banana', 'cheese', 'burger', 'cookie', 'shrimp', 'prawn', 'lobster', 'oyster', 'salmon', 'steak', 'salad', 'bacon', 'donut', 'muffin', 'jollof', 'suya', 'amala', 'egusi', 'akara', 'fufu', 'eba', 'garri', 'tuwo', 'akpu', 'zobo', 'dodo', 'kilishi', 'banga', 'yam', 'okra', 'stew', 'pepper', 'onion', 'garlic', 'ginger', 'mango', 'peach', 'berry', 'olive', 'honey', 'sauce', 'cream', 'toast', 'candy', 'chips', 'curry', 'gravy', 'flour']),
  colors: new Set(['red', 'blue', 'pink', 'gray', 'cyan', 'gold', 'teal', 'navy', 'green', 'black', 'white', 'brown', 'peach', 'amber', 'purple', 'yellow', 'orange', 'silver', 'indigo', 'violet', 'azure', 'beige', 'bronze', 'coral', 'ivory', 'khaki', 'lavender', 'lime', 'magenta', 'maroon', 'olive', 'plum', 'ruby', 'scarlet', 'tan', 'turquoise']),
  countries: new Set(['usa', 'uk', 'fiji', 'peru', 'cuba', 'mali', 'togo', 'chad', 'oman', 'iran', 'iraq', 'spain', 'italy', 'japan', 'china', 'india', 'egypt', 'brazil', 'france', 'mexico', 'nigeria', 'ghana', 'kenya', 'canada', 'germany', 'russia', 'turkey', 'greece', 'norway', 'sweden', 'korea', 'argentina', 'chile', 'peru', 'morocco', 'senegal', 'ethiopia', 'south africa']),
  brands: new Set(['ibm', 'bmw', 'kia', 'mac', 'ford', 'sony', 'nike', 'puma', 'asus', 'dell', 'acer', 'audi', 'intel', 'apple', 'honda', 'gucci', 'prada', 'rolex', 'tesla', 'amazon', 'google', 'meta', 'tiktok', 'adidas', 'dangote', 'glo', 'mtn', 'airtel', 'access', 'zenith', 'peak', 'milo', 'maggi', 'knorr', 'cowbell', 'chivita', 'indomie']),
  cities: new Set(['rome', 'oslo', 'kiev', 'lima', 'baku', 'doha', 'bern', 'seoul', 'tokyo', 'paris', 'dubai', 'milan', 'miami', 'lagos', 'delhi', 'london', 'moscow', 'madrid', 'berlin', 'athens', 'abuja', 'kano', 'ibadan', 'benin', 'enugu', 'jos', 'warri', 'aba', 'akure', 'ikeja', 'asaba', 'awka', 'calabar', 'sokoto', 'ilorin', 'kaduna', 'lokoja', 'minna', 'owerri', 'uyo', 'yola', 'zaria']),
  tech: new Set(['ram', 'cpu', 'gpu', 'ssd', 'usb', 'app', 'web', 'bot', 'code', 'data', 'byte', 'file', 'disk', 'chip', 'cloud', 'mouse', 'board', 'screen', 'server', 'router', 'phone', 'laptop', 'tablet', 'linux', 'windows', 'python', 'java', 'react', 'node', 'crypto', 'signal', 'zoom', 'slack', 'wifi', 'fiber', 'cable', 'modem', 'logic', 'array', 'stack', 'queue']),
  music: new Set(['rap', 'pop', 'jazz', 'rock', 'bass', 'beat', 'clef', 'solo', 'song', 'tune', 'band', 'choir', 'chord', 'tempo', 'vocal', 'piano', 'flute', 'guitar', 'melody', 'rhythm', 'drums', 'violin', 'trumpet', 'afrobeats', 'highlife', 'gospel', 'blues', 'metal', 'techno', 'house', 'reggae', 'samba', 'opera', 'ballet', 'dance', 'lyrics', 'album', 'remix', 'disco']),
  science: new Set(['dna', 'gas', 'ion', 'lab', 'cell', 'data', 'atom', 'mass', 'gene', 'star', 'acid', 'base', 'heat', 'light', 'space', 'force', 'fluid', 'solid', 'planet', 'energy', 'math', 'atom', 'physics', 'biology', 'formula', 'logic', 'theory', 'study', 'expert', 'doctor', 'nurse', 'health', 'nature', 'power', 'source', 'system', 'method', 'effect', 'result']),
  movies: new Set(['saw', 'jaws', 'it', 'up', 'dune', 'hook', 'tron', 'shrek', 'rocky', 'alien', 'matrix', 'avenger', 'batman', 'marvel', 'disney', 'cinema', 'action', 'comedy', 'drama', 'horror', 'actor', 'script', 'scene', 'camera', 'studio', 'hollywood', 'nollywood', 'oscar', 'award', 'film', 'series', 'show', 'video', 'watch', 'media', 'press']),
  nature: new Set(['sky', 'sun', 'sea', 'ice', 'fog', 'dew', 'tree', 'leaf', 'wood', 'rock', 'dirt', 'dust', 'sand', 'wind', 'rain', 'fire', 'snow', 'storm', 'river', 'forest', 'ocean', 'lake', 'earth', 'ground', 'grass', 'flower', 'plant', 'desert', 'jungle', 'island', 'valley', 'cave', 'cliff', 'beach', 'creek', 'garden', 'field', 'meadow', 'peak', 'hill', 'animal']),
  naija: new Set(['lagos', 'abuja', 'kano', 'ibadan', 'benin', 'enugu', 'jos', 'delta', 'aba', 'warri', 'ikeja', 'naira', 'naija', 'suya', 'jollof', 'amala', 'egusi', 'akara', 'fufu', 'eba', 'garri', 'tuwo', 'akpu', 'zobo', 'dodo', 'kilishi', 'banga', 'nkwobi', 'yam', 'okra', 'glo', 'mtn', 'dangote', 'airtel', 'access', 'zenith', 'peak', 'milo', 'maggi', 'knorr', 'cowbell', 'indomie', 'japa', 'sapa', 'chop', 'kolo', 'cruise', 'sharp', 'gba', 'yab', 'okada', 'owambe', 'afrobeats', 'nollywood', 'highlife', 'gospel', 'area', 'pikin', 'mumu', 'agbero', 'dash', 'legit', 'runs', 'bambi', 'shayo', 'vawulence', 'steeze'])
}

function isAllowedWord(word, length) {
  if (!word || typeof word !== 'string' || word.length !== length) return false
  return /^[a-z]+$/.test(word)
}

/**
 * Validates a word for use as a secret word.
 * 
 * Strategy:
 * 1. Basic format check (length, lowercase alpha)
 * 2. If theme = 'none': just check it's a real English word via dictionary API
 * 3. If theme is set:
 *    a. If it's in our local curated set → accept immediately (covers Naija, etc.)
 *    b. Check it's a real English word via dictionary API
 *    c. Check theme relevance via Datamuse (relaxed — any match counts)
 *    d. If Datamuse says no but dictionary says yes → still accept
 *       (we trust the player's judgment on theme loosely)
 */
async function isAllowedSecret(word, length, theme = 'none') {
  if (!isAllowedWord(word, length)) return false

  const cleanWord = word.toLowerCase()

  // No theme restriction — just verify it's a real word
  if (theme === 'none') {
    return await isRealWord(cleanWord)
  }

  // 1. Check local curated sets first (instant, covers Naija slang and cultural words)
  if (localThemes[theme] && localThemes[theme].has(cleanWord)) {
    return true
  }

  // 2. Check if it's a real English word (proper dictionary check)
  const realWord = await isRealWord(cleanWord)
  if (!realWord) {
    return false // Not a real word and not in our local sets
  }

  // 3. It's a real word — check theme relevance via Datamuse (relaxed)
  const themeMatch = await isWordRelatedToTheme(cleanWord, theme)
  if (themeMatch) {
    return true
  }

  // 4. It's a real English word but Datamuse doesn't see a theme link.
  //    Be lenient: accept it. The player likely knows better than the API.
  //    This prevents frustrating rejections of valid themed words.
  return true
}

function isValidRoomWordLength(n) {
  return Number.isInteger(n) && n >= MIN_WORD_LENGTH && n <= MAX_WORD_LENGTH
}

/**
 * Gets a recommended word for a given theme and length.
 * Picks from local set first, then falls back to Datamuse.
 */
async function getRecommendedWord(theme, length) {
  // 1. Try local set first
  if (localThemes[theme]) {
    const list = [...localThemes[theme]].filter(w => w.length === length);
    if (list.length > 0) {
      return list[Math.floor(Math.random() * list.length)];
    }
  }

  if (theme === 'none') {
    const generic = ['apple', 'bread', 'clock', 'dance', 'eagle', 'flute', 'grape', 'house', 'ivory', 'joker',
                     'brave', 'charm', 'dream', 'frost', 'glyph', 'heart', 'knife', 'light', 'magic', 'noble',
                     'piano', 'quest', 'royal', 'stone', 'trick', 'ultra', 'vigor', 'world'];
    const filtered = generic.filter(w => w.length === length);
    return filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : null;
  }

  // 2. Fetch from Datamuse
  try {
    const sp = '?'.repeat(length);
    const url = `https://api.datamuse.com/words?ml=${encodeURIComponent(theme)}&sp=${sp}&max=30`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data && data.length > 0) {
        const pick = data[Math.floor(Math.random() * data.length)];
        return pick.word.toLowerCase();
      }
    }
  } catch (err) {
    console.error('[WordValidator] Suggestion fetch failed:', err);
  }

  return null;
}

module.exports = {
  isAllowedWord,
  isAllowedSecret,
  isValidRoomWordLength,
  getRecommendedWord,
  localThemes,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
}
