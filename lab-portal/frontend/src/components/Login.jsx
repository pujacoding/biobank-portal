import React, { useState } from 'react';

export default function Login({ onLoginSuccess, backendUrl }) {
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState(1); // 1 = identifier, 2 = otp verification
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMsg, setInfoMsg] = useState('');

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!identifier.trim()) return;

    setLoading(true);
    setError('');
    setInfoMsg('');

    try {
      const response = await fetch(`${backendUrl}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim() })
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP');
      }

      setStep(2);
      setInfoMsg(`OTP dispatched successfully! Check console logs.`);
      
      // Auto-alert the OTP for frictionless local manual testing
      if (data.otp) {
        alert(`[DEMO ONLY] Simulated OTP sent for testing: ${data.otp}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${backendUrl}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          identifier: identifier.trim(),
          otp: otp.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Invalid OTP');
      }

      onLoginSuccess(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      background: 'radial-gradient(circle at center, hsl(222, 25%, 15%) 0%, var(--bg-primary) 100%)'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
        <div style={{ marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img 
            src="/anivora-logo.jpg" 
            alt="ANIVORA BioBank" 
            style={{ 
              maxWidth: '220px', 
              height: 'auto', 
              maxHeight: '90px', 
              borderRadius: '8px', 
              marginBottom: '14px',
              backgroundColor: '#fff',
              padding: '6px 12px',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)'
            }} 
          />
          <h2 style={{ fontSize: '24px', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>ANIVORA BioBank</h2>
          <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: '700', letterSpacing: '0.08em', marginTop: '4px' }}>
            VETERINARY BIOSPECIMEN MANAGEMENT & RESEARCH PLATFORM
          </span>
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.4' }}>
          Provide your registered credentials to log in using OTP-based session authorization.
        </p>

        {error && (
          <div style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            borderRadius: 'var(--border-radius-sm)',
            padding: '10px 14px',
            color: 'var(--accent-error)',
            fontSize: '12px',
            fontWeight: '600',
            textAlign: 'left',
            marginBottom: '18px'
          }}>
            ✕ {error}
          </div>
        )}

        {infoMsg && (
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: 'var(--border-radius-sm)',
            padding: '10px 14px',
            color: 'var(--accent-success)',
            fontSize: '12px',
            fontWeight: '600',
            textAlign: 'left',
            marginBottom: '18px'
          }}>
            ✓ {infoMsg}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleSendOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="login-identifier">Phone Number or Email ID</label>
              <input
                type="text"
                id="login-identifier"
                className="form-control"
                required
                placeholder="Enter email or phone number"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px', display: 'block' }}>
                Examples: admin@metropolis.com, tech@metropolis.com, collector@metropolis.com
              </span>
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px' }} disabled={loading}>
              {loading ? 'Requesting OTP...' : 'Send Authorization OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="login-otp">Enter 6-Digit Code</label>
              <input
                type="text"
                id="login-otp"
                className="form-control"
                required
                maxLength={6}
                placeholder="Type OTP code (e.g. 123456)"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                style={{ textAlign: 'center', letterSpacing: '0.3em', fontSize: '18px', fontWeight: '700' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(1)} disabled={loading}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" style={{ flex: 2, padding: '12px' }} disabled={loading}>
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
            </div>
            
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '8px' }}>
              Didn't receive code? Enter <strong style={{ color: 'var(--accent-cyan)' }}>123456</strong> to bypass.
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
