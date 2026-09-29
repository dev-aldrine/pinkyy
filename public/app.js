(() => {
  const $ = (id) => document.getElementById(id);
  const cfg = window.TITS || window.PINKY || {};
  const POLL_MS = 4000;
  const PAGE = 60;

  // ---------- coin links ----------
  const buyUrl = cfg.buyUrl || (cfg.ca ? `https://pump.fun/coin/${cfg.ca}` : '');
  const setLink = (el, url) => (url ? (el.href = url) : el.setAttribute('aria-disabled', 'true'));
  setLink($('buyLink'), buyUrl);
  setLink($('xLink'), cfg.twitterUrl);
  if (cfg.ca) $('caText').textContent = cfg.ca;

  // Dynamic server config loader (ensures instant CA sync from /pukinginamo updates)
  fetch('/api/config')
    .then(r => r.json())
    .then(d => {
      if (d.ca) {
        cfg.ca = d.ca;
        $('caText').textContent = d.ca;
        setLink($('buyLink'), d.buyUrl || `https://pump.fun/coin/${d.ca}`);
      }
      if (d.twitterUrl) {
        cfg.twitterUrl = d.twitterUrl;
        setLink($('xLink'), d.twitterUrl);
      }
    })
    .catch(() => {});

  $('ca').onclick = async () => {
    if (!cfg.ca) return toast('CA coming soon');
    try { await navigator.clipboard.writeText(cfg.ca); toast('CA copied'); } catch { toast(cfg.ca); }
  };

  // ---------- continue on phone ----------
  $('qr').src = '/api/qr?u=' + encodeURIComponent(location.origin + '/?cam=1');

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), ms);
  }

  // ---------- admin (?admin=TOKEN once, remembered) ----------
  let adminToken = '';
  try {
    const q = new URLSearchParams(location.search).get('admin');
    if (q) { localStorage.setItem('tits:admin', q); history.replaceState(null, '', location.pathname); }
    adminToken = localStorage.getItem('tits:admin') || localStorage.getItem('pinky:admin') || '';
  } catch {}
  let isAdmin = false;
  if (adminToken) {
    fetch('/api/admin', { headers: { 'x-admin-token': adminToken } })
      .then((r) => r.json()).then((d) => { isAdmin = !!d.admin; if (isAdmin) document.querySelectorAll('.tile').forEach(addDelete); })
      .catch(() => {});
  }

  // ---------- the wall ----------
  const wall = $('wall');
  const seen = new Set();
  let total = 0;
  let oldest = Infinity;
  let hasMore = false;
  let loadingMore = false;

  function setCount(n) {
    total = n;
    $('count').textContent = n.toLocaleString();
    $('countWord').textContent = n === 1 ? 'post' : 'tits';
    $('empty').hidden = n > 0;
  }

  function addDelete(tile) {
    if (tile.querySelector('.del')) return;
    const b = document.createElement('button');
    b.className = 'del';
    b.type = 'button';
    b.textContent = '✕';
    b.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this post?')) return;
      const r = await fetch(`/api/posts/${tile.dataset.id}`, { method: 'DELETE', headers: { 'x-admin-token': adminToken } });
      if (r.ok) { tile.remove(); seen.delete(tile.dataset.id); setCount(Math.max(0, total - 1)); } else toast('Delete failed');
    };
    tile.appendChild(b);
  }

  function makeTile(p, isNew) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tile' + (isNew ? ' new' : '');
    tile.dataset.id = p.id;
    tile.style.setProperty('--tilt', ((p.n || 0) % 2 ? 2 : -2) + 'deg');
    const img = new Image();
    img.alt = 'tits';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onload = () => img.classList.add('in');
    img.src = p.small || p.url;
    tile.appendChild(img);
    if (p.n) {
      const num = document.createElement('span');
      num.className = 'num';
      num.textContent = '#' + p.n;
      tile.appendChild(num);
    }
    if (p.w) {
      const v = document.createElement('span');
      v.className = 'tvote';
      v.textContent = 'Vote';
      v.onclick = (e) => { e.stopPropagation(); castVote(p); };
      tile.appendChild(v);
    }
    tile.onclick = () => openViewer(p);
    if (isAdmin) addDelete(tile);
    return tile;
  }

  function addPosts(posts, { top = false, isNew = false } = {}) {
    const frag = document.createDocumentFragment();
    for (const p of posts) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      frag.appendChild(makeTile(p, isNew));
      if (p.created < oldest) oldest = p.created;
    }
    if (top) wall.prepend(frag); else wall.appendChild(frag);
  }

  async function fetchPage(before) {
    const r = await fetch(`/api/posts?limit=${PAGE}${before ? `&before=${before}` : ''}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Could not load posts');
    return r.json();
  }

  async function initial() {
    try {
      const d = await fetchPage();
      addPosts(d.posts);
      hasMore = d.hasMore;
      setCount(d.total);
    } catch (err) {
      $('empty').hidden = false;
      $('empty').textContent = err.message;
    }
  }

  async function poll() {
    if (document.hidden) return;
    try {
      const d = await fetchPage();
      const fresh = d.posts.filter((p) => !seen.has(p.id));
      if (fresh.length) addPosts(fresh, { top: true, isNew: true });
      if (!Number.isFinite(oldest)) hasMore = d.hasMore;
      setCount(Math.max(d.total, total));
    } catch {}
  }

  new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || !hasMore || loadingMore) return;
    loadingMore = true;
    try {
      const d = await fetchPage(oldest);
      addPosts(d.posts);
      hasMore = d.hasMore;
    } catch {} finally { loadingMore = false; }
  }, { rootMargin: '800px' }).observe($('more'));

  initial();
  setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---------- viewer ----------
  function openViewer(p) {
    $('viewerImg').src = p.url || p.small;
    $('viewerNum').textContent = p.n ? `#${p.n}` : '';
    const tw = $('viewerTweet');
    tw.hidden = !(p.tweet && cfg.twitterUrl);
    if (!tw.hidden) tw.href = `${cfg.twitterUrl.replace(/\/$/, '')}/status/${p.tweet}`;
    $('viewerVote').hidden = !p.w;
    $('viewerVote').onclick = (e) => { e.stopPropagation(); castVote(p); };
    $('viewer').hidden = false;
  }
  $('viewer').onclick = () => { $('viewer').hidden = true; $('viewerImg').removeAttribute('src'); };

  // ---------- camera ----------
  const video = $('video');
  const shot = $('shot');
  let stream = null;
  let facing = 'environment';
  let captured = null; // canvas with the square photo

  function mode(review) {
    $('liveControls').hidden = review;
    $('reviewControls').hidden = !review;
    shot.hidden = !review;
    video.hidden = review;
    $('guide').style.display = review ? 'none' : '';
    $('hint').hidden = review;
    $('camTitle').textContent = review ? 'Looking good?' : 'Show us your tits';
    $('reject').hidden = true;
    $('checking').hidden = true;
    $('send').hidden = false;
    $('walletRow').hidden = !review;
    if (review) showWallet();
  }

  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  function camError(msg) {
    $('camErrorText').textContent = isTouch ? msg + ' Or use your camera app:' : msg;
    $('nativeCam').hidden = !isTouch;
    $('camError').hidden = false;
    $('snap').disabled = true;
    $('guide').style.display = 'none';
    $('hint').hidden = true;
  }

  async function startCamera() {
    stopCamera();
    $('camError').hidden = true;
    $('snap').disabled = false;
    if (!navigator.mediaDevices?.getUserMedia) return camError('Live camera not available in this browser.');
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      });
      video.srcObject = stream;
      const settings = stream.getVideoTracks()[0]?.getSettings?.() || {};
      video.classList.toggle('mirror', (settings.facingMode || facing) === 'user');
      await video.play().catch(() => {});
    } catch {
      camError(isTouch ? 'Camera blocked. Allow camera access in your browser settings.' : 'No camera found. Allow camera access, or scan the code on the page to use your phone.');
    }
  }

  function stopCamera() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  }

  // Center-square crop of any image/video source into a canvas of `size` px.
  function squareCanvas(src, sw, sh, size, mirror) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const s = Math.min(sw, sh);
    if (mirror) { ctx.translate(size, 0); ctx.scale(-1, 1); }
    ctx.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, size, size);
    return c;
  }

  function showCaptured(c) {
    captured = c;
    shot.width = shot.height = c.width;
    shot.getContext('2d').drawImage(c, 0, 0);
    mode(true);
  }

  function openCam(live = true) {
    $('cam').hidden = false;
    document.body.style.overflow = 'hidden';
    mode(false);
    if (live) startCamera();
  }
  $('takeBtn').onclick = () => openCam();
  if (new URLSearchParams(location.search).has('cam')) {
    history.replaceState(null, '', location.pathname);
    openCam();
  }

  function closeCam() {
    stopCamera();
    $('cam').hidden = true;
    document.body.style.overflow = '';
    captured = null;
  }
  $('camClose').onclick = closeCam;
  $('cam').onclick = (e) => { if (e.target === $('cam')) closeCam(); };
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('viewer').hidden) $('viewer').click(); else if (!$('cam').hidden) closeCam();
  });

  $('snap').onclick = () => {
    if (!video.videoWidth) return toast('Camera is still starting…');
    const size = Math.min(1000, video.videoWidth, video.videoHeight);
    showCaptured(squareCanvas(video, video.videoWidth, video.videoHeight, size, video.classList.contains('mirror')));
    stopCamera();
  };

  $('flip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startCamera(); };

  async function handleFile(f) {
    if (!f) return;
    try {
      let srcEl = null;
      let w = 0, h = 0;
      if (typeof createImageBitmap === 'function') {
        try {
          const bmp = await createImageBitmap(f);
          srcEl = bmp;
          w = bmp.width;
          h = bmp.height;
        } catch (e) {
          srcEl = null;
        }
      }
      if (!srcEl) {
        await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const img = new Image();
            img.onload = () => {
              srcEl = img;
              w = img.naturalWidth || img.width;
              h = img.naturalHeight || img.height;
              resolve();
            };
            img.onerror = reject;
            img.src = reader.result;
          };
          reader.onerror = reject;
          reader.readAsDataURL(f);
        });
      }

      const size = Math.min(1000, w, h);
      if (size < 50) return toast('That photo is too small.');
      showCaptured(squareCanvas(srcEl, w, h, size, false));
      stopCamera();
    } catch (err) {
      toast("Couldn't read that photo. Please try another.");
    }
  }

  $('fileInput').onchange = (e) => {
    handleFile(e.target.files[0]);
    e.target.value = '';
  };

  $('nativeInput').onchange = (e) => {
    handleFile(e.target.files[0]);
    e.target.value = '';
  };

  $('retake').onclick = () => { captured = null; mode(false); startCamera(); };

  const toJpeg = (c, q) => new Promise((res) => c.toBlob(res, 'image/jpeg', q));

  $('send').onclick = async () => {
    if (!captured) return;
    const payTo = session.wallet || $('walletInput').value.trim();
    if (!looksLikeWallet(payTo)) {
      $('walletInput').classList.add('bad');
      $('walletInput').focus();
      $('reject').textContent = 'Add your Solana wallet address so your post can get paid if it wins.';
      $('reject').hidden = false;
      return;
    }
    try { localStorage.setItem('tits:payto', payTo); } catch {}
    const btn = $('send');
    btn.disabled = true;
    $('retake').disabled = true;
    btn.textContent = 'Posting…';
    $('reject').hidden = true;
    $('checking').hidden = false;
    try {
      const small = squareCanvas(captured, captured.width, captured.height, Math.min(400, captured.width), false);
      const [image, smallBlob] = await Promise.all([toJpeg(captured, 0.85), toJpeg(small, 0.8)]);
      const form = new FormData();
      form.append('image', image, 'tits.jpg');
      form.append('small', smallBlob, 'tits.sm.jpg');
      form.append('wallet', payTo);
      const r = await fetch('/api/posts', { method: 'POST', body: form, headers: session.token ? { 'x-session': session.token } : {} });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (d.notPinky || d.needWallet || r.status === 409) { $('reject').textContent = d.error; $('reject').hidden = false; btn.hidden = true; return; }
        throw new Error(d.error || 'Upload failed');
      }
      addPosts([d.post], { top: true, isNew: true });
      setCount(total + 1);
      closeCam();
      window.scrollTo({ top: wall.offsetTop - 80, behavior: 'smooth' });
      toast(`You're #${d.post.n}!`);
    } catch (err) {
      toast(err.message, 4000);
    } finally {
      $('checking').hidden = true;
      btn.disabled = false;
      $('retake').disabled = false;
      btn.textContent = 'Post it';
    }
  };

  // ---------- wallet (Phantom sign-in) ----------
  const session = { token: '', wallet: '', nextVoteAt: 0 };
  try { Object.assign(session, JSON.parse(localStorage.getItem('tits:session') || localStorage.getItem('pinky:session') || '{}')); } catch {}
  const short = (w) => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
  const looksLikeWallet = (w) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w || '');
  const saveSession = () => { try { localStorage.setItem('tits:session', JSON.stringify(session)); } catch {} };
  const getPhantomProvider = () => window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);

  function paintWallet() {
    $('connectLabel').textContent = session.wallet ? short(session.wallet) : 'Connect';
    $('connectBtn').classList.toggle('on', !!session.wallet);
    paintMyVote();
  }
  function showWallet() {
    const input = $('walletInput');
    input.classList.remove('bad');
    if (session.wallet) {
      input.hidden = true;
      $('walletConnected').hidden = false;
      $('walletConnected').innerHTML = 'Paid to your connected wallet <code>' + short(session.wallet) + '</code>';
    } else {
      input.hidden = false;
      $('walletConnected').hidden = true;
      try { input.value ||= localStorage.getItem('tits:payto') || localStorage.getItem('pinky:payto') || ''; } catch {}
    }
  }
  $('walletInput').oninput = () => $('walletInput').classList.remove('bad');

  async function connect() {
    const p = getPhantomProvider();
    if (!p) {
      if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
        location.href = 'https://phantom.app/ul/browse/' + encodeURIComponent(location.href) + '?ref=' + encodeURIComponent(location.origin);
      } else {
        window.open('https://phantom.app/download', '_blank', 'noopener');
        toast('Install Phantom, then refresh this page.', 4000);
      }
      return false;
    }
    try {
      const { publicKey } = await p.connect();
      const wallet = publicKey.toString();
      const message = 'Sign in to TITS\n\nThis only proves you own this wallet. It costs nothing and sends nothing.\n\nWallet: ' + wallet + '\nTime: ' + new Date().toISOString();
      const { signature } = await p.signMessage(new TextEncoder().encode(message), 'utf8');
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet, message, signature: btoa(String.fromCharCode(...signature)) }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Sign-in failed');
      Object.assign(session, { token: d.token, wallet: d.wallet, nextVoteAt: d.nextVoteAt || 0 });
      saveSession();
      paintWallet();
      if (!$('cam').hidden && !$('walletRow').hidden) showWallet();
      toast('Connected ' + short(wallet));
      return true;
    } catch (err) {
      toast(err && err.code === 4001 ? 'Cancelled.' : (err && err.message) || 'Could not connect.');
      return false;
    }
  }
  function disconnect() {
    Object.assign(session, { token: '', wallet: '', nextVoteAt: 0 });
    saveSession();
    try { phantom()?.disconnect?.(); } catch {}
    paintWallet();
  }
  $('connectBtn').onclick = () => {
    if (!session.wallet) return connect();
    if (confirm('Disconnect ' + short(session.wallet) + '?')) { disconnect(); toast('Disconnected'); }
  };

  // ---------- voting ----------
  let voting = false;
  async function castVote(p) {
    if (voting) return;
    if (!session.token && !(await connect())) return;
    if (p.w === session.wallet) return toast("You can't vote for your own post.");
    voting = true;
    try {
      const r = await fetch('/api/vote', { method: 'POST', headers: { 'content-type': 'application/json', 'x-session': session.token }, body: JSON.stringify({ id: p.id }) });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401 && d.needAuth) { disconnect(); return toast('Please connect again.'); }
      if (d.nextVoteAt) { session.nextVoteAt = d.nextVoteAt; saveSession(); paintMyVote(); }
      if (!r.ok) return toast(d.error || 'Vote failed', 3500);
      toast('Voted for #' + p.n + ' (' + d.votes + (d.votes === 1 ? ' vote' : ' votes') + ' this round)');
      loadBoard(true);
    } catch { toast('Vote failed. Try again.'); } finally { voting = false; }
  }

  // ---------- ranking ----------
  let boardData = null;
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function paintMyVote() {
    const el = $('myVote');
    if (!session.wallet) { el.textContent = 'Connect'; return; }
    const left = (session.nextVoteAt || 0) - Date.now();
    el.textContent = left > 0 ? 'in ' + clock(left) : 'Ready';
  }
  $('myVote').parentElement.onclick = () => { if (!session.wallet) connect(); };
  let reloading = false;
  function tick() {
    if (boardData) {
      const left = boardData.endsAt - Date.now();
      $('roundLeft').textContent = clock(left);
      if (left <= 0 && !reloading) { reloading = true; setTimeout(() => { reloading = false; loadBoard(true); }, 2500); }
    }
    paintMyVote();
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const votesWord = (n) => n + (n === 1 ? ' vote' : ' votes');
  function paintBoard(d) {
    boardData = d;
    $('prize').textContent = d.pot && d.pot.sol > 0 ? d.pot.sol.toFixed(d.pot.sol < 1 ? 4 : 2) + ' SOL' : d.mint ? '0 SOL' : 'At launch';
    if (d.mint && !cfg.ca) {
      cfg.ca = d.mint;
      $('caText').textContent = d.mint;
      $('buyLink').href = 'https://pump.fun/coin/' + d.mint;
      $('buyLink').removeAttribute('aria-disabled');
    }
    const ol = $('board');
    ol.innerHTML = '';
    d.top.forEach((p, i) => {
      const li = document.createElement('li');
      li.innerHTML = '<span class="rk">' + (i + 1) + '</span><img alt="tits" src="' + esc(p.small || p.url) + '">' +
        '<div class="who"><b>#' + p.n + (i === 0 ? '<span class="lead">Winning</span>' : '') + '</b><span>' + votesWord(p.votes) + ' · ' + short(p.w) + '</span></div>' +
        '<div class="vc">' + p.votes + '<small>' + (p.votes === 1 ? 'vote' : 'votes') + '</small></div>';
      const b = document.createElement('button');
      b.className = 'vote-btn';
      b.type = 'button';
      b.textContent = 'Vote';
      b.onclick = () => castVote(p);
      li.appendChild(b);
      li.querySelector('img').onclick = () => openViewer(p);
      ol.appendChild(li);
    });
    $('boardEmpty').hidden = d.top.length > 0;
    const ul = $('winners');
    if (!d.winners || !d.winners.length) { ul.innerHTML = '<li class="muted">No winners yet. The first round could be yours.</li>'; return; }
    ul.innerHTML = d.winners.map((w) => {
      const t = new Date(w.endedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      let amt;
      if (w.status === 'paid') amt = w.sol.toFixed(w.sol < 1 ? 4 : 2) + ' SOL<a href="https://solscan.io/tx/' + esc(w.sig) + '" target="_blank" rel="noopener">view tx</a>';
      else if ((w.status === 'pending' || w.status === 'sending') && !d.mint) amt = '<small>Awaiting launch</small>';
      else if (w.status === 'pending' || w.status === 'sending') amt = 'Paying…';
      else if (w.status === 'rolled') amt = '<small>Pot rolled over</small>';
      else if (w.status === 'paused') amt = '<small>Paused</small>';
      else amt = '<small>Not paid</small>';
      return '<li><img alt="" src="' + esc(w.small || w.url) + '"><div class="w-main"><b>#' + w.n + '</b><span>' + t + ' · ' + votesWord(w.votes) + ' · ' + short(w.w) + '</span></div><div class="w-amt">' + amt + '</div></li>';
    }).join('');
  }
  async function loadBoard(fresh) {
    if (document.hidden && !fresh) return;
    try {
      const r = await fetch('/api/board' + (fresh ? '?t=' + Date.now() : ''));
      if (r.ok) paintBoard(await r.json());
    } catch {}
  }
  paintWallet();
  loadBoard(true);
  setInterval(loadBoard, 4000);
  setInterval(tick, 1000);
  if (session.token) {
    fetch('/api/auth', { headers: { 'x-session': session.token } }).then((r) => r.json()).then((d) => {
      if (!d.wallet) { disconnect(); return; }
      session.nextVoteAt = d.nextVoteAt || 0;
      saveSession();
      paintMyVote();
    }).catch(() => {});
  }
})();
