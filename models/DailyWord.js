const mongoose = require('mongoose');

const dailyWordSchema = new mongoose.Schema({
  date: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  }, // YYYY-MM-DD
  word: { 
    type: String, 
    required: true 
  },
  theme: { 
    type: String, 
    default: 'none' 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    expires: 60 * 60 * 24 * 7 // Clear after 7 days
  }
});

module.exports = mongoose.model('DailyWord', dailyWordSchema);
