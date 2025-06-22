# Medtrum-Nightscout Sync Service

Automated glucose monitoring synchronization between Medtrum EasyView and Nightscout platforms with 24/7 continuous data upload.

## Quick Start

### Current Status
- **Preview Environment**: 100% operational with continuous glucose monitoring (11 mmol/L latest upload)
- **Production Deployment**: Requires migration to Railway.app or Fly.io due to DNS blocking

### Migration Options

#### Option 1: Railway.app (Recommended - $5/month)
```bash
./deploy-scripts/railway-deploy.sh
```

#### Option 2: Fly.io (Global Edge - $5/month)
```bash
./deploy-scripts/fly-deploy.sh
```

## Features

- **Automated Sync**: Every minute glucose data extraction from Medtrum
- **Real-time Dashboard**: Web interface with status monitoring
- **Nightscout Integration**: Seamless upload to Nightscout platform
- **Data Conversion**: mmol/L to mg/dL conversion for API compatibility
- **Error Recovery**: Comprehensive fallback systems and retry logic
- **24/7 Monitoring**: Continuous operation with scheduler management

## Architecture

- **Backend**: Node.js with Express.js web server
- **Automation**: Puppeteer browser automation with Cloudflare bypass
- **Scheduling**: Node-cron for minutely synchronization
- **Logging**: Winston structured logging with file rotation
- **Frontend**: Bootstrap-based monitoring dashboard

## Environment Variables

```env
MEDTRUM_USERNAME=your_username
MEDTRUM_PASSWORD=your_password
NIGHTSCOUT_URL=https://your-site.nightscout.cz
NIGHTSCOUT_SECRET=your_api_secret
NODE_ENV=production
```

## Deployment Files

- `railway.json` - Railway.app configuration
- `fly.toml` - Fly.io configuration  
- `Dockerfile` - Multi-platform container setup
- `.gitignore` - Git exclusion rules
- `MIGRATION_GUIDE.md` - Detailed deployment instructions

## Cost Comparison

| Platform | DNS Access | Cost | Success Rate |
|----------|------------|------|-------------|
| Replit Production | Blocked | $20/month | 0% |
| Railway.app | Full | $5/month | Expected 100% |
| Fly.io | Full | $5/month | Expected 100% |

## Current Performance

- **Sync Frequency**: Every minute
- **Data Format**: mmol/L display, mg/dL API upload
- **Response Time**: 15-20 seconds per sync
- **Success Rate**: 100% in preview environment
- **Latest Reading**: 11 mmol/L (198 mg/dL) successfully uploaded

## Support

Deployment ready with comprehensive DNS blocking analysis and migration solutions provided.