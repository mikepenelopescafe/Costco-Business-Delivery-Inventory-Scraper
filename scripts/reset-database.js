require('dotenv').config();
const { Client } = require('pg');

const resetDatabase = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    console.log('🗑️  Dropping existing tables...');
    
    // Drop tables in reverse dependency order
    await client.query('DROP TABLE IF EXISTS price_history CASCADE;');
    console.log('Dropped price_history table');
    
    await client.query('DROP TABLE IF EXISTS scraping_jobs CASCADE;');
    console.log('Dropped scraping_jobs table');
    
    await client.query('DROP TABLE IF EXISTS products CASCADE;');
    console.log('Dropped products table');

    console.log('🏗️  Creating fresh tables...');

    // Create products table
    await client.query(`
      CREATE TABLE products (
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
    console.log('✅ Products table created');

    // Create price_history table
    await client.query(`
      CREATE TABLE price_history (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id),
        price DECIMAL(10, 2) NOT NULL,
        price_per_unit VARCHAR(100),
        scraped_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Price history table created');

    // Create scraping_jobs table
    await client.query(`
      CREATE TABLE scraping_jobs (
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
    console.log('✅ Scraping jobs table created');

    // Create indexes
    await client.query(`CREATE INDEX idx_products_costco_id ON products(costco_product_id);`);
    await client.query(`CREATE INDEX idx_products_active ON products(is_active);`);
    await client.query(`CREATE INDEX idx_products_category ON products(category);`);
    await client.query(`CREATE INDEX idx_price_history_product ON price_history(product_id);`);
    await client.query(`CREATE INDEX idx_price_history_date ON price_history(scraped_at);`);
    console.log('✅ Indexes created');

    console.log('🎉 Database reset completed successfully!');
    console.log('📊 Fresh database ready for scraping with ZIP code 80031');
  } catch (error) {
    console.error('❌ Database reset failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

resetDatabase();