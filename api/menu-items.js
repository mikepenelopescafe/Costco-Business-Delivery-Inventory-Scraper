require('dotenv').config();
const SquareDatabase = require('../lib/square/database');
const cors = require('../lib/cors');

// Validate API key middleware
function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || 
                     req.headers['authorization']?.replace('Bearer ', '');
  
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = async (req, res) => {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method === 'GET') {
    validateApiKey(req, res, async () => {
      try {
        const {
          category,
          active_only = 'true',
          with_costs = 'true',
          search,
          limit = 50,
          offset = 0,
          sort_by = 'name',
          sort_order = 'asc'
        } = req.query;
        
        // Validate parameters
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 200) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'limit must be between 1 and 200'
            }
          });
        }
        
        if (isNaN(offsetNum) || offsetNum < 0) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'offset must be 0 or greater'
            }
          });
        }
        
        const options = {
          category: category || null,
          active_only: active_only === 'true',
          with_costs: with_costs === 'true',
          search: search || null,
          limit: limitNum,
          offset: offsetNum,
          sort_by,
          sort_order
        };
        
        const db = new SquareDatabase();
        const result = await db.getMenuItems(options);
        
        // Get ingredients for each menu item if requested
        const items = [];
        for (const item of result.items) {
          const ingredients = await db.getMenuItemIngredients(item.id);
          
          const menuItem = {
            id: item.id.toString(),
            square_item_id: item.square_item_id,
            name: item.name,
            description: item.description,
            category: item.category,
            price: parseFloat(item.price || 0),
            is_active: item.is_active,
            ingredients: ingredients.map(ing => ({
              costco_product_id: ing.costco_product_id.toString(),
              name: ing.name,
              current_price: parseFloat(ing.current_price || 0),
              unit: ing.price_per_unit || 'per unit'
            }))
          };
          
          // Add cost analysis if available and requested
          if (with_costs === 'true' && item.calculated_cost !== null) {
            menuItem.cost_analysis = {
              calculated_cost: parseFloat(item.calculated_cost),
              margin_percentage: parseFloat(item.margin_percentage || 0),
              food_cost_percentage: parseFloat(item.food_cost_percentage || 0),
              confidence_score: parseFloat(item.confidence_score || 0),
              last_calculated: item.cost_calculated_at
            };
          }
          
          items.push(menuItem);
        }
        
        await db.disconnect();
        
        res.json({
          items,
          total: result.total,
          limit: result.limit,
          offset: result.offset
        });
        
      } catch (error) {
        console.error('Menu items fetch error:', error);
        res.status(500).json({
          error: {
            code: 'MENU_ITEMS_FETCH_FAILED',
            message: 'Failed to fetch menu items',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};