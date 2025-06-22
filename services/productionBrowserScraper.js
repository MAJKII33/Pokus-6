const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class ProductionBrowserScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async getProductionBrowserConfig() {
    const isProduction = process.env.REPLIT_DEPLOYMENT === 'true' || process.env.NODE_ENV === 'production';
    
    const config = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-backgrounding-occluded-windows',
        '--disable-breakpad'
      ],
      defaultViewport: null,
      timeout: 90000, // Extended timeout for production
      protocolTimeout: 120000
    };

    if (isProduction) {
      // Additional production-specific settings
      config.args.push(
        '--single-process',
        '--no-first-run',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-images',
        '--disable-javascript-harmony-shipping',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--disable-default-apps'
      );
      config.timeout = 120000; // 2 minutes for production
      config.protocolTimeout = 180000; // 3 minutes protocol timeout
    }

    return config;
  }

  async initBrowser() {
    try {
      const config = await this.getProductionBrowserConfig();
      logger.info('Initializing production browser with extended timeouts...');
      
      this.browser = await puppeteer.launch(config);
      this.page = await this.browser.newPage();
      
      // Set extended timeouts
      this.page.setDefaultTimeout(120000);
      this.page.setDefaultNavigationTimeout(120000);
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Block unnecessary resources to speed up loading
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (resourceType === 'image' || resourceType === 'stylesheet' || resourceType === 'font' || resourceType === 'media') {
          req.abort();
        } else {
          req.continue();
        }
      });

      logger.info('Production browser initialized successfully');
      return true;
      
    } catch (error) {
      logger.error('Production browser initialization failed:', error.message);
      throw error;
    }
  }

  async performProductionLogin() {
    try {
      logger.info('Starting production login process...');
      
      // Navigate to login page with retry logic
      let navigationSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.info(`Navigation attempt ${attempt}/3...`);
          await this.page.goto('https://easyview.medtrum.eu/login', {
            waitUntil: 'domcontentloaded',
            timeout: 90000
          });
          navigationSuccess = true;
          break;
        } catch (navError) {
          logger.warn(`Navigation attempt ${attempt} failed: ${navError.message}`);
          if (attempt === 3) throw navError;
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s before retry
        }
      }

      if (!navigationSuccess) {
        throw new Error('Failed to navigate to login page after 3 attempts');
      }

      // Wait for login form with extended timeout
      await this.page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 60000 });
      logger.info('Login form detected');

      // Fill credentials
      await this.page.type('input[type="email"], input[name="email"]', process.env.MEDTRUM_EMAIL);
      await this.page.type('input[type="password"], input[name="password"]', process.env.MEDTRUM_PASSWORD);
      
      // Submit form with retry logic
      let loginSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.info(`Login attempt ${attempt}/3...`);
          
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 90000 }),
            this.page.click('button[type="submit"], .login-button, .btn-login')
          ]);
          
          loginSuccess = true;
          break;
        } catch (loginError) {
          logger.warn(`Login attempt ${attempt} failed: ${loginError.message}`);
          if (attempt === 3) throw loginError;
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5s before retry
        }
      }

      if (!loginSuccess) {
        throw new Error('Failed to login after 3 attempts');
      }

      logger.info('Production login completed successfully');
      return true;
      
    } catch (error) {
      logger.error('Production login failed:', error.message);
      throw error;
    }
  }

  async extractGlucoseData() {
    try {
      logger.info('Extracting glucose data in production mode...');
      
      // Wait for data table with extended timeout
      await this.page.waitForSelector('.el-table, .data-table, table', { timeout: 60000 });
      
      // Extract glucose data
      const glucoseData = await this.page.evaluate(() => {
        // Look for glucose values in table
        const tables = document.querySelectorAll('.el-table, .data-table, table');
        
        for (const table of tables) {
          const rows = table.querySelectorAll('tr');
          for (const row of rows) {
            const cells = row.querySelectorAll('td, th');
            for (const cell of cells) {
              const text = cell.textContent.trim();
              const match = text.match(/(\d+\.?\d*)/);
              if (match) {
                const value = parseFloat(match[1]);
                if (value > 2 && value < 30) { // Reasonable glucose range
                  return {
                    glucose: value,
                    timestamp: new Date().toISOString(),
                    patientName: 'Tomáš Jun',
                    unit: 'mmol/L',
                    originalValue: text
                  };
                }
              }
            }
          }
        }
        
        // Fallback: look anywhere on page
        const allText = document.body.textContent;
        const matches = allText.match(/(\d+\.?\d*)/g);
        if (matches) {
          for (const match of matches) {
            const value = parseFloat(match);
            if (value > 3 && value < 25) {
              return {
                glucose: value,
                timestamp: new Date().toISOString(),
                patientName: 'Tomáš Jun',
                unit: 'mmol/L',
                originalValue: match
              };
            }
          }
        }
        
        return null;
      });

      if (!glucoseData) {
        throw new Error('No glucose data found on page');
      }

      logger.info(`Production glucose extraction successful: ${glucoseData.glucose} ${glucoseData.unit}`);
      return [glucoseData];
      
    } catch (error) {
      logger.error('Production glucose extraction failed:', error.message);
      throw error;
    }
  }

  async quickSync() {
    try {
      logger.info('Starting production browser scraper...');
      
      await this.initBrowser();
      await this.performProductionLogin();
      const glucoseData = await this.extractGlucoseData();
      
      logger.info(`Production browser scraper completed: ${glucoseData.length} readings`);
      return glucoseData;
      
    } catch (error) {
      logger.error('Production browser scraper failed:', error.message);
      throw error;
    } finally {
      await this.cleanup();
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
      logger.info('Production browser cleanup completed');
    } catch (error) {
      logger.warn('Cleanup error:', error.message);
    }
  }
}

module.exports = ProductionBrowserScraper;