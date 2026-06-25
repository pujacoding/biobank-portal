import { query } from '../services/dbService.js';

/**
 * Retrieve system compliance audit logs (scoped to lab membership context if applicable)
 */
export async function getAuditLogs(req, res, next) {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = $1", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);

    let sql = "SELECT * FROM user_activity_logs";
    const params = [];

    // Filter by lab context unless Super Admin (role_id = 1)
    if (req.user.labId && roleId !== 1) {
      const labRes = await query("SELECT name FROM labs WHERE id = $1", [req.user.labId]);
      const labName = labRes.rows[0]?.name || "";
      sql += " WHERE lab_name = $1";
      params.push(labName);
    }

    sql += " ORDER BY timestamp DESC";

    const result = await query(sql, params);
    
    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    next(error);
  }
}
