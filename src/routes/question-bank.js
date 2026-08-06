const express = require('express');
const pool = require('../config/db');

const {
  authenticate,
  authorize
} = require('../middleware/auth');

const router = express.Router();

const OPTION_LABELS = [
  'A',
  'B',
  'C',
  'D',
  'E'
];

const DIFFICULTIES = [
  'mudah',
  'sedang',
  'sulit'
];

router.use(
  authenticate,
  authorize('admin', 'teacher')
);

function createHttpError(
  message,
  status = 400
) {
  const error = new Error(message);
  error.status = status;

  return error;
}

function toPositiveInteger(
  value,
  fallback = 0
) {
  const result = Number(value);

  if (
    !Number.isInteger(result) ||
    result <= 0
  ) {
    return fallback;
  }

  return result;
}

function validatePayload(body) {
  const subjectId = toPositiveInteger(
    body.subject_id
  );

  const questionText = String(
    body.question_text || ''
  ).trim();

  const point = toPositiveInteger(
    body.point,
    1
  );

  const difficultyLevel = String(
    body.difficulty_level || 'mudah'
  )
    .trim()
    .toLowerCase();

  const correctLabel = String(
    body.correct_label || ''
  )
    .trim()
    .toUpperCase();

  if (!subjectId) {
    throw createHttpError(
      'Mata pelajaran wajib dipilih.'
    );
  }

  if (!questionText) {
    throw createHttpError(
      'Teks soal wajib diisi.'
    );
  }

  if (
    !DIFFICULTIES.includes(
      difficultyLevel
    )
  ) {
    throw createHttpError(
      'Tingkat kesulitan tidak valid.'
    );
  }

  if (
    !OPTION_LABELS.includes(
      correctLabel
    )
  ) {
    throw createHttpError(
      'Kunci jawaban harus A, B, C, D, atau E.'
    );
  }

  if (!Array.isArray(body.options)) {
    throw createHttpError(
      'Pilihan jawaban tidak valid.'
    );
  }

  const options = OPTION_LABELS.map(
    (label) => {
      const option = body.options.find(
        (item) =>
          String(item.label || '')
            .trim()
            .toUpperCase() === label
      );

      return {
        label,
        text: String(
          option?.text || ''
        ).trim()
      };
    }
  );

  const emptyOption = options.find(
    (option) => !option.text
  );

  if (emptyOption) {
    throw createHttpError(
      `Pilihan ${emptyOption.label} wajib diisi.`
    );
  }

  return {
    subjectId,
    questionText,
    point,
    difficultyLevel,
    correctLabel,
    options
  };
}

async function getSubject(subjectId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        teacher_id,
        name
      FROM subjects
      WHERE id = ?
      LIMIT 1
    `,
    [subjectId]
  );

  if (rows.length === 0) {
    throw createHttpError(
      'Mata pelajaran tidak ditemukan.',
      404
    );
  }

  return rows[0];
}

async function checkSubjectAccess(
  req,
  subjectId
) {
  const subject = await getSubject(
    subjectId
  );

  if (
    req.user.role === 'teacher' &&
    subject.teacher_id !== null &&
    Number(subject.teacher_id) !==
      Number(req.user.id)
  ) {
    throw createHttpError(
      'Mata pelajaran ini milik guru lain.',
      403
    );
  }

  return subject;
}

async function getQuestion(questionId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        subject_id,
        created_by,
        question_text,
        difficulty_level,
        point
      FROM question_bank
      WHERE id = ?
      LIMIT 1
    `,
    [questionId]
  );

  if (rows.length === 0) {
    throw createHttpError(
      'Soal Bank Soal tidak ditemukan.',
      404
    );
  }

  return rows[0];
}

async function checkQuestionAccess(
  req,
  questionId
) {
  const question = await getQuestion(
    questionId
  );

  if (
    req.user.role === 'teacher' &&
    Number(question.created_by) !==
      Number(req.user.id)
  ) {
    throw createHttpError(
      'Guru hanya boleh mengubah soal miliknya sendiri.',
      403
    );
  }

  return question;
}

async function getExam(req, examId) {
  const [rows] = await pool.execute(
    `
      SELECT
        id,
        subject_id,
        teacher_id,
        title
      FROM exams
      WHERE id = ?
      LIMIT 1
    `,
    [examId]
  );

  if (rows.length === 0) {
    throw createHttpError(
      'Ujian tidak ditemukan.',
      404
    );
  }

  const exam = rows[0];

  if (
    req.user.role === 'teacher' &&
    Number(exam.teacher_id) !==
      Number(req.user.id)
  ) {
    throw createHttpError(
      'Guru hanya boleh mengelola ujian miliknya sendiri.',
      403
    );
  }

  return exam;
}

/*
|--------------------------------------------------------------------------
| READ BANK SOAL
|--------------------------------------------------------------------------
*/

router.get(
  '/',
  async (req, res, next) => {
    try {
      const subjectId =
        toPositiveInteger(
          req.query.subject_id
        );

      const difficulty = String(
        req.query.difficulty_level || ''
      )
        .trim()
        .toLowerCase();

      const search = String(
        req.query.search || ''
      ).trim();

      let sql = `
        SELECT
          qb.id,
          qb.subject_id,
          qb.created_by,
          qb.question_text,
          qb.difficulty_level,
          qb.point,
          qb.created_at,
          qb.updated_at,
          s.name AS subject_name,
          u.name AS creator_name
        FROM question_bank qb
        JOIN subjects s
          ON s.id = qb.subject_id
        JOIN users u
          ON u.id = qb.created_by
        WHERE 1 = 1
      `;

      const params = [];

      if (subjectId) {
        sql += `
          AND qb.subject_id = ?
        `;

        params.push(subjectId);
      }

      if (
        DIFFICULTIES.includes(
          difficulty
        )
      ) {
        sql += `
          AND qb.difficulty_level = ?
        `;

        params.push(difficulty);
      }

      if (search) {
        sql += `
          AND qb.question_text LIKE ?
        `;

        params.push(`%${search}%`);
      }

      sql += `
        ORDER BY
          qb.updated_at DESC,
          qb.id DESC
      `;

      const [questions] =
        await pool.execute(
          sql,
          params
        );

      if (questions.length === 0) {
        return res.json({
          questions: []
        });
      }

      const questionIds =
        questions.map(
          (question) => question.id
        );

      const placeholders =
        questionIds
          .map(() => '?')
          .join(', ');

      const [options] =
        await pool.execute(
          `
            SELECT
              id,
              bank_question_id,
              option_label,
              option_text,
              is_correct
            FROM question_bank_options
            WHERE bank_question_id
              IN (${placeholders})
            ORDER BY
              bank_question_id,
              option_label
          `,
          questionIds
        );

      const optionMap = {};

      options.forEach((option) => {
        const key = Number(
          option.bank_question_id
        );

        if (!optionMap[key]) {
          optionMap[key] = [];
        }

        optionMap[key].push(option);
      });

      const result = questions.map(
        (question) => ({
          ...question,
          options:
            optionMap[
              Number(question.id)
            ] || []
        })
      );

      res.json({
        questions: result
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| CREATE SOAL
|--------------------------------------------------------------------------
*/

router.post(
  '/',
  async (req, res, next) => {
    let connection;

    try {
      const payload =
        validatePayload(req.body);

      await checkSubjectAccess(
        req,
        payload.subjectId
      );

      connection =
        await pool.getConnection();

      await connection.beginTransaction();

      const [questionResult] =
        await connection.execute(
          `
            INSERT INTO question_bank
              (
                subject_id,
                created_by,
                question_text,
                difficulty_level,
                point
              )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            payload.subjectId,
            req.user.id,
            payload.questionText,
            payload.difficultyLevel,
            payload.point
          ]
        );

      const questionId = Number(
        questionResult.insertId
      );

      for (
        const option of payload.options
      ) {
        await connection.execute(
          `
            INSERT INTO question_bank_options
              (
                bank_question_id,
                option_label,
                option_text,
                is_correct
              )
            VALUES (?, ?, ?, ?)
          `,
          [
            questionId,
            option.label,
            option.text,
            option.label ===
              payload.correctLabel
              ? 1
              : 0
          ]
        );
      }

      await connection.commit();

      res.status(201).json({
        message:
          'Soal berhasil ditambahkan ke Bank Soal.',
        question_id: questionId
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      next(error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/*
|--------------------------------------------------------------------------
| UPDATE SOAL
|--------------------------------------------------------------------------
*/

router.put(
  '/:questionId',
  async (req, res, next) => {
    let connection;

    try {
      const questionId =
        toPositiveInteger(
          req.params.questionId
        );

      if (!questionId) {
        throw createHttpError(
          'ID soal tidak valid.'
        );
      }

      await checkQuestionAccess(
        req,
        questionId
      );

      const payload =
        validatePayload(req.body);

      await checkSubjectAccess(
        req,
        payload.subjectId
      );

      connection =
        await pool.getConnection();

      await connection.beginTransaction();

      await connection.execute(
        `
          UPDATE question_bank
          SET
            subject_id = ?,
            question_text = ?,
            difficulty_level = ?,
            point = ?
          WHERE id = ?
        `,
        [
          payload.subjectId,
          payload.questionText,
          payload.difficultyLevel,
          payload.point,
          questionId
        ]
      );

      await connection.execute(
        `
          DELETE FROM question_bank_options
          WHERE bank_question_id = ?
        `,
        [questionId]
      );

      for (
        const option of payload.options
      ) {
        await connection.execute(
          `
            INSERT INTO question_bank_options
              (
                bank_question_id,
                option_label,
                option_text,
                is_correct
              )
            VALUES (?, ?, ?, ?)
          `,
          [
            questionId,
            option.label,
            option.text,
            option.label ===
              payload.correctLabel
              ? 1
              : 0
          ]
        );
      }

      await connection.commit();

      res.json({
        message:
          'Soal Bank Soal berhasil diperbarui.'
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      next(error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

/*
|--------------------------------------------------------------------------
| DELETE SOAL
|--------------------------------------------------------------------------
*/

router.delete(
  '/:questionId',
  async (req, res, next) => {
    try {
      const questionId =
        toPositiveInteger(
          req.params.questionId
        );

      if (!questionId) {
        throw createHttpError(
          'ID soal tidak valid.'
        );
      }

      await checkQuestionAccess(
        req,
        questionId
      );

      await pool.execute(
        `
          DELETE FROM question_bank
          WHERE id = ?
        `,
        [questionId]
      );

      res.json({
        message:
          'Soal berhasil dihapus dari Bank Soal.'
      });
    } catch (error) {
      next(error);
    }
  }
);

/*
|--------------------------------------------------------------------------
| TAMBAHKAN BANK SOAL KE UJIAN
|--------------------------------------------------------------------------
*/

router.post(
  '/:questionId/add-to-exam',
  async (req, res, next) => {
    let connection;

    try {
      const questionId =
        toPositiveInteger(
          req.params.questionId
        );

      const examId =
        toPositiveInteger(
          req.body.exam_id
        );

      if (!questionId) {
        throw createHttpError(
          'ID soal tidak valid.'
        );
      }

      if (!examId) {
        throw createHttpError(
          'Ujian tujuan wajib dipilih.'
        );
      }

      const bankQuestion =
        await getQuestion(questionId);

      const exam = await getExam(
        req,
        examId
      );

      if (
        Number(
          bankQuestion.subject_id
        ) !==
        Number(exam.subject_id)
      ) {
        throw createHttpError(
          'Mata pelajaran soal dan ujian harus sama.'
        );
      }

      const [bankOptions] =
        await pool.execute(
          `
            SELECT
              option_label,
              option_text,
              is_correct
            FROM question_bank_options
            WHERE bank_question_id = ?
            ORDER BY option_label
          `,
          [questionId]
        );

      if (bankOptions.length === 0) {
        throw createHttpError(
          'Pilihan jawaban belum tersedia.'
        );
      }

      connection =
        await pool.getConnection();

      await connection.beginTransaction();

      const [orderRows] =
        await connection.execute(
          `
            SELECT
              COALESCE(
                MAX(question_order),
                0
              ) + 1 AS next_order
            FROM questions
            WHERE exam_id = ?
          `,
          [examId]
        );

      const nextOrder = Number(
        orderRows[0].next_order || 1
      );

      const [questionResult] =
        await connection.execute(
          `
            INSERT INTO questions
              (
                exam_id,
                question_text,
                point,
                question_order
              )
            VALUES (?, ?, ?, ?)
          `,
          [
            examId,
            bankQuestion.question_text,
            bankQuestion.point,
            nextOrder
          ]
        );

      const newQuestionId = Number(
        questionResult.insertId
      );

      for (
        const option of bankOptions
      ) {
        await connection.execute(
          `
            INSERT INTO options
              (
                question_id,
                option_label,
                option_text,
                is_correct
              )
            VALUES (?, ?, ?, ?)
          `,
          [
            newQuestionId,
            option.option_label,
            option.option_text,
            option.is_correct ? 1 : 0
          ]
        );
      }

      await connection.commit();

      res.status(201).json({
        message:
          'Soal berhasil dimasukkan ke ujian.',
        question_id: newQuestionId
      });
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      next(error);
    } finally {
      if (connection) {
        connection.release();
      }
    }
  }
);

module.exports = router;