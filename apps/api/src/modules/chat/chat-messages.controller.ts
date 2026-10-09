import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SessionGuard } from '../../auth/auth.guards.js';
import { ChatHistoryService } from './chat-history.service.js';
import { ChatHistoryQueryDto } from './chat.dto.js';
import {
  ChatEnrollmentGuard,
  type ChatRequest,
} from './guards/chat-enrollment.guard.js';

/** A course's chat room over HTTP. Members only (ChatEnrollmentGuard). */
@Controller('api/v1/courses/:courseId/chat')
@UseGuards(SessionGuard, ChatEnrollmentGuard)
export class ChatMessagesController {
  constructor(private readonly history: ChatHistoryService) {}

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
}
