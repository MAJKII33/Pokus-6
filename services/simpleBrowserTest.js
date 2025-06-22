const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class SimpleBrowserTest {
  async testBrowser() {
    logger.info('Testing basic browser functionality...');
    
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
      ]
    };
    
    let browser = null;
    let page = null;
    
    try {
      browser = await puppeteer.launch(launchOptions);
      logger.info('Browser launched successfully');
      
      page = await browser.newPage();
      logger.info('New page created successfully');
      
      await page.goto('https://httpbin.org/get', { waitUntil: 'networkidle2' });
      logger.info('Navigation test successful');
      
      const title = await page.title();
      logger.info(`Page title: ${title}`);
      
      return { success: true, message: 'Browser test completed successfully' };
      
    } catch (error) {
      logger.error('Browser test failed:', error.message);
      return { success: false, error: error.message };
    } finally {
      if (browser) {
        await browser.close();
        logger.info('Browser closed');
      }
    }
  }
}

module.exports = SimpleBrowserTest;