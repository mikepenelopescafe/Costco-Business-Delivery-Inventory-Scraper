require('dotenv').config();
const SquareDatabase = require('../../../lib/square/database');
const ClaudeService = require('../../../lib/llm/claude');

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
        const { force_recalculate = false, include_labor = false } = req.body;
        
        if (!menuItemId) {
          return res.status(400).json({
            error: {
              code: 'MISSING_MENU_ITEM_ID',
              message: 'Menu item ID is required'
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
        
        // Get ingredients for this menu item
        const ingredients = await db.getMenuItemIngredients(menuItem.id);
        
        if (ingredients.length === 0) {
          await db.disconnect();
          return res.status(400).json({
            error: {
              code: 'NO_INGREDIENTS_ASSIGNED',
              message: 'No ingredients assigned to this menu item'
            }
          });
        }
        
        // Check if we should use cached calculation
        if (!force_recalculate && menuItem.calculated_cost !== null) {
          const calculatedAt = new Date(menuItem.cost_calculated_at);
          const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          
          if (calculatedAt > twentyFourHoursAgo) {
            await db.disconnect();
            
            return res.json({
              id: menuItem.id.toString(),
              calculated_cost: parseFloat(menuItem.calculated_cost),
              cost_breakdown: menuItem.cost_breakdown || {},
              margin_percentage: parseFloat(menuItem.margin_percentage || 0),
              food_cost_percentage: parseFloat(menuItem.food_cost_percentage || 0),
              confidence_score: parseFloat(menuItem.confidence_score || 0),
              suggested_price: this.calculateSuggestedPrice(parseFloat(menuItem.calculated_cost), 30),
              llm_explanation: menuItem.llm_explanation,
              calculation_time_ms: 0, // Cached result
              cached: true
            });
          }
        }
        
        try {
          // Calculate cost using Claude
          const claudeService = new ClaudeService();
          const costResult = await claudeService.calculateMenuItemCost(menuItem, ingredients);
          
          // Save calculation to database
          const costData = {
            menu_item_id: menuItem.id,
            calculated_cost: costResult.calculated_cost,
            cost_breakdown: costResult.cost_breakdown,
            margin_percentage: costResult.margin_percentage,
            food_cost_percentage: costResult.food_cost_percentage,
            confidence_score: costResult.confidence_score,
            calculation_method: 'llm',
            llm_explanation: costResult.llm_explanation
          };
          
          await db.saveCostCalculation(costData);
          await db.disconnect();
          
          res.json({
            id: menuItem.id.toString(),
            calculated_cost: costResult.calculated_cost,
            cost_breakdown: costResult.cost_breakdown,
            margin_percentage: costResult.margin_percentage,
            food_cost_percentage: costResult.food_cost_percentage,
            confidence_score: costResult.confidence_score,
            suggested_price: costResult.suggested_price,
            llm_explanation: costResult.llm_explanation,
            calculation_time_ms: costResult.calculation_time_ms
          });
          
        } catch (llmError) {
          await db.disconnect();
          
          console.error('LLM calculation error:', llmError);
          res.status(500).json({
            error: {
              code: 'LLM_CALCULATION_FAILED',
              message: 'Cost calculation failed',
              details: llmError.message
            }
          });
        }
        
      } catch (error) {
        console.error('Cost calculation error:', error);
        res.status(500).json({
          error: {
            code: 'COST_CALCULATION_FAILED',
            message: 'Failed to calculate cost',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }

  // Helper function for suggested price calculation
  function calculateSuggestedPrice(cost, targetFoodCostPercentage) {
    if (cost <= 0 || targetFoodCostPercentage <= 0 || targetFoodCostPercentage >= 100) {
      return null;
    }
    
    const suggestedPrice = cost / (targetFoodCostPercentage / 100);
    return parseFloat(suggestedPrice.toFixed(2));
  }
};