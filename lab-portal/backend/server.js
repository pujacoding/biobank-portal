import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initDb } from './database.js';

// Load route controllers
import authRoutes from './routes/auth.js';
import sampleRoutes from './routes/samples.js';
import consentRoutes from './routes/consent.js';
import barcodeRoutes from './routes/barcode.js';
import auditRoutes from './routes/audit.js';
import userRoutes from './routes/users.js';
import integrationRoutes from './routes/integration.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Bind route handlers
app.use('/api/auth', authRoutes);
app.use('/api/samples', sampleRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/barcode', barcodeRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/users', userRoutes);
app.use('/api/integration', integrationRoutes);

// Health Check / Diagnostics
app.get('/api/status', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    postgresActive: !!process.env.DATABASE_URL
  });
});

// Root route
app.get('/', (req, res) => {
  res.send("AURA Biobank Lab Portal REST API is running.");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Express Error Handler:", err);
  res.status(500).json({ error: "Internal server error occurred on the API backend." });
});

// Initialize database and start listening
const startServer = async () => {
  try {
    // Bootstrap tables & seeds
    await initDb();
    
    app.listen(PORT, () => {
      console.log(`[SERVER] AURA Lab Portal API running on port ${PORT}`);
      console.log(`[SERVER] Local Health Check: http://localhost:${PORT}/api/status`);
    });
  } catch (error) {
    console.error("FATAL: Failed to bootstrap database or start server:", error);
    process.exit(1);
  }
};

startServer();
