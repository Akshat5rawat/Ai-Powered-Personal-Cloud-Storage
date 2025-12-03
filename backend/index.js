const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');
const searchRoutes = require('./routes/search');
const aiRoutes = require('./routes/ai');
const minioService = require('./services/minioService');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/auth', authRoutes);
app.use('/files', fileRoutes);
app.use('/search', searchRoutes);
app.use('/ai', aiRoutes);

app.get('/', (req, res) => {
  res.send('AI Personal Cloud Backend');
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(async () => {
  console.log('Connected to MongoDB');
  try {
    await minioService.ensureBucket();
    console.log('Ensured minio bucket exists');
  } catch (err) {
    console.warn('Failed to ensure minio bucket on startup', err.message);
  }
  app.listen(process.env.PORT || 5000, () => {
    console.log(`Server listening on port ${process.env.PORT || 5000}`);
  });
}).catch(err => {
  console.error('Failed to connect to MongoDB', err);
});
