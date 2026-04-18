const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const Match = require('../models/Match');

const router = express.Router();

// GET /api/health — no auth required
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/stats — current user's stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { stats } = user;
    const winRate = stats.gamesPlayed > 0
      ? Math.round((stats.wins / stats.gamesPlayed) * 1000) / 10
      : 0;
    const avgGuesses = stats.gamesPlayed > 0
      ? Math.round((stats.totalGuesses / stats.gamesPlayed) * 10) / 10
      : 0;

    res.json({
      username: user.username,
      gamesPlayed: stats.gamesPlayed,
      wins: stats.wins,
      losses: stats.losses,
      draws: stats.draws,
      winRate,
      totalGuesses: stats.totalGuesses,
      avgGuessesPerGame: avgGuesses,
      fastestWin: stats.fastestWin,
      winStreak: stats.winStreak,
      bestStreak: stats.bestStreak,
      elo: stats.elo || 100
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/stats/vs/:opponent — head-to-head stats
router.get('/stats/vs/:opponent', authMiddleware, async (req, res) => {
  try {
    const { opponent } = req.params;
    const myUsername = req.user.username;

    // Find all matches between these two players
    const matches = await Match.find({
      'players.username': { $all: [myUsername, opponent] },
      'result.endReason': 'solved'
    }).sort({ createdAt: -1 });

    let myWins = 0;
    let theirWins = 0;
    let draws = 0;

    matches.forEach(match => {
      if (match.result.isDraw) {
        draws++;
      } else if (match.result.winner === myUsername) {
        myWins++;
      } else if (match.result.winner === opponent) {
        theirWins++;
      }
    });

    const recentMatches = matches.slice(0, 10).map(m => {
      const myPlayer = m.players.find(p => p.username === myUsername);
      const oppPlayer = m.players.find(p => p.username === opponent);
      return {
        id: m._id,
        date: m.createdAt,
        wordLength: m.wordLength,
        myGuesses: myPlayer?.guessCount || 0,
        opponentGuesses: oppPlayer?.guessCount || 0,
        winner: m.result.winner,
        isDraw: m.result.isDraw,
        duration: m.duration
      };
    });

    res.json({
      you: myUsername,
      opponent,
      yourWins: myWins,
      theirWins,
      draws,
      totalGames: matches.length,
      recentMatches
    });
  } catch (error) {
    console.error('Head-to-head stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/history — current user's match history
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const matches = await Match.find({
      'players.userId': req.user.userId
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Match.countDocuments({
      'players.userId': req.user.userId
    });

    const history = matches.map(m => {
      const me = m.players.find(p => p.userId.toString() === req.user.userId);
      const opp = m.players.find(p => p.userId.toString() !== req.user.userId);
      return {
        id: m._id,
        date: m.createdAt,
        wordLength: m.wordLength,
        opponent: opp?.username || 'Unknown',
        myWord: me?.secretWord,
        opponentWord: opp?.secretWord,
        myGuesses: me?.guessCount || 0,
        opponentGuesses: opp?.guessCount || 0,
        winner: m.result.winner,
        isDraw: m.result.isDraw,
        duration: m.duration
      };
    });

    res.json({
      history,
      page,
      totalPages: Math.ceil(total / limit),
      totalGames: total
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/leaderboard — all players ranked by wins
router.get('/leaderboard', authMiddleware, async (req, res) => {
  try {
    const players = await User.find()
      .select('username stats.gamesPlayed stats.wins stats.losses stats.draws stats.bestStreak stats.elo')
      .sort({ 'stats.elo': -1 })
      .limit(50)
      .lean();

    const leaderboard = players.map((p, index) => ({
      rank: index + 1,
      username: p.username,
      gamesPlayed: p.stats.gamesPlayed,
      wins: p.stats.wins,
      losses: p.stats.losses,
      draws: p.stats.draws,
      winRate: p.stats.gamesPlayed > 0
        ? Math.round((p.stats.wins / p.stats.gamesPlayed) * 1000) / 10
        : 0,
      bestStreak: p.stats.bestStreak,
      elo: p.stats.elo || 100
    }));

    res.json({ leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:username/profile — public profile info and recent matches
router.get('/users/:username/profile', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await User.findOne({ username }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const matches = await Match.find({ 'players.username': username, 'result.endReason': { $ne: 'abandoned' } })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    const recentMatches = matches.map(m => {
      const me = m.players.find(p => p.username === username);
      const opp = m.players.find(p => p.username !== username);
      return {
        id: m._id,
        date: m.createdAt,
        wordLength: m.wordLength,
        opponent: opp?.username || 'Unknown',
        opponentEloChange: opp?.eloChange || 0,
        myGuesses: me?.guessCount || 0,
        myEloChange: me?.eloChange || 0,
        winner: m.result.winner,
        isDraw: m.result.isDraw,
        endReason: m.result.endReason
      };
    });

    const { stats } = user;
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 1000) / 10 : 0;

    res.json({
      username: user.username,
      joinedAt: user.createdAt,
      stats: {
        elo: stats.elo,
        gamesPlayed: stats.gamesPlayed,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        winRate,
        bestStreak: stats.bestStreak
      },
      recentMatches
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/:username/matches — paginated full match history
router.get('/users/:username/matches', async (req, res) => {
  try {
    const { username } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const user = await User.findOne({ 
      username: new RegExp('^' + username.trim() + '$', 'i') 
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const actualUsername = user.username;

    const total = await Match.countDocuments({
      'players.username': actualUsername,
      'result.endReason': { $ne: 'abandoned' }
    });

    const matches = await Match.find({
      'players.username': actualUsername,
      'result.endReason': { $ne: 'abandoned' }
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const items = matches.map(m => {
      const me = m.players.find(p => p.username === actualUsername);
      const opp = m.players.find(p => p.username !== actualUsername);
      return {
        id: m._id,
        date: m.createdAt,
        wordLength: m.wordLength,
        opponent: opp?.username || 'Unknown',
        opponentEloChange: opp?.eloChange || 0,
        myGuesses: me?.guessCount || 0,
        myEloChange: me?.eloChange || 0,
        winner: m.result.winner,
        isDraw: m.result.isDraw,
        endReason: m.result.endReason
      };
    });

    res.json({
      matches: items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Match history error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /api/profile — update user profile (username)
router.patch('/profile', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username is required' });
    }

    const trimmedName = username.trim();
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      return res.status(400).json({ message: 'Username must be between 2 and 20 characters' });
    }

    // Check if username is taken by someone else
    const existing = await User.findOne({ 
      username: new RegExp(`^${trimmedName}$`, 'i'),
      _id: { $ne: req.user.userId }
    });
    
    if (existing) {
      return res.status(400).json({ message: 'Username is already taken' });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.username = trimmedName;
    await user.save();

    res.json(user.toPublicJSON());
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
