const initialData = [
  {
    id: 1,
    title: "HTML Básico",
    description: "Conceptos fundamentales de HTML",
    cards: [
      { id: 1, question: "¿Qué significa HTML?", answer: "HyperText Markup Language" },
      { id: 2, question: "¿Cuál es la etiqueta para un encabezado de nivel 1?", answer: "<h1>" },
      { id: 3, question: "¿Cómo se crea un enlace en HTML?", answer: "<a href='url'>texto</a>" },
    ]
  },
  {
    id: 2,
    title: "CSS Básico",
    description: "Propiedades y selectores de CSS",
    cards: [
      { id: 1, question: "¿Qué significa CSS?", answer: "Cascading Style Sheets" },
      { id: 2, question: "¿Cómo se aplica un estilo a todos los elementos <p>?", answer: "p { propiedades }" },
    ]
  }
];

// Simulamos una base de datos en memoria para poder realizar operaciones CRUD
let flashcardSets = JSON.parse(JSON.stringify(initialData));

/**
 * @description Obtiene todos los sets de flashcards.
 * @route GET /api/flashcard-sets
 */
export const getFlashcardSets = async (req, res) => {
  try {
    // En una aplicación real, aquí se haría una consulta a la base de datos.
    // Devolvemos solo la información principal, sin las tarjetas para no sobrecargar la respuesta.
    const setsSummary = flashcardSets.map(({ id, title, description, cards }) => ({
      id,
      title,
      description,
      totalCards: cards.length
    }));

    res.status(200).json(setsSummary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al obtener los sets de flashcards." });
  }
};

/**
 * @description Obtiene un set de flashcards específico por su ID, incluyendo todas sus tarjetas.
 * @route GET /api/flashcard-sets/:setId
 */
export const getFlashcardSetById = async (req, res) => {
  try {
    const { setId } = req.params;
    const set = flashcardSets.find(s => s.id === parseInt(setId));

    // Validación: verificar si el set existe
    if (!set) {
      return res.status(404).json({ message: `El set de flashcards con ID ${setId} no fue encontrado.` });
    }

    res.status(200).json(set);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al obtener el set de flashcards." });
  }
};

/**
 * @description Crea un nuevo set de flashcards.
 * @route POST /api/flashcard-sets
 */
export const createFlashcardSet = async (req, res) => {
  try {
    const { title, description } = req.body;

    // Validación de datos de entrada
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ message: "El campo 'title' es obligatorio y debe ser un texto no vacío." });
    }

    const newSet = {
      id: Date.now(), // Usamos un timestamp como ID único para la simulación
      title: title.trim(),
      description: description || "",
      cards: []
    };

    flashcardSets.push(newSet);

    res.status(201).json(newSet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al crear el set de flashcards." });
  }
};

/**
 * @description Actualiza un set de flashcards existente.
 * @route PUT /api/flashcard-sets/:setId
 */
export const updateFlashcardSet = async (req, res) => {
  try {
    const { setId } = req.params;
    const { title, description } = req.body;
    
    // Validación de datos de entrada
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ message: "El campo 'title' es obligatorio y debe ser un texto no vacío." });
    }

    const setIndex = flashcardSets.findIndex(s => s.id === parseInt(setId));

    // Validación: verificar si el set existe
    if (setIndex === -1) {
      return res.status(404).json({ message: `El set de flashcards con ID ${setId} no fue encontrado.` });
    }

    // Actualizamos el set
    const updatedSet = {
      ...flashcardSets[setIndex],
      title: title.trim(),
      description: description || flashcardSets[setIndex].description
    };
    
    flashcardSets[setIndex] = updatedSet;

    res.status(200).json(updatedSet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al actualizar el set de flashcards." });
  }
};

/**
 * @description Elimina un set de flashcards.
 * @route DELETE /api/flashcard-sets/:setId
 */
export const deleteFlashcardSet = async (req, res) => {
  try {
    const { setId } = req.params;
    const initialLength = flashcardSets.length;
    
    flashcardSets = flashcardSets.filter(s => s.id !== parseInt(setId));

    // Validación: verificar si algo se eliminó
    if (flashcardSets.length === initialLength) {
      return res.status(404).json({ message: `El set de flashcards con ID ${setId} no fue encontrado.` });
    }

    // Respuesta HTTP 204 No Content es apropiada para eliminaciones exitosas
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al eliminar el set de flashcards." });
  }
};

// --- Controladores para Tarjetas (Recurso Anidado) ---

/**
 * @description Añade una nueva tarjeta a un set específico.
 * @route POST /api/flashcard-sets/:setId/cards
 */
export const addCardToSet = async (req, res) => {
  try {
    const { setId } = req.params;
    const { question, answer } = req.body;

    // Validación de datos de entrada
    if (!question || !answer || question.trim() === '' || answer.trim() === '') {
      return res.status(400).json({ message: "Los campos 'question' y 'answer' son obligatorios." });
    }

    const set = flashcardSets.find(s => s.id === parseInt(setId));

    if (!set) {
      return res.status(404).json({ message: `El set de flashcards con ID ${setId} no fue encontrado.` });
    }

    const newCard = {
      id: Date.now(),
      question: question.trim(),
      answer: answer.trim()
    };

    set.cards.push(newCard);

    res.status(201).json(newCard);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al añadir la tarjeta." });
  }
};

/**
 * @description Elimina una tarjeta de un set específico.
 * @route DELETE /api/flashcard-sets/:setId/cards/:cardId
 */
export const deleteCardFromSet = async (req, res) => {
  try {
    const { setId, cardId } = req.params;

    const set = flashcardSets.find(s => s.id === parseInt(setId));

    if (!set) {
      return res.status(404).json({ message: `El set de flashcards con ID ${setId} no fue encontrado.` });
    }

    const initialCardsLength = set.cards.length;
    set.cards = set.cards.filter(c => c.id !== parseInt(cardId));

    if (set.cards.length === initialCardsLength) {
      return res.status(404).json({ message: `La tarjeta con ID ${cardId} no fue encontrada en el set con ID ${setId}.` });
    }

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error interno del servidor al eliminar la tarjeta." });
  }
};