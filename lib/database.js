const { Client } = require('pg');

class Database {
  constructor() {
    this.client = new Client({
      connectionString: process.env.DATABASE_URL,
    });
    this.connected = false;
  }

  async connect() {
    if (!this.connected) {
      await this.client.connect();
      this.connected = true;
      
      // Set up connection error handling
      this.client.on('error', (err) => {
        console.error('Database connection error:', err);
        this.connected = false;
      });
      
      this.client.on('end', () => {
        console.log('Database connection ended');
        this.connected = false;
      });
    }
  }

  async ensureConnection() {
    if (!this.connected) {
      console.log('Reconnecting to database...');
      this.client = new Client({
        connectionString: process.env.DATABASE_URL,
      });
      await this.connect();
    }
  }

  async disconnect() {
    if (this.connected) {
      await this.client.end();
      this.connected = false;
    }
  }

  async createJob(status = 'started') {
    await this.ensureConnection();
    const result = await this.client.query(
      'INSERT INTO scraping_jobs (status, started_at) VALUES ($1, NOW()) RETURNING id',
      [status]
    );
    return result.rows[0].id;
  }

  async updateJob(jobId, updates) {
    await this.ensureConnection();
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    await this.client.query(
      `UPDATE scraping_jobs SET ${setClause}, completed_at = NOW() WHERE id = $1`,
      [jobId, ...values]
    );
  }

  async upsertProduct(productData) {
    await this.ensureConnection();
    
    const { costco_product_id, name, url, category } = productData;
    
    const result = await this.client.query(`
      INSERT INTO products (costco_product_id, name, url, category, first_seen_date, last_seen_date)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (costco_product_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        url = EXCLUDED.url,
        category = EXCLUDED.category,
        is_active = true,
        last_seen_date = NOW(),
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS is_new
    `, [costco_product_id, name, url, category]);
    
    return {
      id: result.rows[0].id,
      isNew: result.rows[0].is_new
    };
  }

  async addPriceHistory(productId, price, pricePerUnit = null) {
    await this.ensureConnection();
    
    // Check if this price already exists for this product
    const existingPrice = await this.client.query(
      'SELECT price FROM price_history WHERE product_id = $1 ORDER BY scraped_at DESC LIMIT 1',
      [productId]
    );
    
    // Only add if price is different
    if (existingPrice.rows.length === 0 || 
        parseFloat(existingPrice.rows[0].price) !== parseFloat(price)) {
      await this.client.query(
        'INSERT INTO price_history (product_id, price, price_per_unit, scraped_at) VALUES ($1, $2, $3, NOW())',
        [productId, price, pricePerUnit]
      );
      return true;
    }
    return false;
  }

  async getActiveProducts() {
    await this.ensureConnection();
    const result = await this.client.query('SELECT * FROM products WHERE is_active = true ORDER BY category, name');
    return result.rows;
  }

  async getProductsByCategory(category) {
    await this.ensureConnection();
    const result = await this.client.query(
      'SELECT * FROM products WHERE is_active = true AND category = $1 ORDER BY name',
      [category]
    );
    return result.rows;
  }

  async getCategories() {
    await this.ensureConnection();
    const result = await this.client.query(
      'SELECT DISTINCT category FROM products WHERE is_active = true AND category IS NOT NULL ORDER BY category'
    );
    return result.rows.map(row => row.category);
  }

  async getLatestJob() {
    await this.ensureConnection();
    const result = await this.client.query(
      'SELECT * FROM scraping_jobs ORDER BY started_at DESC LIMIT 1'
    );
    return result.rows[0] || null;
  }

  // Enhanced products retrieval with pagination and filtering
  async getProductsPaginated(options = {}) {
    await this.ensureConnection();
    
    const {
      page = 1,
      limit = 50,
      category,
      search,
      minPrice,
      maxPrice,
      sortBy = 'name',
      sortOrder = 'asc'
    } = options;
    
    const offset = (page - 1) * limit;
    const validSortColumns = ['name', 'category', 'created_at', 'updated_at'];
    const validSortOrders = ['asc', 'desc'];
    
    const orderByColumn = validSortColumns.includes(sortBy) ? sortBy : 'name';
    const orderDirection = validSortOrders.includes(sortOrder.toLowerCase()) ? sortOrder.toUpperCase() : 'ASC';
    
    let whereConditions = ['p.is_active = true'];
    let queryParams = [];
    let paramIndex = 1;
    
    // Add category filter
    if (category) {
      whereConditions.push(`p.category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }
    
    // Add search filter
    if (search) {
      whereConditions.push(`p.name ILIKE $${paramIndex}`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }
    
    // Add price filters (need to join with latest price)
    let priceJoin = '';
    if (minPrice !== undefined || maxPrice !== undefined) {
      priceJoin = `
        LEFT JOIN LATERAL (
          SELECT price 
          FROM price_history ph 
          WHERE ph.product_id = p.id 
          ORDER BY ph.scraped_at DESC 
          LIMIT 1
        ) latest_price ON true
      `;
      
      if (minPrice !== undefined) {
        whereConditions.push(`latest_price.price >= $${paramIndex}`);
        queryParams.push(minPrice);
        paramIndex++;
      }
      
      if (maxPrice !== undefined) {
        whereConditions.push(`latest_price.price <= $${paramIndex}`);
        queryParams.push(maxPrice);
        paramIndex++;
      }
    }
    
    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      ${priceJoin}
      ${whereClause}
    `;
    
    const countResult = await this.client.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);
    
    // Get paginated results with latest prices
    const dataQuery = `
      SELECT 
        p.*,
        ph.price as current_price,
        ph.scraped_at as price_updated_at
      FROM products p
      ${priceJoin}
      LEFT JOIN LATERAL (
        SELECT price, scraped_at 
        FROM price_history ph2 
        WHERE ph2.product_id = p.id 
        ORDER BY ph2.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      ${whereClause}
      ORDER BY p.${orderByColumn} ${orderDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const dataResult = await this.client.query(dataQuery, queryParams);
    
    return {
      products: dataResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    };
  }

  // Get single product with details
  async getProductById(id) {
    await this.ensureConnection();
    
    const productQuery = `
      SELECT 
        p.*,
        ph.price as current_price,
        ph.scraped_at as price_updated_at
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price, scraped_at 
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE p.id = $1
    `;
    
    const result = await this.client.query(productQuery, [id]);
    return result.rows[0] || null;
  }

  // Get product by Costco product ID
  async getProductByCostcoId(costcoProductId) {
    await this.ensureConnection();
    
    const productQuery = `
      SELECT 
        p.*,
        ph.price as current_price,
        ph.scraped_at as price_updated_at
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price, scraped_at 
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE p.costco_product_id = $1
    `;
    
    const result = await this.client.query(productQuery, [costcoProductId]);
    return result.rows[0] || null;
  }

  // Get price history for a product
  async getProductPriceHistory(productId, options = {}) {
    await this.ensureConnection();
    
    const { limit = 100, startDate, endDate } = options;
    
    let whereConditions = ['product_id = $1'];
    let queryParams = [productId];
    let paramIndex = 2;
    
    if (startDate) {
      whereConditions.push(`scraped_at >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereConditions.push(`scraped_at <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    const query = `
      SELECT price, price_per_unit, scraped_at, created_at
      FROM price_history 
      WHERE ${whereClause}
      ORDER BY scraped_at DESC
      LIMIT $${paramIndex}
    `;
    
    queryParams.push(limit);
    const result = await this.client.query(query, queryParams);
    return result.rows;
  }

  // Search products
  async searchProducts(searchTerm, options = {}) {
    await this.ensureConnection();
    
    const { category, limit = 50, offset = 0, context } = options;
    
    let whereConditions = [
      'is_active = true',
      'name ILIKE $1'
    ];
    let queryParams = [`%${searchTerm}%`];
    let paramIndex = 2;
    
    // Apply context-specific filtering for ingredient assignment
    if (context === 'ingredient_assignment') {
      // Prioritize grocery/food categories for ingredient assignment
      whereConditions.push(`(
        category ILIKE '%Food%' OR 
        category ILIKE '%Meat%' OR 
        category ILIKE '%Produce%' OR 
        category ILIKE '%Dairy%' OR 
        category ILIKE '%Pantry%' OR
        category ILIKE '%Baking%' OR
        category ILIKE '%Cereal%' OR
        category ILIKE '%Frozen%' OR
        category ILIKE '%Deli%' OR
        category ILIKE '%Fresh%'
      )`);
    }
    
    if (category) {
      whereConditions.push(`category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }
    
    const whereClause = whereConditions.join(' AND ');
    
    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM products 
      WHERE ${whereClause}
    `;
    
    const countResult = await this.client.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);
    
    // Get search results with latest prices
    const searchQuery = `
      SELECT 
        p.*,
        ph.price as current_price,
        ph.scraped_at as price_updated_at,
        ts_rank(to_tsvector('english', p.name), plainto_tsquery('english', $1)) as relevance
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price, scraped_at 
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE ${whereClause}
      ORDER BY ${context === 'ingredient_assignment' ? 'relevance DESC, p.category ASC, p.name ASC' : 'relevance DESC, p.name ASC'}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const searchResult = await this.client.query(searchQuery, queryParams);
    
    return {
      products: searchResult.rows,
      total,
      searchTerm
    };
  }

  // Get database statistics
  async getStatistics() {
    await this.ensureConnection();
    
    // Product counts by category
    const categoryStatsQuery = `
      SELECT 
        category,
        COUNT(*) as product_count,
        AVG(CAST(ph.price AS DECIMAL)) as avg_price,
        MIN(CAST(ph.price AS DECIMAL)) as min_price,
        MAX(CAST(ph.price AS DECIMAL)) as max_price
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price 
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE p.is_active = true AND p.category IS NOT NULL
      GROUP BY category
      ORDER BY category
    `;
    
    const categoryStats = await this.client.query(categoryStatsQuery);
    
    // Overall statistics
    const overallStatsQuery = `
      SELECT 
        COUNT(*) as total_products,
        COUNT(DISTINCT category) as total_categories,
        AVG(CAST(ph.price AS DECIMAL)) as avg_price,
        MIN(CAST(ph.price AS DECIMAL)) as min_price,
        MAX(CAST(ph.price AS DECIMAL)) as max_price
      FROM products p
      LEFT JOIN LATERAL (
        SELECT price 
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE p.is_active = true
    `;
    
    const overallStats = await this.client.query(overallStatsQuery);
    
    // Latest job info
    const latestJob = await this.getLatestJob();
    
    // Data freshness
    const freshnessQuery = `
      SELECT 
        MAX(last_seen_date) as last_updated,
        COUNT(*) as products_updated_today
      FROM products 
      WHERE is_active = true AND last_seen_date >= CURRENT_DATE
    `;
    
    const freshnessResult = await this.client.query(freshnessQuery);
    
    return {
      overall: overallStats.rows[0],
      byCategory: categoryStats.rows,
      latestJob,
      dataFreshness: freshnessResult.rows[0]
    };
  }
}

module.exports = Database;