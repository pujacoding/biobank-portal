import React, { useState, useEffect } from 'react';

export default function ConsentManagement({ samples, user, backendUrl, token, onConsentAction, preSelectedSampleId, setPreSelectedSampleId, setActiveTab, activeLabId, activeLabName }) {
  const [templates, setTemplates] = useState([]);
  const [specimenTypes, setSpecimenTypes] = useState([]);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/consent/templates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error("Error loading templates in ConsentManagement:", err);
      }
    };
    fetchTemplates();
  }, [backendUrl, token]);

  useEffect(() => {
    const fetchSpecimenTypes = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/specimen-types/active`);
        const data = await res.json();
        if (res.ok && data.success) {
          setSpecimenTypes(data.specimen_types || []);
        }
      } catch (err) {
        console.error("Error loading specimen types in ConsentManagement:", err);
      }
    };
    fetchSpecimenTypes();
  }, [backendUrl]);

  const handleDownloadConsentPDF = (consentItem) => {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        throw new Error("jsPDF library not loaded.");
      }

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageHeight = 297;
      const pageWidth = 210;
      const margin = 15;
      const printableWidth = pageWidth - (margin * 2); // 180mm
      let currentY = 20;

      const checkPageBreak = (neededHeight) => {
        if (currentY + neededHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin + 10;
          // Running header on new pages
          doc.setFont("Helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text("AURA Biobank Consent Document", margin, margin);
          doc.line(margin, margin + 2, margin + printableWidth, margin + 2);
        }
      };

      const printText = (text, x, y, size = 9, style = 'normal', color = [31, 41, 55]) => {
        doc.setFont("Helvetica", style);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(text, x, y);
      };

      const printBullet = (text, size = 9) => {
        checkPageBreak(5);
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(size);
        doc.setTextColor(31, 41, 55);
        const lines = doc.splitTextToSize(`• ${text}`, printableWidth - 5);
        lines.forEach((line, index) => {
          checkPageBreak(5);
          doc.text(index === 0 ? `•` : ` `, margin, currentY);
          doc.text(index === 0 ? line.substring(2) : line, margin + 4, currentY);
          currentY += 5;
        });
      };

      // Header Page 1
      printText("AURA BIOBANK", margin, currentY, 18, "bold", [59, 130, 246]);
      currentY += 8;

      printText("INFORMED CONSENT AGREEMENT RECORD", margin, currentY, 14, "bold", [31, 41, 55]);
      currentY += 5;

      // Divider line
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, currentY, margin + printableWidth, currentY);
      currentY += 8;

      // 1. Participant Information
      printText("1. Participant Information", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;

      // Draw gray card
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, currentY, printableWidth, 42, 'F');

      const isMale = (consentItem.gender || '').toLowerCase() === 'male';
      const isFemale = (consentItem.gender || '').toLowerCase() === 'female';
      const isOther = !isMale && !isFemale && consentItem.gender;

      printText("Full Name: __________________________", margin + 6, currentY + 8, 9, "normal");
      printText(`Patient ID: ${consentItem.subject_id || '__________________________'}`, margin + 95, currentY + 8, 9, "normal");
      printText(`Age: ${consentItem.age || '_______'}`, margin + 6, currentY + 18, 9, "normal");
      printText(`Gender: ${isMale ? '[X]' : '[ ]'} Male   ${isFemale ? '[X]' : '[ ]'} Female   ${isOther ? '[X]' : '[ ]'} Other`, margin + 95, currentY + 18, 9, "normal");
      printText("Address: _____________________________", margin + 6, currentY + 28, 9, "normal");
      printText("Contact Number: ______________________", margin + 6, currentY + 36, 9, "normal");
      currentY += 48;

      // 2. Study Information
      printText("2. Study Information", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printText("I hereby confirm that I have been informed about the biobank study and understand that:", margin, currentY, 9, "normal");
      currentY += 6;
      printBullet("My biological samples (blood / tissue / saliva / DNA) may be collected");
      printBullet("These samples will be stored in a biobank for future research purposes");
      printBullet("My data may be used for medical research, disease studies, and scientific analysis");
      currentY += 3;

      // 3. Type of Samples Collected
      printText("3. Type of Samples Collected", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;

      const activeSpecType = (consentItem.specimen_type || '').toLowerCase();
      const isChecked = (typeName) => activeSpecType.includes(typeName.toLowerCase());

      const typesList = specimenTypes.length > 0 ? specimenTypes : [
        { specimen_name: 'Blood' },
        { specimen_name: 'Urine' },
        { specimen_name: 'Saliva' },
        { specimen_name: 'Stool' },
        { specimen_name: 'Serum' },
        { specimen_name: 'Plasma' },
        { specimen_name: 'Buffy Coat' },
        { specimen_name: 'PBMC' },
        { specimen_name: 'Tissue' }
      ];

      const colWidth = 60;
      let startX = margin;
      let count = 0;

      typesList.forEach((t) => {
        const typeName = t.specimen_name;
        const checked = isChecked(typeName) ? '[X]' : '[ ]';
        doc.setFont("Helvetica", isChecked(typeName) ? "bold" : "normal");
        doc.setFontSize(9);
        doc.setTextColor(31, 41, 55);
        doc.text(`${checked} ${typeName}`, startX + (count % 3) * colWidth, currentY);
        if (count % 3 === 2) {
          currentY += 6;
          checkPageBreak(6);
        }
        count++;
      });
      if (count % 3 !== 0) {
        currentY += 6;
      }
      currentY += 4;

      // 4. Purpose of Use
      checkPageBreak(25);
      printText("4. Purpose of Use", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("Disease research");
      printBullet("Genetic studies");
      printBullet("Drug development");
      printBullet("Future unspecified medical research (if applicable)");
      currentY += 3;

      // 5. Privacy & Confidentiality
      checkPageBreak(25);
      printText("5. Privacy & Confidentiality", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("My personal identity will be kept confidential");
      printBullet("Data will be coded/anonymized before use");
      printBullet("Only authorized researchers will access the data");
      currentY += 3;

      // 6. Risks & Benefits
      checkPageBreak(25);
      printText("6. Risks & Benefits", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("I understand there may be minimal physical risk during sample collection");
      printBullet("No direct medical benefit is guaranteed");
      printBullet("Participation is voluntary");
      currentY += 3;

      // 7. Commercial Use
      checkPageBreak(25);
      printText("7. Commercial Use", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("I understand that my samples may be used for commercial research");
      printBullet("I will not receive financial benefit from any discoveries or products");
      currentY += 3;

      // 8. Withdrawal Right
      checkPageBreak(25);
      printText("8. Withdrawal Right", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("I can withdraw my consent at any time without penalty");
      printBullet("After withdrawal, no new use of my sample/data will occur");
      currentY += 3;

      // 9. Sample Storage
      checkPageBreak(25);
      printText("9. Sample Storage", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printBullet("Samples may be stored for: 25 years");
      printBullet("After completion, samples may be destroyed or anonymized further");
      currentY += 3;

      // 10. Consent Declaration
      checkPageBreak(25);
      printText("10. Consent Declaration", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printText("I confirm that:", margin, currentY, 9, "normal");
      currentY += 5;
      printBullet("I have read and understood all the information above");
      printBullet("I voluntarily agree to participate in this biobank study");
      currentY += 2;

      const hasAgreed = ['Verified', 'Submitted'].includes(consentItem.consent_status);
      printText(`${hasAgreed ? '[X]' : '[ ]'} I Agree      ${!hasAgreed && consentItem.consent_status === 'Rejected' ? '[X]' : '[ ]'} I Do Not Agree`, margin, currentY, 9.5, "bold", [31, 41, 55]);
      currentY += 8;

      // 11. Signature
      checkPageBreak(40);
      printText("11. Signature", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 8;

      doc.setDrawColor(209, 213, 219);
      doc.line(margin, currentY + 8, margin + 50, currentY + 8);
      printText("Participant Signature", margin, currentY + 12, 8.5, "normal", [107, 114, 128]);
      printText(`Date: ${consentItem.consent_date || '__________'}`, margin, currentY + 17, 8.5, "normal", [107, 114, 128]);

      doc.line(margin + 65, currentY + 8, margin + 115, currentY + 8);
      printText("Witness Name & Signature", margin + 65, currentY + 12, 8.5, "normal", [107, 114, 128]);
      printText("Date: __________", margin + 65, currentY + 17, 8.5, "normal", [107, 114, 128]);

      doc.line(margin + 130, currentY + 8, margin + 180, currentY + 8);
      printText("Investigator Name & Signature", margin + 130, currentY + 12, 8.5, "normal", [107, 114, 128]);
      printText(`Date: ${consentItem.submitted_date || '__________'}`, margin + 130, currentY + 17, 8.5, "normal", [107, 114, 128]);
      currentY += 26;

      // 12. Contact Information
      checkPageBreak(25);
      printText("12. Contact Information", margin, currentY, 11, "bold", [31, 41, 55]);
      currentY += 6;
      printText("For any queries or withdrawal:", margin, currentY, 9, "normal");
      currentY += 5;
      printText("Institution: Aura Biobank Admin Center", margin, currentY, 9, "normal");
      currentY += 5;
      printText("Contact Number: +1 (555) 019-2838", margin, currentY, 9, "normal");
      currentY += 5;
      printText("Email: support@aurabiobank.org", margin, currentY, 9, "normal");

      // Save PDF
      doc.save(`Consent_${consentItem.subject_id}_${consentItem.consent_id || 'Document'}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Error generating PDF: " + err.message);
    }
  };

  const [selectedSampleId, setSelectedSampleId] = useState(preSelectedSampleId || '');
  const [consentVersion, setConsentVersion] = useState('v1.0');
  const [consentDate, setConsentDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [consentFile, setConsentFile] = useState(null);

  useEffect(() => {
    if (preSelectedSampleId) {
      setSelectedSampleId(preSelectedSampleId);
    }
  }, [preSelectedSampleId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUploadForWithdrawn, setShowUploadForWithdrawn] = useState(false);
  const [showUploadForDraft, setShowUploadForDraft] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('Draft');
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setShowUploadForDraft(false);
    setShowUploadForWithdrawn(false);
  }, [selectedSampleId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.querySelector('aside + div');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [currentPage]);

  // Samples that need consent (consent_id is null, or verification_status is Rejected)
  const samplesNeedConsent = (samples || []).filter(s => !s.consent_id || s.consent_status === 'Rejected');
  
  // Consent pending verification (consent_status === 'Submitted')
  const pendingConsents = (samples || []).filter(s => s.consent_status === 'Submitted');

  const selectedSample = (samples || []).find(s => s.id === selectedSampleId);
  const hasUploadedConsent = selectedSample && (
    (selectedSample.consent_status === 'Draft' && !showUploadForDraft) ||
    selectedSample.consent_status === 'Submitted' || 
    selectedSample.consent_status === 'Verified' ||
    (selectedSample.consent_status === 'Withdrawn' && !showUploadForWithdrawn)
  );

  useEffect(() => {
    if (selectedSample) {
      setConsentVersion(selectedSample.consent_version || 'v1.0');
      setConsentDate(selectedSample.consent_date || new Date().toLocaleDateString('en-CA'));
    } else {
      setConsentVersion('v1.0');
      setConsentDate(new Date().toLocaleDateString('en-CA'));
    }
  }, [selectedSampleId, selectedSample]);

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setConsentFile(e.target.files[0]);
    }
  };

  const handleEditDraft = () => {
    if (selectedSample) {
      setConsentVersion(selectedSample.consent_version || 'v1.0');
      setConsentDate(selectedSample.consent_date || new Date().toLocaleDateString('en-CA'));
      setShowUploadForDraft(true);
    }
  };

  const handleSubmitConsent = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedSampleId) {
      setError("Please select a sample code to link this consent document.");
      return;
    }

    const isEditingDraft = selectedSample && selectedSample.consent_status === 'Draft';
    if (!consentFile && !isEditingDraft) {
      setError("Please select a signed consent document file to upload.");
      return;
    }

    setLoading(true);
    const targetStatus = submitStatus || 'Draft';

    let documentName = "consent.pdf";
    if (consentFile) {
      documentName = consentFile.name;
    } else if (selectedSample && selectedSample.document_url) {
      const parts = selectedSample.document_url.split('/');
      const filename = parts[parts.length - 1];
      const underscoreIndex = filename.indexOf('_');
      if (underscoreIndex !== -1) {
        documentName = filename.substring(underscoreIndex + 1);
      } else {
        documentName = filename;
      }
    }

    try {
      const response = await fetch(`${backendUrl}/api/consent/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({
          sample_id: selectedSampleId,
          consent_version: consentVersion,
          consent_date: consentDate,
          document_name: documentName,
          status: targetStatus
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit consent details');
      }

      setSuccess(`Consent record created successfully! Consent ID: ${data.consent.id}. Status is currently ${targetStatus.toUpperCase()}.`);
      setSelectedSampleId('');
      setConsentFile(null);
      setShowUploadForDraft(false);
      if (setPreSelectedSampleId) setPreSelectedSampleId('');
      
      if (onConsentAction) onConsentAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTransitionConsent = async (consentId) => {
    setError('');
    setSuccess('');
    
    const confirmSubmit = window.confirm("Are you sure you want to transition this Draft consent to Submitted status?");
    if (!confirmSubmit) return;

    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/consent/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({ consent_id: consentId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to transition consent status');
      }

      alert(`Consent document ${consentId} has been successfully submitted for review!`);
      setSuccess(`Consent record ${consentId} status transitioned to SUBMITTED.`);
      
      if (onConsentAction) onConsentAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyConsent = async (consentId, status) => {
    setError('');
    setSuccess('');

    // Confirmation popups
    if (status === 'Verified') {
      const confirmApprove = window.confirm("Are you sure you want to verify and approve this consent document?");
      if (!confirmApprove) return;
    } else {
      const confirmReject = window.confirm("Are you sure you want to reject this consent document?");
      if (!confirmReject) return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/consent/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({
          consent_id: consentId,
          verification_status: status
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update verification status');
      }

      // Success alert popup
      alert(`Consent document ${consentId} has been successfully ${status === 'Verified' ? 'verified and approved' : 'rejected'}!`);

      setSuccess(`Consent record ${consentId} was updated to: ${status.toUpperCase()}. linked sample status updated.`);
      
      if (onConsentAction) onConsentAction();

      if (status === 'Verified') {
        setTimeout(() => {
          setActiveTab('barcode');
        }, 1500);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawConsent = async (sampleId) => {
    setError('');
    setSuccess('');

    const targetId = typeof sampleId === 'string' ? sampleId : selectedSampleId;
    if (!targetId) return;

    const confirmWithdraw = window.confirm(
      `WARNING: Are you sure you want to withdraw patient consent for sample ${targetId}?\n\n` +
      `This will mark the specimen consent as WITHDRAWN and lock further operations.`
    );
    if (!confirmWithdraw) return;

    setLoading(true);

    try {
      const response = await fetch(`${backendUrl}/api/consent/withdraw`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
        },
        body: JSON.stringify({
          sample_id: targetId
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to withdraw consent');
      }

      alert(data.message || `Consent successfully withdrawn for sample ${targetId}!`);
      setSuccess(data.message || `Consent record successfully updated to WITHDRAWN for sample ${targetId}.`);
      
      if (targetId === selectedSampleId) {
        setSelectedSampleId('');
      }
      if (onConsentAction) onConsentAction();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isVerifier = user.role === 'Super Admin' || user.role === 'Lab Admin' || (user.permissions && (user.permissions.includes('Verify Consent') || user.permissions.includes('Reject Consent')));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', textAlign: 'left' }}>
      
      {/* Back Button */}
      <button 
        className="btn btn-secondary" 
        onClick={() => setActiveTab('dashboard')} 
        style={{ marginBottom: '4px', padding: '6px 12px', fontSize: '12px', alignSelf: 'flex-start' }}
      >
        ← Back to Dashboard
      </button>

      <div>
        <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Consent Governance</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Manage patient informed consent documents and verify compliance before processing laboratory barcodes.
        </p>
      </div>

      {!activeLabId && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--border-radius-md)',
          padding: '16px',
          color: 'var(--accent-error)',
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            <strong>Active Lab Required:</strong> You must select an Active Working Lab from the top header dropdown before managing consent files.
          </span>
        </div>
      )}

      {error && (
        <div style={{
          backgroundColor: 'rgba(239, 68, 68, 0.08)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-error)',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          ✕ {error}
        </div>
      )}

      {success && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-success)',
          fontSize: '13px',
          fontWeight: '600'
        }}>
          ✓ {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isVerifier ? '1.2fr 1fr' : '1fr', gap: '24px', alignItems: 'start' }}>
        
        {/* Panel 1: Upload Consent (Available to all) */}
        <div className="glass-card">
          <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Consent Ingestion & Details</h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            View consent status or ingest physical patient signed consent documents for registered samples.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="consent-sample-select">Select Registered Sample *</label>
              <select
                id="consent-sample-select"
                className="form-control"
                required
                value={selectedSampleId}
                onChange={(e) => {
                  setSelectedSampleId(e.target.value);
                  setShowUploadForWithdrawn(false);
                  setSuccess('');
                  setError('');
                }}
              >
                <option value="">-- Choose Sample Code --</option>
                {samples.map(s => {
                  let statusText = '';
                  if (s.consent_status === 'Verified') {
                    statusText = ' (Consent VERIFIED)';
                  } else if (s.consent_status === 'Submitted') {
                    statusText = ' (Consent SUBMITTED)';
                  } else if (s.consent_status === 'Draft') {
                    statusText = ' (Consent DRAFT)';
                  } else if (s.consent_status === 'Rejected') {
                    statusText = ' (Consent REJECTED)';
                  } else if (s.consent_status === 'Withdrawn') {
                    statusText = ' (Consent WITHDRAWN)';
                  } else {
                    statusText = ' (No Consent)';
                  }
                  return (
                    <option key={s.id} value={s.id}>
                      {s.id} ({s.specimen_type} &bull; Subject: {s.subject_id}{statusText})
                    </option>
                  );
                })}
              </select>
            </div>

            {hasUploadedConsent ? (
              <div style={{
                marginTop: '10px',
                padding: '20px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                  <h4 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {selectedSample.consent_status === 'Withdrawn' ? 'Revoked Consent Details' : 'Active Consent Details'}
                  </h4>
                  {selectedSample.consent_status === 'Withdrawn' ? (
                    <span style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--accent-error)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      WITHDRAWN
                    </span>
                  ) : selectedSample.consent_status === 'Draft' ? (
                    <span style={{
                      background: 'rgba(255, 193, 7, 0.1)',
                      color: '#ffc107',
                      border: '1px solid rgba(255, 193, 7, 0.2)',
                      padding: '4px 8px',
                      fontSize: '11px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase'
                    }}>
                      DRAFT
                    </span>
                  ) : (
                    <span className={`badge ${selectedSample.consent_status === 'Verified' ? 'badge-verified' : 'badge-pending'}`}>
                      {selectedSample.consent_status}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '13px' }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Consent ID</span>
                    <strong style={{ fontFamily: 'monospace', color: 'var(--accent-purple)' }}>{selectedSample.consent_id || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Consent Version</span>
                    <strong>{selectedSample.consent_version || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Signed Date</span>
                    <strong>{selectedSample.consent_date || 'N/A'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Specimen Type</span>
                    <strong>{selectedSample.specimen_type}</strong>
                  </div>
                  {selectedSample.consent_status === 'Withdrawn' && (
                    <>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Withdrawal Date & Time</span>
                        <strong style={{ color: 'var(--accent-error)' }}>{selectedSample.withdrawn_at || 'N/A'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Withdrawn By</span>
                        <strong>{selectedSample.withdrawn_by || 'N/A'}</strong>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Actions</span>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {selectedSample.document_url ? (
                      <button 
                        type="button"
                        onClick={() => handleDownloadConsentPDF(selectedSample)}
                        className="btn btn-secondary" 
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '13px' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: '16px', height: '16px' }}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                        Download / View PDF
                      </button>
                    ) : (
                      <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--text-tertiary)' }}>No document URL available</span>
                    )}

                    {selectedSample.consent_status === 'Draft' && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleEditDraft}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '13px' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z" />
                        </svg>
                        Edit Consent Details
                      </button>
                    )}

                    {selectedSample.consent_status === 'Withdrawn' ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowUploadForWithdrawn(true)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', fontSize: '13px' }}
                      >
                        Ingest New Consent
                      </button>
                    ) : (
                      (user.role === 'Super Admin' || user.role === 'Lab Admin') ? (
                        <button
                          type="button"
                          className="btn"
                          onClick={handleWithdrawConsent}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '10px 16px',
                            fontSize: '13px',
                            fontWeight: '600',
                            borderColor: 'var(--accent-error)',
                            color: 'var(--accent-error)',
                            background: 'rgba(239, 68, 68, 0.08)',
                            cursor: !activeLabId ? 'not-allowed' : 'pointer'
                          }}
                          disabled={loading || !activeLabId}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                            <circle cx="12" cy="12" r="10" />
                            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                          </svg>
                          Withdraw Consent
                        </button>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <button
                            type="button"
                            className="btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '10px 16px',
                              fontSize: '13px',
                              fontWeight: '600',
                              borderColor: 'var(--border-color)',
                              color: 'var(--text-tertiary)',
                              background: 'rgba(255, 255, 255, 0.02)',
                              cursor: 'not-allowed'
                            }}
                            disabled
                            title="Withdrawal requires Admin privileges."
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                            </svg>
                            Withdraw Consent
                          </button>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                            Withdrawal requires Super Admin or Lab Admin access.
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                {selectedSample && selectedSample.consent_status === 'Withdrawn' && (
                  <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.2)',
                    borderRadius: 'var(--border-radius-sm)',
                    padding: '12px 16px',
                    color: 'var(--accent-error)',
                    fontSize: '13px',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <span><strong>Consent Revoked:</strong> Previous consent for this sample was withdrawn. You can upload a new signed consent file below.</span>
                  </div>
                )}
                <form onSubmit={handleSubmitConsent} style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="consent-ver-mgr">Consent Version *</label>
                    <input
                      type="text"
                      id="consent-ver-mgr"
                      className="form-control"
                      required
                      value={consentVersion}
                      onChange={(e) => setConsentVersion(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="consent-dt-mgr">Consent Signed Date *</label>
                    <input
                      type="date"
                      id="consent-dt-mgr"
                      className="form-control"
                      required
                      value={consentDate}
                      onChange={(e) => setConsentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="consent-file-mgr">Signed Document File (PDF or Image) *</label>
                  <input
                    type="file"
                    id="consent-file-mgr"
                    className="form-control"
                    required={!(selectedSample && selectedSample.consent_status === 'Draft')}
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    style={{ padding: '8px' }}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                    On mobile devices, this option allows capturing directly from the camera or selecting an existing file.
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <button 
                    type="submit" 
                    className="btn btn-secondary" 
                    onClick={() => setSubmitStatus('Draft')}
                    style={{ flex: 1, padding: '12px', cursor: (!selectedSampleId || !activeLabId || loading) ? 'not-allowed' : 'pointer' }}
                    disabled={loading || !selectedSampleId || !activeLabId}
                  >
                    Save as Draft
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-primary" 
                    onClick={() => setSubmitStatus('Submitted')}
                    style={{ flex: 1, padding: '12px', cursor: (!selectedSampleId || !activeLabId || loading) ? 'not-allowed' : 'pointer' }}
                    disabled={loading || !selectedSampleId || !activeLabId}
                  >
                    Submit Consent
                  </button>
                </div>
              </form>
              </div>
            )}
          </div>
        </div>

        {/* Panel 2: Review and Verify Consent (Verifier Only) */}
        {isVerifier && (
          <div className="glass-card" style={{ height: '100%' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '4px' }}>Consent Verification Panel</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Verify patient agreements. Consent status starts as "Submitted" and can be verified/rejected.
            </p>

            {pendingConsents.length === 0 ? (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-secondary)',
                padding: '48px 0',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--border-radius-md)'
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: '36px', height: '36px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <p style={{ fontSize: '13px' }}>All consent documents verified.</p>
                <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>No records pending review.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
                {pendingConsents.map(sample => (
                  <div key={sample.consent_id} style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius-md)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-purple)' }}>
                        ID: {sample.consent_id}
                      </span>
                      <span className="badge badge-info">Submitted</span>
                    </div>

                    <div style={{ fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div><strong>Sample:</strong> {sample.id} ({sample.specimen_type})</div>
                      <div><strong>Subject:</strong> {sample.subject_id} (Age: {sample.age}, {sample.gender})</div>
                      <div><strong>Consent Version:</strong> {sample.consent_version}</div>
                      <div><strong>Consent Date:</strong> {sample.consent_date}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', wordBreak: 'break-all' }}>
                        <strong>Document path:</strong> {sample.document_url}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleDownloadConsentPDF(sample)}
                        style={{ flex: 1.2, padding: '8px', fontSize: '12px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', cursor: 'pointer' }}
                      >
                        View PDF
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleVerifyConsent(sample.consent_id, 'Rejected')}
                        style={{ flex: 1, padding: '8px', fontSize: '12px', borderColor: 'var(--accent-error)', color: 'var(--accent-error)', cursor: !activeLabId ? 'not-allowed' : 'pointer' }}
                        disabled={loading || !activeLabId}
                      >
                        Reject
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleVerifyConsent(sample.consent_id, 'Verified')}
                        style={{ flex: 1.5, padding: '8px', fontSize: '12px', background: !activeLabId ? 'var(--text-tertiary)' : 'linear-gradient(135deg, var(--accent-success), #10b981)', cursor: !activeLabId ? 'not-allowed' : 'pointer' }}
                        disabled={loading || !activeLabId}
                      >
                        Verify & Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consent Queue (Full Width, Visible to Super Admin, Lab Admin, Collection Staff, Lab Technician and anyone with verify/reject permissions) */}
      {(user.role === 'Super Admin' || user.role === 'Lab Admin' || user.role === 'Collection Staff' || user.role === 'Lab Technician' || (user.permissions && (user.permissions.includes('Verify Consent') || user.permissions.includes('Reject Consent')))) && (() => {
        const queueConsents = samples.filter(s => s.consent_id);
        const visibleConsents = queueConsents.filter(s => {
          if (s.consent_status === 'Draft') {
            return user.role === 'Super Admin' || user.role === 'Collection Staff' || user.role === 'Lab Technician' || (user.permissions && user.permissions.includes('Verify Consent'));
          }
          return true;
        });

        const filteredQueueConsents = visibleConsents.filter(s => {
          if (statusFilter === 'All') return true;
          return s.consent_status === statusFilter;
        });

        return (
          <div className="glass-card" style={{ marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', margin: 0 }}>Consent Queue</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
                  Track and review the full lifecycle of consent documents: Draft &rarr; Submitted &rarr; Verified &rarr; Rejected.
                </p>
              </div>
              
              {/* Filter controls */}
              <div style={{ display: 'flex', gap: '6px', background: 'rgba(0, 0, 0, 0.05)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px' }}>
                {['All', 'Draft', 'Submitted', 'Verified', 'Rejected', 'Withdrawn'].map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      borderRadius: '6px',
                      background: statusFilter === st ? 'var(--accent-purple)' : 'transparent',
                      border: 'none',
                      color: statusFilter === st ? '#fff' : 'var(--text-primary)',
                      fontWeight: statusFilter === st ? '600' : '400',
                      cursor: 'pointer'
                    }}
                  >
                    {st}
                  </button>
                ))}
              </div>

            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Consent ID</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Subject ID</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Consent Type</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Submitted By</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Submitted Date</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600' }}>Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: '600', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueueConsents.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                        No consent records match the selected status filter.
                      </td>
                    </tr>
                  ) : (() => {
                    const pageSize = 10;
                    const totalPages = Math.ceil(filteredQueueConsents.length / pageSize);
                    const paginatedConsents = filteredQueueConsents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

                    return paginatedConsents.map(consent => {
                      let statusBadgeClass = 'badge-pending';
                      if (consent.consent_status === 'Verified') statusBadgeClass = 'badge-verified';
                      else if (consent.consent_status === 'Rejected' || consent.consent_status === 'Withdrawn') statusBadgeClass = 'badge-rejected';
                      else if (consent.consent_status === 'Draft') statusBadgeClass = 'badge-draft';
                      
                      const isDraft = consent.consent_status === 'Draft';
                      const isSubmitted = consent.consent_status === 'Submitted';

                      return (
                        <tr key={consent.consent_id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.03)' }}>
                          <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: '700', color: 'var(--accent-purple)' }}>{consent.consent_id}</td>
                          <td style={{ padding: '12px 16px', fontWeight: '600' }}>{consent.subject_id}</td>
                          <td style={{ padding: '12px 16px' }}>{consent.consent_type || 'General Biobank Consent'}</td>
                          <td style={{ padding: '12px 16px' }}>{consent.submitted_by || 'System'}</td>
                          <td style={{ padding: '12px 16px' }}>{consent.submitted_date || 'N/A'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            {consent.consent_status === 'Draft' ? (
                              <span style={{
                                background: 'rgba(255, 193, 7, 0.1)',
                                color: '#ffc107',
                                border: '1px solid rgba(255, 193, 7, 0.2)',
                                padding: '2px 6px',
                                fontSize: '11px',
                                borderRadius: '4px',
                                fontWeight: '600'
                              }}>Draft</span>
                            ) : (
                              <span className={`badge ${statusBadgeClass}`}>{consent.consent_status}</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              {consent.document_url && (
                                <button
                                  type="button"
                                  onClick={() => handleDownloadConsentPDF(consent)}
                                  className="btn btn-secondary"
                                  style={{ padding: '5px 10px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                >
                                  View
                                </button>
                              )}
                              
                              {/* Submit (Draft -> Submitted) */}
                              {isDraft && (user.role === 'Super Admin' || user.role === 'Collection Staff' || user.role === 'Lab Admin' || user.role === 'Lab Technician') && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleTransitionConsent(consent.consent_id)}
                                  style={{ padding: '5px 10px', fontSize: '11px' }}
                                  disabled={loading}
                                >
                                  Submit
                                </button>
                              )}

                              {/* Approve (Verify) */}
                              {(isSubmitted || (isDraft && user.role === 'Super Admin')) && (
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  onClick={() => handleVerifyConsent(consent.consent_id, 'Verified')}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    background: 'linear-gradient(135deg, var(--accent-success), #10b981)',
                                    display: user.role === 'Super Admin' || (user.permissions && user.permissions.includes('Verify Consent')) ? 'inline-block' : 'none'
                                  }}
                                  disabled={loading}
                                >
                                  Approve
                                </button>
                              )}

                              {/* Reject */}
                              {(isSubmitted || (isDraft && user.role === 'Super Admin')) && (
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  onClick={() => handleVerifyConsent(consent.consent_id, 'Rejected')}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    borderColor: 'var(--accent-error)',
                                    color: 'var(--accent-error)',
                                    display: user.role === 'Super Admin' || (user.permissions && user.permissions.includes('Reject Consent')) ? 'inline-block' : 'none'
                                  }}
                                  disabled={loading}
                                >
                                  Reject
                                </button>
                              )}

                              {/* Withdraw */}
                              {(consent.consent_status === 'Verified' || consent.consent_status === 'Submitted') && (user.role === 'Super Admin' || user.role === 'Lab Admin') && (
                                <button
                                  type="button"
                                  className="btn"
                                  onClick={() => handleWithdrawConsent(consent.id)}
                                  style={{
                                    padding: '5px 10px',
                                    fontSize: '11px',
                                    borderColor: 'var(--accent-error)',
                                    color: '#fff',
                                    background: 'var(--accent-error)',
                                    cursor: 'pointer',
                                    border: 'none',
                                    borderRadius: '4px'
                                  }}
                                  disabled={loading}
                                >
                                  Withdraw
                                </button>
                              )}

                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredQueueConsents.length > 0 && (() => {
              const pageSize = 10;
              const totalPages = Math.ceil(filteredQueueConsents.length / pageSize);
              return (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Showing {Math.min(filteredQueueConsents.length, (currentPage - 1) * pageSize + 1)} to {Math.min(filteredQueueConsents.length, currentPage * pageSize)} of {filteredQueueConsents.length} entries
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                    >
                      Previous
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: '600' }}>
                      Page {currentPage} of {totalPages || 1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage >= totalPages || totalPages === 0}
                      style={{ padding: '6px 12px', fontSize: '11px' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })()}
    </div>
  );
}
