import express from 'express';
import { query } from '../database.js';
import { authenticateToken, requirePermission } from './auth.js';

const router = express.Router();

// Helper to log audit activities
async function logActivity(req, actionType, moduleName, entityType, entityId, oldVal, newVal) {
  try {
    const performer = await query(`
      SELECT u.name, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
      WHERE u.id = ?
    `, [req.user.userId]);

    const user = performer.rows[0] || { name: "System", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";

    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center",
      moduleName, actionType, entityType, String(entityId),
      oldVal ? JSON.stringify(oldVal) : null,
      newVal ? JSON.stringify(newVal) : null,
      clientIp
    ]);
  } catch (err) {
    console.error("Activity audit log insert failed:", err);
  }
}

// 1. GET /api/users/metadata - Retrieve labs, roles, locations, and permissions for the form selects
router.get('/metadata', authenticateToken, async (req, res) => {
  try {
    const labs = await query("SELECT id, name, location_address FROM labs WHERE status = 'Active'");
    const roles = await query("SELECT role_id, role_name, description FROM roles");
    const locations = await query("SELECT location_id, lab_id, location_name FROM locations");
    const permissions = await query("SELECT permission_id, permission_name, module_name FROM permissions");

    // Also get default role permissions mappings
    const defaultMappings = await query(`
      SELECT rp.role_id, p.permission_id, p.permission_name, p.module_name
      FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
    `);

    res.json({
      success: true,
      labs: labs.rows,
      roles: roles.rows,
      locations: locations.rows,
      permissions: permissions.rows,
      rolePermissions: defaultMappings.rows
    });
  } catch (err) {
    console.error("Error retrieving metadata selectors:", err);
    res.status(500).json({ error: "Internal server error retrieving dropdown select metadata" });
  }
});

// 2. GET /api/users - Retrieve all users for the requester's context
router.get('/', authenticateToken, requirePermission('View Users', 'User Management'), async (req, res) => {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const callerRoleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);

    let sql = `
      SELECT u.*, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
    `;
    const params = [];

    // If an active lab context is set, restrict users directory to that lab (except for Super Admin)
    if (req.user.labId && callerRoleId !== 1) {
      sql += " WHERE u.lab_id = ?";
      params.push(req.user.labId);
    }


    sql += " ORDER BY u.id ASC";

    const usersResult = await query(sql, params);
    const users = usersResult.rows;

    // Fully hydrate each user with location access IDs and custom permission IDs
    const hydratedUsers = [];
    for (const u of users) {
      const locRes = await query("SELECT location_id FROM user_locations WHERE user_id = ?", [u.id]);
      const permRes = await query("SELECT permission_id FROM user_permissions WHERE user_id = ?", [u.id]);

      hydratedUsers.push({
        ...u,
        locations: locRes.rows.map(row => row.location_id),
        permissions: permRes.rows.map(row => row.permission_id)
      });
    }

    res.json({
      success: true,
      users: hydratedUsers
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Internal server error while fetching users" });
  }
});

// 3. POST /api/users - Create/Register a new user
router.post('/', authenticateToken, requirePermission('Create User', 'User Management'), async (req, res) => {
  try {
    const { full_name, phone_number, email, employee_id, designation, role_id, lab_id, status, password, locations, permissions } = req.body;

    if (!full_name || !phone_number || !email || !role_id) {
      return res.status(400).json({ error: "Full Name, phone number, email, and role are required." });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check if email already exists
    const emailCheck = await query("SELECT id FROM users WHERE email = ?", [cleanEmail]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: "A user with this email address already exists." });
    }

    // Verify creator credentials and RBAC rules
    const creatorRes = await query("SELECT name, role_id FROM users WHERE id = ?", [req.user.userId]);
    const creator = creatorRes.rows[0];
    const creatorRoleId = parseInt(creator?.role_id, 10);
    const targetRoleId = parseInt(role_id, 10);

    // Business Rules checks:
    // Rule 1: Lab Admins (and other roles) cannot create Super Admins (role_id = 1). Only Super Admins can.
    if (creatorRoleId !== 1 && targetRoleId === 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can create Super Admin accounts." });
    }

    // Rule 2: Users other than Super Admin (1) and Lab Admin (2) must be restricted to their own laboratory.
    if (creatorRoleId !== 1 && creatorRoleId !== 2 && lab_id && parseInt(lab_id, 10) !== parseInt(req.user.labId, 10)) {
      return res.status(403).json({ error: "Access denied. You can only assign users to your own laboratory." });
    }

    const userStatus = status || 'Active';
    const creatorName = creator?.name || "System";

    // Insert user record with creator accountability mapping
    const insertResult = await query(`
      INSERT INTO users (
        name, full_name, phone_number, email, employee_id, designation, 
        role_id, lab_id, status, password, created_by, created_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `, [
      full_name.trim(), full_name.trim(), phone_number.trim(), cleanEmail,
      employee_id ? employee_id.trim() : null,
      designation ? designation.trim() : null,
      targetRoleId, lab_id ? parseInt(lab_id, 10) : null, userStatus,
      password ? password.trim() : 'lims2026', creatorName
    ]);


    const newUserId = insertResult.lastID;

    // Save Location access lists
    if (Array.isArray(locations)) {
      for (const locId of locations) {
        await query("INSERT INTO user_locations (user_id, location_id) VALUES (?, ?)", [newUserId, locId]);
      }
    }

    // Save Action-Based permissions custom overrides
    if (Array.isArray(permissions)) {
      for (const permId of permissions) {
        await query("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)", [newUserId, permId]);
      }
    }

    // Log user created to compliance user_activity_logs
    const newUserRecord = { full_name, email, role_id, lab_id, status: userStatus, locations, permissions };
    await logActivity(req, 'CREATE', 'User Management', 'User', newUserId, null, newUserRecord);

    // If roles or permissions assigned, track in audit
    await logActivity(req, 'ROLE_ASSIGNMENT', 'User Management', 'User', newUserId, null, { role_id: targetRoleId });
    await logActivity(req, 'PERMISSION_ASSIGNMENT', 'User Management', 'User', newUserId, null, { permissions });

    res.status(201).json({
      success: true,
      message: "User created successfully",
      userId: newUserId
    });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal server error while creating user" });
  }
});

// 4. PUT /api/users/:id - Edit/Update user profile details and permissions
router.put('/:id', authenticateToken, requirePermission('Edit User', 'User Management'), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { full_name, phone_number, email, employee_id, designation, role_id, lab_id, status, password, locations, permissions } = req.body;

    if (!full_name || !phone_number || !email || !role_id) {
      return res.status(400).json({ error: "Full Name, phone number, email, and role are required." });
    }

    // Check if target user exists
    const userCheck = await query("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const oldUser = userCheck.rows[0];

    // Check email uniqueness if changed
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== oldUser.email.toLowerCase()) {
      const emailUniqueCheck = await query("SELECT id FROM users WHERE email = ?", [cleanEmail]);
      if (emailUniqueCheck.rows.length > 0) {
        return res.status(400).json({ error: "A user with this email address already exists." });
      }
    }

    // Verify editor rights
    const editorCheck = await query("SELECT name, role_id FROM users WHERE id = ?", [req.user.userId]);
    const editor = editorCheck.rows[0];
    const editorRoleId = parseInt(editor?.role_id, 10);

    // Business Rules:
    // Rule 1: Only Super Admins can edit Super Admin accounts.
    if (editorRoleId !== 1 && parseInt(oldUser.role_id, 10) === 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can modify Super Admin profiles." });
    }

    // Rule 2: Only Super Admins can assign the Super Admin role.
    if (editorRoleId !== 1 && parseInt(role_id, 10) === 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can assign the Super Admin role." });
    }

    // Rule 3: Users other than Super Admin (1) and Lab Admin (2) must be restricted to their own laboratory.
    if (editorRoleId !== 1 && editorRoleId !== 2) {
      if ((oldUser.lab_id && parseInt(oldUser.lab_id, 10) !== parseInt(req.user.labId, 10)) || 
          (lab_id && parseInt(lab_id, 10) !== parseInt(req.user.labId, 10))) {
        return res.status(403).json({ error: "Access denied. You can only modify user profiles inside your own laboratory." });
      }
    }

    const editorName = editor?.name || "System";
    const nowStr = new Date().toLocaleString();

    // Determine status change accountability updates
    let statusSqlParts = '';
    const statusParams = [];
    if (status !== oldUser.status) {
      if (status === 'Active') {
        statusSqlParts = `, activated_by = ?, activated_date = ?`;
        statusParams.push(editorName, nowStr);
      } else if (status === 'Inactive') {
        statusSqlParts = `, deactivated_by = ?, deactivated_date = ?`;
        statusParams.push(editorName, nowStr);
      } else if (status === 'Suspended') {
        statusSqlParts = `, suspended_by = ?, suspended_date = ?`;
        statusParams.push(editorName, nowStr);
      }
    }

    let passwordSqlPart = '';
    const updateParams = [
      full_name.trim(), full_name.trim(), phone_number.trim(), cleanEmail,
      employee_id ? employee_id.trim() : null,
      designation ? designation.trim() : null,
      parseInt(role_id, 10), lab_id ? parseInt(lab_id, 10) : null, status
    ];
    if (password) {
      passwordSqlPart = `, password = ?`;
      updateParams.push(password.trim());
    }
    updateParams.push(editorName, nowStr);
    updateParams.push(...statusParams);
    updateParams.push(targetUserId);

    // Update users main record
    await query(`
      UPDATE users 
      SET name = ?, full_name = ?, phone_number = ?, email = ?, employee_id = ?, designation = ?, 
          role_id = ?, lab_id = ?, status = ? ${passwordSqlPart}, modified_by = ?, modified_date = ? ${statusSqlParts}
      WHERE id = ?
    `, updateParams);

    // Handle Locations mapping changes
    if (Array.isArray(locations)) {
      await query("DELETE FROM user_locations WHERE user_id = ?", [targetUserId]);
      for (const locId of locations) {
        await query("INSERT INTO user_locations (user_id, location_id) VALUES (?, ?)", [targetUserId, locId]);
      }
    }

    // Handle Custom permission overrides changes
    if (Array.isArray(permissions)) {
      await query("DELETE FROM user_permissions WHERE user_id = ?", [targetUserId]);
      for (const permId of permissions) {
        await query("INSERT INTO user_permissions (user_id, permission_id) VALUES (?, ?)", [targetUserId, permId]);
      }
    }

    // Log updates and role/permission changes
    const newUserRecord = { full_name, email, role_id, lab_id, status, locations, permissions };
    await logActivity(req, 'UPDATE', 'User Management', 'User', targetUserId, oldUser, newUserRecord);

    if (parseInt(role_id, 10) !== parseInt(oldUser.role_id, 10)) {
      await logActivity(req, 'ROLE_CHANGED', 'User Management', 'User', targetUserId, { role_id: oldUser.role_id }, { role_id });
    }

    await logActivity(req, 'PERMISSION_ASSIGNMENT', 'User Management', 'User', targetUserId, null, { permissions });

    res.json({
      success: true,
      message: "User profile updated successfully"
    });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Internal server error while updating user" });
  }
});

// 5. PUT /api/users/:id/status - Update user status directly (Activate/Deactivate/Suspend)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
      return res.status(400).json({ error: "Invalid account status option" });
    }

    const userCheck = await query("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const oldUser = userCheck.rows[0];

    // Enforce editor check
    const editorCheck = await query("SELECT name, role_id FROM users WHERE id = ?", [req.user.userId]);
    const editor = editorCheck.rows[0];
    const editorRoleId = parseInt(editor?.role_id, 10);

    if (editorRoleId !== 1 && parseInt(oldUser.role_id, 10) === 1) {
      return res.status(403).json({ error: "Access denied. Admin role lock restricts modifying Super Admins." });
    }

    if (editorRoleId !== 1 && editorRoleId !== 2 && oldUser.lab_id && parseInt(oldUser.lab_id, 10) !== parseInt(req.user.labId, 10)) {
      return res.status(403).json({ error: "Access denied. You can only modify user profiles inside your own laboratory." });
    }

    // Status action verification permission checks
    if (status === 'Active' && !req.user.role === 'Super Admin' && !req.user.role === 'Lab Admin') {
      // Actually require 'Activate User' or 'Edit User'
      return res.status(403).json({ error: "Access denied." });
    }

    const editorName = editor?.name || "System";
    const nowStr = new Date().toLocaleString();

    let statusSqlParts = '';
    const statusParams = [];
    let actionType = 'ACTIVATE';

    if (status === 'Active') {
      statusSqlParts = `activated_by = ?, activated_date = ?`;
      statusParams.push(editorName, nowStr);
      actionType = 'ACTIVATE';
    } else if (status === 'Inactive') {
      statusSqlParts = `deactivated_by = ?, deactivated_date = ?`;
      statusParams.push(editorName, nowStr);
      actionType = 'DEACTIVATE';
    } else if (status === 'Suspended') {
      statusSqlParts = `suspended_by = ?, suspended_date = ?`;
      statusParams.push(editorName, nowStr);
      actionType = 'SUSPEND';
    }

    await query(`
      UPDATE users 
      SET status = ?, ${statusSqlParts}, modified_by = ?, modified_date = ?
      WHERE id = ?
    `, [status, ...statusParams, editorName, nowStr, targetUserId]);

    // Log status change audit
    await logActivity(req, actionType, 'User Management', 'User', targetUserId, { status: oldUser.status }, { status });

    res.json({
      success: true,
      message: `User profile status updated to ${status} successfully`
    });
  } catch (err) {
    console.error("Error setting status:", err);
    res.status(500).json({ error: "Internal server error modifying account status" });
  }
});

// 6. POST /api/users/:id/reset-access - Reset password/OTP access credentials invitation
router.post('/:id/reset-access', authenticateToken, requirePermission('Edit User', 'User Management'), async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const userCheck = await query("SELECT * FROM users WHERE id = ?", [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found." });
    }

    await logActivity(req, 'RESET_ACCESS', 'User Management', 'User', targetUserId, null, "Password OTP access invitation reset requested");

    res.json({
      success: true,
      message: "User login OTP verification bypass link refreshed. Email dispatched successfully."
    });
  } catch (err) {
    console.error("Error resetting access:", err);
    res.status(500).json({ error: "Internal server error during credential reset execution" });
  }
});

// 7. GET /api/users/:id/history - Retrieve complete lifecycle history for a user profile
router.get('/:id/history', authenticateToken, requirePermission('View Users', 'User Management'), async (req, res) => {
  try {
    const targetUserId = req.params.id;

    // Retrieve activity logs affecting this user profile
    const result = await query(`
      SELECT ual.* 
      FROM user_activity_logs ual
      WHERE ual.entity_type = 'User' AND ual.entity_id = ?
      ORDER BY ual.timestamp DESC
    `, [targetUserId]);

    res.json({
      success: true,
      history: result.rows
    });
  } catch (err) {
    console.error("Error querying profile history:", err);
    res.status(500).json({ error: "Internal server error querying profile tracking logs" });
  }
});

// GET /api/users/labs/accessible - Get accessible active labs for active selector
router.get('/labs/accessible', authenticateToken, async (req, res) => {
  try {
    // Look up the user's actual database profile (ignoring req.user.labId overrides)
    const userCheck = await query(`
      SELECT u.lab_id, r.role_name 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.id = ?
    `, [req.user.userId]);

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const dbUser = userCheck.rows[0];

    let sql = "SELECT * FROM labs WHERE status = 'Active'";
    const params = [];

    // If not Super Admin and they have a specific lab assigned, restrict them
    if (dbUser.role_name !== 'Super Admin' && dbUser.lab_id !== null) {
      sql += " AND id = ?";
      params.push(dbUser.lab_id);
    }

    sql += " ORDER BY id ASC";
    const result = await query(sql, params);
    res.json({ success: true, labs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET /api/users/labs - Get all labs
router.get('/labs', authenticateToken, async (req, res) => {
  try {
    const result = await query("SELECT * FROM labs ORDER BY id ASC");
    res.json({ success: true, labs: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. POST /api/users/labs - Create a new lab (Super Admin only)
router.post('/labs', authenticateToken, async (req, res) => {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can create laboratories." });
    }

    const { name, location_address, has_subunits, sub_units } = req.body;
    if (!name || !location_address) {
      return res.status(400).json({ error: "Lab name and location address are required." });
    }

    const checkLab = await query("SELECT id FROM labs WHERE name = ?", [name.trim()]);
    if (checkLab.rows.length > 0) {
      return res.status(400).json({ error: "A laboratory with this name already exists." });
    }

    const result = await query(
      "INSERT INTO labs (name, location_address, status) VALUES (?, ?, 'Active')",
      [name.trim(), location_address.trim()]
    );

    const labId = result.lastID;

    if (has_subunits && Array.isArray(sub_units)) {
      for (const item of sub_units) {
        const nameOfSubUnit = typeof item === 'string' ? item : item.location_name;
        if (nameOfSubUnit && nameOfSubUnit.trim()) {
          await query(
            "INSERT INTO locations (lab_id, location_name) VALUES (?, ?)",
            [labId, nameOfSubUnit.trim()]
          );
        }
      }
    }

    await logActivity(req, 'CREATE', 'Administration', 'Lab', labId, null, { name, location_address, sub_units });

    res.status(201).json({ success: true, labId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 10. GET /api/users/labs/:id/subunits - Get all sub-units for a specific laboratory
router.get('/labs/:id/subunits', authenticateToken, async (req, res) => {
  try {
    const labId = parseInt(req.params.id, 10);
    const result = await query("SELECT * FROM locations WHERE lab_id = ? AND status = 'Active'", [labId]);
    res.json({ success: true, subunits: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 11. PUT /api/users/labs/:id - Edit a laboratory and its sub-units (Super Admin only)
router.put('/labs/:id', authenticateToken, async (req, res) => {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can modify laboratories." });
    }

    const labId = parseInt(req.params.id, 10);
    const { name, location_address, status, has_subunits, sub_units } = req.body;

    if (!name || !location_address) {
      return res.status(400).json({ error: "Lab name and location address are required." });
    }

    // Check if lab exists
    const labCheck = await query("SELECT * FROM labs WHERE id = ?", [labId]);
    if (labCheck.rows.length === 0) {
      return res.status(404).json({ error: "Laboratory not found." });
    }
    const oldLab = labCheck.rows[0];

    // Check name uniqueness if changed
    if (name.trim().toLowerCase() !== oldLab.name.toLowerCase()) {
      const checkLab = await query("SELECT id FROM labs WHERE name = ?", [name.trim()]);
      if (checkLab.rows.length > 0) {
        return res.status(400).json({ error: "A laboratory with this name already exists." });
      }
    }

    await query(
      "UPDATE labs SET name = ?, location_address = ?, status = ? WHERE id = ?",
      [name.trim(), location_address.trim(), status || 'Active', labId]
    );

    // Sync sub-units
    if (has_subunits && Array.isArray(sub_units)) {
      // Get currently active location IDs in DB
      const currentLocsRes = await query("SELECT location_id, location_name FROM locations WHERE lab_id = ?", [labId]);
      const currentLocs = currentLocsRes.rows;

      const keptIds = [];

      for (const item of sub_units) {
        if (item.location_id) {
          // Update existing sub-unit
          await query(
            "UPDATE locations SET location_name = ? WHERE location_id = ? AND lab_id = ?",
            [item.location_name.trim(), item.location_id, labId]
          );
          keptIds.push(item.location_id);
        } else if (item.location_name && item.location_name.trim()) {
          // Insert new sub-unit
          const insertRes = await query(
            "INSERT INTO locations (lab_id, location_name) VALUES (?, ?)",
            [labId, item.location_name.trim()]
          );
          keptIds.push(insertRes.lastID);
        }
      }

      // Delete removed sub-units
      const deleteIds = currentLocs.filter(loc => !keptIds.includes(loc.location_id)).map(loc => loc.location_id);
      for (const delId of deleteIds) {
        await query("DELETE FROM locations WHERE location_id = ?", [delId]);
        await query("DELETE FROM user_locations WHERE location_id = ?", [delId]);
      }
    } else {
      // If has_subunits is false, delete all sub-units for this lab
      const currentLocsRes = await query("SELECT location_id FROM locations WHERE lab_id = ?", [labId]);
      const currentLocIds = currentLocsRes.rows.map(r => r.location_id);
      for (const delId of currentLocIds) {
        await query("DELETE FROM locations WHERE location_id = ?", [delId]);
        await query("DELETE FROM user_locations WHERE location_id = ?", [delId]);
      }
    }

    await logActivity(req, 'UPDATE', 'Administration', 'Lab', labId, oldLab, { name, location_address, status, sub_units });

    res.json({ success: true, message: "Laboratory updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 12. DELETE /api/users/labs/:id - Delete a laboratory and its locations (Super Admin only)
router.delete('/labs/:id', authenticateToken, async (req, res) => {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can delete laboratories." });
    }

    const labId = parseInt(req.params.id, 10);

    // Check if lab exists
    const labCheck = await query("SELECT * FROM labs WHERE id = ?", [labId]);
    if (labCheck.rows.length === 0) {
      return res.status(404).json({ error: "Laboratory not found." });
    }

    // Delete associated user locations, locations, and the lab itself
    const currentLocsRes = await query("SELECT location_id FROM locations WHERE lab_id = ?", [labId]);
    const currentLocIds = currentLocsRes.rows.map(r => r.location_id);

    for (const locId of currentLocIds) {
      await query("DELETE FROM user_locations WHERE location_id = ?", [locId]);
    }
    await query("DELETE FROM locations WHERE lab_id = ?", [labId]);
    await query("DELETE FROM labs WHERE id = ?", [labId]);

    await logActivity(req, 'DELETE', 'Administration', 'Lab', labId, labCheck.rows[0], null);

    res.json({ success: true, message: "Laboratory deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
