const axios = require('axios');
const logger = require('../utils/logger');

class LightweightScraper {
  constructor() {
    this.sessionCookies = null;
    this.lastLogin = null;
  }

  async quickSync() {
    try {
      logger.info('Starting lightweight HTTP-based sync...');
      
      // Check if we need to login (every 30 minutes)
      const now = Date.now();
      if (!this.sessionCookies || !this.lastLogin || (now - this.lastLogin) > 30 * 60 * 1000) {
        await this.login();
      }
      
      // Get glucose data via API calls instead of browser
      const glucoseData = await this.fetchGlucoseData();
      
      logger.info(`Lightweight sync completed: ${glucoseData.length} readings extracted`);
      return glucoseData;
      
    } catch (error) {
      logger.error('Lightweight sync failed:', error.message);
      throw error;
    }
  }

  async login() {
    const endpoints = [
      'https://easyview.medtrum.eu/api/v1/auth/login',
      'https://easyview.medtrum.eu/api/login', 
      'https://easyview.medtrum.eu/login',
      'https://api.medtrum.eu/v1/auth/login'
    ];

    for (const endpoint of endpoints) {
      try {
        logger.info(`Trying HTTP login at ${endpoint}...`);
        
        const loginData = {
          email: process.env.MEDTRUM_EMAIL,
          password: process.env.MEDTRUM_PASSWORD,
          username: process.env.MEDTRUM_EMAIL
        };
        
        const response = await axios.post(endpoint, loginData, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
            'Origin': 'https://easyview.medtrum.eu',
            'Referer': 'https://easyview.medtrum.eu/login'
          },
          timeout: 8000,
          validateStatus: function (status) {
            return status < 500; // Accept any status code less than 500
          }
        });
        
        logger.info(`Response status: ${response.status} for ${endpoint}`);
        
        if (response.status === 200 && response.data) {
          if (response.data.token || response.data.access_token || response.data.sessionId) {
            this.sessionCookies = response.data.token || response.data.access_token || response.data.sessionId;
            this.lastLogin = Date.now();
            logger.info(`HTTP login successful at ${endpoint}`);
            return;
          }
        }
        
      } catch (error) {
        logger.warn(`Failed ${endpoint}: ${error.message}`);
        continue;
      }
    }
    
    logger.error('All HTTP login endpoints failed');
    throw new Error('HTTP login failed, will use browser fallback');
  }

  async fetchGlucoseData() {
    try {
      const response = await axios.get('https://easyview.medtrum.eu/api/v1/patient/glucose', {
        headers: {
          'Authorization': `Bearer ${this.sessionCookies}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
        },
        timeout: 8000
      });
      
      if (response.data && response.data.readings) {
        return this.transformData(response.data.readings);
      } else {
        throw new Error('No glucose data in API response');
      }
      
    } catch (error) {
      logger.error('Failed to fetch glucose data via API:', error.message);
      throw error;
    }
  }

  transformData(apiData) {
    if (!Array.isArray(apiData) || apiData.length === 0) {
      return [];
    }
    
    // Take only the most recent reading
    const latest = apiData[0];
    
    return [{
      patientName: latest.patientName || 'Tomáš Jun',
      glucose: parseFloat(latest.value) || 0,
      unit: 'mmol/L',
      timestamp: new Date().toISOString(),
      originalValue: latest.value?.toString() || '0'
    }];
  }

  async cleanup() {
    // No cleanup needed for HTTP-based scraper
    logger.info('Lightweight scraper cleanup completed');
  }
}

module.exports = LightweightScraper;