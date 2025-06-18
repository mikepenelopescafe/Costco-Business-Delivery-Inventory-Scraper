# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a restaurant analytics platform that combines Costco inventory scraping with Square POS integration and AI-powered menu cost analysis. The system helps restaurants calculate food costs by matching Square menu items with Costco ingredients and using AI for cost calculations.

## Core Architecture

### Three-Layer System
1. **Costco Scraper**: Web scraping engine using Puppeteer to extract product data from costcobusinessdelivery.com
2. **Square Integration**: OAuth-based POS system integration for menu catalog synchronization
3. **AI Cost Analysis**: Anthropic Claude integration for intelligent ingredient cost calculations

### Key Components
- **Database Layer** (`lib/database.js`): PostgreSQL operations with connection pooling and error recovery
- **Scraper Engine** (`lib/scraper.js`): Headless browser automation with UI-based location setting
- **Square Client** (`lib/square/client.js`): OAuth flow and API wrapper with encrypted token storage
- **LLM Integration** (`lib/llm/claude.js`): Cost calculation prompts and response parsing
- **API Layer** (`api/`): Vercel serverless functions for all endpoints

## Test Build

The project builds successfully with `npm install` and all core modules load properly.

**Fixed Issues:**
- Updated Square SDK from incorrect `squareup@^35.0.0` to official `square@^42.3.0`
- All dependencies install without vulnerabilities
- Core modules (database, scraper, logger) load successfully
- Square integration and LLM modules require environment variables but load correctly
- API endpoints load successfully

## Development Commands

```bash
# Start local development server
npm start

# Run scraping manually (takes 10-15 minutes)
npm run scrape

# Database setup and management
npm run db:setup          # Create Costco scraper tables
npm run db:square-setup   # Create Square integration tables
npm run db:reset          # Drop and recreate all tables

# Development with auto-reload
npm run dev
```

## Environment Variables

Required for development:
- `DATABASE_URL`: PostgreSQL connection string
- `API_KEY`: Authentication key for API endpoints
- `COSTCO_ZIP_CODE`: Target delivery ZIP (default: 80031)
- `SQUARE_APP_ID`, `SQUARE_APP_SECRET`: Square OAuth credentials
- `SQUARE_ENVIRONMENT`: 'sandbox' or 'production'
- `ENCRYPTION_KEY`: 32-character key for token encryption
- `ANTHROPIC_API_KEY`: Claude API key for cost analysis

## Database Schema

### Core Tables
- `products`: Costco product catalog with deduplication by `costco_product_id`
- `price_history`: Price tracking (only stores when prices change)
- `scraping_jobs`: Job logging and status tracking
- `square_menu_items`: Synchronized Square menu catalog
- `menu_item_ingredients`: Links menu items to Costco products
- `menu_item_costs`: AI-calculated cost analysis with confidence scores

### Key Relationships
- Menu items can have multiple Costco ingredient assignments
- Cost calculations are cached for 24 hours to reduce LLM API calls
- Price history maintains full audit trail with timestamps

## API Architecture

### Authentication
All endpoints except health checks require `x-api-key` header or `Authorization: Bearer` token.

### Key Endpoint Patterns
- `/api/scrape`: Manual scraping trigger (use GitHub Actions in production due to timeouts)
- `/api/square/oauth/*`: OAuth flow for Square integration
- `/api/square/sync`: Menu catalog synchronization with progress tracking
- `/api/menu-items/{id}/calculate-cost`: AI-powered cost analysis
- `/api/cost-analysis/bulk-calculate`: Batch processing with job tracking
- `/api/search?context=ingredient_assignment`: Optimized search for ingredient matching

## Scraping Process

### Location Setting Strategy
The scraper uses UI automation (not API) to set delivery location:
1. Navigates to costcobusinessdelivery.com with ZIP parameter
2. Falls back to modal interaction if URL method fails
3. Verifies location was set before proceeding with scraping

### Data Collection Flow
1. Initialize headless browser with anti-detection measures
2. Set delivery location via UI interaction
3. Discover grocery categories automatically
4. Extract product URLs with pagination handling
5. Visit individual product pages for detailed data
6. Batch database operations to prevent timeouts

## Testing and Validation

No formal test framework is configured. Testing is done via:
- API endpoint testing with curl commands (see README examples)
- Database validation queries in setup scripts
- Health check endpoint for system validation
- Manual verification of scraping results

## Deployment Considerations

### Hybrid Architecture (Recommended)
- **APIs**: Deploy to Vercel (fast serverless functions)
- **Scraping**: Use GitHub Actions (no timeout limits)
- **Database**: PostgreSQL on Neon/Railway

### Timeout Limitations
The scraper takes 10-15 minutes, exceeding Vercel's limits:
- Hobby: 10 seconds
- Pro: 60 seconds  
- Enterprise: 15 minutes (unreliable)

Use GitHub Actions workflow (`.github/workflows/scheduled-scrape.yml`) for reliable scraping.

## Security Features

- AES-256 encryption for Square OAuth tokens
- API key authentication on all protected endpoints
- Automatic token refresh handling
- Input validation and sanitization
- No sensitive data logging

## Performance Optimizations

- Connection pooling with automatic recovery
- Batch database operations
- 24-hour caching for cost calculations
- Optimized database indexes
- Rate limiting with configurable delays

## Common Development Patterns

### Error Handling
Always use structured error responses:
```javascript
res.status(400).json({ 
  error: 'validation_error', 
  message: 'Description',
  details: {} 
});
```

### Database Operations
Use the Database class methods with automatic connection recovery:
```javascript
await this.db.ensureConnection();
const result = await this.db.client.query(sql, params);
```

### LLM Integration
Cost calculations include confidence scoring and explanation for transparency and debugging.