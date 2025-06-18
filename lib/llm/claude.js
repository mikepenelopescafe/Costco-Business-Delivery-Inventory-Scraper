const Anthropic = require('@anthropic-ai/sdk');

class ClaudeService {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    
    this.model = 'claude-3-haiku-20240307';
    this.maxTokens = 1000;
    this.temperature = 0.3;
  }

  async calculateMenuItemCost(menuItem, ingredients) {
    if (!ingredients || ingredients.length === 0) {
      throw new Error('No ingredients provided for cost calculation');
    }

    const prompt = this.buildCostAnalysisPrompt(menuItem, ingredients);
    
    try {
      const startTime = Date.now();
      
      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });
      
      const calculationTime = Date.now() - startTime;
      const responseText = message.content[0].text;
      
      // Parse the JSON response
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        // If JSON parsing fails, try to extract JSON from the response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedResponse = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Invalid JSON response from LLM');
        }
      }

      // Validate the response structure
      this.validateCostResponse(parsedResponse);
      
      // Calculate additional metrics
      const menuPrice = parseFloat(menuItem.price) || 0;
      const calculatedCost = parseFloat(parsedResponse.total_cost);
      
      const foodCostPercentage = menuPrice > 0 ? (calculatedCost / menuPrice) * 100 : 0;
      const marginPercentage = menuPrice > 0 ? ((menuPrice - calculatedCost) / menuPrice) * 100 : 0;

      return {
        calculated_cost: calculatedCost,
        cost_breakdown: this.formatCostBreakdown(parsedResponse.ingredient_breakdown),
        margin_percentage: parseFloat(marginPercentage.toFixed(2)),
        food_cost_percentage: parseFloat(foodCostPercentage.toFixed(2)),
        confidence_score: parseFloat(parsedResponse.confidence_score),
        llm_explanation: parsedResponse.explanation,
        calculation_time_ms: calculationTime,
        suggested_price: this.calculateSuggestedPrice(calculatedCost, 30) // 30% target food cost
      };
      
    } catch (error) {
      console.error('LLM cost calculation failed:', error);
      throw new Error(`Cost calculation failed: ${error.message}`);
    }
  }

  buildCostAnalysisPrompt(menuItem, ingredients) {
    const ingredientsList = ingredients.map(ingredient => 
      `- ${ingredient.name}: $${ingredient.current_price} ${ingredient.price_per_unit || 'per lb'}`
    ).join('\n');

    return `You are an expert restaurant cost analyst. Calculate the food cost for the following menu item.

Menu Item: ${menuItem.name}
Description: ${menuItem.description || 'No description provided'}
Category: ${menuItem.category || 'Unknown'}
Current Menu Price: $${menuItem.price || 'Unknown'}

Assigned Ingredients with Current Costco Prices:
${ingredientsList}

Calculate the total food cost considering:
- Industry-standard portion sizes for this type of dish
- Cooking yields (shrinkage, trimming waste)
- Prep waste (typically 5-10%)
- Any additional minor ingredients not listed (oils, seasonings, etc. - estimate 5-15% of total)

Provide your response in the following JSON format:
{
  "ingredient_breakdown": [
    {
      "name": "ingredient name",
      "portion_size": "amount with unit (e.g., '6 oz', '1 cup')",
      "raw_amount_needed": "amount with unit accounting for waste",
      "cost": 0.00
    }
  ],
  "total_cost": 0.00,
  "confidence_score": 0.85,
  "explanation": "Brief explanation of your calculations and assumptions"
}

Important guidelines:
- Portion sizes should be realistic for restaurant servings
- Account for cooking shrinkage (meat loses 20-25%, vegetables 10-15%)
- Include estimated costs for unlisted ingredients (seasonings, oils, etc.)
- Confidence score should be between 0.60 and 0.95
- Keep explanation concise but informative
- Ensure all costs are realistic and add up to the total_cost`;
  }

  validateCostResponse(response) {
    const required = ['ingredient_breakdown', 'total_cost', 'confidence_score', 'explanation'];
    
    for (const field of required) {
      if (!(field in response)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    if (!Array.isArray(response.ingredient_breakdown)) {
      throw new Error('ingredient_breakdown must be an array');
    }

    if (typeof response.total_cost !== 'number' || response.total_cost <= 0) {
      throw new Error('total_cost must be a positive number');
    }

    if (typeof response.confidence_score !== 'number' || 
        response.confidence_score < 0 || response.confidence_score > 1) {
      throw new Error('confidence_score must be between 0 and 1');
    }

    // Validate ingredient breakdown structure
    response.ingredient_breakdown.forEach((ingredient, index) => {
      const requiredFields = ['name', 'portion_size', 'raw_amount_needed', 'cost'];
      for (const field of requiredFields) {
        if (!(field in ingredient)) {
          throw new Error(`Missing field '${field}' in ingredient ${index}`);
        }
      }
      
      if (typeof ingredient.cost !== 'number' || ingredient.cost < 0) {
        throw new Error(`Invalid cost for ingredient ${ingredient.name}`);
      }
    });
  }

  formatCostBreakdown(ingredientBreakdown) {
    const breakdown = {};
    
    ingredientBreakdown.forEach(ingredient => {
      breakdown[ingredient.name] = parseFloat(ingredient.cost.toFixed(2));
    });
    
    return breakdown;
  }

  calculateSuggestedPrice(cost, targetFoodCostPercentage) {
    if (cost <= 0 || targetFoodCostPercentage <= 0 || targetFoodCostPercentage >= 100) {
      return null;
    }
    
    const suggestedPrice = cost / (targetFoodCostPercentage / 100);
    return parseFloat(suggestedPrice.toFixed(2));
  }

  // Batch cost calculation for multiple menu items
  async calculateBatchCosts(menuItemsWithIngredients, onProgress = null) {
    const results = [];
    const errors = [];
    
    for (let i = 0; i < menuItemsWithIngredients.length; i++) {
      const { menuItem, ingredients } = menuItemsWithIngredients[i];
      
      try {
        if (ingredients.length === 0) {
          errors.push({
            menu_item_id: menuItem.id,
            error: 'No ingredients assigned'
          });
          continue;
        }
        
        const result = await this.calculateMenuItemCost(menuItem, ingredients);
        results.push({
          menu_item_id: menuItem.id,
          ...result
        });
        
        if (onProgress) {
          onProgress(i + 1, menuItemsWithIngredients.length);
        }
        
        // Add a small delay to respect API rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errors.push({
          menu_item_id: menuItem.id,
          error: error.message
        });
      }
    }
    
    return {
      results,
      errors,
      total_processed: menuItemsWithIngredients.length,
      successful: results.length,
      failed: errors.length
    };
  }
}

module.exports = ClaudeService;