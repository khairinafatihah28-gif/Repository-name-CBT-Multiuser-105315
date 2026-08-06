require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function quoteIdentifier(identifier) {
  return `\`${String(identifier).replace(/`/g, '``')}\``;
}

function splitSqlStatements(sql) {
  return sql
    .replace(/^\s*--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function setupDatabase() {
  const databaseName =
    process.env.DB_DATABASE || 'cbt_multiuser';

  const host =
    process.env.DB_HOST || '127.0.0.1';

  const port = Number(
    process.env.DB_PORT || 3306
  );

  let connection;

  try {
    console.log(
      `Menghubungkan ke MySQL ${host}:${port}...`
    );

    connection = await mysql.createConnection({
      host,
      port,
      user: process.env.DB_USERNAME || 'root',
      password: process.env.DB_PASSWORD || '',
      connectTimeout: 10000
    });

    console.log('Berhasil terhubung ke MySQL.');

    await connection.query(
      'SET SESSION lock_wait_timeout = 10'
    );

    await connection.query(
      'SET SESSION innodb_lock_wait_timeout = 10'
    );

    console.log(
      `Membuat database ${databaseName}...`
    );

    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${quoteIdentifier(
        databaseName
      )}
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_unicode_ci`
    );

    await connection.changeUser({
      database: databaseName
    });

    console.log(
      `Database ${databaseName} dipilih.`
    );

    const schemaPath = path.join(
      __dirname,
      '..',
      'database',
      'schema.sql'
    );

    if (!fs.existsSync(schemaPath)) {
      throw new Error(
        `File schema tidak ditemukan: ${schemaPath}`
      );
    }

    const schemaSql = fs.readFileSync(
      schemaPath,
      'utf8'
    );

    if (/\bDELIMITER\b/i.test(schemaSql)) {
      throw new Error(
        'schema.sql masih mengandung DELIMITER. Hapus bagian trigger dan DELIMITER.'
      );
    }

    const statements =
      splitSqlStatements(schemaSql);

    console.log(
      `Menjalankan ${statements.length} perintah SQL...`
    );

    for (
      let index = 0;
      index < statements.length;
      index += 1
    ) {
      const statement = statements[index];

      console.log(
        `[${index + 1}/${statements.length}] Menjalankan SQL...`
      );

      await connection.query(statement);
    }

    console.log(
      'Database dan seluruh tabel berhasil dibuat.'
    );
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(
        `MySQL tidak aktif atau tidak dapat diakses pada ${host}:${port}.`
      );

      console.error(
        'Aktifkan MySQL melalui XAMPP Control Panel.'
      );
    } else if (
      error.code === 'ER_LOCK_WAIT_TIMEOUT'
    ) {
      console.error(
        'Database sedang digunakan atau terkunci.'
      );

      console.error(
        'Tutup npm run dev dan aplikasi lain yang sedang mengakses database, lalu ulangi.'
      );
    } else if (
      error.code === 'ER_ACCESS_DENIED_ERROR'
    ) {
      console.error(
        'Username atau password MySQL salah.'
      );
    } else {
      console.error(
        'Gagal setup database:',
        error.message
      );
    }

    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
      console.log('Koneksi MySQL ditutup.');
    }
  }
}

setupDatabase();