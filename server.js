const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const ffmpegPath = require('ffmpeg-static');
const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());
app.use(express.static('public'));

const API_URL = 'https://itunes.apple.com/search';
let songs = [];
const songCatalog = new Map();
const previewJobs = new Map();
const previewCacheDirectory = path.join(os.tmpdir(), 'music-mood-explorer-previews');

const fallbackSongs = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fallbackSongs.json'), 'utf8')
);
function normalizeSong(song, mood = 'chill', fallbackIndex = 0) {
  return {
    id: song.trackId || `${song.artistId || 'song'}-${fallbackIndex}`,
    title: song.trackName || 'Untitled Track',
    artist: song.artistName || 'Unknown Artist',
    album: song.collectionName || 'Unknown Album',
    genre: song.primaryGenreName || 'Music',
    image: song.artworkUrl100 || 'https://placehold.co/100x100/0f172a/ffffff?text=Music',
    preview: song.previewUrl || '',
    url: song.trackViewUrl || '#',
    duration: song.trackTimeMillis || 0,
    price: song.trackPrice || 0,
    mood,
  };
}

async function loadSongs(mood = 'chill') {
  const query = encodeURIComponent(mood || 'chill');
  const url = `${API_URL}?term=${query}&media=music&entity=song&limit=20`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('API ตอบ status ' + res.status);

    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];

    songs = results.map((song, index) => normalizeSong(song, mood, index));
    songs.forEach(song => songCatalog.set(String(song.id), song));

    if (songs.length === 0) {
      throw new Error('ไม่มีรายการเพลงสำหรับ mood นี้');
    }

    console.log(`✅ โหลดเพลงจาก iTunes สำเร็จ: ${songs.length} เพลง (${mood})`);
  } catch (error) {
    songs = fallbackSongs.map((song, index) => ({
      id: song.id || index + 1,
      title: song.title || 'Untitled Track',
      artist: song.artist || 'Unknown Artist',
      album: song.album || 'Unknown Album',
      genre: song.genre || 'Music',
      image: song.image || 'https://placehold.co/100x100/0f172a/ffffff?text=Music',
      preview: song.preview || '',
      url: song.url || '#',
      duration: song.duration || 180000,
      price: song.price || 0,
      mood: song.mood || mood,
    }));
    songs.forEach(song => songCatalog.set(String(song.id), song));

    console.log(`⚠️ ใช้ข้อมูลสำรองแทน (${error.message})`);
  }
}

function selectionSort(arr) {
  const a = [...arr];
  for (let i = 0; i < a.length - 1; i++) {
    let maxIdx = i;
    for (let j = i + 1; j < a.length; j++) {
      if ((a[j].duration || 0) > (a[maxIdx].duration || 0)) maxIdx = j;
    }
    [a[i], a[maxIdx]] = [a[maxIdx], a[i]];
  }
  return a;
}

function insertionSort(arr) {
  const a = [...arr];
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= 0 && (a[j].duration || 0) < (key.duration || 0)) {
      a[j + 1] = a[j];
      j--;
    }
    a[j + 1] = key;
  }
  return a;
}

function bubbleSort(arr) {
  const a = [...arr];
  for (let i = 0; i < a.length - 1; i++) {
    for (let j = 0; j < a.length - 1 - i; j++) {
      if ((a[j].duration || 0) < (a[j + 1].duration || 0)) {
        [a[j], a[j + 1]] = [a[j + 1], a[j]];
      }
    }
  }
  return a;
}

app.get('/moods', (req, res) => {
  res.json({
    moods: [
      { key: 'chill', label: 'Chill' },
      { key: 'happy', label: 'Happy' },
      { key: 'sad', label: 'Sad' },
      { key: 'focus', label: 'Focus' },
      { key: 'energy', label: 'Energy' },
    ]
  });
});

app.get('/songs', async (req, res) => {
  const mood = req.query.mood || 'chill';
  const algo = req.query.sort || 'selection';
  const t0 = performance.now();

  await loadSongs(mood);

  let sorted;
  if (algo === 'insertion') sorted = insertionSort(songs);
  else if (algo === 'bubble') sorted = bubbleSort(songs);
  else sorted = selectionSort(songs);

  const ms = (performance.now() - t0).toFixed(3);
  res.json({ mood, algorithm: algo, count: sorted.length, ms, data: sorted });
});

async function getMp3Preview(song) {
  const cachePath = path.join(previewCacheDirectory, `${encodeURIComponent(String(song.id))}.mp3`);
  try {
    await fs.promises.access(cachePath);
    return cachePath;
  } catch {}

  if (previewJobs.has(song.id)) return previewJobs.get(song.id);

  const job = (async () => {
    if (!ffmpegPath) throw new Error('ไม่พบ FFmpeg สำหรับแปลงเสียง');
    await fs.promises.mkdir(previewCacheDirectory, { recursive: true });
    const tempPath = `${cachePath}.${process.pid}.tmp`;
    const upstream = await fetch(song.preview);
    if (!upstream.ok || !upstream.body) throw new Error('ดาวน์โหลดตัวอย่างเพลงไม่สำเร็จ');

    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-vn',
      '-codec:a', 'libmp3lame', '-q:a', '5', '-f', 'mp3', tempPath,
    ], { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffmpegError = '';
    ffmpeg.stderr.on('data', chunk => { ffmpegError += chunk.toString(); });
    const conversion = new Promise((resolve, reject) => {
      ffmpeg.once('error', reject);
      ffmpeg.once('close', code => {
        if (code === 0) resolve();
        else reject(new Error(ffmpegError || `FFmpeg exited with code ${code}`));
      });
    });

    const inputStream = pipeline(Readable.fromWeb(upstream.body), ffmpeg.stdin);
    try {
      await Promise.all([inputStream, conversion]);
      await fs.promises.rename(tempPath, cachePath);
      return cachePath;
    } catch (error) {
      if (ffmpeg.exitCode === null && !ffmpeg.killed) ffmpeg.kill();
      await Promise.allSettled([inputStream, conversion]);
      await fs.promises.rm(tempPath, { force: true });
      throw error;
    }
  })();

  previewJobs.set(song.id, job);
  try {
    return await job;
  } finally {
    previewJobs.delete(song.id);
  }
}

app.get('/preview/:id', async (req, res) => {
  const song = songCatalog.get(req.params.id) || songs.find(item => String(item.id) === req.params.id);
  if (!song || !song.preview) return res.status(404).json({ error: 'ไม่พบตัวอย่างเพลงนี้' });

  try {
    const filePath = await getMp3Preview(song);
    const { size } = await fs.promises.stat(filePath);
    let start = 0;
    let end = size - 1;
    let status = 200;

    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      if (match[1] === '') {
        const suffixLength = Number(match[2]);
        start = Math.max(0, size - suffixLength);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (start >= size || start > end) return res.status(416).set('Content-Range', `bytes */${size}`).end();
      status = 206;
    }

    res.status(status);
    res.set({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1),
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=3600',
    });
    if (status === 206) res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);

    const audio = fs.createReadStream(filePath, { start, end });
    audio.on('error', error => {
      if (!res.destroyed) res.destroy(error);
    });
    audio.pipe(res);
  } catch (error) {
    console.error(`⚠️ แปลงตัวอย่างเพลงไม่สำเร็จ (${song.title}): ${error.message}`);
    if (!res.headersSent) res.status(502).json({ error: 'ไม่สามารถโหลดตัวอย่างเพลงได้' });
    else res.destroy(error);
  }
});

class Queue {
  constructor() { this.items = []; }
  enqueue(item) { this.items.push(item); }
  dequeue() { return this.items.shift(); }
  peek() { return this.items[0]; }
  size() { return this.items.length; }
  isEmpty() { return this.items.length === 0; }
}

const watchlist = new Queue();

app.get('/watchlist', (req, res) => {
  res.json({ items: watchlist.items, size: watchlist.size(), next: watchlist.peek() || null });
});

app.post('/watchlist', (req, res) => {
  const song = songs.find(item => item.id === Number(req.body.id));
  if (!song) return res.status(404).json({ error: 'ไม่พบเพลงที่เลือก' });

  watchlist.enqueue(song);
  history.push({ action: 'ADD', song, time: new Date().toLocaleTimeString('th-TH') });

  res.status(201).json({ message: `เพิ่ม ${song.title} เข้าคิวแล้ว`, size: watchlist.size() });
});

app.delete('/watchlist/process', (req, res) => {
  if (watchlist.size() === 0) return res.status(400).json({ error: 'คิวว่าง' });

  const song = watchlist.dequeue();
  history.push({ action: 'WATCH', song, time: new Date().toLocaleTimeString('th-TH') });

  res.json({ message: `กำลังฟัง ${song.title} แล้ว`, song, size: watchlist.size() });
});

class Stack {
  constructor() { this.items = []; }
  push(item) { this.items.push(item); }
  pop() { return this.items.pop(); }
  peek() { return this.items[this.items.length - 1]; }
  isEmpty() { return this.items.length === 0; }
  display() { return [...this.items].reverse(); }
}

const history = new Stack();

app.get('/history', (req, res) => {
  res.json({ history: history.display(), size: history.items.length });
});

app.post('/undo', (req, res) => {
  if (history.isEmpty()) return res.status(400).json({ error: 'ไม่มีอะไรให้ย้อนกลับ' });

  const last = history.pop();

  if (last.action === 'ADD') {
    watchlist.items.pop();
  } else if (last.action === 'WATCH') {
    watchlist.items.unshift(last.song);
  }

  res.json({ message: `ย้อน ${last.action} ของ ${last.song.title} แล้ว`, size: watchlist.size() });
});

loadSongs();

if (require.main === module) {
  const startServer = (port) => {
    const server = app.listen(port, () => {
      console.log(`🚀 http://localhost:${port}`);
    });

    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        console.log(`⚠️ Port ${port} ถูกใช้งานอยู่ กำลังลอง ${nextPort}`);
        startServer(nextPort);
      } else {
        throw error;
      }
    });
  };

  startServer(PORT);
}

module.exports = app;
