const respuestasSimuladas = {
  javascript: [
    {
      texto: "JavaScript es un lenguaje de programación interpretado que se ejecuta principalmente en navegadores web. Es fundamental para el desarrollo web moderno.",
      audio: null
    },
    {
      texto: "Las variables en JavaScript se pueden declarar con 'var', 'let' o 'const'. Te recomiendo usar 'let' para variables que cambiarán y 'const' para constantes.",
      audio: "/audio/variables-js.mp3"
    }
  ],
  html: [
    {
      texto: "HTML (HyperText Markup Language) es el lenguaje de marcado estándar para crear páginas web. Define la estructura y el contenido de las páginas.",
      audio: null
    },
    {
      texto: "Los elementos HTML se definen con etiquetas como <div>, <p>, <h1>, etc. Cada etiqueta tiene un propósito específico en la estructura del documento.",
      audio: "/audio/elementos-html.mp3"
    }
  ],
  css: [
    {
      texto: "CSS (Cascading Style Sheets) se usa para dar estilo y diseño a las páginas web. Controla colores, fuentes, espaciado y layout.",
      audio: null
    },
    {
      texto: "Los selectores CSS te permiten apuntar a elementos específicos. Por ejemplo, '.clase' selecciona elementos con esa clase, '#id' selecciona por ID.",
      audio: "/audio/selectores-css.mp3"
    }
  ],
  react: [
    {
      texto: "React es una biblioteca de JavaScript para construir interfaces de usuario. Se basa en componentes reutilizables y el concepto de estado.",
      audio: null
    },
    {
      texto: "Los hooks como useState y useEffect te permiten manejar estado y efectos secundarios en componentes funcionales de React.",
      audio: "/audio/react-hooks.mp3"
    }
  ]
};

/**
 * @description Procesa una pregunta del usuario para una lección específica y devuelve una respuesta simulada por el tutor de IA.
 * @route POST /api/tutor/preguntar
 * @access Private - Se asume que esta ruta está protegida por un middleware de autenticación.
 * @param {object} req - Objeto de solicitud de Express. Se espera que req.body contenga { leccionId: string, pregunta: string }.
 * @param {object} res - Objeto de respuesta de Express.
 */
const enviarPreguntaAlTutor = async (req, res) => {
  try {
    // 1. Extracción de datos del cuerpo de la solicitud
    const { leccionId, pregunta } = req.body;

    // 2. Validación de datos de entrada
    // Comprueba que la pregunta no esté vacía o solo contenga espacios en blanco
    if (!pregunta || pregunta.trim().length === 0) {
      return res.status(400).json({ message: 'La pregunta no puede estar vacía.' });
    }

    // Comprueba que la pregunta no exceda la longitud máxima
    if (pregunta.length > 500) {
      return res.status(400).json({ message: 'La pregunta no puede exceder los 500 caracteres.' });
    }

    // Comprueba que el leccionId proporcionado es válido y existe en nuestros datos
    if (!leccionId || !respuestasSimuladas[leccionId]) {
      return res.status(404).json({ message: `El tema o lección '${leccionId}' no fue encontrado.` });
    }

    // 3. Lógica de negocio: Simular la respuesta del tutor
    // Se simula un retardo para imitar la latencia de una API externa o un proceso de IA complejo.
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Seleccionar una respuesta aleatoria del conjunto de respuestas disponibles para la lección
    const respuestasPosibles = respuestasSimuladas[leccionId];
    const respuestaSeleccionada = respuestasPosibles[Math.floor(Math.random() * respuestasPosibles.length)];

    // 4. Enviar respuesta exitosa
    // Se devuelve un estado 200 (OK) con la respuesta generada, coincidiendo con el formato que el frontend espera.
    return res.status(200).json({
      respuesta: respuestaSeleccionada.texto,
      audioUrl: respuestaSeleccionada.audio || null
    });

  } catch (error) {
    // 5. Manejo de errores inesperados del servidor
    // Se registra el error en la consola del servidor para propósitos de depuración.
    console.error('Error en el controlador del tutor:', error);

    // Se envía una respuesta genérica de error 500 para no exponer detalles de la implementación al cliente.
    return res.status(500).json({ message: 'Ocurrió un error interno en el servidor. Por favor, inténtelo de nuevo más tarde.' });
  }
};

module.exports = {
  enviarPreguntaAlTutor
};