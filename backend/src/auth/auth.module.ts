import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { BusinessInfo, BusinessInfoSchema } from '../settings/schemas/business-info.schema';
import { StaffModule } from '../staff/staff.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    StaffModule,
    // Only for reading BusinessInfo.trustedIps at login time -- deliberately
    // registered directly rather than importing SettingsModule, to avoid
    // depending on all of Settings' controllers/services for one field.
    MongooseModule.forFeature([{ name: BusinessInfo.name, schema: BusinessInfoSchema }]),
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
