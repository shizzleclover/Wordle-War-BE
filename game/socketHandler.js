const roomManager = require('./RoomManager');
const {
  isAllowedWord,
  isAllowedSecret,
  isValidRoomWordLength,
  MIN_WORD_LENGTH,
  MAX_WORD_LENGTH,
} = require('./wordValidator')
const User = require('../models/User');
const Match = require('../models/Match');
const matchmaker = require('./Matchmaker');

module.exports = function setupSocketHandler(io) {
  roomManager.setSocketCallbacks({
    onOpponentDisconnected: ({
      remainingSocketId,
      opponentUsername,
      graceMs,
      graceEndsAt
    }) => {
      io.to(remainingSocketId).emit('opponent-disconnected', {
        username: opponentUsername,
        graceMs,
        graceEndsAt
      });
    },

    onPlayingForfeit: async ({ room, winnerSocketId, loserSocketId }) => {
      await persistDisconnectResult(room, winnerSocketId, loserSocketId);

      const winnerP = room.getPlayer(winnerSocketId);
      const loserP = room.getPlayer(loserSocketId);
      const duration = room.startedAt
        ? Math.round((Date.now() - room.startedAt.getTime()) / 1000)
        : 0;

      io.to(winnerSocketId).emit('game-over', {
        result: 'win',
        winner: winnerP.username,
        opponentWord: loserP.secretWord?.toUpperCase(),
        yourWord: winnerP.secretWord?.toUpperCase(),
        yourGuesses: winnerP.guesses.length,
        opponentGuesses: loserP.guesses.length,
        duration,
        endReason: 'disconnect'
      });
    },

    onSetupAbandon: async ({ room, remainingSocketId, abandonedByUsername }) => {
      io.to(remainingSocketId).emit('setup-abandoned', {
        by: abandonedByUsername,
        wordLength: room.wordLength,
        roomCode: room.id
      });
    }
  });

  matchmaker.setIo(io);

  io.on('connection', (socket) => {
    console.log(`🔌 ${socket.user.username} connected (${socket.id})`);

    void handleReconnect(socket, io);

    socket.on('request-room-state', () => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          return socket.emit('error', { message: 'You are not in a room' });
        }
        const state = buildRoomState(room, socket.id);
        if (state) socket.emit('room-state', state);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── CREATE ROOM ────────────────────────────────────
    socket.on('create-room', ({ wordLength, gameMode, theme }) => {
      try {
        const wl = parseInt(wordLength, 10) || 5;
        if (!isValidRoomWordLength(wl)) {
          return socket.emit('error', {
            message: `Word length must be ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH}`,
          });
        }

        const existing = roomManager.getRoomBySocketId(socket.id);
        if (existing) {
          return socket.emit('error', { message: 'You are already in a room. Leave first.' });
        }
        
        const options = {
          gameMode: gameMode || 'standard',
          theme: theme || 'none'
        };

        const room = roomManager.createRoom(wl, socket.id, socket.user, options);
        socket.join(room.id);

        socket.emit('room-created', {
          code: room.id,
          wordLength: room.wordLength,
          theme: room.theme
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── JOIN ROOM ──────────────────────────────────────
    socket.on('join-room', ({ code }) => {
      try {
        if (!code || code.length !== 6) {
          return socket.emit('error', { message: 'Invalid room code' });
        }

        const existing = roomManager.getRoomBySocketId(socket.id);
        if (existing) {
          return socket.emit('error', { message: 'You are already in a room. Leave first.' });
        }

        const room = roomManager.joinRoom(code, socket.id, socket.user);
        socket.join(room.id);

        const players = [...room.players.values()].map(p => ({
          username: p.username,
          ready: p.ready,
          disconnected: p.disconnected
        }));

        io.to(room.id).emit('player-joined', {
          players,
          playerCount: room.getPlayerCount(),
          wordLength: room.wordLength,
          theme: room.theme,
          phase: room.phase
        });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── POWERUPS ───────────────────────────────────────
    socket.on('use-powerup', ({ type }) => {
      try {
        const roomCode = roomManager.getRoomCodeBySocketId(socket.id);
        if (!roomCode) return socket.emit('error', 'Not in a room');
        const room = roomManager.getRoom(roomCode);
        if (!room || room.phase !== 'playing') return socket.emit('error', 'Game not active');

        const result = room.usePowerup(socket.id, type);
        if (!result.success) return socket.emit('error', result.message);

        const player = room.getPlayer(socket.id);
        const opponent = room.getOpponent(socket.id);

        socket.emit('powerup-used', { 
          type, 
          payload: result.payload, 
          actionPoints: player.actionPoints 
        });

        if (opponent && !opponent.disconnected) {
          io.to(opponent.socketId).emit('opponent-used-powerup', {
            type,
            payload: result.payload
          });
        }
      } catch (err) {
        socket.emit('error', err.message);
      }
    });

    // ─── SET WORD ───────────────────────────────────────
    socket.on('set-word', async ({ word }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          return socket.emit('error', { message: 'You are not in a room' });
        }

        if (!word || typeof word !== 'string') {
          return socket.emit('error', { message: 'Invalid word' });
        }

        const cleanWord = word.trim().toLowerCase();

        const allowed = await isAllowedSecret(cleanWord, room.wordLength, room.theme);
        if (!allowed) {
          return socket.emit('error', {
            message: room.theme !== 'none' 
              ? `Word must be related to theme: ${room.theme} and use exactly ${room.wordLength} letters (A-Z only)` 
              : `Use exactly ${room.wordLength} letters (A-Z only)`,
          });
        }

        const allReady = room.setWord(socket.id, cleanWord);

        socket.emit('word-set', { success: true });

        const opponent = room.getOpponent(socket.id);
        if (opponent && !opponent.disconnected) {
          io.to(opponent.socketId).emit('opponent-ready');
        }

        if (allReady) {
          for (const [socketId, player] of room.players) {
            const isFirstTurn = room.currentTurn === socketId;
            const opp = room.getOpponent(socketId);

            io.to(socketId).emit('game-start', {
              yourTurn: isFirstTurn,
              opponentName: opp.username,
              wordLength: room.wordLength,
              gameMode: room.gameMode,
              theme: room.theme,
              turnStartedAt: room.turnStartedAt
            });
          }
          if (room.gameMode === 'blitz') {
            startBlitzTimer(room, io);
          }
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── MAKE GUESS ─────────────────────────────────────
    socket.on('make-guess', async ({ word }) => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          return socket.emit('error', { message: 'You are not in a room' });
        }

        if (!word || typeof word !== 'string') {
          return socket.emit('error', { message: 'Invalid word' });
        }

        const cleanWord = word.trim().toLowerCase();

        if (!isAllowedWord(cleanWord, room.wordLength)) {
          return socket.emit('error', {
            message: `Guess must be exactly ${room.wordLength} letters (A-Z only)`,
          });
        }

        const result = room.makeGuess(socket.id, cleanWord);

        if (room.gameMode === 'blitz') {
          stopBlitzTimer(room);
        }

        socket.emit('guess-result', {
          word: cleanWord,
          feedback: result.feedback,
          guessNumber: result.guessNumber,
          actionPoints: room.getPlayer(socket.id).actionPoints
        });

        if (result.gameOver) {
          const eloChange = await persistGameResult(room, result);

          for (const [socketId, player] of room.players) {
            const opp = room.getOpponent(socketId);
            const isWinner = socketId === room.winner;

            const payload = {
              result: isWinner ? 'win' : 'loss',
              winner: result.winner,
              opponentWord: opp?.secretWord?.toUpperCase(),
              yourWord: player.secretWord?.toUpperCase(),
              yourGuesses: player.guesses.length,
              opponentGuesses: opp?.guesses.length || 0,
              duration: result.duration,
              endReason: 'solved',
              eloChange: isWinner ? eloChange : -eloChange,
              newElo: isWinner ? (room.winnerElo + eloChange) : (room.loserElo - eloChange)
            };

            if (!player.disconnected) {
              io.to(socketId).emit('game-over', payload);
            }
          }
        } else {
          const opponent = room.getOpponent(socket.id);
          if (opponent && !opponent.disconnected) {
            const player = room.getPlayer(socket.id);
            io.to(opponent.socketId).emit('turn-update', {
              yourTurn: true,
              opponentGuessCount: player.guesses.length,
              turnStartedAt: room.turnStartedAt,
              actionPoints: opponent.actionPoints
            });
          }

          socket.emit('turn-update', {
            yourTurn: false,
            opponentGuessCount: room.getOpponent(socket.id)?.guesses.length || 0,
            turnStartedAt: room.turnStartedAt,
            actionPoints: room.getPlayer(socket.id).actionPoints
          });
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── REQUEST REMATCH ────────────────────────────────
    socket.on('request-rematch', () => {
      try {
        const room = roomManager.getRoomBySocketId(socket.id);
        if (!room) {
          return socket.emit('error', { message: 'You are not in a room' });
        }

        const player = room.getPlayer(socket.id);
        const opponent = room.getOpponent(socket.id);

        if (!opponent) {
          return socket.emit('error', { message: 'Opponent has left' });
        }

        player.wantsRematch = true;

        if (opponent.wantsRematch) {
          room.resetForRematch();
          for (const [, p] of room.players) {
            p.wantsRematch = false;
          }

          io.to(room.id).emit('rematch-start', {
            wordLength: room.wordLength,
            phase: 'setup'
          });
        } else if (!opponent.disconnected) {
          io.to(opponent.socketId).emit('rematch-requested', {
            by: player.username
          });
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // ─── LEAVE ROOM ─────────────────────────────────────
    socket.on('leave-room', () => {
      void handleExplicitLeave(socket, io);
    });

    // ─── MATCHMAKING ────────────────────────────────────
    socket.on('join-matchmaking', async ({ wordLength, gameMode, theme }) => {
      try {
        const existingRoom = roomManager.getRoomBySocketId(socket.id);
        if (existingRoom) {
          return socket.emit('error', { message: 'You are already in a room.' });
        }
        
        const dbUser = await User.findById(socket.user.userId);
        if (!dbUser) return socket.emit('error', { message: 'User not found' });

        const userElo = dbUser.stats.elo || 100;

        const options = {
          wordLength: parseInt(wordLength, 10) || 5,
          gameMode: gameMode || 'standard',
          theme: theme || 'none'
        };

        if (!isValidRoomWordLength(options.wordLength)) {
          return socket.emit('error', { message: `Word length must be ${MIN_WORD_LENGTH}-${MAX_WORD_LENGTH}` });
        }

        matchmaker.joinQueue(socket.id, socket.user, options, userElo);
        socket.emit('matchmaking-joined', { options, elo: userElo });
      } catch (err) {
        socket.emit('error', { message: err.message });
      }
    });

    socket.on('leave-matchmaking', () => {
      matchmaker.leaveQueue(socket.user.userId);
      socket.emit('matchmaking-left');
    });

    // ─── DISCONNECT ─────────────────────────────────────
    socket.on('disconnect', () => {
      console.log(`🔌 ${socket.user.username} disconnected (${socket.id})`);
      matchmaker.leaveQueue(socket.user.userId);
      void handleSocketDisconnect(socket, io);
    });
  });
};

// ─── HELPERS ──────────────────────────────────────────

function stopBlitzTimer(room) {
  if (room.blitzTimer) {
    clearTimeout(room.blitzTimer);
    room.blitzTimer = null;
  }
}

function startBlitzTimer(room, io) {
  stopBlitzTimer(room);
  // 30 second blitz timeout
  room.blitzTimer = setTimeout(async () => {
    room.blitzTimer = null;
    
    // Player who's turn it is timed out and loses.
    const loserSocketId = room.currentTurn;
    const loserPlayer = room.getPlayer(loserSocketId);
    const winnerPlayer = room.getOpponent(loserSocketId);

    if (!loserPlayer || !winnerPlayer) return;
    
    room.phase = 'finished';
    const duration = room.startedAt ? Math.round((Date.now() - room.startedAt.getTime()) / 1000) : 0;
    
    // Persist as loss
    const result = {
      winner: winnerPlayer.username,
      winnerId: winnerPlayer.userId,
      loserId: loserPlayer.userId,
      guessNumber: Array.isArray(winnerPlayer.guesses) ? winnerPlayer.guesses.length : 0,
      duration
    };

    room.winner = winnerPlayer.socketId;

    await persistGameResult(room, result);

    const payload = {
      result: 'blitz-timeout',
      winner: winnerPlayer.username,
      opponentWord: loserPlayer.secretWord?.toUpperCase(),
      yourWord: winnerPlayer.secretWord?.toUpperCase(),
      yourGuesses: winnerPlayer.guesses.length,
      opponentGuesses: loserPlayer.guesses.length,
      duration,
      endReason: 'blitz-timeout'
    };

    io.to(winnerPlayer.socketId).emit('game-over', { ...payload, result: 'win' });
    io.to(loserSocketId).emit('game-over', { ...payload, result: 'loss' });

  }, 30000);
}

function buildRoomState(room, socketId) {
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
    players,
    you: {
      ready: player.ready,
      hasSetWord: Boolean(player.secretWord),
      guesses: player.guesses,
      actionPoints: player.actionPoints,
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

async function handleReconnect(socket, io) {
  const resumed = roomManager.tryResumeSession(socket.user.userId, socket.id);
  if (!resumed) return;

  const { room, opponentSocketId } = resumed;
  socket.join(room.id);

  const state = buildRoomState(room, socket.id);
  if (state) socket.emit('room-state', state);

  if (opponentSocketId) {
    io.to(opponentSocketId).emit('opponent-reconnected', {
      username: socket.user.username
    });
  }
}

async function handleExplicitLeave(socket, io) {
  const roomBefore = roomManager.getRoomBySocketId(socket.id);
  const phaseBefore = roomBefore?.phase;

  const result = await roomManager.removePlayerImmediately(socket.id, 'leave');
  if (!result?.remainingPlayer || result.remainingPlayer.disconnected) return;

  if (phaseBefore === 'playing' || phaseBefore === 'setup') return;

  io.to(result.remainingPlayer.socketId).emit('player-left', {
    name: result.disconnectedPlayer?.username || 'Opponent'
  });
}

async function handleSocketDisconnect(socket, io) {
  const roomBefore = roomManager.getRoomBySocketId(socket.id);
  const phaseBefore = roomBefore?.phase;

  const outcome = await roomManager.handleTemporaryDisconnect(socket.id);
  if (!outcome || outcome.grace) return;
  if (!outcome.remainingPlayer || outcome.remainingPlayer.disconnected) return;

  if (phaseBefore === 'playing' || phaseBefore === 'setup') return;

  io.to(outcome.remainingPlayer.socketId).emit('player-left', {
    name: outcome.disconnectedPlayer?.username || 'Opponent'
  });
}

async function persistGameResult(room, result) {
  try {
    const matchDoc = room.toMatchDocument(result);
    
    const winner = await User.findById(result.winnerId);
    const loser = await User.findById(result.loserId);

    let eloChange = 0;
    room.winnerElo = winner?.stats.elo || 100;
    room.loserElo = loser?.stats.elo || 100;

    if (winner) {
      winner.stats.gamesPlayed++;
      winner.stats.wins++;
      winner.stats.totalGuesses += result.guessNumber;
      winner.stats.winStreak++;
      if (winner.stats.winStreak > winner.stats.bestStreak) {
        winner.stats.bestStreak = winner.stats.winStreak;
      }
      if (!winner.stats.fastestWin || result.guessNumber < winner.stats.fastestWin) {
        winner.stats.fastestWin = result.guessNumber;
      }
    }

    if (loser) {
      const loserPlayer = room.getPlayerByUserId(result.loserId);
      loser.stats.gamesPlayed++;
      loser.stats.losses++;
      loser.stats.totalGuesses += loserPlayer ? loserPlayer.guesses.length : 0;
      loser.stats.winStreak = 0;
      
      if (winner) {
        // Elo calculation
        const K = 32;
        const r1 = Math.pow(10, winner.stats.elo / 400);
        const r2 = Math.pow(10, loser.stats.elo / 400);
        const expectedWinner = r1 / (r1 + r2);
        
        eloChange = Math.round(K * (1 - expectedWinner));
        
        winner.stats.elo += eloChange;
        loser.stats.elo = Math.max(0, loser.stats.elo - eloChange);
      }
      await loser.save();
    }

    if (winner) {
      await winner.save();
    }

    // Update Match Doc
    matchDoc.players.forEach(p => {
      if (String(p.userId) === String(result.winnerId)) {
        p.eloChange = eloChange;
      } else if (String(p.userId) === String(result.loserId)) {
        p.eloChange = -eloChange;
      }
    });

    await Match.create(matchDoc);

    console.log(`💾 Match saved: ${result.winner} wins in room ${room.id} | Elo: +${eloChange}`);
    return eloChange;
  } catch (error) {
    console.error('Failed to persist game result:', error);
    return 0;
  }
}

async function persistDisconnectResult(room, winnerSocketId, loserSocketId) {
  try {
    const matchDoc = room.toDisconnectMatchDocument(winnerSocketId, loserSocketId);
    
    const winnerPlayer = room.getPlayer(winnerSocketId);
    const loserPlayer = room.getPlayer(loserSocketId);

    const winner = await User.findById(winnerPlayer.userId);
    if (winner) {
      winner.stats.gamesPlayed++;
      winner.stats.wins++;
      winner.stats.totalGuesses += winnerPlayer.guesses.length;
      winner.stats.winStreak++;
      if (winner.stats.winStreak > winner.stats.bestStreak) {
        winner.stats.bestStreak = winner.stats.winStreak;
      }
    }

    const loser = await User.findById(loserPlayer.userId);
    let eloChange = 0;

    if (loser) {
      loser.stats.gamesPlayed++;
      loser.stats.losses++;
      loser.stats.totalGuesses += loserPlayer.guesses.length;
      loser.stats.winStreak = 0;
      
      if (winner) {
        const K = 32;
        const r1 = Math.pow(10, winner.stats.elo / 400);
        const r2 = Math.pow(10, loser.stats.elo / 400);
        const expectedWinner = r1 / (r1 + r2);
        
        eloChange = Math.round(K * (1 - expectedWinner));
        
        winner.stats.elo += eloChange;
        loser.stats.elo = Math.max(0, loser.stats.elo - eloChange);
      }
      await loser.save();
    }

    if (winner) {
      await winner.save();
    }

    matchDoc.players.forEach(p => {
      if (String(p.userId) === String(winnerPlayer.userId)) {
        p.eloChange = eloChange;
      } else if (String(p.userId) === String(loserPlayer.userId)) {
        p.eloChange = -eloChange;
      }
    });

    await Match.create(matchDoc);

    console.log(`💾 Match saved (disconnect): ${winnerPlayer.username} wins in room ${room.id}`);
  } catch (error) {
    console.error('Failed to persist disconnect result:', error);
  }
}
