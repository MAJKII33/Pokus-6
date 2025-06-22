const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const logger = require('../utils/logger');

// Use stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

class QuickScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async quickSync() {
    // Use same configuration for ALL environments - no differences
    const maxTimeout = 45000; // 45 seconds for all environments
    const startTime = Date.now();
    
    try {
      logger.info('Starting quick glucose data sync...');
      
      // Comprehensive Puppeteer configuration for production Replit deployment
      const fs = require('fs');
      const replitChromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
      
      console.log("Launching browser...");
      const launchConfig = {
        headless: true,
        executablePath: fs.existsSync(replitChromiumPath)
          ? replitChromiumPath
          : undefined, // fallback to system Chrome
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
          '--max_old_space_size=4096'
        ],
        defaultViewport: { width: 1280, height: 800 },
        timeout: 60000, // Extended timeout for production stability
        protocolTimeout: 60000,
        ignoreHTTPSErrors: true
      };

      if (fs.existsSync(replitChromiumPath)) {
        logger.info('Using Replit Chromium');
      } else {
        logger.info('Using system Chrome');
      }

      this.browser = await puppeteer.launch(launchConfig);
      console.log("Browser launched!");
      this.page = await this.browser.newPage();
      
      // Enhanced browser spoofing to avoid bot detection
      await this.page.setJavaScriptEnabled(true);
      await this.page.setViewport({ width: 1280, height: 800 });
      
      // Extended timeouts for Cloudflare bypass
      this.page.setDefaultTimeout(30000);
      this.page.setDefaultNavigationTimeout(60000);
      
      // Enhanced error handling
      this.page.on('error', (error) => {
        logger.error('Page error:', error.message);
      });
      
      this.page.on('pageerror', (error) => {
        logger.error('Page script error:', error.message);
      });
      
      // Set user agent
      await this.page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15');

      // Cloudflare bypass: Navigate to main domain first
      logger.info('Navigating to main domain to bypass Cloudflare protection...');
      await this.page.goto('https://easyview.medtrum.eu', { 
        waitUntil: 'domcontentloaded', 
        timeout: 60000 
      });
      
      // Wait for Cloudflare to process
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Navigate to login page via JavaScript to avoid direct hash navigation
      logger.info('Navigating to login page...');
      await this.page.evaluate(() => {
        window.location.href = '#/login/login';
      });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Wait for login form
      await this.page.goto('https://easyview.medtrum.eu/v3/#/login', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      // Check timeout
      if (Date.now() - startTime > maxTimeout) {
        throw new Error('Sync timeout reached during navigation');
      }

      // Fill login form quickly - try multiple selector patterns
      let emailSelector = null;
      let passwordSelector = null;
      
      // Try different email input selectors
      const emailSelectors = [
        'input[type="email"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        'input[placeholder*="邮箱" i]',
        '.el-input__inner[type="text"]'
      ];
      
      for (const selector of emailSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 1000 });
          emailSelector = selector;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!emailSelector) {
        throw new Error('Could not find email input field');
      }
      
      // Try different password input selectors
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        'input[placeholder*="password" i]',
        'input[placeholder*="密码" i]'
      ];
      
      for (const selector of passwordSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 1000 });
          passwordSelector = selector;
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!passwordSelector) {
        throw new Error('Could not find password input field');
      }
      
      await this.page.type(emailSelector, process.env.MEDTRUM_EMAIL, { delay: 10 });
      await this.page.type(passwordSelector, process.env.MEDTRUM_PASSWORD, { delay: 10 });
      
      // Click login - try multiple button selectors
      const loginButtons = [
        'button[type="submit"]',
        '.el-button--primary',
        'button.login-btn',
        'button:contains("登录")',
        'button:contains("Login")',
        '.login-form button'
      ];
      
      let loginClicked = false;
      for (const buttonSelector of loginButtons) {
        try {
          const button = await this.page.$(buttonSelector);
          if (button) {
            await button.click();
            loginClicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      if (!loginClicked) {
        // Fallback: press Enter on password field
        await this.page.focus(passwordSelector);
        await this.page.keyboard.press('Enter');
      }
      
      // Wait for login success with multiple indicators
      try {
        await Promise.race([
          this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 }),
          this.page.waitForSelector('.dashboard', { timeout: 5000 }),
          this.page.waitForSelector('#/home', { timeout: 5000 }),
          this.page.waitForFunction(() => window.location.hash !== '#/login', { timeout: 5000 })
        ]);
      } catch (e) {
        // If navigation doesn't work, check if we're still on login page
        const currentUrl = this.page.url();
        if (currentUrl.includes('login')) {
          throw new Error('Login failed - still on login page');
        }
      }
      
      // Check timeout
      if (Date.now() - startTime > maxTimeout) {
        throw new Error('Sync timeout reached during login');
      }

      // Navigate to data page
      logger.info('Getting glucose data...');
      await this.page.goto('https://easyview.medtrum.eu/v3/#/carerConnection', {
        waitUntil: 'domcontentloaded',
        timeout: 5000
      });

      // Wait for page to fully load and try multiple data table selectors
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const tableSelectors = [
        '.el-table',
        'table',
        '.data-table',
        '.glucose-data',
        '[data-testid="data-table"]'
      ];
      
      let tableFound = false;
      for (const selector of tableSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 2000 });
          tableFound = true;
          logger.info(`Found data table with selector: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }
      
      if (!tableFound) {
        // Log page content for debugging
        const pageContent = await this.page.content();
        logger.info('Page HTML structure:', pageContent.substring(0, 1000));
        
        // Try to find any glucose-related content
        const glucoseElements = await this.page.$$eval('*', elements => {
          return elements.filter(el => 
            el.textContent && 
            (el.textContent.includes('mmol') || 
             el.textContent.includes('mg/dL') || 
             el.textContent.match(/\d+\.\d+/) ||
             el.textContent.includes('glucose') ||
             el.textContent.includes('SG'))
          ).map(el => ({
            tag: el.tagName,
            text: el.textContent.trim().substring(0, 100),
            className: el.className
          })).slice(0, 10);
        });
        
        logger.info('Found glucose-related elements:', glucoseElements);
      }
      
      const glucoseData = await this.page.evaluate(() => {
        // Try multiple table selectors for robustness
        let rows = document.querySelectorAll('.el-table tbody tr');
        if (rows.length === 0) {
          rows = document.querySelectorAll('table tbody tr');
        }
        if (rows.length === 0) {
          rows = document.querySelectorAll('tr');
        }
        
        console.log(`Found ${rows.length} table rows to process`);
        const data = [];
        
        for (let i = 0; i < Math.min(rows.length, 5); i++) { // Limit to first 5 rows for speed
          const row = rows[i];
          const cells = row.querySelectorAll('td');
          
          console.log(`Row ${i}: Found ${cells.length} cells`);
          if (cells.length >= 2) {
            const patientName = cells[0].textContent.trim();
            const sgText = cells[1].textContent.trim();
            
            console.log(`Row ${i} - Patient: "${patientName}", SG: "${sgText}"`);
            
            const sgMatch = sgText.match(/(\d+\.?\d*)/);
            if (sgMatch) {
              const sgValue = parseFloat(sgMatch[1]);
              // Keep original mmol/L value if it's already in mmol/L (< 30), otherwise convert from mg/dL
              const glucoseMmol = sgValue < 30 ? sgValue : Math.round((sgValue / 18.0182) * 10) / 10;
              
              console.log(`Extracted glucose: ${sgValue} -> ${glucoseMmol} mmol/L`);
              
              data.push({
                patientName: patientName,
                glucose: glucoseMmol,
                unit: 'mmol/L',
                timestamp: new Date().toISOString(),
                originalValue: sgText
              });
            } else {
              console.log(`No glucose match found in "${sgText}"`);
            }
          }
        }
        
        console.log(`Total extracted data points: ${data.length}`);
        return data;
      });

      logger.info(`Quick sync completed: ${glucoseData.length} readings extracted in ${Date.now() - startTime}ms`);
      
      await this.cleanup();
      return glucoseData;

    } catch (error) {
      logger.error('Quick sync failed:', error.message);
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
      logger.error('Cleanup error:', error.message);
    }
  }
}

module.exports = QuickScraper;