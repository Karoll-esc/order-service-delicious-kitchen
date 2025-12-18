import { Router } from 'express';
import { getInternalAnalytics, postInternalAnalyticsExport, postInternalAnalyticsValidate } from '../controllers/analyticsController';

const router = Router();

// Rutas internas para analytics (solo accesibles desde el API Gateway)
router.get('/internal/analytics', getInternalAnalytics);
router.post('/internal/analytics/export', postInternalAnalyticsExport);
router.post('/internal/analytics/validate', postInternalAnalyticsValidate); // HU-022: Validación de consistencia

export default router;
