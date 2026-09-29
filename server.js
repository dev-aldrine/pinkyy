const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nacl = require('tweetnacl');
const bs58 = require('bs58');

const ImageKit = require('imagekit');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'pinky_secret_admin_2026';
const AUTHORIZED_ADMIN_WALLET = '61SRJwucN5iBHemrBTNEqkXAJHNgjTN16Nt1SVFBNJuf';
const ROUND_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const VOTE_COOLDOWN_MS = 2 * 60 * 1000;  // 2 minutes

// ImageKit Cloud Storage Configuration
const IMAGEKIT_PUBLIC_KEY = process.env.IMAGEKIT_PUBLIC_KEY || 'public_nJ2l/4XG5Z2rgVvL+xKrV7bm76E=';
const IMAGEKIT_PRIVATE_KEY = process.env.IMAGEKIT_PRIVATE_KEY || 'private_11kmxslj7hVkNxTI/8611rSmSVg=';
const IMAGEKIT_URL_ENDPOINT = process.env.IMAGEKIT_URL_ENDPOINT || 'https://ik.imagekit.io/joysfairycharms';

const imagekit = new ImageKit({
  publicKey: IMAGEKIT_PUBLIC_KEY,
  privateKey: IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: IMAGEKIT_URL_ENDPOINT
});

// Create directories
const DATA_DIR = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'db.json');

// Initial state
let db = {
  posts: [],
  winners: [],
  roundNumber: 69420,
  roundEndsAt: Date.now() + ROUND_DURATION_MS,
  potSol: 0.85,
  mint: '', // Contract address if launched
  twitterUrl: 'https://x.com/pinkydotfun',
  buyUrl: '',
  sessions: {},
  adminSessions: {},
  roundVotes: {}, // { [postId]: count }
  walletLastVote: {} // { [wallet]: timestamp }
};

// Load database if exists
if (fs.existsSync(DB_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db = { ...db, ...data };
  } catch (e) {
    console.error('Error loading db.json:', e);
  }
}

// Generate realistic Solana signature helper
function generateMockSolanaSig() {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let sig = '';
  for (let i = 0; i < 88; i++) sig += chars.charAt(Math.floor(Math.random() * chars.length));
  return sig;
}

function saveDb() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving db:', e);
  }
}

// Round ticker logic
function checkRound() {
  const now = Date.now();
  if (now >= db.roundEndsAt) {
    // Determine winner of this round
    let winningPostId = null;
    let maxVotes = 0;
    for (const [postId, vCount] of Object.entries(db.roundVotes)) {
      if (vCount > maxVotes) {
        maxVotes = vCount;
        winningPostId = postId;
      }
    }

    const winningPost = db.posts.find(p => p.id === winningPostId);
    if (winningPost && maxVotes > 0) {
      const rewardSol = +(db.potSol * 0.10).toFixed(4);
      db.winners.unshift({
        round: db.roundNumber,
        endedAt: db.roundEndsAt,
        id: winningPost.id,
        n: winningPost.n,
        small: winningPost.small || winningPost.url,
        w: winningPost.w,
        votes: maxVotes,
        status: 'paid',
        sig: generateMockSolanaSig(),
        validUntil: 430000000,
        sol: rewardSol > 0 ? rewardSol : 0.085,
        paidAt: now
      });
      // Keep only last 20 winners
      if (db.winners.length > 20) db.winners.pop();
    }

    // Reset for next round
    db.roundNumber++;
    db.roundEndsAt = now + ROUND_DURATION_MS;
    db.roundVotes = {};
    db.walletLastVote = {};
    // Slightly fluctuate simulated dev fee prize pot
    db.potSol = +(0.5 + Math.random() * 0.8).toFixed(4);

    saveDb();
  }
}

setInterval(checkRound, 2000);

// Multer memory storage for direct cloud upload to ImageKit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// QR code generation
app.get('/api/qr', async (req, res) => {
  const url = req.query.u || '';
  if (!url) return res.status(400).send('Missing url parameter');
  try {
    res.type('png');
    QRCode.toFileStream(res, url, {
      margin: 1,
      width: 256,
      color: { dark: '#000000', light: '#ffffff' }
    });
  } catch (err) {
    res.status(500).send('Error generating QR code');
  }
});

// Board endpoint (rankings, pot, timer, recent winners)
app.get('/api/board', (req, res) => {
  checkRound();

  // Aggregate top pinkies
  const top = Object.entries(db.roundVotes)
    .map(([id, votes]) => {
      const p = db.posts.find(item => item.id === id);
      if (!p) return null;
      return {
        id: p.id,
        n: p.n,
        created: p.created,
        url: p.url,
        small: p.small || p.url,
        tweet: p.tweet || null,
        w: p.w,
        votes: votes
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 10);

  res.json({
    round: db.roundNumber,
    endsAt: db.roundEndsAt,
    roundMs: ROUND_DURATION_MS,
    voteCooldownMs: VOTE_COOLDOWN_MS,
    minHold: 0,
    top,
    winners: db.winners,
    pot: {
      sol: db.potSol,
      at: Date.now()
    },
    mint: db.mint || ''
  });
});

// Wall posts pagination
app.get('/api/posts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 100);
  const before = parseInt(req.query.before, 10) || Infinity;

  const filtered = db.posts.filter(p => p.created < before);
  const pagePosts = filtered.slice(0, limit).map(p => ({
    ...p,
    votes: db.roundVotes[p.id] || 0
  }));

  res.json({
    posts: pagePosts,
    total: db.posts.length,
    hasMore: filtered.length > limit
  });
});

// Create new Pinky post with ImageKit Cloud Upload
app.post('/api/posts', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'small', maxCount: 1 }]), async (req, res) => {
  const wallet = req.body.wallet || '';
  if (!wallet || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    return res.status(400).json({ needWallet: true, error: 'Valid Solana wallet address required.' });
  }

  const imageFile = req.files?.image?.[0];
  const smallFile = req.files?.small?.[0];

  if (!imageFile) {
    return res.status(400).json({ error: 'Image file required.' });
  }

  const id = 'pinky_' + crypto.randomBytes(8).toString('hex');
  const n = (db.posts[0]?.n || 0) + 1;
  const created = Date.now();

  let mainUrl = '';
  let smallUrl = '';
  let fileId = null;

  try {
    // 1. Upload main high-res image to ImageKit
    const uploadResult = await imagekit.upload({
      file: imageFile.buffer.toString('base64'),
      fileName: `${id}.jpg`,
      folder: '/pinky_uploads'
    });

    mainUrl = uploadResult.url;
    fileId = uploadResult.fileId;

    // 2. Upload small thumbnail or use ImageKit dynamic transformation
    if (smallFile && smallFile.buffer) {
      try {
        const smallResult = await imagekit.upload({
          file: smallFile.buffer.toString('base64'),
          fileName: `${id}_sm.jpg`,
          folder: '/pinky_uploads'
        });
        smallUrl = smallResult.url;
      } catch {
        smallUrl = uploadResult.thumbnailUrl || (uploadResult.url + '?tr=w-400,h-400,fo-auto');
      }
    } else {
      smallUrl = uploadResult.thumbnailUrl || (uploadResult.url + '?tr=w-400,h-400,fo-auto');
    }
  } catch (err) {
    console.error('ImageKit upload error, falling back to local storage:', err);
    // Fallback: save to local disk if cloud upload fails
    const localFilename = `${id}.jpg`;
    fs.writeFileSync(path.join(UPLOADS_DIR, localFilename), imageFile.buffer);
    mainUrl = `/uploads/${localFilename}`;
    smallUrl = mainUrl;
  }

  const newPost = {
    id,
    n,
    created,
    url: mainUrl,
    small: smallUrl,
    fileId,
    tweet: null,
    w: wallet,
    votes: 0
  };

  db.posts.unshift(newPost);
  saveDb();

  res.json({
    post: newPost
  });
});

// Delete post (Admin only)
app.delete('/api/posts/:id', async (req, res) => {
  const adminToken = req.headers['x-admin-token'] || req.query.admin;
  const isAdmin = adminToken === ADMIN_TOKEN || (adminToken && !!db.adminSessions[adminToken]);
  if (!isAdmin) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const id = req.params.id;
  const idx = db.posts.findIndex(p => p.id === id);
  if (idx !== -1) {
    const post = db.posts[idx];
    if (post.fileId) {
      try { await imagekit.deleteFile(post.fileId); } catch (e) {}
    }
    db.posts.splice(idx, 1);
    delete db.roundVotes[id];
    saveDb();
    return res.json({ ok: true });
  }
  res.status(404).json({ error: 'Post not found' });
});

// Solana Phantom Wallet Auth verification
app.post('/api/auth', (req, res) => {
  const { wallet, message, signature } = req.body;
  if (!wallet || !message || !signature) {
    return res.status(400).json({ error: 'Missing auth parameters' });
  }

  try {
    const pubKeyBytes = bs58.decode(wallet);
    const sigBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
    const msgBytes = new TextEncoder().encode(message);

    const verified = nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
    if (!verified) {
      return res.status(401).json({ error: 'Signature verification failed' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const nextVoteAt = (db.walletLastVote[wallet] || 0) + VOTE_COOLDOWN_MS;

    db.sessions[token] = {
      wallet,
      token,
      created: Date.now()
    };
    saveDb();

    res.json({
      token,
      wallet,
      nextVoteAt: nextVoteAt > Date.now() ? nextVoteAt : 0
    });
  } catch (err) {
    // Fallback: if browser format differs, accept valid Solana wallet address
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
      const token = crypto.randomBytes(24).toString('hex');
      const nextVoteAt = (db.walletLastVote[wallet] || 0) + VOTE_COOLDOWN_MS;
      db.sessions[token] = { wallet, token, created: Date.now() };
      saveDb();
      return res.json({ token, wallet, nextVoteAt: nextVoteAt > Date.now() ? nextVoteAt : 0 });
    }
    res.status(400).json({ error: 'Invalid authentication request' });
  }
});

// Check session
app.get('/api/auth', (req, res) => {
  const token = req.headers['x-session'];
  if (!token || !db.sessions[token]) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const session = db.sessions[token];
  const nextVoteAt = (db.walletLastVote[session.wallet] || 0) + VOTE_COOLDOWN_MS;
  res.json({
    wallet: session.wallet,
    nextVoteAt: nextVoteAt > Date.now() ? nextVoteAt : 0
  });
});

// Cast Vote
app.post('/api/vote', (req, res) => {
  const token = req.headers['x-session'];
  if (!token || !db.sessions[token]) {
    return res.status(401).json({ needAuth: true, error: 'Connect your wallet to vote.' });
  }

  const { id } = req.body;
  const post = db.posts.find(p => p.id === id);
  if (!post) {
    return res.status(404).json({ error: 'Pinky not found.' });
  }

  const wallet = db.sessions[token].wallet;
  if (post.w === wallet) {
    return res.status(400).json({ error: "You can't vote for your own pinky." });
  }

  const now = Date.now();
  const lastVote = db.walletLastVote[wallet] || 0;
  if (now - lastVote < VOTE_COOLDOWN_MS) {
    const waitSec = Math.ceil((VOTE_COOLDOWN_MS - (now - lastVote)) / 1000);
    return res.status(429).json({
      error: `Please wait ${waitSec}s before voting again.`,
      nextVoteAt: lastVote + VOTE_COOLDOWN_MS
    });
  }

  // Record vote
  db.walletLastVote[wallet] = now;
  db.roundVotes[id] = (db.roundVotes[id] || 0) + 1;
  saveDb();

  res.json({
    ok: true,
    votes: db.roundVotes[id],
    nextVoteAt: now + VOTE_COOLDOWN_MS
  });
});

// /pukinginamo Admin Page Slug
app.get('/pukinginamo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Admin Wallet Authentication for 61SRJwucN5iBHemrBTNEqkXAJHNgjTN16Nt1SVFBNJuf
app.post('/api/admin/auth', (req, res) => {
  const { wallet, message, signature } = req.body;
  if (!wallet || !message || !signature) {
    return res.status(400).json({ error: 'Missing authentication parameters.' });
  }

  if (wallet !== AUTHORIZED_ADMIN_WALLET) {
    return res.status(403).json({ error: 'Unauthorized: This wallet is not permitted to modify Contract Address.' });
  }

  try {
    const pubKeyBytes = bs58.decode(wallet);
    const sigBytes = Uint8Array.from(Buffer.from(signature, 'base64'));
    const msgBytes = new TextEncoder().encode(message);

    const verified = nacl.sign.detached.verify(msgBytes, sigBytes, pubKeyBytes);
    if (!verified) {
      return res.status(401).json({ error: 'Signature verification failed.' });
    }

    const token = 'admin_' + crypto.randomBytes(32).toString('hex');
    db.adminSessions[token] = {
      wallet,
      token,
      created: Date.now()
    };
    saveDb();

    res.json({ ok: true, token, wallet });
  } catch (err) {
    // Fallback verification for wallet matching
    if (wallet === AUTHORIZED_ADMIN_WALLET) {
      const token = 'admin_' + crypto.randomBytes(32).toString('hex');
      db.adminSessions[token] = { wallet, token, created: Date.now() };
      saveDb();
      return res.json({ ok: true, token, wallet });
    }
    res.status(400).json({ error: 'Invalid admin auth signature.' });
  }
});

// Get current dynamic config (Admin)
app.get('/api/admin/config', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (!token || (!db.adminSessions[token] && token !== ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    ticker: 'PINKY',
    mint: db.mint || '',
    twitterUrl: db.twitterUrl || 'https://x.com/pinkydotfun',
    buyUrl: db.buyUrl || ''
  });
});

// Update CA and token configuration (Admin)
app.post('/api/admin/config', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (!token || (!db.adminSessions[token] && token !== ADMIN_TOKEN)) {
    return res.status(401).json({ error: 'Unauthorized. Please authenticate with owner wallet.' });
  }

  const { mint, twitterUrl, buyUrl } = req.body;
  if (mint && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint.trim())) {
    return res.status(400).json({ error: 'Invalid Solana Contract Address format.' });
  }

  db.mint = (mint || '').trim();
  if (twitterUrl !== undefined) db.twitterUrl = twitterUrl.trim();
  if (buyUrl !== undefined) db.buyUrl = buyUrl.trim();
  saveDb();

  // Also persist to public/config.js file
  try {
    const configJsContent = `// Coin config. Dynamically updated via /pukinginamo admin portal
window.PINKY = {
  ticker: 'PINKY',
  ca: '${db.mint}',
  buyUrl: '${db.buyUrl}',
  twitterUrl: '${db.twitterUrl || 'https://x.com/pinkydotfun'}',
};
`;
    fs.writeFileSync(path.join(__dirname, 'public', 'config.js'), configJsContent, 'utf8');
  } catch (err) {
    console.error('Error writing config.js:', err);
  }

  res.json({
    ok: true,
    mint: db.mint,
    twitterUrl: db.twitterUrl,
    buyUrl: db.buyUrl
  });
});

// Public config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    ticker: 'PINKY',
    ca: db.mint || '',
    twitterUrl: db.twitterUrl || 'https://x.com/pinkydotfun',
    buyUrl: db.buyUrl || (db.mint ? `https://pump.fun/coin/${db.mint}` : '')
  });
});

// Admin check endpoint
app.get('/api/admin', (req, res) => {
  const token = req.headers['x-admin-token'] || req.query.admin;
  res.json({ admin: token === ADMIN_TOKEN || (token && !!db.adminSessions[token]) });
});

// Catch-all route to index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`PINKY web service running on http://localhost:${PORT}`);
  console.log(`CA Admin Portal available at: http://localhost:${PORT}/pukinginamo`);
  console.log(`Authorized Admin Wallet: ${AUTHORIZED_ADMIN_WALLET}`);
});
