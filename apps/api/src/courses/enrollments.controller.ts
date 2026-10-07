import { Body, Controller, Header, Post, Req, UseGuards } from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { OriginGuard, Roles, SessionGuard } from '../auth/auth.guards.js';
import type { AuthRequest } from '../auth/auth.guards.js';
import { EnrollmentService } from './enrollment.service.js';

export class EnrollFreeDto {
  @IsUUID() courseId: string;
}

@Controller(['enrollments', 'api/v1/enrollments'])
@UseGuards(OriginGuard, SessionGuard)
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentService) {}

  /**
   * FREE fast-path: grants access immediately, no order or payment. A PAID
   * course answers 402 with the checkout hint instead.
   */
  @Post('free')
  @Roles('student')
  @Header('Cache-Control', 'no-store')
  enrollFree(@Req() req: AuthRequest, @Body() dto: EnrollFreeDto) {
    return this.enrollments.enrollCourse(
      req.principal.id,
      dto.courseId.toLowerCase(),
    );
  }
}
