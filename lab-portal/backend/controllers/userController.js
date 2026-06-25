import { query, getClient } from '../services/dbService.js';
import { hashPassword } from '../utils/crypto.js';

/**
 * Helper to log audit activities
 */
async function logActivity(client, userId, actionType, moduleName, entityType, entityId, oldVal, newVal, headers, socket) {
  const performer = await client.query(`
    SELECT u.name, r.role_name as role, l.name as lab_name
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.role_id
    LEFT JOIN labs l ON u.lab_id = l.id
    WHERE u.id = $1
  `, [userId]);

  const user = performer.rows[0] || { name: "System", role: "Super Admin", lab_name: "Aura Biobank Admin Center" };
  const clientIp = headers['x-forwarded-for'] || socket.remoteAddress || "";

  await client.query(`
    INSERT INTO user_activity_logs (
      user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
  `, [
    userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center",
    moduleName, actionType, entityType, String(entityId),
    oldVal ? JSON.stringify(oldVal) : null,
    newVal ? JSON.stringify(newVal) : null,
    clientIp
  ]);
}

/**
 * Retrieve metadata lists for user dropdown forms
 */
export async function getMetadata(req, res, next) {
  try {
    const labs = await query("SELECT id, name, location_address FROM labs WHERE status = 'Active'");
    const roles = await query("SELECT role_id, role_name, description FROM roles");
    const locations = await query("SELECT location_id, lab_id, location_name FROM locations");
    const permissions = await query("SELECT permission_id, permission_name, module_name FROM permissions");

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
    next(err);
  }
}

/**
 * Retrieve all users directory (scoped by context)
 */
export async function getUsers(req, res, next) {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const callerRoleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);

    let sql = `
      SELECT u.*, r.role_name as role, l.name as lab_name
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      LEFT JOIN labs l ON u.lab_id = l.id
    `;
    const params = [];

    // Filter by lab context if caller is not Super Admin (role_id = 1)
    if (req.user.labId && callerRoleId !== 1) {
      sql += " WHERE u.lab_id = $1";
      params.push(req.user.labId);
    }

    sql += " ORDER BY u.id ASC";

    const usersResult = await query(sql, params);
    const users = usersResult.rows;

    const hydratedUsers = [];
    for (const u of users) {
      const locRes = await query("SELECT location_id FROM user_locations WHERE user_id = $1", [u.id]);
      const permRes = await query("SELECT permission_id FROM user_permissions WHERE user_id = $1", [u.id]);

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
    next(error);
  }
}

/**
 * Create a new LIMS operator account (Transactional)
 */
export async function createUser(req, res, next) {
  const client = await getClient();
  try {
    const { full_name, phone_number, email, employee_id, designation, role_id, lab_id, status, password, locations, permissions } = req.body;

    if (!full_name || !phone_number || !email || !role_id) {
      return res.status(400).json({ error: "Full Name, phone number, email, and role are required." });
    }

    const cleanEmail = email.trim().toLowerCase();

    await client.query('BEGIN');

    // Check email uniqueness
    const emailCheck = await client.query("SELECT id FROM users WHERE email = $1 FOR UPDATE", [cleanEmail]);
    if (emailCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "A user with this email address already exists." });
    }

    const creatorRes = await client.query("SELECT name, role_id FROM users WHERE id = $1", [req.user.userId]);
    const creator = creatorRes.rows[0];
    const creatorRoleId = parseInt(creator?.role_id, 10);
    const targetRoleId = parseInt(role_id, 10);

    // Business Rules validation
    if (creatorRoleId !== 1 && targetRoleId === 1) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "Access denied. Only Super Admins can create Super Admin accounts." });
    }

    if (creatorRoleId !== 1 && creatorRoleId !== 2 && lab_id && parseInt(lab_id, 10) !== parseInt(req.user.labId, 10)) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "Access denied. You can only assign users to your own laboratory." });
    }

    const userStatus = status || 'Active';
    const creatorName = creator?.name || "System";

    const plaintextPass = password ? password.trim() : 'lims2026';
    const hashedPassword = await hashPassword(plaintextPass);

    const insertResult = await client.query(`
      INSERT INTO users (
        name, full_name, phone_number, email, employee_id, designation, 
        role_id, lab_id, status, password, password_plain, created_by, created_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP) RETURNING id
    `, [
      full_name.trim(), full_name.trim(), phone_number.trim(), cleanEmail,
      employee_id ? employee_id.trim() : null,
      designation ? designation.trim() : null,
      targetRoleId, lab_id ? parseInt(lab_id, 10) : null, userStatus,
      hashedPassword, plaintextPass, creatorName
    ]);

    const newUserId = insertResult.rows[0].id;

    // Save Location links
    if (Array.isArray(locations)) {
      for (const locId of locations) {
        await client.query("INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2)", [newUserId, locId]);
      }
    }

    // Save custom permissions overrides
    if (Array.isArray(permissions)) {
      for (const permId of permissions) {
        await client.query("INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2)", [newUserId, permId]);
      }
    }

    // Compliance logging
    const newUserRecord = { full_name, email, role_id, lab_id, status: userStatus, locations, permissions };
    await logActivity(client, req.user.userId, 'CREATE', 'User Management', 'User', newUserId, null, newUserRecord, req.headers, req.socket);
    await logActivity(client, req.user.userId, 'ROLE_ASSIGNMENT', 'User Management', 'User', newUserId, null, { role_id: targetRoleId }, req.headers, req.socket);
    await logActivity(client, req.user.userId, 'PERMISSION_ASSIGNMENT', 'User Management', 'User', newUserId, null, { permissions }, req.headers, req.socket);

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      message: "User created successfully",
      userId: newUserId
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Edit/Update LIMS operator details and permissions (Transactional)
 */
export async function updateUser(req, res, next) {
  const client = await getClient();
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { full_name, phone_number, email, employee_id, designation, role_id, lab_id, status, password, locations, permissions } = req.body;

    if (!full_name || !phone_number || !email || !role_id) {
      return res.status(400).json({ error: "Full Name, phone number, email, and role are required." });
    }

    await client.query('BEGIN');

    const userCheck = await client.query("SELECT * FROM users WHERE id = $1 FOR UPDATE", [targetUserId]);
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "User profile not found." });
    }

    const oldUser = userCheck.rows[0];
    const cleanEmail = email.trim().toLowerCase();
    
    if (cleanEmail !== oldUser.email.toLowerCase()) {
      const emailUniqueCheck = await client.query("SELECT id FROM users WHERE email = $1 FOR UPDATE", [cleanEmail]);
      if (emailUniqueCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "A user with this email address already exists." });
      }
    }

    const editorCheck = await client.query("SELECT name, role_id FROM users WHERE id = $1", [req.user.userId]);
    const editor = editorCheck.rows[0];
    const editorRoleId = parseInt(editor?.role_id, 10);

    // Validate permission scopes
    if (editorRoleId !== 1 && parseInt(oldUser.role_id, 10) === 1) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "Access denied. Only Super Admins can modify Super Admin profiles." });
    }

    if (editorRoleId !== 1 && parseInt(role_id, 10) === 1) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: "Access denied. Only Super Admins can assign the Super Admin role." });
    }

    if (editorRoleId !== 1 && editorRoleId !== 2) {
      if ((oldUser.lab_id && parseInt(oldUser.lab_id, 10) !== parseInt(req.user.labId, 10)) || 
          (lab_id && parseInt(lab_id, 10) !== parseInt(req.user.labId, 10))) {
        await client.query('ROLLBACK');
        return res.status(403).json({ error: "Access denied. You can only modify user profiles inside your own laboratory." });
      }
    }

    const editorName = editor?.name || "System";
    const nowStr = new Date().toLocaleString();

    let statusSqlParts = '';
    const statusParams = [];
    if (status !== oldUser.status) {
      if (status === 'Active') {
        statusSqlParts = `, activated_by = $11, activated_date = $12`;
      } else if (status === 'Inactive') {
        statusSqlParts = `, deactivated_by = $11, deactivated_date = $12`;
      } else if (status === 'Suspended') {
        statusSqlParts = `, suspended_by = $11, suspended_date = $12`;
      }
      statusParams.push(editorName, nowStr);
    }

    let passwordSqlPart = '';
    const updateParams = [
      full_name.trim(), full_name.trim(), phone_number.trim(), cleanEmail,
      employee_id ? employee_id.trim() : null,
      designation ? designation.trim() : null,
      parseInt(role_id, 10), lab_id ? parseInt(lab_id, 10) : null, status
    ];

    if (password) {
      const plaintextPass = password.trim();
      const hashedPassword = await hashPassword(plaintextPass);
      passwordSqlPart = `, password = $13, password_plain = $14`;
      updateParams.push(hashedPassword, plaintextPass);
    }

    const editorIndex = updateParams.length + 1;
    const modifiedDateIndex = editorIndex + 1;
    updateParams.push(editorName, nowStr);

    // Map status parts correctly
    let statusParamsOffset = updateParams.length;
    if (statusSqlParts !== '') {
      statusSqlParts = statusSqlParts.replace('$11', `$${statusParamsOffset + 1}`).replace('$12', `$${statusParamsOffset + 2}`);
      updateParams.push(...statusParams);
    }

    updateParams.push(targetUserId);
    const targetUserIdIndex = updateParams.length;

    await client.query(`
      UPDATE users 
      SET name = $1, full_name = $2, phone_number = $3, email = $4, employee_id = $5, designation = $6, 
          role_id = $7, lab_id = $8, status = $9, modified_by = $${editorIndex}, modified_date = $${modifiedDateIndex}
          ${passwordSqlPart} ${statusSqlParts}
      WHERE id = $${targetUserIdIndex}
    `, updateParams);

    // Sync user locations
    if (Array.isArray(locations)) {
      await client.query("DELETE FROM user_locations WHERE user_id = $1", [targetUserId]);
      for (const locId of locations) {
        await client.query("INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2)", [targetUserId, locId]);
      }
    }

    // Sync user custom permissions
    if (Array.isArray(permissions)) {
      await client.query("DELETE FROM user_permissions WHERE user_id = $1", [targetUserId]);
      for (const permId of permissions) {
        await client.query("INSERT INTO user_permissions (user_id, permission_id) VALUES ($1, $2)", [targetUserId, permId]);
      }
    }

    // Logging
    const newUserRecord = { full_name, email, role_id, lab_id, status, locations, permissions };
    await logActivity(client, req.user.userId, 'UPDATE', 'User Management', 'User', targetUserId, oldUser, newUserRecord, req.headers, req.socket);

    if (parseInt(role_id, 10) !== parseInt(oldUser.role_id, 10)) {
      await logActivity(client, req.user.userId, 'ROLE_CHANGED', 'User Management', 'User', targetUserId, { role_id: oldUser.role_id }, { role_id }, req.headers, req.socket);
    }
    await logActivity(client, req.user.userId, 'PERMISSION_ASSIGNMENT', 'User Management', 'User', targetUserId, null, { permissions }, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({
      success: true,
      message: "User profile updated successfully"
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

/**
 * Direct User status update (Activate/Deactivate/Suspend)
 */
export async function updateUserStatus(req, res, next) {
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (!['Active', 'Inactive', 'Suspended'].includes(status)) {
      return res.status(400).json({ error: "Invalid account status option" });
    }

    const userCheck = await query("SELECT * FROM users WHERE id = $1", [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const oldUser = userCheck.rows[0];

    const editorCheck = await query("SELECT name, role_id FROM users WHERE id = $1", [req.user.userId]);
    const editor = editorCheck.rows[0];
    const editorRoleId = parseInt(editor?.role_id, 10);

    if (editorRoleId !== 1 && parseInt(oldUser.role_id, 10) === 1) {
      return res.status(403).json({ error: "Access denied. Admin role lock restricts modifying Super Admins." });
    }

    if (editorRoleId !== 1 && editorRoleId !== 2 && oldUser.lab_id && parseInt(oldUser.lab_id, 10) !== parseInt(req.user.labId, 10)) {
      return res.status(403).json({ error: "Access denied. You can only modify user profiles inside your own laboratory." });
    }

    const editorName = editor?.name || "System";
    const nowStr = new Date().toLocaleString();

    let statusSqlParts = '';
    const statusParams = [];
    let actionType = 'ACTIVATE';

    if (status === 'Active') {
      statusSqlParts = `activated_by = $2, activated_date = $3`;
      statusParams.push(editorName, nowStr);
      actionType = 'ACTIVATE';
    } else if (status === 'Inactive') {
      statusSqlParts = `deactivated_by = $2, deactivated_date = $3`;
      statusParams.push(editorName, nowStr);
      actionType = 'DEACTIVATE';
    } else if (status === 'Suspended') {
      statusSqlParts = `suspended_by = $2, suspended_date = $3`;
      statusParams.push(editorName, nowStr);
      actionType = 'SUSPEND';
    }

    await query(`
      UPDATE users 
      SET status = $1, ${statusSqlParts}, modified_by = $4, modified_date = $5
      WHERE id = $6
    `, [status, ...statusParams, editorName, nowStr, targetUserId]);

    const client = await getClient();
    try {
      await logActivity(client, req.user.userId, actionType, 'User Management', 'User', targetUserId, { status: oldUser.status }, { status }, req.headers, req.socket);
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: `User profile status updated to ${status} successfully`
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Request access reset
 */
export async function resetAccess(req, res, next) {
  const client = await getClient();
  try {
    const targetUserId = parseInt(req.params.id, 10);
    const userCheck = await query("SELECT * FROM users WHERE id = $1", [targetUserId]);
    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User profile not found." });
    }

    await logActivity(client, req.user.userId, 'RESET_ACCESS', 'User Management', 'User', targetUserId, null, "Password OTP access invitation reset requested", req.headers, req.socket);

    res.json({
      success: true,
      message: "User login OTP verification bypass link refreshed. Email dispatched successfully."
    });
  } catch (err) {
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Fetch profile history trace
 */
export async function getUserHistory(req, res, next) {
  try {
    const targetUserId = req.params.id;

    const result = await query(`
      SELECT ual.* 
      FROM user_activity_logs ual
      WHERE ual.entity_type = 'User' AND ual.entity_id = $1
      ORDER BY ual.timestamp DESC
    `, [targetUserId]);

    res.json({
      success: true,
      history: result.rows
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Fetch active labs accessible by user
 */
export async function getAccessibleLabs(req, res, next) {
  try {
    const userCheck = await query(`
      SELECT u.lab_id, r.role_name 
      FROM users u
      LEFT JOIN roles r ON u.role_id = r.role_id
      WHERE u.id = $1
    `, [req.user.userId]);

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const dbUser = userCheck.rows[0];

    let sql = "SELECT * FROM labs WHERE status = 'Active'";
    const params = [];

    if (dbUser.role_name !== 'Super Admin' && dbUser.lab_id !== null) {
      sql += " AND id = $1";
      params.push(dbUser.lab_id);
    }

    sql += " ORDER BY id ASC";
    const result = await query(sql, params);
    res.json({ success: true, labs: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Fetch all laboratories
 */
export async function getLabs(req, res, next) {
  try {
    const result = await query("SELECT * FROM labs ORDER BY id ASC");
    res.json({ success: true, labs: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new Laboratory and its subunits (Transactional)
 */
export async function createLab(req, res, next) {
  const client = await getClient();
  try {
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can create laboratories." });
    }

    const { name, location_address, has_subunits, sub_units } = req.body;
    if (!name || !location_address) {
      return res.status(400).json({ error: "Lab name and location address are required." });
    }

    await client.query('BEGIN');

    const checkLab = await client.query("SELECT id FROM labs WHERE name = $1 FOR UPDATE", [name.trim()]);
    if (checkLab.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: "A laboratory with this name already exists." });
    }

    const result = await client.query(
      "INSERT INTO labs (name, location_address, status) VALUES ($1, $2, 'Active') RETURNING id",
      [name.trim(), location_address.trim()]
    );

    const labId = result.rows[0].id;

    if (has_subunits && Array.isArray(sub_units)) {
      for (const item of sub_units) {
        const nameOfSubUnit = typeof item === 'string' ? item : item.location_name;
        if (nameOfSubUnit && nameOfSubUnit.trim()) {
          await client.query(
            "INSERT INTO locations (lab_id, location_name) VALUES ($1, $2)",
            [labId, nameOfSubUnit.trim()]
          );
        }
      }
    }

    await logActivity(client, req.user.userId, 'CREATE', 'Administration', 'Lab', labId, null, { name, location_address, sub_units }, req.headers, req.socket);

    await client.query('COMMIT');

    res.status(201).json({ success: true, labId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Retrieve all active subunits for laboratory
 */
export async function getLabSubunits(req, res, next) {
  try {
    const labId = parseInt(req.params.id, 10);
    const result = await query("SELECT * FROM locations WHERE lab_id = $1 AND status = 'Active'", [labId]);
    res.json({ success: true, subunits: result.rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Update laboratory details and its subunits (Transactional)
 */
export async function updateLab(req, res, next) {
  const client = await getClient();
  try {
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can modify laboratories." });
    }

    const labId = parseInt(req.params.id, 10);
    const { name, location_address, status, has_subunits, sub_units } = req.body;

    if (!name || !location_address) {
      return res.status(400).json({ error: "Lab name and location address are required." });
    }

    await client.query('BEGIN');

    const labCheck = await client.query("SELECT * FROM labs WHERE id = $1 FOR UPDATE", [labId]);
    if (labCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Laboratory not found." });
    }
    const oldLab = labCheck.rows[0];

    if (name.trim().toLowerCase() !== oldLab.name.toLowerCase()) {
      const checkLab = await client.query("SELECT id FROM labs WHERE name = $1 FOR UPDATE", [name.trim()]);
      if (checkLab.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: "A laboratory with this name already exists." });
      }
    }

    await client.query(
      "UPDATE labs SET name = $1, location_address = $2, status = $3 WHERE id = $4",
      [name.trim(), location_address.trim(), status || 'Active', labId]
    );

    // Sync sub-units
    if (has_subunits && Array.isArray(sub_units)) {
      const currentLocsRes = await client.query("SELECT location_id, location_name FROM locations WHERE lab_id = $1", [labId]);
      const currentLocs = currentLocsRes.rows;
      const keptIds = [];

      for (const item of sub_units) {
        if (item.location_id) {
          await client.query(
            "UPDATE locations SET location_name = $1 WHERE location_id = $2 AND lab_id = $3",
            [item.location_name.trim(), item.location_id, labId]
          );
          keptIds.push(item.location_id);
        } else if (item.location_name && item.location_name.trim()) {
          const insertRes = await client.query(
            "INSERT INTO locations (lab_id, location_name) VALUES ($1, $2) RETURNING location_id",
            [labId, item.location_name.trim()]
          );
          keptIds.push(insertRes.rows[0].location_id);
        }
      }

      // Delete removed sub-units
      const deleteIds = currentLocs.filter(loc => !keptIds.includes(loc.location_id)).map(loc => loc.location_id);
      for (const delId of deleteIds) {
        await client.query("DELETE FROM locations WHERE location_id = $1", [delId]);
        await client.query("DELETE FROM user_locations WHERE location_id = $1", [delId]);
      }
    } else {
      const currentLocsRes = await client.query("SELECT location_id FROM locations WHERE lab_id = $1", [labId]);
      const currentLocIds = currentLocsRes.rows.map(r => r.location_id);
      for (const delId of currentLocIds) {
        await client.query("DELETE FROM locations WHERE location_id = $1", [delId]);
        await client.query("DELETE FROM user_locations WHERE location_id = $1", [delId]);
      }
    }

    await logActivity(client, req.user.userId, 'UPDATE', 'Administration', 'Lab', labId, oldLab, { name, location_address, status, sub_units }, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({ success: true, message: "Laboratory updated successfully" });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * Delete a laboratory (Transactional)
 */
export async function deleteLab(req, res, next) {
  const client = await getClient();
  try {
    const userRoleCheck = await client.query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);
    if (roleId !== 1) {
      return res.status(403).json({ error: "Access denied. Only Super Admins can delete laboratories." });
    }

    const labId = parseInt(req.params.id, 10);

    await client.query('BEGIN');

    const labCheck = await client.query("SELECT * FROM labs WHERE id = $1 FOR UPDATE", [labId]);
    if (labCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: "Laboratory not found." });
    }

    const currentLocsRes = await client.query("SELECT location_id FROM locations WHERE lab_id = $1", [labId]);
    const currentLocIds = currentLocsRes.rows.map(r => r.location_id);

    // Delete associated locations mapping and the lab
    for (const locId of currentLocIds) {
      await client.query("DELETE FROM user_locations WHERE location_id = $1", [locId]);
    }
    await client.query("DELETE FROM locations WHERE lab_id = $1", [labId]);
    await client.query("DELETE FROM labs WHERE id = $1", [labId]);

    await logActivity(client, req.user.userId, 'DELETE', 'Administration', 'Lab', labId, labCheck.rows[0], null, req.headers, req.socket);

    await client.query('COMMIT');

    res.json({ success: true, message: "Laboratory deleted successfully" });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}
