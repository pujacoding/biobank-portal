import { query } from '../services/dbService.js';

/**
 * Fetch active specimen types for dropdown selectors
 */
export async function getActiveTypes(req, res, next) {
  try {
    const result = await query("SELECT * FROM specimen_types WHERE status = 'Active' ORDER BY category ASC, specimen_name ASC");
    res.json({ success: true, specimen_types: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Fetch all specimen types (Admin only)
 */
export async function getAllTypes(req, res, next) {
  try {
    const result = await query("SELECT * FROM specimen_types ORDER BY category ASC, specimen_name ASC");
    res.json({ success: true, specimen_types: result.rows });
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new specimen type (Admin only)
 */
export async function createType(req, res, next) {
  try {
    const { specimen_code, specimen_name, category, status } = req.body;
    
    if (!specimen_code || !specimen_name || !category) {
      return res.status(400).json({ error: "Missing required fields: specimen_code, specimen_name, and category are required." });
    }

    const codeUpper = specimen_code.trim().toUpperCase();
    const nameTrim = specimen_name.trim();
    const catTrim = category.trim();
    const finalStatus = status === 'Inactive' ? 'Inactive' : 'Active';

    // Verify uniqueness
    const uniquenessCheck = await query(
      "SELECT * FROM specimen_types WHERE specimen_code = $1 OR specimen_name = $2", 
      [codeUpper, nameTrim]
    );
    if (uniquenessCheck.rows.length > 0) {
      return res.status(400).json({ error: "A specimen type with this code or name already exists." });
    }

    // Fetch user details for creator name and audit trail
    const userResult = await query("SELECT u.name, r.role_name as role, l.name as lab_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id LEFT JOIN labs l ON u.lab_id = l.id WHERE u.id = $1", [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System Admin", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };

    // Insert
    await query(
      "INSERT INTO specimen_types (specimen_code, specimen_name, category, status, created_by) VALUES ($1, $2, $3, $4, $5)",
      [codeUpper, nameTrim, catTrim, finalStatus, userRow.name]
    );
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    // Insert audit log
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Specimen Type Master', 'CREATE', 'SpecimenType', $5, null, $6, $7)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name, 
      codeUpper, `Created Specimen Type ${nameTrim} (${codeUpper}) under category ${catTrim} with status ${finalStatus}.`,
      clientIp
    ]);

    res.status(201).json({ 
      success: true, 
      specimen_type: { specimen_code: codeUpper, specimen_name: nameTrim, category: catTrim, status: finalStatus } 
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Update an existing specimen type (Admin only)
 */
export async function updateType(req, res, next) {
  try {
    const { id } = req.params;
    const { specimen_code, specimen_name, category, status } = req.body;

    if (!specimen_code || !specimen_name || !category || !status) {
      return res.status(400).json({ error: "Missing required fields: specimen_code, specimen_name, category, and status are required." });
    }

    const codeUpper = specimen_code.trim().toUpperCase();
    const nameTrim = specimen_name.trim();
    const catTrim = category.trim();
    const finalStatus = status === 'Inactive' ? 'Inactive' : 'Active';

    // Verify current state
    const currentCheck = await query("SELECT * FROM specimen_types WHERE id = $1", [id]);
    if (currentCheck.rows.length === 0) {
      return res.status(404).json({ error: "Specimen type not found" });
    }
    const oldVal = currentCheck.rows[0];

    // Verify uniqueness for other rows
    const uniquenessCheck = await query(
      "SELECT * FROM specimen_types WHERE (specimen_code = $1 OR specimen_name = $2) AND id != $3", 
      [codeUpper, nameTrim, id]
    );
    if (uniquenessCheck.rows.length > 0) {
      return res.status(400).json({ error: "A specimen type with this code or name already exists." });
    }

    // Update
    await query(
      "UPDATE specimen_types SET specimen_code = $1, specimen_name = $2, category = $3, status = $4 WHERE id = $5",
      [codeUpper, nameTrim, catTrim, finalStatus, id]
    );

    // Fetch user details for audit trail
    const userResult = await query("SELECT u.name, r.role_name as role, l.name as lab_name FROM users u LEFT JOIN roles r ON u.role_id = r.role_id LEFT JOIN labs l ON u.lab_id = l.id WHERE u.id = $1", [req.user.userId]);
    const userRow = userResult.rows[0] || { name: "System Admin", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    const isDeactivated = oldVal.status === 'Active' && finalStatus === 'Inactive';
    const actionType = isDeactivated ? 'DEACTIVATE' : 'UPDATE';

    // Insert audit log
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES ($1, $2, $3, $4, 'Specimen Type Master', $5, 'SpecimenType', $6, $7, $8, $9)
    `, [
      req.user.userId, userRow.name, userRow.role, userRow.lab_name,
      actionType, id, JSON.stringify(oldVal),
      `Updated Specimen Type ${nameTrim} (${codeUpper}) [Status: ${finalStatus}].`,
      clientIp
    ]);

    res.json({ success: true, message: "Specimen type updated successfully" });
  } catch (error) {
    next(error);
  }
}
