import { Router } from 'express';
import { authenticate, authorizeRole } from '../middleware/auth.middleware';
import { getAllUsers, getAllTechnicians, getUserContext, updateTechnicianAvailability } from '../controllers/user.controller';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Get current logged in user details
router.get('/me', getUserContext);

// Get all users (Admin or Operator only)
router.get('/', authorizeRole([Role.ADMIN, Role.OPERATOR]), getAllUsers);

// Get all technicians (Admin or Operator to assign tech)
router.get('/technicians', authorizeRole([Role.ADMIN, Role.OPERATOR]), getAllTechnicians);

// Update technician availability (Admin or Operator)
router.patch('/technicians/:id/availability', authorizeRole([Role.ADMIN, Role.OPERATOR]), updateTechnicianAvailability);

export default router;
