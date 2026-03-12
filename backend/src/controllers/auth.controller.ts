import { Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { AuthService } from '../services/auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  await AuthService.registerUser(req.body);
  res.status(201).json({ success: true, message: 'User created successfully' });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const data = await AuthService.loginUser(req.body);
  res.json({ success: true, ...data });
});
