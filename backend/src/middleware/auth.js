// =============================================
// ParkEase - Firebase Authentication Middleware
// =============================================
const { verifyIdToken } = require('../config/firebase');
const { query } = require('../config/database');

/**
 * Middleware: Authenticate Firebase token
 * Extracts Bearer token from Authorization header,
 * verifies it with Firebase Admin SDK, and attaches
 * the decoded user + local DB user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required. Please provide a valid Bearer token.',
        data: null,
      });
    }

    const token = authHeader.split('Bearer ')[1];

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid token format.',
        data: null,
      });
    }

    // Verify with Firebase
    const decodedToken = await verifyIdToken(token);

    // Lookup the local user by firebase_uid
    console.log(`🔍 Auth: Verifying user ${decodedToken.uid}`);
    const result = await query(
      'SELECT id, firebase_uid, name, phone, email, created_at, updated_at FROM users WHERE firebase_uid = $1',
      [decodedToken.uid]
    );
    console.log(`✅ Auth Result: Found ${result.rows.length} rows`);

    if (result.rows.length === 0) {
      // User is authenticated via Firebase but not yet in our DB.
      // Attach Firebase data so the registration can happen.
      req.user = {
        firebaseUid: decodedToken.uid,
        email: decodedToken.email || null,
        phone: decodedToken.phone_number || null,
        name: decodedToken.name || null,
        isNewUser: true,
      };
    } else {
      req.user = {
        ...result.rows[0],
        firebaseUid: decodedToken.uid,
        isNewUser: false,
      };
    }


    next();
  } catch (err) {
    console.error('🔒 Auth middleware error:', err.message);

    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({
        status: 'error',
        message: 'Token has expired. Please log in again.',
        data: null,
      });
    }

    if (err.code === 'auth/argument-error' || err.code === 'auth/id-token-revoked') {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid authentication token.',
        data: null,
      });
    }

    return res.status(401).json({
      status: 'error',
      message: 'Authentication failed.',
      data: null,
    });
  }
};

/**
 * Middleware: Ensure the user exists in the local database
 * Must be used AFTER authenticate middleware
 */
const requireLocalUser = (req, res, next) => {
  if (req.user.isNewUser) {
    return res.status(403).json({
      status: 'error',
      message: 'Please complete your profile registration first.',
      data: null,
    });
  }
  next();
};

module.exports = { authenticate, requireLocalUser };
