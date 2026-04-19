const roomManager = require('./RoomManager');
const { getOrUpdateDailyWord } = require('../utils/dailyWord');

class Matchmaker {
  constructor() {
    // queue maps userId -> Request
    this.queue = new Map();
    this.io = null;

    this.allThemes = ['animals', 'sports', 'foods', 'colors', 'countries', 'brands', 'cities', 'tech', 'music', 'science', 'movies', 'nature'];

    setInterval(() => this.processQueue(), 3000);
  }

  setIo(io) {
    this.io = io;
  }

  /**
   * Request matching.
   * options: { wordLength, gameMode, theme }
   */
  joinQueue(socketId, user, options, elo) {
    if (this.queue.has(String(user.userId))) {
      const existing = this.queue.get(String(user.userId));
      existing.socketId = socketId;
      existing.options = options;
      return;
    }

    this.queue.set(String(user.userId), {
      socketId,
      user,
      options,
      elo: Number(elo) || 100,
      joinedAt: Date.now()
    });
    
    console.log(`🔍 ${user.username} joined matchmaking: ${options.wordLength}L, ${options.gameMode}, auto-theme:${options.theme}, ELO:${elo}`);
  }

  leaveQueue(userId) {
    this.queue.delete(String(userId));
  }

  isDailyQueue(userId) {
    const q = this.queue.get(String(userId));
    return q?.options?.isDaily === true;
  }

  isInQueue(userId) {
    return this.queue.has(String(userId));
  }

  processQueue() {
    if (this.queue.size < 2 || !this.io) return;

    const players = Array.from(this.queue.values());

    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const p1 = players[i];
        const p2 = players[j];

        if (!this.queue.has(String(p1.user.userId)) || !this.queue.has(String(p2.user.userId))) {
          continue;
        }

        // Strict matches
        // Strict separation for Daily Challenges
        if (!!p1.options.isDaily !== !!p2.options.isDaily) continue;
        
        // Flexible matches: if neither is random, settings must match strictly
        if (p1.options.gameMode !== 'random' && p2.options.gameMode !== 'random') {
          if (p1.options.gameMode !== p2.options.gameMode) continue;
          if (p1.options.wordLength !== p2.options.wordLength) continue;
          if (p1.options.theme !== p2.options.theme) continue;
        }

        // Elo range calculation
        const now = Date.now();
        const p1WaitTime = Math.floor((now - p1.joinedAt) / 1000);
        const p2WaitTime = Math.floor((now - p2.joinedAt) / 1000);

        const maxWaitTime = Math.max(p1WaitTime, p2WaitTime);
        // Start with 100 tolerance, gain 20 tolerance per second waiting
        const tolerance = 100 + (maxWaitTime * 20);

        if (Math.abs(p1.elo - p2.elo) <= tolerance) {
          // It's a match!
          this.queue.delete(String(p1.user.userId));
          this.queue.delete(String(p2.user.userId));

          this.formMatch(p1, p2);
        }
      }
    }
  }

  formMatch(p1, p2) {
    try {
      let wordLength = p1.options.wordLength;
      let theme = p1.options.theme;

      // Logic for choosing settings:
      // 1. If both are random: pick system randoms
      // 2. If one is random and the other is standard: pick the standard one's settings
      // 3. If neither is random: they matched strictly, so use P1's (same as P2)
      
      if (p1.options.gameMode === 'random' && p2.options.gameMode === 'random') {
        wordLength = [4, 5, 6, 7][Math.floor(Math.random() * 4)];
        theme = this.allThemes[Math.floor(Math.random() * this.allThemes.length)];
        console.log(`🎲 Surprise Match (Both random): System chose ${wordLength}L and theme: ${theme}`);
      } else if (p1.options.gameMode === 'random') {
        // P1 is filler, adopt P2's specific settings
        wordLength = p2.options.wordLength;
        theme = p2.options.theme;
        console.log(`🤝 Surprise Match (P1 filler): Adopting ${p2.user.username}'s settings: ${wordLength}L, ${theme}`);
      } else if (p2.options.gameMode === 'random') {
        // P2 is filler, adopt P1's specific settings
        wordLength = p1.options.wordLength;
        theme = p1.options.theme;
        console.log(`🤝 Surprise Match (P2 filler): Adopting ${p1.user.username}'s settings: ${wordLength}L, ${theme}`);
      }

      const room = roomManager.createRoom(wordLength, p1.socketId, p1.user, {
        gameMode: p1.options.gameMode,
        theme: theme,
        isDaily: !!p1.options.isDaily
      });
      roomManager.joinRoom(room.id, p2.socketId, p2.user);

      // Join sockets to the Socket.io room channel
      const s1 = this.io.sockets.sockets.get(p1.socketId);
      const s2 = this.io.sockets.sockets.get(p2.socketId);
      if (s1) s1.join(room.id);
      if (s2) s2.join(room.id);

      // FOR DAILY RACE: Skip setup and set words immediately
      if (p1.options.isDaily) {
        getOrUpdateDailyWord().then(daily => {
          room.setWord(p1.socketId, daily.word);
          room.setWord(p2.socketId, daily.word);
          // Emit game-start manually since setWord might not trigger it instantly in all scenarios
          this.io.to(room.id).emit('match-found', { roomCode: room.id, isDaily: true });
        });
      } else {
        this.io.to(room.id).emit('match-found', { roomCode: room.id });
      }
      
      console.log(`🤝 Match formed: ${p1.user.username} vs ${p2.user.username} in Room ${room.id} (${p1.options.gameMode})`);
    } catch (err) {
      console.error('Match formation error:', err);
    }
  }

  buildRoomState(room, socketId) {
    const player = room.getPlayer(socketId);
    const opponent = room.getOpponent(socketId);
    if (!player) return null;

    const players = [...room.players.values()].map(p => ({
      username: p.username,
      ready: p.ready,
      disconnected: p.disconnected
    }));

    return {
      roomCode: room.id,
      wordLength: room.wordLength,
      phase: room.phase,
      gameMode: room.gameMode,
      theme: room.theme,
      players,
      you: {
        ready: player.ready,
        hasSetWord: Boolean(player.secretWord),
        guesses: player.guesses,
        yourWord:
          room.phase === 'playing' || room.phase === 'finished'
            ? player.secretWord?.toUpperCase() ?? null
            : null
      },
      opponent: opponent
        ? {
            username: opponent.username,
            ready: opponent.ready,
            disconnected: opponent.disconnected,
            guessCount: opponent.guesses.length
          }
        : null,
      yourTurn: room.phase === 'playing' && room.currentTurn === socketId,
      turnNumber: room.turnNumber
    };
  }
}

module.exports = new Matchmaker();
