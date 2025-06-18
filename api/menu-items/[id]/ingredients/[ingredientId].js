require('dotenv').config();
const SquareDatabase = require('../../../../lib/square/database');

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
  if (req.method === 'DELETE') {
    validateApiKey(req, res, async () => {
      try {
        const menuItemId = req.query.id;
        const ingredientId = req.query.ingredientId;
        
        if (!menuItemId) {
          return res.status(400).json({
            error: {
              code: 'MISSING_MENU_ITEM_ID',
              message: 'Menu item ID is required'
            }
          });
        }
        
        if (!ingredientId) {
          return res.status(400).json({
            error: {
              code: 'MISSING_INGREDIENT_ID',
              message: 'Ingredient assignment ID is required'
            }
          });
        }
        
        const db = new SquareDatabase();
        
        // Check if menu item exists
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
        
        // Remove the ingredient assignment
        const removed = await db.removeIngredient(ingredientId);
        
        await db.disconnect();
        
        if (!removed) {
          return res.status(404).json({
            error: {
              code: 'INGREDIENT_NOT_FOUND',
              message: 'Ingredient assignment not found'
            }
          });
        }
        
        res.json({
          success: true,
          message: 'Ingredient removed successfully'
        });
        
      } catch (error) {
        console.error('Ingredient removal error:', error);
        res.status(500).json({
          error: {
            code: 'INGREDIENT_REMOVAL_FAILED',
            message: 'Failed to remove ingredient',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};