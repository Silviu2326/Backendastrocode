const AnalyticsService = require('../services/analyticsService');

class AnalyticsController {

  /**
   * Orquestador genérico para manejar las solicitudes y respuestas JSON.
   * @param {object} res - El objeto de respuesta de Express.
   * @param {Function} serviceCall - La función del servicio a ejecutar.
   * @private
   */
  async _handleJsonRequest(res, serviceCall) {
    try {
      const result = await serviceCall();
      res.status(200).json(result);
    } catch (error) {
      console.error('[AnalyticsController Error]:', error);
      res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
  }

  obtenerCursosCreados = async (req, res) => {
    const { creadorId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.obtenerCursosCreados(creadorId));
  };

  obtenerMetricasCurso = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.obtenerMetricasCurso(cursoId));
  };

  tasaAbandonoPromedio = async (req, res) => {
    const { creadorId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.tasaAbandonoPromedio(creadorId));
  };

  tasaAbandono = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.tasaAbandono(cursoId));
  };

  porcentajeCorrectas = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.porcentajeCorrectas(cursoId));
  };

  generarRecomendaciones = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.generarRecomendaciones(cursoId));
  };

  obtenerHeatmapAbandono = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.obtenerHeatmapAbandono(cursoId));
  };

  obtenerEstadisticasCreador = async (req, res) => {
    const { creadorId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.obtenerEstadisticasCreador(creadorId));
  };

  getEstadisticasCurso = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.getEstadisticasCurso(cursoId));
  };

  getRecomendacionesIA = async (req, res) => {
    const { cursoId } = req.params;
    await this._handleJsonRequest(res, () => AnalyticsService.getRecomendacionesIA(cursoId));
  };

  exportarEstadisticasCSV = async (req, res) => {
    try {
      const { cursoId } = req.params;
      const csvData = await AnalyticsService.exportarEstadisticasCSV(cursoId);
      res.header('Content-Type', 'text/csv');
      res.attachment(`estadisticas-curso-${cursoId}.csv`);
      res.status(200).send(csvData);
    } catch (error) {
      console.error('[AnalyticsController CSV Error]:', error);
      res.status(500).json({ message: 'Error al generar el archivo CSV', error: error.message });
    }
  };
}

module.exports = new AnalyticsController();
