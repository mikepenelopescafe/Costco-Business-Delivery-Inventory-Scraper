require('dotenv').config();
const { Client, Environment } = require('squareup');
const SquareDatabase = require('../../../lib/square/database');

module.exports = async (req, res) => {
  const { code, state, error } = req.query;
  
  // Handle OAuth errors
  if (error) {
    return res.status(400).json({
      error: {
        code: 'OAUTH_ERROR',
        message: 'Square OAuth authorization failed',
        details: {
          error,
          error_description: req.query.error_description
        }
      }
    });
  }

  if (!code) {
    return res.status(400).json({
      error: {
        code: 'MISSING_AUTH_CODE',
        message: 'Authorization code not provided'
      }
    });
  }

  try {
    const squareAppId = process.env.SQUARE_APP_ID;
    const squareAppSecret = process.env.SQUARE_APP_SECRET;
    const squareEnvironment = process.env.SQUARE_ENVIRONMENT || 'sandbox';
    
    if (!squareAppId || !squareAppSecret) {
      return res.status(500).json({
        error: {
          code: 'MISSING_CONFIGURATION',
          message: 'Square application credentials not configured'
        }
      });
    }

    // Initialize Square client for token exchange
    const client = new Client({
      environment: squareEnvironment === 'production' 
        ? Environment.Production 
        : Environment.Sandbox
    });

    // Exchange authorization code for access token
    const redirectUri = `${req.protocol}://${req.get('host')}/api/square/oauth/callback`;
    
    const tokenResponse = await client.oAuthApi.obtainToken({
      clientId: squareAppId,
      clientSecret: squareAppSecret,
      code: code,
      redirectUri: redirectUri,
      grantType: 'authorization_code'
    });

    if (tokenResponse.result.accessToken) {
      const { 
        accessToken, 
        refreshToken, 
        expiresAt, 
        merchantId 
      } = tokenResponse.result;

      // Get merchant profile information
      const merchantClient = new Client({
        accessToken: accessToken,
        environment: squareEnvironment === 'production' 
          ? Environment.Production 
          : Environment.Sandbox
      });

      const merchantResponse = await merchantClient.merchantsApi.retrieveMerchant(merchantId);
      const merchantName = merchantResponse.result.merchant?.businessName || 'Unknown Restaurant';

      // Save configuration to database
      const db = new SquareDatabase();
      await db.saveRestaurantConfig({
        restaurant_name: merchantName,
        square_merchant_id: merchantId,
        square_access_token: accessToken,
        square_refresh_token: refreshToken,
        square_token_expires_at: expiresAt ? new Date(expiresAt) : null
      });

      await db.disconnect();

      res.json({
        success: true,
        merchant_name: merchantName,
        message: 'Square integration configured successfully'
      });

    } else {
      throw new Error('No access token received from Square');
    }

  } catch (error) {
    console.error('Square OAuth callback error:', error);
    
    let errorCode = 'OAUTH_CALLBACK_FAILED';
    let errorMessage = 'Failed to complete Square OAuth flow';
    
    if (error.statusCode === 400) {
      errorCode = 'INVALID_AUTH_CODE';
      errorMessage = 'Invalid or expired authorization code';
    } else if (error.statusCode === 401) {
      errorCode = 'INVALID_CREDENTIALS';
      errorMessage = 'Invalid Square application credentials';
    }

    res.status(500).json({
      error: {
        code: errorCode,
        message: errorMessage,
        details: error.message
      }
    });
  }
};