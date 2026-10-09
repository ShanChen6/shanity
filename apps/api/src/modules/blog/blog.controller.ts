import {
  Body,
  Controller,
  Delete,
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
import {
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import { BlogCategoriesService } from './blog-categories.service.js';
import { BlogPostsService } from './blog-posts.service.js';
import { PublicBlogService } from './public-blog.service.js';
import {
  BlogReviewNoteDto,
  CreateBlogCategoryDto,
  CreateBlogPostDto,
  ListBlogPostsQueryDto,
  PublicBlogQueryDto,
  RejectBlogPostDto,
  UpdateBlogPostDto,
} from './blog.dto.js';

const uuid = () => new ParseUUIDPipe();

/**
 * Writing for the tech blog: instructors and admins author, admins review.
 * Workflow: DRAFT --submit--> PENDING_REVIEW --publish--> PUBLISHED, with
 * withdraw (author) and reject (admin) back to DRAFT, and hide (admin).
 */
@Controller('api/v1/blog/posts')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class BlogPostsController {
  constructor(private readonly posts: BlogPostsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() req: AuthRequest, @Body() dto: CreateBlogPostDto) {
    return this.posts.create(req.principal, dto);
  }

  /** Instructors: their own posts. Admins: everyone's (or `mine=true`). */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Query() query: ListBlogPostsQueryDto) {
    return this.posts.list(req.principal, query);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.posts.get(req.principal, id);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateBlogPostDto,
  ) {
    return this.posts.update(req.principal, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.posts.remove(req.principal, id);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  submit(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.posts.submit(req.principal, id);
  }

  @Post(':id/withdraw')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  withdraw(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.posts.withdraw(req.principal, id);
  }

  @Post(':id/publish')
  @Roles('admin')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  publish(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: BlogReviewNoteDto,
  ) {
    return this.posts.publish(req.principal, id, dto.note);
  }

  @Post(':id/reject')
  @Roles('admin')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  reject(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: RejectBlogPostDto,
  ) {
    return this.posts.reject(req.principal, id, dto.note);
  }

  @Post(':id/hide')
  @Roles('admin')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  hide(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: BlogReviewNoteDto,
  ) {
    return this.posts.hide(req.principal, id, dto.note);
  }
}

/** Blog topics: readable by anyone, created by admins. */
@Controller('api/v1/blog/categories')
export class BlogCategoriesController {
  constructor(private readonly categories: BlogCategoriesService) {}

  @Get()
  list() {
    return this.categories.list();
  }

  @Post()
  @UseGuards(OriginGuard, SessionGuard)
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateBlogCategoryDto) {
    return this.categories.create(dto);
  }
}

/**
 * The public blog, at /public/blog and /api/v1/public/blog (aliases in
 * api-v1-routes.ts). Published posts only; short shared caching.
 */
@Controller('public/blog')
export class PublicBlogController {
  constructor(private readonly blog: PublicBlogService) {}

  @Get('posts')
  @Header('Cache-Control', 'public, max-age=60')
  list(@Query() query: PublicBlogQueryDto) {
    return this.blog.list(query);
  }

  @Get('posts/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  get(@Param('slug') slug: string) {
    return this.blog.get(slug);
  }

  @Get('sitemap')
  @Header('Cache-Control', 'public, max-age=300')
  sitemap() {
    return this.blog.sitemap();
  }
}
