const express = require('express');
const axios = require('axios');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});

app.use('/api', limiter);

// IP lookup endpoint
app.get('/api/lookup/:ip?', async (req, res) => {
  try {
    // Get IP address from params or use the requester's IP
    const ipToLookup = req.params.ip || req.ip.replace('::ffff:', '');
    
    // Validate IP format
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ipToLookup)) {
      return res.status(400).json({ 
        error: 'Invalid IP address format',
        message: 'Please provide a valid IPv4 address'
      });
    }

    // Use ip-api.com for IP lookup (free tier)
    const response = await axios.get(`http://ip-api.com/json/${ipToLookup}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`);
    
    if (response.data.status === 'fail') {
      return res.status(404).json({
        error: 'IP lookup failed',
        message: response.data.message
      });
    }

    // Transform the response to a more readable format
    const result = {
      ip: response.data.query,
      location: {
        country: response.data.country,
        countryCode: response.data.countryCode,
        region: response.data.regionName,
        regionCode: response.data.region,
        city: response.data.city,
        zipCode: response.data.zip,
        coordinates: {
          latitude: response.data.lat,
          longitude: response.data.lon
        },
        timezone: response.data.timezone
      },
      network: {
        isp: response.data.isp,
        organization: response.data.org,
        as: response.data.as
      }
    };

    res.json(result);
  } catch (error) {
    console.error('Error looking up IP:', error.message);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to perform IP lookup'
    });
  }
});

// Documentation endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'IP Lookup API',
    version: '1.0.0',
    description: 'API service for retrieving information about IP addresses',
    endpoints: {
      '/api/lookup/:ip': 'GET - Look up information for a specific IP address',
      '/': 'GET - API documentation'
    },
    example: '/api/lookup/8.8.8.8'
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`IP Lookup API server running on port ${PORT}`);
});