const bcrypt = require('bcryptjs');
const express = require('express');
const pool = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function needsEmailVerification(role) {
  return role === 'teacher' || role === 'student';
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

router.get('/summary', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const [[userCount]] = await pool.query('SELECT COUNT(*) AS total_users FROM users');
    const [[examCount]] = await pool.query('SELECT COUNT(*) AS total_exams FROM exams');
    const [[attemptCount]] = await pool.query('SELECT COUNT(*) AS total_attempts FROM exam_attempts');

    res.json({
      total_users: userCount.total_users,
      total_exams: examCount.total_exams,
      total_attempts: attemptCount.total_attempts
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT users.id, users.name, users.email, users.class_name, users.is_active,
              users.email_verified_at, users.verification_code, users.verification_code_expires_at,
              roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       ORDER BY users.id ASC`
    );

    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

router.get('/exams', authenticate, authorize('admin', 'teacher'), async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT exams.id, exams.title, exams.duration_minutes, exams.is_active,
              subjects.name AS subject_name, users.name AS teacher_name
       FROM exams
       JOIN subjects ON subjects.id = exams.subject_id
       JOIN users ON users.id = exams.teacher_id
       ORDER BY exams.id DESC`
    );

    res.json({ exams: rows });
  } catch (error) {
    next(error);
  }
});

router.post('/users', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || 'student').trim();
    const className = String(req.body.class_name || '').trim() || null;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nama, email, dan password wajib diisi.' });
    }

    const [[roleRow]] = await pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [role]);

    if (!roleRow) {
      return res.status(400).json({ message: 'Role tidak valid.' });
    }

    const hash = await bcrypt.hash(password, 10);
    const verificationRequired = needsEmailVerification(role);
    const verificationCode = verificationRequired ? generateVerificationCode() : null;
    const verifiedAt = verificationRequired ? null : new Date();
    const expiresAt = verificationRequired ? addDays(7) : null;
    const sentAt = verificationRequired ? new Date() : null;

    await pool.query(
      `INSERT INTO users
       (name, email, password, role_id, class_name, is_active,
        email_verified_at, verification_code, verification_code_expires_at, verification_sent_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        name,
        email,
        hash,
        roleRow.id,
        className,
        verifiedAt,
        verificationCode,
        expiresAt,
        sentAt
      ]
    );

    res.json({
      message: verificationRequired
        ? 'User berhasil ditambahkan. Berikan kode verifikasi kepada user.'
        : 'User berhasil ditambahkan.',
      verification_required: verificationRequired,
      verification_code: verificationCode
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email sudah terdaftar.' });
    }

    next(error);
  }
});

router.patch('/users/:id/verify', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    await pool.execute(
      `UPDATE users
       SET email_verified_at = NOW(),
           verification_code = NULL,
           verification_code_expires_at = NULL
       WHERE id = ?`,
      [userId]
    );

    res.json({ message: 'User berhasil diverifikasi oleh admin.' });
  } catch (error) {
    next(error);
  }
});

router.patch('/users/:id/regenerate-code', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    const [rows] = await pool.execute(
      `SELECT users.id, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.id = ?
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const user = rows[0];

    if (!needsEmailVerification(user.role)) {
      return res.status(400).json({ message: 'User ini tidak membutuhkan kode verifikasi.' });
    }

    const verificationCode = generateVerificationCode();

    await pool.execute(
      `UPDATE users
       SET email_verified_at = NULL,
           verification_code = ?,
           verification_code_expires_at = ?,
           verification_sent_at = NOW()
       WHERE id = ?`,
      [verificationCode, addDays(7), userId]
    );

    res.json({
      message: 'Kode verifikasi baru berhasil dibuat.',
      verification_code: verificationCode
    });
  } catch (error) {
    next(error);
  }
});

router.put('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '').trim();
    const className = String(req.body.class_name || '').trim() || null;

    if (!name || !email || !role) {
      return res.status(400).json({ message: 'Nama, email, dan role wajib diisi.' });
    }

    const [[existingUser]] = await pool.query(
      'SELECT id, role_id FROM users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!existingUser) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    const [[roleRow]] = await pool.query('SELECT id FROM roles WHERE name = ? LIMIT 1', [role]);

    if (!roleRow) {
      return res.status(400).json({ message: 'Role tidak valid.' });
    }

    const roleChangedToAdmin =
      Number(existingUser.role_id) !== Number(roleRow.id) &&
      !needsEmailVerification(role);

    const fields = [
      'name = ?',
      'email = ?',
      'role_id = ?',
      'class_name = ?'
    ];

    const params = [name, email, roleRow.id, className];

    if (roleChangedToAdmin) {
      fields.push('email_verified_at = NOW()');
      fields.push('verification_code = NULL');
      fields.push('verification_code_expires_at = NULL');
    }

    if (password) {
      fields.push('password = ?');
      params.push(await bcrypt.hash(password, 10));
    }

    params.push(userId);

    await pool.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    res.json({ message: 'User berhasil diperbarui.' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email sudah dipakai user lain.' });
    }

    next(error);
  }
});

router.delete('/users/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);

    if (userId === Number(req.user.id)) {
      return res.status(400).json({ message: 'Anda tidak dapat menghapus akun Anda sendiri.' });
    }

    const [[targetUser]] = await pool.query(
      `SELECT users.id, roles.name AS role
       FROM users
       JOIN roles ON roles.id = users.role_id
       WHERE users.id = ?
       LIMIT 1`,
      [userId]
    );

    if (!targetUser) {
      return res.status(404).json({ message: 'User tidak ditemukan.' });
    }

    if (targetUser.role === 'admin') {
      const [[adminCount]] = await pool.query(
        `SELECT COUNT(*) AS total
         FROM users
         JOIN roles ON roles.id = users.role_id
         WHERE roles.name = 'admin'`
      );

      if (Number(adminCount.total) <= 1) {
        return res.status(400).json({ message: 'Tidak dapat menghapus admin terakhir.' });
      }
    }

    await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

    res.json({ message: 'User berhasil dihapus.' });
  } catch (error) {
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return res.status(400).json({
        message: 'User ini masih memiliki ujian yang dibuat. Hapus atau pindahkan ujiannya terlebih dahulu sebelum menghapus user.'
      });
    }

    next(error);
  }
});

module.exports = router;