import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'NexusMeme - AI Crypto Trading Bot';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #1e1b4b 100%)',
          padding: '60px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {/* Accent bar */}
        <div style={{ position: 'absolute', left: '60px', top: '160px', width: '8px', height: '230px', background: 'linear-gradient(180deg, #3b82f6, #8b5cf6)', borderRadius: '4px' }} />

        {/* Left content */}
        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '32px', marginTop: '100px' }}>
          <div style={{ fontSize: '80px', fontWeight: '800', color: 'white', lineHeight: 1 }}>NexusMeme</div>
          <div style={{ width: '520px', height: '4px', background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)', borderRadius: '2px', marginTop: '12px' }} />
          <div style={{ fontSize: '34px', color: '#94a3b8', marginTop: '24px' }}>AI Crypto Trading Bot</div>
          <div style={{ fontSize: '30px', fontWeight: '600', color: '#60a5fa', marginTop: '16px' }}>Pay only on profits — $0 on losses</div>
          <div style={{ fontSize: '22px', color: '#475569', marginTop: '48px' }}>nexusmeme.com</div>
        </div>

        {/* Right badges */}
        <div style={{ position: 'absolute', right: '60px', top: '190px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[
            { label: 'Binance International', color: '#60a5fa', border: '#3b82f6' },
            { label: 'Available Globally', color: '#a78bfa', border: '#8b5cf6' },
            { label: 'BTC & ETH Trading', color: '#34d399', border: '#10b981' },
          ].map(({ label, color, border }) => (
            <div
              key={label}
              style={{
                width: '320px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `1.5px solid ${border}`,
                borderRadius: '28px',
                fontSize: '22px',
                fontWeight: '600',
                color,
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
