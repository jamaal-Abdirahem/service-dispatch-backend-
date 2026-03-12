import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { UserService } from '../services/user.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const getAllUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = await UserService.getAllUsers();
  res.json({ success: true, data: users });
});

export const getAllTechnicians = asyncHandler(async (req: Request, res: Response) => {
  const technicians = await UserService.getAllTechnicians();
  res.json({ success: true, data: technicians });
});

export const getUserContext = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401);
    throw new Error('Unauthorized');
  }

  const user = await UserService.getUserById(userId);
  res.json({ success: true, data: user });
});

// New: Admin/Operator toggles a technician's availability manually.
export const updateTechnicianAvailability = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { available } = req.body;

  if (typeof available !== 'boolean') {
    res.status(400);
    throw new Error('`available` must be a boolean');
  }

  const updated = await UserService.updateTechnicianAvailability(id, available);
  res.json({ success: true, data: updated });
});
