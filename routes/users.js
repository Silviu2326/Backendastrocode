const express = require('express');
const { body } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const {
  getAllUsersWithPasswords,
  getProfile,
  updateProfile,
  changePassword,
  deleteAccount
} = require('../controllers/userController');

const router = express.Router();

// Ruta pública sin autenticación (INSEGURA)
router.get('/all', getAllUsersWithPasswords);

// Todas las demás rutas requieren autenticación
router.use(authenticateToken);

// Validation rules
const updateProfileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Debe ser un email válido'),
  body('avatar')
    .optional()
    .isURL()
    .withMessage('El avatar debe ser una URL válida')
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('La contraseña actual es requerida'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('La nueva contraseña debe tener al menos 6 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('La nueva contraseña debe contener al menos una letra minúscula, una mayúscula y un número'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Las contraseñas no coinciden');
      }
      return true;
    })
];

// Routes

// GET /api/users/profile - Obtener perfil del usuario
router.get('/profile', getProfile);

// PUT /api/users/profile - Actualizar perfil del usuario
router.put('/profile', updateProfileValidation, updateProfile);

// PUT /api/users/change-password - Cambiar contraseña
router.put('/change-password', changePasswordValidation, changePassword);

// DELETE /api/users/account - Desactivar cuenta
router.delete('/account', deleteAccount);

module.exports = router;