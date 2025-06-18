require('dotenv').config();
const SquareDatabase = require('../../../../lib/square/database');

// Import the in-memory sync jobs storage
// In a real production app, this would be stored in Redis
const syncJobs = new Map();

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const syncId = req.query.syncId;
      
      if (!syncId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_SYNC_ID',
            message: 'Sync ID is required'
          }
        });
      }
      
      // First check in-memory storage for real-time updates
      const memoryJob = syncJobs.get(syncId);
      
      if (memoryJob) {
        return res.json(memoryJob);
      }
      
      // If not in memory, check database
      const db = new SquareDatabase();
      const syncLog = await db.getSyncLog(syncId);
      await db.disconnect();
      
      if (!syncLog) {
        return res.status(404).json({
          error: {
            code: 'SYNC_NOT_FOUND',
            message: 'Sync job not found'
          }
        });
      }
      
      // Calculate progress percentage for completed jobs
      let progressPercentage = 0;
      if (syncLog.sync_status === 'completed') {
        progressPercentage = 100;
      } else if (syncLog.sync_status === 'failed') {
        progressPercentage = 0;
      }
      
      res.json({
        sync_id: syncLog.id,
        status: syncLog.sync_status,
        progress_percentage: progressPercentage,
        items_processed: syncLog.items_found || 0,
        items_created: syncLog.items_created || 0,
        items_updated: syncLog.items_updated || 0,
        items_deactivated: syncLog.items_deactivated || 0,
        started_at: syncLog.started_at,
        completed_at: syncLog.completed_at,
        errors: syncLog.error_message ? [syncLog.error_message] : []
      });
      
    } catch (error) {
      console.error('Sync status check error:', error);
      res.status(500).json({
        error: {
          code: 'SYNC_STATUS_FAILED',
          message: 'Failed to check sync status',
          details: error.message
        }
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};