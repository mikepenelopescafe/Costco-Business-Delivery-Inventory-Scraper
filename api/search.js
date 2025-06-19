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
        q, 
        query,
        context,
        category, 
        limit, 
        offset,
        page
      } = parsedUrl.query;
      
      // Support both 'q' and 'query' parameters
      const searchTerm = q || query;
      
      if (!searchTerm || searchTerm.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Search term is required. Use ?q=searchterm or ?query=searchterm'
        });
      }
      
      if (searchTerm.trim().length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search term must be at least 2 characters long'
        });
      }
      
      // Convert pagination parameters
      const searchLimit = parseInt(limit) || 50;
      let searchOffset = parseInt(offset) || 0;
      
      // Support page-based pagination as alternative to offset
      if (page && !offset) {
        const pageNum = parseInt(page) || 1;
        searchOffset = (pageNum - 1) * searchLimit;
      }
      
      // Validate limits
      if (searchLimit > 200) {
        return res.status(400).json({
          success: false,
          error: 'Limit cannot exceed 200'
        });
      }
      
      const options = {
        category,
        limit: searchLimit,
        offset: searchOffset,
        context: context // Pass context to database layer
      };
      
      const searchResults = await db.searchProducts(searchTerm.trim(), options);
      
      // Calculate pagination info
      const currentPage = Math.floor(searchOffset / searchLimit) + 1;
      const totalPages = Math.ceil(searchResults.total / searchLimit);
      
      const pagination = {
        page: currentPage,
        limit: searchLimit,
        offset: searchOffset,
        total: searchResults.total,
        totalPages,
        hasNext: searchOffset + searchLimit < searchResults.total,
        hasPrev: searchOffset > 0
      };
      
      // Format response based on context
      if (context === 'ingredient_assignment') {
        // Simplified format for ingredient assignment context
        const products = searchResults.products.map(product => ({
          id: product.id.toString(),
          costco_product_id: product.costco_product_id,
          name: product.name,
          category: product.category,
          current_price: parseFloat(product.current_price || 0),
          price_per_unit: product.price_per_unit || 'per unit',
          last_updated: product.price_updated_at || product.last_seen_date
        }));
        
        res.status(200).json({
          products,
          total: searchResults.total
        });
      } else {
        // Original detailed format for general search
        // Group results by category for better UX
        const resultsByCategory = {};
        searchResults.products.forEach(product => {
          const cat = product.category || 'Other';
          if (!resultsByCategory[cat]) {
            resultsByCategory[cat] = [];
          }
          resultsByCategory[cat].push(product);
        });
        
        res.status(200).json({
          success: true,
          search: {
            term: searchResults.searchTerm,
            total: searchResults.total,
            returned: searchResults.products.length
          },
          data: searchResults.products,
          grouped_by_category: resultsByCategory,
          pagination,
          filters: {
            category: category || 'all',
            context: context || 'general'
          }
        });
      }
      
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Search API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};