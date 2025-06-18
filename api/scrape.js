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

  // Check if running on Vercel and warn about timeouts
  const isVercel = process.env.VERCEL || process.env.VERCEL_ENV;
  if (isVercel) {
    console.warn('⚠️ WARNING: Running scraper on Vercel may timeout due to execution limits');
    console.warn('💡 Consider using external scheduled jobs for reliable full scraping');
  }
  
  try {
    // Set a conservative timeout for Vercel environments
    const timeoutMs = isVercel ? 50000 : 600000; // 50s for Vercel, 10min for local
    
    const scrapePromise = runScraper();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Scraping timeout after ${timeoutMs/1000} seconds. Consider using external scheduled jobs for full scraping.`)), timeoutMs)
    );
    
    const result = await Promise.race([scrapePromise, timeoutPromise]);
    
    res.status(200).json({
      message: 'Scraping completed successfully',
      execution_environment: isVercel ? 'vercel' : 'local',
      timeout_applied: `${timeoutMs/1000}s`,
      ...result
    });
  } catch (error) {
    const isTimeout = error.message.includes('timeout');
    
    res.status(isTimeout ? 408 : 500).json({
      error: isTimeout ? 'Scraping timeout' : 'Scraping failed',
      message: error.message,
      execution_environment: isVercel ? 'vercel' : 'local',
      recommendation: isTimeout 
        ? 'Use external scheduled jobs (GitHub Actions, Railway, etc.) for reliable full scraping'
        : 'Check logs for detailed error information'
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