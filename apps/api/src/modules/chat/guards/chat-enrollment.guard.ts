import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthRequest } from '../../../auth/auth.guards.js';
import { ChatAccessService } from '../chat-access.service.js';
import { courseIdFromChannel } from '../chat-channels.js';
import type { ChatMember } from '../realtime/realtime-provider.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const body = (statusCode: number, code: string) => ({
  statusCode,
  message: code,
  code,
});

export type ChatRequest = AuthRequest & {
  chatMember: ChatMember;
  /** The course whose room `chatMember` belongs to. */
  chatCourseId: string;
};

/**
 * Zero-trust gate for every chat action, after SessionGuard: joining a room
 * (channel auth), reading its history and sending to it. The course comes
 * from the `:courseId` route param or, on the channel auth endpoint, from
 * the requested `channel_name`; membership is re-checked against the
 * database on each request (ChatAccessService). On success the caller's
 * room identity is on `req.chatMember`, the course on `req.chatCourseId`.
 */
@Injectable()
export class ChatEnrollmentGuard implements CanActivate {
  constructor(private readonly access: ChatAccessService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ChatRequest>();
    const courseId = this.courseIdOf(request);
    request.chatMember = await this.access.memberFor(
      request.principal.id,
      courseId,
    );
    request.chatCourseId = courseId;
    return true;
  }

  private courseIdOf(request: ChatRequest): string {
    const param = (request.params as Record<string, string | undefined>)
      .courseId;
    if (param !== undefined) {
      if (!UUID.test(param))
        throw new NotFoundException(body(404, 'COURSE_NOT_FOUND'));
      return param;
    }
    // Guards run before validation pipes: the body is still untrusted here.
    const channel = (request.body as Record<string, unknown> | undefined)
      ?.channel_name;
    if (typeof channel !== 'string')
      throw new BadRequestException(body(400, 'CHAT_CHANNEL_REQUIRED'));
    const courseId = courseIdFromChannel(channel);
    if (!courseId)
      throw new ForbiddenException(body(403, 'CHAT_CHANNEL_FORBIDDEN'));
    return courseId;
  }
}
