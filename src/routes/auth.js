const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

function needsEmailVerification(role) {
  return role === 'teacher' || role === 'student';
}

router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email dan password wajib diisi.' });
    }

    const [rows] = await pool.execute(
      `SELECT users.id, users.name, users.email, users.password, users.class_name,
              users.is_active, users.email_verified_at, users.verification_code,
              roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ message: 'Akun tidak aktif.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email atau password salah.' });
    }

    if (needsEmailVerification(user.role) && !user.email_verified_at) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Akun Anda belum diverifikasi. Masukkan kode verifikasi terlebih dahulu.',
        email: user.email
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        name: user.name,
        email: user.email,
        email_verified_at: user.email_verified_at
      },
      process.env.JWT_SECRET || 'local_secret',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    res.json({
      message: 'Login berhasil.',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        class_name: user.class_name,
        email_verified_at: user.email_verified_at
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();

    if (!email || !code) {
      return res.status(400).json({ message: 'Email dan kode verifikasi wajib diisi.' });
    }

    const [rows] = await pool.execute(
      `SELECT users.id, users.name, users.email, users.email_verified_at,
              users.verification_code, users.verification_code_expires_at,
              roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.email = ?
       LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Email tidak ditemukan.' });
    }

    const user = rows[0];

    if (!needsEmailVerification(user.role)) {
      return res.status(400).json({ message: 'Role ini tidak membutuhkan verifikasi email.' });
    }

    if (user.email_verified_at) {
      return res.json({ message: 'Email sudah terverifikasi. Silakan login.' });
    }

    if (!user.verification_code) {
      return res.status(400).json({ message: 'Kode verifikasi belum dibuat. Hubungi admin.' });
    }

    if (String(user.verification_code) !== code) {
      return res.status(400).json({ message: 'Kode verifikasi salah.' });
    }

    if (
      user.verification_code_expires_at &&
      new Date(user.verification_code_expires_at).getTime() < Date.now()
    ) {
      return res.status(400).json({ message: 'Kode verifikasi sudah kedaluwarsa. Minta kode baru ke admin.' });
    }

    await pool.execute(
      `UPDATE users
       SET email_verified_at = NOW(),
           verification_code = NULL,
           verification_code_expires_at = NULL
       WHERE id = ?`,
      [user.id]
    );

    res.json({ message: 'Email berhasil diverifikasi. Silakan login.' });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;