import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PurchaseService } from '../services/purchase.service';


// Fake product and user data
const mockProduct = () => ({
  id: 'product-1',
  name: 'Wireless Earbuds',
  price: '10000',
  stock: 5,
});

const mockUser = () => ({
  id: 'user-1',
  username: 'ekene1',
  balance: '100000',
});

describe('PurchaseService', () => {
  let service: PurchaseService;

  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    manager: {
      findOne: jest.Mock;
      save: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(async (entity) => entity),
        create: jest.fn((_entity, data) => data),
      },
    };

    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<PurchaseService>(PurchaseService);
  });

  it('rejects a quantity that is zero or negative without opening a transaction', async () => {
    await expect(service.purchase('user-1', 'product-1', 0)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.purchase('user-1', 'product-1', -1)).rejects.toThrow(
      BadRequestException,
    );
    // A bad quantity is caught before the database is even touched.
    expect(queryRunner.connect).not.toHaveBeenCalled();
  });

  // Test case 1
  it('on a successful purchase: reduces stock, debits the balance, and saves the purchase', async () => {
    queryRunner.manager.findOne
      .mockResolvedValueOnce(mockProduct())
      .mockResolvedValueOnce(mockUser());

    const result = await service.purchase('user-1', 'product-1', 2);

    // price 10000 * 2 items = 20000 total.
    expect(result.totalAmount).toBe(20000n);
    expect(result.unitPrice).toBe('10000');
    expect(result.quantity).toBe(2);

    const savedProduct = queryRunner.manager.save.mock.calls[0][0];
    expect(savedProduct.stock).toBe(3); // started at 5, bought 2

    const savedUser = queryRunner.manager.save.mock.calls[1][0];
    expect(savedUser.balance).toBe(80000n); // started at 100000, paid 20000

    // The purchase record was saved as the third save() call.
    expect(queryRunner.manager.save).toHaveBeenCalledTimes(3);

    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  // Test case 2
  // Both product and user rows are locked before reading them
  it('locks both the product row and the user row before reading them', async () => {
    queryRunner.manager.findOne
      .mockResolvedValueOnce(mockProduct())
      .mockResolvedValueOnce(mockUser());

    await service.purchase('user-1', 'product-1', 1);

    expect(queryRunner.manager.findOne).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(queryRunner.manager.findOne).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
  });

  // Test case 3
  // Not enough stock, rolls back with nothing saved
  it('refuses the purchase when stock is too low, and rolls back with nothing saved', async () => {
    queryRunner.manager.findOne.mockResolvedValueOnce(
      mockProduct(), // has stock: 5
    );

    await expect(service.purchase('user-1', 'product-1', 6)).rejects.toThrow(
      BadRequestException,
    );

    // Nothing should have been written, and the transaction is rolled back.
    expect(queryRunner.manager.save).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
  });

  // Test case 4
  // Not enough money, rolls back with nothing saved
  it('refuses the purchase when the user cannot afford it, and rolls back with nothing saved', async () => {
    queryRunner.manager.findOne
      .mockResolvedValueOnce(mockProduct()) // price 10000, stock 5
      .mockResolvedValueOnce({ ...mockUser(), balance: '5000' }); // can't afford even 1

    await expect(service.purchase('user-1', 'product-1', 1)).rejects.toThrow(
      BadRequestException,
    );

    expect(queryRunner.manager.save).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  // Test case 5
  // Product not found, rolls back
  it('throws 404 and rolls back when the product does not exist', async () => {
    queryRunner.manager.findOne.mockResolvedValueOnce(null);

    await expect(
      service.purchase('user-1', 'missing-product', 1),
    ).rejects.toThrow(NotFoundException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });

  // Test case 6
  // User not found, rolls back
  it('throws 404 and rolls back when the user does not exist', async () => {
    queryRunner.manager.findOne
      .mockResolvedValueOnce(mockProduct())
      .mockResolvedValueOnce(null);

    await expect(
      service.purchase('missing-user', 'product-1', 1),
    ).rejects.toThrow(NotFoundException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
