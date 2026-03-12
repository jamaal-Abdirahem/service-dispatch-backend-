import { Response } from 'express';
import asyncHandler from 'express-async-handler';
import { AuthRequest } from '../middleware/auth.middleware';
import { RequestService } from '../services/request.service';
import { Role } from '@prisma/client';
import prisma from '../utils/prisma';

export const getRequests = asyncHandler(async (req: AuthRequest, res: Response) => {
  const filters = req.user?.role === Role.CLIENT ? { clientId: req.user?.id } : {};
  const requests = await RequestService.getRequests(filters);
  res.json({ success: true, data: requests });
});

export const getTechnicianJobs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const jobs = await RequestService.getTechnicianJobs(userId);
  res.json({ success: true, data: jobs });
});

// Access control: CLIENTs can only see their own requests; TECHNICIANs only see requests assigned to them.
export const getRequestById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const request = await RequestService.getRequestById(id);

  if (!request) {
    res.status(404);
    throw new Error('Request not found');
  }

  const userId = req.user?.id;
  const role = req.user?.role;

  // CLIENT can only view requests they own.
  if (role === Role.CLIENT && request.clientId !== userId) {
    res.status(403);
    throw new Error('Forbidden: you do not have access to this request');
  }

  // TECHNICIAN can only view requests they are assigned to.
  if (role === Role.TECHNICIAN) {
    const technician = await prisma.technician.findUnique({ where: { userId } });
    if (!technician || request.technicianId !== technician.id) {
      res.status(403);
      throw new Error('Forbidden: you are not assigned to this request');
    }
  }

  res.json({ success: true, data: request });
});

export const createRequest = asyncHandler(async (req: AuthRequest, res: Response) => {
  const clientId = req.user?.id;
  if (!clientId) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const serviceRequest = await RequestService.createRequest(req.body, clientId);
  res.status(201).json({ success: true, data: serviceRequest });
});

export const assignTechnician = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { technicianId } = req.body;

  if (!technicianId) {
    res.status(400);
    throw new Error('technicianId is required');
  }

  const updatedRequest = await RequestService.assignTechnician(id, technicianId);
  res.json({ success: true, data: updatedRequest });
});

export const technicianArrived = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id as string;

  const updatedRequest = await RequestService.markArrived(id, userId);
  res.json({ success: true, data: updatedRequest });
});

export const completeService = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const userId = req.user?.id as string;

  const updatedRequest = await RequestService.completeService(id, userId);
  res.json({ success: true, data: updatedRequest });
});

export const approveService = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const clientId = req.user?.id as string;

  await RequestService.approveService(id, clientId);
  res.json({ success: true, message: 'Service approved' });
});

export const confirmPayment = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const clientId = req.user?.id as string;
  const { amount } = req.body;

  if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
    res.status(400);
    throw new Error('A valid positive `amount` is required');
  }

  const updatedRequest = await RequestService.confirmPayment(id, clientId, amount);
  res.json({ success: true, data: updatedRequest });
});
