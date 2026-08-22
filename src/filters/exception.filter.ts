import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();

    response.status(status).json({
      success: false,
      statusCode: status,
      message: (exception.getResponse() as any)?.message || exception.message,
      error: exception.name,
      cause: (exception.getResponse() as any)?.cause || exception.cause,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
