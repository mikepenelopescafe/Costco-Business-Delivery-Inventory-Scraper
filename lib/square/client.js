const { Client, Environment } = require('square');
const SquareDatabase = require('./database');

class SquareClient {
  constructor() {
    this.client = null;
    this.config = null;
    this.db = new SquareDatabase();
  }

  async initialize() {
    try {
      // Get restaurant configuration with decrypted tokens
      this.config = await this.db.getRestaurantConfig();
      
      if (!this.config || !this.config.square_access_token) {
        throw new Error('Square integration not configured. Please complete OAuth flow first.');
      }

      // Check if token is expired
      if (this.config.square_token_expires_at && 
          new Date(this.config.square_token_expires_at) <= new Date()) {
        await this.refreshAccessToken();
      }

      // Initialize Square client
      const environment = process.env.SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox;

      this.client = new Client({
        accessToken: this.config.square_access_token,
        environment: environment
      });

      return true;
    } catch (error) {
      console.error('Failed to initialize Square client:', error);
      throw error;
    }
  }

  async refreshAccessToken() {
    if (!this.config.square_refresh_token) {
      throw new Error('No refresh token available. Re-authorization required.');
    }

    try {
      const environment = process.env.SQUARE_ENVIRONMENT === 'production' 
        ? Environment.Production 
        : Environment.Sandbox;

      const tempClient = new Client({ environment });
      
      const response = await tempClient.oAuthApi.obtainToken({
        clientId: process.env.SQUARE_APP_ID,
        clientSecret: process.env.SQUARE_APP_SECRET,
        grantType: 'refresh_token',
        refreshToken: this.config.square_refresh_token
      });

      const { accessToken, refreshToken, expiresAt } = response.result;

      // Update configuration
      await this.db.saveRestaurantConfig({
        ...this.config,
        square_access_token: accessToken,
        square_refresh_token: refreshToken,
        square_token_expires_at: expiresAt ? new Date(expiresAt) : null
      });

      this.config.square_access_token = accessToken;
      this.config.square_refresh_token = refreshToken;
      this.config.square_token_expires_at = expiresAt ? new Date(expiresAt) : null;

      console.log('Square access token refreshed successfully');
    } catch (error) {
      console.error('Failed to refresh Square token:', error);
      throw new Error('Token refresh failed. Re-authorization may be required.');
    }
  }

  async ensureInitialized() {
    if (!this.client) {
      await this.initialize();
    }
  }

  async fetchAllCatalogItems(includeInactive = false) {
    await this.ensureInitialized();
    
    let cursor = null;
    let allItems = [];
    const itemTypes = ['ITEM'];
    
    try {
      do {
        const response = await this.client.catalogApi.listCatalog({
          cursor: cursor,
          types: itemTypes.join(','),
          includeDeletedObjects: includeInactive
        });
        
        if (response.result.objects) {
          // Filter for items only (not variations or other objects)
          const items = response.result.objects.filter(obj => obj.type === 'ITEM');
          allItems = allItems.concat(items);
        }
        
        cursor = response.result.cursor;
        
        // Add a small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } while (cursor);
      
      return allItems;
    } catch (error) {
      console.error('Failed to fetch catalog items:', error);
      throw new Error(`Square API error: ${error.message}`);
    }
  }

  async fetchCatalogItem(itemId) {
    await this.ensureInitialized();
    
    try {
      const response = await this.client.catalogApi.retrieveCatalogObject({
        objectId: itemId,
        includeRelatedObjects: true
      });
      
      return response.result.object;
    } catch (error) {
      console.error(`Failed to fetch catalog item ${itemId}:`, error);
      throw new Error(`Square API error: ${error.message}`);
    }
  }

  transformSquareItem(squareItem) {
    try {
      const itemData = squareItem.itemData;
      
      // Get the primary variation (Square items can have multiple variations)
      let price = null;
      let variationId = null;
      
      if (itemData.variations && itemData.variations.length > 0) {
        const primaryVariation = itemData.variations[0];
        variationId = primaryVariation.id;
        
        if (primaryVariation.itemVariationData && 
            primaryVariation.itemVariationData.priceMoney) {
          // Convert from cents to dollars
          price = primaryVariation.itemVariationData.priceMoney.amount / 100;
        }
      }

      return {
        square_item_id: squareItem.id,
        square_variation_id: variationId,
        name: itemData.name || 'Unnamed Item',
        description: itemData.description || null,
        category: this.extractCategory(itemData.categories),
        price: price,
        currency: 'USD', // Square uses USD for US merchants
        is_active: !squareItem.isDeleted
      };
    } catch (error) {
      console.error('Failed to transform Square item:', error);
      return null;
    }
  }

  extractCategory(categories) {
    if (!categories || categories.length === 0) {
      return null;
    }
    
    // For now, just take the first category name
    // In a more complex setup, you might want to fetch category details
    return categories[0].name || 'Uncategorized';
  }

  async getMerchantInfo() {
    await this.ensureInitialized();
    
    try {
      const response = await this.client.merchantsApi.listMerchants();
      
      if (response.result.merchant && response.result.merchant.length > 0) {
        return response.result.merchant[0];
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get merchant info:', error);
      throw new Error(`Square API error: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      await this.ensureInitialized();
      await this.getMerchantInfo();
      return true;
    } catch (error) {
      return false;
    }
  }

  async disconnect() {
    await this.db.disconnect();
    this.client = null;
    this.config = null;
  }
}

module.exports = SquareClient;