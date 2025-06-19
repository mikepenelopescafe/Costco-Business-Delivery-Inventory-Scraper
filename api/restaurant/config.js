require('dotenv').config();
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
      const db = new SquareDatabase();
      
      try {
        await db.connect();
        const config = await db.getRestaurantConfig();
        
        if (!config) {
          return res.status(404).json({
            error: 'Not found',
            message: 'Restaurant configuration not found. Please complete Square OAuth setup first.'
          });
        }
        
        // Return non-sensitive configuration data
        res.status(200).json({
          restaurant_name: config.restaurant_name,
          square_merchant_id: config.square_merchant_id,
          target_food_cost_percentage: config.target_food_cost_percentage,
          is_connected: !!config.square_access_token,
          last_sync: config.last_sync_at,
          created_at: config.created_at
        });
      } catch (error) {
        console.error('Error fetching restaurant config:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to fetch restaurant configuration'
        });
      } finally {
        await db.disconnect();
      }
    });
  } else if (req.method === 'PUT') {
    validateApiKey(req, res, async () => {
      const db = new SquareDatabase();
      
      try {
        const { target_food_cost_percentage } = req.body;
        
        if (target_food_cost_percentage !== undefined) {
          if (typeof target_food_cost_percentage !== 'number' || 
              target_food_cost_percentage < 0 || 
              target_food_cost_percentage > 100) {
            return res.status(400).json({
              error: 'Invalid input',
              message: 'Target food cost percentage must be a number between 0 and 100'
            });
          }
        }
        
        await db.connect();
        const config = await db.getRestaurantConfig();
        
        if (!config) {
          return res.status(404).json({
            error: 'Not found',
            message: 'Restaurant configuration not found'
          });
        }
        
        // Update configuration
        if (target_food_cost_percentage !== undefined) {
          await db.client.query(
            'UPDATE restaurant_config SET target_food_cost_percentage = $1, updated_at = NOW() WHERE id = $2',
            [target_food_cost_percentage, config.id]
          );
        }
        
        res.status(200).json({
          message: 'Configuration updated successfully'
        });
      } catch (error) {
        console.error('Error updating restaurant config:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to update restaurant configuration'
        });
      } finally {
        await db.disconnect();
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};