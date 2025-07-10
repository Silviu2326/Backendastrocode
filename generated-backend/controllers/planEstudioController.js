/**
 * planEstudioController.js
 * 
 * Este archivo contiene los controladores para gestionar los planes de estudio,
 * sus actividades y la generación de calendarios.
 * Nota: La lógica de negocio y acceso a datos debería estar abstraída en una capa de servicio
 * (ej. `planEstudioService`), que es la encargada de interactuar con la base de datos
 * o cualquier otra fuente de datos. Los controladores se encargan de la validación
 * de la solicitud (request), invocar los servicios y formatear la respuesta (response).
 */

// En una aplicación real, se importaría el servicio correspondiente:
// import * as planEstudioService from '../services/planEstudioService';

/**
 * @description Obtiene un plan de estudio por su ID.
 * @route GET /api/planes-estudio/:id
 * @access Publico
 */
export const getPlanEstudioById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validación básica en la capa del controlador.
    // Para validaciones más complejas se pueden usar librerías como Joi o express-validator.
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: 'El ID del plan de estudio debe ser un número válido.' });
    }

    // --- Lógica de servicio (simulada aquí para el ejemplo) ---
    // En un caso real, esta llamada sería: const planEstudio = await planEstudioService.getPlanById(id);
    if (parseInt(id, 10) > 100) { // Simula un plan no encontrado
      const error = new Error('Plan de estudio no encontrado.');
      error.statusCode = 404;
      throw error;
    }
    // Datos simulados del plan de estudio
    const planEstudio = {
        id: id,
        titulo: `Plan de estudio: Desarrollo Web Frontend (ID: ${id})`,
        duracion: "8 semanas",
        progreso: 35,
        semanas: [
          { numero: 1, titulo: "Fundamentos de HTML y CSS", actividades: [{ id: 1, nombre: "Introducción a HTML", tipo: "lectura", duracion: 45, completado: true }]},
          { numero: 2, titulo: "Diseño Responsivo y Flexbox", actividades: [{ id: 5, nombre: "Principios de diseño responsivo", tipo: "lectura", duracion: 45, completado: false }]},
          { numero: 3, titulo: "JavaScript Básico", actividades: [{ id: 9, nombre: "Introducción a JavaScript", tipo: "lectura", duracion: 45, completado: false }]}
        ]
      };
    // --- Fin de la simulación ---

    // Respuesta exitosa
    res.status(200).json(planEstudio);

  } catch (error) {
    // Pasa el error al siguiente middleware (manejador de errores global).
    // Esto captura tanto errores de negocio (ej. 404) como errores inesperados (500).
    next(error);
  }
};

/**
 * @description Actualiza el estado de completado de una actividad.
 * @route PATCH /api/actividades/:id
 * @access Privado (se asumiría autenticación)
 */
export const updateActividadStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { completed } = req.body;

    // --- Validación de la entrada ---
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: 'El ID de la actividad debe ser un número válido.' });
    }
    if (typeof completed !== 'boolean') {
      return res.status(400).json({ message: 'El campo "completed" es requerido y debe ser un booleano (true/false).' });
    }

    // --- Lógica de servicio (simulada aquí) ---
    // const result = await planEstudioService.updateActivityStatus(id, completed);
    if (parseInt(id, 10) > 50) { // Simula una actividad no encontrada
      const error = new Error('Actividad no encontrada.');
      error.statusCode = 404;
      throw error;
    }
    const result = {
      success: true,
      message: `Actividad ${id} ${completed ? 'completada' : 'marcada como pendiente'} correctamente`,
    };
    // --- Fin de la simulación ---

    res.status(200).json(result);

  } catch (error) {
    next(error);
  }
};

/**
 * @description Genera un calendario de estudio basado en un plan y la disponibilidad del usuario.
 * @route POST /api/planes-estudio/:id/calendario
 * @access Privado (se asumiría autenticación)
 */
export const generarCalendario = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { disponibilidad } = req.body;

    // --- Validación de la entrada ---
    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({ message: 'El ID del plan de estudio debe ser un número válido.' });
    }
    if (!disponibilidad || !Array.isArray(disponibilidad) || disponibilidad.length === 0) {
      return res.status(400).json({ message: 'El campo "disponibilidad" es requerido y debe ser un arreglo no vacío.' });
    }
    const diasValidos = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    for (const item of disponibilidad) {
      if (!item.dia || !diasValidos.includes(item.dia.toLowerCase()) || typeof item.horas !== 'number' || item.horas < 0) {
        return res.status(400).json({
          message: 'Formato de "disponibilidad" incorrecto. Cada elemento debe ser un objeto con "dia" (string) y "horas" (número >= 0).'
        });
      }
    }

    // --- Lógica de negocio (Idealmente en la capa de servicio) ---

    // 1. Obtener el plan de estudio base (simulado)
    // const planEstudio = await planEstudioService.getPlanById(id);
    if (parseInt(id, 10) > 100) {
      const error = new Error('Plan de estudio base para el calendario no encontrado.');
      error.statusCode = 404;
      throw error;
    }
    const planEstudio = {
        semanas: [
          { numero: 1, titulo: "Fundamentos de HTML y CSS", actividades: [ { id: 1, nombre: "Introducción a HTML", duracion: 45 }, { id: 2, nombre: "Estructura básica de una página web", duracion: 60 }, { id: 3, nombre: "CSS Básico", duracion: 45 }, { id: 4, nombre: "Proyecto: Mi primera página web", duracion: 120 } ] },
          { numero: 2, titulo: "Diseño Responsivo y Flexbox", actividades: [ { id: 5, nombre: "Principios de diseño responsivo", duracion: 45 }, { id: 6, nombre: "Media queries", duracion: 60 }, { id: 7, nombre: "Flexbox layout", duracion: 45 }, { id: 8, nombre: "Proyecto: Sitio web responsivo", duracion: 120 } ] },
          { numero: 3, titulo: "JavaScript Básico", actividades: [ { id: 9, nombre: "Introducción a JavaScript", duracion: 45 }, { id: 10, nombre: "Variables y tipos de datos", duracion: 60 }, { id: 11, nombre: "Funciones y eventos", duracion: 45 }, { id: 12, nombre: "Proyecto: Aplicación interactiva simple", duracion: 120 } ] }
        ]
      };

    // 2. Generar el calendario (lógica del archivo original adaptada)
    const leccionesCalendarizadas = [];
    let fechaActual = new Date();
    const todasActividades = planEstudio.semanas.flatMap(s => s.actividades.map(a => ({...a, semana: s.numero, tituloSemana: s.titulo})));
    
    let actividadIndex = 0;
    let diasProcesados = 0; // Límite para evitar bucles infinitos
    const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

    while (actividadIndex < todasActividades.length && diasProcesados < 365) {
      const diaSemanaActual = diasSemana[fechaActual.getDay()];
      const disponibilidadDia = disponibilidad.find(d => d.dia.toLowerCase() === diaSemanaActual);
      
      if (disponibilidadDia && disponibilidadDia.horas > 0) {
        let tiempoDisponibleHoy = disponibilidadDia.horas * 60; // en minutos
        const actividadesDelDia = [];

        while (actividadIndex < todasActividades.length && tiempoDisponibleHoy >= todasActividades[actividadIndex].duracion) {
          const actividadActual = todasActividades[actividadIndex];
          actividadesDelDia.push(actividadActual);
          tiempoDisponibleHoy -= actividadActual.duracion;
          actividadIndex++;
        }

        if (actividadesDelDia.length > 0) {
          leccionesCalendarizadas.push({
            fecha: fechaActual.toISOString().split('T')[0],
            dia: diaSemanaActual,
            actividades: actividadesDelDia
          });
        }
      }
      fechaActual.setDate(fechaActual.getDate() + 1);
      diasProcesados++;
    }

    // Respuesta 201 Created, ya que se creó un nuevo recurso (el calendario).
    res.status(201).json({
      message: 'Calendario de estudio generado exitosamente.',
      calendario: leccionesCalendarizadas,
    });

  } catch (error) {
    next(error);
  }
};