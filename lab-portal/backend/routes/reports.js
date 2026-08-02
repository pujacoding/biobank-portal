import express from 'express';
import {
  getDashboardAnalytics,
  getSpecimenInventory,
  getSampleCollection,
  getSampleProcessing,
  getConsentReport,
  getInventoryReport,
  getStorageReport,
  getShipmentReport,
  getSpecimenReleaseReport,
  getDisposalReport,
  getQCReport,
  getTemperatureReport,
  getChainOfCustodyReport,
  getAuditTrailReport,
  getUserActivityReport,
  getFreezerUtilizationReport,
  getExpiryReport,
  getEmptyStorageReport
} from '../controllers/reportsController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.get('/dashboard', authenticateToken, getDashboardAnalytics);
router.get('/specimen-inventory', authenticateToken, getSpecimenInventory);
router.get('/sample-collection', authenticateToken, getSampleCollection);
router.get('/sample-processing', authenticateToken, getSampleProcessing);
router.get('/consent', authenticateToken, getConsentReport);
router.get('/inventory', authenticateToken, getInventoryReport);
router.get('/storage', authenticateToken, getStorageReport);
router.get('/shipment', authenticateToken, getShipmentReport);
router.get('/releases', authenticateToken, getSpecimenReleaseReport);
router.get('/disposal', authenticateToken, getDisposalReport);
router.get('/qc', authenticateToken, getQCReport);
router.get('/temperature', authenticateToken, getTemperatureReport);
router.get('/chain-of-custody', authenticateToken, getChainOfCustodyReport);
router.get('/audit', authenticateToken, getAuditTrailReport);
router.get('/users', authenticateToken, getUserActivityReport);
router.get('/freezer-utilization', authenticateToken, getFreezerUtilizationReport);
router.get('/expiry', authenticateToken, getExpiryReport);
router.get('/empty-storage', authenticateToken, getEmptyStorageReport);

export default router;
