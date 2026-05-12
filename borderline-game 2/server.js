const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));

const LOCATIONS = [
  { id: 1, name: 'Tokyo, Japan', country: 'Japan', lat: 35.6762, lng: 139.6503, clue: 'Dense city, Japanese signs, vending machines everywhere.', img: 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=80' },
  { id: 2, name: 'Paris, France', country: 'France', lat: 48.8566, lng: 2.3522, clue: 'Elegant streets, French cafés, historic architecture.', img: 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80' },
  { id: 3, name: 'Jaipur, India', country: 'India', lat: 26.9124, lng: 75.7873, clue: 'Warm colors, busy streets, North Indian architecture.', img: 'https://images.unsplash.com/photo-1603262110263-fb0112e7cc33?auto=format&fit=crop&w=1200&q=80' },
  { id: 4, name: 'New York City, USA', country: 'USA', lat: 40.7128, lng: -74.0060, clue: 'Tall skyline, yellow taxis, grid-like streets.', img: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=80' },
  { id: 5, name: 'Cairo, Egypt', country: 'Egypt', lat: 30.0444, lng: 31.2357, clue: 'Desert climate, Arabic signs, ancient history nearby.', img: 'https://images.unsplash.com/photo-1572252009286-268acec5ca0a?auto=format&fit=crop&w=1200&q=80' },
  { id: 6, name: 'Rio de Janeiro, Brazil', country: 'Brazil', lat: -22.9068, lng: -43.1729, clue: 'Coastal city, mountains, Portuguese language.', img: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?auto=format&fit=crop&w=1200&q=80' }
];

const rooms = new Map();
function roomCode() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }
function publicRoom(room) {
  return { code: room.code, phase: room.phase, players: Object.values(room.players).map(p => ({ id:p.id, name:p.name, score:p.score, ready:p.ready, vote:p.vote })), round: room.round, timeLeft: room.timeLeft, actual: room.phase === 'results' ? room.location : null, guesses: room.phase === 'results' ? room.guesses : {}, impostorId: room.phase === 'results' ? room.impostorId : null };
}
function emitRoom(room) { io.to(room.code).emit('room', publicRoom(room)); }
function startTimer(room, seconds, endPhase) {
  clearInterval(room.timer);
  room.timeLeft = seconds;
  emitRoom(room);
  room.timer = setInterval(() => {
    room.timeLeft--;
    emitRoom(room);
    if (room.timeLeft <= 0) {
      clearInterval(room.timer);
      endPhase(room);
    }
  }, 1000);
}
function startRound(room) {
  const players = Object.values(room.players);
  if (players.length < 2) return;
  room.phase = 'guess';
  room.round++;
  room.location = LOCATIONS[Math.floor(Math.random() * LOCATIONS.length)];
  room.impostorId = players[Math.floor(Math.random() * players.length)].id;
  room.guesses = {};
  room.votes = {};
  players.forEach(p => { p.ready = false; p.vote = null; });
  for (const p of players) {
    io.to(p.id).emit('roundData', { location: p.id === room.impostorId ? { img: room.location.img, clue: 'You are the IMPOSTOR. Pretend you know the place.' } : room.location, isImpostor: p.id === room.impostorId });
  }
  startTimer(room, 60, startVote);
}
function startVote(room) { room.phase = 'vote'; startTimer(room, 35, showResults); }
function distanceKm(a,b,c,d){ const R=6371, toRad=x=>x*Math.PI/180; const dLat=toRad(c-a), dLng=toRad(d-b); const h=Math.sin(dLat/2)**2 + Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
function showResults(room) {
  room.phase = 'results';
  const voteCounts = {};
  Object.values(room.votes).forEach(v => voteCounts[v] = (voteCounts[v]||0)+1);
  const votedOut = Object.entries(voteCounts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  for (const p of Object.values(room.players)) {
    let pts = 0;
    const g = room.guesses[p.id];
    if (g && p.id !== room.impostorId) {
      const d = distanceKm(g.lat,g.lng,room.location.lat,room.location.lng);
      pts += Math.max(0, Math.round(3000 - d));
    }
    if (p.vote === room.impostorId) pts += 1000;
    if (p.id === room.impostorId && votedOut !== room.impostorId) pts += 2000;
    p.score += pts;
  }
  emitRoom(room);
}

io.on('connection', socket => {
  socket.on('createRoom', name => {
    const code = roomCode();
    rooms.set(code, { code, players: {}, phase:'lobby', round:0, score:0, guesses:{}, votes:{}, timeLeft:0 });
    joinRoom(socket, code, name);
  });
  socket.on('joinRoom', ({code, name}) => joinRoom(socket, code, name));
  socket.on('ready', () => { const room = rooms.get(socket.roomCode); if(!room) return; room.players[socket.id].ready = true; emitRoom(room); if(Object.values(room.players).length >= 2 && Object.values(room.players).every(p=>p.ready)) startRound(room); });
  socket.on('guess', guess => { const room = rooms.get(socket.roomCode); if(!room) return; room.guesses[socket.id] = guess; emitRoom(room); });
  socket.on('vote', id => { const room = rooms.get(socket.roomCode); if(!room) return; room.votes[socket.id] = id; room.players[socket.id].vote = id; emitRoom(room); });
  socket.on('nextRound', () => { const room = rooms.get(socket.roomCode); if(room && room.phase === 'results') startRound(room); });
  socket.on('disconnect', () => { const room = rooms.get(socket.roomCode); if(!room) return; delete room.players[socket.id]; if(Object.keys(room.players).length === 0) rooms.delete(room.code); else emitRoom(room); });
});
function joinRoom(socket, code, name) {
  code = String(code || '').toUpperCase();
  const room = rooms.get(code); if(!room) return socket.emit('errorMsg','Room not found');
  socket.join(code); socket.roomCode = code;
  room.players[socket.id] = { id: socket.id, name: name || 'Player', score: 0, ready: false, vote: null };
  socket.emit('joined', { id: socket.id, code }); emitRoom(room);
}
server.listen(PORT, () => console.log('Borderline running on :' + PORT));
