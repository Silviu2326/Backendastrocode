/**
 * testimonioController.js
 * Lógica de negocio para el recurso de Testimonios.
 */

import { mockTestimonios } from '../data/mockData.js'; // Asumimos que mockData está en una carpeta 'data'

// Creamos una copia mutable de los datos para simular una base de datos en memoria.
let testimonios = [...mockTestimonios];

/**
 * @desc    Obtiene todos los testimonios
 * @route   GET /api/testimonios
 * @access  Public
 */
export const getAllTestimonios = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      count: testimonios.length,
      data: testimonios,
    });
  } catch (error) {
    console.error('Error al obtener los testimonios:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Obtiene un testimonio por su ID
 * @route   GET /api/testimonios/:id
 * @access  Public
 */
export const getTestimonioById = async (req, res) => {
  try {
    const testimonio = testimonios.find((t) => t.id === parseInt(req.params.id));

    if (!testimonio) {
      return res.status(404).json({ success: false, message: `Testimonio no encontrado con el id ${req.params.id}` });
    }

    res.status(200).json({
      success: true,
      data: testimonio,
    });
  } catch (error) {
    console.error(`Error al obtener el testimonio ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Crea un nuevo testimonio
 * @route   POST /api/testimonios
 * @access  Public (o Private si solo usuarios logueados pueden crear)
 */
export const createTestimonio = async (req, res) => {
  try {
    const { name, role, quote, rating } = req.body;

    // Validación de datos de entrada
    if (!name || !role || !quote || rating === undefined) {
      return res.status(400).json({ success: false, message: 'Por favor, proporcione nombre, rol, cita y calificación' });
    }
    if(typeof rating !== 'number' || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'La calificación debe ser un número entre 1 y 5' });
    }

    // Simulamos la creación de un nuevo ID
    const newId = testimonios.length > 0 ? Math.max(...testimonios.map(t => t.id)) + 1 : 1;
    
    const nuevoTestimonio = {
      id: newId,
      name,
      role,
      quote,
      rating,
      avatar: req.body.avatar || "https://via.placeholder.com/100x100", // Imagen de relleno
    };

    testimonios.push(nuevoTestimonio);

    res.status(201).json({
      success: true,
      data: nuevoTestimonio,
    });
  } catch (error) {
    console.error('Error al crear el testimonio:', error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Actualiza un testimonio por su ID
 * @route   PUT /api/testimonios/:id
 * @access  Private/Admin
 */
export const updateTestimonio = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const testimonioIndex = testimonios.findIndex((t) => t.id === id);

    if (testimonioIndex === -1) {
      return res.status(404).json({ success: false, message: `Testimonio no encontrado con el id ${id}` });
    }

    // Validación para rating si se está actualizando
    if (req.body.rating !== undefined && (typeof req.body.rating !== 'number' || req.body.rating < 1 || req.body.rating > 5)) {
        return res.status(400).json({ success: false, message: 'La calificación debe ser un número entre 1 y 5' });
    }
    
    const testimonioActualizado = { ...testimonios[testimonioIndex], ...req.body };
    testimonios[testimonioIndex] = testimonioActualizado;

    res.status(200).json({
      success: true,
      data: testimonioActualizado,
    });
  } catch (error) {
    console.error(`Error al actualizar el testimonio ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};

/**
 * @desc    Elimina un testimonio por su ID
 * @route   DELETE /api/testimonios/:id
 * @access  Private/Admin
 */
export const deleteTestimonio = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const testimonioIndex = testimonios.findIndex((t) => t.id === id);

    if (testimonioIndex === -1) {
      return res.status(404).json({ success: false, message: `Testimonio no encontrado con el id ${id}` });
    }

    testimonios = testimonios.filter((t) => t.id !== id);

    res.status(200).json({
      success: true,
      message: `Testimonio con id ${id} eliminado correctamente`
    });
  } catch (error) {
    console.error(`Error al eliminar el testimonio ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Error interno del servidor' });
  }
};