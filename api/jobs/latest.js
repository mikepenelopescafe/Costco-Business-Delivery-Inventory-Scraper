require('dotenv').config();
const Database = require('../../lib/database');

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const db = new Database();
  
  try {
    await db.connect();
    
    const latestJob = await db.getLatestJob();
    
    if (!latestJob) {
      return res.status(404).json({ error: 'No jobs found' });
    }
    
    // Calculate duration if completed
    let duration = null;
    if (latestJob.started_at && latestJob.completed_at) {
      const start = new Date(latestJob.started_at);
      const end = new Date(latestJob.completed_at);
      const diffMs = end - start;
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      duration = `${diffMins}m ${diffSecs}s`;
    }
    
    const response = {
      id: latestJob.id,
      status: latestJob.status,
      productsScraped: latestJob.products_scraped || 0,
      productsUpdated: latestJob.products_updated || 0,
      productsAdded: latestJob.products_added || 0,
      productsDeactivated: latestJob.products_deactivated || 0,
      startedAt: latestJob.started_at,
      completedAt: latestJob.completed_at,
      duration: duration,
      errorMessage: latestJob.error_message
    };
    
    res.status(200).json(response);
    
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch job status',
      message: error.message
    });
  } finally {
    await db.disconnect();
  }
}

module.exports = handler;