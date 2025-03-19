const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { createGunzip } = require('zlib');
const { Extract } = require('unzipper');
const tar = require('tar');
require('dotenv').config();

// MaxMind download URLs - these require your license key
const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
if (!LICENSE_KEY) {
  console.error('Error: MAXMIND_LICENSE_KEY not found in .env file');
  process.exit(1);
}

const DOWNLOAD_URLS = {
  country: `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country&license_key=${LICENSE_KEY}&suffix=tar.gz`,
  city: `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=${LICENSE_KEY}&suffix=tar.gz`,
  asn: `https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=${LICENSE_KEY}&suffix=tar.gz`,
};

const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

async function downloadAndExtractDatabase(type, url) {
  const tempFile = path.join(DATA_DIR, `${type}.tar.gz`);
  
  try {
    console.log(`Downloading ${type} database...`);
    
    // Download file
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer', // Use arraybuffer instead of stream
    });
    
    // Save to temp file
    fs.writeFileSync(tempFile, response.data);
    
    console.log(`Extracting ${type} database...`);
    
    // Create temp directory for extraction
    const tempDir = path.join(DATA_DIR, `temp_${type}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Extract the tar.gz file using tar
    await new Promise((resolve, reject) => {
      tar.extract({
        file: tempFile,
        cwd: tempDir
      }).then(resolve).catch(reject);
    });
    
    // Find the .mmdb file (could be nested in subdirectories)
    const findMmdbFile = (dir) => {
      const items = fs.readdirSync(dir);
      
      for (const item of items) {
        const itemPath = path.join(dir, item);
        const stats = fs.statSync(itemPath);
        
        if (stats.isDirectory()) {
          const nestedResult = findMmdbFile(itemPath);
          if (nestedResult) return nestedResult;
        } else if (item.endsWith('.mmdb')) {
          return itemPath;
        }
      }
      return null;
    };
    
    const mmdbFilePath = findMmdbFile(tempDir);
    
    if (!mmdbFilePath) {
      throw new Error(`Could not find .mmdb file for ${type}`);
    }
    
    // Copy to final destination
    const destPath = path.join(DATA_DIR, `GeoLite2-${type.charAt(0).toUpperCase() + type.slice(1)}.mmdb`);
    fs.copyFileSync(mmdbFilePath, destPath);
    
    // Clean up
    fs.unlinkSync(tempFile);
    fs.rmSync(tempDir, { recursive: true, force: true });
    
    console.log(`${type} database updated successfully`);
  } catch (error) {
    console.error(`Error updating ${type} database:`, error.message);
    // Clean up if necessary
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

async function updateAllDatabases() {
  console.log('Starting database updates...');
  
  try {
    // Update databases one by one to avoid potential issues
    await downloadAndExtractDatabase('country', DOWNLOAD_URLS.country);
    await downloadAndExtractDatabase('city', DOWNLOAD_URLS.city);
    await downloadAndExtractDatabase('asn', DOWNLOAD_URLS.asn);
    
    console.log('All databases updated successfully!');
  } catch (error) {
    console.error('Error updating databases:', error.message);
    process.exit(1);
  }
}

// Run the update
updateAllDatabases();