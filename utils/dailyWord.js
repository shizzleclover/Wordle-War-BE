const DailyWord = require('../models/DailyWord');
const { getRecommendedWord } = require('../game/wordValidator');

/**
 * Gets the word of the day. If it doesn't exist, generates one.
 */
async function getOrUpdateDailyWord() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  let daily = await DailyWord.findOne({ date: today });
  
  if (!daily) {
    // Generate new word for today
    // Let's use 5 letters as standard for daily
    const word = await getRecommendedWord('none', 5);
    daily = await DailyWord.create({
      date: today,
      word: word || 'clash', // Fallback
      theme: 'none'
    });
    console.log(`[Daily] Generated new word for today: ${daily.word}`);
  }
  
  return daily;
}

module.exports = { getOrUpdateDailyWord };
