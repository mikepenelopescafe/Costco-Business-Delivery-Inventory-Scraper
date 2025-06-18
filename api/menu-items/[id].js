require('dotenv').config();
const SquareDatabase = require('../../lib/square/database');

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
  if (req.method === 'GET') {
    validateApiKey(req, res, async () => {
      try {
        const menuItemId = req.query.id;
        
        if (!menuItemId) {
          return res.status(400).json({
            error: {
              code: 'MISSING_MENU_ITEM_ID',
              message: 'Menu item ID is required'
            }
          });
        }
        
        const db = new SquareDatabase();
        const menuItem = await db.getMenuItemById(menuItemId);
        
        if (!menuItem) {
          await db.disconnect();
          return res.status(404).json({
            error: {
              code: 'MENU_ITEM_NOT_FOUND',
              message: 'Menu item not found'
            }
          });
        }
        
        // Get ingredients for this menu item
        const ingredients = await db.getMenuItemIngredients(menuItem.id);
        
        await db.disconnect();
        
        const response = {
          id: menuItem.id.toString(),
          square_item_id: menuItem.square_item_id,
          name: menuItem.name,
          description: menuItem.description,
          category: menuItem.category,
          price: parseFloat(menuItem.price || 0),
          ingredients: ingredients.map(ing => ({
            id: ing.id.toString(),
            costco_product_id: ing.costco_product_id.toString(),
            name: ing.name,
            current_price: parseFloat(ing.current_price || 0),
            unit: ing.price_per_unit || 'per unit',
            assigned_at: ing.assigned_at
          })),
          last_synced: menuItem.last_synced_at
        };
        
        // Add cost analysis if available
        if (menuItem.calculated_cost !== null) {
          response.cost_analysis = {
            calculated_cost: parseFloat(menuItem.calculated_cost),
            cost_breakdown: menuItem.cost_breakdown || {},
            margin_percentage: parseFloat(menuItem.margin_percentage || 0),
            food_cost_percentage: parseFloat(menuItem.food_cost_percentage || 0),
            confidence_score: parseFloat(menuItem.confidence_score || 0),
            llm_explanation: menuItem.llm_explanation,
            last_calculated: menuItem.cost_calculated_at
          };
        }
        
        res.json(response);
        
      } catch (error) {
        console.error('Menu item fetch error:', error);
        res.status(500).json({
          error: {
            code: 'MENU_ITEM_FETCH_FAILED',
            message: 'Failed to fetch menu item',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};