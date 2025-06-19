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
        
        // Get unique categories from square_menu_items
        const result = await db.client.query(`
          SELECT 
            category,
            COUNT(*) as item_count,
            COUNT(CASE WHEN is_active = true THEN 1 END) as active_count
          FROM square_menu_items 
          WHERE category IS NOT NULL 
            AND category != ''
          GROUP BY category
          ORDER BY category ASC
        `);
        
        // Format the response
        const categories = result.rows.map(row => ({
          name: row.category,
          item_count: parseInt(row.item_count),
          active_count: parseInt(row.active_count)
        }));
        
        res.status(200).json({
          categories: categories,
          total: categories.length,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('Error fetching menu item categories:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to fetch menu item categories',
          details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
      } finally {
        await db.disconnect();
      }
    });
  } else {
    res.status(405).json({ 
      error: 'Method not allowed',
      allowed_methods: ['GET']
    });
  }
};