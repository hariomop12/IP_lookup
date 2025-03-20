const express = require("express");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const maxmind = require("maxmind");
const axios = require("axios");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");

require("dotenv").config();

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
  message: "Too many requests from this IP, please try again after 15 minutes",
});

app.use("/api", limiter);

// Global variables to store our database
let ipCountryDB = null;
let ipCityDB = null;
let ipAsnDB = null;

// Function to initialize the MaxMind databases
// Function to initialize the MaxMind databases
async function initDatabases() {
  try {
    // Check if the databases exist
    const dbPath = path.join(__dirname, "data");
    const countryDbPath = path.join(__dirname, "data", "GeoLite2-Country.mmdb");
    const cityDbPath = path.join(__dirname, "data", "GeoLite2-City.mmdb");
    const asnDbPath = path.join(__dirname, "data", "GeoLite2-ASN.mmdb");

    if (fs.existsSync(countryDbPath)) {
      ipCountryDB = await maxmind.open(countryDbPath);
      console.log("Country database loaded successfully.");
    } else {
      console.warn("Country database not found. Download it from MaxMind.");
    }

    if (fs.existsSync(cityDbPath)) {
      ipCityDB = await maxmind.open(cityDbPath);
      console.log("City database loaded successfully.");
    } else {
      console.warn("City database not found. Download it from MaxMind.");
    }

    if (fs.existsSync(asnDbPath)) {
      ipAsnDB = await maxmind.open(asnDbPath);
      console.log("ASN database loaded successfully.");
    } else {
      console.warn("ASN database not found. Download it from MaxMind.");
    }
  } catch (error) {
    console.error("Error initializing databases:", error);
  }
}

// Initialize the databases on server start
initDatabases();

// Simple IP validation
function isValidIPv4(ip) {
  const regex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return regex.test(ip);
}

// IP lookup endpoint
// IP lookup endpoint
app.get("/api/lookup/:ip?", async (req, res) => {
  try {
    // Get IP address from params or use the requester's IP
    const ipToLookup = req.params.ip || req.ip.replace("::ffff:", "");

    // Validate IP format
    if (!isValidIPv4(ipToLookup)) {
      return res.status(400).json({
        error: "Invalid IP address format",
        message: "Please provide a valid IPv4 address.",
      });
    }

    // Check if databases are loaded
    if (!ipCityDB && !ipCountryDB && !ipAsnDB) {
      return res.status(503).json({
        error: "Service unavailable",
        message:
          "IP databases are not loaded. Please check server configuration.",
      });
    }

    // Default result structure
    const result = {
      statusCode: 200,
      status: "success",
      ip: ipToLookup,
      location: {
        country: "Unknown",
        countryCode: "XX",
        region: "Unknown",
        city: "Unknown",
        zipCode: "Unknown",
        coordinates: {
          latitude: null,
          longitude: null,
        },
        timezone: "Unknown",
      },
      network: {
        isp: "Unknown",
        organization: "Unknown",
        asn: null,
        asName: "Unknown",
      },
    };

    // Look up location data
    if (ipCityDB) {
      const cityData = ipCityDB.get(ipToLookup);
      if (cityData) {
        if (cityData.country) {
          result.location.country = cityData.country.names.en;
          result.location.countryCode = cityData.country.iso_code;
        }

        if (cityData.subdivisions && cityData.subdivisions.length > 0) {
          result.location.region = cityData.subdivisions[0].names.en;
        }

        if (cityData.city) {
          result.location.city = cityData.city.names.en;
        }

        if (cityData.postal) {
          result.location.zipCode = cityData.postal.code;
        }

        if (cityData.location) {
          result.location.coordinates.latitude = cityData.location.latitude;
          result.location.coordinates.longitude = cityData.location.longitude;
          result.location.timezone = cityData.location.time_zone;
        }
      }
    } else if (ipCountryDB) {
      // Fall back to country data if city data is not available
      const countryData = ipCountryDB.get(ipToLookup);
      if (countryData && countryData.country) {
        result.location.country = countryData.country.names.en;
        result.location.countryCode = countryData.country.iso_code;
      }
    }

    // Look up ASN data
    if (ipAsnDB) {
      const asnData = ipAsnDB.get(ipToLookup);
      if (asnData) {
        result.network.asn = asnData.autonomous_system_number;
        result.network.organization = asnData.autonomous_system_organization;
        result.network.isp = asnData.autonomous_system_organization;
        result.network.asName = `AS${asnData.autonomous_system_number}`;
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Error looking up IP:", error.message);
    res.status(500).json({
      error: "Server error",
      message: "Failed to perform IP lookup",
    });
  }
});

// Documentation endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Self-hosted IP Lookup API",
    version: "1.0.0",
    description:
      "API service for retrieving information about IP addresses using local databases",
    endpoints: {
      "/api/lookup/:ip": "GET - Look up information for a specific IP address",
      "/": "GET - API documentation",
    },
    example: "/api/lookup/8.8.8.8",
    databaseStatus: {
      country: ipCountryDB ? "Loaded" : "Not loaded",
      city: ipCityDB ? "Loaded" : "Not loaded",
      asn: ipAsnDB ? "Loaded" : "Not loaded",
    },
  });
});

// Database management endpoint (admin only)
app.get("/admin/database/status", (req, res) => {
  // This should be protected with authentication in production
  res.json({
    status: {
      country: ipCountryDB ? "Loaded" : "Not loaded",
      city: ipCityDB ? "Loaded" : "Not loaded",
      asn: ipAsnDB ? "Loaded" : "Not loaded",
    },
  });
});

app.get("/ping", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())} seconds`,
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`IP Lookup API server running on port ${PORT}`);
});
