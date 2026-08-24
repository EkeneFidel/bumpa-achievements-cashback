import { Test, TestingModule } from '@nestjs/testing';
import { ProductController } from '../controllers/product.controller';
import { ProductService } from '../services/product.service';

describe('ProductController', () => {
  let controller: ProductController;
  let productService: { findAll: jest.Mock };

  beforeEach(async () => {
    productService = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductController],
      providers: [{ provide: ProductService, useValue: productService }],
    }).compile();

    controller = module.get<ProductController>(ProductController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('products should be returned successfully', async () => {
    const products = [{ id: 'p1', name: 'Wireless Earbuds' }];
    productService.findAll.mockResolvedValue(products);

    const result = await controller.findAll();

    expect(result).toBe(products);
  });
});
