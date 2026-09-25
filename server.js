const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Game } = require('./game');
const bot = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

function makeId(n = 5) {
  return Math.random().toString(36).slice(2, 2 + n).toUpperCase();
}

function broadcast(room) {
  for (const p of room.players) {
    if (!p.isBot) io.to(p.id).emit('state', room.stateFor(p.id));
  }
}

function tick(room) {
  // 🎲 Yönetici koz seçimi (oyun dışı, rastgele)
  if (room.phase === 'trump') {
    setTimeout(() => {
      room.adminChooseTrump();
      // Yönetici seçimini herkese duyur (opsiyonel mesaj)
      io.to(room.roomId).emit('adminMessage', {
        text: `Yönetici kozu seçti: ${room.trump}`,
        trump: room.trump
      });
      broadcast(room);
      tick(room);
    }, 1200); // 1.2 sn bekleyip seçsin, "düşünüyor" hissi
    return;
  }

  if (room.phase === 'bidding') {
    const cur = room.players[room.currentBidderIndex];
    if (cur.isBot) {
      setTimeout(() => {
        const bid = bot.chooseBid(cur.hand, room.trump, room.highestBid);
        room.placeBid(room.currentBidderIndex, bid);
        broadcast(room);
        tick(room);
      }, 700);
    }
    return;
  }

  if (room.phase === 'playing') {
    const cur = room.players[room.turnIndex];
    if (cur.isBot) {
      setTimeout(() => {
        const card = bot.chooseCard(cur.hand, room.currentTrick, room.trump, room.turnIndex, room.players);
        room.playCard(room.turnIndex, card.id);
        broadcast(room);
        tick(room);
      }, 700);
    }
    return;
  }

  if (room.phase === 'scoring') {
    setTimeout(() => {
      room.nextRound();
      broadcast(room);
      tick(room);
    }, 2500);
  }
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name }) => {
    const roomId = makeId();
    const g = new Game(roomId);
    g.addPlayer(socket.id, name || 'Ev Sahibi');
    rooms[roomId] = g;
    socket.join(roomId);
    socket.emit('joined', { roomId, you: socket.id });
    broadcast(g);
  });

  socket.on('joinRoom', ({ roomId, name }) => {
    const g = rooms[roomId];
    if (!g) return socket.emit('error', 'Oda bulunamadı');
    if (g.players.length >= 4) return socket.emit('error', 'Oda dolu');
    g.addPlayer(socket.id, name || 'Oyuncu');
    socket.join(roomId);
    socket.emit('joined', { roomId, you: socket.id });
    broadcast(g);
  });

  socket.on('addBot', ({ roomId }) => {
    const g = rooms[roomId];
    if (!g) return;
    if (g.players.length >= 4) return;
    const botId = 'bot_' + makeId(4);
    g.addPlayer(botId, 'Bot ' + g.players.length, true);
    broadcast(g);
  });

  socket.on('startGame', ({ roomId }) => {
    const g = rooms[roomId];
    if (!g) return;
    if (g.players.length !== 4) return socket.emit('error', '4 oyuncu gerekli');
    g.start();
    broadcast(g);
    tick(g);
  });

  // ❌ chooseTrump olayı kaldırıldı — kozu artık yönetici seçiyor.

  socket.on('placeBid', ({ roomId, bid }) => {
    const g = rooms[roomId];
    if (!g) return;
    const idx = g.players.findIndex(p => p.id === socket.id);
    if (g.placeBid(idx, bid)) { broadcast(g); tick(g); }
  });

  socket.on('playCard', ({ roomId, cardId }) => {
    const g = rooms[roomId];
    if (!g) return;
    const idx = g.players.findIndex(p => p.id === socket.id);
    if (g.playCard(idx, cardId)) { broadcast(g); tick(g); }
  });

  socket.on('disconnect', () => {
    for (const id in rooms) {
      const g = rooms[id];
      const i = g.players.findIndex(p => p.id === socket.id);
      if (i >= 0) {
        g.players.splice(i, 1);
        broadcast(g);
      }
    }
  });
});

server.listen(3000, () => console.log('http://localhost:3000'));
