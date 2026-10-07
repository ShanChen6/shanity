import { HttpException, HttpStatus } from '@nestjs/common';

/** 402: the course is PAID, so access must go through Order -> Payment. */
export class PaymentRequiredException extends HttpException {
  constructor(courseId: string) {
    super(
      {
        statusCode: HttpStatus.PAYMENT_REQUIRED,
        code: 'PAYMENT_REQUIRED',
        message: 'Paid courses must be purchased through an order',
        courseId,
        checkout: {
          method: 'POST',
          path: '/orders',
          body: { courseIds: [courseId] },
        },
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
