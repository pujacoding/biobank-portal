# AURA Biobank Lab Portal

This is a responsive, web-based ingestion portal designed for **external laboratories** to register biological samples, upload patient consent documentation, and generate compliant QR and Code128 barcode labels for storage tracking.

---

## Technical Stack & Architecture

- **Frontend**: React.js SPA initialized with Vite, using a responsive HSL CSS design system (Dark & Light themes, premium glassmorphism surfaces).
- **Backend**: Node.js Express REST API.
- **Database**: PostgreSQL support via `pg` pool, with an automatic local **SQLite fallback** (`sqlite3`) that auto-boots a local database file (`lab-portal/backend/data/biobank.db`) when a PostgreSQL connection string is not provided.
- **Security**: JWT-based RBAC sessions authorized via OTP verification.
- **Barcode Engine**: QR & Code128 generation on the fly using `bwip-js`.
- **Compliance**: Immutable Audit Trail tracking logins, uploads, and label mapping.

---

## Getting Started

### Prerequisites
Make sure you have **Node.js (v18+)** and **npm** installed.

### Installation & Running
In your terminal, navigate to the `lab-portal/` directory and follow these steps:

1.  **Boot both Frontend and Backend concurrently** (recommmended):
    ```bash
    npm run dev
    ```
    This starts:
    - **Backend API**: `http://localhost:5001`
    - **Frontend App**: `http://localhost:5173` (Open this in your browser)

2.  **Separate Commands (Alternative)**:
    - Start Backend only: `npm run start:backend`
    - Start Frontend only: `npm run start:frontend`

---

## Pre-seeded Testing Accounts & Roles

The system automatically seeds a default laboratory and three operator profiles on start. You can sign in using either their **Email** or **Phone Number**.

When logging in, click "Send OTP". 
- An browser alert window will display the generated 6-digit code.
- Alternatively, you can use the universal mock bypass OTP: **`123456`**.

### Profiles:

| Operator Name | Role | Email Identifier | Phone Identifier |
| :--- | :--- | :--- | :--- |
| **Admin Alice** | `Lab Admin` | `admin@metropolis.com` | `5551112222` |
| **Tech Timmy** | `Lab Technician` | `tech@metropolis.com` | `5553334444` |
| **Collector Colin** | `Collection Staff` | `collector@metropolis.com` | `5555556666` |

---

## System Workflows & Business Rules

### 1. Ingestion Workflow
The specimen lifecycle transitions through the following stages:
$$\text{Collected} \xrightarrow{\text{Attach Consent \& Approve}} \text{Consent Verified} \xrightarrow{\text{Generate Barcodes}} \text{Barcode Generated}$$

### 2. Barcode Constraint
- **Rule**: Barcode generation is **strictly blocked** until the linked patient consent record is verified.
- **Action**: When a user registers a sample or attaches consent, it starts in `Pending` verification status. A `Lab Admin` or `Lab Technician` must review the document and click **Verify & Approve** in the Consent Management panel to unlock label generation.

### 3. Print Formatting
- Mapping barcodes generates a unique string, a Code128 layout, and a QR code mapping details.
- Clicking **Print** displays a high-contrast 3.5in x 2.0in label layout and opens the browser's physical printing overlay. All non-relevant web elements (header, sidebar, actions) are excluded automatically.

### 4. Security Audit logs
- Restricted to the `Lab Admin` profile. 
- Chronologically records actions (Logins, Registration, Consents, Barcodes) with operator user IDs, usernames, actions, detail descriptions, and ISO-8601 timestamps.
