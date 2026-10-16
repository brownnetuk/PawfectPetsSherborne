import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { escapeHtml } from '../common/html.util';
import { publicApiUrl } from '../common/tracking-pixel.util';
import { SettingsService } from '../settings/settings.service';
import { CreateProductDto } from './dto/create-product.dto';
import { SendPriceListDto } from './dto/send-price-list.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    private readonly settingsService: SettingsService,
  ) {}

  /** Emails the staff-app-built price list PDF to an ad-hoc recipient. */
  async emailPriceList(dto: SendPriceListDto): Promise<void> {
    const business = await this.settingsService.getBusinessInfo();
    const logoTag = business.logoImage
      ? `<img src="${publicApiUrl()}/settings/business/logo" alt="${escapeHtml(business.name)}" style="max-height:60px;max-width:220px;display:block;margin-bottom:12px;" />`
      : '';
    const contact = [business.telephone, business.email]
      .filter(Boolean)
      .map((v) => escapeHtml(String(v)))
      .join(' &middot; ');
    const html =
      `${logoTag}` +
      `<p>Hi ${escapeHtml(dto.recipientName)},</p>` +
      `<p>Thank you for your interest in ${escapeHtml(business.name)}. Please find our current price list attached.</p>` +
      `<p>If you have any questions or would like to book, just reply to this email or get in touch.</p>` +
      `<p>${escapeHtml(business.name)}<br/><span style="color:#5f6f7a;font-size:13px;">${contact}</span></p>`;
    await this.settingsService.sendDirectEmail(
      dto.recipientEmail,
      `${business.name} — Price List`,
      html,
      { data: dto.attachmentData, name: dto.attachmentName },
    );
  }

  create(dto: CreateProductDto): Promise<Product> {
    return new this.productModel(dto).save();
  }

  findAll(): Promise<Product[]> {
    return this.productModel.find().sort({ name: 1 }).exec();
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.productModel.findByIdAndUpdate(id, dto, { new: true }).exec();
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  async remove(id: string): Promise<void> {
    const result = await this.productModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Product ${id} not found`);
    }
  }
}
