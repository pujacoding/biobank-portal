import jwt from 'jsonwebtoken';
import { query } from '../services/dbService.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';
const AUTH_CACHE_TTL_MS = 30000;
const userAuthCache = new Map();

/**
 * Invalidate cached user status/permissions (call after user/role/permission mutations).
 * @param {number|string} [userId]
 */
export function invalidatePermissionCache(userId) {
  if (userId !== undefined && userId !== null) {
    userAuthCache.delete(Number(userId));
    userAuthCache.delete(String(userId));
  } else {
    userAuthCache.clear();
  }
}

async function getUserAuthContext(userId) {
  const key = Number(userId) || userId;
  const cached = userAuthCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const res = await query(`
    SELECT
      u.id,
      u.role_id,
      u.status,
      u.email,
      u.name,
      r.role_name,
      COALESCE(
        (
          SELECT ARRAY_AGG(DISTINCT p_name)
          FROM (
            SELECT p.permission_name AS p_name
            FROM user_permissions up
            JOIN permissions p ON up.permission_id = p.permission_id
            WHERE up.user_id = u.id
            UNION
            SELECT p.permission_name AS p_name
            FROM role_permissions rp
            JOIN permissions p ON rp.permission_id = p.permission_id
            WHERE rp.role_id = u.role_id
          ) perms
        ),
        ARRAY[]::text[]
      ) AS permissions
    FROM users u
    LEFT JOIN roles r ON u.role_id = r.role_id
    WHERE u.id = $1
  `, [userId]);

  if (res.rows.length === 0) {
    userAuthCache.delete(key);
    return null;
  }

  const row = res.rows[0];
  const ctx = {
    roleId: parseInt(row.role_id, 10),
    roleName: row.role_name,
    status: row.status,
    email: row.email,
    name: row.name,
    permissions: new Set(row.permissions || []),
    expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
  };
  userAuthCache.set(key, ctx);
  return ctx;
}

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
      const ctx = await getUserAuthContext(req.user.userId);
      if (!ctx) {
        return res.status(401).json({ error: "User profile no longer exists" });
      }

      if (ctx.status !== 'Active') {
        return res.status(403).json({ error: `Access Denied: User account is ${ctx.status}` });
      }

      // Enrich req.user so downstream controllers avoid redundant user lookups
      req.user.roleId = ctx.roleId;
      req.user.role = req.user.role || ctx.roleName;
      req.user.email = ctx.email;
      req.user.name = ctx.name;

      // Super Admin bypass (role_id 1 is Super Admin)
      if (ctx.roleId === 1) {
        return next();
      }

      if (!ctx.permissions.has(permissionName)) {
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
    const ctx = await getUserAuthContext(userId);
    if (!ctx || ctx.status !== 'Active') return false;
    if (ctx.roleId === 1) return true;
    return ctx.permissions.has(permissionName);
  } catch (err) {
    console.error("Helper permission check failed:", err);
    return false;
  }
}
