require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const connectDB = require('./config/database');

// Importar rutas
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const userRoutes = require('./routes/users');
const estudiosMercadoRoutes = require('./routes/estudios-mercado');
const documentosRoutes = require('./routes/documentos');

const app = express();
const PORT = process.env.PORT || 3001;

// Conectar a MongoDB
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    'http://localhost:5174',
    'https://astrocode-psi.vercel.app'
  ],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/estudios-mercado', estudiosMercadoRoutes);
app.use('/api/documentos', documentosRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Project Manager API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `Route ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/projects',
      'POST /api/projects',
      'GET /api/users/profile',
      'POST /api/estudios-mercado',
      'GET /api/estudios-mercado/proyecto/:projectId',
      'GET /api/estudios-mercado/:id',
      'PUT /api/estudios-mercado/:id',
      'DELETE /api/estudios-mercado/:id',
      'GET /api/projects/:projectId/documentos',
      'POST /api/projects/:projectId/documentos',
      'GET /api/documentos/:id',
      'PUT /api/documentos/:id',
      'DELETE /api/documentos/:id',
      'PUT /api/documentos/:id/archive',
      'GET /api/projects/:projectId/documentos/tipo/:tipo',
      'GET /api/projects/:projectId/documentos/stats'
    ]
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📱 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
  console.log(`🔗 API Health: http://localhost:${PORT}/api/health`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;