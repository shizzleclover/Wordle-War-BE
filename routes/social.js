const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

// @desc    Follow a user
// @route   POST /api/social/follow/:username
// @access  Private
router.post('/follow/:username', protect, async (req, res) => {
  try {
    const userToFollow = await User.findOne({ username: req.params.username });
    if (!userToFollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (userToFollow._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot follow yourself' });
    }

    // Use addToSet to avoid duplicates
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { following: userToFollow._id }
    });

    res.json({ message: 'Followed successfully', username: userToFollow.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Unfollow a user
// @route   DELETE /api/social/follow/:username
// @access  Private
router.delete('/follow/:username', protect, async (req, res) => {
  try {
    const userToUnfollow = await User.findOne({ username: req.params.username });
    if (!userToUnfollow) {
      return res.status(404).json({ message: 'User not found' });
    }

    await User.findByIdAndUpdate(req.user._id, {
      $pull: { following: userToUnfollow._id }
    });

    res.json({ message: 'Unfollowed successfully', username: userToUnfollow.username });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Get followed users
// @route   GET /api/social/following
// @access  Private
router.get('/following', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('following', 'username stats');
    res.json(user.following);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
