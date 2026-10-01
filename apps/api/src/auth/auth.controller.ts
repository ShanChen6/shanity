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
  Res,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangeUserRoleDto,
  ChangeUserStatusDto,
  ListUsersQueryDto,
  LoginDto,
  ProfileDto,
  RegisterDto,
} from './auth.dto.js';
import {
  AuthRateGuard,
  cookie,
  OriginGuard,
  Roles,
  SessionGuard,
  type AuthRequest,
} from './auth.guards.js';
import { OAuthRedirectFilter } from './oauth-redirect.filter.js';
import { GoogleService } from './google.service.js';

@Controller('auth')
@UseGuards(OriginGuard, AuthRateGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly google: GoogleService,
  ) {}
  private write(res: Response, tokens: { access: string; refresh: string }) {
    const config = this.auth.config;
    res.cookie(
      config.cookieName('access'),
      tokens.access,
      config.cookieOptions(config.accessSeconds),
    );
    res.cookie(
      config.cookieName('refresh'),
      tokens.refresh,
      config.cookieOptions(config.refreshSeconds),
    );
    return { authenticated: true };
  }
  @Post('register')
  @Header('Cache-Control', 'no-store')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.write(res, await this.auth.register(dto));
  }
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.write(res, await this.auth.login(dto));
  }
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.write(
      res,
      await this.auth.refresh(
        cookie(req, this.auth.config.cookieName('refresh')),
      ),
    );
  }
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(cookie(req, this.auth.config.cookieName('refresh')));
    for (const kind of ['access', 'refresh'] as const)
      res.clearCookie(
        this.auth.config.cookieName(kind),
        this.auth.config.cookieOptions(0),
      );
  }
  @Get('google')
  @UseFilters(OAuthRedirectFilter)
  async googleLogin(@Res() res: Response) {
    const flow = await this.google.start();
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(
      this.auth.config.cookieName('oauth'),
      flow.browser,
      this.auth.config.cookieOptions(600),
    );
    res.redirect(flow.url);
  }
  @Post('google/link')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async googleLink(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const flow = await this.google.start(req.principal.sessionId);
    res.setHeader('Cache-Control', 'no-store');
    res.cookie(
      this.auth.config.cookieName('oauth'),
      flow.browser,
      this.auth.config.cookieOptions(600),
    );
    return { url: flow.url };
  }
  @Get('google/callback')
  @UseFilters(OAuthRedirectFilter)
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const browser = cookie(req, this.auth.config.cookieName('oauth'));
    res.clearCookie(
      this.auth.config.cookieName('oauth'),
      this.auth.config.cookieOptions(0),
    );
    const result = await this.google.callback(
      req.query.state,
      browser,
      req.query.code,
      req.query.error,
      cookie(req, this.auth.config.cookieName('access')),
    );
    if (!result.linked) this.write(res, result.tokens);
    // A fixed configured destination; no token or caller-controlled return URL.
    res.redirect(
      `${this.auth.config.origin}/auth/callback?result=${result.linked ? 'linked' : 'signed_in'}`,
    );
  }
}

@Controller('users')
@UseGuards(OriginGuard, SessionGuard)
export class UsersController {
  constructor(private readonly auth: AuthService) {}
  @Get()
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: ListUsersQueryDto) {
    return this.auth.listUsers(query);
  }
  @Post()
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  create(@Req() req: AuthRequest, @Body() dto: CreateUserDto) {
    return this.auth.createUser(req.principal, dto);
  }
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() req: AuthRequest) {
    return this.auth.profile(req.principal.id);
  }
  @Patch('me')
  @Header('Cache-Control', 'no-store')
  async update(@Req() req: AuthRequest, @Body() dto: ProfileDto) {
    await this.auth.database
      .client('users')
      .where({ id: req.principal.id, status: 'active' })
      .update({ display_name: dto.displayName });
    return this.auth.profile(req.principal.id);
  }
  @Get('admin-check')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  adminCheck() {
    return { authorized: true };
  }
  @Patch(':id/role')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  changeRole(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeUserRoleDto,
  ) {
    return this.auth.changeUserRole(req.principal, id, dto.role);
  }
  @Patch(':id/status')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  changeStatus(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeUserStatusDto,
  ) {
    return this.auth.changeUserStatus(req.principal, id, dto.status);
  }
  @Get('stats')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  statistics() {
    return this.auth.userStatistics();
  }
  @Patch(':id')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  edit(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.auth.updateUser(req.principal, id, dto);
  }
  @Get(':id')
  @Roles('admin')
  @Header('Cache-Control', 'no-store')
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.auth.userDetail(id);
  }
}
