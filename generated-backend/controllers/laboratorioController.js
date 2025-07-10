const { validationResult, body, query, param } = require('express-validator');

// --- Mock de la Base de Datos (Simulando Modelos) ---
// En una aplicación real, estos datos vendrían de una base de datos
// y las funciones de búsqueda serían métodos de un modelo (ej: Ejercicio.findById()).
const ejerciciosPorLeccion = {
  1: [ // JavaScript Básico
    { id: "ej1", tipo: "codigo", titulo: "Declaración de Variables", descripcion: "Declara una variable llamada 'nombre' con el valor 'Juan'", plantilla: "// Declara tu variable aquí\n", solucionEsperada: "let nombre = 'Juan';", testUnitarios: ["typeof nombre !== 'undefined'", "nombre === 'Juan'"], explicacion: "Las variables se declaran con 'let' seguido del nombre y el valor asignado." },
    { id: "ej2", tipo: "codigo", titulo: "Función Suma", descripcion: "Crea una función que sume dos números", plantilla: "// Crea la función suma aquí\nfunction suma(a, b) {\n  // Tu código aquí\n}\n", solucionEsperada: "function suma(a, b) { return a + b; }", testUnitarios: ["typeof suma === 'function'", "suma(2, 3) === 5", "suma(10, -5) === 5"], explicacion: "Una función debe usar 'return' para devolver el resultado de la operación." },
    { id: "ej3", tipo: "formulario", titulo: "Conceptos de JavaScript", descripcion: "Responde las siguientes preguntas sobre JavaScript", campos: [{ nombre: "tipoLenguaje", etiqueta: "¿Qué tipo de lenguaje es JavaScript?", tipo: "select", opciones: ["Compilado", "Interpretado", "Ensamblador"], respuestaCorrecta: "Interpretado" }, { nombre: "declaracionVariable", etiqueta: "¿Cuál es la palabra clave moderna para declarar variables?", tipo: "text", respuestaCorrecta: "let" }], explicacion: "JavaScript es un lenguaje interpretado y 'let' es la forma moderna de declarar variables." }
  ],
  2: [ // HTML Básico
    { id: "ej4", tipo: "codigo", titulo: "Estructura HTML", descripcion: "Crea una estructura HTML básica con un título h1", plantilla: "<!-- Escribe tu HTML aquí -->\n", solucionEsperada: "<h1>Mi Título</h1>", testUnitarios: ["code.includes('<h1>')", "code.includes('</h1>')"], explicacion: "Las etiquetas HTML deben abrirse y cerrarse correctamente." },
    { id: "ej5", tipo: "formulario", titulo: "Elementos HTML", descripcion: "Identifica los elementos HTML correctos", campos: [{ nombre: "etiquetaEnlace", etiqueta: "¿Qué etiqueta se usa para crear enlaces?", tipo: "select", opciones: ["<link>", "<a>", "<url>"], respuestaCorrecta: "<a>" }, { nombre: "atributoImagen", etiqueta: "¿Qué atributo es obligatorio en la etiqueta <img>?", tipo: "text", respuestaCorrecta: "src" }], explicacion: "La etiqueta <a> crea enlaces y <img> requiere el atributo 'src' para la fuente de la imagen." }
  ],
  3: [ // CSS Básico
    { id: "ej6", tipo: "codigo", titulo: "Selector CSS", descripcion: "Crea un selector CSS que cambie el color de texto a azul", plantilla: "/* Escribe tu CSS aquí */\n", solucionEsperada: "p { color: blue; }", testUnitarios: ["code.includes('color')", "code.includes('blue')"], explicacion: "Los selectores CSS definen qué elementos se van a estilizar y las propiedades definen cómo." }
  ]
};

let historialIntentos = [];

// --- Funciones de Ayuda (Simulando un Servicio o Modelo) ---

/**
 * Busca un ejercicio por su ID a través de todas las lecciones.
 * @param {string} ejercicioId - El ID del ejercicio a buscar.
 * @returns {object|null} El objeto del ejercicio o null si no se encuentra.
 */
const findEjercicioById = (ejercicioId) => {
  for (const leccionId in ejerciciosPorLeccion) {
    const ejercicio = ejerciciosPorLeccion[leccionId].find(ej => ej.id === ejercicioId);
    if (ejercicio) {
      return ejercicio;
    }
  }
  return null;
};

// --- Controladores ---

/**
 * @description Obtiene todos los ejercicios para una lección específica.
 * @route GET /api/laboratorio/ejercicios
 * @access Public
 */
const getEjerciciosPorLeccion = async (req, res) => {
  try {
    // Validación (se podría usar express-validator para más robustez)
    const { leccionId } = req.query;
    if (!leccionId) {
      return res.status(400).json({ msg: 'El parámetro \'leccionId\' es requerido.' });
    }

    const ejercicios = ejerciciosPorLeccion[leccionId];

    if (!ejercicios) {
      return res.status(404).json({ msg: `No se encontraron ejercicios para la lección con ID ${leccionId}.` });
    }

    // Se omite la solución y los tests para no dar la respuesta en la petición inicial
    const ejerciciosParaCliente = ejercicios.map(({ solucionEsperada, testUnitarios, ...resto }) => resto);

    res.status(200).json(ejerciciosParaCliente);

  } catch (error) {
    console.error('Error en getEjerciciosPorLeccion:', error.message);
    res.status(500).json({ msg: 'Error del servidor al obtener los ejercicios.' });
  }
};

/**
 * @description Obtiene un único ejercicio por su ID.
 * @route GET /api/laboratorio/ejercicios/:id
 * @access Public
 */
const getEjercicioPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const ejercicio = findEjercicioById(id);

    if (!ejercicio) {
      return res.status(404).json({ msg: `No se encontró el ejercicio con ID ${id}.` });
    }
    
    // Omitir la solución para no exponerla directamente
    const { solucionEsperada, testUnitarios, ...ejercicioParaCliente } = ejercicio;

    res.status(200).json(ejercicioParaCliente);

  } catch (error) {
    console.error('Error en getEjercicioPorId:', error.message);
    res.status(500).json({ msg: 'Error del servidor al obtener el ejercicio.' });
  }
};

/**
 * @description Procesa y evalúa el intento de un usuario para un ejercicio.
 * @route POST /api/laboratorio/intentos
 * @access Public
 */
const submitIntento = async (req, res) => {
  // Manejo de errores de validación de express-validator
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { ejercicioId, respuestaUsuario } = req.body;

    // Buscar el ejercicio original para obtener la solución y los tests
    const ejercicio = findEjercicioById(ejercicioId);
    if (!ejercicio) {
      return res.status(404).json({ msg: `El ejercicio con ID ${ejercicioId} no existe.` });
    }

    let esCorrecto = false;
    
    // Lógica de evaluación basada en el tipo de ejercicio
    if (ejercicio.tipo === 'codigo') {
        // En un entorno real, se usaría un sandbox para ejecutar el código y los tests.
        // Para esta simulación, comparamos la respuesta normalizada.
        const solucionLimpia = ejercicio.solucionEsperada.replace(/\s+/g, ' ').trim();
        const respuestaLimpia = respuestaUsuario.replace(/\s+/g, ' ').trim();
        esCorrecto = solucionLimpia === respuestaLimpia;
    } else if (ejercicio.tipo === 'formulario') {
        // Para formularios, se espera que `respuestaUsuario` sea un objeto { campo: valor, ... }
        esCorrecto = ejercicio.campos.every(
            (campo) => respuestaUsuario[campo.nombre] && 
                      respuestaUsuario[campo.nombre].toString().trim().toLowerCase() === campo.respuestaCorrecta.toString().trim().toLowerCase()
        );
    }

    const resultadoIntento = {
      intentoId: `int-${Date.now()}-${Math.random()}`,
      ejercicioId,
      respuestaUsuario,
      esCorrecto,
      timestamp: new Date().toISOString(),
      feedback: esCorrecto ? '¡Correcto! Buen trabajo.' : ejercicio.explicacion
    };

    // Guardar el intento en el historial (simulado en memoria)
    historialIntentos.push(resultadoIntento);

    // Responder con el resultado de la evaluación
    res.status(201).json(resultadoIntento);

  } catch (error) {
    console.error('Error en submitIntento:', error.message);
    res.status(500).json({ msg: 'Error del servidor al procesar el intento.' });
  }
};

/**
 * @description Obtiene el historial de todos los intentos realizados.
 * @route GET /api/laboratorio/intentos
 * @access Public // En un caso real, sería privado (para un admin o un usuario específico)
 */
const getHistorialIntentos = async (req, res) => {
  try {
    // Se podría filtrar por usuario o ejercicio con query params
    // ej: /api/laboratorio/intentos?ejercicioId=ej1
    const { ejercicioId } = req.query;
    let historialFiltrado = historialIntentos;

    if (ejercicioId) {
      historialFiltrado = historialIntentos.filter(intento => intento.ejercicioId === ejercicioId);
    }

    res.status(200).json(historialFiltrado);

  } catch (error) {
    console.error('Error en getHistorialIntentos:', error.message);
    res.status(500).json({ msg: 'Error del servidor al obtener el historial.' });
  }
};

// Reglas de validación para reutilizar en las rutas
const submitIntentoValidationRules = () => {
    return [
        body('ejercicioId', 'El ID del ejercicio es obligatorio.').not().isEmpty().isString(),
        body('respuestaUsuario', 'La respuesta del usuario es obligatoria.').not().isEmpty(),
    ];
};

module.exports = {
  getEjerciciosPorLeccion,
  getEjercicioPorId,
  submitIntento,
  getHistorialIntentos,
  submitIntentoValidationRules
};