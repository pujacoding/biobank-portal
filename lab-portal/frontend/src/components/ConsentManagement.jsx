import React, { useState, useEffect } from 'react';

export default function ConsentManagement({ samples, user, backendUrl, token, onConsentAction, preSelectedSampleId, setPreSelectedSampleId, setActiveTab, activeLabId, activeLabName }) {
  const [templates, setTemplates] = useState([]);

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

  const handleDownloadConsentPDF = (consentItem) => {
    try {
      const { jsPDF } = window.jspdf;
      if (!jsPDF) {
        throw new Error("jsPDF library not loaded.");
      }

      // 1. Get the template IDs for this consent
      let templateIds = [];
      if (consentItem.consent_template_ids) {
        try {
          templateIds = JSON.parse(consentItem.consent_template_ids);
        } catch (e) {
          templateIds = [consentItem.consent_template_id];
        }
      } else if (consentItem.consent_template_id) {
        templateIds = [consentItem.consent_template_id];
      }

      // Filter templates matching these IDs
      let selectedTemplates = [];
      if (Array.isArray(templateIds) && templateIds.length > 0) {
        selectedTemplates = templates.filter(t => templateIds.map(String).includes(String(t.template_id)));
      }

      // If we couldn't match by ID, let's match by name from consent_type
      if (selectedTemplates.length === 0 && consentItem.consent_type) {
        const names = consentItem.consent_type.split(',').map(s => s.trim().toLowerCase());
        selectedTemplates = templates.filter(t => names.includes(t.consent_name.toLowerCase()));
      }

      // Fallback if still empty
      if (selectedTemplates.length === 0) {
        selectedTemplates = [{
          consent_name: consentItem.consent_type || "General Biobank Consent",
          consent_code: "GBC",
          version: consentItem.consent_version || "v1.0",
          effective_date: consentItem.consent_date || "N/A",
          consent_summary: JSON.stringify({
            purpose: "Authorizes storage of biological samples in the AURA Biobank.",
            allows: ["Sample storage", "Future approved research use"],
            restrictions: ["Personal identity will remain protected."]
          }),
          consent_details: "This document establishes consent for the collection and storage of biological materials and associated health data in the AURA Biobank."
        }];
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
          currentY = margin;
          // Draw running header on new pages
          doc.setFont("Helvetica", "italic");
          doc.setFontSize(8);
          doc.setTextColor(150, 150, 150);
          doc.text("AURA Biobank Consent Document", margin, currentY);
          doc.line(margin, currentY + 2, margin + printableWidth, currentY + 2);
          currentY += 8;
        }
      };

      // Draw Header Page 1
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(59, 130, 246); // Brand color #3b82f6 (Aura primary blue)
      doc.text("AURA BIOBANK", margin, currentY);
      currentY += 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text("OFFICIAL CONSENT AGREEMENT RECORD", margin, currentY);
      currentY += 5;

      // Draw separator line
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, currentY, margin + printableWidth, currentY);
      currentY += 10;

      // Participant & Metadata Card
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, currentY, printableWidth, 32, 'F');
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text("PARTICIPANT DETAILS", margin + 5, currentY + 6);
      doc.text("RECORD METADATA", margin + 95, currentY + 6);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(`Subject ID: ${consentItem.subject_id}`, margin + 5, currentY + 12);
      doc.text(`Age / Gender: ${consentItem.age || 'N/A'} / ${consentItem.gender || 'N/A'}`, margin + 5, currentY + 18);
      doc.text(`Sample ID: ${consentItem.id || 'N/A'}`, margin + 5, currentY + 24);

      doc.text(`Consent ID: ${consentItem.consent_id || 'N/A'}`, margin + 95, currentY + 12);
      doc.text(`Signed Date: ${consentItem.consent_date || 'N/A'}`, margin + 95, currentY + 18);
      doc.text(`Status: ${consentItem.consent_status || 'Pending'}`, margin + 95, currentY + 24);
      currentY += 40;

      // Add each template's detail
      selectedTemplates.forEach((template, index) => {
        // Divider between templates if not the first one
        if (index > 0) {
          checkPageBreak(15);
          doc.setDrawColor(229, 231, 235);
          doc.line(margin, currentY, margin + printableWidth, currentY);
          currentY += 10;
        }

        checkPageBreak(25);
        // Header
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(31, 41, 55);
        doc.text(`${index + 1}. ${template.consent_name} (${template.consent_code})`, margin, currentY);
        currentY += 6;

        // Version & Date
        doc.setFont("Helvetica", "italic");
        doc.setFontSize(8.5);
        doc.setTextColor(107, 114, 128);
        doc.text(`Version: ${template.version}  |  Effective Date: ${template.effective_date}`, margin, currentY);
        currentY += 6;

        // Summary details
        let summaryObj = { purpose: "", allows: [], restrictions: [] };
        try {
          summaryObj = typeof template.consent_summary === 'string' 
            ? JSON.parse(template.consent_summary) 
            : template.consent_summary;
        } catch (e) {
          summaryObj = { purpose: template.consent_summary, allows: [], restrictions: [] };
        }

        // Purpose
        if (summaryObj.purpose) {
          checkPageBreak(15);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(75, 85, 99);
          doc.text("Purpose:", margin, currentY);
          currentY += 5;

          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(31, 41, 55);
          const purposeLines = doc.splitTextToSize(summaryObj.purpose, printableWidth);
          purposeLines.forEach(line => {
            checkPageBreak(5);
            doc.text(line, margin, currentY);
            currentY += 5;
          });
          currentY += 2;
        }

        // Allows
        if (summaryObj.allows && summaryObj.allows.length > 0) {
          checkPageBreak(15);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(16, 185, 129); // Green text
          doc.text("Permitted Activities (Allows):", margin, currentY);
          currentY += 5;

          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(31, 41, 55);
          summaryObj.allows.forEach(allow => {
            const allowLines = doc.splitTextToSize(`• ${allow}`, printableWidth);
            allowLines.forEach(line => {
              checkPageBreak(5);
              doc.text(line, margin, currentY);
              currentY += 5;
            });
          });
          currentY += 2;
        }

        // Restrictions
        if (summaryObj.restrictions && summaryObj.restrictions.length > 0) {
          checkPageBreak(15);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(239, 68, 68); // Red text
          doc.text("Restrictions / Limitations:", margin, currentY);
          currentY += 5;

          doc.setFont("Helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(31, 41, 55);
          summaryObj.restrictions.forEach(restriction => {
            const restrictionLines = doc.splitTextToSize(`• ${restriction}`, printableWidth);
            restrictionLines.forEach(line => {
              checkPageBreak(5);
              doc.text(line, margin, currentY);
              currentY += 5;
            });
          });
          currentY += 2;
        }

        // Full legal text
        if (template.consent_details) {
          checkPageBreak(20);
          doc.setFont("Helvetica", "bold");
          doc.setFontSize(9.5);
          doc.setTextColor(75, 85, 99);
          doc.text("Full Legal Text & Agreements:", margin, currentY);
          currentY += 5;

          doc.setFont("Helvetica", "normal");
          doc.setFontSize(8.5);
          doc.setTextColor(55, 65, 81);
          const detailsLines = doc.splitTextToSize(template.consent_details, printableWidth);
          detailsLines.forEach(line => {
            checkPageBreak(4.5);
            doc.text(line, margin, currentY);
            currentY += 4.5;
          });
          currentY += 4;
        }
      });

      // Signature section
      checkPageBreak(45);
      currentY += 5;
      doc.setDrawColor(209, 213, 219);
      doc.line(margin, currentY, margin + printableWidth, currentY);
      currentY += 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(31, 41, 55);
      doc.text("AUTHORIZATION SIGNATURES", margin, currentY);
      currentY += 10;

      // Draw signature lines
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(107, 114, 128);

      doc.line(margin, currentY + 10, margin + 50, currentY + 10);
      doc.text("Participant / Legal Guardian Signature", margin, currentY + 14);
      doc.text(`Date: ${consentItem.consent_date || 'N/A'}`, margin, currentY + 19);

      doc.line(margin + 65, currentY + 10, margin + 115, currentY + 10);
      doc.text("Biobank Witness Signature", margin + 65, currentY + 14);
      doc.text("Date: _________________", margin + 65, currentY + 19);

      doc.line(margin + 130, currentY + 10, margin + 180, currentY + 10);
      doc.text("Authorized Representative Approval", margin + 130, currentY + 14);
      doc.text(`Date Verified: ${consentItem.submitted_date || 'N/A'}`, margin + 130, currentY + 19);

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
