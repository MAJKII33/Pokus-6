const { chromium } = require('playwright');
const logger = require('../utils/logger');

class PlaywrightScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async quickSync() {
    const startTime = Date.now();
    
    try {
      logger.info('Starting Playwright glucose data sync...');
      
      // Launch browser with stealth configuration
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-features=VizDisplayCompositor',
          '--no-first-run',
          '--no-default-browser-check'
        ]
      });

      console.log("Playwright browser launched!");
      
      // Create context with enhanced stealth
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        ignoreHTTPSErrors: true,
        locale: 'en-US',
        timezoneId: 'Europe/Prague'
      });

      this.page = await context.newPage();
      
      // Enhanced error handling
      this.page.on('pageerror', (error) => {
        logger.error('Page script error:', error.message);
      });

      // Cloudflare bypass strategy
      logger.info('Navigating to main domain to bypass protection...');
      await this.page.goto('https://easyview.medtrum.eu', { 
        waitUntil: 'domcontentloaded',
        timeout: 60000 
      });
      
      // Wait for Cloudflare processing
      await this.page.waitForTimeout(5000);
      
      // Navigate to login via URL change
      logger.info('Navigating to login page...');
      await this.page.goto('https://easyview.medtrum.eu/v3/#/login/login', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for login form
      await this.page.waitForSelector('input[type=email]', { timeout: 30000 });
      
      // Perform login
      await this.page.fill('input[type=email]', process.env.MEDTRUM_EMAIL);
      await this.page.fill('input[type=password]', process.env.MEDTRUM_PASSWORD);
      await this.page.click('button[type=submit], button:has-text("Login"), button:has-text("Přihlásit")');

      // Wait for navigation after login
      await this.page.waitForURL(/dashboard|carer|connection/, { timeout: 30000 });

      // Navigate to carer connection page
      logger.info('Getting glucose data...');
      await this.page.goto('https://easyview.medtrum.eu/v3/#/carerConnection', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for data table
      await this.page.waitForSelector('.el-table', { timeout: 30000 });
      logger.info('Found data table with selector: .el-table');

      // Extract glucose data
      const glucoseData = await this.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('.el-table__body-wrapper tbody tr'));
        const results = [];
        
        rows.forEach(row => {
          const cols = row.querySelectorAll('td');
          if (cols.length >= 2) {
            const name = cols[0]?.innerText?.trim();
            const sgText = cols[1]?.innerText?.trim();
            
            if (name && sgText && sgText !== '--' && sgText !== 'N/A') {
              // Parse glucose value and convert to mg/dL for Nightscout
              const sgValue = parseFloat(sgText.replace(/[^\d.]/g, ''));
              if (!isNaN(sgValue) && sgValue > 0) {
                const mgdlValue = Math.round(sgValue * 18.0); // Convert mmol/L to mg/dL
                
                results.push({
                  type: 'sgv',
                  sgv: mgdlValue,
                  direction: 'Flat',
                  device: 'Medtrum-EasyView',
                  date: Date.now(),
                  dateString: new Date().toISOString(),
                  utcOffset: 0,
                  displayValue: sgValue, // Keep original mmol/L for display
                  patientName: name
                });
              }
            }
          }
        });
        
        return results;
      });

      const duration = Date.now() - startTime;
      logger.info(`Playwright sync completed: ${glucoseData.length} readings extracted in ${duration}ms`);

      return glucoseData;

    } catch (error) {
      logger.error('Playwright sync failed:', error);
      throw error;
    } finally {
      if (this.browser) {
        await this.browser.close();
      }
    }
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

module.exports = { PlaywrightScraper };