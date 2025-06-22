const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('../utils/logger');

// Use stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class ProductionScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async quickSync() {
    const startTime = Date.now();
    
    try {
      logger.info('Starting production glucose data sync...');
      
      // Detect environment and configure Chrome accordingly
      const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;
      const isFlyio = process.env.FLY_APP_NAME !== undefined;
      const isReplit = process.env.REPLIT_DEPLOYMENT !== undefined;
      
      let executablePath;
      let environment;
      
      if (isRailway) {
        executablePath = '/usr/bin/chromium';
        environment = 'Railway.app';
      } else if (isFlyio) {
        executablePath = '/usr/bin/chromium';
        environment = 'Fly.io';
      } else if (isReplit) {
        executablePath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium-browser';
        environment = 'Replit';
      } else {
        executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
        environment = 'Development';
      }
      
      logger.info(`Using ${environment} Chrome environment`);
      
      const launchConfig = {
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--window-size=1920,1080',
          '--disable-accelerated-2d-canvas',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-plugins',
          '--disable-images',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--no-default-browser-check',
          '--memory-pressure-off',
          '--max_old_space_size=4096',
          '--disable-blink-features=AutomationControlled'
        ],
        defaultViewport: { width: 1280, height: 800 },
        timeout: 60000,
        protocolTimeout: 60000,
        ignoreHTTPSErrors: true
      };

      this.browser = await puppeteer.launch(launchConfig);
      this.page = await this.browser.newPage();
      
      // Enhanced browser spoofing
      await this.page.setJavaScriptEnabled(true);
      await this.page.setViewport({ width: 1280, height: 800 });
      
      // Set timeouts
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(60000);
      
      // Error handling
      this.page.on('error', (error) => {
        logger.error('Page error:', error.message);
      });
      
      this.page.on('pageerror', (error) => {
        logger.error('Page script error:', error.message);
      });
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15');

      // Navigate to Medtrum login
      logger.info('Navigating to Medtrum login page...');
      await this.page.goto('https://easyview.medtrum.com/#/login', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
      
      // Wait for page load
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Perform login
      logger.info('Performing login...');
      await this.page.type('input[type="text"]', process.env.MEDTRUM_USERNAME);
      await this.page.type('input[type="password"]', process.env.MEDTRUM_PASSWORD);
      await this.page.click('button[type="submit"]');
      
      // Wait for navigation after login
      await this.page.waitForNavigation({ 
        waitUntil: 'domcontentloaded', 
        timeout: 30000 
      });
      
      logger.info('Getting glucose data...');
      
      // Wait for data table to load
      await this.page.waitForSelector('.el-table', { timeout: 15000 });
      logger.info('Found data table with selector: .el-table');
      
      // Extract glucose data
      const glucoseData = await this.page.evaluate(() => {
        const rows = document.querySelectorAll('.el-table .el-table__row');
        const data = [];
        
        for (let i = 0; i < Math.min(rows.length, 3); i++) {
          const row = rows[i];
          const cells = row.querySelectorAll('.el-table__cell');
          
          if (cells.length >= 3) {
            const timeText = cells[0]?.textContent?.trim();
            const glucoseText = cells[1]?.textContent?.trim();
            const statusText = cells[2]?.textContent?.trim();
            
            if (timeText && glucoseText) {
              const glucose = parseFloat(glucoseText.replace(/[^\d.]/g, ''));
              
              if (!isNaN(glucose) && glucose > 0) {
                data.push({
                  time: timeText,
                  glucose: glucose,
                  status: statusText || 'Unknown',
                  timestamp: new Date().toISOString()
                });
              }
            }
          }
        }
        
        return data;
      });
      
      const elapsedTime = Date.now() - startTime;
      logger.info(`Production sync completed: ${glucoseData.length} readings extracted in ${elapsedTime}ms`);
      
      await this.cleanup();
      return glucoseData;
      
    } catch (error) {
      logger.error('Production sync failed:', error.message);
      await this.cleanup();
      throw error;
    }
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    } catch (error) {
      logger.error('Cleanup failed:', error.message);
    }
  }
}

module.exports = ProductionScraper;