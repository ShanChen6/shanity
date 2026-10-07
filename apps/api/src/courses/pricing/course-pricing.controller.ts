import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { OriginGuard, Roles, SessionGuard } from '../../auth/auth.guards.js';
import type { AuthRequest } from '../../auth/auth.guards.js';
import {
  CourseOwnershipGuard,
  RequireCourseOwnership,
} from '../course-ownership.guard.js';
import { UpdateCoursePricingDto } from './course-pricing.dto.js';
import { CoursePricingService } from './course-pricing.service.js';

@Controller('courses')
@UseGuards(OriginGuard, SessionGuard)
export class CoursePricingController {
  constructor(private readonly pricing: CoursePricingService) {}

  @Patch(':id/pricing')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  update(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateCoursePricingDto,
  ) {
    return this.pricing.updateCoursePricing(id, dto, req.principal.id);
  }

  @Get(':id/pricing-history')
  @Roles('instructor', 'admin')
  @UseGuards(CourseOwnershipGuard)
  @RequireCourseOwnership({ resource: 'course', param: 'id' })
  @Header('Cache-Control', 'no-store')
  history(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.pricing.listPriceHistory(id);
  }
}
