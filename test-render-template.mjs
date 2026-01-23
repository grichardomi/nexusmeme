// Test rendering email template
import { TicketCreatedEmailTemplate } from './src/email/templates/support-tickets.js';

// Set environment variable
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

// Import shared to get logo URL
import { logoUrl } from './src/email/templates/shared.js';

console.log('Logo URL:', logoUrl);
console.log('');

// Render template
const template = TicketCreatedEmailTemplate({
  name: 'John Doe',
  ticketId: 'TICKET-123',
  subject: 'Help with my bot',
  ticketUrl: 'http://localhost:3000/support/TICKET-123'
});

console.log('Template subject:', template.subject);
console.log('');
console.log('HTML contains logo:', template.html.includes('logo.png') ? '✓ YES' : '✗ NO');
console.log('HTML contains logo URL:', template.html.includes(logoUrl) ? '✓ YES' : '✗ NO');
console.log('');

// Check if logo img tag is present
const logoMatch = template.html.match(/<img[^>]*src="[^"]*logo[^"]*"[^>]*>/);
if (logoMatch) {
  console.log('Logo img tag found:');
  console.log(logoMatch[0]);
} else {
  console.log('✗ No logo img tag found');
}
