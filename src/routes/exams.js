const express = require('express');
const pool = require('../config/db');
const {
  authenticate,
  authorize
} = require('../middleware/auth');

const router = express.Router();

const MAX_EXAM_ATTEMPTS = 2;

function isExamCurrentlyActive(exam) {
  const now = new Date();

  const startsOk =
    !exam.start_time ||
    new Date(exam.start_time) <= now;

  const endsOk =
    !exam.end_time ||
    new Date(exam.end_time) >= now;

  return (
    Boolean(exam.is_active) &&
    startsOk &&
    endsOk
  );
}

function toNumber(value, fallback = 0) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : fallback;
}

function toNullableDatetime(value) {
  const trimmed = String(
    value || ''
  ).trim();

  if (!trimmed) {
    return null;
  }

  const normalized = trimmed
    .replace('T', ' ')
    .slice(0, 19);

  return normalized.length === 16
    ? `${normalized}:00`
    : normalized;
}

function toBooleanNumber(value) {
  return (
    value === true ||
    value === 1 ||
    value === '1' ||
    value === 'true' ||
    value === 'on'
  )
    ? 1
    : 0;
}

async function getExamForAccess(examId) {
  const [rows] = await pool.execute(
    `SELECT id, teacher_id, subject_id
     FROM exams
     WHERE id = ?
     LIMIT 1`,
    [examId]
  );

  return rows[0] || null;
}

async function ensureCanManageExam(req, examId) {
  const exam = await getExamForAccess(examId);

  if (!exam) {
    const error = new Error(
      'Ujian tidak ditemukan.'
    );

    error.status = 404;

    throw error;
  }

  if (
    req.user.role === 'teacher' &&
    Number(exam.teacher_id) !== Number(req.user.id)
  ) {
    const error = new Error(
      'Guru hanya boleh mengelola ujian miliknya sendiri.'
    );

    error.status = 403;

    throw error;
  }

  return exam;
}

async function resolveTeacherId(
  req,
  teacherIdFromBody
) {
  if (req.user.role === 'teacher') {
    return Number(req.user.id);
  }

  const teacherId = toNumber(
    teacherIdFromBody,
    0
  );

  if (!teacherId) {
    const error = new Error(
      'Admin wajib memilih guru pengampu.'
    );

    error.status = 400;

    throw error;
  }

  const [rows] = await pool.execute(
    `SELECT users.id
     FROM users
     JOIN roles
       ON roles.id = users.role_id
     WHERE users.id = ?
       AND roles.name = 'teacher'
       AND users.is_active = 1
     LIMIT 1`,
    [teacherId]
  );

  if (rows.length === 0) {
    const error = new Error(
      'Guru pengampu tidak valid.'
    );

    error.status = 400;

    throw error;
  }

  return teacherId;
}

/*
|--------------------------------------------------------------------------
| Daftar ujian siswa
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT
            exams.id,
            exams.title,
            exams.description,
            exams.duration_minutes,
            exams.start_time,
            exams.end_time,
            exams.is_active,
            subjects.name AS subject_name,
            users.name AS teacher_name,
            latest_attempt.status AS attempt_status,
            latest_attempt.score,
            COALESCE(
              attempt_stats.total_attempts,
              0
            ) AS total_attempts,
            attempt_stats.best_score
         FROM exams
         JOIN subjects
           ON subjects.id = exams.subject_id
         JOIN users
           ON users.id = exams.teacher_id
         LEFT JOIN (
           SELECT
             exam_id,
             COUNT(*) AS total_attempts,
             MAX(
               CASE
                 WHEN status = 'submitted'
                   THEN score
                 ELSE NULL
               END
             ) AS best_score,
             MAX(id) AS latest_attempt_id
           FROM exam_attempts
           WHERE user_id = ?
           GROUP BY exam_id
         ) AS attempt_stats
           ON attempt_stats.exam_id = exams.id
         LEFT JOIN exam_attempts AS latest_attempt
           ON latest_attempt.id =
              attempt_stats.latest_attempt_id
         WHERE exams.is_active = 1
         ORDER BY exams.id DESC`,
        [req.user.id]
      );

      const exams = rows.map((exam) => {
        const totalAttempts = Number(
          exam.total_attempts || 0
        );

        return {
          ...exam,
          total_attempts: totalAttempts,
          max_attempts: MAX_EXAM_ATTEMPTS,
          is_completed:
            totalAttempts >= MAX_EXAM_ATTEMPTS
        };
      });

      return res.json({ exams });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Daftar ujian untuk admin dan guru
|--------------------------------------------------------------------------
*/

router.get(
  '/manage',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      let sql = `
        SELECT
          exams.id,
          exams.subject_id,
          exams.teacher_id,
          exams.title,
          exams.description,
          exams.duration_minutes,
          exams.start_time,
          exams.end_time,
          exams.is_active,
          subjects.name AS subject_name,
          users.name AS teacher_name,
          COUNT(questions.id) AS total_questions
        FROM exams
        JOIN subjects
          ON subjects.id = exams.subject_id
        JOIN users
          ON users.id = exams.teacher_id
        LEFT JOIN questions
          ON questions.exam_id = exams.id
      `;

      const params = [];

      if (req.user.role === 'teacher') {
        sql += `
          WHERE exams.teacher_id = ?
        `;

        params.push(req.user.id);
      }

      sql += `
        GROUP BY
          exams.id,
          exams.subject_id,
          exams.teacher_id,
          exams.title,
          exams.description,
          exams.duration_minutes,
          exams.start_time,
          exams.end_time,
          exams.is_active,
          subjects.name,
          users.name
        ORDER BY exams.id DESC
      `;

      const [rows] = await pool.execute(
        sql,
        params
      );

      return res.json({ exams: rows });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Daftar mata pelajaran
|--------------------------------------------------------------------------
*/

router.get(
  '/manage/subjects',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      let sql = `
        SELECT
          subjects.id,
          subjects.name,
          subjects.description,
          subjects.teacher_id,
          users.name AS teacher_name
        FROM subjects
        LEFT JOIN users
          ON users.id = subjects.teacher_id
      `;

      const params = [];

      if (req.user.role === 'teacher') {
        sql += `
          WHERE subjects.teacher_id IS NULL
             OR subjects.teacher_id = ?
        `;

        params.push(req.user.id);
      }

      sql += `
        ORDER BY subjects.name ASC
      `;

      const [rows] = await pool.execute(
        sql,
        params
      );

      return res.json({
        subjects: rows
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Tambah mata pelajaran
|--------------------------------------------------------------------------
*/

router.post(
  '/manage/subjects',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const name = String(
        req.body.name || ''
      ).trim();

      const description =
        String(
          req.body.description || ''
        ).trim() || null;

      const teacherId =
        req.user.role === 'teacher'
          ? req.user.id
          : req.body.teacher_id
            ? Number(req.body.teacher_id)
            : null;

      if (!name) {
        return res.status(400).json({
          message:
            'Nama mata pelajaran wajib diisi.'
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO subjects
          (
            name,
            description,
            teacher_id
          )
         VALUES (?, ?, ?)`,
        [
          name,
          description,
          teacherId
        ]
      );

      return res.status(201).json({
        message:
          'Mata pelajaran berhasil ditambahkan.',
        subject_id: result.insertId
      });
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        return res.status(400).json({
          message:
            'Mata pelajaran sudah ada.'
        });
      }

      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Hapus mata pelajaran
|--------------------------------------------------------------------------
*/

router.delete(
  '/manage/subjects/:subjectId',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const subjectId = toNumber(
        req.params.subjectId,
        0
      );

      if (!subjectId) {
        return res.status(400).json({
          message:
            'ID mata pelajaran tidak valid.'
        });
      }

      const [subjectRows] =
        await pool.execute(
          `SELECT id, teacher_id
           FROM subjects
           WHERE id = ?
           LIMIT 1`,
          [subjectId]
        );

      if (subjectRows.length === 0) {
        return res.status(404).json({
          message:
            'Mata pelajaran tidak ditemukan.'
        });
      }

      const subject = subjectRows[0];

      if (
        req.user.role === 'teacher' &&
        Number(subject.teacher_id) !==
          Number(req.user.id)
      ) {
        return res.status(403).json({
          message:
            'Guru hanya boleh menghapus mata pelajaran miliknya sendiri.'
        });
      }

      await pool.execute(
        `DELETE FROM subjects
         WHERE id = ?`,
        [subjectId]
      );

      return res.json({
        message:
          'Mata pelajaran berhasil dihapus beserta ujian dan soal terkait.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Tambah ujian
|--------------------------------------------------------------------------
*/

router.post(
  '/manage',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const subjectId = toNumber(
        req.body.subject_id,
        0
      );

      const teacherId =
        await resolveTeacherId(
          req,
          req.body.teacher_id
        );

      const title = String(
        req.body.title || ''
      ).trim();

      const description =
        String(
          req.body.description || ''
        ).trim() || null;

      const durationMinutes = toNumber(
        req.body.duration_minutes,
        30
      );

      const startTime =
        toNullableDatetime(
          req.body.start_time
        );

      const endTime =
        toNullableDatetime(
          req.body.end_time
        );

      const isActive = toBooleanNumber(
        req.body.is_active
      );

      if (!subjectId || !title) {
        return res.status(400).json({
          message:
            'Mata pelajaran dan judul ujian wajib diisi.'
        });
      }

      const [subjectRows] =
        await pool.execute(
          `SELECT id
           FROM subjects
           WHERE id = ?
           LIMIT 1`,
          [subjectId]
        );

      if (subjectRows.length === 0) {
        return res.status(400).json({
          message:
            'Mata pelajaran tidak ditemukan.'
        });
      }

      const [result] = await pool.execute(
        `INSERT INTO exams
          (
            subject_id,
            teacher_id,
            title,
            description,
            duration_minutes,
            start_time,
            end_time,
            is_active
          )
         VALUES (
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?,
           ?
         )`,
        [
          subjectId,
          teacherId,
          title,
          description,
          durationMinutes,
          startTime,
          endTime,
          isActive
        ]
      );

      return res.status(201).json({
        message:
          'Ujian berhasil ditambahkan.',
        exam_id: result.insertId
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Edit ujian
|--------------------------------------------------------------------------
*/

router.put(
  '/manage/:examId',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      await ensureCanManageExam(
        req,
        examId
      );

      const subjectId = toNumber(
        req.body.subject_id,
        0
      );

      const teacherId =
        req.user.role === 'admin'
          ? await resolveTeacherId(
              req,
              req.body.teacher_id
            )
          : req.user.id;

      const title = String(
        req.body.title || ''
      ).trim();

      const description =
        String(
          req.body.description || ''
        ).trim() || null;

      const durationMinutes = toNumber(
        req.body.duration_minutes,
        30
      );

      const startTime =
        toNullableDatetime(
          req.body.start_time
        );

      const endTime =
        toNullableDatetime(
          req.body.end_time
        );

      const isActive = toBooleanNumber(
        req.body.is_active
      );

      if (!subjectId || !title) {
        return res.status(400).json({
          message:
            'Mata pelajaran dan judul ujian wajib diisi.'
        });
      }

      await pool.execute(
        `UPDATE exams
         SET
           subject_id = ?,
           teacher_id = ?,
           title = ?,
           description = ?,
           duration_minutes = ?,
           start_time = ?,
           end_time = ?,
           is_active = ?
         WHERE id = ?`,
        [
          subjectId,
          teacherId,
          title,
          description,
          durationMinutes,
          startTime,
          endTime,
          isActive,
          examId
        ]
      );

      return res.json({
        message:
          'Ujian berhasil diperbarui.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Hapus ujian
|--------------------------------------------------------------------------
*/

router.delete(
  '/manage/:examId',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      await ensureCanManageExam(
        req,
        examId
      );

      await pool.execute(
        `DELETE FROM exams
         WHERE id = ?`,
        [examId]
      );

      return res.json({
        message:
          'Ujian berhasil dihapus.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Daftar soal untuk admin dan guru
|--------------------------------------------------------------------------
*/

router.get(
  '/manage/:examId/questions',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      await ensureCanManageExam(
        req,
        examId
      );

      const [questionRows] =
        await pool.execute(
          `SELECT
              id,
              question_text,
              point,
              question_order
           FROM questions
           WHERE exam_id = ?
           ORDER BY
             question_order ASC,
             id ASC`,
          [examId]
        );

      const [optionRows] =
        await pool.execute(
          `SELECT
              options.id,
              options.question_id,
              options.option_label,
              options.option_text,
              options.is_correct
           FROM options
           JOIN questions
             ON questions.id =
                options.question_id
           WHERE questions.exam_id = ?
           ORDER BY
             options.question_id ASC,
             options.option_label ASC`,
          [examId]
        );

      const optionsByQuestion =
        optionRows.reduce(
          (result, option) => {
            if (!result[option.question_id]) {
              result[option.question_id] = [];
            }

            result[option.question_id].push(
              option
            );

            return result;
          },
          {}
        );

      const questions = questionRows.map(
        (question) => ({
          ...question,
          options:
            optionsByQuestion[
              question.id
            ] || []
        })
      );

      return res.json({ questions });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Tambah soal
|--------------------------------------------------------------------------
*/

router.post(
  '/manage/:examId/questions',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      const exam =
        await ensureCanManageExam(
          req,
          examId
        );

      const questionText = String(
        req.body.question_text || ''
      ).trim();

      const point = toNumber(
        req.body.point,
        1
      );

      const questionOrder = toNumber(
        req.body.question_order,
        1
      );

      const difficultyLevel = [
        'mudah',
        'sedang',
        'sulit'
      ].includes(
        String(
          req.body.difficulty_level || ''
        ).toLowerCase()
      )
        ? String(
            req.body.difficulty_level
          ).toLowerCase()
        : 'mudah';

      const saveToBank =
        req.body.save_to_bank !== false &&
        req.body.save_to_bank !== 'false' &&
        req.body.save_to_bank !== 0 &&
        req.body.save_to_bank !== '0';

      const options = Array.isArray(
        req.body.options
      )
        ? req.body.options
        : [];

      const correctLabel = String(
        req.body.correct_label || ''
      )
        .trim()
        .toUpperCase();

      if (
        !questionText ||
        options.length < 2 ||
        !correctLabel
      ) {
        return res.status(400).json({
          message:
            'Soal, minimal 2 pilihan jawaban, dan jawaban benar wajib diisi.'
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      const [questionResult] =
        await connection.execute(
          `INSERT INTO questions
            (
              exam_id,
              question_text,
              point,
              question_order
            )
           VALUES (?, ?, ?, ?)`,
          [
            examId,
            questionText,
            point,
            questionOrder
          ]
        );

      const questionId =
        questionResult.insertId;

      let insertedOptions = 0;
      let correctOptionInserted = false;

      for (const option of options) {
        const label = String(
          option.label || ''
        )
          .trim()
          .toUpperCase();

        const text = String(
          option.text || ''
        ).trim();

        if (!label || !text) {
          continue;
        }

        const isCorrect =
          label === correctLabel ? 1 : 0;

        if (isCorrect) {
          correctOptionInserted = true;
        }

        await connection.execute(
          `INSERT INTO options
            (
              question_id,
              option_label,
              option_text,
              is_correct
            )
           VALUES (?, ?, ?, ?)`,
          [
            questionId,
            label,
            text,
            isCorrect
          ]
        );

        insertedOptions += 1;
      }

      if (
        insertedOptions < 2 ||
        !correctOptionInserted
      ) {
        const error = new Error(
          'Minimal 2 pilihan valid dan jawaban benar wajib tersedia.'
        );

        error.status = 400;

        throw error;
      }

      let bankQuestionId = null;

      if (saveToBank) {
        const [bankResult] =
          await connection.execute(
            `INSERT INTO question_bank
              (
                subject_id,
                created_by,
                question_text,
                difficulty_level,
                point
              )
             VALUES (?, ?, ?, ?, ?)`,
            [
              exam.subject_id,
              req.user.id,
              questionText,
              difficultyLevel,
              point
            ]
          );

        bankQuestionId =
          bankResult.insertId;

        for (const option of options) {
          const label = String(
            option.label || ''
          )
            .trim()
            .toUpperCase();

          const text = String(
            option.text || ''
          ).trim();

          if (!label || !text) {
            continue;
          }

          const isCorrect =
            label === correctLabel
              ? 1
              : 0;

          await connection.execute(
            `INSERT INTO question_bank_options
              (
                bank_question_id,
                option_label,
                option_text,
                is_correct
              )
             VALUES (?, ?, ?, ?)`,
            [
              bankQuestionId,
              label,
              text,
              isCorrect
            ]
          );
        }
      }

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        message: saveToBank
          ? 'Soal berhasil ditambahkan dan disimpan ke Bank Soal.'
          : 'Soal berhasil ditambahkan.',
        question_id: questionId,
        bank_question_id: bankQuestionId
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      next(error);
    } finally {
      connection.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Edit soal
|--------------------------------------------------------------------------
*/

router.put(
  '/manage/questions/:questionId',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      const questionId = Number(
        req.params.questionId
      );

      if (
        !Number.isInteger(questionId) ||
        questionId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID soal tidak valid.'
        });
      }

      const [questionRows] =
        await pool.execute(
          `SELECT exam_id
           FROM questions
           WHERE id = ?
           LIMIT 1`,
          [questionId]
        );

      if (questionRows.length === 0) {
        return res.status(404).json({
          message:
            'Soal tidak ditemukan.'
        });
      }

      await ensureCanManageExam(
        req,
        questionRows[0].exam_id
      );

      const questionText = String(
        req.body.question_text || ''
      ).trim();

      const point = toNumber(
        req.body.point,
        1
      );

      const questionOrder = toNumber(
        req.body.question_order,
        1
      );

      const options = Array.isArray(
        req.body.options
      )
        ? req.body.options
        : [];

      const correctLabel = String(
        req.body.correct_label || ''
      )
        .trim()
        .toUpperCase();

      if (
        !questionText ||
        options.length < 2 ||
        !correctLabel
      ) {
        return res.status(400).json({
          message:
            'Soal, minimal 2 pilihan jawaban, dan jawaban benar wajib diisi.'
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      await connection.execute(
        `UPDATE questions
         SET
           question_text = ?,
           point = ?,
           question_order = ?
         WHERE id = ?`,
        [
          questionText,
          point,
          questionOrder,
          questionId
        ]
      );

      await connection.execute(
        `DELETE FROM options
         WHERE question_id = ?`,
        [questionId]
      );

      let insertedOptions = 0;
      let correctOptionInserted = false;

      for (const option of options) {
        const label = String(
          option.label || ''
        )
          .trim()
          .toUpperCase();

        const text = String(
          option.text || ''
        ).trim();

        if (!label || !text) {
          continue;
        }

        const isCorrect =
          label === correctLabel ? 1 : 0;

        if (isCorrect) {
          correctOptionInserted = true;
        }

        await connection.execute(
          `INSERT INTO options
            (
              question_id,
              option_label,
              option_text,
              is_correct
            )
           VALUES (?, ?, ?, ?)`,
          [
            questionId,
            label,
            text,
            isCorrect
          ]
        );

        insertedOptions += 1;
      }

      if (
        insertedOptions < 2 ||
        !correctOptionInserted
      ) {
        const error = new Error(
          'Minimal 2 pilihan valid dan jawaban benar wajib tersedia.'
        );

        error.status = 400;

        throw error;
      }

      await connection.commit();
      transactionStarted = false;

      return res.json({
        message:
          'Soal berhasil diperbarui.'
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      next(error);
    } finally {
      connection.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Hapus soal
|--------------------------------------------------------------------------
*/

router.delete(
  '/manage/questions/:questionId',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const questionId = Number(
        req.params.questionId
      );

      if (
        !Number.isInteger(questionId) ||
        questionId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID soal tidak valid.'
        });
      }

      const [questionRows] =
        await pool.execute(
          `SELECT exam_id
           FROM questions
           WHERE id = ?
           LIMIT 1`,
          [questionId]
        );

      if (questionRows.length === 0) {
        return res.status(404).json({
          message:
            'Soal tidak ditemukan.'
        });
      }

      await ensureCanManageExam(
        req,
        questionRows[0].exam_id
      );

      await pool.execute(
        `DELETE FROM questions
         WHERE id = ?`,
        [questionId]
      );

      return res.json({
        message:
          'Soal berhasil dihapus.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Hasil ujian siswa
|--------------------------------------------------------------------------
*/

router.get(
  '/my-results',
  authenticate,
  authorize('student'),
  async (req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT
            attempts.id,
            attempts.exam_id,
            attempts.score,
            attempts.status,
            attempts.started_at,
            attempts.finished_at,
            exams.title,
            subjects.name AS subject_name,
            (
              SELECT COUNT(*)
              FROM exam_attempts AS numbered_attempts
              WHERE numbered_attempts.exam_id =
                    attempts.exam_id
                AND numbered_attempts.user_id =
                    attempts.user_id
                AND numbered_attempts.id <=
                    attempts.id
            ) AS attempt_number
         FROM exam_attempts AS attempts
         JOIN exams
           ON exams.id = attempts.exam_id
         JOIN subjects
           ON subjects.id = exams.subject_id
         WHERE attempts.user_id = ?
         ORDER BY attempts.id DESC`,
        [req.user.id]
      );

      return res.json({
        results: rows
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Mulai atau lanjutkan ujian
|--------------------------------------------------------------------------
*/

router.post(
  '/:examId/start',
  authenticate,
  authorize('student'),
  async (req, res, next) => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      const [examRows] =
        await connection.execute(
          `SELECT *
           FROM exams
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
          [examId]
        );

      if (examRows.length === 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(404).json({
          message:
            'Ujian tidak ditemukan.'
        });
      }

      const exam = examRows[0];

      if (!isExamCurrentlyActive(exam)) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Ujian tidak aktif atau berada di luar jadwal.'
        });
      }

      const [latestAttemptRows] =
        await connection.execute(
          `SELECT *
           FROM exam_attempts
           WHERE exam_id = ?
             AND user_id = ?
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [
            examId,
            req.user.id
          ]
        );

      const [[attemptCountRow]] =
        await connection.execute(
          `SELECT COUNT(*) AS total_attempts
           FROM exam_attempts
           WHERE exam_id = ?
             AND user_id = ?`,
          [
            examId,
            req.user.id
          ]
        );

      const totalAttempts = Number(
        attemptCountRow.total_attempts || 0
      );

      if (latestAttemptRows.length > 0) {
        const latestAttempt =
          latestAttemptRows[0];

        if (
          latestAttempt.status !==
          'submitted'
        ) {
          await connection.commit();
          transactionStarted = false;

          return res.json({
            message:
              'Sesi ujian dilanjutkan.',
            attempt: latestAttempt,
            attempt_number:
              totalAttempts,
            total_attempts:
              totalAttempts,
            max_attempts:
              MAX_EXAM_ATTEMPTS,
            is_completed: false
          });
        }
      }

      if (
        totalAttempts >=
        MAX_EXAM_ATTEMPTS
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Anda telah menyelesaikan ujian ini.',
          total_attempts:
            totalAttempts,
          max_attempts:
            MAX_EXAM_ATTEMPTS,
          remaining_attempts: 0,
          is_completed: true
        });
      }

      const [result] =
        await connection.execute(
          `INSERT INTO exam_attempts
            (
              exam_id,
              user_id,
              started_at,
              status
            )
           VALUES (?, ?, NOW(), ?)`,
          [
            examId,
            req.user.id,
            'in_progress'
          ]
        );

      await connection.commit();
      transactionStarted = false;

      return res.status(201).json({
        message:
          'Sesi ujian dimulai.',
        attempt_number:
          totalAttempts + 1,
        total_attempts:
          totalAttempts + 1,
        max_attempts:
          MAX_EXAM_ATTEMPTS,
        remaining_attempts:
          MAX_EXAM_ATTEMPTS -
          (totalAttempts + 1),
        is_completed: false,
        attempt: {
          id: result.insertId,
          exam_id: examId,
          user_id: req.user.id,
          status: 'in_progress'
        }
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      next(error);
    } finally {
      connection.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Ambil soal ujian siswa
|--------------------------------------------------------------------------
*/

router.get(
  '/:examId/questions',
  authenticate,
  authorize('student'),
  async (req, res, next) => {
    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      const [examRows] =
        await pool.execute(
          `SELECT
              exams.id,
              exams.title,
              exams.description,
              exams.duration_minutes,
              subjects.name AS subject_name
           FROM exams
           JOIN subjects
             ON subjects.id =
                exams.subject_id
           WHERE exams.id = ?
             AND exams.is_active = 1
           LIMIT 1`,
          [examId]
        );

      if (examRows.length === 0) {
        return res.status(404).json({
          message:
            'Ujian tidak ditemukan atau tidak aktif.'
        });
      }

      const [attemptRows] =
        await pool.execute(
          `SELECT
              attempts.*,
              (
                SELECT COUNT(*)
                FROM exam_attempts AS counted_attempts
                WHERE counted_attempts.exam_id =
                      attempts.exam_id
                  AND counted_attempts.user_id =
                      attempts.user_id
              ) AS total_attempts
           FROM exam_attempts AS attempts
           WHERE attempts.exam_id = ?
             AND attempts.user_id = ?
           ORDER BY attempts.id DESC
           LIMIT 1`,
          [
            examId,
            req.user.id
          ]
        );

      if (attemptRows.length === 0) {
        return res.status(400).json({
          message:
            'Mulai ujian terlebih dahulu.'
        });
      }

      const attempt = attemptRows[0];

      const totalAttempts = Number(
        attempt.total_attempts || 0
      );

      if (
        attempt.status === 'submitted'
      ) {
        return res.status(400).json({
          message:
            totalAttempts >=
            MAX_EXAM_ATTEMPTS
              ? 'Anda telah menyelesaikan ujian ini.'
              : 'Percobaan pertama sudah selesai. Mulai percobaan kedua dari dashboard.',
          total_attempts:
            totalAttempts,
          max_attempts:
            MAX_EXAM_ATTEMPTS,
          remaining_attempts:
            Math.max(
              MAX_EXAM_ATTEMPTS -
              totalAttempts,
              0
            ),
          is_completed:
            totalAttempts >=
            MAX_EXAM_ATTEMPTS
        });
      }

      const [questionRows] =
        await pool.execute(
          `SELECT
              id,
              question_text,
              point,
              question_order
           FROM questions
           WHERE exam_id = ?
           ORDER BY
             question_order ASC,
             id ASC`,
          [examId]
        );

      const [optionRows] =
        await pool.execute(
          `SELECT
              options.id,
              options.question_id,
              options.option_label,
              options.option_text
           FROM options
           JOIN questions
             ON questions.id =
                options.question_id
           WHERE questions.exam_id = ?
           ORDER BY
             options.question_id ASC,
             options.option_label ASC`,
          [examId]
        );

      const optionsByQuestion =
        optionRows.reduce(
          (result, option) => {
            if (!result[option.question_id]) {
              result[option.question_id] = [];
            }

            result[option.question_id].push(
              option
            );

            return result;
          },
          {}
        );

      const questions =
        questionRows.map(
          (question) => ({
            ...question,
            options:
              optionsByQuestion[
                question.id
              ] || []
          })
        );

      return res.json({
        exam: examRows[0],
        attempt,
        attempt_number:
          totalAttempts,
        total_attempts:
          totalAttempts,
        max_attempts:
          MAX_EXAM_ATTEMPTS,
        remaining_attempts:
          Math.max(
            MAX_EXAM_ATTEMPTS -
            totalAttempts,
            0
          ),
        is_completed: false,
        questions
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| Kirim jawaban ujian
|--------------------------------------------------------------------------
*/

router.post(
  '/:examId/submit',
  authenticate,
  authorize('student'),
  async (req, res, next) => {
    const connection =
      await pool.getConnection();

    let transactionStarted = false;

    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      const answers = Array.isArray(
        req.body.answers
      )
        ? req.body.answers
        : [];

      if (answers.length === 0) {
        return res.status(400).json({
          message:
            'Jawaban belum diisi.'
        });
      }

      await connection.beginTransaction();
      transactionStarted = true;

      const [attemptRows] =
        await connection.execute(
          `SELECT *
           FROM exam_attempts
           WHERE exam_id = ?
             AND user_id = ?
           ORDER BY id DESC
           LIMIT 1
           FOR UPDATE`,
          [
            examId,
            req.user.id
          ]
        );

      if (attemptRows.length === 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Sesi ujian belum dibuat.'
        });
      }

      const attempt = attemptRows[0];

      if (
        attempt.status === 'submitted'
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Ujian ini sudah dikirim sebelumnya.'
        });
      }

      const [[totalAttemptRow]] =
        await connection.execute(
          `SELECT COUNT(*) AS total_attempts
           FROM exam_attempts
           WHERE exam_id = ?
             AND user_id = ?`,
          [
            examId,
            req.user.id
          ]
        );

      const totalAttempts = Number(
        totalAttemptRow.total_attempts || 0
      );

      if (
        totalAttempts >
        MAX_EXAM_ATTEMPTS
      ) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Anda telah menyelesaikan ujian ini.',
          total_attempts:
            totalAttempts,
          max_attempts:
            MAX_EXAM_ATTEMPTS,
          is_completed: true
        });
      }

      const [questionRows] =
        await connection.execute(
          `SELECT
              id,
              point
           FROM questions
           WHERE exam_id = ?`,
          [examId]
        );

      if (questionRows.length === 0) {
        await connection.rollback();
        transactionStarted = false;

        return res.status(400).json({
          message:
            'Ujian belum memiliki soal.'
        });
      }

      const questionIds =
        questionRows.map(
          (question) =>
            Number(question.id)
        );

      const validQuestionIds = new Set(
        questionIds
      );

      const totalPoint =
        questionRows.reduce(
          (total, question) =>
            total +
            Number(
              question.point || 0
            ),
          0
        );

      const [correctRows] =
        await connection.query(
          `SELECT
              question_id,
              id AS correct_option_id
           FROM options
           WHERE is_correct = 1
             AND question_id IN (?)`,
          [questionIds]
        );

      const correctMap = new Map(
        correctRows.map((row) => [
          Number(row.question_id),
          Number(row.correct_option_id)
        ])
      );

      const answerMap = new Map();

      for (const answer of answers) {
        const questionId = Number(
          answer.question_id
        );

        const optionId = Number(
          answer.option_id
        );

        if (
          validQuestionIds.has(questionId) &&
          Number.isInteger(optionId) &&
          optionId > 0
        ) {
          answerMap.set(
            questionId,
            optionId
          );
        }
      }

      let earnedPoint = 0;
      let correctAnswers = 0;

      for (const question of questionRows) {
        const questionId = Number(
          question.id
        );

        const selectedOptionId =
          answerMap.get(questionId) ||
          null;

        const correctOptionId =
          correctMap.get(questionId);

        let validSelectedOptionId = null;

        if (selectedOptionId !== null) {
          const [selectedOptionRows] =
            await connection.execute(
              `SELECT id
               FROM options
               WHERE id = ?
                 AND question_id = ?
               LIMIT 1`,
              [
                selectedOptionId,
                questionId
              ]
            );

          if (
            selectedOptionRows.length > 0
          ) {
            validSelectedOptionId =
              selectedOptionId;
          }
        }

        const isCorrect =
          validSelectedOptionId !== null &&
          validSelectedOptionId ===
            correctOptionId
            ? 1
            : 0;

        if (isCorrect) {
          earnedPoint += Number(
            question.point || 0
          );

          correctAnswers += 1;
        }

        await connection.execute(
          `INSERT INTO student_answers
            (
              attempt_id,
              question_id,
              option_id,
              is_correct
            )
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             option_id = VALUES(option_id),
             is_correct = VALUES(is_correct)`,
          [
            attempt.id,
            questionId,
            validSelectedOptionId,
            isCorrect
          ]
        );
      }

      const score =
        totalPoint > 0
          ? Number(
              (
                (
                  earnedPoint /
                  totalPoint
                ) * 100
              ).toFixed(2)
            )
          : 0;

      await connection.execute(
        `UPDATE exam_attempts
         SET
           finished_at = NOW(),
           score = ?,
           status = 'submitted'
         WHERE id = ?`,
        [
          score,
          attempt.id
        ]
      );

      const [[completedAttemptRow]] =
        await connection.execute(
          `SELECT COUNT(*) AS completed_attempts
           FROM exam_attempts
           WHERE exam_id = ?
             AND user_id = ?
             AND status = 'submitted'`,
          [
            examId,
            req.user.id
          ]
        );

      const completedAttempts = Number(
        completedAttemptRow.completed_attempts ||
        0
      );

      const isCompleted =
        completedAttempts >=
        MAX_EXAM_ATTEMPTS;

      await connection.commit();
      transactionStarted = false;

      return res.json({
        message: isCompleted
          ? 'Anda telah menyelesaikan ujian ini.'
          : 'Jawaban berhasil dikirim. Anda masih memiliki 1 kesempatan lagi.',
        score,
        completed_attempts:
          completedAttempts,
        total_attempts:
          completedAttempts,
        max_attempts:
          MAX_EXAM_ATTEMPTS,
        remaining_attempts:
          Math.max(
            MAX_EXAM_ATTEMPTS -
            completedAttempts,
            0
          ),
        is_completed:
          isCompleted,
        total_questions:
          questionRows.length,
        correct_answers:
          correctAnswers
      });
    } catch (error) {
      if (transactionStarted) {
        await connection.rollback();
      }

      next(error);
    } finally {
      connection.release();
    }
  }
);

/*
|--------------------------------------------------------------------------
| Hasil ujian berdasarkan ID ujian
|--------------------------------------------------------------------------
*/

router.get(
  '/:examId/results',
  authenticate,
  authorize('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const examId = Number(
        req.params.examId
      );

      if (
        !Number.isInteger(examId) ||
        examId <= 0
      ) {
        return res.status(400).json({
          message:
            'ID ujian tidak valid.'
        });
      }

      await ensureCanManageExam(
        req,
        examId
      );

      const [rows] = await pool.execute(
        `SELECT
            attempts.id,
            attempts.score,
            attempts.status,
            attempts.started_at,
            attempts.finished_at,
            users.name AS student_name,
            users.email AS student_email,
            users.class_name,
            exams.title AS exam_title,
            (
              SELECT COUNT(*)
              FROM exam_attempts AS numbered_attempts
              WHERE numbered_attempts.exam_id =
                    attempts.exam_id
                AND numbered_attempts.user_id =
                    attempts.user_id
                AND numbered_attempts.id <=
                    attempts.id
            ) AS attempt_number
         FROM exam_attempts AS attempts
         JOIN users
           ON users.id =
              attempts.user_id
         JOIN exams
           ON exams.id =
              attempts.exam_id
         WHERE attempts.exam_id = ?
         ORDER BY attempts.id DESC`,
        [examId]
      );

      return res.json({
        results: rows
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;