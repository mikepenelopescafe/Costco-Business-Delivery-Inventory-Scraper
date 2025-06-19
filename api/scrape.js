require('dotenv').config();
const CostcoScraper = require('../lib/scraper');

// For manual execution
async function runScraper() {
  console.log('Starting manual scraper execution...');
  
  const scraper = new CostcoScraper();
  
  try {
    const result = await scraper.scrape();
    console.log('Scraping completed:', result);
    return result;
  } catch (error) {
    console.error('Scraping failed:', error);
    throw error;
  }
}

// API endpoint function for Vercel
async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  // Simple API key authentication
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Check if running on Vercel
  const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
  
  if (isVercel) {
    // Return message about using GitHub Actions instead of attempting to scrape
    return res.status(200).json({
      message: 'Scraping is not available on Vercel deployment',
      recommendation: 'This endpoint uses GitHub Actions for scheduled scraping',
      details: {
        github_actions_schedule: 'Every 6 hours',
        manual_trigger: 'Available via GitHub Actions workflow dispatch',
        reason: 'Scraping takes 10-15 minutes which exceeds Vercel function timeouts'
      },
      next_steps: [
        'Check GitHub Actions for scraping status',
        'Use /api/jobs/latest to see most recent scrape results',
        'Use /api/products to query scraped data'
      ]
    });
  }
  
  // Only run scraper if not on Vercel (local development)
  try {
    const result = await runScraper();
    
    res.status(200).json({
      message: 'Scraping completed successfully',
      execution_environment: 'local',
      ...result
    });
  } catch (error) {
    res.status(500).json({
      error: 'Scraping failed',
      message: error.message,
      execution_environment: 'local',
      recommendation: 'Check logs for detailed error information'
    });
  }
}

// For direct execution
if (require.main === module) {
  runScraper()
    .then(() => {
      console.log('Manual execution completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Manual execution failed:', error);
      process.exit(1);
    });
}

module.exports = handler;