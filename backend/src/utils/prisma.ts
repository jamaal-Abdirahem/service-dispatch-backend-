import { PrismaClient } from '@prisma/client';

// Singleton pattern: prevents multiple PrismaClient instances
// during development hot-reload (ts-node / nodemon).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
