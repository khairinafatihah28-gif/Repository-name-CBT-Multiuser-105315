// CATATAN:
// Sejak schema.sql sudah memuat tabel question_bank
// dan question_bank_options, script ini TIDAK WAJIB
// dijalankan lagi untuk instalasi baru (npm run setup
// sudah otomatis membuat kedua tabel tersebut).
//
// Script ini hanya diperlukan untuk database LAMA yang
// sudah dibuat sebelum Part 5 ditambahkan ke schema.sql,
// agar tabel Bank Soal ikut ditambahkan tanpa perlu
// reset ulang seluruh database.

require('dotenv').config();

const pool = require('../src/config/db');

async function migratePart5() {
  let connection;

  try {
    connection = await pool.getConnection();

    console.log('Menjalankan migrasi Part 5...');

    await connection.beginTransaction();

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS question_bank (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        subject_id INT UNSIGNED NOT NULL,
        created_by INT UNSIGNED NOT NULL,
        question_text TEXT NOT NULL,
        difficulty_level ENUM(
          'mudah',
          'sedang',
          'sulit'
        ) NOT NULL DEFAULT 'mudah',
        point INT NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP
          DEFAULT CURRENT_TIMESTAMP
          ON UPDATE CURRENT_TIMESTAMP,

        INDEX idx_question_bank_subject (
          subject_id
        ),

        INDEX idx_question_bank_creator (
          created_by
        ),

        CONSTRAINT fk_question_bank_subject
          FOREIGN KEY (subject_id)
          REFERENCES subjects(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE,

        CONSTRAINT fk_question_bank_creator
          FOREIGN KEY (created_by)
          REFERENCES users(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE
      )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS question_bank_options (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        bank_question_id INT UNSIGNED NOT NULL,
        option_label VARCHAR(5) NOT NULL,
        option_text TEXT NOT NULL,
        is_correct TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

        UNIQUE KEY uq_question_bank_option (
          bank_question_id,
          option_label
        ),

        CONSTRAINT fk_question_bank_option
          FOREIGN KEY (bank_question_id)
          REFERENCES question_bank(id)
          ON UPDATE CASCADE
          ON DELETE CASCADE
      )
      ENGINE=InnoDB
      DEFAULT CHARSET=utf8mb4
      COLLATE=utf8mb4_unicode_ci
    `);

    await connection.commit();

    console.log('Migrasi Part 5 berhasil.');
    console.log('Tabel question_bank berhasil dibuat.');
    console.log(
      'Tabel question_bank_options berhasil dibuat.'
    );
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(
      'Migrasi Part 5 gagal:',
      error.message
    );

    process.exitCode = 1;
  } finally {
    if (connection) {
      connection.release();
    }

    await pool.end();
  }
}

migratePart5();