require('dotenv').config();

const bcrypt = require('bcryptjs');
const pool = require('../src/config/db');

async function seedDatabase() {
    const connection = await pool.getConnection();

    try {
        console.log('Memulai seed database...');

        await connection.beginTransaction();

        const passwordHash = await bcrypt.hash(
            'password123',
            10
        );

        /*
        |--------------------------------------------------------------------------
        | ROLE
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan role...');

        await connection.execute(`
      INSERT INTO roles
        (id, name, description)
      VALUES
        (
          1,
          'admin',
          'Mengelola seluruh sistem'
        ),
        (
          2,
          'teacher',
          'Membuat dan mengelola ujian'
        ),
        (
          3,
          'student',
          'Mengikuti ujian'
        )
    `);

        /*
        |--------------------------------------------------------------------------
        | USER
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan pengguna...');

        await connection.execute(
            `
        INSERT INTO users
          (
            id,
            role_id,
            name,
            email,
            password,
            class_name,
            is_active,
            email_verified_at,
            verification_code,
            verification_code_expires_at,
            verification_sent_at
          )
        VALUES
          (
            1,
            1,
            'yaya',
            'yaya@cbt.test',
            ?,
            NULL,
            1,
            NOW(),
            NULL,
            NULL,
            NULL
          ),
          (
            2,
            2,
            'Guru Pemrograman',
            'guru@cbt.test',
            ?,
            NULL,
            1,
            NULL,
            '123456',
            DATE_ADD(NOW(), INTERVAL 7 DAY),
            NOW()
          ),
          (
            3,
            3,
            'Siswa Demo',
            'siswa@cbt.test',
            ?,
            'Kelas A',
            1,
            NULL,
            '654321',
            DATE_ADD(NOW(), INTERVAL 7 DAY),
            NOW()
          )
      `, [
                passwordHash,
                passwordHash,
                passwordHash
            ]
        );

        /*
        |--------------------------------------------------------------------------
        | MATA PELAJARAN
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan mata pelajaran...');

        await connection.execute(`
      INSERT INTO subjects
        (
          id,
          teacher_id,
          name,
          description
        )
      VALUES
        (
          1,
          2,
          'Pemrograman Web',
          'Materi dasar HTML, CSS, dan JavaScript'
        )
    `);

        /*
        |--------------------------------------------------------------------------
        | TIGA UJIAN
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan 3 ujian...');

        await connection.execute(`
      INSERT INTO exams
        (
          id,
          subject_id,
          teacher_id,
          title,
          description,
          duration_minutes,
          start_time,
          end_time,
          is_active
        )
      VALUES
        (
          1,
          1,
          2,
          'Ujian 1 - Dasar HTML',
          'Ujian mengenai konsep dasar HTML.',
          30,
          NOW(),
          DATE_ADD(NOW(), INTERVAL 30 DAY),
          1
        ),
        (
          2,
          1,
          2,
          'Ujian 2 - Dasar CSS',
          'Ujian mengenai konsep dasar CSS.',
          30,
          NOW(),
          DATE_ADD(NOW(), INTERVAL 30 DAY),
          1
        ),
        (
          3,
          1,
          2,
          'Ujian 3 - Dasar JavaScript',
          'Ujian mengenai konsep dasar JavaScript.',
          30,
          NOW(),
          DATE_ADD(NOW(), INTERVAL 30 DAY),
          1
        )
    `);

        /*
        |--------------------------------------------------------------------------
        | SOAL UJIAN 1: HTML
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan 5 soal HTML...');

        await connection.execute(`
      INSERT INTO questions
        (
          id,
          exam_id,
          question_text,
          point,
          question_order
        )
      VALUES
        (
          1,
          1,
          'Apa kepanjangan dari HTML?',
          1,
          1
        ),
        (
          2,
          1,
          'Tag HTML yang digunakan untuk membuat judul utama adalah?',
          1,
          2
        ),
        (
          3,
          1,
          'Tag yang digunakan untuk membuat paragraf adalah?',
          1,
          3
        ),
        (
          4,
          1,
          'Atribut yang digunakan untuk menentukan alamat tautan adalah?',
          1,
          4
        ),
        (
          5,
          1,
          'Tag yang digunakan untuk menampilkan gambar adalah?',
          1,
          5
        )
    `);

        await connection.execute(`
      INSERT INTO options
        (
          question_id,
          option_label,
          option_text,
          is_correct
        )
      VALUES
        (1, 'A', 'Hyper Text Markup Language', 1),
        (1, 'B', 'High Text Machine Language', 0),
        (1, 'C', 'Hyper Tool Markup Language', 0),
        (1, 'D', 'Home Text Markup Language', 0),
        (1, 'E', 'Hyper Transfer Machine Language', 0),

        (2, 'A', '<p>', 0),
        (2, 'B', '<h1>', 1),
        (2, 'C', '<img>', 0),
        (2, 'D', '<a>', 0),
        (2, 'E', '<title>', 0),

        (3, 'A', '<p>', 1),
        (3, 'B', '<h1>', 0),
        (3, 'C', '<div>', 0),
        (3, 'D', '<table>', 0),
        (3, 'E', '<span>', 0),

        (4, 'A', 'src', 0),
        (4, 'B', 'href', 1),
        (4, 'C', 'class', 0),
        (4, 'D', 'style', 0),
        (4, 'E', 'target', 0),

        (5, 'A', '<image>', 0),
        (5, 'B', '<picture>', 0),
        (5, 'C', '<img>', 1),
        (5, 'D', '<src>', 0),
        (5, 'E', '<figure>', 0)
    `);

        /*
        |--------------------------------------------------------------------------
        | SOAL UJIAN 2: CSS
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan 5 soal CSS...');

        await connection.execute(`
      INSERT INTO questions
        (
          id,
          exam_id,
          question_text,
          point,
          question_order
        )
      VALUES
        (
          6,
          2,
          'Apa kepanjangan dari CSS?',
          1,
          1
        ),
        (
          7,
          2,
          'Properti CSS untuk mengubah warna teks adalah?',
          1,
          2
        ),
        (
          8,
          2,
          'Properti CSS untuk mengubah warna latar belakang adalah?',
          1,
          3
        ),
        (
          9,
          2,
          'Selector CSS untuk memilih elemen berdasarkan ID menggunakan simbol?',
          1,
          4
        ),
        (
          10,
          2,
          'Properti untuk mengatur ukuran tulisan adalah?',
          1,
          5
        )
    `);

        await connection.execute(`
      INSERT INTO options
        (
          question_id,
          option_label,
          option_text,
          is_correct
        )
      VALUES
        (6, 'A', 'Cascading Style Sheets', 1),
        (6, 'B', 'Computer Style System', 0),
        (6, 'C', 'Creative Style Sheet', 0),
        (6, 'D', 'Cascading System Style', 0),
        (6, 'E', 'Colorful Style Sheet', 0),

        (7, 'A', 'font-size', 0),
        (7, 'B', 'background', 0),
        (7, 'C', 'color', 1),
        (7, 'D', 'text-align', 0),
        (7, 'E', 'font-color', 0),

        (8, 'A', 'background-color', 1),
        (8, 'B', 'font-color', 0),
        (8, 'C', 'text-color', 0),
        (8, 'D', 'border-color', 0),
        (8, 'E', 'background-image', 0),

        (9, 'A', '.', 0),
        (9, 'B', '#', 1),
        (9, 'C', '*', 0),
        (9, 'D', '@', 0),
        (9, 'E', '&', 0),

        (10, 'A', 'font-size', 1),
        (10, 'B', 'font-style', 0),
        (10, 'C', 'text-size', 0),
        (10, 'D', 'text-style', 0),
        (10, 'E', 'font-weight', 0)
    `);

        /*
        |--------------------------------------------------------------------------
        | SOAL UJIAN 3: JAVASCRIPT
        |--------------------------------------------------------------------------
        */

        console.log('Menambahkan 5 soal JavaScript...');

        await connection.execute(`
      INSERT INTO questions
        (
          id,
          exam_id,
          question_text,
          point,
          question_order
        )
      VALUES
        (
          11,
          3,
          'JavaScript umumnya digunakan untuk?',
          1,
          1
        ),
        (
          12,
          3,
          'Kata kunci untuk membuat variabel yang nilainya dapat berubah adalah?',
          1,
          2
        ),
        (
          13,
          3,
          'Fungsi untuk menampilkan pesan pada console browser adalah?',
          1,
          3
        ),
        (
          14,
          3,
          'Operator perbandingan ketat pada JavaScript adalah?',
          1,
          4
        ),
        (
          15,
          3,
          'Metode untuk memilih elemen berdasarkan ID adalah?',
          1,
          5
        )
    `);

        await connection.execute(`
      INSERT INTO options
        (
          question_id,
          option_label,
          option_text,
          is_correct
        )
      VALUES
        (
          11,
          'A',
          'Membuat halaman menjadi interaktif',
          1
        ),
        (
          11,
          'B',
          'Membuat database MySQL',
          0
        ),
        (
          11,
          'C',
          'Menggantikan sistem operasi',
          0
        ),
        (
          11,
          'D',
          'Membuat perangkat keras',
          0
        ),
        (
          11,
          'E',
          'Membuat desain grafis',
          0
        ),

        (12, 'A', 'const', 0),
        (12, 'B', 'let', 1),
        (12, 'C', 'class', 0),
        (12, 'D', 'return', 0),
        (12, 'E', 'var', 0),

        (13, 'A', 'console.log()', 1),
        (13, 'B', 'print.console()', 0),
        (13, 'C', 'document.print()', 0),
        (13, 'D', 'window.write()', 0),
        (13, 'E', 'alert.log()', 0),

        (14, 'A', '=', 0),
        (14, 'B', '==', 0),
        (14, 'C', '===', 1),
        (14, 'D', '!=', 0),
        (14, 'E', '<=', 0),

        (
          15,
          'A',
          'document.getElementById()',
          1
        ),
        (
          15,
          'B',
          'document.getElement()',
          0
        ),
        (
          15,
          'C',
          'document.selectId()',
          0
        ),
        (
          15,
          'D',
          'window.getId()',
          0
        ),
        (
          15,
          'E',
          'document.querySelector()',
          0
        )
    `);

        /*
        |--------------------------------------------------------------------------
        | BANK SOAL (soal ujian yang sudah ada,
        | dibuat bisa dicari lewat menu Bank Soal)
        |--------------------------------------------------------------------------
        */

        console.log(
            'Menambahkan 15 soal ke Bank Soal...'
        );

        await connection.execute(`
      INSERT INTO question_bank
        (
          id,
          subject_id,
          created_by,
          question_text,
          difficulty_level,
          point
        )
      VALUES
        (1, 1, 2, 'Apa kepanjangan dari HTML?', 'mudah', 1),
        (2, 1, 2, 'Tag HTML yang digunakan untuk membuat judul utama adalah?', 'mudah', 1),
        (3, 1, 2, 'Tag yang digunakan untuk membuat paragraf adalah?', 'sedang', 1),
        (4, 1, 2, 'Atribut yang digunakan untuk menentukan alamat tautan adalah?', 'sedang', 1),
        (5, 1, 2, 'Tag yang digunakan untuk menampilkan gambar adalah?', 'sulit', 1),

        (6, 1, 2, 'Apa kepanjangan dari CSS?', 'mudah', 1),
        (7, 1, 2, 'Properti CSS untuk mengubah warna teks adalah?', 'mudah', 1),
        (8, 1, 2, 'Properti CSS untuk mengubah warna latar belakang adalah?', 'sedang', 1),
        (9, 1, 2, 'Selector CSS untuk memilih elemen berdasarkan ID menggunakan simbol?', 'sedang', 1),
        (10, 1, 2, 'Properti untuk mengatur ukuran tulisan adalah?', 'sulit', 1),

        (11, 1, 2, 'JavaScript umumnya digunakan untuk?', 'mudah', 1),
        (12, 1, 2, 'Kata kunci untuk membuat variabel yang nilainya dapat berubah adalah?', 'mudah', 1),
        (13, 1, 2, 'Fungsi untuk menampilkan pesan pada console browser adalah?', 'sedang', 1),
        (14, 1, 2, 'Operator perbandingan ketat pada JavaScript adalah?', 'sedang', 1),
        (15, 1, 2, 'Metode untuk memilih elemen berdasarkan ID adalah?', 'sulit', 1)
    `);

        await connection.execute(`
      INSERT INTO question_bank_options
        (
          bank_question_id,
          option_label,
          option_text,
          is_correct
        )
      VALUES
        (1, 'A', 'Hyper Text Markup Language', 1),
        (1, 'B', 'High Text Machine Language', 0),
        (1, 'C', 'Hyper Tool Markup Language', 0),
        (1, 'D', 'Home Text Markup Language', 0),
        (1, 'E', 'Hyper Transfer Machine Language', 0),

        (2, 'A', '<p>', 0),
        (2, 'B', '<h1>', 1),
        (2, 'C', '<img>', 0),
        (2, 'D', '<a>', 0),
        (2, 'E', '<title>', 0),

        (3, 'A', '<p>', 1),
        (3, 'B', '<h1>', 0),
        (3, 'C', '<div>', 0),
        (3, 'D', '<table>', 0),
        (3, 'E', '<span>', 0),

        (4, 'A', 'src', 0),
        (4, 'B', 'href', 1),
        (4, 'C', 'class', 0),
        (4, 'D', 'style', 0),
        (4, 'E', 'target', 0),

        (5, 'A', '<image>', 0),
        (5, 'B', '<picture>', 0),
        (5, 'C', '<img>', 1),
        (5, 'D', '<src>', 0),
        (5, 'E', '<figure>', 0),

        (6, 'A', 'Cascading Style Sheets', 1),
        (6, 'B', 'Computer Style System', 0),
        (6, 'C', 'Creative Style Sheet', 0),
        (6, 'D', 'Cascading System Style', 0),
        (6, 'E', 'Colorful Style Sheet', 0),

        (7, 'A', 'font-size', 0),
        (7, 'B', 'background', 0),
        (7, 'C', 'color', 1),
        (7, 'D', 'text-align', 0),
        (7, 'E', 'font-color', 0),

        (8, 'A', 'background-color', 1),
        (8, 'B', 'font-color', 0),
        (8, 'C', 'text-color', 0),
        (8, 'D', 'border-color', 0),
        (8, 'E', 'background-image', 0),

        (9, 'A', '.', 0),
        (9, 'B', '#', 1),
        (9, 'C', '*', 0),
        (9, 'D', '@', 0),
        (9, 'E', '&', 0),

        (10, 'A', 'font-size', 1),
        (10, 'B', 'font-style', 0),
        (10, 'C', 'text-size', 0),
        (10, 'D', 'text-style', 0),
        (10, 'E', 'font-weight', 0),

        (11, 'A', 'Membuat halaman menjadi interaktif', 1),
        (11, 'B', 'Membuat database MySQL', 0),
        (11, 'C', 'Menggantikan sistem operasi', 0),
        (11, 'D', 'Membuat perangkat keras', 0),
        (11, 'E', 'Membuat desain grafis', 0),

        (12, 'A', 'const', 0),
        (12, 'B', 'let', 1),
        (12, 'C', 'class', 0),
        (12, 'D', 'return', 0),
        (12, 'E', 'var', 0),

        (13, 'A', 'console.log()', 1),
        (13, 'B', 'print.console()', 0),
        (13, 'C', 'document.print()', 0),
        (13, 'D', 'window.write()', 0),
        (13, 'E', 'alert.log()', 0),

        (14, 'A', '=', 0),
        (14, 'B', '==', 0),
        (14, 'C', '===', 1),
        (14, 'D', '!=', 0),
        (14, 'E', '<=', 0),

        (15, 'A', 'document.getElementById()', 1),
        (15, 'B', 'document.getElement()', 0),
        (15, 'C', 'document.selectId()', 0),
        (15, 'D', 'window.getId()', 0),
        (15, 'E', 'document.querySelector()', 0)
    `);

        await connection.commit();

        console.log('Seed database berhasil.');
        console.log('Jumlah ujian: 3');
        console.log('Jumlah soal setiap ujian: 5');
        console.log('Total soal ujian: 15');
        console.log('Total soal di Bank Soal: 15 (mudah: 6, sedang: 6, sulit: 3)');
        console.log('');
        console.log('Akun login:');
        console.log('Admin : yaya@cbt.test (langsung bisa login)');
        console.log('Guru  : guru@cbt.test (perlu verifikasi, kode: 123456)');
        console.log('Siswa : siswa@cbt.test (perlu verifikasi, kode: 654321)');
        console.log('Password semua akun: password123');
    } catch (error) {
        await connection.rollback();

        console.error(
            'Gagal seed database:',
            error.message
        );

        process.exitCode = 1;
    } finally {
        connection.release();
        await pool.end();

        console.log('Koneksi database ditutup.');
    }
}

seedDatabase();