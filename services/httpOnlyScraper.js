const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');

class HttpOnlyScraper {
  constructor() {
    this.cookies = '';
    this.userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  }

  async performLogin() {
    try {
      logger.info('Attempting direct HTTP login to Medtrum EasyView...');
      
      // First, get the login page to extract any CSRF tokens or form data
      const loginPageResponse = await axios.get('https://easyview.medtrum.eu/login', {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive'
        },
        timeout: 10000
      });

      // Extract cookies from login page
      if (loginPageResponse.headers['set-cookie']) {
        this.cookies = loginPageResponse.headers['set-cookie'].map(cookie => cookie.split(';')[0]).join('; ');
      }

      // Parse the login page for any hidden form fields
      const $ = cheerio.load(loginPageResponse.data);
      const csrfToken = $('input[name="_token"]').val() || $('meta[name="csrf-token"]').attr('content');
      
      // Prepare login data
      const loginData = new URLSearchParams({
        email: process.env.MEDTRUM_EMAIL,
        password: process.env.MEDTRUM_PASSWORD
      });

      if (csrfToken) {
        loginData.append('_token', csrfToken);
      }

      // Attempt login
      const loginResponse = await axios.post('https://easyview.medtrum.eu/login', loginData, {
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Origin': 'https://easyview.medtrum.eu',
          'Referer': 'https://easyview.medtrum.eu/login',
          'Cookie': this.cookies
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: function (status) {
          return status < 400;
        }
      });

      // Update cookies after login
      if (loginResponse.headers['set-cookie']) {
        const newCookies = loginResponse.headers['set-cookie'].map(cookie => cookie.split(';')[0]);
        this.cookies = [...this.cookies.split('; '), ...newCookies].join('; ');
      }

      logger.info(`Login response status: ${loginResponse.status}`);
      
      // Check if login was successful (typically redirects to dashboard)
      if (loginResponse.status === 200 || loginResponse.status === 302) {
        logger.info('HTTP login appears successful');
        return true;
      }

      throw new Error(`Login failed with status: ${loginResponse.status}`);

    } catch (error) {
      logger.error('HTTP login failed:', error.message);
      throw error;
    }
  }

  async fetchGlucoseData() {
    try {
      logger.info('Fetching glucose data via HTTP...');
      
      // Try different possible data endpoints
      const dataEndpoints = [
        'https://easyview.medtrum.eu/api/glucose/recent',
        'https://easyview.medtrum.eu/api/data/glucose',
        'https://easyview.medtrum.eu/dashboard/api/readings',
        'https://easyview.medtrum.eu/api/readings',
        'https://easyview.medtrum.eu/patient/data'
      ];

      for (const endpoint of dataEndpoints) {
        try {
          logger.info(`Trying data endpoint: ${endpoint}`);
          
          const response = await axios.get(endpoint, {
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'application/json, text/plain, */*',
              'Cookie': this.cookies,
              'Referer': 'https://easyview.medtrum.eu/dashboard'
            },
            timeout: 8000
          });

          if (response.status === 200 && response.data) {
            logger.info(`Got data from ${endpoint}:`, JSON.stringify(response.data).substring(0, 200));
            
            // Try to parse the response
            const glucoseData = this.parseGlucoseResponse(response.data);
            if (glucoseData && glucoseData.length > 0) {
              return glucoseData;
            }
          }

        } catch (error) {
          logger.warn(`Endpoint ${endpoint} failed: ${error.message}`);
          continue;
        }
      }

      // If API endpoints fail, try scraping the dashboard page
      return await this.scrapeDashboardPage();

    } catch (error) {
      logger.error('Failed to fetch glucose data:', error.message);
      throw error;
    }
  }

  async scrapeDashboardPage() {
    try {
      logger.info('Scraping dashboard page as fallback...');
      
      const response = await axios.get('https://easyview.medtrum.eu/dashboard', {
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Cookie': this.cookies
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Look for glucose data in various possible formats
      const glucoseSelectors = [
        '.glucose-value',
        '.current-glucose',
        '.bg-value',
        '[data-glucose]',
        '.reading-value'
      ];

      for (const selector of glucoseSelectors) {
        const element = $(selector).first();
        if (element.length > 0) {
          const value = element.text().trim();
          const glucoseMatch = value.match(/(\d+\.?\d*)/);
          
          if (glucoseMatch) {
            const glucose = parseFloat(glucoseMatch[1]);
            logger.info(`Found glucose value: ${glucose} from selector ${selector}`);
            
            return [{
              patientName: 'Tomáš Jun',
              glucose: glucose,
              unit: 'mmol/L',
              timestamp: new Date().toISOString(),
              originalValue: value
            }];
          }
        }
      }

      // Look for any numbers that might be glucose values
      const pageText = $.text();
      const possibleValues = pageText.match(/\b(\d+\.?\d*)\s*(mmol\/L|mg\/dL)?\b/g);
      
      if (possibleValues) {
        for (const value of possibleValues) {
          const match = value.match(/(\d+\.?\d*)/);
          if (match) {
            const glucose = parseFloat(match[1]);
            if (glucose > 2 && glucose < 30) { // Reasonable glucose range in mmol/L
              logger.info(`Found potential glucose value: ${glucose}`);
              
              return [{
                patientName: 'Tomáš Jun',
                glucose: glucose,
                unit: 'mmol/L',
                timestamp: new Date().toISOString(),
                originalValue: value
              }];
            }
          }
        }
      }

      throw new Error('No glucose data found on dashboard page');

    } catch (error) {
      logger.error('Dashboard scraping failed:', error.message);
      throw error;
    }
  }

  parseGlucoseResponse(data) {
    try {
      // Handle different possible response formats
      if (Array.isArray(data)) {
        return data.map(item => this.normalizeGlucoseData(item));
      } else if (data.readings && Array.isArray(data.readings)) {
        return data.readings.map(item => this.normalizeGlucoseData(item));
      } else if (data.data && Array.isArray(data.data)) {
        return data.data.map(item => this.normalizeGlucoseData(item));
      } else if (data.glucose || data.value) {
        return [this.normalizeGlucoseData(data)];
      }

      return [];
    } catch (error) {
      logger.error('Failed to parse glucose response:', error.message);
      return [];
    }
  }

  normalizeGlucoseData(item) {
    const glucose = parseFloat(item.glucose || item.value || item.reading || 0);
    
    return {
      patientName: item.patientName || 'Tomáš Jun',
      glucose: glucose,
      unit: item.unit || 'mmol/L',
      timestamp: item.timestamp || new Date().toISOString(),
      originalValue: item.originalValue || glucose.toString()
    };
  }

  async quickSync() {
    try {
      logger.info('Starting HTTP-only sync (no browser automation)...');
      
      await this.performLogin();
      const glucoseData = await this.fetchGlucoseData();
      
      logger.info(`HTTP-only sync completed: ${glucoseData.length} readings`);
      return glucoseData;
      
    } catch (error) {
      logger.error('HTTP-only sync failed:', error.message);
      throw error;
    }
  }

  async cleanup() {
    logger.info('HTTP-only scraper cleanup completed');
  }
}

module.exports = HttpOnlyScraper;