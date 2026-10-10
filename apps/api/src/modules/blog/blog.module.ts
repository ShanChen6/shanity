import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module.js';
import { BlogCategoriesService } from './blog-categories.service.js';
import {
  BlogCategoriesController,
  BlogPostsController,
  PublicBlogController,
} from './blog.controller.js';
import { BlogPostsService } from './blog-posts.service.js';
import { PublicBlogService } from './public-blog.service.js';
import {
  AdminCommentsController,
  BlogCommentsController,
} from './comments.controller.js';
import { CommentsService } from './comments.service.js';
import { classifierFromEnv } from './moderation/classifier.factory.js';
import { CommentModerationService } from './moderation/comment-moderation.service.js';
import {
  commentRulesFromEnv,
  CommentRules,
} from './moderation/comment-rules.js';
import {
  MODERATION_HTTP_FETCH,
  ToxicityClassifier,
  type FetchLike,
} from './moderation/toxicity-classifier.js';

@Module({
  imports: [AuthModule],
  controllers: [
    BlogPostsController,
    BlogCategoriesController,
    PublicBlogController,
    BlogCommentsController,
    AdminCommentsController,
  ],
  providers: [
    BlogPostsService,
    BlogCategoriesService,
    PublicBlogService,
    CommentsService,
    CommentModerationService,
    { provide: CommentRules, useFactory: () => commentRulesFromEnv() },
    {
      provide: MODERATION_HTTP_FETCH,
      useValue: globalThis.fetch.bind(globalThis),
    },
    {
      provide: ToxicityClassifier,
      inject: [MODERATION_HTTP_FETCH],
      useFactory: (fetch: FetchLike) => classifierFromEnv(fetch),
    },
  ],
})
export class BlogModule {}
