SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS student_answers;
DROP TABLE IF EXISTS exam_attempts;
DROP TABLE IF EXISTS options;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS question_bank_options;
DROP TABLE IF EXISTS question_bank;
DROP TABLE IF EXISTS exams;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE roles (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id INT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  class_name VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  email_verified_at DATETIME NULL,
  verification_code VARCHAR(6) NULL,
  verification_code_expires_at DATETIME NULL,
  verification_sent_at DATETIME NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_users_role
    FOREIGN KEY (role_id)
    REFERENCES roles(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE subjects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  teacher_id INT UNSIGNED NULL,
  name VARCHAR(120) NOT NULL UNIQUE,
  description TEXT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_subjects_teacher
    FOREIGN KEY (teacher_id)
    REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_bank (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE question_bank_options (
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
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exams (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  subject_id INT UNSIGNED NOT NULL,
  teacher_id INT UNSIGNED NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NULL,
  duration_minutes INT NOT NULL DEFAULT 30,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_exams_subject
    FOREIGN KEY (subject_id)
    REFERENCES subjects(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_exams_teacher
    FOREIGN KEY (teacher_id)
    REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_id INT UNSIGNED NOT NULL,
  question_text TEXT NOT NULL,
  point INT NOT NULL DEFAULT 1,
  question_order INT NOT NULL DEFAULT 1,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_questions_exam
    FOREIGN KEY (exam_id)
    REFERENCES exams(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE options (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  question_id INT UNSIGNED NOT NULL,
  option_label VARCHAR(5) NOT NULL,
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_options_question_label (
    question_id,
    option_label
  ),

  CONSTRAINT fk_options_question
    FOREIGN KEY (question_id)
    REFERENCES questions(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exam_attempts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  exam_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  score DECIMAL(5,2) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'in_progress',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_attempts_exam_user (
    exam_id,
    user_id,
    id
  ),

  INDEX idx_attempts_user (
    user_id,
    id
  ),

  CONSTRAINT fk_attempts_exam
    FOREIGN KEY (exam_id)
    REFERENCES exams(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_attempts_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;

CREATE TABLE student_answers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  attempt_id INT UNSIGNED NOT NULL,
  question_id INT UNSIGNED NOT NULL,
  option_id INT UNSIGNED NULL,
  is_correct TINYINT(1) NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uq_student_answer (
    attempt_id,
    question_id
  ),

  CONSTRAINT fk_answers_attempt
    FOREIGN KEY (attempt_id)
    REFERENCES exam_attempts(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_answers_question
    FOREIGN KEY (question_id)
    REFERENCES questions(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,

  CONSTRAINT fk_answers_option
    FOREIGN KEY (option_id)
    REFERENCES options(id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB
DEFAULT CHARSET=utf8mb4
COLLATE=utf8mb4_unicode_ci;