const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Production: leave at 86400000 (one real day). For a quick demo, set DAY_INTERVAL_MS=60000.
const DAY_INTERVAL_MS = Number(process.env.DAY_INTERVAL_MS || 60000);
const STARTING_CASH = 1000;
const DATA_FILE = path.join(__dirname, "data.json");

function freshData() {
  return {
    market: { day: 1, price: 1, nextDirection: Math.random() < 0.5 ? "up" : "down", history: [{ day: 1, price: 10, change: 0, direction: "start", at: Date.now() }], nextMoveAt: Date.now() + DAY_INTERVAL_MS },
    users: {}
  };
}
function loadData() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); }
  catch { return freshData(); }
}
let data = loadData();
// Migrate existing local demo data to the fixed-dollar market rules.
// If an older build stored a 24-hour timer, clamp it to the current interval.
if (!data.market.nextMoveAt || data.market.nextMoveAt - Date.now() > DAY_INTERVAL_MS) {
  data.market.nextMoveAt = Date.now() + DAY_INTERVAL_MS;
}
if (!data.market.nextDirection) data.market.nextDirection = Math.random() < 0.5 ? "up" : "down";
for (const u of Object.values(data.users || {})) {
  if (!("forecast" in u)) u.forecast = null;
  if (!("lastForecastResult" in u)) u.lastForecastResult = null;
}
function save() {
  const tmp = DATA_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}
function cleanName(s) {
  return String(s || "").trim().replace(/[<>]/g, "").slice(0, 18);
}
function publicUser(u) {
  return {
    username: u.username, cash: u.cash, coins: u.coins, joinedAt: u.joinedAt,
    forecast: u.forecast || null, lastForecastResult: u.lastForecastResult || null
  };
}
function leaderboard() {
  return Object.values(data.users)
    .map(u => ({ username: u.username, netWorth: +(u.cash + u.coins * data.market.price).toFixed(2) }))
    .sort((a,b) => b.netWorth - a.netWorth).slice(0, 10);
}
function marketSnapshot() {
  return { ...data.market, online: io.engine.clientsCount, leaderboard: leaderboard() };
}
function broadcastState() {
  io.emit("market:update", marketSnapshot());
  for (const s of io.sockets.sockets.values()) {
    if (s.userKey && data.users[s.userKey]) s.emit("wallet:update", publicUser(data.users[s.userKey]));
  }
}
function advanceMarket() {
  const up = Math.random() < 0.5; // exact 50/50 direction chance
  const change = 1 + Math.random() * 19; // 1% to 20%
  data.market.price = Math.max(0.000001, data.market.price * (up ? 1 + change/100 : 1 - change/100));
  data.market.day += 1;
  data.market.history.push({
    day: data.market.day, price: data.market.price,
    change: +change.toFixed(2), direction: up ? "up" : "down", at: Date.now()
  });
  if (data.market.history.length > 365) data.market.history = data.market.history.slice(-365);
  data.market.nextMoveAt = Date.now() + DAY_INTERVAL_MS;
  save();
  broadcastState();
  console.log(`Market day ${data.market.day}: ${up ? "UP" : "DOWN"} ${change.toFixed(2)}%, price ${data.market.price}`);
}
function catchUpMarket() {
  while (Date.now() >= data.market.nextMoveAt) advanceMarket();
}
catchUpMarket();
setInterval(() => { if (Date.now() >= data.market.nextMoveAt) advanceMarket(); }, 1000);

app.use(express.static(path.join(__dirname, "public")));
app.get("/health", (_, res) => res.json({ ok: true, market: marketSnapshot() }));

io.on("connection", socket => {
  catchUpMarket();
  socket.emit("market:update", marketSnapshot());

  socket.on("auth:register", async ({ username, password } = {}, cb = () => {}) => {
    username = cleanName(username);
    if (username.length < 3 || username.length > 18) return cb({ ok:false, error:"Kullanıcı adı 3–18 karakter olmalı." });
    if (!/^[a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ-]+$/.test(username)) return cb({ ok:false, error:"Kullanıcı adında geçersiz karakter var." });
    if (typeof password !== "string" || password.length < 6 || password.length > 72) return cb({ ok:false, error:"Şifre en az 6 karakter olmalı." });
    const key = username.toLowerCase();
    if (data.users[key]) return cb({ ok:false, error:"Bu kullanıcı adı zaten alınmış." });
    const passwordHash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString("hex");
    data.users[key] = { username, passwordHash, token, cash: STARTING_CASH, coins: 0, joinedAt: Date.now() };
    save();
    socket.userKey = key;
    cb({ ok:true, token, user:publicUser(data.users[key]) });
    socket.emit("wallet:update", publicUser(data.users[key]));
    io.emit("market:update", marketSnapshot());
  });

  socket.on("auth:login", async ({ username, password } = {}, cb = () => {}) => {
    const key = cleanName(username).toLowerCase();
    const user = data.users[key];
    if (!user || typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
      return cb({ ok:false, error:"Kullanıcı adı veya şifre hatalı." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    user.token = token;
    socket.userKey = key;
    save();
    cb({ ok:true, token, user:publicUser(user) });
    socket.emit("wallet:update", publicUser(user));
    io.emit("market:update", marketSnapshot());
  });

  socket.on("auth:resume", ({ token } = {}, cb = () => {}) => {
    const entry = Object.entries(data.users).find(([,u]) => u.token === token);
    if (!entry) return cb({ ok:false, error:"Oturum bulunamadı. Tekrar giriş yap." });
    socket.userKey = entry[0];
    cb({ ok:true, user:publicUser(entry[1]) });
    socket.emit("wallet:update", publicUser(entry[1]));
  });

  socket.on("fortune:predict", (_payload = {}, cb = () => {}) => {
    const u = socket.userKey && data.users[socket.userKey];
    if (!u) return cb({ ok:false, error:"Önce giriş yap." });
    if (u.forecast && u.forecast.forDay === data.market.day + 1) {
      return cb({ ok:false, error:"Gelecek oyun günü için zaten tahmin aldın." });
    }
    const fee = 500;
    if (u.cash < fee) return cb({ ok:false, error:"Falcı için 500 $ nakit gerekiyor." });
    const actual = data.market.nextDirection || (Math.random() < 0.5 ? "up" : "down");
    const predicted = Math.random() < 0.8 ? actual : (actual === "up" ? "down" : "up");
    u.cash -= fee;
    u.forecast = { forDay: data.market.day + 1, direction: predicted, fee, boughtAt: Date.now() };
    u.lastForecastResult = null;
    data.market.nextDirection = actual;
    save();
    broadcastState();
    cb({ ok:true, forecast: u.forecast, message:"Falcı tahminini verdi. Bakalım tutacak mı!" });
  });

  socket.on("trade:buy", ({ usd } = {}, cb = () => {}) => {
    const u = socket.userKey && data.users[socket.userKey];
    usd = Number(usd);
    if (!u) return cb({ ok:false, error:"Önce giriş yap." });
    if (!Number.isFinite(usd) || usd <= 0 || usd > u.cash || usd > 1e9) return cb({ ok:false, error:"Geçersiz tutar veya yetersiz bakiye." });
    const qty = usd / data.market.price;
    u.cash -= usd; u.coins += qty; save(); broadcastState();
    cb({ ok:true, message:`${qty.toFixed(4)} SHIT COIN satın aldın.` });
  });

  socket.on("trade:sell", ({ usd } = {}, cb = () => {}) => {
    const u = socket.userKey && data.users[socket.userKey];
    usd = Number(usd);
    if (!u) return cb({ ok:false, error:"Önce giriş yap." });
    const value = u.coins * data.market.price;
    if (!Number.isFinite(usd) || usd <= 0 || value <= 0) return cb({ ok:false, error:"Satılacak coin yok veya tutar geçersiz." });
    const sellValue = Math.min(usd, value);
    const qty = sellValue / data.market.price;
    u.coins -= qty; u.cash += sellValue;
    if (u.coins < 1e-10) u.coins = 0;
    save(); broadcastState();
    cb({ ok:true, message:`${qty.toFixed(4)} SHIT COIN sattın.` });
  });
});

server.listen(PORT, () => console.log(`SHIT COIN online running on http://localhost:${PORT}`));
