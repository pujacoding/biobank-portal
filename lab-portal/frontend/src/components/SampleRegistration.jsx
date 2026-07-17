import React, { useState, useEffect, useRef } from 'react';

export default function SampleRegistration({ user, backendUrl, token, onRegistrationSuccess, setActiveTab, setPreSelectedSampleId, activeLabId, activeLabName }) {
  // Form States
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [sampleVolume, setSampleVolume] = useState('');
  const [subjectId, setSubjectId] = useState(() => 'SUBJ-' + Math.random().toString(36).substring(2, 8).toUpperCase());
  
  // Specimen Type Master States
  const [specimenTypes, setSpecimenTypes] = useState([]);
  const [selectedSpecimenIds, setSelectedSpecimenIds] = useState([]);
  const [specimenSearchQuery, setSpecimenSearchQuery] = useState('');
  const [showSpecimenDropdown, setShowSpecimenDropdown] = useState(false);
  const [customSpecimenName, setCustomSpecimenName] = useState('');

  // Consent Template States
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showFullConsentModal, setShowFullConsentModal] = useState(false);

  // Inline Consent Document upload States
  const [consentVersion, setConsentVersion] = useState('v1.0');
  const [consentDate, setConsentDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [formKey, setFormKey] = useState(0);

  const [containerType, setContainerType] = useState('Tube');
  const [containerCount, setContainerCount] = useState(1);
  const [isManualContainerCount, setIsManualContainerCount] = useState(false);

  const containerCapacities = {
    'Tube': 4,
    'Vial': 2,
    'Jar': 50,
    'Bottle': 250
  };

  useEffect(() => {
    if (!isManualContainerCount && sampleVolume) {
      const vol = parseFloat(sampleVolume);
      if (!isNaN(vol) && vol > 0) {
        const capacity = containerCapacities[containerType] || 4;
        const count = Math.ceil(vol / capacity);
        setContainerCount(count);
      }
    }
  }, [sampleVolume, containerType, isManualContainerCount]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Refs for tracking clicks outside the searchable dropdown container
  const dropdownRef = useRef(null);
  const specimenDropdownRef = useRef(null);

  // Capture current date/time to display to the user
  const todayDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Fetch active consent templates
  useEffect(() => {
    const fetchActiveTemplates = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/consent/templates`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setTemplates(data.templates || []);
        }
      } catch (err) {
        console.error("Error loading active consent templates:", err);
      }
    };
    fetchActiveTemplates();
  }, [backendUrl, token]);

  // Fetch active specimen types
  useEffect(() => {
    const fetchActiveSpecimenTypes = async () => {
      try {
        const res = await fetch(`${backendUrl}/api/specimen-types/active`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSpecimenTypes(data.specimen_types || []);
          if (data.specimen_types && data.specimen_types.length > 0) {
            const blood = data.specimen_types.find(st => st.specimen_name === 'Blood');
            if (blood) {
              setSelectedSpecimenIds([String(blood.id)]);
            } else {
              setSelectedSpecimenIds([String(data.specimen_types[0].id)]);
            }
          }
        }
      } catch (err) {
        console.error("Error loading active specimen types:", err);
      }
    };
    fetchActiveSpecimenTypes();
  }, [backendUrl, token]);

  // Click outside to close dropdown handler
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
      if (specimenDropdownRef.current && !specimenDropdownRef.current.contains(e.target)) {
        setShowSpecimenDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);



  const selectedTemplateId = selectedTemplateIds[0] || '';
  const selectedTemplate = templates.find(t => String(t.template_id) === String(selectedTemplateId));

  let parsedSummary = { purpose: '', allows: [], restrictions: [] };
  if (selectedTemplate) {
    try {
      parsedSummary = JSON.parse(selectedTemplate.consent_summary);
    } catch (e) {
      parsedSummary = { purpose: selectedTemplate.consent_summary, allows: [], restrictions: [] };
    }
  }

  const handleDownloadMockPDF = () => {
    if (selectedTemplateIds.length === 0) return;
    const selectedTemplates = templates.filter(t => selectedTemplateIds.map(String).includes(String(t.template_id)));
    if (selectedTemplates.length === 0) return;

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
      doc.setTextColor(6, 182, 212); // Brand color (Aura cyan)
      doc.text("AURA BIOBANK", margin, currentY);
      currentY += 8;

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(31, 41, 55);
      doc.text("PARTICIPANT CONSENT AGREEMENT RECORD", margin, currentY);
      currentY += 5;

      // Draw separator line
      doc.setDrawColor(229, 231, 235);
      doc.line(margin, currentY, margin + printableWidth, currentY);
      currentY += 10;

      // Metadata Card
      doc.setFillColor(243, 244, 246);
      doc.rect(margin, currentY, printableWidth, 26, 'F');
      
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(75, 85, 99);
      doc.text("SUBJECT PROVISIONAL INFO", margin + 5, currentY + 6);
      doc.text("AGREEMENT METADATA", margin + 95, currentY + 6);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(`Subject ID: ${subjectId}`, margin + 5, currentY + 12);
      doc.text(`Age / Gender: ${age || 'N/A'} / ${gender || 'N/A'}`, margin + 5, currentY + 18);

      doc.text(`Version: ${consentVersion || 'v1.0'}`, margin + 95, currentY + 12);
      doc.text(`Date: ${consentDate || new Date().toLocaleDateString('en-CA')}`, margin + 95, currentY + 18);
      currentY += 34;

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
      doc.text(`Date: ${consentDate || new Date().toLocaleDateString('en-CA')}`, margin, currentY + 19);

      doc.line(margin + 65, currentY + 10, margin + 115, currentY + 10);
      doc.text("Biobank Witness Signature", margin + 65, currentY + 14);
      doc.text("Date: _________________", margin + 65, currentY + 19);

      doc.line(margin + 130, currentY + 10, margin + 180, currentY + 10);
      doc.text("Authorized Representative Approval", margin + 130, currentY + 14);
      doc.text("Date Verified: _________________", margin + 130, currentY + 19);

      // Save PDF
      const codes = selectedTemplates.map(t => t.consent_code).join('_');
      doc.save(`Consent_Template_${subjectId}_${codes}.pdf`);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Error generating PDF: " + err.message);
    }
  };

  const handleActionSubmit = async () => {
    setError('');
    setSuccessMsg('');

    // Field checks
    if (!gender || !age || selectedSpecimenIds.length === 0 || !sampleVolume) {
      setError("Please complete all required subject and specimen characteristics.");
      return;
    }

    // Determine if custom specimen is required
    const hasOther = selectedSpecimenIds.some(id => {
      const st = specimenTypes.find(temp => String(temp.id) === String(id));
      return st && (st.specimen_code === 'OTH' || st.specimen_name === 'Other');
    });
    
    if (hasOther && (!customSpecimenName || customSpecimenName.trim() === '' || customSpecimenName.trim() === 'Other')) {
      setError("Please provide a custom specimen description for 'Other' type.");
      return;
    }
    
    // Validate consent template selection
    if (selectedTemplateIds.length === 0) {
      setError("Consent Type must be selected before sample submission.");
      return;
    }

    setLoading(true);

    try {
      const registeredSamples = [];
      for (const specId of selectedSpecimenIds) {
        const selectedST = specimenTypes.find(st => String(st.id) === String(specId));
        const isOther = selectedST && (selectedST.specimen_code === 'OTH' || selectedST.specimen_name === 'Other');
        const finalSpecimenType = isOther ? customSpecimenName.trim() : (selectedST ? selectedST.specimen_name : '');

        const sampleResponse = await fetch(`${backendUrl}/api/samples/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(activeLabId ? { 'x-active-lab-id': activeLabId } : {})
          },
          body: JSON.stringify({
            subject_id: subjectId,
            gender,
            age,
            specimen_type_id: parseInt(specId, 10),
            specimen_type: finalSpecimenType,
            sample_volume: sampleVolume,
            container_type: containerType,
            container_count: containerCount,
            consent_template_id: selectedTemplateIds[0] || '',
            consent_template_ids: selectedTemplateIds
          })
        });

        const sampleData = await sampleResponse.json();

        if (!sampleResponse.ok) {
          throw new Error(sampleData.error || 'Failed to register sample');
        }
        registeredSamples.push(sampleData.sample);
      }

      const count = registeredSamples.length;
      setSuccessMsg(`Ingestion success! Registered ${count} sample(s) successfully. Redirecting to Consent tab...`);

      const primarySample = registeredSamples[0];

      if (onRegistrationSuccess) {
        onRegistrationSuccess();
      }
      if (setPreSelectedSampleId && primarySample) {
        setPreSelectedSampleId(primarySample.id);
      }
      if (setActiveTab) {
        setActiveTab('consent');
      }

      // Reset form
      setGender('');
      setAge('');
      setSelectedTemplateIds([]);
      setSelectedSpecimenIds([]);
      setSearchQuery('');
      setSampleVolume('');
      setSubjectId('SUBJ-' + Math.random().toString(36).substring(2, 8).toUpperCase());
      setContainerType('Tube');
      setContainerCount(1);
      setIsManualContainerCount(false);
      setCustomSpecimenName('');
      setSpecimenSearchQuery('');
      if (specimenTypes && specimenTypes.length > 0) {
        const blood = specimenTypes.find(st => st.specimen_name === 'Blood');
        if (blood) {
          setSelectedSpecimenIds([String(blood.id)]);
        } else {
          setSelectedSpecimenIds([String(specimenTypes[0].id)]);
        }
      }
      setFormKey(prev => prev + 1);

      if (setPreSelectedSampleId && primarySample) {
        setPreSelectedSampleId(primarySample.id);
      }

      // Trigger cache refresh and await completion
      if (onRegistrationSuccess) {
        await onRegistrationSuccess();
      }

      // Stays on the same page for 1.5 seconds so user sees details and status, then redirects
      setTimeout(() => {
        setActiveTab('consent');
      }, 1500);

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter(t => 
    t.consent_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.consent_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'left' }}>
      {/* Back Button */}
      <button 
        className="btn btn-secondary" 
        onClick={() => setActiveTab('dashboard')} 
        style={{ marginBottom: '16px', padding: '6px 12px', fontSize: '12px' }}
      >
        ← Back to Dashboard
      </button>

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '700' }}>Register Biospecimen</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Ingest new biological samples into the biobank repository. Required parameters are marked with an asterisk (*).
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
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            <strong>Active Lab Required:</strong> You must select an Active Working Lab from the top header dropdown before registering new biological specimens.
          </span>
        </div>
      )}

      {loading && (
        <div style={{
          backgroundColor: 'rgba(6, 182, 212, 0.08)',
          border: '1px solid rgba(6, 182, 212, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-cyan)',
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            display: 'inline-block',
            width: '16px',
            height: '16px',
            border: '2px solid var(--border-color)',
            borderTopColor: 'var(--accent-cyan)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }} />
          Saving biological specimen details and committing registration... Please wait.
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
          fontWeight: '600',
          marginBottom: '20px'
        }}>
          ✕ {error}
        </div>
      )}

      {successMsg && (
        <div style={{
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          borderRadius: 'var(--border-radius-sm)',
          padding: '12px 16px',
          color: 'var(--accent-success)',
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '20px'
        }}>
          ✓ {successMsg}
        </div>
      )}

      <form key={formKey} onSubmit={(e) => e.preventDefault()} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {!activeLabId && (
          <div style={{
            backgroundColor: 'rgba(6, 182, 212, 0.08)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: 'var(--border-radius-sm)',
            padding: '16px',
            color: 'var(--text-primary)',
            fontSize: '13px',
            fontWeight: '600',
            textAlign: 'center',
            marginBottom: '10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(6, 182, 212, 0.1)'
          }}>
            <span style={{ fontSize: '15px', color: 'var(--accent-cyan)' }}>⚠️ Lab Location Selection Required</span>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              Please select an active laboratory from the <strong>Active Lab</strong> selector in the top-right header to enable sample registration.
            </span>
            <button
              type="button"
              onClick={() => {
                const selector = document.getElementById('active-lab-selector');
                if (selector) {
                  selector.focus();
                  selector.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }}
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px', marginTop: '4px' }}
            >
              Focus Lab Selector 🔍
            </button>
          </div>
        )}

        <fieldset disabled={!activeLabId} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Section A: Subject Information */}
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <legend style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section A: Subject Information
          </legend>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Subject ID (Auto Generated)</label>
              <input
                type="text"
                className="form-control"
                disabled
                value={subjectId}
                style={{ color: 'var(--text-primary)', fontWeight: 'bold' }}
              />
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="subject-gender">Gender *</label>
              <select
                id="subject-gender"
                className="form-control"
                required
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select Gender</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
              <div className="invalid-feedback">Gender selection is required.</div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="subject-age">Age *</label>
              <input
                type="number"
                id="subject-age"
                className="form-control"
                required
                min={0}
                max={120}
                placeholder="Enter subject age"
                value={age}
                onChange={(e) => setAge(e.target.value)}
              />
              <div className="invalid-feedback">Valid age between 0 and 120 is required.</div>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label htmlFor="subject-consent" style={{ fontWeight: '700' }}>Consent Type *</label>
            
            {selectedTemplateIds.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', marginTop: '4px' }}>
                {selectedTemplateIds.map(id => {
                  const t = templates.find(temp => String(temp.template_id) === String(id));
                  if (!t) return null;
                  return (
                    <span 
                      key={id} 
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        backgroundColor: 'rgba(6, 182, 212, 0.15)',
                        border: '1px solid rgba(6, 182, 212, 0.3)',
                        borderRadius: '16px',
                        fontSize: '11px',
                        color: 'var(--accent-cyan)',
                        fontWeight: '600'
                      }}
                    >
                      {t.consent_name} ({t.consent_code})
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTemplateIds(prev => prev.filter(item => item !== String(id)));
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent-cyan)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '14px',
                          display: 'inline-flex',
                          alignItems: 'center'
                        }}
                      >
                        &times;
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            {/* Custom Searchable Dropdown Selector Container */}
            <div 
              ref={dropdownRef} 
              className="consent-dropdown-container" 
              style={{ position: 'relative', marginTop: '6px' }}
            >
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder={selectedTemplateIds.length > 0 ? "Search/select more consents..." : "[ Select Consent Type(s) ▼ ]"}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    style={{ cursor: 'text', paddingRight: '28px' }}
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                      }}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-tertiary)',
                        fontSize: '16px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    >
                      &times;
                    </button>
                  )}

                  {showDropdown && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      zIndex: 1000,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--border-radius-sm)',
                      maxHeight: '220px',
                      overflowY: 'auto',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                      marginTop: '4px'
                    }}>
                      {filteredTemplates.length === 0 ? (
                        <div style={{ padding: '10px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                          No templates found
                        </div>
                      ) : (
                        filteredTemplates.map(t => {
                          const isSelected = selectedTemplateIds.includes(String(t.template_id));
                          return (
                            <div
                              key={t.template_id}
                              onClick={() => {
                                const strId = String(t.template_id);
                                setSelectedTemplateIds(prev => 
                                  prev.includes(strId)
                                    ? prev.filter(id => id !== strId)
                                    : [...prev, strId]
                                );
                                setSearchQuery('');
                                setConsentVersion(t.version);
                              }}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                borderBottom: '1px solid rgba(255,255,255,0.03)',
                                backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                                color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent';
                              }}
                            >
                              <span>{t.consent_name} ({t.consent_code})</span>
                              {isSelected && (
                                <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>✓</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                
                {/* Info Icon (ⓘ) with Hover Tooltip */}
                {selectedTemplate && (
                  <div 
                    style={{ position: 'relative' }}
                    onMouseEnter={() => setShowTooltip(true)}
                    onMouseLeave={() => setShowTooltip(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setShowTooltip(!showTooltip)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-cyan)',
                        fontSize: '18px',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      ⓘ
                    </button>
                    {showTooltip && (
                      <div style={{
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        zIndex: 1100,
                        width: '320px',
                        backgroundColor: 'rgba(20, 20, 25, 0.98)',
                        backdropFilter: 'blur(8px)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--border-radius-sm)',
                        padding: '16px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        marginBottom: '10px',
                        color: 'var(--text-primary)'
                      }}>
                        <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', fontWeight: '700', color: 'var(--accent-cyan)' }}>{selectedTemplate.consent_name}</h4>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', lineHeight: '1.4' }}>
                          <strong>Purpose:</strong><br/>{parsedSummary.purpose}
                        </p>
                        {parsedSummary.allows && parsedSummary.allows.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <strong>Allows:</strong>
                            <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '12px' }}>
                              {parsedSummary.allows.map((allow, i) => (
                                <li key={i} style={{ marginBottom: '2px' }}>{allow}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {parsedSummary.restrictions && parsedSummary.restrictions.length > 0 && (
                          <div style={{ marginBottom: '10px' }}>
                            <strong>Restrictions:</strong>
                            <ul style={{ margin: '4px 0', paddingLeft: '16px', fontSize: '12px' }}>
                              {parsedSummary.restrictions.map((rest, i) => (
                                <li key={i} style={{ marginBottom: '2px', color: 'var(--accent-error)' }}>{rest}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '6px', display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-tertiary)' }}>
                          <span>Version: {selectedTemplate.version}</span>
                          <span>Effective: {selectedTemplate.effective_date}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* View Full Consent Button */}
                {selectedTemplate && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setShowFullConsentModal(true)}
                    style={{ padding: '8px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}
                  >
                    View Full Consent
                  </button>
                )}
              </div>
            </div>
          </div>
        </fieldset>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-color)' }} />

        {/* Section B: Specimen Information */}
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <legend style={{ fontSize: '15px', fontWeight: '700', color: 'var(--accent-cyan)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section B: Specimen Information
          </legend>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0, position: 'relative' }} ref={specimenDropdownRef}>
              <label htmlFor="specimen-type-select" style={{ fontWeight: '700' }}>Specimen Type *</label>
              
              {selectedSpecimenIds.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px', marginTop: '4px' }}>
                  {selectedSpecimenIds.map(id => {
                    const st = specimenTypes.find(temp => String(temp.id) === String(id));
                    if (!st) return null;
                    return (
                      <span 
                        key={id} 
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          backgroundColor: 'rgba(6, 182, 212, 0.15)',
                          border: '1px solid rgba(6, 182, 212, 0.3)',
                          borderRadius: '16px',
                          fontSize: '11px',
                          color: 'var(--accent-cyan)',
                          fontWeight: '600'
                        }}
                      >
                        {st.specimen_name}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSpecimenIds(prev => prev.filter(item => item !== String(id)));
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--accent-cyan)',
                            cursor: 'pointer',
                            padding: 0,
                            fontSize: '14px',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}
                        >
                          &times;
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <input
                type="text"
                id="specimen-type-select"
                className="form-control"
                placeholder={selectedSpecimenIds.length > 0 ? "Search/select more specimen types..." : "[ Select Specimen Type(s) ▼ ]"}
                value={specimenSearchQuery}
                onChange={(e) => {
                  setSpecimenSearchQuery(e.target.value);
                  setShowSpecimenDropdown(true);
                }}
                onFocus={() => {
                  setShowSpecimenDropdown(true);
                }}
              />
              {showSpecimenDropdown && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius-sm)',
                  maxHeight: '220px',
                  overflowY: 'auto',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  marginTop: '4px'
                }}>
                  {(() => {
                    const filtered = specimenTypes.filter(st => 
                      st.specimen_name.toLowerCase().includes(specimenSearchQuery.toLowerCase())
                    );
                    const grouped = {};
                    filtered.forEach(st => {
                      if (!grouped[st.category]) grouped[st.category] = [];
                      grouped[st.category].push(st);
                    });

                    if (filtered.length === 0) {
                      return (
                        <div style={{ padding: '10px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                          No matching specimen types found
                        </div>
                      );
                    }

                    return Object.keys(grouped).map(cat => (
                      <div key={cat}>
                        <div style={{
                          padding: '6px 12px',
                          fontSize: '10px',
                          fontWeight: '700',
                          color: 'var(--accent-cyan)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          backgroundColor: 'rgba(255,255,255,0.02)',
                          borderBottom: '1px solid rgba(255,255,255,0.02)'
                        }}>
                          {cat}
                        </div>
                        {grouped[cat].map(st => {
                          const isSelected = selectedSpecimenIds.includes(String(st.id));
                          return (
                            <div
                              key={st.id}
                              onClick={() => {
                                const strId = String(st.id);
                                setSelectedSpecimenIds(prev => 
                                  prev.includes(strId)
                                    ? prev.filter(id => id !== strId)
                                    : [...prev, strId]
                                );
                                setSpecimenSearchQuery('');
                              }}
                              style={{
                                padding: '8px 16px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                backgroundColor: isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                                color: isSelected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.1)';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = isSelected ? 'rgba(6, 182, 212, 0.15)' : 'transparent';
                              }}
                            >
                              <span>{st.specimen_name}</span>
                              {isSelected && <span style={{ fontWeight: 'bold' }}>✓</span>}
                            </div>
                          );
                        })}
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="specimen-volume">Sample Volume (mL) *</label>
              <input
                type="number"
                id="specimen-volume"
                className="form-control"
                required
                step="0.1"
                min="0.1"
                placeholder="e.g. 5.0"
                value={sampleVolume}
                onChange={(e) => setSampleVolume(e.target.value)}
              />
              <div className="invalid-feedback">Volume greater than 0 is required.</div>
            </div>
          </div>

          {(() => {
            const hasOther = selectedSpecimenIds.some(id => {
              const st = specimenTypes.find(temp => String(temp.id) === String(id));
              return st && (st.specimen_code === 'OTH' || st.specimen_name === 'Other');
            });
            if (hasOther) {
              return (
                <div className="form-group" style={{ marginTop: '4px', marginBottom: 0 }}>
                  <label htmlFor="custom-specimen-desc">Custom Specimen Description *</label>
                  <input
                    type="text"
                    id="custom-specimen-desc"
                    className="form-control"
                    placeholder="e.g. Hair follicle, Nail clippings, Tears"
                    required
                    value={customSpecimenName}
                    onChange={(e) => setCustomSpecimenName(e.target.value)}
                  />
                </div>
              );
            }
            return null;
          })()}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="container-type">Container Type *</label>
              <select
                id="container-type"
                className="form-control"
                required
                value={containerType}
                onChange={(e) => {
                  setContainerType(e.target.value);
                  setIsManualContainerCount(false);
                }}
              >
                <option value="Tube">Tube (Capacity: 4 mL)</option>
                <option value="Vial">Vial (Capacity: 2 mL)</option>
                <option value="Jar">Jar (Capacity: 50 mL)</option>
                <option value="Bottle">Bottle (Capacity: 250 mL)</option>
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="container-count">Container Count *</label>
              <input
                type="number"
                id="container-count"
                className="form-control"
                required
                min="1"
                value={containerCount}
                onChange={(e) => {
                  setContainerCount(parseInt(e.target.value, 10) || 1);
                  setIsManualContainerCount(true);
                }}
              />
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px', display: 'block' }}>
                {isManualContainerCount ? '✏️ Manually adjusted' : '⚡ Auto-calculated based on volume'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px', marginTop: '18px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Collection Date (Auto Captured)</label>
              <input
                type="text"
                className="form-control"
                disabled
                value={todayDate}
                style={{ color: 'var(--text-tertiary)' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Collection Time (Auto Captured)</label>
              <input
                type="text"
                className="form-control"
                disabled
                value="Current Local Time"
                style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}
              />
            </div>
          </div>
        </fieldset>



        {/* Section C: Collection Information */}
        <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <legend style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-tertiary)', marginBottom: '14px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Section C: Collection Information (Auto Fetched)
          </legend>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Ingesting Laboratory</label>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>
                {activeLabName || "Not Selected"}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Lab Location</label>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {user.lab_location}
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Collector Profile</label>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {user.name} ({user.role})
              </div>
            </div>
          </div>
        </fieldset>

        <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ flex: 1, padding: '14px', background: !activeLabId ? 'var(--text-tertiary)' : undefined, cursor: !activeLabId ? 'not-allowed' : 'pointer' }} 
            disabled={loading || !activeLabId}
            onClick={handleActionSubmit}
          >
            Save Sample
          </button>
        </div>
        </fieldset>
      </form>

      {/* View Full Consent Modal */}
      {showFullConsentModal && selectedTemplate && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '20px'
        }}>
          <div className="glass-card" style={{
            width: '100%',
            maxWidth: '650px',
            maxHeight: '90vh',
            overflowY: 'auto',
            background: 'var(--bg-primary)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius-md)',
            padding: '28px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: 'var(--text-primary)' }}>
                  {selectedTemplate.consent_name}
                </h2>
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Code: <strong>{selectedTemplate.consent_code}</strong> &bull; Version: <strong>{selectedTemplate.version}</strong> &bull; Effective: <strong>{selectedTemplate.effective_date}</strong>
                </div>
              </div>
              <button 
                onClick={() => setShowFullConsentModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '22px',
                  cursor: 'pointer',
                  padding: 0,
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            <div style={{
              background: 'rgba(255, 255, 255, 0.01)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius-sm)',
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.6',
              color: 'var(--text-secondary)',
              maxHeight: '350px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              textAlign: 'left'
            }}>
              {selectedTemplate.consent_details}
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowFullConsentModal(false)}
              >
                Close View
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={handleDownloadMockPDF}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '16px', height: '16px' }}>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
