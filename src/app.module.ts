import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from './cache/cache.module';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { UserModule } from './user/user.module';
import { ProductModule } from './product/product.module';
import { AuthModule } from './auth/auth.module';
import { SeedModule } from './database/seeds/seed.module';
import { HttpExceptionFilter } from './filters/exception.filter';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponserInterceptor } from './interceptor/response.interceptor';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, }), DatabaseModule, EventEmitterModule.forRoot(), CacheModule, BullModule.forRootAsync({
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (configService: ConfigService) => ({
      connection: {
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        password: configService.get<string>('REDIS_PASSWORD'),
      },
    }),
  }), UserModule, ProductModule, AuthModule, SeedModule],
  controllers: [AppController],
  providers: [AppService, {
    provide: APP_FILTER,
    useClass: HttpExceptionFilter,
  }, {
      provide: APP_INTERCEPTOR,
      useClass: ResponserInterceptor,
    },],
})
export class AppModule { }
