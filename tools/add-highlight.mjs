#!/usr/bin/env node
// Add a highlight to the Competition Highlights page (the weekly manual way, until the Instagram sync is on).
//   node tools/add-highlight.mjs --video ~/Downloads/reel.mp4 --title "Wallace" --tag "Gi" --date 2026-11-20 --link https://www.instagram.com/reel/XXXX/
// --tag: Gi, No-Gi, "Gi · Juniors", "Gi · Kids" (drives the page filters)   --start: second the 6 s preview loop starts (default 3)
// --keep 40: how many highlights to keep (oldest ones beyond that are removed, with their files)
// Makes media/reels/<id>.mp4 (720 px, with sound), <id>-loop.mp4 (6 s silent preview) and <id>.jpg, then puts the item at the top of data/highlights.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const a = {}; process.argv.slice(2).forEach((v, i, all) => { if (v.startsWith('--')) a[v.slice(2)] = all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true; });
if (!a.video || !a.title) { console.error('Usage: node tools/add-highlight.mjs --video file.mp4 --title "Name" [--tag Gi] [--date 2026-11-20] [--link instagram-url] [--start 3]'); process.exit(1); }
const src = String(a.video).replace(/^~(?=$|\/)/, os.homedir());
if (!fs.existsSync(src)) { console.error('Video not found: ' + src); process.exit(1); }
const date = a.date && a.date !== true ? a.date : new Date().toISOString().slice(0, 10);
const start = +(a.start || 3), keep = +(a.keep || 40);

const file = path.join(ROOT, 'data/highlights.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const id = 'h' + date.replace(/-/g, '') + '-' + String(a.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
const out = n => path.join(ROOT, 'media/reels', n);
const ff = args => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const E = ['-movflags', '+faststart', '-pix_fmt', 'yuv420p'];
ff(['-ss', String(start), '-t', '6', '-i', src, '-vf', 'scale=360:-2', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', ...E, out(`${id}-loop.mp4`)]);
ff(['-i', src, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-c:a', 'aac', '-b:a', '96k', ...E, out(`${id}.mp4`)]);
ff(['-ss', String(start), '-i', src, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', out(`${id}.jpg`)]);

data.items = data.items.filter(x => x.id !== id);
data.items.unshift({ id, title: String(a.title), tag: a.tag && a.tag !== true ? String(a.tag) : 'Gi', date, video: `media/reels/${id}.mp4`, loop: `media/reels/${id}-loop.mp4`, poster: `media/reels/${id}.jpg`, permalink: a.link && a.link !== true ? String(a.link) : null });
// trim the oldest, but never delete the 14 original site reels (r01–r14): the home page and Clients page use them
const dropped = data.items.splice(keep);
for (const x of dropped.filter(x => !/^r\d\d$/.test(x.id))) {
  for (const f of [`${x.id}.mp4`, `${x.id}-loop.mp4`, `${x.id}.jpg`]) fs.rmSync(out(f), { force: true });
}
data.updated = new Date().toISOString().slice(0, 10);
data.source = data.source === 'instagram' ? 'instagram' : 'manual';
fs.writeFileSync(file, JSON.stringify(data, null, 1));
console.log(`Added "${a.title}" as ${id}. ${data.items.length} highlights on the page.${dropped.length ? ` Removed ${dropped.length} old one(s).` : ''}\nNext: publish (see GUIDE.md, "Publish a change").`);
