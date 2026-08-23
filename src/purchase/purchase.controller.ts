import {
  Body,
  Controller,
  Post,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { PurchaseService } from './purchase.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@Controller('purchases')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  create(@Request() req, @Body() body: CreatePurchaseDto) {
    return this.purchaseService.purchase(
      req.user.id,
      body.productId,
      body.quantity,
    );
  }
}
