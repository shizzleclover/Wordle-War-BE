const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { getOrUpdateDailyWord } = require('../utils/dailyWord');

// @desc    Get daily challenge info
// @route   GET /api/daily/info
// @access  Private
router.get('/info', authMiddleware, async (req, res) => {
  try {
    const daily = await getOrUpdateDailyWord();
    const today = daily.date;
    
    const user = await User.findById(req.user.userId);
    const hasPlayed = user.stats.lastDailyDate === today;
    
    res.json({
      date: today,
      wordLength: daily.word.length,
      hasPlayed,
      dailyStreak: user.stats.dailyStreak
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Get the daily word (for solo mode)
// @route   GET /api/daily/word
// @access  Private
router.get('/word', authMiddleware, async (req, res) => {
  try {
    const daily = await getOrUpdateDailyWord();
    res.json({ word: daily.word });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Submit solo daily result
// @route   POST /api/daily/solo
// @access  Private
router.post('/solo', authMiddleware, async (req, res) => {
  try {
    const { guesses, win } = req.body;
    const daily = await getOrUpdateDailyWord();
    const today = daily.date;
    
    const user = await User.findById(req.user.userId);
    
    if (user.stats.lastDailyDate === today) {
      return res.status(400).json({ message: 'Daily challenge already completed for today' });
    }

    // Update streak
    const lastDate = user.stats.lastDailyDate;
    let newStreak = user.stats.dailyStreak;
    
    if (win) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      if (lastDate === yesterdayStr) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
    } else {
      newStreak = 0;
    }

    user.stats.dailyStreak = newStreak;
    user.stats.lastDailyDate = today;
    user.stats.gamesPlayed += 1;
    if (win) user.stats.wins += 1;
    else user.stats.losses += 1;
    user.stats.totalGuesses += guesses;
    
    await user.save();
    
    res.json({ 
      message: 'Daily result recorded', 
      streak: newStreak,
      hasPlayed: true 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
