const cron = require('node-cron');
const logger = require('../utils/logger');

class Scheduler {
  constructor() {
    this.task = null;
    this.syncFunction = null;
    this.isRunning = false;
  }

  init(syncFunction) {
    this.syncFunction = syncFunction;
    
    // Production schedule: every minute for 24/7/365 monitoring
    const schedule = process.env.SYNC_SCHEDULE || '* * * * *';
    const timezone = process.env.TZ || "Europe/Prague";
    
    logger.info(`Initializing scheduler with cron: ${schedule}, timezone: ${timezone}`);
    console.log(`[SCHEDULER] Initializing with cron: ${schedule}, timezone: ${timezone}`);
    
    if (!this.syncFunction || typeof this.syncFunction !== 'function') {
      logger.error('Sync function is not valid');
      console.error('[SCHEDULER] ERROR: Sync function is not valid');
      return;
    }
    
    try {
      this.task = cron.schedule(schedule, async () => {
        const timestamp = new Date().toISOString();
        logger.info(`Scheduled sync triggered at ${timestamp}`);
        console.log(`[SCHEDULER] Sync triggered at ${timestamp}`);
        
        // Prevent overlapping executions
        if (this.isRunning) {
          logger.warn('Previous sync still running, skipping this execution');
          console.log('[SCHEDULER] Previous sync still running, skipping');
          return;
        }
        
        this.isRunning = true;
        const startTime = Date.now();
        
        try {
          await this.syncFunction();
          const duration = Date.now() - startTime;
          logger.info(`Scheduled sync completed successfully in ${duration}ms`);
          console.log(`[SCHEDULER] Sync completed successfully in ${duration}ms`);
        } catch (error) {
          logger.error('Scheduled sync failed:', error);
          console.error('[SCHEDULER] Sync failed:', error.message);
        } finally {
          this.isRunning = false;
        }
      }, {
        scheduled: true,
        timezone: timezone,
        recoverMissedExecutions: false
      });

      logger.info('Scheduler initialized and started successfully');
      console.log('[SCHEDULER] Initialized and started successfully');
      
      // Test scheduler validity
      if (cron.validate(schedule)) {
        logger.info('Cron schedule is valid');
        console.log('[SCHEDULER] Cron schedule is valid');
      } else {
        logger.error('Invalid cron schedule');
        console.error('[SCHEDULER] ERROR: Invalid cron schedule');
      }
      
    } catch (error) {
      logger.error('Failed to initialize scheduler:', error);
      console.error('[SCHEDULER] Failed to initialize:', error.message);
    }
  }

  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Scheduler stopped');
    }
  }

  start() {
    if (this.task) {
      this.task.start();
      logger.info('Scheduler started');
    }
  }
}

module.exports = Scheduler;