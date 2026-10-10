import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  OriginGuard,
  Roles,
  SessionGuard,
  cookie,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { AuthService } from '../../auth/auth.service.js';
import {
  AdminCommentQueryDto,
  CommentDecisionDto,
  CommentListQueryDto,
  CreateCommentDto,
} from './blog.dto.js';
import { CommentsService } from './comments.service.js';

/** Comments on a published post. Reading is public; writing needs a session. */
@Controller('api/v1/blog/posts/:slug/comments')
export class BlogCommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Answers 200 whatever the verdict: the body says whether the comment
   * was published, held for review or rejected (and why).
   */
  @Post()
  @UseGuards(OriginGuard, SessionGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  submit(
    @Req() req: AuthRequest,
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.submit(req.principal, slug, dto.content);
  }

  /** Per viewer (their own pending ones), so never cached. */
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Req() req: Request,
    @Param('slug') slug: string,
    @Query() query: CommentListQueryDto,
  ) {
    const viewer = await this.auth
      .authenticate(cookie(req, this.auth.config.cookieName('access')))
      .catch(() => null);
    return this.comments.list(slug, viewer?.id ?? null, query.page);
  }
}

/**
 * The comments the pipeline held back (or got wrong), for admins.
 * Served at /api/v1/admin/comments (aliases in api-v1-routes.ts).
 */
@Controller('admin/comments')
@UseGuards(OriginGuard, SessionGuard)
@Roles('admin')
export class AdminCommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  queue(@Query() query: AdminCommentQueryDto) {
    return this.comments.queue(query);
  }

  @Patch(':id/approve')
  @Header('Cache-Control', 'no-store')
  approve(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CommentDecisionDto,
  ) {
    return this.comments.approve(req.principal, id, dto.reason);
  }

  @Patch(':id/reject')
  @Header('Cache-Control', 'no-store')
  reject(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CommentDecisionDto,
  ) {
    return this.comments.reject(req.principal, id, dto.reason);
  }
}
