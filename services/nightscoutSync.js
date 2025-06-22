const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class NightscoutSync {
  constructor() {
    // Fix configuration - handle cases where URL and secret might be swapped
    let nightscoutUrl = process.env.NIGHTSCOUT_URL;
    let apiSecret = process.env.NIGHTSCOUT_API_SECRET;
    
    // Check if URL looks like a secret (no dots/slashes) and secret looks like URL
    if (nightscoutUrl && !nightscoutUrl.includes('.') && !nightscoutUrl.includes('/') && 
        apiSecret && (apiSecret.includes('.') || apiSecret.includes('/'))) {
      // Swap them
      [nightscoutUrl, apiSecret] = [apiSecret, nightscoutUrl];
      logger.info('Detected swapped URL/Secret configuration, correcting...');
    }
    
    // Ensure proper URL format
    if (nightscoutUrl && !nightscoutUrl.startsWith('http')) {
      if (nightscoutUrl.includes('.nightscout.')) {
        nightscoutUrl = `https://${nightscoutUrl}`;
      } else {
        nightscoutUrl = `https://${nightscoutUrl}.nightscout.cz`;
      }
    }
    
    this.baseUrl = nightscoutUrl;
    this.apiSecret = apiSecret;
    
    logger.info(`Nightscout configured with URL: ${this.baseUrl}`);
    logger.info(`API Secret configured (first 8 chars): ${apiSecret ? apiSecret.substring(0, 8) + '...' : 'Not set'}`);
  }

  getApiToken() {
    if (!this.apiSecret) {
      throw new Error('NIGHTSCOUT_API_SECRET not configured');
    }
    
    // Create SHA1 hash of the API secret
    return crypto.createHash('sha1').update(this.apiSecret).digest('hex');
  }

  async syncData(glucoseData) {
    if (!this.baseUrl) {
      throw new Error('NIGHTSCOUT_URL not configured');
    }

    const apiToken = this.getApiToken();
    let uploaded = 0;
    let skipped = 0;

    logger.info(`Starting Nightscout sync for ${glucoseData.length} entries`);

    for (const entry of glucoseData) {
      // Convert to Nightscout entry format
      const sgvValue = entry.unit === 'mmol/L' ? Math.round(entry.glucose * 18.0182) : entry.glucose;
      
      // Ensure proper data validation for Nightscout
      const entryDate = new Date(entry.timestamp);
      const nightscoutEntry = {
        type: 'sgv',
        sgv: Math.round(sgvValue), // Ensure integer value
        direction: 'Flat',
        device: 'Medtrum-EasyView',
        date: entryDate.getTime(),
        dateString: entryDate.toISOString(),
        utcOffset: 0
      };
      
      // Validate entry before upload
      if (!nightscoutEntry.sgv || nightscoutEntry.sgv < 20 || nightscoutEntry.sgv > 600) {
        logger.warn(`Invalid glucose value: ${nightscoutEntry.sgv}, skipping entry`);
        skipped++;
        continue;
      }
      
      try {

        // Upload to Nightscout
        logger.info(`Attempting upload to: ${this.baseUrl}/api/v1/entries`);
        logger.info(`Using SHA1 hash: ${apiToken.substring(0, 8)}...`);
        logger.info(`Entry: ${JSON.stringify(nightscoutEntry)}`);
        
        const response = await axios.post(`${this.baseUrl}/api/v1/entries`, [nightscoutEntry], {
          headers: {
            'api-secret': apiToken,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        
        logger.info(`Upload response status: ${response.status}`);

        logger.info(`Uploaded entry: ${entry.glucose} ${entry.unit} for ${entry.patientName}`);
        uploaded++;

      } catch (error) {
        logger.error(`Failed to upload entry for ${entry.patientName}:`, error.message);
        if (error.response) {
          logger.error(`Response status: ${error.response.status}`);
          logger.error(`Response headers:`, JSON.stringify(error.response.headers));
          logger.error(`Response data:`, JSON.stringify(error.response.data));
          
          // Specific handling for "String did not match expected pattern" error
          if (error.response.data && 
              (typeof error.response.data === 'string' && error.response.data.includes('String did not match expected pattern')) ||
              (typeof error.response.data === 'object' && JSON.stringify(error.response.data).includes('String did not match expected pattern'))) {
            logger.error('NIGHTSCOUT VALIDATION ERROR DETECTED:');
            logger.error(`SGV value: ${nightscoutEntry.sgv} (type: ${typeof nightscoutEntry.sgv})`);
            logger.error(`Date value: ${nightscoutEntry.date} (type: ${typeof nightscoutEntry.date})`);
            logger.error(`DateString: ${nightscoutEntry.dateString}`);
            logger.error(`Device: ${nightscoutEntry.device}`);
            logger.error(`Direction: ${nightscoutEntry.direction}`);
            logger.error(`Type: ${nightscoutEntry.type}`);
            logger.error(`UTC Offset: ${nightscoutEntry.utcOffset}`);
            
            // Try alternative entry format
            const alternativeEntry = {
              type: 'sgv',
              sgv: parseInt(nightscoutEntry.sgv),
              device: 'Medtrum',
              date: nightscoutEntry.date
            };
            logger.error('Alternative entry format:', JSON.stringify(alternativeEntry));
          }
        }
        logger.error(`Full entry data sent:`, JSON.stringify(nightscoutEntry));
        skipped++;
      }
    }

    logger.info(`Nightscout sync completed: ${uploaded} uploaded, ${skipped} skipped`);
    return { uploaded, skipped };
  }

  async getRecentEntries(count = 10) {
    try {
      const apiToken = this.getApiToken();
      const response = await axios.get(`${this.baseUrl}/api/v1/entries`, {
        headers: {
          'API-SECRET': apiToken
        },
        params: {
          count: count
        },
        timeout: 10000
      });

      return response.data || [];
    } catch (error) {
      logger.warn('Failed to fetch recent entries:', error.message);
      return [];
    }
  }

  async testConnection() {
    try {
      const apiToken = this.getApiToken();
      const response = await axios.get(`${this.baseUrl}/api/v1/status`, {
        headers: {
          'API-SECRET': apiToken
        },
        timeout: 10000
      });

      logger.info('Nightscout connection test successful');
      return true;
    } catch (error) {
      logger.error('Nightscout connection test failed:', error.message);
      return false;
    }
  }
}

module.exports = NightscoutSync;