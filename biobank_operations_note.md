# Operational Overview: AURA Biomedical Bank & LIMS Portal

This report outlines the core biological banking operations, LIMS software capabilities, and compliance workflows of the AURA Biomedical Bank. It is structured for executive presentation.

---

## 1. Participant Enrolment & Consent Authorization

The biobank workflow begins at the **Donor Registry**. New participants must be authorized, clinically diagnosed, and assigned a strict consent profile before any biological specimens can be processed or stored.

### Core Functions:
*   **De-identification / Pseudonymization**: Every participant is assigned a unique, de-identified donor code (e.g., `SUBJ-9942-F`) to protect patient privacy (HIPAA compliance).
*   **Primary Clinical Diagnosis**: Diagnostic categorization (e.g., `Healthy Control`, `Type 2 Diabetes`, `Breast Cancer`) is assigned on intake to facilitate researcher searches.
*   **Granular Consent Boundaries**: Initial consent parameters are defined via three explicit toggles:
    *   **Academic**: Consent for non-profit and educational laboratory assays.
    *   **Genomic**: Consent for high-throughput DNA/RNA sequencing.
    *   **Commercial**: Consent for pharmaceutical drug discovery collaboration.

### System Screenshot (Donor Registry & Enrolment Panel):
![Donor Registry & Enrolment Panel](/Users/pujapramanik/.gemini/antigravity/brain/8c184201-b8ba-4089-a713-e3bcf2b56190/media__1779803369702.png)

---

## 2. Cryogenic Cold-Chain Storage & Active Unit Filtering

Biological specimens (aliquots) require precise temperature control to prevent structural and molecular degradation. The AURA storage system is divided into active cryogenic zones based on specimen type.

### Freezer Storage Architecture:
1.  **ULT-03 (Ultra-Low Temperature Freezer)**:
    *   **Target Temperature**: **-80.4°C**
    *   **Allowed Specimen Types**: **Blood** and **Serum**
    *   **Rationale**: Protects fluid-based cellular structures and protein stability from crystallization damage.
2.  **LN2-01 (Liquid Nitrogen Cryo-Tank)**:
    *   **Target Temperature**: **-196.2°C** (Vapor Phase)
    *   **Allowed Specimen Types**: **DNA** and **Tissue**
    *   **Rationale**: Extreme cold completely halts molecular activity, preventing DNA shearing and maintaining tissue structure.

### Smart LIMS Restrictions:
*   **Automatic Grid Filtering**: The LIMS grid dynamically filters well slots to show only specimens matching the active storage unit (e.g., hiding DNA samples when viewing the ULT-03 blood freezer).
*   **Deposition Type Locking**: When an operator clicks an empty well slot to deposit a specimen, the LIMS locks the specimen type selector to match the active unit's temperature profile, preventing storage errors.
*   **Dynamic Spatial Addressing**: Grid slots are addressed using 3D coordinate indices (e.g., `Shelf B > Drawer 3 > Box A12 > Well E6`) prepended with the active unit name.

### System Screenshot (Cryo-Storage Matrix & Active Unit Select):
![Cryo-Storage Matrix & Active Unit Select](/Users/pujapramanik/.gemini/antigravity/brain/8c184201-b8ba-4089-a713-e3bcf2b56190/media__1779808004003.png)

---

## 3. Specimen Retrieval & Secure Checkout Workflow

When researchers request specimens for experimental assays, they utilize the search and checkout pipeline.

### Checkout Pipeline Steps:
1.  **Specimen Search & Filtration**: Researchers query the Specimen Catalog using donor demographics, clinical diagnoses, and quality metric thresholds.
2.  **Request Cart Selection**: Matching specimens are added to a temporary request cart.
3.  **Secure IRB Checkout**: Clicking the cart opens the request checkout modal, requiring the researcher to input:
    *   *Researcher Name* and *Institution*
    *   *IRB (Institutional Review Board) Protocol Code* (e.g., `IRB-2026-X4902-T`) to ensure regulatory approval.
    *   *Scientific Research Hypothesis & Purpose*
4.  **Consent Validation**: The system cross-references the selected specimens' donor consent profiles against the checkout request, blocking checkout if a conflict exists.
5.  **Form Reset & Labeling**: Once submitted, the checkout form immediately resets all inputs to protect operator information, and the system generates packing labels.

---

## 4. Operational Auditing & Compliance Reporting

To satisfy federal audits (FDA 21 CFR Part 11) and maintain strict traceability, LIMS incorporates real-time auditing and clean-room print styles.

### Audit Trail:
*   Every data modification (operator log-in/out, sample deposition, relocation, consent update, or checkout) is logged instantly in a ledger database.
*   Logs capture the operator name, role, precise modification details, and a real-time timestamp.

### Tabular Reporting & Spreadsheet Printing:
*   Administrators filter reports on-type via built-in column funnels.
*   Checkboxes allow selecting specific rows to build custom CSV export files.
*   **Clean Print Mode**: Built-in CSS print styles strip out all dark theme gradients, headers, and sidebars. Printing renders a high-contrast, border-aligned grid optimized for physical clinical binders.
