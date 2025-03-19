const cron = require('node-cron');
const { exec } = require('child_process');

// Run every Wednesday at 3 AM
cron.schedule('0 3 * * 3', () => {
  console.log('Running database update...');
  exec('node update-db.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return;
    }
    console.log(`stdout: ${stdout}`);
  });
});

console.log('Cron service started');