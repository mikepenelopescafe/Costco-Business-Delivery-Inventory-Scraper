require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const cors = require('../../../lib/cors');

// Validate API key middleware
function validateApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'] || 
                     req.headers['authorization']?.replace('Bearer ', '');
  
  if (providedKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = async (req, res) => {
  // Handle CORS
  if (cors(req, res)) return;
  // For development/testing - in production this would validate API key
  // validateApiKey(req, res, () => {});
  
  try {
    const squareAppId = process.env.SQUARE_APP_ID;
    const squareEnvironment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    
    if (!squareAppId) {
      return res.status(503).json({
        error: {
          code: 'SQUARE_NOT_CONFIGURED',
          message: 'Square integration is not configured',
          details: 'Square App ID is missing. Please add SQUARE_APP_ID, SQUARE_APP_SECRET, and SQUARE_ENVIRONMENT to your environment variables.',
          setup_url: 'https://developer.squareup.com/apps'
        }
      });
    }

    // Generate a state parameter for security
    const state = uuidv4();
    
    // Store state in session or cache (for production, use Redis or similar)
    // For now, we'll include it in the response for the frontend to handle
    
    const baseUrl = squareEnvironment === 'production' 
      ? 'https://connect.squareup.com'
      : 'https://connect.squareupsandbox.com';
    
    // Build redirect URI - in Vercel, we need to use headers directly
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
    const redirectUri = `${protocol}://${host}/api/square/oauth/callback`;
    
    const authUrl = `${baseUrl}/oauth2/authorize` +
      `?client_id=${squareAppId}` +
      `&scope=ITEMS_READ+MERCHANT_PROFILE_READ` +
      `&session=false` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    // Return the auth URL for the frontend to handle
    // The frontend should use window.location.href = authUrl
    res.status(200).json({
      authUrl: authUrl,
      state: state
    });
    
  } catch (error) {
    console.error('Square OAuth authorize error:', error);
    res.status(500).json({
      error: {
        code: 'OAUTH_AUTHORIZE_FAILED',
        message: 'Failed to initiate Square OAuth flow',
        details: error.message
      }
    });
  }
};