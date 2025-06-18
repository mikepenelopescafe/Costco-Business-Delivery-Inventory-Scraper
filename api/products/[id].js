const Database = require('../../lib/database');
const url = require('url');

module.exports = async (req, res) => {
  try {
    const db = new Database();
    
    if (req.method === 'GET') {
      const parsedUrl = url.parse(req.url, true);
      const pathParts = parsedUrl.pathname.split('/');
      const productId = pathParts[pathParts.length - 1];
      
      if (!productId || productId === '[id]') {
        return res.status(400).json({
          success: false,
          error: 'Product ID is required'
        });
      }
      
      // Check if it's a numeric ID or Costco product ID
      let product;
      if (/^\d+$/.test(productId)) {
        // Numeric ID - use internal ID
        product = await db.getProductById(parseInt(productId));
      } else {
        // String ID - use Costco product ID
        product = await db.getProductByCostcoId(productId);
      }
      
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }
      
      // Get price history for this product (last 50 entries)
      const priceHistory = await db.getProductPriceHistory(product.id, { limit: 50 });
      
      // Calculate price statistics
      const prices = priceHistory.map(entry => parseFloat(entry.price));
      const priceStats = prices.length > 0 ? {
        current: parseFloat(product.current_price || 0),
        lowest: Math.min(...prices),
        highest: Math.max(...prices),
        average: prices.reduce((sum, price) => sum + price, 0) / prices.length,
        changeCount: priceHistory.length - 1
      } : null;
      
      res.status(200).json({
        success: true,
        product: {
          ...product,
          price_statistics: priceStats,
          price_history_count: priceHistory.length
        },
        price_history: priceHistory
      });
      
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Product detail API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};