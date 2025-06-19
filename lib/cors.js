// CORS middleware for API endpoints
function cors(req, res) {
  // Allow requests from your frontend domains
  const allowedOrigins = [
    'http://localhost:4321',
    'http://localhost:3000',
    'http://localhost:3001',
    'https://localhost:4321',
    // Add your production frontend URL here when deployed
    // 'https://your-frontend-domain.com'
  ];
  
  const origin = req.headers.origin;
  
  // Check if the origin is in the allowed list
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    // In development, allow any localhost origin
    if (origin && origin.includes('localhost')) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
  }
  
  // Set other CORS headers
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true;
  }
  
  return false;
}

module.exports = cors;