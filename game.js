const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RV = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));

function createDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r, id: `${s}_${r}` });
  return d;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor(roomId) {
    this.roomId = roomId;
    this.players = [];          // {id, name, isBot, hand[], team}
    this.dealerIndex = 0;
    this.trump = null;
    this.phase = 'waiting';     // waiting | trump | bidding | playing | scoring | over
    this.bids = [];
    this.highestBid = null;
    this.highestBidder = null;
    this.currentBidderIndex = 0;
    this.turnIndex = 0;
    this.currentTrick = [];
    this.lastTrick = null;
    this.lastTrickWinner = null;
    this.tricksWon = [0, 0];
    this.scores = [0, 0];
    this.targetScore = 31;
    // Yönetici koz seçimi animasyonu için küçük bir gecikme
    this.adminChoseAt = null;
  }

  addPlayer(id, name, isBot = false) {
    if (this.players.length >= 4) return false;
    this.players.push({ id, name, isBot, hand: [], team: 0 });
    return true;
  }

  start() {
    if (this.players.length !== 4) return false;
    this.players.forEach((p, i) => (p.team = i % 2));
    this._newRound();
    return true;
  }

  _newRound() {
    const deck = shuffle(createDeck());
    this.players.forEach(p => (p.hand = []));
    for (let i = 0; i < 52; i++) this.players[i % 4].hand.push(deck[i]);
    for (const p of this.players) {
      p.hand.sort((a, b) => a.suit.localeCompare(b.suit) || RV[a.rank] - RV[b.rank]);
    }
    this.trump = null;
    this.bids = [];
    this.highestBid = null;
    this.highestBidder = null;
    this.currentTrick = [];
    this.lastTrick = null;
    this.lastTrickWinner = null;
    this.tricksWon = [0, 0];

    // Faz: önce yönetici koz seçecek
    this.phase = 'trump';
    this.adminChoseAt = null;
  }

  // 🎲 Yönetici (oyun dışı) rastgele koz seçer
  adminChooseTrump() {
    if (this.phase !== 'trump') return false;
    const suit = SUITS[Math.floor(Math.random() * SUITS.length)];
    this.trump = suit;
    this.adminChoseAt = Date.now();
    this.phase = 'bidding';
    // Teklif turunu dağıtıcının solundan başlat
    this.currentBidderIndex = (this.dealerIndex + 1) % 4;
    return true;
  }

  placeBid(playerIndex, bid) {
    if (this.phase !== 'bidding') return false;
    if (playerIndex !== this.currentBidderIndex) return false;

    if (bid !== 'pass') {
      if (typeof bid !== 'number' || bid < 2 || bid > 13) return false;
      if (this.highestBid !== null && bid <= this.highestBid) return false;
      this.highestBid = bid;
      this.highestBidder = playerIndex;
    }
    this.bids.push({ playerIndex, bid });

    const allBid = this.bids.length === 4;
    if (bid === 13 || allBid) {
      if (this.highestBidder === null) {
        // Kimse teklif vermedi → yeniden dağıt (yönetici tekrar koz seçer)
        this.dealerIndex = (this.dealerIndex + 1) % 4;
        this._newRound();
        return true;
      }
      this._startPlaying();
    } else {
      this.currentBidderIndex = (this.currentBidderIndex + 1) % 4;
    }
    return true;
  }

  _startPlaying() {
    this.phase = 'playing';
    this.turnIndex = (this.dealerIndex + 1) % 4;
    this.currentTrick = [];
    this.tricksWon = [0, 0];
  }

  playCard(playerIndex, cardId) {
    if (this.phase !== 'playing') return false;
    if (playerIndex !== this.turnIndex) return false;
    const p = this.players[playerIndex];
    const idx = p.hand.findIndex(c => c.id === cardId);
    if (idx === -1) return false;

    if (this.currentTrick.length > 0) {
      const led = this.currentTrick[0].card.suit;
      const card = p.hand[idx];
      const hasSuit = p.hand.some(c => c.suit === led);
      if (hasSuit && card.suit !== led) return false;
    }

    const card = p.hand.splice(idx, 1)[0];
    this.currentTrick.push({ playerIndex, card });

    if (this.currentTrick.length === 4) this._resolveTrick();
    else this.turnIndex = (this.turnIndex + 1) % 4;
    return true;
  }

  _beats(a, b, led) {
    const aT = a.suit === this.trump;
    const bT = b.suit === this.trump;
    if (aT && !bT) return true;
    if (bT && !aT) return false;
    if (a.suit !== b.suit) {
      if (a.suit === led) return true;
      if (b.suit === led) return false;
      return false;
    }
    return RV[a.rank] > RV[b.rank];
  }

  _resolveTrick() {
    const led = this.currentTrick[0].card.suit;
    let win = this.currentTrick[0];
    for (const pl of this.currentTrick.slice(1)) {
      if (this._beats(pl.card, win.card, led)) win = pl;
    }
    this.tricksWon[this.players[win.playerIndex].team]++;
    this.turnIndex = win.playerIndex;
    this.lastTrickWinner = win.playerIndex;
    this.lastTrick = [...this.currentTrick];
    this.currentTrick = [];

    if (this.players[0].hand.length === 0) this._scoreRound();
  }

  _scoreRound() {
    const bidderTeam = this.players[this.highestBidder].team;
    const other = 1 - bidderTeam;
    if (this.tricksWon[bidderTeam] >= this.highestBid) {
      this.scores[bidderTeam] += this.highestBid;
    } else {
      this.scores[bidderTeam] -= this.highestBid;
    }
    this.scores[other] += this.tricksWon[other];

    if (this.scores[0] >= this.targetScore || this.scores[1] >= this.targetScore) {
      this.phase = 'over';
    } else {
      this.phase = 'scoring';
    }
  }

  nextRound() {
    this.dealerIndex = (this.dealerIndex + 1) % 4;
    this._newRound();
  }

  stateFor(playerId) {
    const me = this.players.find(p => p.id === playerId);
    return {
      roomId: this.roomId,
      phase: this.phase,
      trump: this.trump,
      dealerIndex: this.dealerIndex,
      currentBidderIndex: this.currentBidderIndex,
      turnIndex: this.turnIndex,
      highestBid: this.highestBid,
      highestBidder: this.highestBidder,
      bids: this.bids,
      currentTrick: this.currentTrick,
      lastTrick: this.lastTrick,
      lastTrickWinner: this.lastTrickWinner,
      tricksWon: this.tricksWon,
      scores: this.scores,
      players: this.players.map((p, i) => ({
        index: i, id: p.id, name: p.name, isBot: p.isBot, team: p.team,
        cardCount: p.hand.length
      })),
      myHand: me ? me.hand : [],
      myIndex: me ? this.players.indexOf(me) : -1
    };
  }
}

module.exports = { Game, SUITS, RANKS, RV, createDeck, shuffle };
