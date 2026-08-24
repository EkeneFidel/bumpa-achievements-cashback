import { Controller, Get, UseGuards } from '@nestjs/common';
import { ProductService } from '../services/product.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';


@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  @Get()
  findAll() {
    return this.productService.findAll();
  }
}
