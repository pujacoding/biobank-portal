import React, { useEffect, useState } from 'react';

export default function PublicSpecimenTracker({ sampleId, backendUrl }) {
  const [sample, setSample] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPublicData = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`${backendUrl}/api/samples/public/${sampleId}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to retrieve specimen details');
        }
        setSample(data.sample);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (sampleId) {
      fetchPublicData();
    }
  }, [backendUrl, sampleId]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at top right, hsl(222, 25%, 15%), hsl(222, 25%, 8%))',
      padding: '24px',
      fontFamily: "'Inter', sans-serif",
      color: 'var(--text-primary)'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '500px', padding: '32px', textAlign: 'left' }}>
        
        {/* Branding header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
          <div style={{
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-cyan))',
            width: '40px', height: '40px', borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 16px rgba(0, 242, 254, 0.3)'
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
              <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
              <circle cx="12" cy="12" r="2" fill="white"/>
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>AURA VERIFICATION</h2>
            <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Specimen Tracking Gateway</span>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)' }}>Querying biobank registry...</p>
          </div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent-error)" strokeWidth="2" style={{ width: '48px', height: '48px', marginBottom: '16px' }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <h3 style={{ fontSize: '16px', color: 'var(--accent-error)', fontWeight: '700' }}>Verification Failed</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>{error}</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Tracking ID Info */}
            <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Sample Tracking Code</span>
              <div style={{ fontSize: '20px', fontWeight: '800', fontFamily: 'monospace', color: 'var(--accent-cyan)', marginTop: '4px' }}>
                {sample.id}
              </div>
            </div>

            {/* Specimen demographics details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Specimen Characteristics</span>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {sample.specimen_type}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Ingested Volume</span>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {sample.sample_volume} mL
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Collection Date</span>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {sample.collection_date}
                </div>
              </div>
              <div>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Collection Time</span>
                <div style={{ fontSize: '14px', fontWeight: '600', marginTop: '4px', color: 'var(--text-primary)' }}>
                  {sample.collection_time}
                </div>
              </div>
            </div>

            {/* Ingesting lab address details */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-md)', padding: '16px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontWeight: '700', textTransform: 'uppercase' }}>Registered Laboratory Details</span>
              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)', marginTop: '6px' }}>
                🏥 {sample.lab_name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                📍 {sample.lab_location}
              </div>
            </div>

            {/* Workflow status */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>Status Verification</span>
              <span className="badge badge-verified" style={{ fontSize: '12px', padding: '6px 12px' }}>
                {sample.status}
              </span>
            </div>
            
          </div>
        )}

        {/* Footer info disclaimer */}
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '11px', color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          This verification check provides real-time digital lookup for biobank specimens. Confidentially secured by AURA portal compliance rules.
        </div>
      </div>
      
      {/* Keyframe animation for spinner */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
