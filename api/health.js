require('dotenv').config();
const Database = require('../lib/database');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const db = new Database();
  
  try {
    await db.connect();
    
    // Get latest job info
    const latestJob = await db.getLatestJob();
    
    // Get active products count
    const activeProducts = await db.getActiveProducts();
    
    const response = {
      status: 'healthy',
      lastJobStatus: latestJob?.status || 'none',
      lastJobDate: latestJob?.started_at || null,
      productsActive: activeProducts.length,
      databaseConnected: true,
      timestamp: new Date().toISOString()
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      databaseConnected: false,
      timestamp: new Date().toISOString()
    });
  } finally {
    await db.disconnect();
  }
}

module.exports = handler;