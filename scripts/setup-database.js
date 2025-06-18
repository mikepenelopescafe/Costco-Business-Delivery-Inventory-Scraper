require('dotenv').config();
const { Client } = require('pg');

const setupDatabase = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create products table
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        costco_product_id VARCHAR(255) UNIQUE NOT NULL,
        name VARCHAR(500) NOT NULL,
        url VARCHAR(1000) NOT NULL,
        category VARCHAR(255),
        is_active BOOLEAN DEFAULT true,
        first_seen_date TIMESTAMP NOT NULL DEFAULT NOW(),
        last_seen_date TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Products table created');

    // Create price_history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        price DECIMAL(10, 2) NOT NULL,
        price_per_unit VARCHAR(100),
        scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Price history table created');

    // Create scraping_jobs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS scraping_jobs (
        id SERIAL PRIMARY KEY,
        status VARCHAR(50) NOT NULL,
        products_scraped INTEGER DEFAULT 0,
        products_updated INTEGER DEFAULT 0,
        products_added INTEGER DEFAULT 0,
        products_deactivated INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Scraping jobs table created');

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_costco_id ON products(costco_product_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_product ON price_history(product_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(scraped_at);
    `);
    console.log('Indexes created');

    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Database setup failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

setupDatabase();