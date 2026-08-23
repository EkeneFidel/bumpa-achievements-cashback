import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { User } from '../user/entities/user.entity';
import { Product } from '../product/entities/product.entity';
import { Purchase } from './entities/purchase.entity';
import {
  PURCHASE_RECORDED_EVENT,
  PurchaseRecordedEvent,
} from './events/purchase-recorded.event';


@Injectable()
export class PurchaseService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  async purchase(
    userId: string,
    productId: string,
    quantity: number,
  ): Promise<Purchase> {

    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const product = await queryRunner.manager.findOne(Product, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!product) {
        throw new NotFoundException('Product not found');
      }
      if (product.stock < quantity) {
        throw new BadRequestException('Quantity exceeds available stock');
      }

      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const totalAmount = BigInt(product.price) * BigInt(quantity);
      if (BigInt(user.balance) < totalAmount) {
        throw new BadRequestException('Insufficient balance');
      }

      product.stock -= quantity;
      user.balance = BigInt(user.balance) - totalAmount;

      await queryRunner.manager.save(product);
      await queryRunner.manager.save(user);

      const purchase = queryRunner.manager.create(Purchase, {
        userId,
        productId,
        quantity,
        totalAmount,
        unitPrice: product.price,
      });
      await queryRunner.manager.save(purchase);

      await queryRunner.commitTransaction();

      // Emit PURCHASE_RECORDED_EVENT after the transaction has been committed
      this.eventEmitter.emit(
        PURCHASE_RECORDED_EVENT,
        new PurchaseRecordedEvent(
          userId,
          purchase.id,
          BigInt(purchase.totalAmount),
        ),
      );

      return purchase;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
