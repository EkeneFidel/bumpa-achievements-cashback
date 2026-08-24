import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Purchase } from './entities/purchase.entity';
import { Product } from '../product/entities/product.entity';
import { User } from '../user/entities/user.entity';
import { PurchaseService } from './services/purchase.service';
import { PurchaseController } from './controllers/purchase.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase, Product, User])],
  controllers: [PurchaseController],
  providers: [PurchaseService],
})
export class PurchaseModule {}
