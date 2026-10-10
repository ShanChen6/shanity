import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, SessionGuard } from '../../auth/auth.guards.js';
import { ChatHistoryService } from './chat-history.service.js';
import { ChatMessageService } from './chat-message.service.js';
import { ChatHistoryQueryDto, SendChatMessageDto } from './chat.dto.js';
import {
  ChatEnrollmentGuard,
  type ChatRequest,
} from './guards/chat-enrollment.guard.js';
import { ChatMuteGuard } from './guards/chat-mute.guard.js';
import { ChatRateLimitGuard } from './guards/chat-rate-limit.guard.js';

/** A course's chat room over HTTP. Members only (ChatEnrollmentGuard). */
@Controller('api/v1/courses/:courseId/chat')
@UseGuards(OriginGuard, SessionGuard, ChatEnrollmentGuard)
export class ChatMessagesController {
  constructor(
    private readonly history: ChatHistoryService,
    private readonly messages: ChatMessageService,
  ) {}

  /** History by cursor; see ChatHistoryQueryDto for the two directions. */
  @Get('messages')
  @Header('Cache-Control', 'no-store')
  list(
    @Req() req: ChatRequest,
    @Param('courseId') courseId: string,
    @Query() query: ChatHistoryQueryDto,
  ) {
    return this.history.page(courseId, req.chatMember, query);
  }

  /**
   * Muted members are refused before the flood limit is consulted, so a
   * refused attempt never spends their budget.
   */
  @Post('messages')
  @UseGuards(ChatMuteGuard, ChatRateLimitGuard)
  @Header('Cache-Control', 'no-store')
  send(
    @Req() req: ChatRequest,
    @Param('courseId') courseId: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.messages.send(courseId, req.chatMember, dto.content);
  }

  /** The caller's role in the room and whether they are muted. */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() req: ChatRequest, @Param('courseId') courseId: string) {
    return this.messages.me(courseId, req.chatMember);
  }
}
