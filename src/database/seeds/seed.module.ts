import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseModule } from '../database.module';
import { User } from '../../user/entities/user.entity';
import { Product } from '../../product/entities/product.entity';
import { SeedCommand } from './seed.command';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    TypeOrmModule.forFeature([User, Product]),
  ],
  providers: [SeedCommand],
})
export class SeedModule {}
