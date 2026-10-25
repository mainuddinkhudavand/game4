const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;
const ROWS = 6;
const COLS = 7;

// Helper: Get local network IPv4 address for cross-device mobile play
function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('169.254')) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Network config endpoint so clients on localhost generate mobile-friendly QR codes
app.get('/api/config', (req, res) => {
  res.json({
    localIp: getLocalIp(),
    port: PORT
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: Object.keys(rooms).length });
});

// Direct link join support
app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Rooms dictionary
// Key: roomId, Value: Room state
const rooms = {};

// Helper: Generate clean, readable 4-letter room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing O/0, I/1
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms[code] ? generateRoomCode() : code;
}

// Helper: Create empty 6x7 board
function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

// Helper: Check 4-in-a-row win
function checkWin(board, row, col, player) {
  const directions = [
    { dr: 0, dc: 1 },  // Horizontal
    { dr: 1, dc: 0 },  // Vertical
    { dr: 1, dc: 1 },  // Diagonal down-right
    { dr: 1, dc: -1 }  // Diagonal down-left
  ];

  for (const { dr, dc } of directions) {
    const winningCells = [{ row, col }];

    // Forward direction
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      winningCells.push({ row: r, col: c });
      r += dr;
      c += dc;
    }

    // Backward direction
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === player) {
      winningCells.push({ row: r, col: c });
      r -= dr;
      c -= dc;
    }

    if (winningCells.length >= 4) {
      return winningCells;
    }
  }

  return null;
}

// Helper: Check if board is full (draw)
function isBoardFull(board) {
  return board[0].every(cell => cell !== 0);
}

// Helper: Format room payload for clients
function getRoomPublicState(room) {
  return {
    roomId: room.id,
    board: room.board,
    currentTurn: room.currentTurn,
    status: room.status, // 'waiting', 'playing', 'won', 'draw'
    winner: room.winner,
    winningCells: room.winningCells,
    lastMove: room.lastMove,
    scores: room.scores,
    players: {
      red: room.player1 ? { id: room.player1.id, name: room.player1.name } : null,
      yellow: room.player2 ? { id: room.player2.id, name: room.player2.name } : null,
      spectatorsCount: room.spectators.length
    },
    startingPlayer: room.startingPlayer,
    rematchVotes: Array.from(room.rematchVotes)
  };
}

io.on('connection', (socket) => {
  let currentRoomId = null;

  // 1. Create a new room
  socket.on('createRoom', ({ playerName }) => {
    const roomId = generateRoomCode();
    currentRoomId = roomId;

    rooms[roomId] = {
      id: roomId,
      board: createEmptyBoard(),
      currentTurn: 1, // 1 = Red, 2 = Yellow
      startingPlayer: 1,
      status: 'waiting',
      winner: null,
      winningCells: null,
      lastMove: null,
      scores: { red: 0, yellow: 0 },
      player1: { id: socket.id, name: playerName || 'Player 1', color: 1 },
      player2: null,
      spectators: [],
      rematchVotes: new Set()
    };

    socket.join(roomId);
    socket.emit('roomCreated', {
      roomId,
      role: 'player1',
      color: 1,
      state: getRoomPublicState(rooms[roomId])
    });
  });

  // 2. Join an existing room
  socket.on('joinRoom', ({ roomId, playerName }) => {
    const normalizedCode = (roomId || '').trim().toUpperCase();
    const room = rooms[normalizedCode];

    if (!room) {
      return socket.emit('joinError', { message: 'Room not found. Please check the code.' });
    }

    currentRoomId = normalizedCode;
    socket.join(normalizedCode);

    let role = 'spectator';
    let color = 0;

    if (!room.player1) {
      room.player1 = { id: socket.id, name: playerName || 'Player 1', color: 1 };
      role = 'player1';
      color = 1;
    } else if (!room.player2) {
      room.player2 = { id: socket.id, name: playerName || 'Player 2', color: 2 };
      role = 'player2';
      color = 2;
      room.status = 'playing'; // Game begins when both players are seated!
    } else {
      room.spectators.push({ id: socket.id, name: playerName || `Spectator ${room.spectators.length + 1}` });
      role = 'spectator';
      color = 0;
    }

    socket.emit('roomJoined', {
      roomId: normalizedCode,
      role,
      color,
      state: getRoomPublicState(room)
    });

    // Notify other players in the room
    io.to(normalizedCode).emit('gameStateUpdate', getRoomPublicState(room));
    io.to(normalizedCode).emit('playerJoinedAnnouncement', {
      name: playerName || (role === 'player2' ? 'Player 2' : 'Spectator'),
      role
    });
  });

  // 3. Player makes a move
  socket.on('makeMove', ({ col }) => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (room.status !== 'playing') {
      return socket.emit('moveRejected', { reason: 'Game is not in active play.' });
    }

    // Identify who is moving
    const isPlayer1 = room.player1 && room.player1.id === socket.id;
    const isPlayer2 = room.player2 && room.player2.id === socket.id;

    if (!isPlayer1 && !isPlayer2) {
      return socket.emit('moveRejected', { reason: 'Spectators cannot drop chips.' });
    }

    const playerColor = isPlayer1 ? 1 : 2;
    if (room.currentTurn !== playerColor) {
      return socket.emit('moveRejected', { reason: 'Not your turn!' });
    }

    // Validate column bounds
    if (col < 0 || col >= COLS) {
      return socket.emit('moveRejected', { reason: 'Invalid column.' });
    }

    // Find the lowest empty row in this column (gravity drop)
    let targetRow = -1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (room.board[r][col] === 0) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) {
      return socket.emit('moveRejected', { reason: 'Column is already full.' });
    }

    // Apply move
    room.board[targetRow][col] = playerColor;
    room.lastMove = { row: targetRow, col, color: playerColor };

    // Check for win
    const winResult = checkWin(room.board, targetRow, col, playerColor);
    if (winResult) {
      room.status = 'won';
      room.winner = playerColor;
      room.winningCells = winResult;
      if (playerColor === 1) room.scores.red++;
      else room.scores.yellow++;
    } else if (isBoardFull(room.board)) {
      room.status = 'draw';
      room.winner = null;
    } else {
      // Toggle turn
      room.currentTurn = room.currentTurn === 1 ? 2 : 1;
    }

    // Broadcast move to all clients in the room
    io.to(currentRoomId).emit('moveMade', {
      row: targetRow,
      col,
      color: playerColor,
      state: getRoomPublicState(room)
    });
  });

  // 4. Request rematch
  socket.on('requestRematch', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    if (room.status !== 'won' && room.status !== 'draw') return;

    room.rematchVotes.add(socket.id);

    // If both players voted for rematch
    const p1Voted = room.player1 && room.rematchVotes.has(room.player1.id);
    const p2Voted = room.player2 && room.rematchVotes.has(room.player2.id);

    if (p1Voted && p2Voted) {
      // Reset board
      room.board = createEmptyBoard();
      // Alternate starting player each match
      room.startingPlayer = room.startingPlayer === 1 ? 2 : 1;
      room.currentTurn = room.startingPlayer;
      room.status = 'playing';
      room.winner = null;
      room.winningCells = null;
      room.lastMove = null;
      room.rematchVotes.clear();

      io.to(currentRoomId).emit('gameReset', getRoomPublicState(room));
    } else {
      io.to(currentRoomId).emit('rematchVoteUpdate', {
        votes: Array.from(room.rematchVotes),
        state: getRoomPublicState(room)
      });
    }
  });

  // 5. Handle disconnection
  socket.on('disconnect', () => {
    if (!currentRoomId || !rooms[currentRoomId]) return;
    const room = rooms[currentRoomId];

    let disconnectedRole = null;
    let disconnectedName = null;

    if (room.player1 && room.player1.id === socket.id) {
      disconnectedRole = 'player1';
      disconnectedName = room.player1.name;
      room.player1 = null;
    } else if (room.player2 && room.player2.id === socket.id) {
      disconnectedRole = 'player2';
      disconnectedName = room.player2.name;
      room.player2 = null;
    } else {
      room.spectators = room.spectators.filter(s => s.id !== socket.id);
    }

    room.rematchVotes.delete(socket.id);

    // If game was playing and a primary player left
    if (disconnectedRole) {
      if (room.status === 'playing') {
        room.status = 'waiting';
      }
      io.to(currentRoomId).emit('playerLeft', {
        role: disconnectedRole,
        name: disconnectedName,
        state: getRoomPublicState(room)
      });
    }

    // Clean up empty room after 5 minutes if completely abandoned
    if (!room.player1 && !room.player2 && room.spectators.length === 0) {
      setTimeout(() => {
        if (!room.player1 && !room.player2 && room.spectators.length === 0) {
          delete rooms[currentRoomId];
        }
      }, 300000);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log(`===============================================`);
  console.log(`🎮 Connect 4 Multiplayer Server is live!`);
  console.log(`🌐 Local address (PC): http://localhost:${PORT}`);
  console.log(`📱 Connect phone on Wi-Fi: http://${localIp}:${PORT}`);
  console.log(`===============================================`);
});
