import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { initDb } from './utils/dbInit.js';
import errorHandler from './middleware/errorHandler.js';

// Routes
import authRoutes from './routes/auth.js';
import sampleRoutes from './routes/samples.js';
import consentRoutes from './routes/consent.js';
import barcodeRoutes from './routes/barcode.js';
import auditRoutes from './routes/audit.js';
import userRoutes from './routes/users.js';
import integrationRoutes from './routes/integration.js';
import specimenTypeRoutes from './routes/specimenTypes.js';
import reportsRoutes from './routes/reports.js';

const app = express();
const PORT = process.env.PORT || 5001;

// =========================
// MIDDLEWARES
// =========================
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// =========================
// ROUTES
// =========================
app.use('/api/auth', authRoutes);
app.use('/api/samples', sampleRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integration', integrationRoutes);
app.use('/api/specimen-types', specimenTypeRoutes);
app.use('/api/reports', reportsRoutes);

// =========================
// HEALTH CHECK
// =========================
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    postgresActive: !!process.env.DATABASE_URL
  });
});

// =========================
// ROOT ROUTE
// =========================
app.get('/', (req, res) => {
  res.send('AURA Biobank Lab Portal API is running 🚀');
});

// =========================
// ERROR HANDLER
// =========================
app.use(errorHandler);

// =========================
// START SERVER
// =========================
const startServer = async () => {
  try {
    // Bootstrap tables & seeds
    await initDb();

    app.listen(PORT, () => {
      console.log(`[SERVER] Running on port ${PORT}`);
      console.log(`[SERVER] Health check: http://localhost:${PORT}/api/status`);
    });

  } catch (error) {
    console.error('[FATAL] Server failed to start:', error.message);
    process.exit(1);
  }
};

startServer();