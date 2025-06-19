const Database = require('../lib/database');
const cors = require('../lib/cors');

module.exports = async (req, res) => {
  // Handle CORS
  if (cors(req, res)) return;
  try {
    const db = new Database();
    
    if (req.method === 'GET') {
      const statistics = await db.getStatistics();
      
      // Format numbers for better readability
      const formatPrice = (price) => {
        if (!price) return null;
        return parseFloat(parseFloat(price).toFixed(2));
      };
      
      const formatCount = (count) => {
        if (!count) return 0;
        return parseInt(count);
      };
      
      // Process overall statistics
      const overall = statistics.overall;
      const formattedOverall = {
        total_products: formatCount(overall.total_products),
        total_categories: formatCount(overall.total_categories),
        price_range: {
          average: formatPrice(overall.avg_price),
          lowest: formatPrice(overall.min_price),
          highest: formatPrice(overall.max_price)
        }
      };
      
      // Process category statistics
      const formattedCategories = statistics.byCategory.map(category => ({
        category: category.category,
        product_count: formatCount(category.product_count),
        price_statistics: {
          average: formatPrice(category.avg_price),
          lowest: formatPrice(category.min_price),
          highest: formatPrice(category.max_price)
        }
      })).sort((a, b) => b.product_count - a.product_count); // Sort by product count desc
      
      // Process latest job information
      const latestJob = statistics.latestJob;
      const jobInfo = latestJob ? {
        id: latestJob.id,
        status: latestJob.status,
        started_at: latestJob.started_at,
        completed_at: latestJob.completed_at,
        duration_minutes: latestJob.completed_at && latestJob.started_at 
          ? Math.round((new Date(latestJob.completed_at) - new Date(latestJob.started_at)) / 60000)
          : null,
        products_processed: {
          scraped: formatCount(latestJob.products_scraped),
          added: formatCount(latestJob.products_added),
          updated: formatCount(latestJob.products_updated),
          deactivated: formatCount(latestJob.products_deactivated)
        },
        error_message: latestJob.error_message
      } : null;
      
      // Process data freshness
      const freshness = statistics.dataFreshness;
      const dataFreshness = {
        last_updated: freshness.last_updated,
        products_updated_today: formatCount(freshness.products_updated_today),
        data_age_hours: freshness.last_updated 
          ? Math.round((new Date() - new Date(freshness.last_updated)) / (1000 * 60 * 60))
          : null
      };
      
      // Calculate some additional insights
      const insights = {
        most_expensive_category: formattedCategories.length > 0 
          ? formattedCategories.reduce((max, cat) => 
              cat.price_statistics.average > (max.price_statistics.average || 0) ? cat : max
            ).category
          : null,
        largest_category: formattedCategories.length > 0 
          ? formattedCategories[0].category
          : null,
        price_spread: formattedOverall.price_range.highest && formattedOverall.price_range.lowest
          ? formatPrice(formattedOverall.price_range.highest - formattedOverall.price_range.lowest)
          : null
      };
      
      res.status(200).json({
        success: true,
        generated_at: new Date().toISOString(),
        overview: formattedOverall,
        categories: formattedCategories,
        latest_scraping_job: jobInfo,
        data_freshness: dataFreshness,
        insights
      });
      
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Statistics API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};