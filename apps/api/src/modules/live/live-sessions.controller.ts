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
import {
  OriginGuard,
  SessionGuard,
  type AuthRequest,
} from '../../auth/auth.guards.js';
import {
  CreateLiveSessionDto,
  MyScheduleQueryDto,
  UpdateLiveSessionStatusDto,
} from './live-session.dto.js';
import { HeartbeatThrottleGuard } from './heartbeat-throttle.guard.js';
import { LiveAttendanceService } from './live-attendance.service.js';
import { LiveSessionsService } from './live-sessions.service.js';

const uuid = () => new ParseUUIDPipe();

/** Scheduling (teachers) and the timetable (members) of a course. */
@Controller('api/v1/courses/:courseId/live-sessions')
@UseGuards(OriginGuard, SessionGuard)
export class CourseLiveSessionsController {
  constructor(
    private readonly sessions: LiveSessionsService,
    private readonly attendance: LiveAttendanceService,
  ) {}

  /** Teachers and admins: who attended, with credited time. */
  @Get(':id/attendance-report')
  @Header('Cache-Control', 'no-store')
  report(
    @Req() req: AuthRequest,
    @Param('courseId', uuid()) courseId: string,
    @Param('id', uuid()) id: string,
  ) {
    return this.attendance.report(req.principal, courseId, id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  create(
    @Req() req: AuthRequest,
    @Param('courseId', uuid()) courseId: string,
    @Body() dto: CreateLiveSessionDto,
  ) {
    return this.sessions.create(req.principal, courseId, dto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest, @Param('courseId', uuid()) courseId: string) {
    return this.sessions.list(req.principal, courseId);
  }
}

/** One session: what the player page reads, re-reads and acts on. */
@Controller('api/v1/live-sessions')
@UseGuards(OriginGuard, SessionGuard)
export class LiveSessionsController {
  constructor(
    private readonly sessions: LiveSessionsService,
    private readonly attendance: LiveAttendanceService,
  ) {}

  /**
   * The caller's live classes in [startDate, endDate), for the calendar.
   * Declared before `:id` so the path is not taken for a session id.
   */
  @Get('my-schedule')
  @Header('Cache-Control', 'no-store')
  mySchedule(@Req() req: AuthRequest, @Query() query: MyScheduleQueryDto) {
    return this.sessions.mySchedule(
      req.principal,
      query.startDate,
      query.endDate,
    );
  }

  /**
   * Sent every 30 s of visible time while the class is on. Answers 200
   * with `accepted: false` when it came too soon to credit anything.
   */
  @Post(':id/heartbeat')
  @UseGuards(HeartbeatThrottleGuard)
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  heartbeat(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.attendance.heartbeat(req.principal, id);
  }

  /** The caller's own credited time, for the indicator after a reload. */
  @Get(':id/attendance/me')
  @Header('Cache-Control', 'no-store')
  myAttendance(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.attendance.mine(req.principal, id);
  }

  /** Students get `embedUrl: null` until the class starts (never leaked). */
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Req() req: AuthRequest, @Param('id', uuid()) id: string) {
    return this.sessions.get(req.principal, id);
  }

  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  setStatus(
    @Req() req: AuthRequest,
    @Param('id', uuid()) id: string,
    @Body() dto: UpdateLiveSessionStatusDto,
  ) {
    return this.sessions.setStatus(req.principal, id, dto.status);
  }
}
