import { Router } from 'express';
import { authenticate, authorizeRole } from '../middleware/auth.middleware';
import {
  createRequest,
  assignTechnician,
  technicianArrived,
  submitEstimate,
  approveEstimate,
  startWork,
  completeService,
  approveService,
  confirmPayment,
  getRequests,
  getTechnicianJobs,
  getRequestById
} from '../controllers/request.controller';
import { Role } from '@prisma/client';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

router.use(authenticate);

// --- READ Endpoints ---

// Get all requests (filtered to own requests if CLIENT, all if OPERATOR/ADMIN)
router.get('/', getRequests);

// NOTE: /technician MUST remain defined before /:id so Express resolves the
// static segment first and does not treat "technician" as a request ID param.
router.get('/technician', authorizeRole([Role.TECHNICIAN]), getTechnicianJobs);

// Get specific request details (controller enforces ownership for CLIENT)
router.get('/:id', getRequestById);

// --- WRITE Endpoints ---

// Client and Operator can create requests
router.post(
  '/',
  authorizeRole([Role.CLIENT, Role.OPERATOR]),
  validateBody(['clientName', 'phone', 'location', 'problem', 'vehicleType']),
  createRequest
);

// Operator assigns technician
router.post('/:id/assign', authorizeRole([Role.OPERATOR, Role.ADMIN]), assignTechnician);

// Technician marks arrival
router.post('/:id/arrived', authorizeRole([Role.TECHNICIAN]), technicianArrived);

// Technician submits report and budget estimate
router.post('/:id/estimate', authorizeRole([Role.TECHNICIAN]), submitEstimate);

// Client approves budget estimate
router.post('/:id/approve-estimate', authorizeRole([Role.CLIENT]), approveEstimate);

// Technician starts work
router.post('/:id/start-work', authorizeRole([Role.TECHNICIAN]), startWork);

// Technician marks service complete
router.post('/:id/complete', authorizeRole([Role.TECHNICIAN]), completeService);

// Client approves the completed service
router.post('/:id/approve', authorizeRole([Role.CLIENT]), approveService);

// Client pays the bill
router.post('/:id/pay', authorizeRole([Role.CLIENT]), confirmPayment);

export default router;
