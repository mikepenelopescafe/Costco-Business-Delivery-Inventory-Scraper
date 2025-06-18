const Database = require('../../../lib/database');
const url = require('url');

module.exports = async (req, res) => {
  try {
    const db = new Database();
    
    if (req.method === 'GET') {
      const parsedUrl = url.parse(req.url, true);
      const pathParts = parsedUrl.pathname.split('/');
      const productId = pathParts[pathParts.length - 2]; // products/[id]/price-history
      
      const { 
        limit, 
        start_date, 
        end_date 
      } = parsedUrl.query;
      
      if (!productId || productId === '[id]') {
        return res.status(400).json({
          success: false,
          error: 'Product ID is required'
        });
      }
      
      // First verify the product exists and get its internal ID
      let product;
      let internalProductId;
      
      if (/^\d+$/.test(productId)) {
        // Numeric ID - use internal ID
        product = await db.getProductById(parseInt(productId));
        internalProductId = parseInt(productId);
      } else {
        // String ID - use Costco product ID
        product = await db.getProductByCostcoId(productId);
        internalProductId = product?.id;
      }
      
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
      
      // Get price history
      const options = {
        limit: parseInt(limit) || 100,
        startDate: start_date ? new Date(start_date) : undefined,
        endDate: end_date ? new Date(end_date) : undefined
      };
      
      // Validate date range
      if (options.startDate && isNaN(options.startDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid start_date format. Use YYYY-MM-DD'
        });
      }
      
      if (options.endDate && isNaN(options.endDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: 'Invalid end_date format. Use YYYY-MM-DD'
        });
      }
      
      if (options.limit > 1000) {
        return res.status(400).json({
          success: false,
          error: 'Limit cannot exceed 1000'
        });
      }
      
      const priceHistory = await db.getProductPriceHistory(internalProductId, options);
      
      // Calculate price analytics
      const prices = priceHistory.map(entry => parseFloat(entry.price));
      let analytics = null;
      
      if (prices.length > 0) {
        analytics = {
          totalEntries: priceHistory.length,
          priceRange: {
            lowest: Math.min(...prices),
            highest: Math.max(...prices),
            current: prices[0] // Most recent price (first in DESC order)
          },
          average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
          volatility: prices.length > 1 ? {
            changes: prices.length - 1,
            increases: 0,
            decreases: 0,
            noChange: 0
          } : null
        };
        
        // Calculate price change directions
        if (analytics.volatility) {
          for (let i = 1; i < prices.length; i++) {
            const current = prices[i - 1];
            const previous = prices[i];
            
            if (current > previous) {
              analytics.volatility.increases++;
            } else if (current < previous) {
              analytics.volatility.decreases++;
            } else {
              analytics.volatility.noChange++;
            }
          }
        }
      }
      
      res.status(200).json({
        success: true,
        product: {
          id: product.id,
          costco_product_id: product.costco_product_id,
          name: product.name
        },
        price_history: priceHistory,
        analytics,
        filters: {
          limit: options.limit,
          startDate: options.startDate?.toISOString().split('T')[0],
          endDate: options.endDate?.toISOString().split('T')[0]
        }
      });
      
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Price history API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};