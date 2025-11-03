const { body } = require('express-validator');

exports.validateRegister = [
  body('email')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('La contraseña debe tener al menos 6 caracteres')
    .matches(/[A-Z]/)
    .withMessage('La contraseña debe incluir al menos una letra mayúscula')
    .matches(/[a-z]/)
    .withMessage('La contraseña debe incluir al menos una letra minúscula')
    .matches(/[0-9]/)
    .withMessage('La contraseña debe incluir al menos un número'),
  body('name')
    .trim()
    .isLength({ min: 1, max: 255 })
    .withMessage('El nombre es obligatorio y debe tener menos de 255 caracteres'),
  body('username')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('El nombre de usuario debe tener entre 3 y 100 caracteres')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('El nombre de usuario solo puede contener letras, números y guiones bajos')
];

exports.validateLogin = [
  body('email')
    .isEmail()
    .withMessage('Debe ser un email válido')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es obligatoria')
];
