const fs = require('fs');
const path = require('path');

class BotEngine {
  constructor() {
    this.dictionaries = {
      4: [],
      5: [],
      6: [],
      7: []
    };
    this.loadDictionaries();
  }

  loadDictionaries() {
    for (const length of [4, 5, 6, 7]) {
      try {
        const p = path.join(__dirname, '..', 'data', `words-${length}.json`);
        if (fs.existsSync(p)) {
          this.dictionaries[length] = JSON.parse(fs.readFileSync(p, 'utf8'));
        }
      } catch (err) {
        console.error(`[BotEngine] Failed to load words-${length}.json`, err);
      }
    }
  }

  /**
   * Pick a random valid word as the bot's secret word.
   */
  pickSecretWord(length) {
    const dict = this.dictionaries[length];
    if (!dict || dict.length === 0) {
      // Fallback
      return 'a'.repeat(length);
    }
    return dict[Math.floor(Math.random() * dict.length)];
  }

  /**
   * Evaluates the next best guess for the bot given its past guesses.
   */
  getBestGuess(length, pastGuesses) {
    let possibleWords = this.dictionaries[length];

    if (!possibleWords || possibleWords.length === 0) {
      return 'a'.repeat(length); // Should never happen unless dictionaries are missing
    }

    // Filter down possible words based on all past guesses
    for (const { word: guessWord, feedback } of pastGuesses) {
      possibleWords = possibleWords.filter(candidate => {
        const simulatedFeedback = this.computeFeedback(guessWord, candidate);
        // Compare simulated feedback with actual feedback
        for (let i = 0; i < length; i++) {
          if (simulatedFeedback[i] !== feedback[i]) {
            return false;
          }
        }
        return true;
      });
    }

    if (possibleWords.length === 0) {
      // In case of error or impossible state, just pick a random word
      return this.pickSecretWord(length);
    }

    // Score words based on global letter frequency
    const freqs = { 
      e:11.0, a:8.5, r:7.6, i:7.5, o:7.2, t:7.0, n:6.7, s:6.3, 
      l:5.3, c:4.5, u:3.6, d:3.4, p:3.2, m:3.0, h:3.0, g:2.5, 
      b:2.1, f:1.8, y:1.8, w:1.3, k:1.1, v:1.0, x:0.3, z:0.3, j:0.2, q:0.2 
    };

    const scoredWords = possibleWords.map(word => {
      let score = 0;
      const seen = new Set();
      for (const char of word) {
        if (!seen.has(char)) {
          score += freqs[char] || 0;
          seen.add(char);
        } else {
          // Severely reduce value of duplicate letters to encourage information gathering
          score += (freqs[char] || 0) * 0.2; 
        }
      }
      return { word, score };
    });

    // Sort descending by score
    scoredWords.sort((a, b) => b.score - a.score);

    // Pick randomly from the top 5 best possible words to keep it slightly unpredictable but very strong
    const topN = Math.min(scoredWords.length, 5);
    const topCandidates = scoredWords.slice(0, topN);
    return topCandidates[Math.floor(Math.random() * topCandidates.length)].word;
  }

  /**
   * Computes Wordle feedback. Cloned from Room.js for standalone use.
   */
  computeFeedback(guess, secret) {
    const feedback = new Array(guess.length).fill('absent');
    const secretArr = secret.split('');
    const guessArr = guess.split('');
    const secretUsed = new Array(secret.length).fill(false);
    const guessUsed = new Array(guess.length).fill(false);

    // Pass 1: Mark exact matches (correct)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessArr[i] === secretArr[i]) {
        feedback[i] = 'correct';
        secretUsed[i] = true;
        guessUsed[i] = true;
      }
    }

    // Pass 2: Mark present (correct letter, wrong position)
    for (let i = 0; i < guessArr.length; i++) {
      if (guessUsed[i]) continue;

      for (let j = 0; j < secretArr.length; j++) {
        if (secretUsed[j]) continue;

        if (guessArr[i] === secretArr[j]) {
          feedback[i] = 'present';
          secretUsed[j] = true;
          break;
        }
      }
    }

    return feedback;
  }
}

module.exports = new BotEngine();
