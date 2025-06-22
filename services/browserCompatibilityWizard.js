const puppeteer = require('puppeteer');
const logger = require('../utils/logger');
const fs = require('fs').promises;
const path = require('path');

class BrowserCompatibilityWizard {
  async getCompatibilityStatus() {
    try {
      const configPath = path.join(__dirname, '..', 'config', 'browser-config.json');
      const configExists = await fs.access(configPath).then(() => true).catch(() => false);
      
      if (configExists) {
        const configData = await fs.readFile(configPath, 'utf8');
        const config = JSON.parse(configData);
        return {
          configured: true,
          browserName: config.browserName,
          environment: config.environment,
          timestamp: config.timestamp
        };
      } else {
        return {
          configured: false,
          message: 'Browser configuration not found'
        };
      }
    } catch (error) {
      return {
        configured: false,
        error: error.message
      };
    }
  }

  async runCompatibilityCheck() {
    const report = {
      timestamp: new Date().toISOString(),
      environment: process.env.REPL_DEPLOYMENT ? 'production' : 'preview',
      tests: []
    };

    // Test 1: Browser launch
    try {
      logger.info('Testing browser launch...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const version = await browser.version();
      await browser.close();
      
      report.tests.push({
        name: 'Browser Launch',
        status: 'PASS',
        message: `Chrome launched successfully: ${version}`
      });
    } catch (error) {
      report.tests.push({
        name: 'Browser Launch',
        status: 'FAIL',
        message: error.message
      });
    }

    // Test 2: Production configuration
    try {
      logger.info('Testing production configuration...');
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--single-process'
        ]
      });
      
      const page = await browser.newPage();
      await page.goto('https://example.com');
      await browser.close();
      
      report.tests.push({
        name: 'Production Configuration',
        status: 'PASS',
        message: 'Production Chrome configuration working'
      });
    } catch (error) {
      report.tests.push({
        name: 'Production Configuration',
        status: 'FAIL',
        message: error.message
      });
    }

    // Test 3: Medtrum connectivity
    try {
      logger.info('Testing Medtrum connectivity...');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.goto('https://easyview.medtrum.eu', { timeout: 10000 });
      await browser.close();
      
      report.tests.push({
        name: 'Medtrum Connectivity',
        status: 'PASS',
        message: 'Medtrum EasyView accessible'
      });
    } catch (error) {
      report.tests.push({
        name: 'Medtrum Connectivity',
        status: 'FAIL',
        message: error.message
      });
    }

    return report;
  }

  async createOptimalConfiguration() {
    const isProduction = process.env.REPL_DEPLOYMENT || process.env.NODE_ENV === 'production';
    
    const config = {
      browserName: 'Puppeteer Chrome (Bundled)',
      executablePath: null,
      environment: isProduction ? 'production' : 'preview',
      timestamp: new Date().toISOString(),
      launchOptions: {
        headless: true,
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
          '--single-process'
        ],
        defaultViewport: { width: 1366, height: 768 },
        timeout: isProduction ? 30000 : 60000,
        protocolTimeout: isProduction ? 30000 : 60000
      },
      pageOptions: {
        defaultTimeout: isProduction ? 20000 : 30000,
        defaultNavigationTimeout: isProduction ? 20000 : 30000
      },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
    };

    const configPath = path.join(__dirname, '..', 'config', 'browser-config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    logger.info('Optimal browser configuration created');
    return config;
  }
}

module.exports = BrowserCompatibilityWizard;