/**
 * Test AI signal generation with current market conditions
 * Run: node scripts/test-ai-signal.js
 */

async function testSignal() {
  try {
    // Simulate current BTC conditions from logs
    const momentum1h = 0.15; // From logs
    const volumeRatio = 1.46; // From logs
    const rsi = 69.9; // From logs

    // Apply the NEW logic
    const hasVolumeBreakout = momentum1h > 0 && volumeRatio > 1.3;
    const hasStrongMomentum = momentum1h > 0.5;
    const signal = ((hasVolumeBreakout || hasStrongMomentum) && rsi <= 85) ? 'buy' : 'hold';

    console.log('🧪 AI Signal Test (NEW logic)\n');
    console.log('Inputs:');
    console.log(`  momentum1h: ${momentum1h}%`);
    console.log(`  volumeRatio: ${volumeRatio}x`);
    console.log(`  RSI: ${rsi}`);
    console.log('');
    console.log('Logic:');
    console.log(`  hasVolumeBreakout: ${hasVolumeBreakout} (momentum > 0 AND volume > 1.3x)`);
    console.log(`  hasStrongMomentum: ${hasStrongMomentum} (momentum > 0.5%)`);
    console.log(`  RSI check: ${rsi <= 85} (RSI <= 85)`);
    console.log('');
    console.log(`✨ SIGNAL: "${signal.toUpperCase()}"`);
    console.log('');

    if (signal === 'buy') {
      console.log('✅ Bot SHOULD enter trade on next cycle!');
    } else {
      console.log('❌ Bot will NOT enter (signal is hold)');
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testSignal();
