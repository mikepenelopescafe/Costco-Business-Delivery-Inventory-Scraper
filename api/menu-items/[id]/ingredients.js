require('dotenv').config();
const SquareDatabase = require('../../../lib/square/database');

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
  if (req.method === 'POST') {
    validateApiKey(req, res, async () => {
      try {
        const menuItemId = req.query.id;
        const { ingredients, replace_existing = false } = req.body;
        
        if (!menuItemId) {
          return res.status(400).json({
            error: {
              code: 'MISSING_MENU_ITEM_ID',
              message: 'Menu item ID is required'
            }
          });
        }
        
        if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'ingredients array is required and must not be empty'
            }
          });
        }
        
        // Validate ingredient structure
        for (const ingredient of ingredients) {
          if (!ingredient.costco_product_id) {
            return res.status(400).json({
              error: {
                code: 'INVALID_PARAMETERS',
                message: 'Each ingredient must have a costco_product_id'
              }
            });
          }
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
        
        let ingredientsAdded = 0;
        
        try {
          if (replace_existing) {
            // Replace all existing ingredients
            const costcoProductIds = ingredients.map(ing => ing.costco_product_id);
            ingredientsAdded = await db.replaceIngredients(menuItemId, costcoProductIds);
          } else {
            // Add new ingredients
            for (const ingredient of ingredients) {
              try {
                await db.assignIngredient(menuItemId, ingredient.costco_product_id);
                ingredientsAdded++;
              } catch (error) {
                if (error.message.includes('already assigned')) {
                  // Skip duplicates, don't count as error
                  continue;
                } else {
                  throw error;
                }
              }
            }
          }
          
          await db.disconnect();
          
          res.json({
            success: true,
            ingredients_added: ingredientsAdded,
            message: 'Ingredients assigned successfully'
          });
          
        } catch (error) {
          await db.disconnect();
          throw error;
        }
        
      } catch (error) {
        console.error('Ingredient assignment error:', error);
        
        let errorCode = 'INGREDIENT_ASSIGNMENT_FAILED';
        let errorMessage = 'Failed to assign ingredients';
        
        if (error.message.includes('foreign key')) {
          errorCode = 'INVALID_PRODUCT_ID';
          errorMessage = 'One or more Costco product IDs are invalid';
        }
        
        res.status(500).json({
          error: {
            code: errorCode,
            message: errorMessage,
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};