import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.guards.js';
import { CreateCourseDto } from './courses.dto.js';
import { CoursesService } from './courses.service.js';

@Controller('courses')
@UseGuards(OriginGuard, SessionGuard)
@Roles('instructor', 'admin')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Req() req: AuthRequest, @Body() dto: CreateCourseDto) {
    return this.courses.create(req.principal, dto);
  }

  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Req() req: AuthRequest) {
    return this.courses.list(req.principal);
  }

  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.courses.get(req.principal, id);
  }
}