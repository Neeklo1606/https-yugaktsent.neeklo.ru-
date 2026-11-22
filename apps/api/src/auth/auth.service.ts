import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto, LinkEmailDto, LoginDto, RegisterDto, TokensDto } from './dto';
import { verifyTelegramLoginWidget } from './telegram-login.util';
import { normalizeLoginPhone, phoneLookupVariants } from './phone-normalize.util';
import { MediaService } from '../modules/media/media.service';
import type { Express } from 'express';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/** Сколько одновременных входов хранить на пользователя (устройства + служебные клиенты) */
const MAX_SESSIONS_PER_USER = 20;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly media: MediaService,
  ) {}

  async login(dto: LoginDto): Promise<TokensDto> {
    const email = dto.email?.trim().toLowerCase();
    const phoneRaw = dto.phone?.trim();
    if (!email && !phoneRaw) {
      throw new BadRequestException('Укажите email или телефон');
    }
    if (email && phoneRaw) {
      throw new BadRequestException('Укажите только email или только телефон');
    }

    let user =
      email != null && email.length > 0
        ? await this.prisma.user.findUnique({ where: { email } })
        : null;

    if (!user && phoneRaw) {
      const variants = phoneLookupVariants(phoneRaw);
      if (variants.length === 0) {
        throw new BadRequestException('Неверный формат телефона');
      }
      user = await this.prisma.user.findFirst({
        where: { phone: { in: variants } },
      });
    }

    if (!user || !user.passwordHash) {
      this.logAuthFailure('user_not_found_or_no_password', email ?? phoneRaw);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    if (!user.isActive) {
      this.logAuthFailure('account_disabled', user.email ?? user.id);
      throw new UnauthorizedException('Аккаунт деактивирован');
    }

    const t0 = Date.now();
    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    this.logAuthVerifyMs(Date.now() - t0);
    if (!isMatch) {
      this.logAuthFailure('password_mismatch', user.email ?? user.id);
      throw new UnauthorizedException('Неверный email или пароль');
    }

    return this.issueTokensForUser(user.id);
  }

  async register(dto: RegisterDto): Promise<TokensDto> {
    const email = dto.email.trim().toLowerCase();
    const phoneNorm = normalizeLoginPhone(dto.phone);
    if (!phoneNorm) {
      throw new BadRequestException('Неверный формат телефона');
    }
    const fullName = dto.fullName.trim();
    if (!fullName) {
      throw new BadRequestException('Укажите имя');
    }

    const [byEmail, byPhone] = await Promise.all([
      this.prisma.user.findUnique({ where: { email }, select: { id: true } }),
      this.prisma.user.findFirst({
        where: { phone: { in: phoneLookupVariants(dto.phone) } },
        select: { id: true },
      }),
    ]);
    if (byEmail) {
      throw new ConflictException('Пользователь с таким email уже зарегистрирован');
    }
    if (byPhone) {
      throw new ConflictException('Пользователь с таким телефоном уже зарегистрирован');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email,
          phone: phoneNorm,
          passwordHash,
          fullName,
          role: 'client',
          isActive: true,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email или телефон уже занят');
      }
      throw e;
    }

    return this.issueTokensForUser(user.id);
  }

  /** Публичный username бота для Telegram Login Widget (без токена). */
  async getTelegramWidgetConfig(): Promise<{ botUsername: string | null }> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key: 'telegram_login_bot_username' },
      select: { value: true },
    });
    const v = row?.value?.trim();
    return { botUsername: v && v.length > 0 ? v.replace(/^@/, '') : null };
  }

  /**
   * Вход через Telegram Login Widget: проверка hash по токену бота из site_settings,
   * создание пользователя client при первом входе.
   * Объединение с аккаунтом по email — через {@link linkTelegram} в личном кабинете.
   */
  async telegramLogin(body: Record<string, unknown>): Promise<TokensDto> {
    const { tgId, fullName, username } = await this.parseAndVerifyTelegramLogin(body);

    let user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          email: null,
          passwordHash: null,
          fullName,
          role: 'client',
          telegramId: tgId,
          telegramUsername: username,
          isActive: true,
        },
      });
    } else {
      if (!user.isActive) {
        throw new UnauthorizedException('Аккаунт отключён');
      }
      const patch: { telegramUsername?: string | null; fullName?: string | null } = {};
      if (username !== null && username !== user.telegramUsername) {
        patch.telegramUsername = username;
      }
      if (fullName && fullName !== user.fullName) {
        patch.fullName = fullName;
      }
      if (Object.keys(patch).length > 0) {
        user = await this.prisma.user.update({ where: { id: user.id }, data: patch });
      }
    }

    return this.issueTokensForUser(user.id);
  }

  /**
   * Привязка Telegram к текущему аккаунту (JWT).
   * Если этот Telegram уже был у «пустого» аккаунта (только Telegram, без email и пароля),
   * избранное переносится на текущего пользователя, сессии старого аккаунта сбрасываются.
   */
  async linkTelegram(userId: string, body: Record<string, unknown>): Promise<TokensDto> {
    const { tgId, fullName, username } = await this.parseAndVerifyTelegramLogin(body);

    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me?.isActive) {
      throw new UnauthorizedException('Пользователь не найден или отключён');
    }

    if (me.telegramId === tgId) {
      const patch: { telegramUsername?: string | null; fullName?: string | null } = {};
      if (username !== null && username !== me.telegramUsername) {
        patch.telegramUsername = username;
      }
      if (fullName && fullName !== me.fullName) {
        patch.fullName = fullName;
      }
      if (Object.keys(patch).length > 0) {
        await this.prisma.user.update({ where: { id: me.id }, data: patch });
      }
      return this.issueTokensForUser(me.id);
    }

    const other = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
    if (other && other.id !== me.id) {
      const otherHasCredentials = !!(other.email?.trim() || other.passwordHash);
      if (otherHasCredentials) {
        throw new ConflictException(
          'Этот Telegram уже привязан к другому аккаунту (с email или паролем).',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.session.deleteMany({ where: { userId: other.id } });
        const favs = await tx.favorite.findMany({ where: { userId: other.id } });
        for (const f of favs) {
          try {
            await tx.favorite.create({
              data: { userId: me.id, blockId: f.blockId, listingId: f.listingId },
            });
          } catch (e) {
            if (
              e instanceof Prisma.PrismaClientKnownRequestError &&
              e.code === 'P2002'
            ) {
              continue;
            }
            throw e;
          }
        }
        await tx.favorite.deleteMany({ where: { userId: other.id } });
        await tx.user.update({
          where: { id: other.id },
          data: { telegramId: null, telegramUsername: null },
        });
        const data: {
          telegramId: bigint;
          telegramUsername: string | null;
          fullName?: string | null;
        } = { telegramId: tgId, telegramUsername: username };
        if (fullName && !me.fullName) {
          data.fullName = fullName;
        }
        await tx.user.update({ where: { id: me.id }, data });
      });

      return this.issueTokensForUser(me.id);
    }

    const data: {
      telegramId: bigint;
      telegramUsername: string | null;
      fullName?: string | null;
    } = { telegramId: tgId, telegramUsername: username };
    if (fullName && !me.fullName) {
      data.fullName = fullName;
    }
    await this.prisma.user.update({ where: { id: me.id }, data });
    return this.issueTokensForUser(me.id);
  }

  /** Добавить email и пароль к аккаунту, вошедшему только через Telegram (JWT). */
  async linkEmail(userId: string, dto: LinkEmailDto): Promise<TokensDto> {
    const email = dto.email.trim().toLowerCase();
    const me = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!me?.isActive) {
      throw new UnauthorizedException('Пользователь не найден или отключён');
    }
    if (me.email?.trim()) {
      throw new ConflictException('В этом аккаунте уже указан email');
    }
    const taken = await this.prisma.user.findUnique({ where: { email } });
    if (taken && taken.id !== me.id) {
      throw new ConflictException('Этот email уже занят другим аккаунтом');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.user.update({
      where: { id: me.id },
      data: { email, passwordHash },
    });
    return this.issueTokensForUser(me.id);
  }

  private async parseAndVerifyTelegramLogin(body: Record<string, unknown>): Promise<{
    tgId: bigint;
    fullName: string | null;
    username: string | null;
  }> {
    const strMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || v === null) continue;
      strMap[k] = typeof v === 'string' ? v : String(v);
    }
    if (!strMap.id || !strMap.auth_date || !strMap.hash) {
      throw new BadRequestException('Нужны поля id, auth_date и hash');
    }

    const botToken = await this.getSiteSettingValue('telegram_bot_token');
    if (!botToken) {
      throw new ServiceUnavailableException(
        'Вход через Telegram не настроен: укажите токен бота в админке → Настройки → Интеграции',
      );
    }

    if (!verifyTelegramLoginWidget(strMap, botToken)) {
      throw new UnauthorizedException('Неверная подпись Telegram');
    }

    const authTs = parseInt(strMap.auth_date, 10);
    if (!Number.isFinite(authTs) || Math.abs(Date.now() / 1000 - authTs) > 86400) {
      throw new UnauthorizedException('Устаревшие данные авторизации');
    }

    let tgId: bigint;
    try {
      tgId = BigInt(strMap.id);
    } catch {
      throw new BadRequestException('Некорректный id');
    }

    const fullName =
      [strMap.first_name, strMap.last_name].filter(Boolean).join(' ').trim() || null;
    const username = strMap.username?.trim() || null;

    return { tgId, fullName, username };
  }

  private async issueTokensForUser(userId: string): Promise<TokensDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or disabled');
    }
    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email ?? '',
      role: user.role,
    });
    await this.saveRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  private async getSiteSettingValue(key: string): Promise<string | null> {
    const row = await this.prisma.siteSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : null;
  }



  async createTelegramCode(dto: LoginDto): Promise<{ code: string; expiresAt: string }> {
    const email = dto.email?.trim().toLowerCase();
    const phoneRaw = dto.phone?.trim();
    if (!email && !phoneRaw) {
      throw new BadRequestException('Укажите email или телефон');
    }
    if (email && phoneRaw) {
      throw new BadRequestException('Укажите только email или только телефон');
    }

    let user =
      email != null && email.length > 0
        ? await this.prisma.user.findUnique({ where: { email } })
        : null;

    if (!user && phoneRaw) {
      const variants = phoneLookupVariants(phoneRaw);
      if (variants.length === 0) {
        throw new BadRequestException('Неверный формат телефона');
      }
      user = await this.prisma.user.findFirst({ where: { phone: { in: variants } } });
    }

    if (!user || !user.passwordHash || !user.isActive) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    const code = String(Math.floor(100000 + Math.random() * 900000));

    await this.prisma.telegramAuthCode.updateMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    await this.prisma.telegramAuthCode.create({
      data: { userId: user.id, code, expiresAt },
    });

    return { code, expiresAt: expiresAt.toISOString() };
  }

  async refreshTelegramToken(telegramId: number, secretHeader?: string): Promise<TokensDto> {
    const secret = await this.getSiteSettingValue('telegram_bot_internal_secret');
    if (!secret || !secretHeader || secretHeader !== secret) {
      throw new UnauthorizedException('Нет доступа');
    }
    const user = await this.prisma.user.findFirst({
      where: { telegramId: BigInt(telegramId), isActive: true },
      select: { id: true },
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    await this.prisma.session.deleteMany({ where: { userId: user.id } });
    return this.issueTokensForUser(user.id);
  }

  async refresh(refreshToken: string): Promise<TokensDto> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // У пользователя может быть несколько сессий (телефон, компьютер, служба синхронизации фидов
    // под тем же логином). Раньше сверялась только самая свежая — любой новый вход где-то ещё
    // выкидывал человека из админки через 15 минут. Ищем сессию, которой принадлежит этот токен.
    const sessions = await this.prisma.session.findMany({
      where: { userId: payload.sub, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: MAX_SESSIONS_PER_USER,
    });
    let session: (typeof sessions)[number] | null = null;
    for (const s of sessions) {
      if (await bcrypt.compare(refreshToken, s.refreshTokenHash)) {
        session = s;
        break;
      }
    }
    if (!session) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or disabled');
    }

    await this.prisma.session.delete({ where: { id: session.id } });
    return this.issueTokensForUser(user.id);
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        fullName: true,
        avatarUrl: true,
        role: true,
        telegramId: true,
        telegramUsername: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    const { telegramId: _tg, ...rest } = user;
    return { ...rest, telegramLinked: _tg !== null };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('Пароли не совпадают');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user?.isActive) throw new UnauthorizedException('User not found');
    if (!user.passwordHash) {
      throw new BadRequestException('Сначала добавьте email и пароль к аккаунту');
    }
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Текущий пароль неверный');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.session.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async updateAvatar(userId: string, file: Express.Multer.File) {
    const saved = await this.media.saveUploadedFile(file, undefined, userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl: saved.url },
      select: { avatarUrl: true },
    });
    return { avatarUrl: updated.avatarUrl };
  }

  private async generateTokens(payload: JwtPayload): Promise<TokensDto> {
    const accessExpiresIn = this.config.get<string>('JWT_ACCESS_EXPIRES_IN', '15m');
    const refreshExpiresIn = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '30d');

    const signOpts = (secret: string | undefined, expiresIn: string): JwtSignOptions =>
      ({ secret, expiresIn } as JwtSignOptions);
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: payload.sub, email: payload.email, role: payload.role },
        signOpts(this.config.get<string>('JWT_ACCESS_SECRET'), accessExpiresIn),
      ),
      this.jwtService.signAsync(
        { sub: payload.sub, email: payload.email, role: payload.role },
        signOpts(this.config.get<string>('JWT_REFRESH_SECRET'), refreshExpiresIn),
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    const hash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.create({
      data: { userId, refreshTokenHash: hash, expiresAt },
    });
    // Уборка: просроченные сессии и всё сверх лимита (самые старые)
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
    const extra = await this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_SESSIONS_PER_USER,
      select: { id: true },
    });
    if (extra.length) await this.prisma.session.deleteMany({ where: { id: { in: extra.map((e) => e.id) } } });
  }

  private logAuthFailure(reason: string, identifier?: string | null): void {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.debug(
      `Auth login failed: reason=${reason} table=users id=${identifier ?? 'unknown'}`,
    );
  }

  private logAuthVerifyMs(ms: number): void {
    if (process.env.NODE_ENV === 'production') return;
    this.logger.debug(`Auth bcrypt verify: ${ms}ms table=users`);
  }
}
