const CostcoScraper = require('../lib/scraper');

module.exports = async (req, res) => {
  // Authenticate request
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Missing or invalid authorization header'
    });
  }

  const token = authHeader.slice(7);
  if (token !== process.env.API_KEY) {
    return res.status(403).json({
      success: false,
      error: 'Invalid API key'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed'
    });
  }

  try {
    const { category } = req.body;
    
    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category name is required'
      });
    }

    // Set a shorter timeout for single category
    const timeout = setTimeout(() => {
      throw new Error('Single category scraping timeout (50 seconds)');
    }, 50000); // 50 second timeout for safety

    const scraper = new CostcoScraper();
    
    try {
      await scraper.init();
      await scraper.setLocation();
      
      // Find the specific category
      const categories = await scraper.getGroceryCategories();
      const targetCategory = categories.find(cat => 
        cat.name.toLowerCase() === category.toLowerCase()
      );
      
      if (!targetCategory) {
        clearTimeout(timeout);
        await scraper.cleanup();
        return res.status(404).json({
          success: false,
          error: `Category "${category}" not found`,
          available_categories: categories.map(c => c.name)
        });
      }
      
      // Scrape just this category
      const result = await scraper.scrapeCategory(targetCategory.url, targetCategory.name);
      
      clearTimeout(timeout);
      await scraper.cleanup();
      
      res.status(200).json({
        success: true,
        message: `Successfully scraped category: ${category}`,
        category: targetCategory.name,
        products_processed: result.totalProducts,
        execution_time: new Date().toISOString()
      });
      
    } catch (error) {
      clearTimeout(timeout);
      await scraper.cleanup();
      throw error;
    }
    
  } catch (error) {
    console.error('Category scraping error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      category: req.body?.category
    });
  }
};