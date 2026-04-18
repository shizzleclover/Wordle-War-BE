const MIN_WORD_LENGTH = Math.max(2, parseInt(process.env.WORD_LENGTH_MIN, 10) || 3)
const MAX_WORD_LENGTH = Math.min(32, parseInt(process.env.WORD_LENGTH_MAX, 10) || 20)

/**
 * Any letters-only word is allowed (no dictionary check).
 */
const themes = {
  animals: new Set(['cat', 'dog', 'cow', 'pig', 'fox', 'bear', 'lion', 'wolf', 'deer', 'tiger', 'shark', 'eagle', 'zebra', 'horse', 'mouse', 'donkey', 'monkey', 'rabbit', 'elephant', 'kangaroo']),
  sports: new Set(['run', 'ski', 'golf', 'surf', 'rugby', 'track', 'skate', 'soccer', 'tennis', 'hockey', 'football', 'baseball', 'basketball', 'volleyball', 'badminton']),
  foods: new Set(['pie', 'egg', 'cake', 'soup', 'meat', 'fish', 'rice', 'taco', 'bread', 'pizza', 'pasta', 'apple', 'grape', 'lemon', 'melon', 'orange', 'banana', 'cheese', 'burger', 'cookie']),
  colors: new Set(['red', 'blue', 'pink', 'gray', 'cyan', 'gold', 'teal', 'navy', 'green', 'black', 'white', 'brown', 'peach', 'amber', 'purple', 'yellow', 'orange', 'silver', 'indigo', 'violet']),
  countries: new Set(['usa', 'uk', 'fiji', 'peru', 'cuba', 'mali', 'togo', 'chad', 'oman', 'iran', 'iraq', 'spain', 'italy', 'japan', 'china', 'india', 'egypt', 'brazil', 'france', 'mexico']),
  brands: new Set(['ibm', 'bmw', 'kia', 'mac', 'ford', 'sony', 'nike', 'puma', 'asus', 'dell', 'acer', 'audi', 'intel', 'apple', 'honda', 'gucci', 'prada', 'rolex', 'tesla', 'amazon']),
  cities: new Set(['rome', 'oslo', 'kiev', 'lima', 'baku', 'doha', 'bern', 'seoul', 'tokyo', 'paris', 'dubai', 'milan', 'miami', 'lagos', 'delhi', 'london', 'moscow', 'madrid', 'berlin', 'athens']),
  tech: new Set(['ram', 'cpu', 'gpu', 'ssd', 'usb', 'app', 'web', 'bot', 'code', 'data', 'byte', 'file', 'disk', 'chip', 'cloud', 'mouse', 'board', 'screen', 'server', 'router']),
  music: new Set(['rap', 'pop', 'jazz', 'rock', 'bass', 'beat', 'clef', 'solo', 'song', 'tune', 'band', 'choir', 'chord', 'tempo', 'vocal', 'piano', 'flute', 'guitar', 'melody', 'rhythm']),
  science: new Set(['dna', 'gas', 'ion', 'lab', 'cell', 'data', 'atom', 'mass', 'gene', 'star', 'acid', 'base', 'heat', 'light', 'space', 'force', 'fluid', 'solid', 'planet', 'energy']),
  movies: new Set(['saw', 'jaws', 'it', 'up', 'dune', 'hook', 'tron', 'shrek', 'rocky', 'alien', 'matrix', 'avenger', 'batman', 'marvel', 'disney', 'cinema', 'action', 'comedy', 'drama', 'horror']),
  nature: new Set(['sky', 'sun', 'sea', 'ice', 'fog', 'dew', 'tree', 'leaf', 'wood', 'rock', 'dirt', 'dust', 'sand', 'wind', 'rain', 'fire', 'snow', 'storm', 'river', 'forest'])
}

function isAllowedWord(word, length) {
  if (!word || typeof word !== 'string' || word.length !== length) return false
  return /^[a-z]+$/.test(word)
}

function isAllowedSecret(word, length, theme = 'none') {
  if (!isAllowedWord(word, length)) return false
  if (theme !== 'none' && themes[theme]) {
    return themes[theme].has(word)
  }
  return true
}

function isValidRoomWordLength(n) {
  return Number.isInteger(n) && n >= MIN_WORD_LENGTH && n <= MAX_WORD_LENGTH
}

module.exports = {
  isAllowedWord,
  isAllowedSecret,
  isValidRoomWordLength,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
}
