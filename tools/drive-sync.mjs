#!/usr/bin/env node
// Google Drive → Competition Highlights. Runs in GitHub Actions (.github/workflows/drive.yml) every hour.
// The client drops his reels into one shared Google Drive folder ("Anyone with the link can view").
// For each new video it makes the 720 px video, the 6 s silent preview loop and the poster in media/drive/,
// and puts it at the top of data/highlights.json. A video deleted from the folder leaves the site on the next run.
//
// File names drive the card:  "Wallace.mp4" → title Wallace, tag Gi.
//   Put nogi / kids / juniors anywhere in the name for the tag: "Isa juniors.mp4" → "Gi · Juniors", "Pouya nogi.mov" → "No-Gi".
//   An Instagram link can't go in a file name, so cards from Drive have no "watch on Instagram" link.
// Env: DRIVE_FOLDER_ID (the id at the end of the folder's link), DRIVE_API_KEY (Google Cloud API key, Drive API only). Never printed.
// Test without Drive: DRIVE_FIXTURE=/path/to/folder of local videos.
// Options: --keep 40 (highlights kept on the page in total), --dry (no writes)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const KEEP = +arg('keep', 40), DRY = !!arg('dry', false);
const FOLDER = process.env.DRIVE_FOLDER_ID, KEY = process.env.DRIVE_API_KEY, FIXTURE = process.env.DRIVE_FIXTURE;
const MAX_BYTES = 2 * 1024 ** 3;
if (!FIXTURE && (!FOLDER || !KEY)) { console.error('Set DRIVE_FOLDER_ID and DRIVE_API_KEY (GitHub: Settings → Secrets → Actions).'); process.exit(1); }

const clean = s => String(s).replace(KEY || '\u0000', '***');
const API = 'https://www.googleapis.com/drive/v3/files';

async function listDrive() {
  if (FIXTURE) {
    return fs.readdirSync(FIXTURE).filter(n => /\.(mp4|mov|m4v|webm)$/i.test(n)).map(n => {
      const st = fs.statSync(path.join(FIXTURE, n));
      return { id: 'fx' + Buffer.from(n).toString('hex').slice(0, 16), name: n, createdTime: st.mtime.toISOString(), size: String(st.size), local: path.join(FIXTURE, n) };
    });
  }
  const files = []; let page = '';
  do {
    const q = encodeURIComponent(`'${FOLDER}' in parents and trashed = false and mimeType contains 'video/'`);
    const r = await fetch(`${API}?q=${q}&fields=nextPageToken,files(id,name,createdTime,size)&pageSize=200&key=${KEY}${page ? '&pageToken=' + page : ''}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Drive ${r.status}: ${clean(body?.error?.message || r.statusText)}. Is the folder shared as "Anyone with the link"?`);
    files.push(...(body.files || [])); page = body.nextPageToken || '';
  } while (page);
  return files;
}

async function download(f, to) {
  if (f.local) { fs.copyFileSync(f.local, to); return; }
  const r = await fetch(`${API}/${f.id}?alt=media&acknowledgeAbuse=true&key=${KEY}`);
  if (!r.ok) throw new Error(`Drive download ${r.status} for "${f.name}"`);
  const out = fs.createWriteStream(to);
  for await (const chunk of r.body) if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
  await new Promise((res, rej) => out.end(err => err ? rej(err) : res()));
}

function cardFrom(name) {
  const base = name.replace(/\.[^.]+$/, '');
  const low = base.toLowerCase();
  const tag = /no[\s_-]?gi/.test(low) ? 'No-Gi' : /\bkids?\b/.test(low) ? 'Gi · Kids' : /\bjuniors?\b/.test(low) ? 'Gi · Juniors' : 'Gi';
  const title = base.replace(/\bno[\s_-]?gi\b|\bkids?\b|\bjuniors?\b|\bgi\b/gi, ' ').replace(/[_]+/g, ' ').replace(/\s*[-–·(),]+\s*$/g, '').replace(/^\s*[-–·(),]+\s*/g, '').replace(/\s+/g, ' ').trim();
  return { title: title || 'Highlight', tag };
}

const ff = args => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const duration = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim() || 0;
const MEDIA = path.join(ROOT, 'media/drive');
const E = ['-movflags', '+faststart', '-pix_fmt', 'yuv420p'];

const file = path.join(ROOT, 'data/highlights.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const drive = await listDrive();
const inDrive = new Set(drive.map(f => f.id));
const have = new Set(data.items.filter(x => x.driveId).map(x => x.driveId));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-'));
if (!DRY) fs.mkdirSync(MEDIA, { recursive: true });

let added = 0;
for (const f of drive.filter(f => !have.has(f.id)).sort((a, b) => a.createdTime.localeCompare(b.createdTime))) {
  if (+f.size > MAX_BYTES) { console.log(`Skipped "${f.name}": over 2 GB. Export it smaller and re-upload.`); continue; }
  const { title, tag } = cardFrom(f.name);
  const id = 'd' + f.id.replace(/[^A-Za-z0-9]/g, '').slice(-12).toLowerCase();
  console.log(`New: "${f.name}" → ${title} (${tag})`);
  if (DRY) { added++; continue; }
  const src = path.join(tmp, id + path.extname(f.name));
  try {
    await download(f, src);
    const d = duration(src), start = String(Math.max(0, Math.min(3, d - 6)).toFixed(2));
    const out = n => path.join(MEDIA, n);
    ff(['-ss', start, '-t', '6', '-i', src, '-vf', 'scale=360:-2', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', ...E, out(`${id}-loop.mp4`)]);
    ff(['-i', src, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-c:a', 'aac', '-b:a', '96k', ...E, out(`${id}.mp4`)]);
    ff(['-ss', start, '-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', out(`${id}.jpg`)]);
  } catch (e) { console.log(`Could not process "${f.name}": ${clean(e.message)}`); continue; }
  finally { fs.rmSync(src, { force: true }); }
  data.items.unshift({ id, driveId: f.id, title, tag, date: f.createdTime.slice(0, 10), video: `media/drive/${id}.mp4`, loop: `media/drive/${id}-loop.mp4`, poster: `media/drive/${id}.jpg`, permalink: null });
  added++;
}

// deleted from the folder → off the site
const gone = data.items.filter(x => x.driveId && !inDrive.has(x.driveId));
data.items = data.items.filter(x => !(x.driveId && !inDrive.has(x.driveId)));
// newest first; the 14 original reels (r01–r14) keep their place after everything dated
data.items.sort((a, b) => String(b.date).localeCompare(String(a.date)));
const dropped = data.items.splice(KEEP).filter(x => !/^r\d\d$/.test(x.id));
for (const x of [...gone, ...dropped]) {
  console.log(`Removed "${x.title}"${gone.includes(x) ? ' (deleted from Drive)' : ' (over the limit)'}`);
  if (!DRY && x.driveId) for (const f of [x.video, x.loop, x.poster]) fs.rmSync(path.join(ROOT, f), { force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });

if (!added && !gone.length && !dropped.length) { console.log('Nothing new in the Drive folder.'); process.exit(0); }
data.updated = new Date().toISOString().slice(0, 10);
data.source = 'drive';
if (!DRY) fs.writeFileSync(file, JSON.stringify(data, null, 1));
console.log(`${added} added, ${gone.length + dropped.length} removed. ${data.items.length} highlights on the page.`);
