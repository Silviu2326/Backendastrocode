/**
 * cursoController.js
 * Lógica de negocio para el recurso de Cursos.
 */

// En una aplicación real, esto se importaría desde un archivo de modelos de base de datos (ej. Mongoose, Sequelize).
// Para este caso, importamos los datos simulados y los hacemos mutables para simular un CRUD.
import { mockCursosPopulares } from '../data/mockData.js'; // Asumimos que mockData está en una carpeta 'data'

// Creamos una copia mutable de los datos para simular una base de datos en memoria.
let cursos = [...mockCursosPopulares];

/**
 * @desc    Obtiene todos los cursos
 * @route   GET /api/cursos
 * @access  Public
 */
export const getAllCursos = async (req, res) => {
  try {
    // En una app real, aquí se haría la consulta a la BD: const cursos = await Curso.find();
    res.status(200).json({
      success: true,
      count: cursos.length,
      data: cursos,
    });
  } catch (error) {
    console.error('Error al obtener los cursos:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Obtiene un curso por su ID
 * @route   GET /api/cursos/:id
 * @access  Public
 */
export const getCursoById = async (req, res) => {
  try {
    // Buscamos el curso por ID. req.params.id es un string, por lo que se convierte a número.
    const curso = cursos.find((c) => c.id === parseInt(req.params.id));

    if (!curso) {
      return res.status(404).json({ success: false, message: `Curso no encontrado con el id ${req.params.id}` });
    }

    res.status(200).json({
      success: true,
      data: curso,
    });
  } catch (error) {
    console.error(`Error al obtener el curso ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Crea un nuevo curso
 * @route   POST /api/cursos
 * @access  Private/Admin (Normalmente, la creación es una ruta protegida)
 */
export const createCurso = async (req, res) => {
  try {
    const { title, instructor, level, duration } = req.body;

    // Validación simple de datos de entrada
    if (!title || !instructor || !level || !duration) {
      return res.status(400).json({ success: false, message: 'Por favor, proporcione título, instructor, nivel y duración' });
    }

    // Simulamos la creación de un nuevo ID auto-incremental
    const newId = cursos.length > 0 ? Math.max(...cursos.map(c => c.id)) + 1 : 1;
    
    const nuevoCurso = {
      id: newId,
      title,
      instructor,
      level,
      duration,
      rating: req.body.rating || 0, // Valor por defecto
      students: req.body.students || "0", // Valor por defecto
      thumbnail: req.body.thumbnail || "https://via.placeholder.com/400x300", // Imagen de relleno
    };

    cursos.push(nuevoCurso);

    // Respondemos con 201 (Created) y el objeto creado
    res.status(201).json({
      success: true,
      data: nuevoCurso,
    });
  } catch (error) {
    console.error('Error al crear el curso:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Actualiza un curso por su ID
 * @route   PUT /api/cursos/:id
 * @access  Private/Admin
 */
export const updateCurso = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cursoIndex = cursos.findIndex((c) => c.id === id);

    if (cursoIndex === -1) {
      return res.status(404).json({ success: false, message: `Curso no encontrado con el id ${id}` });
    }
    
    // Actualizamos el objeto del curso combinando el existente con los datos del body
    const cursoActualizado = { ...cursos[cursoIndex], ...req.body };
    cursos[cursoIndex] = cursoActualizado;

    res.status(200).json({
      success: true,
      data: cursoActualizado,
    });
  } catch (error) {
    console.error(`Error al actualizar el curso ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Elimina un curso por su ID
 * @route   DELETE /api/cursos/:id
 * @access  Private/Admin
 */
export const deleteCurso = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const cursoIndex = cursos.findIndex((c) => c.id === id);

    if (cursoIndex === -1) {
      return res.status(404).json({ success: false, message: `Curso no encontrado con el id ${id}` });
    }

    // Filtramos el array para "eliminar" el curso, creando un nuevo array sin él
    cursos = cursos.filter((c) => c.id !== id);

    // Respondemos con 200 y un mensaje de éxito, o 204 (No Content) sin cuerpo de respuesta
    res.status(200).json({
      success: true,
      message: `Curso con id ${id} eliminado correctamente`
    });
  } catch (error) {
    console.error(`Error al eliminar el curso ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};