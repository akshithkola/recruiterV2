import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { User, UserDocument } from '../users/schemas/user.schema';
import { Organization, OrganizationDocument } from '../organizations/schemas/organization.schema';
import { RolePermission, RolePermissionDocument } from '../users/schemas/role-permission.schema';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterRequestDto } from './dto/register-request.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestLoginOtpDto } from './dto/request-login-otp.dto';
import { VerifyLoginOtpDto } from './dto/verify-login-otp.dto';

interface OtpEntry {
  otpCode: string;
  expiresAt: Date;
}

interface ResetTokenEntry {
  email: string;
  expiresAt: Date;
}

const DEMO_CREDENTIALS: Record<string, { password: string; role: string; name: string }> = {
  'r.haines@talentflow.io': { password: 'Admin@2026', role: 'superadmin', name: 'Robert Haines' },
  'd.park@talentflow.io': { password: 'Admin@2026', role: 'admin', name: 'David Park' },
  'harish.g@metaforgeit.com': { password: 'Lead@2026', role: 'lead', name: 'Harish Gadipally' },
  'm.chen@talentflow.io': { password: 'Rec@2026', role: 'recruiter', name: 'Marcus Chen' },
  'dev.team@talentflow.io': { password: 'Dev@2026', role: 'devteam', name: 'Dev Team Engineer' },
  'client@accenture.com': { password: 'Client@2026', role: 'client', name: 'Client Account Lead' },
};

@Injectable()
export class AuthService {
  private otpStore = new Map<string, OtpEntry>();
  private resetTokenStore = new Map<string, ResetTokenEntry>();
  private activeRefreshTokens = new Set<string>();

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Organization.name) private readonly orgModel: Model<OrganizationDocument>,
    @InjectModel(RolePermission.name) private readonly roleModel: Model<RolePermissionDocument>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  private async permissionsFor(role: string, orgId?: Types.ObjectId | string | null): Promise<string[]> {
    if (role === 'superadmin' || role === 'devteam') return ['*'];
    const filter: Record<string, any> = { roleCode: role };
    if (orgId) filter.orgId = new Types.ObjectId(orgId.toString());
    const doc = await this.roleModel.findOne(filter).exec();
    return doc?.permissions?.length ? doc.permissions : [];
  }

  private normalizeRole(role?: string): string {
    const r = (role || '').trim().toLowerCase();
    if (r === 'team lead' || r === 'team_lead' || r === 'lead') return 'lead';
    if (r === 'recruiter') return 'recruiter';
    if (r === 'admin') return 'admin';
    if (r === 'superadmin' || r === 'super_admin') return 'superadmin';
    if (r === 'devteam' || r === 'dev_team' || r === 'developer') return 'devteam';
    if (r === 'client') return 'client';
    return r;
  }

  private enforceMatchingRole(userRole: string, requestedRole?: string) {
    if (!requestedRole) return;
    const req = this.normalizeRole(requestedRole);
    const assigned = this.normalizeRole(userRole);
    if (req && req !== assigned) {
      throw new UnauthorizedException(
        `You are not authorized to log in as '${requestedRole}'. Assigned account role is '${userRole}'.`,
      );
    }
  }

  /**
   * Find default Organization ID for seeding / new registration
   */
  private async getDefaultOrgId(): Promise<Types.ObjectId> {
    const org = await this.orgModel.findOne().exec();
    if (org) return org._id as Types.ObjectId;
    return new Types.ObjectId('6ab4f38ff2e0e1823c038948');
  }

  /**
   * Authenticate user credentials against MongoDB users and DEMO_CREDENTIALS
   */
  async validateUser(email: string, pass: string): Promise<UserDocument> {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();

    if (!user && DEMO_CREDENTIALS[normalizedEmail]) {
      const demoInfo = DEMO_CREDENTIALS[normalizedEmail];
      if (demoInfo.password === pass) {
        const orgId = await this.getDefaultOrgId();
        const passwordHash = await bcrypt.hash(pass, 10);
        user = new this.userModel({
          orgId,
          userId: `user-${Date.now()}`,
          name: demoInfo.name,
          email: normalizedEmail,
          passwordHash,
          role: demoInfo.role,
          active: true,
        });
        await user.save();
      }
    }

    if (user) {
      if (user.active === false) {
        throw new UnauthorizedException('User account has been deactivated or deleted');
      }

      let isMatch = await bcrypt.compare(pass, user.passwordHash);

      // Support fallback demo account password check if bcrypt compare fails
      if (!isMatch) {
        const demoInfo = DEMO_CREDENTIALS[normalizedEmail];
        if (demoInfo && demoInfo.password === pass) {
          isMatch = true;
          // Upgrade password to standard bcrypt hash
          user.passwordHash = await bcrypt.hash(pass, 10);
          await user.save();
        }
      }

      if (!isMatch) {
        throw new UnauthorizedException('Invalid email or password');
      }
      return user;
    }

    throw new UnauthorizedException('Invalid email or password');
  }

  /**
   * Login Endpoint — POST /auth/login
   */
  async login(dto: LoginDto) {
    const user = await this.validateUser(dto.email, dto.password);
    this.enforceMatchingRole(user.role, dto.role);

    // Update lastLoginAt timestamp
    user.lastLoginAt = new Date();
    await user.save();

    const permissions = await this.permissionsFor(user.role, user.orgId as any);

    const payload = {
      sub: user._id.toString(),
      userId: user.userId,
      email: user.email,
      role: user.role,
      orgId: user.orgId ? user.orgId.toString() : null,
      name: user.name,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.activeRefreshTokens.add(refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        title: user.role,
        permissions,
        capabilities: user.capabilities || {},
      },
    };
  }

  /**
   * Logout Endpoint — POST /auth/logout
   */
  async logout(refreshToken?: string) {
    if (refreshToken) {
      this.activeRefreshTokens.delete(refreshToken);
    }
    return { message: 'Logged out successfully' };
  }

  /**
   * Register Request Endpoint — POST /auth/register-request
   */
  async registerRequest(dto: RegisterRequestDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const existing = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();

    if (existing) {
      throw new ConflictException('Email address is already registered');
    }

    const orgId = await this.getDefaultOrgId();
    const rawPass = dto.password || crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(rawPass, 10);

    const newUser = new this.userModel({
      orgId,
      userId: `user-${Date.now()}`,
      name: dto.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: dto.role || 'recruiter',
      phone: dto.phone ? dto.phone.trim() : null,
      active: true,
    });

    const saved = await newUser.save();

    return {
      message: 'Registration request submitted successfully',
      user: {
        id: saved._id.toString(),
        userId: saved.userId,
        email: saved.email,
        name: saved.name,
        role: saved.role,
      },
    };
  }

  /**
   * Forgot Password Endpoint — POST /auth/forgot-password
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();
    const isDemo = Boolean(DEMO_CREDENTIALS[normalizedEmail]);

    if (!user && !isDemo) {
      return { message: 'If an account exists for this email, a recovery code has been issued.' };
    }

    // Generate 6-digit OTP code
    const otpCode = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    this.otpStore.set(normalizedEmail, { otpCode, expiresAt });

    const payload: { message: string; otpCode?: string } = {
      message: 'If an account exists for this email, a recovery code has been issued.',
    };
    if (process.env.NODE_ENV !== 'production') {
      payload.otpCode = otpCode;
    }
    return payload;
  }

  /**
   * Verify OTP Endpoint — POST /auth/verify-otp
   */
  async verifyOtp(dto: VerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const entry = this.otpStore.get(normalizedEmail);

    if (!entry) {
      throw new BadRequestException('No password reset request found for this email');
    }

    if (new Date() > entry.expiresAt) {
      this.otpStore.delete(normalizedEmail);
      throw new BadRequestException('OTP code has expired. Request a new one.');
    }

    if (entry.otpCode !== dto.otpCode.trim()) {
      throw new BadRequestException('Invalid OTP code');
    }

    // Clear used OTP
    this.otpStore.delete(normalizedEmail);

    // Issue temporary reset token
    const resetToken = `rst-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    this.resetTokenStore.set(resetToken, { email: normalizedEmail, expiresAt });

    return { resetToken };
  }

  /**
   * Reset Password Endpoint — POST /auth/reset-password
   */
  async resetPassword(dto: ResetPasswordDto) {
    const entry = this.resetTokenStore.get(dto.token);

    if (!entry) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (new Date() > entry.expiresAt) {
      this.resetTokenStore.delete(dto.token);
      throw new BadRequestException('Reset token has expired');
    }

    const email = entry.email;
    let user = await this.userModel.findOne({ email, deletedAt: null }).exec();

    const newHash = await bcrypt.hash(dto.newPassword, 10);

    if (user) {
      user.passwordHash = newHash;
      await user.save();
    } else if (DEMO_CREDENTIALS[email]) {
      const demoInfo = DEMO_CREDENTIALS[email];
      const orgId = await this.getDefaultOrgId();
      user = new this.userModel({
        orgId,
        userId: `user-${Date.now()}`,
        name: demoInfo.name,
        email,
        passwordHash: newHash,
        role: demoInfo.role,
        active: true,
      });
      await user.save();
    } else {
      throw new NotFoundException('User account not found');
    }

    this.resetTokenStore.delete(dto.token);

    return { message: 'Password reset successfully' };
  }

  /**
   * Refresh Token Endpoint — POST /auth/refresh
   */
  async refresh(dto: RefreshTokenDto) {
    if (!this.activeRefreshTokens.has(dto.refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    try {
      const payload = this.jwtService.verify(dto.refreshToken);
      const user = await this.userModel.findById(payload.sub).exec();

      if (!user) {
        throw new UnauthorizedException('User account no longer exists');
      }

      this.activeRefreshTokens.delete(dto.refreshToken);

      const newPayload = {
        sub: user._id.toString(),
        userId: user.userId,
        email: user.email,
        role: user.role,
        orgId: user.orgId ? user.orgId.toString() : null,
        name: user.name,
      };

      const accessToken = this.jwtService.sign(newPayload);
      const refreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });
      this.activeRefreshTokens.add(refreshToken);

      return { accessToken, refreshToken };
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Get Profile Endpoint — GET /auth/me
   */
  async getProfile(currentUser: any) {
    const user = await this.userModel.findById(currentUser.id || currentUser.userId).exec();
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    const permissions = await this.permissionsFor(user.role, user.orgId as any);
    return {
      id: user._id.toString(),
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      orgId: user.orgId,
      title: user.role,
      permissions,
      capabilities: user.capabilities || {},
      lastLoginAt: user.lastLoginAt,
    };
  }

  /**
   * Request Login OTP Endpoint — POST /auth/request-login-otp
   */
  async requestLoginOtp(dto: RequestLoginOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    let user = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();

    if (!user && DEMO_CREDENTIALS[normalizedEmail]) {
      const demoInfo = DEMO_CREDENTIALS[normalizedEmail];
      const orgId = await this.getDefaultOrgId();
      const passwordHash = await bcrypt.hash(demoInfo.password, 10);
      user = new this.userModel({
        orgId,
        userId: `user-${Date.now()}`,
        name: demoInfo.name,
        email: normalizedEmail,
        passwordHash,
        role: demoInfo.role,
        active: true,
      });
      await user.save();
    }

    if (!user || user.active === false) {
      // Do not reveal whether account exists or is active
      return { message: 'If an account exists for this email, a login OTP has been sent.' };
    }

    // Role check BEFORE sending OTP (Requirement 3)
    this.enforceMatchingRole(user.role, dto.role);

    const now = new Date();

    // Check 60-second OTP resend cooldown
    if (user.loginOtpLastSentAt) {
      const elapsedMs = now.getTime() - new Date(user.loginOtpLastSentAt).getTime();
      if (elapsedMs < 60 * 1000) {
        const remainingSeconds = Math.ceil((60 * 1000 - elapsedMs) / 1000);
        throw new BadRequestException(
          `Resend cooldown active. Please wait ${remainingSeconds} second(s) before requesting another OTP.`,
        );
      }
    }

    const otpCode = String(crypto.randomInt(1000, 10000));

    // Hash OTP using bcrypt
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(otpCode, salt);

    // Store OTP hash, expiry (5 minutes), attempts (0), and last-sent timestamp
    user.loginOtpHash = hash;
    user.loginOtpExpires = new Date(now.getTime() + 5 * 60 * 1000);
    user.loginOtpAttempts = 0;
    user.loginOtpLastSentAt = now;
    await user.save();

    // Send OTP through active mail service provider (Nodemailer / Graph)
    try {
      await this.mailService.sendMail({
        to: [normalizedEmail],
        subject: 'Your Login Verification Code - MetaForge Recruiter Portal',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
              <h2 style="color: #0f172a; margin: 0; font-size: 20px;">MetaForge Recruiter Command Centre</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Single-Use Login Verification Code</p>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Hello,</p>
            <p style="color: #334155; font-size: 15px; line-height: 1.5;">Use the following 4-digit verification code to complete your login. This code is valid for <strong>5 minutes</strong>.</p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0;">
              <span style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #2563eb;">${otpCode}</span>
            </div>
            <p style="color: #64748b; font-size: 13px; line-height: 1.5;">If you did not request this code, no action is needed. Your account remains secure.</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; text-align: center; margin: 0;">&copy; MetaForge IT. Automated notification service.</p>
          </div>
        `,
      });
    } catch {
      user.loginOtpHash = null;
      user.loginOtpExpires = null;
      user.loginOtpAttempts = 0;
      user.loginOtpLastSentAt = null;
      await user.save();
      Logger.error(`Login code email was not accepted for ${normalizedEmail}`, 'AuthService');
      throw new ServiceUnavailableException('Failed to deliver the login code. Try again in a moment.');
    }

    // Never return the OTP or OTP hash in API response
    return { message: 'If an account exists for this email, a login OTP has been sent.' };
  }

  /**
   * Verify Login OTP Endpoint — POST /auth/verify-login-otp
   */
  async verifyLoginOtp(dto: VerifyLoginOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const code = (dto.code || '').trim();

    if (!/^\d{4}$/.test(code)) {
      throw new BadRequestException('OTP code must be exactly 4 digits');
    }

    let user = await this.userModel.findOne({ email: normalizedEmail, deletedAt: null }).exec();

    if (!user && DEMO_CREDENTIALS[normalizedEmail]) {
      const demoInfo = DEMO_CREDENTIALS[normalizedEmail];
      const orgId = await this.getDefaultOrgId();
      const passwordHash = await bcrypt.hash(demoInfo.password, 10);
      user = new this.userModel({
        orgId,
        userId: `user-${Date.now()}`,
        name: demoInfo.name,
        email: normalizedEmail,
        passwordHash,
        role: demoInfo.role,
        active: true,
      });
      await user.save();
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email or OTP code');
    }

    if (user.active === false) {
      throw new UnauthorizedException('User account has been deactivated or deleted');
    }

    // Role check during OTP verification (Requirement 3)
    this.enforceMatchingRole(user.role, dto.role);

    if (!user.loginOtpHash || !user.loginOtpExpires) {
      throw new BadRequestException('No active OTP found. Please request a new OTP.');
    }

    // Check attempts before checking expiry
    if (user.loginOtpAttempts >= 5) {
      user.loginOtpHash = null;
      user.loginOtpExpires = null;
      await user.save();
      throw new BadRequestException('Maximum OTP verification attempts exceeded. Please request a new OTP.');
    }

    // Check expiration (5 minutes)
    if (new Date() > new Date(user.loginOtpExpires)) {
      user.loginOtpHash = null;
      user.loginOtpExpires = null;
      await user.save();
      throw new BadRequestException('OTP code has expired. Please request a new OTP.');
    }

    // Compare code with stored bcrypt hash
    const isMatch = await bcrypt.compare(code, user.loginOtpHash);

    if (!isMatch) {
      user.loginOtpAttempts = (user.loginOtpAttempts || 0) + 1;
      await user.save();

      if (user.loginOtpAttempts >= 5) {
        user.loginOtpHash = null;
        user.loginOtpExpires = null;
        await user.save();
        throw new BadRequestException('Maximum OTP verification attempts exceeded. Please request a new OTP.');
      }

      const remaining = 5 - user.loginOtpAttempts;
      throw new UnauthorizedException(`Invalid OTP code. ${remaining} attempt(s) remaining.`);
    }

    // On successful verification:
    // 1. Invalidate/remove OTP
    user.loginOtpHash = null;
    user.loginOtpExpires = null;
    user.loginOtpAttempts = 0;
    user.loginOtpLastSentAt = null;

    // 2. Update lastLoginAt
    user.lastLoginAt = new Date();
    await user.save();

    // 3. Issue existing V2 JWT
    const permissions = await this.permissionsFor(user.role, user.orgId as any);

    const payload = {
      sub: user._id.toString(),
      userId: user.userId,
      email: user.email,
      role: user.role,
      orgId: user.orgId ? user.orgId.toString() : null,
      name: user.name,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.activeRefreshTokens.add(refreshToken);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user._id.toString(),
        userId: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        orgId: user.orgId,
        title: user.role,
        permissions,
        capabilities: user.capabilities || {},
      },
    };
  }
}
