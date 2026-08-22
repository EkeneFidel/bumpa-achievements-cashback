import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('purchases')
@UseGuards(JwtAuthGuard)
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  create(
    @Request() req,
    @Body() body: { productId: string; quantity: number },
  ) {
    return this.purchaseService.purchase(
      req.user.id,
      body.productId,
      body.quantity,
    );
  }
}
