import prisma from '../utils/prisma';
import { AppError } from '../utils/AppError';
import { RequestStatus, PaymentStatus, Prisma } from '@prisma/client';

export class RequestService {
  static async createRequest(data: any, clientId: string) {
    const { problem, location, phone, clientName } = data;

    return prisma.serviceRequest.create({
      data: {
        clientId,
        problem,
        location,
        phone,
        clientName,
        status: RequestStatus.REPORTED
      }
    });
  }

  static async getRequests(filters: any = {}) {
    return prisma.serviceRequest.findMany({
      where: filters,
      orderBy: { createdAt: 'desc' },
      include: {
        client: { select: { name: true, phone: true } },
        technician: {
          include: { user: { select: { name: true, phone: true } } }
        }
      }
    });
  }

  static async getRequestById(id: string) {
    return prisma.serviceRequest.findUnique({
      where: { id },
      include: {
        client: { select: { name: true, phone: true } },
        technician: {
          include: { user: { select: { name: true, phone: true } } }
        },
        payment: true
      }
    });
  }

  static async getTechnicianJobs(userId: string) {
    const technician = await prisma.technician.findUnique({ where: { userId } });
    if (!technician) throw new AppError('Technician profile not found', 404);

    return prisma.serviceRequest.findMany({
      where: { technicianId: technician.id },
      orderBy: { updatedAt: 'desc' }
    });
  }

  // RACE-SAFE: assign + lock technician atomically.
  // The updateMany on Technician uses WHERE available=true — if a concurrent
  // request already claimed this tech, count will be 0 and we throw.
  static async assignTechnician(requestId: string, technicianId: string) {
    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest) throw new AppError('Request not found', 404);
    if (serviceRequest.status !== RequestStatus.REPORTED) {
      throw new AppError('Request cannot be assigned in its current state', 400);
    }

    // Verify tech exists (outside tx is fine — we re-verify availability inside)
    const technician = await prisma.technician.findUnique({ where: { id: technicianId } });
    if (!technician) throw new AppError('Technician does not exist', 404);

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Atomically mark the technician unavailable — only succeeds if still available.
      // This is the race-safe check: replaces the pre-transaction read.
      const lockResult = await tx.technician.updateMany({
        where: { id: technicianId, available: true },
        data: { available: false },
      });

      if (lockResult.count === 0) {
        throw new AppError('Technician is no longer available — please select another', 400);
      }

      return tx.serviceRequest.update({
        where: { id: requestId },
        data: {
          technicianId,
          status: RequestStatus.ASSIGNED,
        },
      });
    });
  }

  static async markArrived(requestId: string, userId: string) {
    const technician = await prisma.technician.findUnique({ where: { userId } });
    if (!technician) throw new AppError('Only assigned technician can mark arrival', 403);

    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest || serviceRequest.technicianId !== technician.id) {
      throw new AppError('Unauthorized for this request', 403);
    }

    if (serviceRequest.status !== RequestStatus.ASSIGNED) {
      throw new AppError('Status must be ASSIGNED to mark arrived', 400);
    }

    return prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: RequestStatus.IN_PROGRESS }
    });
  }

  static async completeService(requestId: string, userId: string) {
    // Explicitly verify the caller is a registered technician.
    const technician = await prisma.technician.findUnique({ where: { userId } });
    if (!technician) {
      throw new AppError('Only an assigned technician can complete a service', 403);
    }

    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest || serviceRequest.technicianId !== technician.id) {
      throw new AppError('Unauthorized for this request', 403);
    }

    if (serviceRequest.status !== RequestStatus.IN_PROGRESS) {
      throw new AppError('Status must be IN_PROGRESS to complete', 400);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.COMPLETED }
      });

      // Free up the technician so they can accept new jobs.
      await tx.technician.update({
        where: { id: technician.id },
        data: { available: true }
      });

      return updated;
    });
  }

  // approveService is a client-facing validation gate (no status change needed —
  // status stays COMPLETED until payment is confirmed). Returns the request for confirmation.
  static async approveService(requestId: string, clientId: string) {
    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest || serviceRequest.clientId !== clientId) {
      throw new AppError('Unauthorized for this request', 403);
    }

    if (serviceRequest.status !== RequestStatus.COMPLETED) {
      throw new AppError('Status must be COMPLETED to approve', 400);
    }

    // Approval is a client acknowledgement; status advances on payment (confirmPayment).
    return serviceRequest;
  }

  static async confirmPayment(requestId: string, clientId: string, amount: number) {
    const serviceRequest = await prisma.serviceRequest.findUnique({ where: { id: requestId } });
    if (!serviceRequest || serviceRequest.clientId !== clientId) {
      throw new AppError('Unauthorized for this request', 403);
    }

    if (serviceRequest.status !== RequestStatus.COMPLETED) {
      throw new AppError('Service must be COMPLETED and approved before payment', 400);
    }

    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.payment.create({
        data: {
          requestId,
          amount: Number(amount),
          status: PaymentStatus.SUCCESS
        }
      });

      return tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: RequestStatus.PAID }
      });
    });
  }
}
