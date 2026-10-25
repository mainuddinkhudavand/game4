# 🔴🟡 Connect 4 Live — Realtime Multiplayer Web Game

A modern, responsive, cross-device multiplayer Connect 4 game built with **Node.js, Express, and Socket.IO**. Players can invite opponents from anywhere in the world via shareable room codes, direct invite links, or scanned QR codes.

---

## 🌟 Key Features

1. **Cross-Device Real-Time Gameplay**:
   - Play between desktop, iPhone, Android, tablet, or separate browser tabs.
   - Authoritative server-side game state powered by WebSockets (Socket.IO).
2. **Instant Room Joining**:
   - 4-letter unique room codes (e.g. `PLAY`, `F9XK`).
   - One-click copyable invite links (`?room=CODE`).
   - Integrated **QR Code generator** for instant mobile camera pairing.
3. **Universally Intuitive Rules**:
   - Classic 7x6 Connect 4 gravity drops.
   - Visual turn indicators, glowing drop columns, and 4-in-a-row winning highlights.
   - Built-in Web Audio API sound effects (chip drop, win fanfare, error buzzer) requiring zero external media files.
   - Confetti celebration upon victory!
4. **Resilience & Match Flow**:
   - Spectator mode if additional players join.
   - Seamless rematch / play again system with score tracking.
   - Graceful disconnect and reconnect handling.

---

## 🚀 Quick Start (Running Locally)

### 1. Install & Start
```bash
cd multiplayer-connect4
npm install
npm start
```

Open your browser to:
```
http://localhost:3000
```

### 2. Testing Cross-Device Locally
To test with another phone or laptop on the **same Wi-Fi network**:
1. Check your computer's local IP address (`ipconfig` on Windows or `ifconfig` on Mac/Linux, e.g. `192.168.1.15`).
2. Open `http://<your-ip>:3000` on your mobile phone browser.
3. Create a room on your computer, scan the QR code with your phone, and play!

---

## 🌐 Making It Live at a Public URL

To satisfy the requirement: *"It's live at a URL or host other people can actually reach"*, choose either method below:

### Method 1: Instant Live Public URL (Zero Deploy Needed)
Run this command in a separate terminal while your game server is running:

```bash
npx localtunnel --port 3000
```
This gives you an immediate public HTTPS URL (e.g. `https://quiet-river-42.loca.lt`) that anyone across the world can open on their mobile phone or laptop.

### Method 2: Free 24/7 Cloud Hosting (Render.com)
1. Push this folder to a GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Multiplayer Connect 4"
   git branch -M main
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```
2. Go to [Render.com](https://render.com) and click **New + > Web Service**.
3. Select your GitHub repository.
4. Set:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. Click **Create Web Service**. Within 2 minutes, you will get a permanent public URL (e.g. `https://connect4-live.onrender.com`).

---

## 📂 Project Structure

```
multiplayer-connect4/
├── package.json          # Dependencies (Express, Socket.IO)
├── server.js            # Authoritative game logic & WebSocket rooms
├── README.md            # Documentation & deployment instructions
└── public/
    ├── index.html       # Responsive lobby & game UI
    ├── style.css        # Tactile board styles, drop animations, glow effects
    └── game.js          # Client socket controller & audio synthesizer
```
