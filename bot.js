const { SUITS, RV } = require('./game');

function evaluateSuit(hand, suit) {
  let s = 0;
  for (const c of hand) {
    if (c.suit === suit) s += RV[c.rank] * 1.2;
    if (c.rank === 'A') s += 3;
    if (c.rank === 'K') s += 2;
    if (c.rank === 'Q') s += 1;
  }
  return s;
}

function chooseTrump(hand) {
  let best = { suit: 'S', score: -Infinity };
  for (const s of SUITS) {
    const sc = evaluateSuit(hand, s);
    if (sc > best.score) best = { suit: s, score: sc };
  }
  return best.suit;
}

function chooseBid(hand, trump, currentHigh) {
  let pts = 0;
  for (const c of hand) {
    if (c.rank === 'A') pts += 2;
    else if (c.rank === 'K') pts += 1.5;
    else if (c.rank === 'Q') pts += 1;
    if (c.suit === trump && RV[c.rank] >= 10) pts += 1;
  }
  pts += hand.filter(c => c.suit === trump).length * 0.4;

  let bid = Math.max(2, Math.min(13, Math.floor(pts)));
  if (currentHigh !== null && bid <= currentHigh) {
    if (currentHigh < 9) return currentHigh + 1;
    return 'pass';
  }
  return bid;
}

function beatsStatic(a, b, led, trump) {
  const aT = a.suit === trump, bT = b.suit === trump;
  if (aT && !bT) return true;
  if (bT && !aT) return false;
  if (a.suit !== b.suit) {
    if (a.suit === led) return true;
    if (b.suit === led) return false;
    return false;
  }
  return RV[a.rank] > RV[b.rank];
}

// hand: bot eli, trick: [{playerIndex,card}], trump, botIndex
function chooseCard(hand, trick, trump, botIndex, players) {
  const led = trick.length ? trick[0].card.suit : null;

  // Lider
  if (!led) {
    // Ası olan renkten oyna, yoksa en düşük at
    const aces = hand.filter(c => c.rank === 'A');
    if (aces.length) return aces[0];
    return [...hand].sort((a, b) => RV[a.rank] - RV[b.rank])[0];
  }

  const follow = hand.filter(c => c.suit === led);
  const trumps = hand.filter(c => c.suit === trump);

  // Şu an kazanan
  let win = trick[0];
  for (const p of trick.slice(1)) {
    if (beatsStatic(p.card, win.card, led, trump)) win = p;
  }
  const winnerTeam = players[win.playerIndex].team;
  const myTeam = players[botIndex].team;
  const isLast = trick.length === 3;

  if (follow.length > 0) {
    const sorted = [...follow].sort((a, b) => RV[a.rank] - RV[b.rank]);
    if (winnerTeam === myTeam && isLast) return sorted[0]; // partner kazanıyor → düşük at
    // kazanmaya çalış
    const winningPlay = follow.find(c => beatsStatic(c, win.card, led, trump));
    return winningPlay || sorted[0];
  }

  // Renk yok
  if (trumps.length) {
    const sortedT = [...trumps].sort((a, b) => RV[a.rank] - RV[b.rank]);
    if (winnerTeam !== myTeam) {
      const w = sortedT.find(c => beatsStatic(c, win.card, led, trump));
      if (w) return w;
    }
    return sortedT[0];
  }

  return [...hand].sort((a, b) => RV[a.rank] - RV[b.rank])[0];
}

module.exports = { chooseTrump, chooseBid, chooseCard };
