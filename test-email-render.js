// Test email template rendering
process.env.NEXT_PUBLIC_APP_URL = 'https://nexusmeme.com';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://nexusmeme.com';
const normalizedAppUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
const logoUrl = `${normalizedAppUrl}/logo.png`;

console.log('Logo URL:', logoUrl);
console.log('App URL:', appUrl);
console.log('Normalized URL:', normalizedAppUrl);

// Check if logo path is valid
const fs = require('fs');
const logoPath = '/home/omi/nexusmeme/public/logo.png';
if (fs.existsSync(logoPath)) {
  console.log('✓ Logo file exists at:', logoPath);
} else {
  console.log('✗ Logo file NOT found at:', logoPath);
}

// Check public directory
const publicPath = '/home/omi/nexusmeme/public';
if (fs.existsSync(publicPath)) {
  console.log('\nFiles in /public:');
  fs.readdirSync(publicPath).forEach(file => {
    console.log('  -', file);
  });
}
