export const MEDIA_STORAGE_DRIVER = Symbol('MEDIA_STORAGE_DRIVER');

export const MEDIA_LIMITS = {
  avatar: 2 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  video: 2 * 1024 * 1024 * 1024,
} as const;

export function maxVideoBytes(environment = process.env) {
  const configured = environment.MAX_VIDEO_SIZE_MB;
  if (configured === undefined) return MEDIA_LIMITS.video;
  const megabytes = Number(configured);
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > 2048)
    throw new Error('MAX_VIDEO_SIZE_MB must be an integer between 1 and 2048');
  return megabytes * 1024 * 1024;
}

export const MEDIA_MIME_TYPES = {
  document: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
    'text/plain',
    'text/markdown',
  ],
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
} as const;
