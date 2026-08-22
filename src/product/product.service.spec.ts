import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProductService } from './product.service';
import { Product } from './entities/product.entity';

describe('ProductService', () => {
  let service: ProductService;
  let productRepository: { find: jest.Mock };

  beforeEach(async () => {
    productRepository = { find: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductService,
        { provide: getRepositoryToken(Product), useValue: productRepository },
      ],
    }).compile();

    service = module.get<ProductService>(ProductService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns every product from the repository', async () => {
    const products = [
      { id: 'p1', name: 'Wireless Earbuds', price: '10000', stock: 5 },
      { id: 'p2', name: 'Smart Watch', price: '15000', stock: 3 },
    ];
    productRepository.find.mockResolvedValue(products);

    const result = await service.findAll();

    expect(result).toBe(products);
  });
});
