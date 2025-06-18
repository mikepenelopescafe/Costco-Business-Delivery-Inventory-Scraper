require('dotenv').config();

// Import the in-memory bulk jobs storage
// In a real production app, this would be stored in Redis
const bulkJobs = new Map();

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    try {
      const jobId = req.query.jobId;
      
      if (!jobId) {
        return res.status(400).json({
          error: {
            code: 'MISSING_JOB_ID',
            message: 'Job ID is required'
          }
        });
      }
      
      const job = bulkJobs.get(jobId);
      
      if (!job) {
        return res.status(404).json({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Bulk calculation job not found'
          }
        });
      }
      
      res.json(job);
      
    } catch (error) {
      console.error('Job status check error:', error);
      res.status(500).json({
        error: {
          code: 'JOB_STATUS_FAILED',
          message: 'Failed to check job status',
          details: error.message
        }
      });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};