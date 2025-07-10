const cursoService = require('../services/cursoService');

/**
 * @description Obtiene todos los cursos del marketplace. Permite filtrar por query params.
 * @route GET /api/cursos
 * @access Public
 */
const getAllCursos = async (req, res) => {
  try {
    // Los filtros se pasan directamente al servicio que contendrá la lógica de filtrado
    const cursos = await cursoService.findAll(req.query);
    res.status(200).json(cursos);
  } catch (error) {
    console.error('Error al obtener los cursos:', error);
    res.status(500).json({ message: 'Error interno del servidor al procesar la solicitud.' });
  }
};

/**
 * @description Obtiene un curso específico por su ID.
 * @route GET /api/cursos/:id
 * @access Public
 */
const getCursoById = async (req, res) => {
  try {
    const { id } = req.params;
    const curso = await cursoService.findById(parseInt(id, 10));

    if (!curso) {
      return res.status(404).json({ message: 'Curso no encontrado.' });
    }

    res.status(200).json(curso);
  } catch (error) {
    console.error(`Error al obtener el curso con ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error interno del servidor.' });
  }
};

/**
 * @description Crea un nuevo curso en el marketplace.
 * @route POST /api/cursos
 * @access Private/Admin
 */
const createCurso = async (req, res) => {
  try {
    const cursoData = req.body;

    // Validación básica de datos de entrada
    if (!cursoData.titulo || !cursoData.autor || !cursoData.categoria || !cursoData.precio === undefined) {
      return res.status(400).json({ message: 'Faltan campos obligatorios: titulo, autor, categoria, precio.' });
    }

    const nuevoCurso = await cursoService.create(cursoData);

    // 201 Created es el código de estado apropiado para una creación exitosa.
    res.status(201).json(nuevoCurso);
  } catch (error) {
    console.error('Error al crear el curso:', error);
    res.status(500).json({ message: 'Error interno del servidor al crear el curso.' });
  }
};

/**
 * @description Actualiza un curso existente por su ID.
 * @route PUT /api/cursos/:id
 * @access Private/Admin
 */
const updateCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Validación: asegurar que el cuerpo de la petición no esté vacío
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron datos para actualizar.' });
    }

    const cursoActualizado = await cursoService.update(parseInt(id, 10), updateData);

    if (!cursoActualizado) {
      return res.status(404).json({ message: 'Curso no encontrado para actualizar.' });
    }

    res.status(200).json(cursoActualizado);
  } catch (error) {
    console.error(`Error al actualizar el curso con ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error interno del servidor al actualizar.' });
  }
};

/**
 * @description Elimina un curso por su ID.
 * @route DELETE /api/cursos/:id
 * @access Private/Admin
 */
const deleteCurso = async (req, res) => {
  try {
    const { id } = req.params;
    const cursoEliminado = await cursoService.remove(parseInt(id, 10));

    if (!cursoEliminado) {
      return res.status(404).json({ message: 'Curso no encontrado para eliminar.' });
    }

    // 204 No Content es una respuesta común para un DELETE exitoso, no devuelve cuerpo.
    res.status(204).send();
  } catch (error) {
    console.error(`Error al eliminar el curso con ID ${req.params.id}:`, error);
    res.status(500).json({ message: 'Error interno del servidor al eliminar.' });
  }
};

module.exports = {
  getAllCursos,
  getCursoById,
  createCurso,
  updateCurso,
  deleteCurso,
};