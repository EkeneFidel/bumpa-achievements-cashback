import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) { }

  /**
   * @description this method is used to get all products
   * @returns Promise<Product[]>
   */
  findAll(): Promise<Product[]> {
    return this.productRepository.find();
  }
}
