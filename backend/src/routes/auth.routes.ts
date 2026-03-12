import { Router } from 'express';
import { register, login } from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

router.post('/register', validateBody(['name', 'phone', 'password']), register);
router.post('/login', validateBody(['phone', 'password']), login);

export default router;
