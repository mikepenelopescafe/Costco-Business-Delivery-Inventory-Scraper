require('dotenv').config();
const { Client } = require('pg');

const setupSquareTables = async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Create restaurant_config table
    await client.query(`
      CREATE TABLE IF NOT EXISTS restaurant_config (
        id SERIAL PRIMARY KEY,
        restaurant_name VARCHAR(255) NOT NULL,
        square_merchant_id VARCHAR(255) UNIQUE,
        square_access_token TEXT,
        square_refresh_token TEXT,
        square_token_expires_at TIMESTAMP,
        target_food_cost_percentage DECIMAL(5,2) DEFAULT 30.00,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Restaurant config table created');

    // Create square_menu_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS square_menu_items (
        id SERIAL PRIMARY KEY,
        square_item_id VARCHAR(255) UNIQUE NOT NULL,
        square_variation_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(255),
        price DECIMAL(10,2),
        currency VARCHAR(3) DEFAULT 'USD',
        is_active BOOLEAN DEFAULT true,
        last_synced_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Square menu items table created');

    // Create menu_item_ingredients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_item_ingredients (
        id SERIAL PRIMARY KEY,
        menu_item_id INTEGER REFERENCES square_menu_items(id) ON DELETE CASCADE,
        costco_product_id INTEGER REFERENCES products(id),
        assigned_by_user_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(menu_item_id, costco_product_id)
      );
    `);
    console.log('Menu item ingredients table created');

    // Create menu_item_costs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_item_costs (
        id SERIAL PRIMARY KEY,
        menu_item_id INTEGER REFERENCES square_menu_items(id) ON DELETE CASCADE,
        calculated_cost DECIMAL(10,2) NOT NULL,
        cost_breakdown JSONB,
        margin_percentage DECIMAL(5,2),
        food_cost_percentage DECIMAL(5,2),
        confidence_score DECIMAL(3,2),
        calculation_method VARCHAR(50) DEFAULT 'llm',
        llm_explanation TEXT,
        calculated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Menu item costs table created');

    // Create square_sync_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS square_sync_logs (
        id SERIAL PRIMARY KEY,
        sync_type VARCHAR(50) DEFAULT 'manual',
        sync_status VARCHAR(50) NOT NULL,
        items_found INTEGER DEFAULT 0,
        items_created INTEGER DEFAULT 0,
        items_updated INTEGER DEFAULT 0,
        items_deactivated INTEGER DEFAULT 0,
        error_message TEXT,
        error_details JSONB,
        started_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        duration_seconds INTEGER
      );
    `);
    console.log('Square sync logs table created');

    // Create indexes for performance
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_square_items_active ON square_menu_items(is_active);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_square_items_category ON square_menu_items(category);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_ingredients_menu_item ON menu_item_ingredients(menu_item_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_costs_menu_item ON menu_item_costs(menu_item_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_costs_calculated ON menu_item_costs(calculated_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON square_sync_logs(started_at DESC);
    `);
    console.log('Square table indexes created');

    console.log('Square database tables setup completed successfully');
  } catch (error) {
    console.error('Square database setup failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
};

setupSquareTables();