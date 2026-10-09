import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { ChatAccessService } from './chat-access.service.js';
import { ChatAuthController } from './chat-auth.controller.js';
import { ChatHistoryService } from './chat-history.service.js';
import { ChatMessageService } from './chat-message.service.js';
import { ChatMessagesController } from './chat-messages.controller.js';
import { ChatModerationController } from './chat-moderation.controller.js';
import { ChatModerationService } from './chat-moderation.service.js';
import { ChatEnrollmentGuard } from './guards/chat-enrollment.guard.js';
import { ChatMuteGuard } from './guards/chat-mute.guard.js';
import { ChatRateLimitGuard } from './guards/chat-rate-limit.guard.js';
import { PusherRealtimeProvider } from './realtime/pusher-realtime.provider.js';
import { RealtimeProvider } from './realtime/realtime-provider.js';

@Module({
  imports: [AuthModule],
  controllers: [
    ChatAuthController,
    ChatMessagesController,
    ChatModerationController,
  ],
  providers: [
    ChatAccessService,
    ChatHistoryService,
    ChatMessageService,
    ChatModerationService,
    ChatEnrollmentGuard,
    ChatRateLimitGuard,
    ChatMuteGuard,
    // Swap the adapter here (e.g. an Ably one) without touching callers.
    { provide: RealtimeProvider, useClass: PusherRealtimeProvider },
  ],
  exports: [ChatAccessService, RealtimeProvider],
})
export class ChatModule {}
