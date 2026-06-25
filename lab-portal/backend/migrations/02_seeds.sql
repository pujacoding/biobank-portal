-- AURA BIOBANK PORTAL: POSTGRESQL DATABASE SEEDS

-- 1. Seed Laboratories
INSERT INTO labs (id, name, location_address, status) VALUES
(1, 'Metropolis Lab Boston', '75 Binney St, Boston, MA 02142', 'Active'),
(2, 'ABC Diagnostics', '100 Broadway, Cambridge, MA 02139', 'Active'),
(3, 'XYZ Research Center', '500 Tech Sq, Cambridge, MA 02139', 'Active')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, location_address = EXCLUDED.location_address;

-- Reset identity sequence for labs
SELECT setval(pg_get_serial_sequence('labs', 'id'), COALESCE(MAX(id), 1)) FROM labs;

-- 2. Seed System Roles
INSERT INTO roles (role_id, role_name, description) VALUES
(1, 'Super Admin', 'Full System Access'),
(2, 'Lab Admin', 'Manage laboratory operations, users, and shipments'),
(3, 'Lab Technician', 'Process specimens, verify consent, and generate/print labels'),
(4, 'Collection Staff', 'Register specimens and track their own collections'),
(5, 'Courier Staff', 'Dispatch and transport specimens'),
(6, 'Biobank Staff', 'Receive, QC, store, and manage specimens'),
(7, 'Research Staff', 'Query approved inventory and build research exports')
ON CONFLICT (role_id) DO UPDATE SET role_name = EXCLUDED.role_name, description = EXCLUDED.description;

-- Reset identity sequence for roles
SELECT setval(pg_get_serial_sequence('roles', 'role_id'), COALESCE(MAX(role_id), 1)) FROM roles;

-- 3. Seed Lab Locations
INSERT INTO locations (location_id, lab_id, location_name, status) VALUES
(1, 1, 'Collection Center A', 'Active'),
(2, 1, 'Collection Center B', 'Active'),
(3, 2, 'Collection Center B', 'Active'),
(4, 2, 'Central Biobank', 'Active'),
(5, 3, 'Central Biobank', 'Active')
ON CONFLICT (location_id) DO UPDATE SET location_name = EXCLUDED.location_name;

-- Reset identity sequence for locations
SELECT setval(pg_get_serial_sequence('locations', 'location_id'), COALESCE(MAX(location_id), 1)) FROM locations;

-- 4. Seed Permissions
INSERT INTO permissions (permission_name, module_name) VALUES
-- Sample Management
('Create Sample', 'Sample Management'),
('Edit Sample', 'Sample Management'),
('View Sample', 'Sample Management'),
('Delete Sample', 'Sample Management'),
-- Consent Management
('Create Consent', 'Consent Management'),
('Verify Consent', 'Consent Management'),
('Reject Consent', 'Consent Management'),
('View Consent', 'Consent Management'),
-- QR Management
('Generate QR', 'QR Management'),
('Print QR', 'QR Management'),
('Reprint QR', 'QR Management'),
-- Shipment Management
('Create Shipment', 'Shipment Management'),
('Edit Shipment', 'Shipment Management'),
('Dispatch Shipment', 'Shipment Management'),
('Receive Shipment', 'Shipment Management'),
-- User Management
('Create User', 'User Management'),
('Edit User', 'User Management'),
('Activate User', 'User Management'),
('Deactivate User', 'User Management'),
('View Users', 'User Management'),
-- Reports
('View Reports', 'Reports'),
('Export Reports', 'Reports'),
-- Administration
('View Audit Logs', 'Administration'),
('Manage Roles', 'Administration'),
('Manage Permissions', 'Administration'),
-- Biobank Staff Operations
('Receive Samples', 'Biobank Management'),
('QC Processing', 'Biobank Management'),
('Storage Assignment', 'Biobank Management'),
('Inventory Management', 'Biobank Management'),
-- Research Staff Operations
('View Approved Inventory', 'Research Management')
ON CONFLICT (permission_name) DO NOTHING;

-- 5. Seed Role Permissions Mapping
-- Lab Admin (role_id = 2)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, permission_id FROM permissions WHERE permission_name IN (
  'Create User', 'Edit User', 'Activate User', 'Deactivate User', 'View Users',
  'Create Sample', 'Edit Sample', 'View Sample', 'Delete Sample',
  'Create Consent', 'Verify Consent', 'Reject Consent', 'View Consent',
  'Generate QR', 'Print QR', 'Reprint QR',
  'Create Shipment', 'Edit Shipment', 'Dispatch Shipment', 'Receive Shipment',
  'View Reports', 'Export Reports', 'View Audit Logs'
) ON CONFLICT DO NOTHING;

-- Lab Technician (role_id = 3)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, permission_id FROM permissions WHERE permission_name IN (
  'Create Sample', 'Edit Sample', 'View Sample', 'Generate QR', 'Print QR'
) ON CONFLICT DO NOTHING;

-- Collection Staff (role_id = 4)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, permission_id FROM permissions WHERE permission_name IN (
  'Create Sample', 'View Sample', 'Create Consent'
) ON CONFLICT DO NOTHING;

-- Biobank Staff (role_id = 6)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 6, permission_id FROM permissions WHERE permission_name IN (
  'Receive Shipment', 'Receive Samples', 'QC Processing', 'Storage Assignment', 'Inventory Management'
) ON CONFLICT DO NOTHING;

-- Research Staff (role_id = 7)
INSERT INTO role_permissions (role_id, permission_id)
SELECT 7, permission_id FROM permissions WHERE permission_name IN (
  'View Approved Inventory', 'View Reports'
) ON CONFLICT DO NOTHING;

-- 6. Seed Operators and Administrators
INSERT INTO users (id, name, full_name, phone_number, email, employee_id, designation, role_id, lab_id, status, password, password_plain, created_by) VALUES
(1, 'Super Admin', 'Super Admin', '5550000000', 'superadmin@aura.com', 'EMP-001', 'Chief Administrator', 1, NULL, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System'),
(2, 'Puja Pramanik', 'Puja Pramanik', '7595916852', 'pujapramanik12451@gmail.com', 'EMP-002', 'Lead Administrator', 1, NULL, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System'),
(3, 'Admin Alice', 'Admin Alice', '5551112222', 'admin@metropolis.com', 'EMP-003', 'Lab Administrator', 2, 1, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System'),
(4, 'Tech Timmy', 'Tech Timmy', '5553334444', 'tech@metropolis.com', 'EMP-004', 'Lab Technician', 3, 1, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System'),
(5, 'Collector Colin', 'Collector Colin', '5555556666', 'collector@metropolis.com', 'EMP-005', 'Collection Staff', 4, 1, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System'),
(6, 'Puja Staff', 'Puja Staff', '7595916850', 'puja@gmail.com', 'EMP-006', 'Collection Staff', 4, 1, 'Active', '$2b$10$wGc4SQ8Uw.FTIDc2LQp04e4PK87XYDb7yAdkdmNd0VmLKUOR59Gsm', 'lims2026', 'System')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone_number = EXCLUDED.phone_number, password = EXCLUDED.password, password_plain = EXCLUDED.password_plain;

-- Reset identity sequence for users
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE(MAX(id), 1)) FROM users;

-- 7. Seed User Location Accessibility
DELETE FROM user_locations;
INSERT INTO user_locations (user_id, location_id) VALUES
(1, 1), (1, 2), (1, 3), (1, 4), (1, 5),
(2, 1), (2, 2), (2, 3), (2, 4), (2, 5),
(3, 1), (3, 2),
(4, 1), (4, 2),
(5, 1), (5, 2),
(6, 1), (6, 2);

-- 8. Seed Consent Templates
INSERT INTO consent_templates (template_id, consent_name, consent_code, consent_summary, consent_details, version, effective_date, status) VALUES
(1, 'General Biobank Consent', 'GBC', '{"purpose": "Authorizes storage of biological samples in the AURA Biobank.", "allows": ["Sample storage", "Future approved research use", "De-identified data usage"], "restrictions": ["Personal identity will remain protected."]}', 'This document establishes consent for the collection and storage of biological materials (specimens) and associated health data in the AURA Biobank. The biospecimens will be used for future biomedical research aiming to understand health and disease. By signing this document, the participant acknowledges that participation is voluntary, samples will be coded to protect privacy, and they will receive no direct financial benefits. The samples may be stored indefinitely.', 'v1.0', '2026-06-02', 'Active'),
(2, 'Future Research Consent', 'FRC', '{"purpose": "Allows samples to be used in future unspecified biomedical research projects.", "allows": ["Unspecified future studies", "Sharing with external researchers", "Secondary analysis"], "restrictions": ["Subject to IRB approval."]}', 'This consent authorizes the biobank to distribute collected biospecimens and de-identified clinical data to qualified research investigators worldwide. These investigations may include genetic, biochemical, or immunological studies. The biobank ensures that all sharing is governed by strict material transfer agreements, and all studies are subject to oversight and approval by an Institutional Review Board (IRB) or equivalent ethical review body.', 'v1.0', '2026-06-02', 'Active'),
(3, 'Re-contact Consent', 'RCC', '{"purpose": "Permission to contact the participant for follow-up studies or clinical updates.", "allows": ["Re-contacting via phone/email", "Sharing genetic findings of high clinical relevance"], "restrictions": ["No obligation to participate in future studies."]}', 'By opting into the re-contact consent, you allow Aura Biobank personnel or authorized investigators to contact you in the future. Future contact may be initiated to collect follow-up health information, request updates, or invite you to participate in specific clinical trials or studies related to your sample. Additionally, if research reveals actionable genetic findings of high medical significance to your health, this consent enables the biobank to offer this information back to you.', 'v1.0', '2026-06-02', 'Active'),
(4, 'Fluid Processing & Aliquoting Authorization', 'FPA', '{"purpose": "Authorizes processing and aliquoting of fluid biospecimens (e.g., blood, plasma).", "allows": ["Centrifugation", "Aliquot separation", "Sub-zero storage"], "restrictions": ["Minimal processing deviation."]}', 'This authorization covers the technical processing, centrifugation, fraction separation (serum, plasma, buffy coat), aliquoting, and cryopreservation of liquid biospecimens (including whole blood, saliva, and urine). The processing is conducted under ISO standard operating procedures to maintain sample integrity and stability. Aliquoting allows multiple future studies to utilize the sample without repeated freeze-thaw cycles.', 'v1.0', '2026-06-02', 'Active'),
(5, 'Proteomic & Biomarker Analysis Consent', 'PBA', '{"purpose": "Allows proteomic profiling and discovery of novel biological markers.", "allows": ["Mass spectrometry", "Protein expression mapping", "Target marker validation"], "restrictions": ["No genetic sequencing permitted under this specific scope."]}', 'This consent authorizes research focusing on the analysis of proteins, peptides, and other small-molecule biomarkers within the submitted biospecimens. Techniques applied may include mass spectrometry, enzyme-linked immunosorbent assays (ELISA), and high-throughput proteomic arrays. This research aims to discover diagnostic or prognostic indicators of disease. This consent is restricted to protein-level analyses and does not cover whole-genome or exome DNA sequencing.', 'v1.0', '2026-06-02', 'Active'),
(6, 'Long-Term Cryopreservation Authorization', 'LTC', '{"purpose": "Allows long-term storage of biological samples in cryogenic freezers.", "allows": ["Long-term preservation", "Future retrieval for approved studies"], "restrictions": ["Research use only."]}', 'This authorization enables the biobank to store the provided biological specimens in vapor-phase liquid nitrogen or ultra-low temperature mechanical freezers (-80°C or colder) for long-term preservation. The storage is planned for a standard duration of 25 years or until the sample is fully depleted in approved research. This long-term cryopreservation is strictly reserved for scientific and medical research purposes.', 'v1.0', '2026-06-02', 'Active')
ON CONFLICT (template_id) DO UPDATE SET consent_name = EXCLUDED.consent_name, consent_summary = EXCLUDED.consent_summary, consent_details = EXCLUDED.consent_details;

-- Reset identity sequence for consent templates
SELECT setval(pg_get_serial_sequence('consent_templates', 'template_id'), COALESCE(MAX(template_id), 1)) FROM consent_templates;

-- 9. Seed Specimen Types
DELETE FROM specimen_types;
INSERT INTO specimen_types (id, specimen_code, specimen_name, category, status) VALUES
(1, 'BLD', 'Blood', 'Blood', 'Active'),
(2, 'SRM', 'Serum', 'Blood', 'Active'),
(3, 'PLSM', 'Plasma', 'Blood', 'Active'),
(4, 'BFC', 'Buffy Coat', 'Blood', 'Active'),
(5, 'PBMC', 'PBMC', 'Blood', 'Active'),
(6, 'URN', 'Urine', 'Urine', 'Active'),
(7, 'STL', 'Stool', 'Stool', 'Active'),
(8, 'SLV', 'Saliva', 'Saliva', 'Active'),
(9, 'BCS', 'Buccal Swab', 'Swab', 'Active'),
(10, 'SPT', 'Sputum', 'Swab', 'Active'),
(11, 'NPS', 'Nasopharyngeal Swab', 'Swab', 'Active'),
(12, 'TSS', 'Tissue', 'Tissue', 'Active'),
(13, 'FFPE', 'FFPE Tissue', 'Tissue', 'Active'),
(14, 'FRT', 'Fresh Tissue', 'Tissue', 'Active'),
(15, 'FZT', 'Frozen Tissue', 'Tissue', 'Active'),
(16, 'BMA', 'Bone Marrow Aspirate', 'Fluid', 'Active'),
(17, 'CSF', 'CSF', 'Fluid', 'Active'),
(18, 'PLF', 'Pleural Fluid', 'Fluid', 'Active'),
(19, 'ASF', 'Ascitic Fluid', 'Fluid', 'Active'),
(20, 'SYF', 'Synovial Fluid', 'Fluid', 'Active'),
(21, 'SMN', 'Semen', 'Fluid', 'Active'),
(22, 'DNA', 'DNA', 'Molecular', 'Active'),
(23, 'RNA', 'RNA', 'Molecular', 'Active'),
(24, 'CLL', 'Cell Line', 'Cellular', 'Active'),
(25, 'SCP', 'Stem Cell Product', 'Cellular', 'Active'),
(26, 'EXO', 'Exosome', 'Molecular', 'Active'),
(27, 'OTH', 'Other', 'Other', 'Active')
ON CONFLICT (id) DO UPDATE SET 
  specimen_code = EXCLUDED.specimen_code, 
  specimen_name = EXCLUDED.specimen_name, 
  category = EXCLUDED.category, 
  status = EXCLUDED.status;

-- Reset identity sequence for specimen types
SELECT setval(pg_get_serial_sequence('specimen_types', 'id'), COALESCE(MAX(id), 1)) FROM specimen_types;

-- 10. Seed Draft Consent
INSERT INTO consent (
  id, subject_id, consent_version, consent_date, document_url, verification_status, submitted_by, submitted_date, consent_type
) VALUES (
  'CNS-DRAFT-001', 'SUBJ-HK08PI', 'v1.0', '2026-06-24', '/uploads/consent/cns-draft-001_consent.pdf', 'Draft', 'Puja Staff', '2026-06-24', 'General Biobank Consent'
) ON CONFLICT (id) DO NOTHING;

-- 11. Seed Sample AURA-SMP-2026-000013 for E2E tests (linked to Draft Consent)
INSERT INTO samples (
  id, subject_id, gender, age, specimen_type, specimen_type_id, sample_volume, container_type, container_count,
  collection_date, collection_time, collection_datetime, lab_id, collector_id,
  consent_id, consent_status, barcode_status, status, consent_version, consent_template_id, consent_template_ids
) VALUES (
  'AURA-SMP-2026-000013', 'SUBJ-HK08PI', 'Female', 32, 'Whole Blood', 1, 5.0, 'Tube', 1,
  '2026-06-24', '10:00', '2026-06-24 10:00:00', 1, 6,
  'CNS-DRAFT-001', 'Draft', 'Unassigned', 'Collected', 'v1.0', 1, '[1]'
) ON CONFLICT (id) DO NOTHING;
