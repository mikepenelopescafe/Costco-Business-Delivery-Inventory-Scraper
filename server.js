require('dotenv').config();
const http = require('http');
const url = require('url');

// Import API handlers
const scrapeHandler = require('./api/scrape');
const healthHandler = require('./api/health');
const latestJobHandler = require('./api/jobs/latest');
const productsHandler = require('./api/products');
const categoriesHandler = require('./api/categories');
const searchHandler = require('./api/search');
const statsHandler = require('./api/stats');
const productDetailHandler = require('./api/products/[id]');
const priceHistoryHandler = require('./api/products/[id]/price-history');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  try {
    // Route requests to appropriate handlers
    if (path === '/api/scrape') {
      await scrapeHandler(req, res);
    } else if (path === '/api/health') {
      await healthHandler(req, res);
    } else if (path === '/api/jobs/latest') {
      await latestJobHandler(req, res);
    } else if (path === '/api/products') {
      await productsHandler(req, res);
    } else if (path === '/api/categories') {
      await categoriesHandler(req, res);
    } else if (path === '/api/search') {
      await searchHandler(req, res);
    } else if (path === '/api/stats') {
      await statsHandler(req, res);
    } else if (path.match(/^\/api\/products\/[^\/]+\/price-history$/)) {
      // Handle /api/products/{id}/price-history
      await priceHistoryHandler(req, res);
    } else if (path.match(/^\/api\/products\/[^\/]+$/)) {
      // Handle /api/products/{id}
      await productDetailHandler(req, res);
    } else if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Costco Inventory Scraper API',
        version: '2.0.0',
        endpoints: {
          // Core endpoints
          'GET /api/health': 'Health check and system status',
          'GET /api/jobs/latest': 'Latest scraping job status',
          'POST /api/scrape': 'Trigger manual scraping (requires API key)',
          
          // Product endpoints
          'GET /api/products': 'Get products with pagination and filtering',
          'GET /api/products/{id}': 'Get detailed product information',
          'GET /api/products/{id}/price-history': 'Get product price history',
          
          // Discovery endpoints
          'GET /api/categories': 'Get all product categories',
          'GET /api/search': 'Search products by name',
          'GET /api/stats': 'Get database statistics and insights'
        },
        examples: {
          'Products with pagination': '/api/products?page=1&limit=20&category=Baking',
          'Product search': '/api/search?q=bread&category=Baking',
          'Price filtering': '/api/products?min_price=10&max_price=100',
          'Product detail': '/api/products/123 or /api/products/COSTCO_ID',
          'Price history': '/api/products/123/price-history?limit=50'
        }
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        error: 'Not found',
        available_endpoints: [
          '/api/health',
          '/api/jobs/latest', 
          '/api/products',
          '/api/products/{id}',
          '/api/products/{id}/price-history',
          '/api/categories',
          '/api/search',
          '/api/stats',
          '/api/scrape'
        ]
      }));
    }
  } catch (error) {
    console.error('Server error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Costco Inventory Scraper API v2.0.0`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/                        - API documentation`);
  console.log(`  GET  http://localhost:${PORT}/api/health              - Health check`);
  console.log(`  GET  http://localhost:${PORT}/api/stats               - Database statistics`);
  console.log(`  POST http://localhost:${PORT}/api/scrape              - Trigger scraping (requires API key)`);
  console.log(`  GET  http://localhost:${PORT}/api/jobs/latest         - Latest job status`);
  console.log(`\n🛍️  Product endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/api/products            - List products (with pagination)`);
  console.log(`  GET  http://localhost:${PORT}/api/products/{id}       - Product details`);
  console.log(`  GET  http://localhost:${PORT}/api/products/{id}/price-history - Price history`);
  console.log(`  GET  http://localhost:${PORT}/api/categories          - List categories`);
  console.log(`  GET  http://localhost:${PORT}/api/search?q=term       - Search products`);
  console.log(`\n💡 Example usage:`);
  console.log(`  curl "http://localhost:${PORT}/api/products?page=1&limit=10&category=Baking"`);
  console.log(`  curl "http://localhost:${PORT}/api/search?q=bread&category=Baking"`);
});

module.exports = server;