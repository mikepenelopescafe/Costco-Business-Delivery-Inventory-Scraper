# Restaurant Analytics Platform

A comprehensive system that combines Costco inventory scraping with Square POS integration and AI-powered menu cost analysis.

## Features

### Costco Inventory Scraping
- ✅ Comprehensive grocery category scraping (11 categories)
- ✅ UI-based location filtering (ZIP code 80031)
- ✅ PostgreSQL database with product tracking and price history
- ✅ Automatic pagination handling
- ✅ Manual trigger API endpoint
- ✅ Health check and job status endpoints
- ✅ Robust error handling and logging
- ✅ Vercel deployment configuration
- ✅ Headless browser operation

### Square POS Integration
- ✅ OAuth 2.0 authentication with Square
- ✅ Automated menu catalog synchronization
- ✅ Real-time sync progress tracking
- ✅ Secure token storage with AES-256 encryption
- ✅ Menu item management and filtering

### AI-Powered Cost Analysis
- ✅ Anthropic Claude integration for intelligent cost calculations
- ✅ Ingredient assignment to menu items
- ✅ Automated portion size and waste factor calculations
- ✅ Margin and food cost percentage analysis
- ✅ Bulk cost calculation processing
- ✅ Confidence scoring for accuracy assessment

## Location Filtering

The scraper uses UI-based location setting to ensure products are filtered for the target ZIP code (80031). This approach:
- Opens Costco's delivery location modal
- Enters the target ZIP code via form input
- Submits using Enter key for reliable form submission
- Verifies location was set successfully before proceeding

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env` file with the following variables:

```bash
# Core Configuration
DATABASE_URL=your_postgresql_connection_string
API_KEY=your_api_secret_key

# Costco Scraping
COSTCO_ZIP_CODE=80031
SCRAPE_DELAY_MS=2000
MAX_RETRIES=3

# Square Integration
SQUARE_APP_ID=your_square_app_id
SQUARE_APP_SECRET=your_square_app_secret
SQUARE_ENVIRONMENT=sandbox
ENCRYPTION_KEY=your_32_character_encryption_key

# AI Cost Analysis
ANTHROPIC_API_KEY=your_anthropic_api_key
```

Required environment variables:
- `DATABASE_URL`: PostgreSQL connection string (Neon, Railway, etc.)
- `API_KEY`: Secret key for API authentication
- `COSTCO_ZIP_CODE`: Target zip code for location filtering (default: 80031)
- `SCRAPE_DELAY_MS`: Delay between requests in milliseconds (default: 2000)
- `MAX_RETRIES`: Maximum retry attempts (default: 3)
- `SQUARE_APP_ID`: Square application ID from Square Developer Dashboard
- `SQUARE_APP_SECRET`: Square application secret
- `SQUARE_ENVIRONMENT`: Either 'sandbox' or 'production'
- `ENCRYPTION_KEY`: 32-character key for encrypting Square tokens
- `ANTHROPIC_API_KEY`: API key for Claude cost analysis

### 3. Database Setup

Run the database setup scripts to create tables:

```bash
# Set up Costco scraper tables
npm run db:setup

# Set up Square integration tables
npm run db:square-setup
```

To reset the database (drops and recreates all tables):

```bash
npm run db:reset
```

## Usage

### Square POS Integration

#### 1. Complete OAuth Setup
Visit the OAuth authorization endpoint to connect your Square account:
```
GET /api/square/oauth/authorize
```

#### 2. Sync Square Menu Catalog
```bash
curl -X POST http://localhost:3000/api/square/sync \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_type": "full"}'
```

#### 3. Assign Ingredients to Menu Items
```bash
curl -X POST http://localhost:3000/api/menu-items/123/ingredients \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ingredients": [{"costco_product_id": "456"}]}'
```

#### 4. Calculate Menu Item Costs
```bash
curl -X POST http://localhost:3000/api/menu-items/123/calculate-cost \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json"
```

### Costco Inventory Scraping

#### Manual Scraping

Run scraper directly:

```bash
npm run scrape
```

### API Server

Start local development server:

```bash
npm start
```

Server runs on `http://localhost:3000`

### API Endpoints

#### Core System Endpoints

##### GET /api/health
Check system health and database connectivity.

```bash
curl http://localhost:3000/api/health
```

##### GET /api/jobs/latest
Get status of the most recent scraping job.

```bash
curl http://localhost:3000/api/jobs/latest
```

##### POST /api/scrape
Trigger manual scraping job (requires API key).

```bash
curl -X POST http://localhost:3000/api/scrape \
  -H "Authorization: Bearer YOUR_API_KEY"
```

##### GET /api/stats
Get comprehensive database statistics and insights.

```bash
curl http://localhost:3000/api/stats
```

#### Product Data Endpoints

##### GET /api/products
Get products with advanced pagination, filtering, and sorting.

**Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 200)
- `category` - Filter by category name
- `search` - Search in product names
- `min_price` - Minimum price filter
- `max_price` - Maximum price filter
- `sort_by` - Sort field: name, category, created_at, updated_at
- `sort_order` - Sort direction: asc, desc

```bash
# Basic pagination
curl "http://localhost:3000/api/products?page=1&limit=20"

# Category filtering
curl "http://localhost:3000/api/products?category=Baking&page=1&limit=10"

# Price range filtering
curl "http://localhost:3000/api/products?min_price=10&max_price=50"

# Search with sorting
curl "http://localhost:3000/api/products?search=bread&sort_by=name&sort_order=asc"

# Combined filters
curl "http://localhost:3000/api/products?category=Baking&min_price=5&max_price=25&page=1&limit=10"
```

##### GET /api/products/{id}
Get detailed information for a specific product including price statistics.

```bash
# Using internal product ID
curl http://localhost:3000/api/products/123

# Using Costco product ID
curl http://localhost:3000/api/products/COSTCO_PRODUCT_ID
```

##### GET /api/products/{id}/price-history
Get price history for a specific product with analytics.

**Parameters:**
- `limit` - Number of price entries (default: 100, max: 1000)
- `start_date` - Start date filter (YYYY-MM-DD)
- `end_date` - End date filter (YYYY-MM-DD)

```bash
# Recent price history
curl http://localhost:3000/api/products/123/price-history?limit=50

# Date range filtering
curl "http://localhost:3000/api/products/123/price-history?start_date=2025-01-01&end_date=2025-06-01"
```

#### Square POS Endpoints

##### GET /api/square/oauth/authorize
Initiate Square OAuth flow to connect restaurant account.

##### GET /api/square/oauth/callback
Handle Square OAuth callback (automatic).

##### POST /api/square/sync
Sync Square menu catalog with optional filtering.

```bash
curl -X POST http://localhost:3000/api/square/sync \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"sync_type": "full", "categories_only": ["FOOD"]}'
```

##### GET /api/square/sync/{syncId}/status
Check status of ongoing or completed sync.

##### GET /api/square/sync/history
Get sync history with pagination.

#### Menu Item Management

##### GET /api/menu-items
Get all menu items with filtering and cost analysis.

**Parameters:**
- `category` - Filter by menu category
- `active_only` - Show only active items (default: true)
- `with_costs` - Include cost calculations (default: true)
- `search` - Search in item names/descriptions
- `limit` - Items per page (default: 50, max: 200)
- `sort_by` - Sort field: name, category, margin, cost

```bash
curl -H "x-api-key: YOUR_API_KEY" \
  "http://localhost:3000/api/menu-items?category=Salads&with_costs=true"
```

##### GET /api/menu-items/{id}
Get detailed menu item information including ingredients and cost analysis.

##### POST /api/menu-items/{id}/ingredients
Assign Costco products as ingredients to menu items.

```bash
curl -X POST http://localhost:3000/api/menu-items/123/ingredients \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"ingredients": [{"costco_product_id": "456"}], "replace_existing": false}'
```

##### DELETE /api/menu-items/{id}/ingredients/{ingredientId}
Remove ingredient assignment from menu item.

#### Cost Analysis

##### POST /api/menu-items/{id}/calculate-cost
Calculate food cost for specific menu item using AI analysis.

```bash
curl -X POST http://localhost:3000/api/menu-items/123/calculate-cost \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"force_recalculate": true}'
```

##### POST /api/cost-analysis/bulk-calculate
Start bulk cost calculation for multiple menu items.

```bash
curl -X POST http://localhost:3000/api/cost-analysis/bulk-calculate \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"menu_item_ids": ["123", "456"], "only_missing": true}'
```

##### GET /api/cost-analysis/job/{jobId}/status
Check status of bulk calculation job.

#### Discovery Endpoints

##### GET /api/categories
Get all available product categories.

```bash
curl http://localhost:3000/api/categories
```

##### GET /api/search
Search products by name with full-text search and relevance ranking.

**Parameters:**
- `q` or `query` - Search term (required, min 2 characters)
- `context` - Search context: 'ingredient_assignment' for optimized ingredient selection
- `category` - Filter results by category
- `limit` - Results per page (default: 50, max: 200)
- `offset` - Results offset
- `page` - Page number (alternative to offset)

```bash
# Basic search
curl "http://localhost:3000/api/search?q=bread"

# Search for ingredient assignment (prioritizes food categories)
curl "http://localhost:3000/api/search?q=chicken&context=ingredient_assignment"

# Search within category
curl "http://localhost:3000/api/search?q=organic&category=Fresh Produce"

# Paginated search
curl "http://localhost:3000/api/search?q=chicken&page=2&limit=20"
```

## Grocery Categories Scraped

The scraper automatically discovers and processes these grocery categories:
- Baking
- Breads & Bakery
- Canned & Jarred Foods
- Cereal & Breakfast
- Dairy & Eggs
- Deli
- Fresh Produce
- Frozen Foods
- Meat & Seafood
- Pantry & Dry Goods
- Soups, Broth & Chili

## Database Schema

### Costco Scraper Tables

#### products
- `id`: Primary key
- `costco_product_id`: Unique Costco product identifier
- `name`: Product name
- `url`: Product page URL
- `category`: Product category
- `is_active`: Whether product is currently available
- `first_seen_date`: When product was first discovered
- `last_seen_date`: When product was last seen
- `created_at`, `updated_at`: Timestamps

#### price_history
- `id`: Primary key
- `product_id`: Foreign key to products table
- `price`: Product price
- `price_per_unit`: Price per unit information
- `scraped_at`: When price was recorded
- `created_at`: Timestamp

#### scraping_jobs
- `id`: Primary key
- `status`: Job status (started, completed, failed)
- `products_scraped`: Number of products processed
- `products_added`: Number of new products added
- `products_updated`: Number of existing products updated
- `products_deactivated`: Number of products marked inactive
- `error_message`: Error details if job failed
- `started_at`, `completed_at`: Job timing
- `created_at`: Timestamp

### Square Integration Tables

#### restaurant_config
- `id`: Primary key
- `restaurant_name`: Restaurant business name
- `square_merchant_id`: Square merchant identifier
- `square_access_token`: Encrypted Square access token
- `square_refresh_token`: Encrypted Square refresh token
- `square_token_expires_at`: Token expiration timestamp
- `target_food_cost_percentage`: Target food cost percentage
- `created_at`, `updated_at`: Timestamps

#### square_menu_items
- `id`: Primary key
- `square_item_id`: Unique Square item identifier
- `square_variation_id`: Square variation identifier
- `name`: Menu item name
- `description`: Menu item description
- `category`: Menu item category
- `price`: Menu item price
- `currency`: Currency (default: USD)
- `is_active`: Whether item is currently active
- `last_synced_at`: Last sync timestamp
- `created_at`, `updated_at`: Timestamps

#### menu_item_ingredients
- `id`: Primary key
- `menu_item_id`: Foreign key to square_menu_items
- `costco_product_id`: Foreign key to products
- `assigned_by_user_id`: User who assigned ingredient
- `created_at`: Assignment timestamp

#### menu_item_costs
- `id`: Primary key
- `menu_item_id`: Foreign key to square_menu_items
- `calculated_cost`: Calculated food cost
- `cost_breakdown`: JSON breakdown by ingredient
- `margin_percentage`: Profit margin percentage
- `food_cost_percentage`: Food cost percentage
- `confidence_score`: AI confidence score (0-1)
- `calculation_method`: Method used (llm, manual_override)
- `llm_explanation`: AI explanation of calculation
- `calculated_at`: Calculation timestamp
- `created_at`: Record creation timestamp

#### square_sync_logs
- `id`: Primary key (UUID)
- `sync_type`: Type of sync (manual, scheduled, webhook)
- `sync_status`: Status (started, completed, failed)
- `items_found`: Number of items found in Square
- `items_created`: Number of new items created
- `items_updated`: Number of items updated
- `items_deactivated`: Number of items deactivated
- `error_message`: Error message if failed
- `error_details`: JSON error details
- `started_at`: Sync start timestamp
- `completed_at`: Sync completion timestamp
- `duration_seconds`: Sync duration

### Key Features

- Automatic product deduplication by `costco_product_id`
- Price history only stored when prices change
- Comprehensive job logging for monitoring
- Proper indexing for fast queries

## Deployment

### Hybrid Deployment (Recommended)

The scraper takes 10-15 minutes to complete, which exceeds Vercel's serverless function limits. We recommend a **hybrid approach**:

#### **APIs on Vercel** (Fast data serving)
1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel`
3. Set environment variables in Vercel dashboard
4. Configure PostgreSQL database (Neon recommended)

#### **Scraping via GitHub Actions** (Reliable scheduled execution)
1. Add secrets to GitHub repository settings:
   - `DATABASE_URL`
   - `COSTCO_ZIP_CODE` 
   - `SCRAPE_DELAY_MS`
   - `MAX_RETRIES`
2. The included workflow (`.github/workflows/scheduled-scrape.yml`) runs every 6 hours
3. Manual triggers available via GitHub Actions UI

### Vercel Timeout Limitations

**⚠️ Important**: The `/api/scrape` endpoint will timeout on Vercel:
- **Hobby Plan**: 10 seconds (scraper needs 10+ minutes)
- **Pro Plan**: 60 seconds (still insufficient)
- **Enterprise Plan**: 15 minutes (might work but not reliable)

### Alternative Deployment Options

#### **Option 1: GitHub Actions** (Free, Recommended)
- Runs on GitHub's infrastructure
- No timeout issues
- Built-in scheduling
- Free for public repos

#### **Option 2: Railway** 
- Supports longer-running processes
- Built-in cron jobs
- PostgreSQL included
- Deploy APIs and scraper together

#### **Option 3: Render**
- Background workers for scraping
- Web services for APIs
- PostgreSQL included

#### **Option 4: Self-hosted**
- VPS with cron jobs
- Full control over execution time
- Cost-effective for simple use

### Environment Variables for Production

Set these in your deployment platform:
- `DATABASE_URL`
- `COSTCO_ZIP_CODE`
- `API_KEY`
- `SCRAPE_DELAY_MS`
- `MAX_RETRIES`

## Project Structure

```
costco-inventory/
├── api/                    # Vercel serverless functions
│   ├── scrape.js          # Main scraping endpoint
│   ├── health.js          # Health check endpoint
│   ├── products.js        # Products API endpoint
│   ├── categories.js      # Categories API endpoint
│   └── jobs/
│       └── latest.js      # Latest job status
├── lib/                   # Core libraries
│   ├── database.js        # Database operations
│   ├── scraper.js         # Web scraping logic with UI location setting
│   └── logger.js          # Logging utility
├── scripts/               # Setup and utility scripts
│   ├── setup-database.js  # Database schema setup
│   └── reset-database.js  # Database reset utility
├── logs/                  # Application logs (local only)
├── screenshots/           # Debug screenshots (local only)
└── server.js             # Local development server
```

## Scraping Process

1. **Initialization**: Launches headless Chromium browser
2. **Location Setting**: Uses UI to set delivery ZIP code (80031)
3. **Category Discovery**: Finds all grocery category links
4. **Product URL Extraction**: Extracts product URLs from category pages
5. **Pagination**: Automatically handles multiple pages per category
6. **Product Data Extraction**: Visits individual product pages for detailed data
7. **Database Storage**: Saves products and price history
8. **Job Tracking**: Logs entire process for monitoring

## Technical Features

- **Headless Operation**: Runs without browser UI for server deployment
- **Robust Error Handling**: Graceful handling of network issues and page failures
- **Location Verification**: Confirms ZIP code filtering is working
- **Pagination Support**: Automatically processes all pages in each category
- **Batch Processing**: Saves products in batches to prevent connection timeouts
- **Connection Recovery**: Handles database connection issues gracefully

## Monitoring

- Check `/api/health` for system status
- Check `/api/jobs/latest` for recent job performance
- Logs are stored in `logs/` directory (local) or Vercel function logs (production)
- Screenshots saved during debugging (local development only)

## Performance

- Processes ~200 products per category with full pagination
- Approximately 10-15 minutes for complete 11-category scan
- Respects rate limits with configurable delays between requests
- Efficient database operations with proper indexing