const userStatsDB = {
    coursesInProgress: 3,
    coursesCompleted: 5,
    totalStudyTime: 28, // horas
    streak: 7, // días
    achievements: [
      {
        id: 1,
        name: "Primer curso completado",
        icon: "🎓",
        unlocked: true,
      },
      {
        id: 2,
        name: "Aprendiz dedicado",
        progress: 70,
        requirement: "Completar 10 cursos",
      },
    ],
};

/**
 * @desc    Obtiene las estadísticas del usuario autenticado.
 * @route   GET /api/usuario/estadisticas
 * @access  Private (asume que un middleware de autenticación ya verificó al usuario)
 */
exports.getUserStats = async (req, res) => {
  try {
    // En una aplicación real, el ID del usuario vendría del token de autenticación
    // que un middleware previo habría colocado en `req.user`.
    // const userId = req.user.id;

    // La lógica buscaría las estadísticas de ese usuario en la base de datos.
    // Ejemplo: const stats = await Stats.findOne({ userId: userId });
    // if (!stats) {
    //   return res.status(404).json({ success: false, error: 'Estadísticas no encontradas para este usuario.' });
    // }

    // Simulamos la latencia de red de 300ms como en el archivo original.
    await new Promise(resolve => setTimeout(resolve, 300));

    // Se asume que siempre se encuentran las estadísticas para un usuario válido.
    // Si no, la lógica del `if (!stats)` de arriba manejaría el caso 404 Not Found.
    res.status(200).json({
      success: true,
      data: userStatsDB,
    });

  } catch (error) {
    console.error('Error al obtener estadísticas del usuario:', error);
    res.status(500).json({
      success: false,
      error: 'Error del servidor al procesar la solicitud.',
    });
  }
};