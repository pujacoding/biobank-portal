import express from 'express';
import {
  getDashboard,
  getHistory,
  generateBarcode,
  printBarcode,
  reprintBarcode,
  regenerateBarcode,
  getActiveBarcode
} from '../controllers/barcodeController.js';
import { authenticateToken, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.get('/dashboard', authenticateToken, requirePermission('View Sample', 'Sample Management'), getDashboard);
router.get('/history', authenticateToken, requirePermission('Print QR', 'QR Management'), getHistory);
router.post('/generate', authenticateToken, requirePermission('Generate QR', 'QR Management'), generateBarcode);
router.post('/print', authenticateToken, requirePermission('Print QR', 'QR Management'), printBarcode);
router.post('/reprint', authenticateToken, requirePermission('Reprint QR', 'QR Management'), reprintBarcode);
router.post('/regenerate', authenticateToken, regenerateBarcode);
router.get('/:sample_id', authenticateToken, requirePermission('View Sample', 'Sample Management'), getActiveBarcode);

export default router;
