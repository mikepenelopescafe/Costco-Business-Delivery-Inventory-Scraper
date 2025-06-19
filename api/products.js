const Database = require('../lib/database');
const url = require('url');
const cors = require('../lib/cors');

module.exports = async (req, res) => {
  // Handle CORS
  if (cors(req, res)) return;
  try {
    const db = new Database();
    
    if (req.method === 'GET') {
      const parsedUrl = url.parse(req.url, true);
      const { 
        page, 
        limit, 
        category, 
        search, 
        min_price, 
        max_price, 
        sort_by, 
        sort_order,
        // Legacy support
        legacy
      } = parsedUrl.query;
      
      // Convert query parameters
      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        category,
        search,
        minPrice: min_price ? parseFloat(min_price) : undefined,
        maxPrice: max_price ? parseFloat(max_price) : undefined,
        sortBy: sort_by || 'name',
        sortOrder: sort_order || 'asc'
      };
      
      // Validate limits
      if (options.limit > 200) {
        return res.status(400).json({
          success: false,
          error: 'Limit cannot exceed 200'
        });
      }
      
      // For backward compatibility, if no pagination params provided, use legacy method
      if (!page && !limit && !search && !min_price && !max_price && !sort_by) {
        let products;
        if (category) {
          products = await db.getProductsByCategory(category);
        } else {
          products = await db.getActiveProducts();
        }
        
        // Add latest price for each product
        const productsWithPrices = await Promise.all(
          products.map(async (product) => {
            const priceResult = await db.client.query(
              'SELECT price, scraped_at FROM price_history WHERE product_id = $1 ORDER BY scraped_at DESC LIMIT 1',
              [product.id]
            );
            
            return {
              ...product,
              current_price: priceResult.rows[0]?.price || null,
              price_updated_at: priceResult.rows[0]?.scraped_at || null
            };
          })
        );
        
        return res.status(200).json({
          success: true,
          products: productsWithPrices,
          count: productsWithPrices.length,
          category: category || 'all'
        });
      }
      
      // Use new paginated method
      const result = await db.getProductsPaginated(options);
      
      res.status(200).json({
        success: true,
        data: result.products,
        pagination: result.pagination,
        filters: {
          category,
          search,
          minPrice: options.minPrice,
          maxPrice: options.maxPrice,
          sortBy: options.sortBy,
          sortOrder: options.sortOrder
        }
      });
      
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Products API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};