const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  register,
  login,
  getMe,
  verifyToken
} = require('../controllers/authController');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('El nombre debe tener entre 2 y 50 caracteres'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Debe ser un email válido'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Debe ser un email válido'),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es requerida')
];

// Routes

// POST /api/auth/register - Registrar nuevo usuario
router.post('/register', registerValidation, register);

// POST /api/auth/login - Iniciar sesión
router.post('/login', loginValidation, login);

// GET /api/auth/me - Obtener información del usuario autenticado
router.get('/me', authenticateToken, getMe);

// POST /api/auth/verify-token - Verificar si un token es válido
router.post('/verify-token', verifyToken);

module.exports = router;