import prisma from '../utils/prisma';
import { Role } from '@prisma/client';

export class UserService {
  static async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });
  }

  static async getAllTechnicians() {
    return prisma.technician.findMany({
      include: {
        user: {
          select: { name: true, phone: true }
        }
      }
    });
  }

  static async getUserById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true
      }
    });
  }

  // New: Allow admin/operator to manually toggle technician availability.
  static async updateTechnicianAvailability(technicianId: string, available: boolean) {
    const technician = await prisma.technician.findUnique({ where: { id: technicianId } });
    if (!technician) {
      throw new Error('Technician not found');
    }

    return prisma.technician.update({
      where: { id: technicianId },
      data: { available },
      include: {
        user: { select: { name: true, phone: true } }
      }
    });
  }
}
