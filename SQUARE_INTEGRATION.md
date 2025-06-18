# Square POS Integration & Menu Cost Analysis

## Implementation Complete

### What's Been Built

✅ **Phase 1: Database & Core Infrastructure**
- Database migration script for Square tables (`scripts/setup-square-tables.js`)
- Enhanced encryption utilities for secure token storage
- Extended database classes with Square-specific operations
- Added dependencies: Square SDK, Anthropic SDK

✅ **Phase 2: Square Integration** 
- OAuth flow endpoints (`/api/square/oauth/*`)
- Square API client wrapper with token management
- Catalog sync functionality with progress tracking
- Menu item CRUD endpoints

✅ **Phase 3: LLM Cost Analysis**
- Anthropic Claude integration for cost calculations
- Individual and bulk cost calculation endpoints
- Enhanced search with ingredient assignment context
- Ingredient assignment and management endpoints

### Key Features Implemented

#### Square OAuth & Sync
- `/api/square/oauth/authorize` - Initiate OAuth flow
- `/api/square/oauth/callback` - Handle OAuth callback
- `/api/square/sync` - Manual catalog sync
- `/api/square/sync/{syncId}/status` - Sync progress tracking
- `/api/square/sync/history` - Sync history

#### Menu Management
- `/api/menu-items` - List menu items with filtering
- `/api/menu-items/{id}` - Get individual menu item details
- `/api/menu-items/{id}/ingredients` - Assign ingredients
- `/api/menu-items/{id}/ingredients/{ingredientId}` - Remove ingredients

#### Cost Analysis
- `/api/menu-items/{id}/calculate-cost` - Individual cost calculation
- `/api/cost-analysis/bulk-calculate` - Bulk cost calculations
- `/api/cost-analysis/job/{jobId}/status` - Job progress tracking

#### Enhanced Search
- `/api/search?context=ingredient_assignment` - Optimized for ingredient selection
- Prioritizes food categories and relevant products

### Setup Instructions

#### 1. Install Dependencies
```bash
npm install
```

#### 2. Environment Variables
Add to your `.env` file:
```bash
# Existing variables
DATABASE_URL=your_postgresql_connection_string
API_KEY=your_api_secret_key

# New Square integration variables
SQUARE_APP_ID=your_square_app_id
SQUARE_APP_SECRET=your_square_app_secret
SQUARE_ENVIRONMENT=sandbox  # or 'production'
ENCRYPTION_KEY=your_32_character_encryption_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

#### 3. Database Setup
```bash
# Set up original Costco tables
npm run db:setup

# Set up new Square tables
npm run db:square-setup
```

#### 4. Usage Flow

1. **Complete Square OAuth**:
   - Visit `/api/square/oauth/authorize` to start OAuth flow
   - Complete authorization on Square's site
   - System will store encrypted tokens automatically

2. **Sync Square Catalog**:
   ```bash
   curl -X POST http://localhost:3000/api/square/sync \
     -H "x-api-key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"sync_type": "full"}'
   ```

3. **Assign Ingredients to Menu Items**:
   ```bash
   curl -X POST http://localhost:3000/api/menu-items/123/ingredients \
     -H "x-api-key: YOUR_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"ingredients": [{"costco_product_id": "456"}]}'
   ```

4. **Calculate Costs**:
   ```bash
   curl -X POST http://localhost:3000/api/menu-items/123/calculate-cost \
     -H "x-api-key: YOUR_API_KEY" \
     -H "Content-Type: application/json"
   ```

### Security Features

- **API Key Authentication**: All endpoints protected with existing API key system
- **Token Encryption**: Square tokens encrypted at rest using AES-256
- **Automatic Token Refresh**: Handles Square token expiration automatically
- **Input Validation**: Comprehensive parameter validation and sanitization

### Performance Optimizations

- **Batch Operations**: Bulk cost calculations with progress tracking
- **Caching**: 24-hour cache for cost calculations to reduce LLM API calls
- **Database Indexing**: Optimized indexes for fast queries
- **Connection Pooling**: Efficient database connection management

### Error Handling

- **Structured Error Responses**: Consistent error format across all endpoints
- **Retry Logic**: Built-in retry for transient failures
- **Comprehensive Logging**: Detailed logging for monitoring and debugging
- **Graceful Degradation**: System continues to function even if LLM is unavailable

### Development vs Production

#### Development Mode
- Use Square Sandbox environment
- Mock data available for testing
- Detailed error messages

#### Production Considerations
- Use Redis for job storage instead of in-memory maps
- Enable comprehensive monitoring
- Set up proper backup procedures for encrypted tokens
- Configure rate limiting

### Next Steps (Future Enhancements)

1. **Analytics Dashboard**: Implement `/api/analytics/dashboard` endpoint
2. **Webhook Support**: Real-time Square catalog updates
3. **Historical Tracking**: Cost trends and price history analysis
4. **Recipe Builder**: Complex menu items with sub-recipes
5. **Multi-location Support**: Support for restaurant chains

### Architecture

```
Frontend → API Layer → Business Logic → Database
                   ↓
              Square API ← OAuth Flow
                   ↓
            Anthropic Claude ← Cost Analysis
```

The implementation follows a clean separation of concerns with:
- **API Layer**: Handles HTTP requests, validation, authentication
- **Business Logic**: Square integration, cost calculations, data processing  
- **Data Layer**: Database operations, caching, persistence
- **External Services**: Square API, Anthropic Claude integration