const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
// Se asume la existencia de middlewares de autenticación y autorización
// const { requireAuth, isCourseCreator } = require('../middleware/auth');

// --- Rutas de Analíticas para Creadores ---

// GET /api/v1/analytics/creador/:creadorId/cursos
router.get('/creador/:creadorId/cursos', /* requireAuth, */ analyticsController.obtenerCursosCreados);

// GET /api/v1/analytics/creador/:creadorId/estadisticas
router.get('/creador/:creadorId/estadisticas', /* requireAuth, */ analyticsController.obtenerEstadisticasCreador);

// GET /api/v1/analytics/creador/:creadorId/tasa-abandono-promedio
router.get('/creador/:creadorId/tasa-abandono-promedio', /* requireAuth, */ analyticsController.tasaAbandonoPromedio);


// --- Rutas de Analíticas por Curso ---

// GET /api/v1/analytics/curso/:cursoId/estadisticas
router.get('/curso/:cursoId/estadisticas', /* requireAuth, isCourseCreator, */ analyticsController.getEstadisticasCurso);

// GET /api/v1/analytics/curso/:cursoId/metricas
router.get('/curso/:cursoId/metricas', /* requireAuth, isCourseCreator, */ analyticsController.obtenerMetricasCurso);

// GET /api/v1/analytics/curso/:cursoId/tasa-abandono
router.get('/curso/:cursoId/tasa-abandono', /* requireAuth, isCourseCreator, */ analyticsController.tasaAbandono);

// GET /api/v1/analytics/curso/:cursoId/porcentaje-correctas
router.get('/curso/:cursoId/porcentaje-correctas', /* requireAuth, isCourseCreator, */ analyticsController.porcentajeCorrectas);

// GET /api/v1/analytics/curso/:cursoId/heatmap-abandono
router.get('/curso/:cursoId/heatmap-abandono', /* requireAuth, isCourseCreator, */ analyticsController.obtenerHeatmapAbandono);

// GET /api/v1/analytics/curso/:cursoId/recomendaciones
router.get('/curso/:cursoId/recomendaciones', /* requireAuth, isCourseCreator, */ analyticsController.generarRecomendaciones);

// GET /api/v1/analytics/curso/:cursoId/recomendaciones-ia
router.get('/curso/:cursoId/recomendaciones-ia', /* requireAuth, isCourseCreator, */ analyticsController.getRecomendacionesIA);

// GET /api/v1/analytics/curso/:cursoId/exportar-csv
router.get('/curso/:cursoId/exportar-csv', /* requireAuth, isCourseCreator, */ analyticsController.exportarEstadisticasCSV);


module.exports = router;
