// Connect 4 Client-Side Controller & Audio Synthesizer

// --- Web Audio API Synthesizer (Zero asset dependencies) ---
class SoundEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playDrop() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  playTurnAlert() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  playWin() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime + idx * 0.12;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.4);
    });
  }

  playError() {
    if (!this.enabled) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  }
}

const sounds = new SoundEngine();

// --- Application State ---
const socket = io();
let myRoomId = null;
let myRole = null;       // 'player1' | 'player2' | 'spectator'
let myColor = 0;         // 1 = Red, 2 = Yellow, 0 = Spectator
let currentGameState = null;
let qrcodeInstance = null;
let serverLanHost = null;

// DOM Elements
const lobbyView = document.getElementById('lobbyView');
const gameView = document.getElementById('gameView');
const playerNameInput = document.getElementById('playerNameInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const joinCodeInput = document.getElementById('joinCodeInput');
const joinErrorMsg = document.getElementById('joinErrorMsg');

const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const copyLinkText = document.getElementById('copyLinkText');
const showQrBtn = document.getElementById('showQrBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');

const p1Card = document.getElementById('p1Card');
const p1Name = document.getElementById('p1Name');
const p1Status = document.getElementById('p1Status');
const p1Score = document.getElementById('p1Score');

const p2Card = document.getElementById('p2Card');
const p2Name = document.getElementById('p2Name');
const p2Status = document.getElementById('p2Status');
const p2Score = document.getElementById('p2Score');

const gameStatusBanner = document.getElementById('gameStatusBanner');
const statusText = document.getElementById('statusText');
const connect4Grid = document.getElementById('connect4Grid');
const dropZoneRow = document.getElementById('dropZoneRow');
const dropColBtns = document.querySelectorAll('.drop-col-btn');

const rematchBtn = document.getElementById('rematchBtn');
const rematchStatus = document.getElementById('rematchStatus');
const spectatorNotice = document.getElementById('spectatorNotice');

const qrModal = document.getElementById('qrModal');
const closeQrBtn = document.getElementById('closeQrBtn');
const qrCodeContainer = document.getElementById('qrCodeContainer');
const shareUrlInput = document.getElementById('shareUrlInput');
const copyModalUrlBtn = document.getElementById('copyModalUrlBtn');

const soundToggleBtn = document.getElementById('soundToggleBtn');
const soundOnIcon = document.getElementById('soundOnIcon');
const soundOffIcon = document.getElementById('soundOffIcon');
const toastEl = document.getElementById('toast');

// --- Initialization ---
async function init() {
  buildBoardGrid();
  attachEventListeners();
  checkUrlParamsForAutoJoin();
  setupSoundToggle();
  await fetchServerConfig();
}

async function fetchServerConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.localIp && data.localIp !== 'localhost') {
      serverLanHost = `http://${data.localIp}:${data.port || 3000}`;
    }
  } catch (err) {
    console.warn('Could not query server config', err);
  }
}

// Build 6x7 Grid Slots (42 slots total)
function buildBoardGrid() {
  connect4Grid.innerHTML = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.dataset.row = r;
      slot.dataset.col = c;
      slot.addEventListener('click', () => handleColumnSelect(c));
      connect4Grid.appendChild(slot);
    }
  }
}

// Event Listeners
function attachEventListeners() {
  createRoomBtn.addEventListener('click', handleCreateRoom);
  joinRoomBtn.addEventListener('click', handleJoinRoom);

  joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleJoinRoom();
  });

  joinCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toUpperCase();
    hideJoinError();
  });

  dropColBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const col = parseInt(btn.dataset.col, 10);
      handleColumnSelect(col);
    });
  });

  copyLinkBtn.addEventListener('click', copyInviteLink);
  showQrBtn.addEventListener('click', openQrModal);
  closeQrBtn.addEventListener('click', closeQrModal);
  copyModalUrlBtn.addEventListener('click', copyModalLink);
  rematchBtn.addEventListener('click', handleRematchRequest);
  leaveRoomBtn.addEventListener('click', handleLeaveRoom);

  qrModal.addEventListener('click', (e) => {
    if (e.target === qrModal) closeQrModal();
  });
}

function setupSoundToggle() {
  soundToggleBtn.addEventListener('click', () => {
    sounds.init();
    sounds.enabled = !sounds.enabled;
    soundOnIcon.classList.toggle('hidden', !sounds.enabled);
    soundOffIcon.classList.toggle('hidden', sounds.enabled);
    showToast(sounds.enabled ? 'Sound Enabled 🔊' : 'Sound Muted 🔇');
  });
}

// Check if URL has ?room=CODE
function checkUrlParamsForAutoJoin() {
  const params = new URLSearchParams(window.location.search);
  const roomParam = params.get('room');
  if (roomParam) {
    joinCodeInput.value = roomParam.toUpperCase();
    showToast(`Room code ${roomParam.toUpperCase()} loaded! Enter name to join.`);
  } else {
    // Check path like /room/ABCD
    const pathParts = window.location.pathname.split('/');
    if (pathParts[1] === 'room' && pathParts[2]) {
      joinCodeInput.value = pathParts[2].toUpperCase();
    }
  }
}

// Lobby actions
function handleCreateRoom() {
  sounds.init();
  const name = playerNameInput.value.trim() || 'Player 1';
  createRoomBtn.disabled = true;
  createRoomBtn.innerText = 'Creating Room...';
  socket.emit('createRoom', { playerName: name });
}

function handleJoinRoom() {
  sounds.init();
  const code = joinCodeInput.value.trim().toUpperCase();
  const name = playerNameInput.value.trim() || 'Player 2';

  if (!code || code.length < 2) {
    showJoinError('Please enter a valid room code.');
    return;
  }

  joinRoomBtn.disabled = true;
  joinRoomBtn.innerText = 'Joining...';
  socket.emit('joinRoom', { roomId: code, playerName: name });
}

function showJoinError(msg) {
  joinErrorMsg.innerText = msg;
  joinErrorMsg.classList.remove('hidden');
}

function hideJoinError() {
  joinErrorMsg.classList.add('hidden');
}

// Switch between views
function showLobby() {
  gameView.classList.remove('active');
  lobbyView.classList.add('active');
  createRoomBtn.disabled = false;
  createRoomBtn.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
    Create Game Room
  `;
  joinRoomBtn.disabled = false;
  joinRoomBtn.innerText = 'Join';
}

function showGameRoom() {
  lobbyView.classList.remove('active');
  gameView.classList.add('active');
}

// Column select (drop move)
function handleColumnSelect(col) {
  if (!currentGameState || currentGameState.status !== 'playing') {
    return;
  }
  if (myRole === 'spectator') {
    showToast('Spectators cannot make moves.');
    sounds.playError();
    return;
  }
  if (currentGameState.currentTurn !== myColor) {
    showToast("Wait for your opponent's turn!");
    sounds.playError();
    return;
  }

  socket.emit('makeMove', { col });
}

// Sync Board Rendering
function renderBoard(board, winningCells, lastMove) {
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 7; c++) {
      const slot = connect4Grid.querySelector(`[data-row="${r}"][data-col="${c}"]`);
      if (!slot) continue;

      const cellVal = board[r][c];
      const existingChip = slot.querySelector('.chip');

      if (cellVal === 0) {
        if (existingChip) slot.innerHTML = '';
      } else {
        const isRed = cellVal === 1;
        const colorClass = isRed ? 'chip-red' : 'chip-yellow';
        
        let chip = existingChip;
        if (!chip) {
          chip = document.createElement('div');
          chip.className = `chip ${colorClass}`;
          slot.appendChild(chip);
        }

        // Highlight winning cells
        const isWinning = winningCells && winningCells.some(wc => wc.row === r && wc.col === c);
        if (isWinning) {
          chip.classList.add('winning-chip');
        } else {
          chip.classList.remove('winning-chip');
        }
      }
    }
  }

  // Update ghost chips color to reflect my color
  const ghostChips = document.querySelectorAll('.ghost-chip');
  ghostChips.forEach(gc => {
    if (myColor === 1) {
      gc.style.backgroundColor = 'var(--p1-red)';
    } else if (myColor === 2) {
      gc.style.backgroundColor = 'var(--p2-yellow)';
    } else {
      gc.style.backgroundColor = 'transparent';
    }
  });
}

// Update UI state from server payload
function updateGameUI(state) {
  currentGameState = state;
  roomCodeDisplay.innerText = state.roomId;

  // Players info
  const p1 = state.players.red;
  const p2 = state.players.yellow;

  p1Name.innerText = p1 ? p1.name : 'Waiting...';
  p1Status.innerText = p1 ? (myRole === 'player1' ? 'You (Red)' : 'Red Player') : 'Empty';
  p1Score.innerText = state.scores.red;

  p2Name.innerText = p2 ? p2.name : 'Waiting for P2...';
  p2Status.innerText = p2 ? (myRole === 'player2' ? 'You (Yellow)' : 'Yellow Player') : 'Waiting';
  p2Score.innerText = state.scores.yellow;

  // Active turn glow
  p1Card.classList.toggle('active-turn', state.status === 'playing' && state.currentTurn === 1);
  p2Card.classList.toggle('active-turn', state.status === 'playing' && state.currentTurn === 2);

  // Status Banner & Rematch
  rematchBtn.classList.add('hidden');
  rematchStatus.innerText = '';
  spectatorNotice.classList.toggle('hidden', myRole !== 'spectator');

  if (state.status === 'waiting') {
    gameStatusBanner.className = 'status-banner info';
    statusText.innerText = 'Waiting for opponent to connect... Share your room code or QR!';
  } else if (state.status === 'playing') {
    const isMyTurn = (state.currentTurn === myColor);
    const turnColor = state.currentTurn === 1 ? 'Red' : 'Yellow';
    const activePlayerName = state.currentTurn === 1 ? (p1 ? p1.name : 'Red') : (p2 ? p2.name : 'Yellow');

    if (myRole === 'spectator') {
      gameStatusBanner.className = `status-banner turn-p${state.currentTurn}`;
      statusText.innerText = `Turn: ${activePlayerName} (${turnColor})`;
    } else if (isMyTurn) {
      gameStatusBanner.className = `status-banner turn-p${state.currentTurn}`;
      statusText.innerText = `⚡ Your Turn! Choose a column to drop.`;
    } else {
      gameStatusBanner.className = 'status-banner info';
      statusText.innerText = `⏳ Waiting for ${activePlayerName}...`;
    }
  } else if (state.status === 'won') {
    gameStatusBanner.className = 'status-banner win-banner';
    const winnerName = state.winner === 1 ? (p1 ? p1.name : 'Red') : (p2 ? p2.name : 'Yellow');
    
    if (myRole !== 'spectator' && state.winner === myColor) {
      statusText.innerText = `🎉 Victory! You won this match!`;
      fireConfetti();
    } else {
      statusText.innerText = `🏆 ${winnerName} won the match!`;
    }

    if (myRole !== 'spectator') {
      rematchBtn.classList.remove('hidden');
      updateRematchVotesUI(state.rematchVotes);
    }
  } else if (state.status === 'draw') {
    gameStatusBanner.className = 'status-banner info';
    statusText.innerText = `🤝 It's a Draw! Board is full.`;
    if (myRole !== 'spectator') {
      rematchBtn.classList.remove('hidden');
      updateRematchVotesUI(state.rematchVotes);
    }
  }

  // Render board
  renderBoard(state.board, state.winningCells, state.lastMove);
}

function updateRematchVotesUI(votes) {
  if (!votes || votes.length === 0) {
    rematchBtn.innerText = 'Play Again 🔄';
    rematchStatus.innerText = '';
  } else {
    const hasVoted = votes.includes(socket.id);
    if (hasVoted) {
      rematchBtn.innerText = 'Waiting for Opponent... ⏳';
      rematchStatus.innerText = 'Waiting for opponent to accept rematch.';
    } else {
      rematchBtn.innerText = 'Opponent wants Rematch! Accept 🔄';
      rematchStatus.innerText = 'Opponent requested a rematch!';
    }
  }
}

function handleRematchRequest() {
  socket.emit('requestRematch');
}

function handleLeaveRoom() {
  window.location.href = window.location.origin;
}

// Confetti Effect
function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
  }
}

// Copy Invite Link
function getInviteUrl() {
  let origin = window.location.origin;
  // If player opened the game on desktop as localhost or 127.0.0.1, substitute with the real Wi-Fi IP
  // so scanning the QR code with a phone actually reaches this computer!
  if ((origin.includes('localhost') || origin.includes('127.0.0.1')) && serverLanHost) {
    origin = serverLanHost;
  }
  return `${origin}/?room=${myRoomId}`;
}

function copyInviteLink() {
  const url = getInviteUrl();
  navigator.clipboard.writeText(url).then(() => {
    copyLinkText.innerText = 'Copied!';
    showToast('Invite link copied to clipboard! 📋');
    setTimeout(() => {
      copyLinkText.innerText = 'Invite Link';
    }, 2500);
  }).catch(() => {
    prompt('Copy this link to invite a player:', url);
  });
}

function copyModalLink() {
  shareUrlInput.select();
  document.execCommand('copy');
  showToast('Link copied! 📋');
}

// QR Code Modal
function openQrModal() {
  const url = getInviteUrl();
  shareUrlInput.value = url;
  qrCodeContainer.innerHTML = '';

  if (typeof QRCode !== 'undefined') {
    qrcodeInstance = new QRCode(qrCodeContainer, {
      text: url,
      width: 180,
      height: 180,
      colorDark: "#0B1120",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    // Fallback QR API
    const qrImg = document.createElement('img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
    qrImg.alt = 'QR Code';
    qrCodeContainer.appendChild(qrImg);
  }

  qrModal.classList.remove('hidden');
}

function closeQrModal() {
  qrModal.classList.add('hidden');
}

// Toast
function showToast(msg) {
  toastEl.innerText = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => {
    toastEl.classList.add('hidden');
  }, 3000);
}

// --- Socket.IO Event Handlers ---
socket.on('roomCreated', ({ roomId, role, color, state }) => {
  myRoomId = roomId;
  myRole = role;
  myColor = color;
  showGameRoom();
  updateGameUI(state);
  showToast(`Room #${roomId} created! Share with your friend.`);
});

socket.on('roomJoined', ({ roomId, role, color, state }) => {
  myRoomId = roomId;
  myRole = role;
  myColor = color;
  hideJoinError();
  showGameRoom();
  updateGameUI(state);
  if (role === 'spectator') {
    showToast(`Joined Room #${roomId} as a Spectator.`);
  } else {
    showToast(`Connected to Room #${roomId}! Game Ready!`);
  }
});

socket.on('joinError', ({ message }) => {
  joinRoomBtn.disabled = false;
  joinRoomBtn.innerText = 'Join';
  showJoinError(message);
  sounds.playError();
});

socket.on('gameStateUpdate', (state) => {
  updateGameUI(state);
});

socket.on('playerJoinedAnnouncement', ({ name, role }) => {
  showToast(`${name} joined as ${role}!`);
  sounds.playTurnAlert();
});

socket.on('moveMade', ({ row, col, color, state }) => {
  sounds.playDrop();
  updateGameUI(state);

  if (state.status === 'won') {
    sounds.playWin();
  } else if (state.status === 'playing' && state.currentTurn === myColor) {
    sounds.playTurnAlert();
  }
});

socket.on('moveRejected', ({ reason }) => {
  showToast(reason);
  sounds.playError();
});

socket.on('rematchVoteUpdate', ({ votes, state }) => {
  updateGameUI(state);
  showToast('Rematch requested!');
});

socket.on('gameReset', (state) => {
  updateGameUI(state);
  showToast('Game restarted! Have fun!');
  sounds.playTurnAlert();
});

socket.on('playerLeft', ({ name, role, state }) => {
  showToast(`${name || 'Opponent'} disconnected.`);
  updateGameUI(state);
  sounds.playError();
});

// Run
window.addEventListener('DOMContentLoaded', init);
