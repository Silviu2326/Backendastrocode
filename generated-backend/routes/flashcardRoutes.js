const { Router } = require('express');
const { body, param } = require('express-validator');

// --- Importaciones Hipotéticas ---
// Se asume que los controladores y middlewares existen en estos archivos.
// Los controladores contienen la lógica de negocio (ej. interactuar con la base de datos).
const flashcardController = require('../controllers/flashcardController');
const { handleValidationErrors } = require('../middlewares/validationHandler');

const router = Router();

// ======================================================
//      RUTAS PARA CONJUNTOS DE FLASHCARDS (/flashcard-sets)
// ======================================================

/**
 * @route   GET /api/flashcard-sets
 * @desc    Obtener todos los conjuntos de flashcards.
 * @access  Public
 * @returns 200 OK con un array de conjuntos de flashcards.
 * @returns 500 Internal Server Error si ocurre un error en el servidor.
 */
router.get('/', flashcardController.getAllSets);

/**
 * @route   GET /api/flashcard-sets/:setId
 * @desc    Obtener un conjunto de flashcards por su ID.
 * @access  Public
 * @param   {number} setId - El ID numérico del conjunto de flashcards.
 * @returns 200 OK con el objeto del conjunto de flashcards.
 * @returns 404 Not Found si el conjunto no existe.
 * @returns 400 Bad Request si el ID no es un entero.
 */
router.get(
  '/:setId',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    handleValidationErrors
  ],
  flashcardController.getSetById
);

/**
 * @route   POST /api/flashcard-sets
 * @desc    Crear un nuevo conjunto de flashcards.
 * @access  Private (se asume que requiere autenticación).
 * @body    { "title": "string", "description": "string" }
 * @returns 201 Created con el nuevo conjunto de flashcards creado.
 * @returns 400 Bad Request si los datos de entrada son inválidos (ej. título vacío).
 */
router.post(
  '/',
  [
    body('title', 'El título es obligatorio y no puede estar vacío').not().isEmpty().trim(),
    body('description', 'La descripción es obligatoria').not().isEmpty().trim(),
    handleValidationErrors
  ],
  flashcardController.createSet
);

/**
 * @route   PUT /api/flashcard-sets/:setId
 * @desc    Actualizar un conjunto de flashcards existente.
 * @access  Private
 * @param   {number} setId - El ID del conjunto a actualizar.
 * @body    { "title": "string", "description": "string" }
 * @returns 200 OK con el conjunto actualizado.
 * @returns 400 Bad Request si los datos son inválidos.
 * @returns 404 Not Found si el conjunto no existe.
 */
router.put(
  '/:setId',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    body('title', 'El título es obligatorio').not().isEmpty().trim(),
    body('description', 'La descripción es obligatoria').not().isEmpty().trim(),
    handleValidationErrors
  ],
  flashcardController.updateSet
);

/**
 * @route   DELETE /api/flashcard-sets/:setId
 * @desc    Eliminar un conjunto de flashcards.
 * @access  Private
 * @param   {number} setId - El ID del conjunto a eliminar.
 * @returns 200 OK con un mensaje de éxito.
 * @returns 204 No Content (alternativa común para DELETE exitoso).
 * @returns 404 Not Found si el conjunto no existe.
 */
router.delete(
  '/:setId',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    handleValidationErrors
  ],
  flashcardController.deleteSet
);


// ======================================================
//      RUTAS PARA TARJETAS DENTRO DE UN CONJUNTO
//      /flashcard-sets/:setId/cards
// ======================================================

/**
 * @route   GET /api/flashcard-sets/:setId/cards
 * @desc    Obtener todas las tarjetas de un conjunto específico.
 * @access  Public
 * @param   {number} setId - El ID del conjunto.
 * @returns 200 OK con el array de tarjetas.
 * @returns 404 Not Found si el conjunto no existe.
 */
router.get(
    '/:setId/cards',
    [
        param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
        handleValidationErrors
    ],
    flashcardController.getAllCardsInSet
);

/**
 * @route   POST /api/flashcard-sets/:setId/cards
 * @desc    Crear una nueva tarjeta en un conjunto específico.
 * @access  Private
 * @param   {number} setId - El ID del conjunto.
 * @body    { "question": "string", "answer": "string" }
 * @returns 201 Created con la nueva tarjeta creada.
 * @returns 400 Bad Request si los datos son inválidos.
 * @returns 404 Not Found si el conjunto no existe.
 */
router.post(
  '/:setId/cards',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    body('question', 'La pregunta es obligatoria').not().isEmpty().trim(),
    body('answer', 'La respuesta es obligatoria').not().isEmpty().trim(),
    handleValidationErrors
  ],
  flashcardController.createCardInSet
);

/**
 * @route   PUT /api/flashcard-sets/:setId/cards/:cardId
 * @desc    Actualizar una tarjeta específica en un conjunto.
 * @access  Private
 * @param   {number} setId - El ID del conjunto.
 * @param   {number} cardId - El ID de la tarjeta a actualizar.
 * @body    { "question": "string", "answer": "string" }
 * @returns 200 OK con la tarjeta actualizada.
 * @returns 404 Not Found si el conjunto o la tarjeta no existen.
 */
router.put(
  '/:setId/cards/:cardId',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    param('cardId', 'El ID de la tarjeta debe ser un número entero').isInt(),
    body('question', 'La pregunta es obligatoria').not().isEmpty().trim(),
    body('answer', 'La respuesta es obligatoria').not().isEmpty().trim(),
    handleValidationErrors
  ],
  flashcardController.updateCardInSet
);

/**
 * @route   DELETE /api/flashcard-sets/:setId/cards/:cardId
 * @desc    Eliminar una tarjeta específica de un conjunto.
 * @access  Private
 * @param   {number} setId - El ID del conjunto.
 * @param   {number} cardId - El ID de la tarjeta a eliminar.
 * @returns 200 OK con un mensaje de éxito.
 * @returns 404 Not Found si el conjunto o la tarjeta no existen.
 */
router.delete(
  '/:setId/cards/:cardId',
  [
    param('setId', 'El ID del conjunto debe ser un número entero').isInt(),
    param('cardId', 'El ID de la tarjeta debe ser un número entero').isInt(),
    handleValidationErrors
  ],
  flashcardController.deleteCardInSet
);


module.exports = router;
