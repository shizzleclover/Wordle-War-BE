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

    // Pick a random word from the REMAINING possible words (this makes it unpredictable but always mathematically valid)
    return possibleWords[Math.floor(Math.random() * possibleWords.length)];
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
