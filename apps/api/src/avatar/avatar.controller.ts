import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AuthRateGuard,
  OriginGuard,
  SessionGuard,
  type AuthRequest,
} from '../auth/auth.guards.js';
import { AvatarService, MAX_AVATAR_BYTES } from './avatar.service.js';
import { AvatarStorage } from './avatar-storage.js';

@Controller('users/me/avatar')
@UseGuards(OriginGuard, SessionGuard, AuthRateGuard)
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  uploadAvatar(
    @Req() req: AuthRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (Object.keys(req.body ?? {}).length)
      throw new BadRequestException('Unexpected fields');
    return this.avatars.upload(req.principal.id, file);
  }

  @Delete()
  @Header('Cache-Control', 'no-store')
  removeAvatar(@Req() req: AuthRequest) {
    if (Object.keys(req.body ?? {}).length)
      throw new BadRequestException('Unexpected fields');
    return this.avatars.remove(req.principal.id);
  }
}

// Public, generated WebP objects only. No arbitrary filesystem/static root exposure.
@Controller('avatars')
export class AvatarFilesController {
  constructor(private readonly storage: AvatarStorage) {}
  @Get(':key')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  async image(@Param('key') key: string) {
    return new StreamableFile(await this.storage.read(key), {
      type: 'image/webp',
      disposition: 'inline',
    });
  }
}
