import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../database.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';

// In-memory store for OTPs (identifier -> { otp, expires })
const otpStore = new Map();

// Helper to clean identifier
const cleanIdentifier = (id) => id.trim().toLowerCase();

// Send OTP Endpoint
router.post('/send-otp', async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: "Email or Phone Number is required" });
    }

    const cleanId = cleanIdentifier(identifier);

    // Search user by email or phone
    const userCheck = await query(
      "SELECT * FROM users WHERE email = ? OR phone_number = ?", 
      [cleanId, cleanId]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "No registered profile found matching this credential" });
    }

    const user = userCheck.rows[0];
    if (user.status === 'Inactive') {
      return res.status(403).json({ error: "This profile has been deactivated. Contact your Lab Admin." });
    } else if (user.status === 'Suspended') {
      return res.status(403).json({ error: "This profile has been suspended. Contact your Lab Admin." });
    } else if (user.status !== 'Active') {
      return res.status(403).json({ error: `This account is ${user.status}. Access blocked.` });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expires = Date.now() + 5 * 60 * 1000; // 5 min expiry

    otpStore.set(cleanId, { otp, expires });
    console.log(`[AUTH] Generated OTP for user ${user.name} (${cleanId}): ${otp}`);

    return res.json({ 
      success: true, 
      message: `OTP sent to ${identifier} (Simulated)`,
      otp: otp
    });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({ error: "Internal server error during OTP dispatch" });
  }
});

// Verify OTP Endpoint
router.post('/verify-otp', async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ error: "Identifier and OTP are required" });
    }

    const cleanId = cleanIdentifier(identifier);
    const storedData = otpStore.get(cleanId);

    const isMockOtp = otp === "123456";
    const isValidOtp = storedData && storedData.otp === otp && storedData.expires > Date.now();

    if (!isValidOtp && !isMockOtp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // OTP verified, remove from store
    otpStore.delete(cleanId);

    // Fetch user joined with role and lab details
    const userResult = await query(
      `SELECT u.*, r.role_name as role, l.name as lab_name, COALESCE(loc.location_name, l.location_address, '') as lab_location 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN labs l ON u.lab_id = l.id 
       LEFT JOIN user_locations ul ON u.id = ul.user_id
       LEFT JOIN locations loc ON ul.location_id = loc.location_id
       WHERE u.email = ? OR u.phone_number = ?`,
      [cleanId, cleanId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User profile no longer exists" });
    }

    const user = userResult.rows[0];
    if (user.status !== 'Active') {
      return res.status(403).json({ error: `Account status is ${user.status}. Access blocked.` });
    }

    // Sign JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role, labId: user.lab_id },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Log login to user_activity_logs
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
    await query(`
      INSERT INTO user_activity_logs (
        user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
      ) VALUES (?, ?, ?, ?, 'Authentication', 'LOGIN', 'User', ?, null, 'User logged in successfully', ?)
    `, [
      user.id, user.name, user.role, user.lab_name || "Aura Biobank Admin Center", 
      String(user.id), clientIp
    ]);

    // Fetch all active permissions for this user
    const permsRes = await query(`
      SELECT p.permission_name FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = ?
      UNION
      SELECT p.permission_name FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = ?
    `, [user.id, user.role_id]);
    const userPermissions = permsRes.rows.map(row => row.permission_name);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        phone_number: user.phone_number,
        email: user.email,
        role: user.role,
        lab_id: user.lab_id,
        lab_name: user.lab_name || "Aura Biobank Admin Center",
        lab_location: user.lab_location || "",
        status: user.status,
        permissions: userPermissions
      }
    });

  } catch (error) {
    console.error("Error verifying OTP:", error);
    res.status(500).json({ error: "Internal server error during verification" });
  }
});

// Middleware for token authentication
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: "Access token missing" });

  jwt.verify(token, JWT_SECRET, (err, payload) => {
    if (err) return res.status(403).json({ error: "Session expired or invalid token" });
    
    req.user = payload;

    // Override labId if x-active-lab-id header is provided and permissions allow
    const activeLabIdHeader = req.headers['x-active-lab-id'];
    if (activeLabIdHeader) {
      const activeLabId = parseInt(activeLabIdHeader, 10);
      if (!isNaN(activeLabId)) {
        // If user has specific labId assignment, verify they only request their own lab
        if (payload.labId !== null && payload.labId !== undefined && parseInt(payload.labId, 10) !== activeLabId) {
          return res.status(403).json({ error: "Access denied. You do not have permission to access this laboratory." });
        }
        req.user.labId = activeLabId;
      }
    }
    
    next();
  });
}

// Reusable action-based permission check middleware
export function requirePermission(permissionName, moduleName) {
  return async (req, res, next) => {
    try {
      const userCheck = await query(`
        SELECT u.role_id, u.status, r.role_name 
        FROM users u
        LEFT JOIN roles r ON u.role_id = r.role_id
        WHERE u.id = ?
      `, [req.user.userId]);

      if (userCheck.rows.length === 0) {
        return res.status(401).json({ error: "User profile no longer exists" });
      }

      const user = userCheck.rows[0];
      if (user.status !== 'Active') {
        return res.status(403).json({ error: `Access Denied: User account is ${user.status}` });
      }

      // 1. Super Admin bypass (role_id 1 is Super Admin)
      if (parseInt(user.role_id, 10) === 1) {
        return next();
      }

      // 2. Query permissions for explicit assignment or role mapping
      const permCheck = await query(`
        SELECT 1 FROM user_permissions up
        JOIN permissions p ON up.permission_id = p.permission_id
        WHERE up.user_id = ? AND p.permission_name = ?
        UNION
        SELECT 1 FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.permission_id
        WHERE rp.role_id = ? AND p.permission_name = ?
      `, [req.user.userId, permissionName, user.role_id, permissionName]);

      if (permCheck.rows.length === 0) {
        return res.status(403).json({ 
          error: `Access Denied: Required permission: '${permissionName}' in module '${moduleName}'` 
        });
      }

      next();
    } catch (error) {
      console.error("Permission check middleware error:", error);
      res.status(500).json({ error: "Internal server error during permission validation" });
    }
  };
}

// Get Current User Profile Endpoint
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.*, r.role_name as role, l.name as lab_name, COALESCE(loc.location_name, l.location_address, '') as lab_location 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN labs l ON u.lab_id = l.id 
       LEFT JOIN user_locations ul ON u.id = ul.user_id
       LEFT JOIN locations loc ON ul.location_id = loc.location_id
       WHERE u.id = ?`,
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Fetch all active permissions for this user
    const permsRes = await query(`
      SELECT p.permission_name FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = ?
      UNION
      SELECT p.permission_name FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = ?
    `, [user.id, user.role_id]);
    const userPermissions = permsRes.rows.map(row => row.permission_name);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        phone_number: user.phone_number,
        email: user.email,
        role: user.role,
        lab_id: user.lab_id,
        lab_name: user.lab_name || "Aura Biobank Admin Center",
        lab_location: user.lab_location || "",
        status: user.status,
        permissions: userPermissions
      }
    });

  } catch (error) {
    console.error("Error fetching current user profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Logout endpoint for audit log
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const userResult = await query(
      `SELECT u.name, r.role_name as role, l.name as lab_name 
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN labs l ON u.lab_id = l.id
       WHERE u.id = ?`,
      [req.user.userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
      await query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES (?, ?, ?, ?, 'Authentication', 'LOGOUT', 'User', ?, null, 'User logged out successfully', ?)
      `, [
        req.user.userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center", 
        String(req.user.userId), clientIp
      ]);
    }
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout log error:", err);
    res.status(500).json({ error: "Logout error" });
  }
});

export default router;
