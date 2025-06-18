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
  if (req.method === 'GET') {
    validateApiKey(req, res, async () => {
      try {
        const {
          limit = 10,
          offset = 0
        } = req.query;
        
        // Validate parameters
        const limitNum = parseInt(limit);
        const offsetNum = parseInt(offset);
        
        if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'limit must be between 1 and 50'
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
        
        const db = new SquareDatabase();
        const result = await db.getSyncHistory(limitNum, offsetNum);
        await db.disconnect();
        
        // Transform the results to match API specification
        const syncs = result.syncs.map(sync => ({
          id: sync.id,
          sync_type: sync.sync_type,
          status: sync.sync_status,
          items_created: sync.items_created || 0,
          items_updated: sync.items_updated || 0,
          items_deactivated: sync.items_deactivated || 0,
          started_at: sync.started_at,
          duration_seconds: sync.duration_seconds
        }));
        
        res.json({
          syncs,
          total: result.total,
          limit: result.limit,
          offset: result.offset
        });
        
      } catch (error) {
        console.error('Sync history error:', error);
        res.status(500).json({
          error: {
            code: 'SYNC_HISTORY_FAILED',
            message: 'Failed to retrieve sync history',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};