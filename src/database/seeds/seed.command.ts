import { Command, CommandRunner } from 'nest-commander';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../../user/entities/user.entity';
import { Product } from '../../product/entities/product.entity';

@Injectable()
@Command({
  name: 'seed:db',
  description: 'Seed the database',
})
export class SeedCommand extends CommandRunner {
  private readonly logger = new Logger(SeedCommand.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {
    super();
  }

  // seeds database with user and product data only if the database is empty
  async run(): Promise<void> {
    this.logger.log('Seeding database...');

    if ((await this.userRepository.count()) === 0) {
      await this.userRepository.save([
        {
          name: 'Ekene Chukwurah',
          username: 'ekene1',
          password: await bcrypt.hash('Testpassword2', 10),
          bankAccountNumber: '0901604042',
          bankCode: '058',
          balance: 100_000_00n,
        },
        {
          name: 'Saka Saliba',
          username: 'saka1',
          password: await bcrypt.hash('Testpassword1', 10),
          bankAccountNumber: '0987654321',
          bankCode: '011',
          balance: 50_000_00n,
        },
      ]);
      this.logger.log('Seeded users');
    }

    if ((await this.productRepository.count()) === 0) {
      await this.productRepository.save([
        { name: 'Wireless Earbuds', price: 10_000_00n },
        { name: 'Smart Watch', price: 15_000_00n },
        { name: 'Bluetooth Speaker', price: 10_000_00n },
      ]);
      this.logger.log('Seeded products');
    }

    this.logger.log('Seeding complete');
  }
}
