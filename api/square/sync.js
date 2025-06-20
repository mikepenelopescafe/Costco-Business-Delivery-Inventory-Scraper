require('dotenv').config();
const SquareClient = require('../../lib/square/client');
const SquareDatabase = require('../../lib/square/database');
const cors = require('../../lib/cors');

// Validate API key middleware
function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || 
                     req.headers['authorization']?.replace('Bearer ', '');
  
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// In-memory storage for sync jobs (in production, use Redis)
const syncJobs = new Map();

async function performSync(syncId, syncType, categoriesFilter) {
  const db = new SquareDatabase();
  const squareClient = new SquareClient();
  
  try {
    console.log(`Starting Square sync ${syncId} (${syncType})`);
    
    // Update sync log
    await db.updateSyncLog(syncId, {
      sync_status: 'in_progress'
    });

    // Initialize Square client
    await squareClient.initialize();
    
    // Fetch all catalog items from Square
    console.log(`Fetching catalog items from Square...`);
    const squareItems = await squareClient.fetchAllCatalogItems();
    console.log(`✓ Fetched ${squareItems.length} items from Square`);
    
    let itemsCreated = 0;
    let itemsUpdated = 0;
    let itemsDeactivated = 0;
    let itemsProcessed = 0;
    
    // Mark all existing items as inactive first (for cleanup)
    if (syncType === 'full') {
      console.log(`Marking existing items as inactive...`);
      itemsDeactivated = await db.markAllMenuItemsInactive();
      console.log(`✓ Marked ${itemsDeactivated} items as inactive`);
    }
    
    // Process each Square item
    for (const squareItem of squareItems) {
      try {
        const transformedItem = squareClient.transformSquareItem(squareItem);
        
        if (!transformedItem) {
          console.warn(`Skipping invalid item: ${squareItem.id}`);
          continue;
        }
        
        // Apply category filter if specified
        if (categoriesFilter && categoriesFilter.length > 0) {
          if (!categoriesFilter.includes(transformedItem.category)) {
            continue;
          }
        }
        
        // Upsert the menu item
        const result = await db.upsertSquareMenuItem(transformedItem);
        
        if (result.isNew) {
          itemsCreated++;
        } else {
          itemsUpdated++;
        }
        
        itemsProcessed++;
        
        // Update progress in sync job
        const progress = Math.round((itemsProcessed / squareItems.length) * 100);
        syncJobs.set(syncId, {
          ...syncJobs.get(syncId),
          progress_percentage: progress,
          items_processed: itemsProcessed
        });
        
        // Log progress every 10%
        if (progress % 10 === 0 && itemsProcessed > 0) {
          console.log(`Progress: ${progress}% (${itemsProcessed}/${squareItems.length} items) - Created: ${itemsCreated}, Updated: ${itemsUpdated}`);
        }
        
      } catch (itemError) {
        console.error(`Error processing item ${squareItem.id}:`, itemError);
      }
    }
    
    // Complete sync log
    await db.updateSyncLog(syncId, {
      sync_status: 'completed',
      items_found: squareItems.length,
      items_created: itemsCreated,
      items_updated: itemsUpdated,
      items_deactivated: itemsDeactivated
    });
    
    // Update in-memory job status
    syncJobs.set(syncId, {
      sync_id: syncId,
      status: 'completed',
      progress_percentage: 100,
      items_processed: itemsProcessed,
      items_created: itemsCreated,
      items_updated: itemsUpdated,
      items_deactivated: itemsDeactivated,
      started_at: syncJobs.get(syncId).started_at,
      completed_at: new Date().toISOString(),
      errors: []
    });
    
    console.log(`✓ Square sync ${syncId} completed successfully - Created: ${itemsCreated}, Updated: ${itemsUpdated}, Deactivated: ${itemsDeactivated}`);
    
  } catch (error) {
    console.error(`Square sync ${syncId} failed:`, error);
    
    // Update sync log with error
    await db.updateSyncLog(syncId, {
      sync_status: 'failed',
      error_message: error.message,
      error_details: { stack: error.stack }
    });
    
    // Update in-memory job status
    syncJobs.set(syncId, {
      ...syncJobs.get(syncId),
      status: 'failed',
      error: error.message
    });
    
  } finally {
    await squareClient.disconnect();
    await db.disconnect();
  }
}

module.exports = async (req, res) => {
  // Handle CORS
  if (cors(req, res)) return;
  
  if (req.method === 'POST') {
    validateApiKey(req, res, async () => {
      try {
        const {
          sync_type = 'full',
          categories_only = null
        } = req.body;
        
        // Validate sync_type
        if (!['full', 'incremental'].includes(sync_type)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'sync_type must be either "full" or "incremental"'
            }
          });
        }
        
        const db = new SquareDatabase();
        
        // Create sync log
        const syncId = await db.createSyncLog(sync_type);
        
        // Initialize in-memory job tracking
        syncJobs.set(syncId, {
          sync_id: syncId,
          status: 'started',
          progress_percentage: 0,
          items_processed: 0,
          started_at: new Date().toISOString(),
          errors: []
        });
        
        await db.disconnect();
        
        // Start sync in background
        performSync(syncId, sync_type, categories_only)
          .catch(error => {
            console.error('Background sync error:', error);
          });
        
        res.json({
          sync_id: syncId,
          status: 'started',
          message: 'Sync initiated successfully'
        });
        
      } catch (error) {
        console.error('Square sync initiation error:', error);
        res.status(500).json({
          error: {
            code: 'SQUARE_SYNC_FAILED',
            message: 'Failed to initiate Square sync',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};