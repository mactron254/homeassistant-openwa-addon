'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { BOT_DATA_DIR } = require('./options');

const execFileAsync = promisify(execFile);

function extensionForMime(mimetype) {
  if (/ogg/i.test(mimetype)) return 'ogg';
  if (/mpeg|mp3/i.test(mimetype)) return 'mp3';
  if (/mp4|m4a/i.test(mimetype)) return 'm4a';
  if (/wav/i.test(mimetype)) return 'wav';
  if (/webm/i.test(mimetype)) return 'webm';
  return 'bin';
}

async function prepareAudio(media) {
  if (!media?.data) throw new Error('Audio sin datos');
  const tmpDir = path.join(BOT_DATA_DIR, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const input = path.join(tmpDir, `${id}.${extensionForMime(media.mimetype || '')}`);
  const output = path.join(tmpDir, `${id}.flac`);
  fs.writeFileSync(input, Buffer.from(media.data, 'base64'));
  const duration = await probeDuration(input);
  await execFileAsync('ffmpeg', ['-y', '-i', input, '-ar', '16000', '-ac', '1', '-map', '0:a:0', '-c:a', 'flac', output]);
  return { input, output, duration };
}

async function probeDuration(filePath) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = Number(stdout.trim());
  return Number.isFinite(duration) ? duration : 0;
}

function cleanupAudio(prepared) {
  for (const file of [prepared?.input, prepared?.output]) {
    if (file) fs.rmSync(file, { force: true });
  }
}

module.exports = {
  prepareAudio,
  cleanupAudio,
};
