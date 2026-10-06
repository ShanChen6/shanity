import { ForbiddenException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class MediaUrlSigner {
  constructor(
    private readonly secret = process.env.MEDIA_SIGNING_SECRET ??
      process.env.JWT_SECRET ??
      '',
  ) {
    if (Buffer.byteLength(secret) < 32)
      throw new Error('MEDIA_SIGNING_SECRET must contain at least 32 bytes');
  }

  sign(filePath: string, expires: number) {
    return createHmac('sha256', this.secret)
      .update(`${filePath}:${expires}`)
      .digest('base64url');
  }

  verify(filePath: string, expires: number, signature: string) {
    if (!Number.isInteger(expires) || expires < Math.floor(Date.now() / 1000))
      throw new ForbiddenException('Media URL has expired');
    const expected = Buffer.from(this.sign(filePath, expires));
    const supplied = Buffer.from(signature);
    if (
      expected.length !== supplied.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new ForbiddenException('Invalid media signature');
  }
}
