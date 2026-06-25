import express from 'express';
import {
  getActiveTypes,
  getAllTypes,
  createType,
  updateType
} from '../controllers/specimenTypeController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/active', getActiveTypes);
router.get('/', authenticateToken, requirePermission('View Users', 'User Management'), getAllTypes);
router.post('/', authenticateToken, requirePermission('Edit User', 'User Management'), createType);
router.put('/:id', authenticateToken, requirePermission('Edit User', 'User Management'), updateType);

export default router;
