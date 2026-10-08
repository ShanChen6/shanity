import { createHash } from 'node:crypto';

export type CloudinaryConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
};

/** Null while Cloudinary is not configured (uploads are then unavailable). */
export function cloudinaryConfig(
  env: NodeJS.ProcessEnv = process.env,
): CloudinaryConfig | null {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    env;
  return CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET
    ? {
        cloudName: CLOUDINARY_CLOUD_NAME,
        apiKey: CLOUDINARY_API_KEY,
        apiSecret: CLOUDINARY_API_SECRET,
      }
    : null;
}

/** Cloudinary's API signature: sha1 of the sorted `k=v&...` params + secret. */
export function signCloudinaryParams(
  params: Record<string, string | number>,
  apiSecret: string,
) {
  const payload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(payload + apiSecret)
    .digest('hex');
}

/** Whether `url` is a delivery URL of this Cloudinary account. */
export const isCloudinaryUrl = (url: string, cloudName: string) =>
  url.startsWith(`https://res.cloudinary.com/${cloudName}/`);
