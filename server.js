const express = require('express');
const path = require('path');
const logger = require('./utils/logger');
const Scheduler = require('./services/scheduler');
const QuickScraper = require('./services/quickScraper');
const NightscoutSync = require('./services/nightscoutSync');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize service instances
const scheduler = new Scheduler();
const nightscoutSync = new NightscoutSync();

// Serve static files
app.use(express.static('public'));

// Global sync status
let syncStatus = {
  lastSync: null,
  status: 'idle',
  lastError: null,
  totalSyncs: 0,
  lastData: []
};

// Health check endpoint for Fly.io
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Detailed health check
app.get('/health/status', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'medtrum-nightscout-sync',
    port: PORT,
    sync_status: syncStatus.status,
    environment: process.env.NODE_ENV || 'development'
  });
});

// API Routes
app.get('/api/status', (req, res) => {
  res.json(syncStatus);
});

app.post('/api/sync-now', async (req, res) => {
  if (syncStatus.status === 'running') {
    return res.status(409).json({ error: 'Sync already in progress' });
  }

  try {
    syncStatus.status = 'running';
    syncStatus.lastError = null;
    
    logger.info('Manual sync triggered');
    await performSync();
    
    res.json({ message: 'Sync completed successfully', status: syncStatus });
  } catch (error) {
    logger.error('Manual sync failed:', error);
    syncStatus.status = 'error';
    syncStatus.lastError = error.message;
    res.status(500).json({ error: error.message });
  }
});

// Main sync function
async function performSync() {
  try {
    syncStatus.status = 'running';
    logger.info('Starting sync process');

    // Use QuickScraper - proven stable
    logger.info('Using QuickScraper for Fly.io environment...');
    const browserScraper = new QuickScraper();
    const medtrumData = await browserScraper.quickSync();
    logger.info('QuickScraper succeeded');
    
    if (!medtrumData || medtrumData.length === 0) {
      throw new Error('No data received from Medtrum');
    }

    logger.info(`Scraped ${medtrumData.length} records from Medtrum using QuickScraper`);
    syncStatus.lastData = medtrumData;

    // Sync to Nightscout
    logger.info('Syncing to Nightscout...');
    const syncResult = await nightscoutSync.syncData(medtrumData);
    
    logger.info(`Sync completed. Uploaded: ${syncResult.uploaded}, Skipped: ${syncResult.skipped}`);

    // Update status
    syncStatus.lastSync = new Date().toISOString();
    syncStatus.status = 'success';
    syncStatus.totalSyncs++;
    syncStatus.lastError = null;

  } catch (error) {
    logger.error('Sync failed:', error.message);
    syncStatus.status = 'error';
    syncStatus.lastError = error.message;
    throw error;
  }
}

// Initialize and start scheduler
async function initializeApp() {
  try {
    // Check environment variables
    const requiredEnvVars = ['MEDTRUM_EMAIL', 'MEDTRUM_PASSWORD', 'NIGHTSCOUT_URL', 'NIGHTSCOUT_API_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length > 0) {
      logger.warn(`Missing environment variables: ${missingVars.join(', ')}`);
    } else {
      logger.info('All required environment variables are set');
      
      // Initialize scheduler for automatic sync
      scheduler.init(performSync);
      logger.info('Scheduler initialized successfully');
    }

    logger.info(`Medtrum-Nightscout Sync Service started on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`Region: ${process.env.FLY_REGION || 'unknown'}`);
    
  } catch (error) {
    logger.error('Failed to initialize application:', error);
  }
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  initializeApp();
});

// Graceful shutdown for Fly.io
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;