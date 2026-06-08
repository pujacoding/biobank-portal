import express from 'express';
import { query } from '../database.js';
import { authenticateToken, requirePermission } from './auth.js';

const router = express.Router();

// Retrieve all system audit logs (Protected by custom permissions)
router.get('/', authenticateToken, requirePermission('View Audit Logs', 'Administration'), async (req, res) => {
  try {
    const userRoleCheck = await query("SELECT role_id FROM users WHERE id = ?", [req.user.userId]);
    const roleId = parseInt(userRoleCheck.rows[0]?.role_id, 10);

    let sql = "SELECT * FROM user_activity_logs";
    const params = [];

    if (req.user.labId) {
      // Get lab name of the active context
      const labRes = await query("SELECT name FROM labs WHERE id = ?", [req.user.labId]);
      const labName = labRes.rows[0]?.name || "";
      sql += " WHERE lab_name = ?";
      params.push(labName);
    }

    sql += " ORDER BY timestamp DESC";

    const result = await query(sql, params);
    
    res.json({
      success: true,
      logs: result.rows
    });
  } catch (error) {
    console.error("Error fetching activity audit logs:", error);
    res.status(500).json({ error: "Internal server error during audit logs retrieval" });
  }
});

export default router;
