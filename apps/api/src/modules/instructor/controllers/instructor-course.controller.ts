import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles, SessionGuard } from '../../../auth/auth.guards.js';
import { StudentsProgressQueryDto } from '../dto/students-progress-query.dto.js';
import {
  CourseOwnerGuard,
  type CourseOwnerRequest,
} from '../guards/course-owner.guard.js';
import { InstructorProgressService } from '../services/instructor-progress.service.js';

// SessionGuard authenticates and enforces @Roles; CourseOwnerGuard then
// limits instructors to their own courses (admins see all).
@Controller('instructor/courses/:courseId')
@UseGuards(SessionGuard, CourseOwnerGuard)
@Roles('instructor', 'admin')
export class InstructorCourseController {
  constructor(private readonly progress: InstructorProgressService) {}

  @Get('students-progress')
  @Header('Cache-Control', 'private, no-store')
  studentsProgress(
    @Req() req: CourseOwnerRequest,
    @Query() query: StudentsProgressQueryDto,
  ) {
    return this.progress.studentsProgress(req.ownedCourse!, query);
  }

  @Get('students/:studentId/progress')
  @Header('Cache-Control', 'private, no-store')
  studentLessons(
    @Req() req: CourseOwnerRequest,
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
  ) {
    return this.progress.studentLessons(req.ownedCourse!, studentId);
  }
}
