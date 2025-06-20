require('dotenv').config();
const Database = require('../../lib/database');
const SquareDatabase = require('../../lib/square/database');
const cors = require('../../lib/cors');

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
      const db = new Database();
      const squareDb = new SquareDatabase();
      
      try {
        await db.connect();
        await squareDb.connect();
        
        // Get Costco product metrics
        const productStats = await db.client.query(`
          SELECT 
            COUNT(DISTINCT costco_product_id) as total_products,
            COUNT(DISTINCT CASE WHEN is_active = true THEN costco_product_id END) as active_products,
            COUNT(DISTINCT category) as total_categories,
            AVG(CAST(REGEXP_REPLACE(price_per_unit, '[^0-9.]', '', 'g') AS NUMERIC)) as avg_price_per_unit
          FROM products p
          JOIN (
            SELECT DISTINCT ON (product_id) 
              product_id, 
              price,
              price_per_unit
            FROM price_history
            ORDER BY product_id, created_at DESC
          ) ph ON p.id = ph.product_id
        `);
        
        // Get Square menu item metrics
        const menuItemStats = await squareDb.client.query(`
          SELECT 
            COUNT(*) as total_menu_items,
            COUNT(CASE WHEN is_active = true THEN 1 END) as active_menu_items,
            COUNT(DISTINCT category) as menu_categories,
            AVG(price) as avg_menu_price
          FROM square_menu_items
        `);
        
        // Get cost analysis metrics
        const costAnalysisStats = await squareDb.client.query(`
          SELECT 
            COUNT(DISTINCT menu_item_id) as items_with_costs,
            AVG(margin_percentage) as avg_margin,
            AVG(food_cost_percentage) as avg_food_cost_percentage,
            MIN(food_cost_percentage) as best_food_cost_percentage,
            MAX(food_cost_percentage) as worst_food_cost_percentage
          FROM menu_item_costs
          WHERE calculated_at >= NOW() - INTERVAL '30 days'
        `);
        
        // Get recent activity metrics
        const recentActivity = await db.client.query(`
          SELECT 
            COUNT(*) as products_updated_today
          FROM products
          WHERE updated_at >= NOW() - INTERVAL '24 hours'
        `);
        
        // Get ingredient assignment metrics
        const ingredientStats = await squareDb.client.query(`
          SELECT 
            COUNT(DISTINCT menu_item_id) as items_with_ingredients,
            COUNT(*) as total_ingredient_assignments
          FROM menu_item_ingredients
        `);
        
        // Compile all metrics
        const metrics = {
          costco_products: {
            total: parseInt(productStats.rows[0]?.total_products) || 0,
            active: parseInt(productStats.rows[0]?.active_products) || 0,
            categories: parseInt(productStats.rows[0]?.total_categories) || 0,
            avg_price_per_unit: parseFloat(productStats.rows[0]?.avg_price_per_unit) || 0,
            updated_today: parseInt(recentActivity.rows[0]?.products_updated_today) || 0
          },
          menu_items: {
            total: parseInt(menuItemStats.rows[0]?.total_menu_items) || 0,
            active: parseInt(menuItemStats.rows[0]?.active_menu_items) || 0,
            categories: parseInt(menuItemStats.rows[0]?.menu_categories) || 0,
            avg_price: parseFloat(menuItemStats.rows[0]?.avg_menu_price) || 0,
            with_ingredients: parseInt(ingredientStats.rows[0]?.items_with_ingredients) || 0,
            with_cost_analysis: parseInt(costAnalysisStats.rows[0]?.items_with_costs) || 0
          },
          cost_analysis: {
            avg_margin_percentage: parseFloat(costAnalysisStats.rows[0]?.avg_margin) || 0,
            avg_food_cost_percentage: parseFloat(costAnalysisStats.rows[0]?.avg_food_cost_percentage) || 0,
            best_food_cost_percentage: parseFloat(costAnalysisStats.rows[0]?.best_food_cost_percentage) || 0,
            worst_food_cost_percentage: parseFloat(costAnalysisStats.rows[0]?.worst_food_cost_percentage) || 0
          },
          ingredients: {
            total_assignments: parseInt(ingredientStats.rows[0]?.total_ingredient_assignments) || 0
          },
          last_updated: new Date().toISOString()
        };
        
        res.status(200).json(metrics);
        
      } catch (error) {
        console.error('Error fetching dashboard metrics:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to fetch dashboard metrics',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      } finally {
        await db.disconnect();
        await squareDb.disconnect();
      }
    });
  } else {
    res.status(405).json({ 
      error: 'Method not allowed',
      allowed_methods: ['GET']
    });
  }
};