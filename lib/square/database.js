const Database = require('../database');
const { v4: uuidv4 } = require('uuid');
const encryptionService = require('../encryption/crypto');

class SquareDatabase extends Database {
  
  // Restaurant Configuration Methods
  async getRestaurantConfig() {
    await this.ensureConnection();
    const result = await this.client.query('SELECT * FROM restaurant_config LIMIT 1');
    
    if (result.rows.length > 0) {
      const config = result.rows[0];
      // Decrypt tokens if they exist
      if (config.square_access_token) {
        config.square_access_token = encryptionService.decrypt(config.square_access_token);
      }
      if (config.square_refresh_token) {
        config.square_refresh_token = encryptionService.decrypt(config.square_refresh_token);
      }
      return config;
    }
    return null;
  }

  async saveRestaurantConfig(config) {
    await this.ensureConnection();
    
    const {
      restaurant_name,
      square_merchant_id,
      square_access_token,
      square_refresh_token,
      square_token_expires_at,
      target_food_cost_percentage = 30.00
    } = config;

    // Encrypt tokens
    const encryptedAccessToken = square_access_token ? encryptionService.encrypt(square_access_token) : null;
    const encryptedRefreshToken = square_refresh_token ? encryptionService.encrypt(square_refresh_token) : null;

    const result = await this.client.query(`
      INSERT INTO restaurant_config (
        restaurant_name, square_merchant_id, square_access_token, 
        square_refresh_token, square_token_expires_at, target_food_cost_percentage
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (square_merchant_id) 
      DO UPDATE SET 
        restaurant_name = EXCLUDED.restaurant_name,
        square_access_token = EXCLUDED.square_access_token,
        square_refresh_token = EXCLUDED.square_refresh_token,
        square_token_expires_at = EXCLUDED.square_token_expires_at,
        target_food_cost_percentage = EXCLUDED.target_food_cost_percentage,
        updated_at = NOW()
      RETURNING id
    `, [
      restaurant_name,
      square_merchant_id,
      encryptedAccessToken,
      encryptedRefreshToken,
      square_token_expires_at,
      target_food_cost_percentage
    ]);

    return result.rows[0].id;
  }

  // Square Menu Items Methods
  async upsertSquareMenuItem(itemData) {
    await this.ensureConnection();
    
    const {
      square_item_id,
      square_variation_id,
      name,
      description,
      category,
      price,
      currency = 'USD',
      is_active = true
    } = itemData;

    const result = await this.client.query(`
      INSERT INTO square_menu_items (
        square_item_id, square_variation_id, name, description, 
        category, price, currency, is_active, last_synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (square_item_id) 
      DO UPDATE SET 
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        category = EXCLUDED.category,
        price = EXCLUDED.price,
        currency = EXCLUDED.currency,
        is_active = EXCLUDED.is_active,
        last_synced_at = NOW(),
        updated_at = NOW()
      RETURNING id, (xmax = 0) AS is_new
    `, [square_item_id, square_variation_id, name, description, category, price, currency, is_active]);

    return {
      id: result.rows[0].id,
      isNew: result.rows[0].is_new
    };
  }

  async getMenuItems(options = {}) {
    await this.ensureConnection();
    
    const {
      category,
      active_only = true,
      with_costs = true,
      search,
      limit = 50,
      offset = 0,
      sort_by = 'name',
      sort_order = 'asc'
    } = options;

    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;

    if (active_only) {
      whereConditions.push('smi.is_active = true');
    }

    if (category) {
      whereConditions.push(`smi.category = $${paramIndex}`);
      queryParams.push(category);
      paramIndex++;
    }

    if (search) {
      whereConditions.push(`(smi.name ILIKE $${paramIndex} OR smi.description ILIKE $${paramIndex})`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
    
    const validSortColumns = ['name', 'category', 'price', 'created_at'];
    const orderByColumn = validSortColumns.includes(sort_by) ? sort_by : 'name';
    const orderDirection = sort_order.toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    let costJoin = '';
    let costSelect = '';
    if (with_costs) {
      costJoin = `
        LEFT JOIN LATERAL (
          SELECT calculated_cost, margin_percentage, food_cost_percentage, 
                 confidence_score, calculated_at
          FROM menu_item_costs mic 
          WHERE mic.menu_item_id = smi.id 
          ORDER BY mic.calculated_at DESC 
          LIMIT 1
        ) latest_cost ON true
      `;
      costSelect = `, latest_cost.calculated_cost, latest_cost.margin_percentage, 
                      latest_cost.food_cost_percentage, latest_cost.confidence_score, 
                      latest_cost.calculated_at as cost_calculated_at`;
    }

    const query = `
      SELECT smi.*, 
             COALESCE(ingredient_count, 0) as ingredient_count
             ${costSelect}
      FROM square_menu_items smi
      ${costJoin}
      LEFT JOIN (
        SELECT menu_item_id, COUNT(*) as ingredient_count
        FROM menu_item_ingredients
        GROUP BY menu_item_id
      ) ing_count ON ing_count.menu_item_id = smi.id
      ${whereClause}
      ORDER BY smi.${orderByColumn} ${orderDirection}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    queryParams.push(limit, offset);
    const result = await this.client.query(query, queryParams);

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM square_menu_items smi
      ${whereClause}
    `;
    
    const countResult = await this.client.query(countQuery, queryParams.slice(0, -2));
    const total = parseInt(countResult.rows[0].total);

    return {
      items: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  }

  async getMenuItemById(id) {
    await this.ensureConnection();
    
    const query = `
      SELECT smi.*,
             latest_cost.calculated_cost,
             latest_cost.cost_breakdown,
             latest_cost.margin_percentage,
             latest_cost.food_cost_percentage,
             latest_cost.confidence_score,
             latest_cost.llm_explanation,
             latest_cost.calculated_at as cost_calculated_at
      FROM square_menu_items smi
      LEFT JOIN LATERAL (
        SELECT calculated_cost, cost_breakdown, margin_percentage, 
               food_cost_percentage, confidence_score, llm_explanation, calculated_at
        FROM menu_item_costs mic 
        WHERE mic.menu_item_id = smi.id 
        ORDER BY mic.calculated_at DESC 
        LIMIT 1
      ) latest_cost ON true
      WHERE smi.id = $1
    `;

    const result = await this.client.query(query, [id]);
    return result.rows[0] || null;
  }

  async getMenuItemIngredients(menuItemId) {
    await this.ensureConnection();
    
    const query = `
      SELECT mii.id, mii.created_at as assigned_at,
             p.id as costco_product_id, p.name, p.category,
             ph.price as current_price, ph.price_per_unit
      FROM menu_item_ingredients mii
      JOIN products p ON p.id = mii.costco_product_id
      LEFT JOIN LATERAL (
        SELECT price, price_per_unit
        FROM price_history ph 
        WHERE ph.product_id = p.id 
        ORDER BY ph.scraped_at DESC 
        LIMIT 1
      ) ph ON true
      WHERE mii.menu_item_id = $1
      ORDER BY mii.created_at ASC
    `;

    const result = await this.client.query(query, [menuItemId]);
    return result.rows;
  }

  // Ingredient Assignment Methods
  async assignIngredient(menuItemId, costcoProductId, userId = null) {
    await this.ensureConnection();
    
    try {
      const result = await this.client.query(`
        INSERT INTO menu_item_ingredients (menu_item_id, costco_product_id, assigned_by_user_id)
        VALUES ($1, $2, $3)
        RETURNING id
      `, [menuItemId, costcoProductId, userId]);
      
      return result.rows[0].id;
    } catch (error) {
      if (error.code === '23505') { // Unique constraint violation
        throw new Error('Ingredient already assigned to this menu item');
      }
      throw error;
    }
  }

  async removeIngredient(ingredientAssignmentId) {
    await this.ensureConnection();
    
    const result = await this.client.query(
      'DELETE FROM menu_item_ingredients WHERE id = $1 RETURNING menu_item_id',
      [ingredientAssignmentId]
    );
    
    return result.rows.length > 0;
  }

  async replaceIngredients(menuItemId, costcoProductIds, userId = null) {
    await this.ensureConnection();
    
    await this.client.query('BEGIN');
    
    try {
      // Remove existing ingredients
      await this.client.query(
        'DELETE FROM menu_item_ingredients WHERE menu_item_id = $1',
        [menuItemId]
      );
      
      // Add new ingredients
      let addedCount = 0;
      for (const productId of costcoProductIds) {
        await this.client.query(`
          INSERT INTO menu_item_ingredients (menu_item_id, costco_product_id, assigned_by_user_id)
          VALUES ($1, $2, $3)
        `, [menuItemId, productId, userId]);
        addedCount++;
      }
      
      await this.client.query('COMMIT');
      return addedCount;
    } catch (error) {
      await this.client.query('ROLLBACK');
      throw error;
    }
  }

  // Cost Calculation Methods
  async saveCostCalculation(costData) {
    await this.ensureConnection();
    
    const {
      menu_item_id,
      calculated_cost,
      cost_breakdown,
      margin_percentage,
      food_cost_percentage,
      confidence_score,
      calculation_method = 'llm',
      llm_explanation
    } = costData;

    const result = await this.client.query(`
      INSERT INTO menu_item_costs (
        menu_item_id, calculated_cost, cost_breakdown, margin_percentage,
        food_cost_percentage, confidence_score, calculation_method, llm_explanation
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      menu_item_id, calculated_cost, cost_breakdown, margin_percentage,
      food_cost_percentage, confidence_score, calculation_method, llm_explanation
    ]);

    return result.rows[0].id;
  }

  // Sync Logging Methods
  async createSyncLog(syncType = 'manual') {
    await this.ensureConnection();
    
    const result = await this.client.query(
      'INSERT INTO square_sync_logs (sync_type, sync_status) VALUES ($1, $2) RETURNING id',
      [syncType, 'started']
    );
    
    return result.rows[0].id;
  }

  async updateSyncLog(syncId, updates) {
    await this.ensureConnection();
    
    const fields = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
    
    // Calculate duration if completing
    let durationUpdate = '';
    if (updates.sync_status === 'completed' || updates.sync_status === 'failed') {
      durationUpdate = ', completed_at = NOW(), duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))';
    }
    
    await this.client.query(
      `UPDATE square_sync_logs SET ${setClause}${durationUpdate} WHERE id = $1`,
      [syncId, ...values]
    );
  }

  async getSyncLog(syncId) {
    await this.ensureConnection();
    
    const result = await this.client.query(
      'SELECT * FROM square_sync_logs WHERE id = $1',
      [syncId]
    );
    
    return result.rows[0] || null;
  }

  async getSyncHistory(limit = 10, offset = 0) {
    await this.ensureConnection();
    
    const query = `
      SELECT * FROM square_sync_logs 
      ORDER BY started_at DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await this.client.query(query, [limit, offset]);
    
    // Get total count
    const countResult = await this.client.query('SELECT COUNT(*) as total FROM square_sync_logs');
    const total = parseInt(countResult.rows[0].total);
    
    return {
      syncs: result.rows,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };
  }

  // Mark all menu items as inactive (for sync cleanup)
  async markAllMenuItemsInactive() {
    await this.ensureConnection();
    
    const result = await this.client.query(
      'UPDATE square_menu_items SET is_active = false, updated_at = NOW() WHERE is_active = true RETURNING id'
    );
    
    return result.rows.length;
  }
}

module.exports = SquareDatabase;