const roomManager = require('./RoomManager');

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
      elo: Number(elo) || 1200,
      joinedAt: Date.now()
    });
    
    console.log(`🔍 ${user.username} joined matchmaking: ${options.wordLength}L, ${options.gameMode}, auto-theme:${options.theme}, ELO:${elo}`);
  }

  leaveQueue(userId) {
    this.queue.delete(String(userId));
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
        if (p1.options.gameMode !== p2.options.gameMode) continue;
        
        // If not random mode, word length and theme must match
        if (p1.options.gameMode !== 'random') {
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

      // For random mode, system decides the length and theme
      if (p1.options.gameMode === 'random') {
        wordLength = [4, 5, 6, 7][Math.floor(Math.random() * 4)];
        theme = this.allThemes[Math.floor(Math.random() * this.allThemes.length)];
        console.log(`🎲 Random mode: System chose ${wordLength}L and theme: ${theme}`);
      }

      const room = roomManager.createRoom(wordLength, p1.socketId, p1.user, {
        gameMode: p1.options.gameMode,
        theme: theme
      });
      roomManager.joinRoom(room.id, p2.socketId, p2.user);

      // Add sockets to the room
      const s1 = this.io.sockets.sockets.get(p1.socketId);
      const s2 = this.io.sockets.sockets.get(p2.socketId);
      
      if (s1) s1.join(room.id);
      if (s2) s2.join(room.id);

      // Emit straight to room
      const state1 = this.buildRoomState(room, p1.socketId);
      const state2 = this.buildRoomState(room, p2.socketId);

      if (s1 && state1) s1.emit('room-state', state1);
      if (s2 && state2) s2.emit('room-state', state2);

      // Let both know they matched
      this.io.to(room.id).emit('match-found', { roomCode: room.id });
      
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
