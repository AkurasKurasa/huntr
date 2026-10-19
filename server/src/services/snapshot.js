import { adminClient } from '../lib/supabase.js';
import { assertSafeUrl } from './crawler.js';

const BUCKET = 'job-snapshots';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/** Downloads the post's image (public http(s) only, ≤ 5 MB, real image types only). */
export async function downloadImage(rawUrl, { timeoutMs = 10000 } = {}) {
  const url = assertSafeUrl(rawUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { accept: 'image/*' } });
    if (!res.ok) throw new Error(`Image answered HTTP ${res.status}`);
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES[contentType]) throw new Error(`Not a supported image (${contentType || 'unknown type'})`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('Image is larger than 5 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('Image is larger than 5 MB');
    return { buffer: buf, contentType, ext: TYPES[contentType] };
  } finally {
    clearTimeout(timer);
  }
}

/** Saves the image to Supabase Storage under <user>/<application>.<ext>. Returns the storage path. */
export async function saveSnapshotImage(userId, applicationId, imageUrl) {
  const img = await downloadImage(imageUrl);
  const path = `${userId}/${applicationId}.${img.ext}`;
  const { error } = await adminClient().storage.from(BUCKET).upload(path, img.buffer, { contentType: img.contentType, upsert: true });
  if (error) throw error;
  return path;
}

export async function deleteSnapshotImage(path) {
  if (!path) return;
  await adminClient().storage.from(BUCKET).remove([path]);
}
