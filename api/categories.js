const Database = require('../lib/database');

module.exports = async (req, res) => {
  try {
    const db = new Database();
    
    if (req.method === 'GET') {
      const categories = await db.getCategories();
      
      res.status(200).json({
        success: true,
        categories: categories,
        count: categories.length
      });
    } else {
      res.status(405).json({
        success: false,
        error: 'Method not allowed'
      });
    }
  } catch (error) {
    console.error('Categories API error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};