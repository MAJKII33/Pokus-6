const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class MedtrumScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async loadBrowserConfig() {
    try {
      const configPath = path.join(__dirname, '..', 'config', 'browser-config.json');
      const configData = await fs.readFile(configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      logger.warn('Browser config not found, using defaults');
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    const isProduction = process.env.REPL_DEPLOYMENT || process.env.NODE_ENV === 'production';
    
    // Use optimized Chrome configuration for all environments (including preview)
    logger.info('Using optimized Chrome configuration for containerized environment');
    return {
      launchOptions: {
        headless: true,
        executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-extensions',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--disable-blink-features=AutomationControlled',
          '--exclude-switches=--enable-automation',
          '--memory-pressure-off',
          '--max_old_space_size=4096',
          '--single-process',
          '--no-zygote',
          '--disable-software-rasterizer'
        ],
        defaultViewport: { width: 1366, height: 768 },
        timeout: 30000,
        protocolTimeout: 30000
      },
      pageOptions: {
        defaultTimeout: 20000,
        defaultNavigationTimeout: 20000
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    };
  }



  async init() {
    logger.info('Launching browser for Medtrum scraping...');
    
    // Working configuration based on successful test
    const launchOptions = {
      headless: true,
      executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process',
        '--no-zygote'
      ],
      defaultViewport: { width: 1366, height: 768 }
    };
    
    try {
      this.browser = await puppeteer.launch(launchOptions);
      logger.info('Browser launched successfully');
    } catch (error) {
      logger.error('Failed to launch browser:', error.message);
      throw new Error(`Browser launch failed: ${error.message}`);
    }
    
    this.page = await this.browser.newPage();
    
    // Set timeouts for containerized environment
    this.page.setDefaultTimeout(20000);
    this.page.setDefaultNavigationTimeout(20000);
    
    // Set user agent to appear like Safari
    await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15');
    
    logger.info('Browser initialized successfully');
  }

  async login() {
    if (!process.env.MEDTRUM_EMAIL || !process.env.MEDTRUM_PASSWORD) {
      throw new Error('Medtrum credentials not configured');
    }

    logger.info('Navigating to Medtrum login page...');
    await this.page.goto('https://easyview.medtrum.eu/v3/#/login/login', { 
      waitUntil: 'networkidle2' 
    });

    logger.info('Filling login form...');
    await this.page.waitForSelector('input[type="email"]');
    await this.page.type('input[type="email"]', process.env.MEDTRUM_EMAIL);
    await this.page.type('input[type="password"]', process.env.MEDTRUM_PASSWORD);

    logger.info('Submitting login...');
    await Promise.all([
      this.page.waitForNavigation({ waitUntil: 'networkidle2' }),
      this.page.click('button[type="submit"], .login-btn, button:contains("Sign in")')
    ]);

    logger.info('Login successful');
  }

  async scrapeGlucoseData() {
    try {
      await this.init();
      await this.login();

      logger.info('Navigating to carer connection page...');
      await this.page.goto('https://easyview.medtrum.eu/v3/#/carerConnection', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      logger.info('Waiting for data table to load...');
      // Wait for either the table or a loading indicator
      await Promise.race([
        this.page.waitForSelector('.el-table', { timeout: 8000 }),
        this.page.waitForSelector('.el-loading-mask', { timeout: 2000 }).then(() => 
          this.page.waitForSelector('.el-table', { timeout: 12000 })
        )
      ]);

      logger.info('Extracting glucose data...');
      const glucoseData = await this.page.evaluate(() => {
        const rows = document.querySelectorAll('.el-table tbody tr');
        const data = [];

        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 2) {
            const patientName = cells[0].textContent.trim();
            const sgText = cells[1].textContent.trim();

            // Extract numeric value from SG text
            const sgMatch = sgText.match(/(\d+\.?\d*)/);
            if (sgMatch) {
              const sgValue = parseFloat(sgMatch[1]);
              
              // Convert mmol/L to mg/dL if needed (assuming mmol/L if value < 30)
              const glucoseMgDl = sgValue < 30 ? Math.round(sgValue * 18.0182) : Math.round(sgValue);

              data.push({
                patientName: patientName,
                glucose: glucoseMgDl,
                unit: 'mg/dL',
                timestamp: new Date().toISOString(),
                originalValue: sgText
              });
            }
          }
        });

        return data;
      });

      logger.info(`Successfully extracted ${glucoseData.length} glucose readings`);
      glucoseData.forEach(entry => {
        logger.info(`- ${entry.patientName}: ${entry.glucose} ${entry.unit}`);
      });

      return glucoseData;

    } catch (error) {
      logger.error('Failed to scrape glucose data:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  async cleanup() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('Browser cleanup completed');
  }
}

module.exports = MedtrumScraper;