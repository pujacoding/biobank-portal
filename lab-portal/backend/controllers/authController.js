import jwt from 'jsonwebtoken';
import { query } from '../services/dbService.js';
import { generateOtp } from '../utils/crypto.js';

const JWT_SECRET = process.env.JWT_SECRET || 'aura-secret-key-2026';
const otpStore = new Map();

const cleanIdentifier = (id) => id.trim().toLowerCase();

/**
 * Request login OTP
 */
export async function sendOtp(req, res, next) {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ error: "Email or Phone Number is required" });
    }

    const cleanId = cleanIdentifier(identifier);

    // Search user by email or phone
    const userCheck = await query(
      "SELECT * FROM users WHERE LOWER(email) = $1 OR phone_number = $2", 
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
    const otp = generateOtp();
    const expires = Date.now() + 5 * 60 * 1000; // 5 min expiry

    otpStore.set(cleanId, { otp, expires });
    console.log(`[AUTH] Generated OTP for user ${user.name} (${cleanId}): ${otp}`);

    return res.json({ 
      success: true, 
      message: `OTP sent to ${identifier} (Simulated)`,
      otp: otp
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Verify OTP and issue JWT
 */
export async function verifyOtp(req, res, next) {
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
       WHERE LOWER(u.email) = $1 OR u.phone_number = $2`,
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
      ) VALUES ($1, $2, $3, $4, 'Authentication', 'LOGIN', 'User', $5, null, 'User logged in successfully', $6)
    `, [
      user.id, user.name, user.role, user.lab_name || "Aura Biobank Admin Center", 
      String(user.id), clientIp
    ]);

    // Fetch all active permissions for this user
    const permsRes = await query(`
      SELECT p.permission_name FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = $1
      UNION
      SELECT p.permission_name FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = $2
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
    next(error);
  }
}

/**
 * Retrieve current user profile
 */
export async function getProfile(req, res, next) {
  try {
    const userResult = await query(
      `SELECT u.*, r.role_name as role, l.name as lab_name, COALESCE(loc.location_name, l.location_address, '') as lab_location 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN labs l ON u.lab_id = l.id 
       LEFT JOIN user_locations ul ON u.id = ul.user_id
       LEFT JOIN locations loc ON ul.location_id = loc.location_id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Fetch active permissions
    const permsRes = await query(`
      SELECT p.permission_name FROM user_permissions up
      JOIN permissions p ON up.permission_id = p.permission_id
      WHERE up.user_id = $1
      UNION
      SELECT p.permission_name FROM role_permissions rp
      JOIN permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = $2
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
    next(error);
  }
}

/**
 * Log out and record action to audit trail
 */
export async function logout(req, res, next) {
  try {
    const userResult = await query(
      `SELECT u.name, r.role_name as role, l.name as lab_name 
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.role_id
       LEFT JOIN labs l ON u.lab_id = l.id
       WHERE u.id = $1`,
      [req.user.userId]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || "";
      await query(`
        INSERT INTO user_activity_logs (
          user_id, user_name, role, lab_name, module_name, action_type, entity_type, entity_id, old_value, new_value, ip_address
        ) VALUES ($1, $2, $3, $4, 'Authentication', 'LOGOUT', 'User', $5, null, 'User logged out successfully', $6)
      `, [
        req.user.userId, user.name, user.role, user.lab_name || "Aura Biobank Admin Center", 
        String(req.user.userId), clientIp
      ]);
    }
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
}
