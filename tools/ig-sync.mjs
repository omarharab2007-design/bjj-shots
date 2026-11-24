#!/usr/bin/env node
// Instagram sync for the BJJ Shots site. Runs in GitHub Actions (.github/workflows/instagram.yml) every 6 hours.
//  1. Reads @bjj__shots's profile numbers (posts, followers) → data/instagram.json (the home page scoreboard reads it).
//  2. Reads his newest Reels, downloads each new one (Instagram's video links expire), makes the 720 px video,
//     the 6 s silent preview loop and the poster in media/ig/, and rewrites data/highlights.json (newest first).
// Env: IG_TOKEN, never printed. Either an Instagram-login token (graph.instagram.com) or a Facebook Login for Business
// token from the app's unified-login config (graph.facebook.com + the Instagram account it was granted). Detected automatically.
// Test without a token: IG_FIXTURE=fixture.json, a file shaped { profile: {...}, media: [...] } whose media_url values are local paths.
// Options: --keep 14 (how many synced reels the page keeps), --dry (no file writes)
// A reel whose caption has #nosite stays off the site. Caption line 1 = title; #nogi / #kids / #juniors set the tag.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > -1 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true) : d; };
const KEEP = +arg('keep', 14), DRY = !!arg('dry', false);
const TOKEN = process.env.IG_TOKEN, FIXTURE = process.env.IG_FIXTURE;
const IG_API = 'https://graph.instagram.com/v21.0', FB_API = 'https://graph.facebook.com/v21.0';
let API = IG_API, ME = 'me';
if (!TOKEN && !FIXTURE) { console.error('IG_TOKEN is not set (GitHub: Settings → Secrets → Actions → IG_TOKEN).'); process.exit(1); }

// never let the token reach a log line
const clean = s => String(s).replace(/access_token=[^&\s"]+/g, 'access_token=***').replace(TOKEN || '\u0000', '***');
async function get(pathAndQuery) {
  const url = pathAndQuery.startsWith('http') ? pathAndQuery : `${API}/${pathAndQuery}${pathAndQuery.includes('?') ? '&' : '?'}access_token=${encodeURIComponent(TOKEN)}`;
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url);
    const body = await r.json().catch(() => ({}));
    if (r.ok) return body;
    const msg = `Instagram API ${r.status}: ${clean(body?.error?.message || r.statusText)}`;
    if (attempt >= 3 || r.status === 400 || r.status === 401 || r.status === 403) throw new Error(msg);
    await new Promise(res => setTimeout(res, 4000 * attempt));
  }
}

// Which kind of token is it? Instagram-login tokens read graph.instagram.com/me. Unified-login (Facebook Login for
// Business) tokens read graph.facebook.com/<instagram account id>, found from the token's grants or his linked Page.
async function pickApi() {
  try { await get('me?fields=id'); return; } catch (e) { if (!/API 40[013]:/.test(e.message)) throw e; }
  API = FB_API;
  let id;
  try {
    const dbg = await get(`debug_token?input_token=${encodeURIComponent(TOKEN)}`);
    id = (dbg.data?.granular_scopes || []).filter(g => /^instagram_/.test(g.scope)).flatMap(g => g.target_ids || [])[0];
  } catch {}
  if (!id) {
    const acc = await get('me/accounts?fields=instagram_business_account');
    id = (acc.data || []).find(p => p.instagram_business_account)?.instagram_business_account.id;
  }
  if (!id) throw new Error('The token works on Facebook but has no Instagram account attached. Redo the login and tick @bjj__shots.');
  ME = id;
  console.log('Facebook-login token: reading the Instagram account through graph.facebook.com.');
}

async function readInstagram() {
  if (FIXTURE) return JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  await pickApi();
  const profile = await get(`${ME}?fields=id,username,followers_count,media_count`);
  const media = [];
  let page = await get(`${ME}/media?fields=id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp&limit=50`);
  for (let n = 0; ; n++) {
    media.push(...(page.data || []));
    const reels = media.filter(isReel).length;
    if (reels >= KEEP || !page.paging?.next || n >= 5) break;
    page = await get(page.paging.next);
  }
  return { profile, media };
}

const isReel = m => m.media_type === 'VIDEO' && (m.media_product_type === 'REELS' || !m.media_product_type) && m.media_url && !/#nosite\b/i.test(m.caption || '');

function titleOf(caption) {
  const line = String(caption || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  const t = line
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#@][\p{L}\p{N}_.]+/gu, '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️]/gu, '')
    .replace(/\s+/g, ' ').replace(/^[\s|·:–—-]+|[\s|·:–—-]+$/g, '').trim();
  if (!t) return 'Highlight';
  if (t.length <= 42) return t;
  const cut = t.slice(0, 42); return cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : 42).replace(/[,.;:]$/, '') + '…';
}
function tagOf(caption) {
  const c = String(caption || '').toLowerCase();
  const nogi = /#no-?gi\b|\bno-?gi\b/.test(c);
  const base = nogi ? 'No-Gi' : 'Gi';
  if (/#kids\b/.test(c)) return base + ' · Kids';
  if (/#juniors?\b/.test(c)) return base + ' · Juniors';
  return base;
}

const ff = args => execFileSync('ffmpeg', ['-nostdin', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
const E = ['-movflags', '+faststart', '-pix_fmt', 'yuv420p'];
const duration = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim() || 0;

async function download(src, dest) {
  if (FIXTURE && !/^https?:/.test(src)) return fs.copyFileSync(src, dest);
  const r = await fetch(src);
  if (!r.ok) throw new Error(`download failed (${r.status}) for media ${path.basename(dest)}`);
  fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

async function makeFiles(m, id, dir) {
  const tmp = path.join(os.tmpdir(), `${id}-src.mp4`);
  await download(m.media_url, tmp);
  const len = duration(tmp);
  const start = String(len > 12 ? 3 : 0);
  ff(['-ss', start, '-t', '6', '-i', tmp, '-vf', 'scale=360:-2', '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '30', ...E, path.join(dir, `${id}-loop.mp4`)]);
  ff(['-i', tmp, '-vf', "scale='min(720,iw)':-2", '-c:v', 'libx264', '-preset', 'medium', '-crf', '28', '-c:a', 'aac', '-b:a', '96k', ...E, path.join(dir, `${id}.mp4`)]);
  ff(['-ss', start, '-i', tmp, '-frames:v', '1', '-vf', 'scale=360:-2', '-q:v', '5', path.join(dir, `${id}.jpg`)]);
  fs.rmSync(tmp, { force: true });
}

const { profile, media } = await readInstagram();
const reels = media.filter(isReel).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp))).slice(0, KEEP);
console.log(`@${profile.username || 'account'}: ${profile.media_count} posts, ${profile.followers_count} followers, ${reels.length} reels to show`);
if (!reels.length) throw new Error('Instagram returned no reels. Keeping the last good highlights.');

const igDir = path.join(ROOT, 'media/ig');
if (!DRY) fs.mkdirSync(igDir, { recursive: true });
const items = [];
let made = 0;
for (const m of reels) {
  const id = 'ig' + m.id;
  const have = ['.mp4', '-loop.mp4', '.jpg'].every(s => fs.existsSync(path.join(igDir, id + s)));
  if (!have && !DRY) {
    try { await makeFiles(m, id, igDir); made++; }
    catch (e) { console.warn(`skipped reel ${m.id}: ${clean(e.message)}`); continue; }
  }
  items.push({ id, title: titleOf(m.caption), tag: tagOf(m.caption), date: String(m.timestamp).slice(0, 10), video: `media/ig/${id}.mp4`, loop: `media/ig/${id}-loop.mp4`, poster: `media/ig/${id}.jpg`, permalink: m.permalink || null });
}
if (!items.length) throw new Error('No reel could be processed. Keeping the last good highlights.');

const today = new Date().toISOString().slice(0, 10);
const highlights = { updated: today, source: 'instagram', note: 'Written by tools/ig-sync.mjs from Instagram every 6 hours. Edits here are overwritten; add #nosite to a caption to keep a reel off the site.', items };
const stats = { updated: today, username: profile.username || null, posts: profile.media_count ?? null, followers: profile.followers_count ?? null };

if (DRY) { console.log(JSON.stringify({ stats, items: items.slice(0, 3) }, null, 1)); process.exit(0); }
fs.writeFileSync(path.join(ROOT, 'data/highlights.json'), JSON.stringify(highlights, null, 1));
fs.writeFileSync(path.join(ROOT, 'data/instagram.json'), JSON.stringify(stats, null, 1));
// remove files of reels that left the list, so the repo stays small
const keepIds = new Set(items.map(x => x.id));
let removed = 0;
for (const f of fs.readdirSync(igDir)) {
  const id = f.replace(/(-loop)?\.(mp4|jpg)$/, '');
  if (!keepIds.has(id)) { fs.rmSync(path.join(igDir, f)); removed++; }
}
console.log(`${items.length} highlights (${made} new), ${removed} old file(s) removed.`);
