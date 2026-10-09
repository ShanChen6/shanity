import {
  Body,
  Controller,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  OriginGuard,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { ChatModerationService } from './chat-moderation.service.js';
import {
  HideChatMessageDto,
  MuteChatUserDto,
  ReportChatMessageDto,
} from './chat.dto.js';

/** Reporting (members) and moderation (course teachers and admins). */
@Controller('api/v1/chat')
@UseGuards(OriginGuard, SessionGuard)
export class ChatModerationController {
  constructor(private readonly moderation: ChatModerationService) {}

  @Post('messages/:id/report')
  @Header('Cache-Control', 'no-store')
  report(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReportChatMessageDto,
  ) {
    return this.moderation.report(req.principal, id, dto.reason);
  }

  @Patch('messages/:id/hide')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  hide(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: HideChatMessageDto,
  ) {
    return this.moderation.hide(req.principal, id, dto.reason);
  }

  @Post('users/:userId/mute')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  mute(
    @Req() req: AuthRequest,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: MuteChatUserDto,
  ) {
    return this.moderation.mute(req.principal, userId, dto);
  }
}
