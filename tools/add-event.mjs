#!/usr/bin/env node
// Add a competition to the photo gallery.
//   node tools/add-event.mjs --name "AJP Abu Dhabi Open" --date 2026-03-14 --place "Abu Dhabi" --dir ~/Pictures/ajp-ad
// Optional: --slug ajp-ad-2026  --cover IMG_0042.jpg  --sample (labels the event as sample frames)
// What it does:
//  - makes watermarked web previews (1600 px) and thumbnails (640 px) in media/gallery/<slug>/, with all EXIF/GPS removed
//  - adds or replaces the event in data/gallery.json (newest event first)
//  - writes tools/originals/<slug>.csv mapping each photo ID to the original file, so you know which full-res file to send.
//    Originals never go on the website. tools/originals/ is not deployed.
// Needs ffmpeg + ffprobe (brew install ffmpeg). HEIC is converted with macOS `sips` first.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => {
  if (v.startsWith('--')) a.push([v.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return a;
}, []));
const need = k => { if (!args[k] || args[k] === true) { console.error(`Missing --${k}. Example:\n  node tools/add-event.mjs --name "AJP Abu Dhabi Open" --date 2026-03-14 --place "Abu Dhabi" --dir ~/Pictures/ajp`); process.exit(1); } return args[k]; };
const name = need('name'), date = need('date'), place = args.place && args.place !== true ? args.place : '';
const dir = need('dir').replace(/^~(?=$|\/)/, os.homedir());
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('--date must look like 2026-03-14'); process.exit(1); }
const slug = (args.slug && args.slug !== true ? args.slug : `${name}-${date.slice(0, 4)}`).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const files = fs.readdirSync(dir).filter(f => /\.(jpe?g|png|webp|heic|tiff?)$/i.test(f) && !f.startsWith('.')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!files.length) { console.error('No photos found in ' + dir); process.exit(1); }

const out = path.join(ROOT, 'media/gallery', slug);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(ROOT, 'tools/originals'), { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bjj-'));
const LOGO = path.join(ROOT, 'logo.png');
const FONT = ['/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/Library/Fonts/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'].find(f => fs.existsSync(f));
const ff = a => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const probe = f => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', f]).toString().trim().split('x').map(Number);
const dt = (text, extra) => FONT ? `drawtext=fontfile='${FONT}':text='${text}':fontcolor=white@0.55:${extra}` : 'null';

const photos = [], csv = ['id,original'];
files.forEach((f, i) => {
  let src = path.join(dir, f);
  if (/\.heic$/i.test(f)) { const j = path.join(tmp, f + '.jpg'); execFileSync('sips', ['-s', 'format', 'jpeg', src, '--out', j], { stdio: 'ignore' }); src = j; }
  const id = `${slug}-${String(i + 1).padStart(3, '0')}`;
  const big = path.join(out, `${id}.jpg`), thumb = path.join(out, `${id}-t.jpg`);
  // preview: long edge 1600, logo watermark in the middle, ID + "preview" bands top and bottom
  const fc = [
    `[0:v]scale='if(gt(iw,ih),1600,-2)':'if(gt(iw,ih),-2,1600)':flags=lanczos,setsar=1[p]`,
    `[1:v]format=rgba,colorchannelmixer=aa=0.32[lg0]`, `[lg0][p]scale2ref=w='min(main_w,main_h)*0.74':h=ow/mdar[lg][pp]`,
    `[pp][lg]overlay=(W-w)/2:(H-h)/2[w1]`,
    `[w1]${dt(`BJJ SHOTS · PREVIEW · ${id.toUpperCase()}`, 'fontsize=h*0.022:x=(w-tw)/2:y=h-th-h*0.03:box=1:boxcolor=black@0.35:boxborderw=12')},${dt('BJJSHOTS.NET', 'fontsize=h*0.03:x=(w-tw)/2:y=h*0.06')}[o]`,
  ].join(';');
  ff(['-i', src, '-i', LOGO, '-filter_complex', fc, '-map', '[o]', '-map_metadata', '-1', '-frames:v', '1', '-q:v', '4', big]);
  ff(['-i', big, '-vf', "scale='if(gt(iw,ih),640,-2)':'if(gt(iw,ih),-2,640)':flags=lanczos", '-map_metadata', '-1', '-q:v', '5', thumb]);
  const [w, h] = probe(big);
  photos.push({ id, src: `media/gallery/${slug}/${id}.jpg`, thumb: `media/gallery/${slug}/${id}-t.jpg`, w, h });
  csv.push(`${id},"${path.join(dir, f).replace(/"/g, '""')}"`);
  process.stdout.write(`\r${i + 1}/${files.length} ${id}   `);
});
fs.rmSync(tmp, { recursive: true, force: true });

const coverIdx = args.cover && args.cover !== true ? Math.max(0, files.indexOf(args.cover)) : 0;
const gfile = path.join(ROOT, 'data/gallery.json');
const g = fs.existsSync(gfile) ? JSON.parse(fs.readFileSync(gfile, 'utf8')) : { events: [] };
g.events = g.events.filter(e => e.slug !== slug);
g.events.push({ slug, name, date, place, sample: !!args.sample, cover: photos[coverIdx].thumb, count: photos.length, photos });
g.events.sort((a, b) => b.date.localeCompare(a.date));
g.updated = new Date().toISOString().slice(0, 10);
fs.writeFileSync(gfile, JSON.stringify(g, null, 1));
fs.writeFileSync(path.join(ROOT, 'tools/originals', `${slug}.csv`), csv.join('\n') + '\n');
console.log(`\nAdded "${name}" (${photos.length} photos) as ${slug}.\n  previews: media/gallery/${slug}/\n  originals map: tools/originals/${slug}.csv\nNext: copy into deploy/ and push (see GUIDE.md).`);
