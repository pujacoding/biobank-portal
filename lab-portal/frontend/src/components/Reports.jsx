import React from 'react';
import ReportsLayout from './reports/ReportsLayout';

/**
 * Redesigned Reports Module
 * Completely replaces the old tab-based layout with an enterprise LIMS router.
 */
export default function Reports({
  activeReport,
  setActiveReport,
  backendUrl,
  token,
  user
}) {

  // Configuration mapping for all 18 Enterprise LIMS Reports
  const reportConfigs = {
    'dashboard-analytics': {
      title: 'LIMS Dashboard Analytics',
      description: 'System-wide summary metrics, freezer occupancy statistics, and QC verdict analysis.',
      endpoint: 'dashboard',
      columns: []
    },
    'specimen-inventory': {
      title: 'Specimen Inventory Report',
      description: 'Comprehensive log of all registered specimens in active inventory storage.',
      endpoint: 'specimen-inventory',
      columns: [
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'barcode', label: 'Barcode', sortable: true, filterType: 'text', monospace: true },
        { key: 'subjectId', label: 'Subject ID', sortable: true, filterType: 'text' },
        { key: 'study', label: 'Study Protocol', sortable: true, filterType: 'text' },
        { key: 'specimenType', label: 'Specimen Type', sortable: true, filterType: 'select', filterOptions: ['Blood', 'Serum', 'Plasma', 'DNA', 'RNA', 'Saliva', 'Urine', 'Tissue'] },
        { key: 'volume', label: 'Volume (mL)', sortable: true, filterType: 'text' },
        { key: 'collectionDate', label: 'Collection Date', sortable: true, filterType: 'text' },
        { key: 'freezer', label: 'Freezer', sortable: true, filterType: 'text' },
        { key: 'rack', label: 'Rack', sortable: false, filterType: 'text' },
        { key: 'shelf', label: 'Shelf', sortable: false, filterType: 'text' },
        { key: 'box', label: 'Box', sortable: false, filterType: 'text' },
        { key: 'position', label: 'Position', sortable: false, filterType: 'text' },
        { key: 'status', label: 'Status', sortable: true, filterType: 'select', filterOptions: ['Collected', 'Stored', 'Released', 'Disposed'] },
        { key: 'createdBy', label: 'Operator', sortable: true, filterType: 'text' }
      ]
    },
    'sample-collection': {
      title: 'Sample Collection Report',
      description: 'Detailed logs of biological samples collected at clinical intake stations.',
      endpoint: 'sample-collection',
      columns: [
        { key: 'collectionDate', label: 'Collection Date', sortable: true, filterType: 'text' },
        { key: 'subjectId', label: 'Subject ID', sortable: true, filterType: 'text' },
        { key: 'collector', label: 'Collector Operator', sortable: true, filterType: 'text' },
        { key: 'collectionSite', label: 'Collection Site Clinic', sortable: true, filterType: 'text' },
        { key: 'specimenType', label: 'Specimen Type', sortable: true, filterType: 'select', filterOptions: ['Blood', 'Serum', 'Plasma', 'DNA', 'RNA', 'Saliva', 'Urine', 'Tissue'] },
        { key: 'volume', label: 'Volume (mL)', sortable: true, filterType: 'text' },
        { key: 'consentStatus', label: 'Consent Status', sortable: true, filterType: 'select', filterOptions: ['Verified', 'Withdrawn', 'Pending'] }
      ]
    },
    'sample-processing': {
      title: 'Sample Processing Report',
      description: 'Tracks sample extraction steps, centrifugation duration, and operators.',
      endpoint: 'sample-processing',
      columns: [
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'processingStep', label: 'Processing Step', sortable: true, filterType: 'select', filterOptions: ['Centrifugation', 'Extraction', 'Aliquotting', 'Purity Audit', 'Cryo-buffering'] },
        { key: 'operator', label: 'Operator', sortable: true, filterType: 'text' },
        { key: 'startTime', label: 'Start Time', sortable: true, filterType: 'text' },
        { key: 'endTime', label: 'End Time', sortable: true, filterType: 'text' },
        { key: 'duration', label: 'Duration', sortable: true, filterType: 'text' },
        { key: 'status', label: 'Processing Status', sortable: true, filterType: 'select', filterOptions: ['Completed', 'Failed'] }
      ]
    },
    'consent-report': {
      title: 'Consent Compliance Report',
      description: 'List of subject consent audits, version changes, and withdrawal records.',
      endpoint: 'consent',
      columns: [
        { key: 'subjectId', label: 'Subject ID', sortable: true, filterType: 'text' },
        { key: 'consentVersion', label: 'Consent Version', sortable: true, filterType: 'text' },
        { key: 'consentDate', label: 'Consent Date', sortable: true, filterType: 'text' },
        { key: 'expiryDate', label: 'Expiry Date', sortable: true, filterType: 'text' },
        { key: 'consentStatus', label: 'Consent Status', sortable: true, filterType: 'select', filterOptions: ['Verified', 'Withdrawn', 'Pending'] }
      ]
    },
    'inventory-report': {
      title: 'Lab Inventory Registry',
      description: 'Real-time stock quantities of laboratory consumable supplies and buffer reagents.',
      endpoint: 'inventory',
      columns: [
        { key: 'itemName', label: 'Consumable Item Name', sortable: true, filterType: 'text' },
        { key: 'availableQuantity', label: 'Available Quantity', sortable: true, filterType: 'text' },
        { key: 'reservedQuantity', label: 'Reserved Quantity', sortable: true, filterType: 'text' },
        { key: 'minimumQuantity', label: 'Minimum Threshold', sortable: true, filterType: 'text' },
        { key: 'location', label: 'Storage Location', sortable: true, filterType: 'text' }
      ]
    },
    'storage-report': {
      title: 'Storage Capacity Matrix',
      description: 'Location map breakdown indicating occupied positions in sub-zero freezers.',
      endpoint: 'storage',
      columns: [
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'freezer', label: 'Freezer Unit', sortable: true, filterType: 'text' },
        { key: 'rack', label: 'Rack', sortable: false, filterType: 'text' },
        { key: 'shelf', label: 'Shelf', sortable: false, filterType: 'text' },
        { key: 'box', label: 'Box ID', sortable: false, filterType: 'text' },
        { key: 'position', label: 'Well Position', sortable: false, filterType: 'text' },
        { key: 'temperature', label: 'Sensor Temp', sortable: true, filterType: 'text' },
        { key: 'occupancy', label: 'Status', sortable: true, filterType: 'text' }
      ]
    },
    'shipment-report': {
      title: 'Shipments & Receiving Log',
      description: 'Historical shipment tracking, destination facilities, and courier details.',
      endpoint: 'shipment',
      columns: [
        { key: 'shipmentId', label: 'Shipment ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'courier', label: 'Courier Partner', sortable: true, filterType: 'text' },
        { key: 'trackingNumber', label: 'Tracking Number', sortable: true, filterType: 'text', monospace: true },
        { key: 'destination', label: 'Destination', sortable: true, filterType: 'text' },
        { key: 'dispatchDate', label: 'Dispatch Date', sortable: true, filterType: 'text' },
        { key: 'deliveryDate', label: 'Delivery Date', sortable: true, filterType: 'text' },
        { key: 'shipmentStatus', label: 'Shipment Status', sortable: true, filterType: 'select', filterOptions: ['Pending', 'In Transit', 'Received'] }
      ]
    },
    'specimen-release': {
      title: 'Specimen Releases Log',
      description: 'List of biological specimens shipped out to research projects under IRB approval.',
      endpoint: 'releases',
      columns: [
        { key: 'releaseId', label: 'Release ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'researchProject', label: 'Research Project', sortable: true, filterType: 'text' },
        { key: 'researcher', label: 'Researcher Name', sortable: true, filterType: 'text' },
        { key: 'institution', label: 'Institution', sortable: true, filterType: 'text' },
        { key: 'approvalStatus', label: 'Approval Status', sortable: true, filterType: 'select', filterOptions: ['Approved', 'Pending', 'Rejected'] },
        { key: 'releasedSamples', label: 'Released Count', sortable: true, filterType: 'text' },
        { key: 'releaseDate', label: 'Release Date', sortable: true, filterType: 'text' }
      ]
    },
    'disposal-report': {
      title: 'Specimen Disposal Ledger',
      description: 'Authorized sample disposals, containment waste reasons, and approvals.',
      endpoint: 'disposal',
      columns: [
        { key: 'disposalId', label: 'Disposal ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'reason', label: 'Disposal Reason', sortable: true, filterType: 'text' },
        { key: 'approvedBy', label: 'Approved By', sortable: true, filterType: 'text' },
        { key: 'disposalDate', label: 'Disposal Date', sortable: true, filterType: 'text' }
      ]
    },
    'qc-report': {
      title: 'Quality Control Report',
      description: 'LIMS DNA/RNA concentration (ng/µL) and purity ratios (260/280) validation verdicts.',
      endpoint: 'qc',
      columns: [
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'concentration', label: 'Concentration (ng/µL)', sortable: true, filterType: 'text' },
        { key: 'purity', label: 'Purity Ratio (260/280)', sortable: true, filterType: 'text' },
        { key: 'qcResult', label: 'QC Verdict', sortable: true, filterType: 'select', filterOptions: ['Passed', 'Failed'] },
        { key: 'qcStatus', label: 'Review Status', sortable: true, filterType: 'select', filterOptions: ['Verified', 'Pending'] },
        { key: 'technician', label: 'Lab Technician', sortable: true, filterType: 'text' }
      ]
    },
    'temperature-monitoring': {
      title: 'Temperature Sensor Logs',
      description: 'Active temperature sensor readings for -80°C and LN2 tanks with alert alarms.',
      endpoint: 'temperature',
      columns: [
        { key: 'freezer', label: 'Freezer Unit ID', sortable: true, filterType: 'text' },
        { key: 'currentTemperature', label: 'Current Temp', sortable: true, filterType: 'text' },
        { key: 'minimum', label: 'Min Temp Limit', sortable: true, filterType: 'text' },
        { key: 'maximum', label: 'Max Temp Limit', sortable: true, filterType: 'text' },
        { key: 'alarmStatus', label: 'Alarm Status', sortable: true, filterType: 'select', filterOptions: ['Normal', 'High Temp Warning'] },
        { key: 'recordedTime', label: 'Sensor Reading Time', sortable: true, filterType: 'text' }
      ]
    },
    'chain-of-custody': {
      title: 'Chain of Custody trace',
      description: 'Visual chronological lifecycle timeline tracker of sample custody transfers.',
      endpoint: 'chain-of-custody',
      columns: []
    },
    'audit-report': {
      title: 'LIMS Audit Trail',
      description: 'System actions log capturing user modifications, record history, and IP nodes.',
      endpoint: 'audit',
      columns: [
        { key: 'user', label: 'User Operator', sortable: true, filterType: 'text' },
        { key: 'role', label: 'System Role', sortable: true, filterType: 'text' },
        { key: 'module', label: 'LIMS Module', sortable: true, filterType: 'text' },
        { key: 'action', label: 'Action Performed', sortable: true, filterType: 'text' },
        { key: 'record', label: 'Target Record ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'timestamp', label: 'Timestamp Log', sortable: true, filterType: 'text' },
        { key: 'ipAddress', label: 'IP Node', sortable: true, filterType: 'text' }
      ]
    },
    'user-activity': {
      title: 'User Sessions Report',
      description: 'Operator system logins, logout time intervals, and action frequencies.',
      endpoint: 'users',
      columns: [
        { key: 'user', label: 'User Operator', sortable: true, filterType: 'text' },
        { key: 'role', label: 'System Role', sortable: true, filterType: 'text' },
        { key: 'loginTime', label: 'Login Time', sortable: true, filterType: 'text' },
        { key: 'logoutTime', label: 'Logout Time', sortable: true, filterType: 'text' },
        { key: 'sessionDuration', label: 'Session Duration', sortable: true, filterType: 'text' },
        { key: 'performedActions', label: 'Session Logs Summary', sortable: false, filterType: 'text' }
      ]
    },
    'freezer-utilization': {
      title: 'Freezer Occupancy & Utilization',
      description: 'Occupied vs available cryogenic slot capacities by sub-zero storage freezer.',
      endpoint: 'freezer-utilization',
      columns: [
        { key: 'freezer', label: 'Freezer Unit ID', sortable: true, filterType: 'text' },
        { key: 'capacity', label: 'Total Grid Capacity', sortable: true, filterType: 'text' },
        { key: 'occupied', label: 'Occupied Well Slots', sortable: true, filterType: 'text' },
        { key: 'available', label: 'Available Well Slots', sortable: true, filterType: 'text' },
        { key: 'occupancyPercent', label: 'Occupancy %', sortable: true, filterType: 'text' }
      ]
    },
    'expiry-report': {
      title: 'Specimen Expiry Report',
      description: 'Calculates days remaining based on stability standards by specimen category.',
      endpoint: 'expiry',
      columns: [
        { key: 'sampleId', label: 'Sample ID', sortable: true, filterType: 'text', monospace: true },
        { key: 'specimenType', label: 'Specimen Type', sortable: true, filterType: 'select', filterOptions: ['Blood', 'Serum', 'Plasma', 'DNA', 'RNA', 'Saliva', 'Urine', 'Tissue'] },
        { key: 'expiryDate', label: 'Calculated Expiry Date', sortable: true, filterType: 'text' },
        { key: 'daysRemaining', label: 'Days Remaining', sortable: true, filterType: 'text' },
        { key: 'status', label: 'Expiry State', sortable: true, filterType: 'select', filterOptions: ['Valid', 'Expired', 'Near Expiry'] }
      ]
    },
    'empty-storage': {
      title: 'Empty Grid Slots Report',
      description: 'List of empty storage well locations to help assign newly intake specimens.',
      endpoint: 'empty-storage',
      columns: [
        { key: 'freezer', label: 'Freezer Unit Name', sortable: true, filterType: 'text' },
        { key: 'rack', label: 'Rack Grid', sortable: false, filterType: 'text' },
        { key: 'shelf', label: 'Shelf Drawer', sortable: false, filterType: 'text' },
        { key: 'box', label: 'Box ID', sortable: false, filterType: 'text' },
        { key: 'availablePositions', label: 'Empty Well Coordinates', sortable: false, filterType: 'text' }
      ]
    }
  };

  const currentReportKey = activeReport || 'dashboard-analytics';
  const currentReport = reportConfigs[currentReportKey] || reportConfigs['dashboard-analytics'];

  return (
    <div className="reports-module-root">
      <ReportsLayout
        key={currentReportKey}
        reportEndpoint={currentReport.endpoint}
        reportTitle={currentReport.title}
        reportDescription={currentReport.description}
        columns={currentReport.columns}
        authToken={token}
      />
    </div>
  );
}
