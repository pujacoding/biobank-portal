import React, { useState } from 'react';

export default function BarcodePrintSettings({ batchSamples, onClose }) {
  const [stickerFormat, setStickerFormat] = useState('65'); // '65' or '48'
  const [currentPage, setCurrentPage] = useState(1);

  const totalLabels = batchSamples.length;
  const is65 = stickerFormat === '65';
  
  const columns = is65 ? 5 : 4;
  const rows = is65 ? 13 : 12;
  const labelsPerPage = columns * rows;
  const totalPages = Math.ceil(totalLabels / labelsPerPage) || 1;

  const handleFormatChange = (format) => {
    setStickerFormat(format);
    setCurrentPage(1);
  };

  const handlePrint = () => {
    window.print();
  };

  // Label card style adjustments based on formatting
  const labelWidth = is65 ? '135px' : '170px';
  const labelHeight = is65 ? '75px' : '90px';
  const labelFontSize = is65 ? '9px' : '10px';
  const barcodeHeight = is65 ? '24px' : '30px';

  return (
    <div className="barcode-print-page" style={{
      minHeight: '100vh',
      backgroundColor: '#f8fafc',
      color: '#0f172a',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '40px 24px',
      textAlign: 'left'
    }}>
      {/* settings header (hidden during printing) */}
      <div className="print-settings-header" style={{
        maxWidth: '960px',
        margin: '0 auto 32px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        padding: '24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#1e293b', margin: 0 }}>
            Barcode Print Settings
          </h1>
          <button 
            className="btn btn-secondary" 
            onClick={onClose}
            style={{ 
              borderColor: '#cbd5e1', 
              color: '#475569', 
              padding: '6px 16px', 
              fontSize: '13px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <button 
            className="btn btn-primary" 
            onClick={handlePrint}
            style={{ 
              backgroundColor: '#3b82f6', 
              color: '#fff', 
              border: 'none', 
              padding: '8px 20px', 
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              borderRadius: '4px'
            }}
          >
            Print Barcodes
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span>Page:</span>
            <input 
              type="number" 
              value={currentPage} 
              onChange={(e) => setCurrentPage(Math.max(1, Math.min(totalPages, parseInt(e.target.value, 10) || 1)))}
              style={{ 
                width: '45px', 
                padding: '4px', 
                border: '1px solid #cbd5e1', 
                borderRadius: '4px', 
                textAlign: 'center' 
              }}
            />
            <span>of {totalPages}</span>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={is65} 
              onChange={() => handleFormatChange('65')}
              style={{ cursor: 'pointer' }}
            />
            Use 65-sticker paper format
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={stickerFormat === '48'} 
              onChange={() => handleFormatChange('48')}
              style={{ cursor: 'pointer' }}
            />
            Use 48-sticker paper format
          </label>
        </div>

        <div style={{ fontSize: '13px', color: '#64748b' }}>
          <div>Layout: {rows} rows &times; {columns} columns</div>
          <div>Total labels: {totalLabels} (requires {totalPages} page{totalPages > 1 ? 's' : ''})</div>
        </div>
      </div>

      {/* Barcodes Grid Container */}
      <div style={{ maxWidth: '960px', margin: '0 auto' }}>
        <div 
          className="grid-container" 
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gap: is65 ? '10px 8px' : '14px 10px',
            backgroundColor: '#ffffff',
            padding: '20px',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            justifyItems: 'center',
            alignItems: 'center'
          }}
        >
          {batchSamples.map((sample, index) => {
            const specType = sample.specimen_type || 'Specimen';
            const specVol = sample.sample_volume ? `${sample.sample_volume} mL` : '';
            const collDate = sample.collection_date || '';
            const labName = sample.lab_name || 'Lab';
            const barcodeVal = sample.barcode_text || sample.barcode_value || sample.id;

             return (
              <div 
                key={`${sample.id}-${index}`} 
                className="label-card" 
                style={{
                  width: labelWidth,
                  height: labelHeight,
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '6px',
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  gap: '6px'
                }}
              >
                <div style={{ textAlign: 'left', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <div style={{ fontSize: is65 ? '8px' : '9px', fontWeight: '800', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    AURA BIOBANK
                  </div>
                  <div style={{ fontSize: is65 ? '7px' : '8px', color: '#475569', fontWeight: '700', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    ID: {barcodeVal}
                  </div>
                  <div style={{ fontSize: is65 ? '7px' : '8px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {specType} ({specVol})
                  </div>
                  <div style={{ fontSize: is65 ? '6px' : '7px', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    Coll: {collDate}
                  </div>
                </div>

                {sample.qr_code_base64 ? (
                  <img 
                    src={sample.qr_code_base64} 
                    alt="QR Code" 
                    style={{ 
                      width: is65 ? '34px' : '42px', 
                      height: is65 ? '34px' : '42px', 
                      objectFit: 'contain',
                      flexShrink: 0
                    }} 
                  />
                ) : (
                  <div style={{ width: is65 ? '34px' : '42px', height: is65 ? '34px' : '42px', fontSize: '7px', display: 'flex', alignItems: 'center', color: '#64748b', flexShrink: 0 }}>
                    [QR]
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Global printable media override stylesheet */}
      <style>{`
        @media print {
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          body * {
            visibility: hidden;
          }
          .barcode-print-page, .barcode-print-page * {
            visibility: visible;
          }
          .barcode-print-page {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          .print-settings-header {
            display: none !important;
          }
          .grid-container {
            display: grid !important;
            grid-template-columns: repeat(${columns}, 1fr) !important;
            gap: ${is65 ? '8px 6px' : '12px 8px'} !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: #ffffff !important;
          }
          .label-card {
            border: 1px dashed #000000 !important; /* Dotted print border helper */
            background-color: #ffffff !important;
            page-break-inside: avoid !important;
          }
          @page {
            size: A4 portrait;
            margin: 0.3in 0.25in;
          }
        }
      `}</style>
    </div>
  );
}
