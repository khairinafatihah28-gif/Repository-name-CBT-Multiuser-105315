require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const authRoutes = require(
  './src/routes/auth'
);

const examRoutes = require(
  './src/routes/exams'
);

const adminRoutes = require(
  './src/routes/admin'
);

const questionBankRoutes = require(
  './src/routes/question-bank'
);

const app = express();

const port = Number(
  process.env.APP_PORT || 3000
);

app.use(cors());

app.use(express.json());

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      app:
        process.env.APP_NAME ||
        'CBT_APP',

      status: 'ok',

      message:
        'CBT API berjalan dengan baik.'
    });
  }
);

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/exams',
  examRoutes
);

app.use(
  '/api/admin',
  adminRoutes
);

app.use(
  '/api/question-bank',
  questionBankRoutes
);

app.use(
  (req, res) => {
    res.status(404).json({
      message:
        'Endpoint tidak ditemukan.'
    });
  }
);

app.use(
  (err, req, res, next) => {
    console.error(err);

    res
      .status(err.status || 500)
      .json({
        message:
          err.message ||
          'Terjadi kesalahan pada server.'
      });
  }
);

app.listen(
  port,
  () => {
    console.log(
      `CBT app berjalan di http://localhost:${port}`
    );
  }
);