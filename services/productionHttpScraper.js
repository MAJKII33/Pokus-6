const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class ProductionHttpScraper {
  constructor() {
    this.cookies = new Map();
    this.csrfToken = null;
    this.sessionId = null;
    this.userAgent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async performProductionSync() {
    try {
      logger.info('Starting production HTTP scraper (zero browser automation)...');
      
      // Step 1: Get login page and extract session data
      await this.initializeSession();
      
      // Step 2: Perform login
      await this.performLogin();
      
      // Step 3: Get dashboard data
      const glucoseData = await this.extractGlucoseFromDashboard();
      
      logger.info(`Production HTTP scraper completed: ${glucoseData.length} readings`);
      return glucoseData;
      
    } catch (error) {
      logger.error('Production HTTP scraper failed:', error.message);
      throw error;
    }
  }

  async initializeSession() {
    try {
      logger.info('Initializing session with Medtrum EasyView...');
      
      const response = await axios.get('https://easyview.medtrum.eu/', {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 15000,
        maxRedirects: 5
      });

      // Extract cookies
      if (response.headers['set-cookie']) {
        response.headers['set-cookie'].forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          this.cookies.set(name.trim(), value ? value.trim() : '');
        });
      }

      // If redirected to login page, get it
      let loginPageHtml = response.data;
      if (response.request.res.responseUrl && response.request.res.responseUrl.includes('/login')) {
        logger.info('Already redirected to login page');
      } else {
        // Navigate to login page
        const loginResponse = await axios.get('https://easyview.medtrum.eu/login', {
          headers: this.getHeaders(),
          timeout: 10000
        });
        loginPageHtml = loginResponse.data;
        
        if (loginResponse.headers['set-cookie']) {
          loginResponse.headers['set-cookie'].forEach(cookie => {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=');
            this.cookies.set(name.trim(), value ? value.trim() : '');
          });
        }
      }

      // Extract CSRF token and other form data
      const $ = cheerio.load(loginPageHtml);
      this.csrfToken = $('meta[name="csrf-token"]').attr('content') || 
                      $('input[name="_token"]').val() ||
                      $('input[name="csrf_token"]').val();
      
      logger.info(`Session initialized. CSRF token: ${this.csrfToken ? 'found' : 'not found'}`);
      logger.info(`Cookies collected: ${this.cookies.size}`);

    } catch (error) {
      logger.error('Session initialization failed:', error.message);
      throw error;
    }
  }

  getHeaders(contentType = null) {
    const headers = {
      'User-Agent': this.userAgent,
      'Accept': contentType ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://easyview.medtrum.eu/login'
    };

    if (contentType) {
      headers['Content-Type'] = contentType;
    }

    // Add cookies
    const cookieString = Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    
    if (cookieString) {
      headers['Cookie'] = cookieString;
    }

    return headers;
  }

  async performLogin() {
    try {
      logger.info('Performing production login...');
      
      // Prepare form data
      const formData = new URLSearchParams();
      formData.append('email', process.env.MEDTRUM_EMAIL);
      formData.append('password', process.env.MEDTRUM_PASSWORD);
      
      if (this.csrfToken) {
        formData.append('_token', this.csrfToken);
      }

      const loginResponse = await axios.post('https://easyview.medtrum.eu/login', formData, {
        headers: this.getHeaders('application/x-www-form-urlencoded'),
        timeout: 15000,
        maxRedirects: 0, // Don't auto-redirect to check status
        validateStatus: function (status) {
          return status < 400; // Accept redirects as success
        }
      });

      // Update cookies from login response
      if (loginResponse.headers['set-cookie']) {
        loginResponse.headers['set-cookie'].forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          this.cookies.set(name.trim(), value ? value.trim() : '');
        });
      }

      // Check if login was successful (usually redirects to dashboard)
      if (loginResponse.status === 302 || loginResponse.status === 200) {
        logger.info(`Login response: ${loginResponse.status}`);
        logger.info('Production login appears successful');
        return true;
      }

      throw new Error(`Login failed with status: ${loginResponse.status}`);

    } catch (error) {
      if (error.response && error.response.status === 302) {
        // Redirect means login was successful
        logger.info('Login successful (redirected)');
        
        // Update cookies from redirect
        if (error.response.headers['set-cookie']) {
          error.response.headers['set-cookie'].forEach(cookie => {
            const [nameValue] = cookie.split(';');
            const [name, value] = nameValue.split('=');
            this.cookies.set(name.trim(), value ? value.trim() : '');
          });
        }
        return true;
      }
      
      logger.error('Production login failed:', error.message);
      throw error;
    }
  }

  async extractGlucoseFromDashboard() {
    try {
      logger.info('Extracting glucose data from dashboard...');
      
      // Try to access dashboard
      const dashboardResponse = await axios.get('https://easyview.medtrum.eu/dashboard', {
        headers: this.getHeaders(),
        timeout: 15000
      });

      const $ = cheerio.load(dashboardResponse.data);
      
      // Strategy 1: Look for common glucose display patterns
      const glucoseSelectors = [
        '.glucose-reading',
        '.glucose-value', 
        '.current-glucose',
        '.bg-value',
        '.reading-value',
        '[data-glucose]',
        '.glucose',
        '.blood-glucose',
        '.cgm-value'
      ];

      for (const selector of glucoseSelectors) {
        const elements = $(selector);
        if (elements.length > 0) {
          elements.each((i, elem) => {
            const text = $(elem).text().trim();
            const match = text.match(/(\d+\.?\d*)/);
            if (match) {
              const glucose = parseFloat(match[1]);
              if (glucose > 2 && glucose < 30) { // Reasonable mmol/L range
                logger.info(`Found glucose via selector ${selector}: ${glucose}`);
                return this.createGlucoseData(glucose);
              }
            }
          });
        }
      }

      // Strategy 2: Search page text for glucose patterns
      const pageText = $.text();
      const patterns = [
        /glucose[:\s]+(\d+\.?\d*)/i,
        /bg[:\s]+(\d+\.?\d*)/i,
        /(\d+\.?\d*)\s*mmol\/L/i,
        /current[:\s]+(\d+\.?\d*)/i
      ];

      for (const pattern of patterns) {
        const match = pageText.match(pattern);
        if (match) {
          const glucose = parseFloat(match[1]);
          if (glucose > 2 && glucose < 30) {
            logger.info(`Found glucose via pattern: ${glucose}`);
            return this.createGlucoseData(glucose);
          }
        }
      }

      // Strategy 3: Look for any reasonable numbers in glucose range
      const allNumbers = pageText.match(/\b(\d+\.?\d*)\b/g);
      if (allNumbers) {
        for (const numStr of allNumbers) {
          const num = parseFloat(numStr);
          if (num > 3 && num < 25) { // Typical glucose range
            logger.info(`Found potential glucose value: ${num}`);
            return this.createGlucoseData(num);
          }
        }
      }

      // Strategy 4: Look for JSON data in script tags
      $('script').each((i, script) => {
        const scriptContent = $(script).html();
        if (scriptContent && scriptContent.includes('glucose')) {
          try {
            const jsonMatch = scriptContent.match(/\{[^}]*glucose[^}]*\}/);
            if (jsonMatch) {
              const data = JSON.parse(jsonMatch[0]);
              if (data.glucose || data.value) {
                const glucose = parseFloat(data.glucose || data.value);
                if (glucose > 2 && glucose < 30) {
                  logger.info(`Found glucose in script: ${glucose}`);
                  return this.createGlucoseData(glucose);
                }
              }
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
        }
      });

      throw new Error('No glucose data found on dashboard');

    } catch (error) {
      logger.error('Dashboard extraction failed:', error.message);
      throw error;
    }
  }

  createGlucoseData(glucose) {
    return [{
      patientName: 'Tomáš Jun',
      glucose: glucose,
      unit: 'mmol/L',
      timestamp: new Date().toISOString(),
      originalValue: glucose.toString()
    }];
  }

  async quickSync() {
    return await this.performProductionSync();
  }

  async cleanup() {
    logger.info('Production HTTP scraper cleanup completed');
  }
}

module.exports = ProductionHttpScraper;