import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prisma';
import { AppError } from '../utils/AppError';
import { Role, Prisma } from '@prisma/client';

const MIN_PASSWORD_LENGTH = 8;

export class AuthService {
  static async registerUser(data: any) {
    const { name, phone, password, role } = data;

    // — Password strength guard ———————————————————————————————
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`, 400);
    }

    const userRole = role && Object.values(Role).includes(role) ? role : Role.CLIENT;

    // Check for existing phone before hashing (cheaper early exit)
    const existingUser = await prisma.user.findUnique({ where: { phone } });
    if (existingUser) {
      throw new AppError('Phone number already registered', 409);
    }

    // bcrypt rounds from env — use 12 in production for stronger hashing
    const saltRounds = parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10);
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const newUser = await tx.user.create({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          password: hashedPassword,
          role: userRole,
        },
      });

      // Automatically create the Technician profile when role is TECHNICIAN
      if (userRole === Role.TECHNICIAN) {
        await tx.technician.create({
          data: { userId: newUser.id }
        });
      }

      return newUser;
    });

    return user;
  }

  static async loginUser(data: any) {
    const { phone, password } = data;

    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET!, // guaranteed by validateEnv() at startup
      { expiresIn: '24h' }
    );

    return { token, user: { id: user.id, name: user.name, role: user.role } };
  }
}
