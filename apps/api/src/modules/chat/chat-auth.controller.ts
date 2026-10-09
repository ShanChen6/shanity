import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { ChatAuthDto } from './chat.dto.js';
import {
  ChatEnrollmentGuard,
  type ChatRequest,
} from './guards/chat-enrollment.guard.js';
import { RealtimeProvider } from './realtime/realtime-provider.js';

/**
 * Channel authorization for the real-time provider. The client SDK calls this
 * before subscribing; only a signature from here lets a socket into
 * `presence-course-<courseId>`, and ChatEnrollmentGuard only lets members of
 * that course get one.
 *
 * Lives natively under /api/v1 (not an alias), so the response is the bare
 * `{ auth, channel_data }` the SDK expects, without the standard envelope.
 */
@Controller('api/v1/chat')
@UseGuards(OriginGuard, SessionGuard)
export class ChatAuthController {
  constructor(private readonly realtime: RealtimeProvider) {}

  @Post('auth')
  @UseGuards(ChatEnrollmentGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  authorize(@Req() req: ChatRequest, @Body() dto: ChatAuthDto) {
    if (!this.realtime.isAvailable())
      throw new ServiceUnavailableException({
        statusCode: 503,
        message: 'CHAT_REALTIME_UNAVAILABLE',
        code: 'CHAT_REALTIME_UNAVAILABLE',
      });
    return this.realtime.authorizePresenceChannel(
      dto.socket_id,
      dto.channel_name,
      req.chatMember,
    );
  }
}
