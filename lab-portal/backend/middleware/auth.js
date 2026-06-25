import jwt from 'jsonwebtoken';
import { query } from '../services/dbService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';

/**
 * Middleware: Authenticate incoming requests using JWT
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access token missing" });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: "Session expired or invalid token" });
    
    req.user = payload;

    // Optional active lab context override via custom headers
    const activeLabIdHeader = req.headers['x-active-lab-id'];
    if (activeLabIdHeader) {
      const activeLabId = parseInt(activeLabIdHeader, 10);
      if (!isNaN(activeLabId)) {
        if (payload.labId !== null && payload.labId !== undefined && parseInt(payload.labId, 10) !== activeLabId) {
          return res.status(403).json({ error: "Access denied. You do not have permission to access this laboratory." });
        }
        req.user.labId = activeLabId;
      }
    }
    
    next();
  });
}

/**
 * Middleware: Require functional permission assignment for RBAC security
 * @param {string} permissionName 
 * @param {string} moduleName 
 */
export function requirePermission(permissionName, moduleName) {
  return async (req, res, next) => {
    try {
      const userCheck = await query(`
        SELECT u.role_id, u.status, r.role_name 
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.role_id
        WHERE u.id = $1
      `, [req.user.userId]);

      if (userCheck.rows.length === 0) {
        return res.status(401).json({ error: "User profile no longer exists" });
      }

      const user = userCheck.rows[0];
      if (user.status !== 'Active') {
        return res.status(403).json({ error: `Access Denied: User account is ${user.status}` });
      }

      // Super Admin bypass (role_id 1 is Super Admin)
      if (parseInt(user.role_id, 10) === 1) {
        return next();
      }

      // Dynamic lookup: Check direct user overrides or role matrix permissions
      const permCheck = await query(`
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.permission_id
        WHERE up.user_id = $1 AND p.permission_name = $2
        UNION
        SELECT 1 FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = $3 AND p.permission_name = $4
      `, [req.user.userId, permissionName, user.role_id, permissionName]);

      if (permCheck.rows.length === 0) {
        return res.status(403).json({ 
          error: `Access Denied: Required permission: '${permissionName}' in module '${moduleName}'` 
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Reusable helper for controller layer to verify user permissions dynamically.
 * @param {number} userId 
 * @param {string} permissionName 
 * @returns {Promise<boolean>}
 */
export async function checkUserPermission(userId, permissionName) {
  try {
    const userCheck = await query("SELECT role_id FROM users WHERE id = $1", [userId]);
    if (userCheck.rows.length === 0) return false;
    
    const roleId = parseInt(userCheck.rows[0].role_id, 10);
    if (roleId === 1) return true; // Super Admin bypass

    const permCheck = await query(`
      SELECT 1 FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = $1 AND p.permission_name = $2
      UNION
      SELECT 1 FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = $3 AND p.permission_name = $4
    `, [userId, permissionName, roleId, permissionName]);

    return permCheck.rows.length > 0;
  } catch (err) {
    console.error("Helper permission check failed:", err);
    return false;
  }
}
