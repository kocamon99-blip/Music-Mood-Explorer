const state = { mood: 'chill' };
const queuePlayback = { active: false, loading: false };
let songsById = {};
let lastModalTrigger = null;

function showError(msg) {
  const box = document.getElementById('error');
  box.textContent = msg;
  box.style.display = msg ? 'block' : 'none';
}

function formatDuration(ms) {
  if (!ms) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getPreviewUrl(song) {
  return `/preview/${encodeURIComponent(song.id)}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function loadDashboard() {
  const algo = document.getElementById('algo').value;
  try {
    const [songsRes, watchlistRes, historyRes] = await Promise.all([
      fetch(`/songs?mood=${encodeURIComponent(state.mood)}&sort=${algo}`),
      fetch('/watchlist'),
      fetch('/history'),
    ]);

    const songsData = await songsRes.json();
    const watchlistData = await watchlistRes.json();
    const historyData = await historyRes.json();

    renderSongs(songsData);
    renderWatchlist(watchlistData);
    renderHistory(historyData);
    document.getElementById('queueSummary').textContent = watchlistData.size || 0;
    document.getElementById('historySummary').textContent = historyData.size || 0;
    showError('');
  } catch (error) {
    showError('โหลดข้อมูลไม่สำเร็จ: ' + error.message);
  }
}

function renderSongs(res) {
  songsById = Object.fromEntries(res.data.map(song => [song.id, song]));
  document.getElementById('currentMood').textContent = res.mood;
  document.getElementById('sortInfo').textContent = `${res.algorithm} · ${res.count} เพลง · ${res.ms} ms`;

  document.getElementById('songs').innerHTML = res.data.map(song => `
    <article class="card">
      <img src="${song.image}" alt="${escapeHtml(song.title)}" loading="lazy">
      <div class="info">
        <button class="track-open" onclick="openSongModal(${JSON.stringify(song.id)}, this)">${escapeHtml(song.title)}</button>
        <span class="meta">${escapeHtml(song.artist)} · ${escapeHtml(song.genre)}</span>
        <span class="eps">${formatDuration(song.duration)}</span>
      </div>
      <div class="card-actions">
        <button class="preview-btn" onclick="playPreview(${JSON.stringify(song.id)})" ${song.preview ? '' : 'disabled'} aria-label="${song.preview ? 'ฟังตัวอย่าง' : 'ไม่มีตัวอย่าง'}: ${escapeHtml(song.title)}">▶ ฟังตัวอย่าง</button>
        <button class="queue-btn" onclick="addToWatchlist(${JSON.stringify(song.id)})" aria-label="เพิ่ม ${escapeHtml(song.title)} เข้าคิว">+ คิว</button>
      </div>
    </article>
  `).join('');
}

function renderWatchlist(res) {
  document.getElementById('queueSize').textContent = res.size;
  document.getElementById('queueSummary').textContent = res.size;
  document.getElementById('watchlist').innerHTML = res.size === 0
    ? '<li class="empty">คิวว่าง</li>'
    : res.items.map((song, index) => `<li>${index + 1}. ${escapeHtml(song.title)}</li>`).join('');
}

function renderHistory(res) {
  document.getElementById('historySummary').textContent = res.size;
  document.getElementById('history').innerHTML = res.size === 0
    ? '<li class="empty">ยังไม่มีประวัติ</li>'
    : res.history.map(item => `<li><b>${item.action}</b> ${escapeHtml(item.song.title)} <span>${item.time}</span></li>`).join('');
}

function playPreview(id) {
  const song = songsById[id];
  if (!song || !song.preview) return;

  queuePlayback.active = false;
  document.getElementById('queueStatus').textContent = 'เล่นตัวอย่างเพลงเดี่ยว · คิวที่เหลือยังรออยู่';
  const player = document.getElementById('previewAudio');
  const previewPanel = document.getElementById('previewPlayer');
  const modalPlayer = document.getElementById('modalPreview');
  modalPlayer.pause();
  modalPlayer.currentTime = 0;
  player.pause();
  player.src = getPreviewUrl(song);
  player.load();
  document.getElementById('previewTitle').textContent = song.title;
  document.getElementById('previewArtist').textContent = song.artist;
  previewPanel.hidden = false;
  player.play().catch(() => {
    showError('ไม่สามารถเล่นตัวอย่างเพลงนี้ได้ กรุณากดเล่นจากเครื่องเล่นอีกครั้ง');
  });
}

function openSongModal(id, trigger = null) {
  const song = songsById[id];
  if (!song) return;

  lastModalTrigger = trigger || document.activeElement;
  if (queuePlayback.active) stopQueuePlayback();
  document.getElementById('modalImage').src = song.image;
  document.getElementById('modalImage').alt = song.title;
  document.getElementById('modalName').textContent = song.title;
  document.getElementById('modalArtist').textContent = song.artist;
  document.getElementById('modalGenre').textContent = song.genre;
  document.getElementById('modalAlbum').textContent = song.album || 'ไม่ระบุ';
  document.getElementById('modalDuration').textContent = formatDuration(song.duration);
  document.getElementById('modalMood').textContent = song.mood || state.mood;
  document.getElementById('modalLink').href = song.url || '#';
  document.getElementById('modalLink').textContent = 'เปิด iTunes';

  const preview = document.getElementById('modalPreview');
  document.getElementById('previewAudio').pause();
  if (song.preview) {
    preview.src = getPreviewUrl(song);
    document.getElementById('modalPreviewWrap').style.display = 'block';
    preview.load();
  } else {
    preview.removeAttribute('src');
    document.getElementById('modalPreviewWrap').style.display = 'none';
  }

  document.getElementById('songModal').style.display = 'flex';
  document.querySelector('.modal-close').focus();
}

function closeSongModal() {
  document.getElementById('songModal').style.display = 'none';
  document.getElementById('modalPreview').pause();
  if (lastModalTrigger && document.contains(lastModalTrigger)) lastModalTrigger.focus();
}

document.addEventListener('keydown', event => {
  const modal = document.getElementById('songModal');
  if (event.key === 'Escape' && modal.style.display === 'flex') closeSongModal();
  if (event.key === 'Tab' && modal.style.display === 'flex') {
    const closeButton = modal.querySelector('.modal-close');
    const link = document.getElementById('modalLink');
    const modalAudio = document.getElementById('modalPreview');
    const focusable = [closeButton, link, ...(modalAudio.offsetParent ? [modalAudio] : [])];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

document.getElementById('modalPreview').addEventListener('play', () => {
  document.getElementById('previewAudio').pause();
});

async function addToWatchlist(id) {
  try {
    const res = await fetch('/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
}

async function processQueue() {
  if (queuePlayback.loading) return;
  queuePlayback.active = true;
  await playNextQueuedTrack();
}

async function playNextQueuedTrack() {
  if (!queuePlayback.active || queuePlayback.loading) return;
  queuePlayback.loading = true;
  try {
    const res = await fetch('/watchlist/process', { method: 'DELETE' });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 400) {
        queuePlayback.active = false;
        document.getElementById('queueStatus').textContent = 'เล่นครบทุกเพลงในคิวแล้ว';
        return;
      }
      throw new Error(result.error || 'เล่นคิวไม่สำเร็จ');
    }

    const song = result.song;
    if (!queuePlayback.active) return;
    if (!song?.preview) {
      document.getElementById('queueStatus').textContent = `${song?.title || 'เพลงนี้'} ไม่มีตัวอย่างเสียง กำลังข้ามไปเพลงถัดไป…`;
      queuePlayback.loading = false;
      await loadDashboard();
      return playNextQueuedTrack();
    }

    const player = document.getElementById('previewAudio');
    document.getElementById('modalPreview').pause();
    player.pause();
    player.src = getPreviewUrl(song);
    player.load();
    document.getElementById('previewTitle').textContent = song.title;
    document.getElementById('previewArtist').textContent = song.artist;
    document.getElementById('previewPlayer').hidden = false;
    document.getElementById('queueStatus').textContent = `กำลังเล่น: ${song.title} · เพลงถัดไปจะเริ่มอัตโนมัติ`;
    await player.play();
    await loadDashboard();
  } catch (error) {
    queuePlayback.active = false;
    document.getElementById('queueStatus').textContent = 'เล่นคิวหยุดชั่วคราว · กดเริ่มเล่นคิวอีกครั้ง';
    showError(`เล่นคิวไม่สำเร็จ: ${error.message}`);
  } finally {
    queuePlayback.loading = false;
  }
}

function stopQueuePlayback() {
  queuePlayback.active = false;
  document.getElementById('previewAudio').pause();
  document.getElementById('queueStatus').textContent = 'หยุดเล่นแล้ว · เพลงที่เหลือยังอยู่ในคิว';
}

document.getElementById('previewAudio').addEventListener('ended', () => {
  if (queuePlayback.active) playNextQueuedTrack();
});

document.getElementById('previewAudio').addEventListener('error', () => {
  if (!queuePlayback.active) return;
  queuePlayback.active = false;
  document.getElementById('queueStatus').textContent = 'เล่นเพลงไม่สำเร็จ · กดเริ่มเล่นคิวอีกครั้ง';
  showError('ไม่สามารถเล่นเพลงจากคิวได้ กรุณาลองใหม่อีกครั้ง');
});

async function undo() {
  try {
    const res = await fetch('/undo', { method: 'POST' });
    if (!res.ok) throw new Error((await res.json()).error);
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
}

document.querySelectorAll('[data-mood]').forEach((button) => {
  button.addEventListener('click', () => {
    state.mood = button.dataset.mood;
    document.querySelectorAll('[data-mood]').forEach((item) => {
      const selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    loadDashboard();
  });
});

window.addEventListener('load', loadDashboard);
