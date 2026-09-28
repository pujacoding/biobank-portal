import express from 'express';
import {
  getRegistry,
  getDashboard,
  getHistory,
  getEligibleSamples,
  getBarcodeDetails,
  generateBarcode,
  generateAliquots,
  printBarcode,
  reprintBarcode,
  scanAndVerify,
  voidBarcode,
  replaceBarcode,
  regenerateBarcode,
  assignStorage,
  addToShipment,
  getPrintQueue,
  addToPrintQueue,
  processPrintQueue,
  deletePrintQueueItem,
  getAuditHistory,
  getActiveBarcode
} from '../controllers/barcodeController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Registry & Telemetry
router.get('/registry', authenticateToken, getRegistry);
router.get('/dashboard', authenticateToken, getDashboard);
router.get('/history', authenticateToken, getHistory);
router.get('/eligible-samples', authenticateToken, getEligibleSamples);
router.get('/details/:identifier', authenticateToken, getBarcodeDetails);

// Print Queue
router.get('/print-queue', authenticateToken, getPrintQueue);
router.post('/print-queue/add', authenticateToken, addToPrintQueue);
router.post('/print-queue/process', authenticateToken, processPrintQueue);
router.delete('/print-queue/:id', authenticateToken, deletePrintQueueItem);

// Audit History
router.get('/audit-history', authenticateToken, getAuditHistory);

// Core Barcode Operations
router.post('/generate', authenticateToken, generateBarcode);
router.post('/generate-aliquots', authenticateToken, generateAliquots);
router.post('/print', authenticateToken, printBarcode);
router.post('/reprint', authenticateToken, reprintBarcode);
router.post('/scan-verify', authenticateToken, scanAndVerify);
router.post('/void', authenticateToken, voidBarcode);
router.post('/replace', authenticateToken, replaceBarcode);
router.post('/regenerate', authenticateToken, regenerateBarcode);

// Storage & Shipment Integrations
router.post('/assign-storage', authenticateToken, assignStorage);
router.post('/move-storage', authenticateToken, assignStorage);
router.post('/add-to-shipment', authenticateToken, addToShipment);

// Backward-compatible specimen barcode lookup
router.get('/:sample_id', authenticateToken, getActiveBarcode);

export default router;
