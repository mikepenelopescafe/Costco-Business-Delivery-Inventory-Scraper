require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const SquareDatabase = require('../../lib/square/database');
const ClaudeService = require('../../lib/llm/claude');

// Validate API key middleware
function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || 
                     req.headers['authorization']?.replace('Bearer ', '');
  
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// In-memory storage for bulk calculation jobs (in production, use Redis)
const bulkJobs = new Map();

async function performBulkCalculation(jobId, menuItemIds, onlyMissing) {
  const db = new SquareDatabase();
  const claudeService = new ClaudeService();
  
  try {
    console.log(`Starting bulk cost calculation ${jobId}`);
    
    // Update job status
    bulkJobs.set(jobId, {
      ...bulkJobs.get(jobId),
      status: 'processing'
    });
    
    let menuItems = [];
    
    if (menuItemIds && menuItemIds.length > 0) {
      // Calculate costs for specific menu items
      for (const id of menuItemIds) {
        const menuItem = await db.getMenuItemById(id);
        if (menuItem) {
          menuItems.push(menuItem);
        }
      }
    } else {
      // Calculate costs for all menu items
      const result = await db.getMenuItems({ 
        active_only: true, 
        with_costs: true,
        limit: 1000 // Large limit to get all items
      });
      menuItems = result.items;
    }
    
    // Filter out items that already have recent calculations if onlyMissing is true
    if (onlyMissing) {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      menuItems = menuItems.filter(item => {
        if (!item.cost_calculated_at) return true;
        const calculatedAt = new Date(item.cost_calculated_at);
        return calculatedAt <= twentyFourHoursAgo;
      });
    }
    
    console.log(`Processing ${menuItems.length} menu items for cost calculation`);
    
    // Prepare data for batch calculation
    const menuItemsWithIngredients = [];
    for (const menuItem of menuItems) {
      const ingredients = await db.getMenuItemIngredients(menuItem.id);
      if (ingredients.length > 0) {
        menuItemsWithIngredients.push({ menuItem, ingredients });
      }
    }
    
    // Update job with actual items to process
    bulkJobs.set(jobId, {
      ...bulkJobs.get(jobId),
      total_items: menuItemsWithIngredients.length
    });
    
    // Perform batch calculation
    const batchResult = await claudeService.calculateBatchCosts(
      menuItemsWithIngredients,
      (processed, total) => {
        // Update progress
        const progress = Math.round((processed / total) * 100);
        bulkJobs.set(jobId, {
          ...bulkJobs.get(jobId),
          items_processed: processed,
          progress_percentage: progress
        });
      }
    );
    
    // Save all successful calculations to database
    for (const result of batchResult.results) {
      const costData = {
        menu_item_id: result.menu_item_id,
        calculated_cost: result.calculated_cost,
        cost_breakdown: result.cost_breakdown,
        margin_percentage: result.margin_percentage,
        food_cost_percentage: result.food_cost_percentage,
        confidence_score: result.confidence_score,
        calculation_method: 'llm',
        llm_explanation: result.llm_explanation
      };
      
      await db.saveCostCalculation(costData);
    }
    
    // Calculate average confidence
    const averageConfidence = batchResult.results.length > 0
      ? batchResult.results.reduce((sum, r) => sum + r.confidence_score, 0) / batchResult.results.length
      : 0;
    
    // Complete job
    bulkJobs.set(jobId, {
      job_id: jobId,
      status: 'completed',
      total_items: batchResult.total_processed,
      items_processed: batchResult.total_processed,
      items_succeeded: batchResult.successful,
      items_failed: batchResult.failed,
      average_confidence: parseFloat(averageConfidence.toFixed(2)),
      completed_at: new Date().toISOString(),
      errors: batchResult.errors,
      progress_percentage: 100
    });
    
    console.log(`Bulk cost calculation ${jobId} completed successfully`);
    
  } catch (error) {
    console.error(`Bulk cost calculation ${jobId} failed:`, error);
    
    bulkJobs.set(jobId, {
      ...bulkJobs.get(jobId),
      status: 'failed',
      error: error.message,
      completed_at: new Date().toISOString()
    });
    
  } finally {
    await db.disconnect();
  }
}

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    validateApiKey(req, res, async () => {
      try {
        const {
          menu_item_ids = null,
          only_missing = true
        } = req.body;
        
        // Validate menu_item_ids if provided
        if (menu_item_ids && !Array.isArray(menu_item_ids)) {
          return res.status(400).json({
            error: {
              code: 'INVALID_PARAMETERS',
              message: 'menu_item_ids must be an array if provided'
            }
          });
        }
        
        const jobId = uuidv4();
        
        // Initialize job tracking
        bulkJobs.set(jobId, {
          job_id: jobId,
          status: 'processing',
          total_items: 0,
          items_processed: 0,
          items_succeeded: 0,
          items_failed: 0,
          progress_percentage: 0,
          started_at: new Date().toISOString(),
          errors: []
        });
        
        // Start calculation in background
        performBulkCalculation(jobId, menu_item_ids, only_missing)
          .catch(error => {
            console.error('Background bulk calculation error:', error);
          });
        
        res.json({
          job_id: jobId,
          status: 'processing',
          total_items: 0, // Will be updated once we know the actual count
          message: 'Bulk calculation started'
        });
        
      } catch (error) {
        console.error('Bulk calculation initiation error:', error);
        res.status(500).json({
          error: {
            code: 'BULK_CALCULATION_FAILED',
            message: 'Failed to initiate bulk calculation',
            details: error.message
          }
        });
      }
    });
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
};