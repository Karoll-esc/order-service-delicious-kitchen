import { Router } from 'express';
import { surveyController } from '../controllers/SurveyController';

/**
 * Rutas para el sistema de encuestas de proceso (HU-013)
 *
 * Endpoints públicos:
 * - POST /surveys - Crear encuesta (cliente durante preparación/ready)
 * - GET /surveys/check/:orderNumber - Verificar si ya existe encuesta
 *
 * Endpoints admin (para vista de feedback interno):
 * - GET /surveys - Listar todas las encuestas con paginación
 * - GET /surveys/:id - Obtener encuesta específica
 * 
 * Nota: Las encuestas NO requieren moderación, son feedback interno.
 * El endpoint GET /surveys es para la vista admin que muestra el feedback.
 */
const router = Router();

// ========== Endpoints Públicos (Cliente) ==========

/**
 * POST /surveys - Crear nueva encuesta de proceso
 * Body: { orderNumber, customerName, customerEmail, waitTimeRating, serviceRating, comment? }
 * 
 * Validaciones:
 * - El pedido debe estar en estado "preparing" o "ready"
 * - Un pedido solo puede tener una encuesta (unicidad)
 * - Ratings deben ser enteros entre 1 y 5
 * 
 * Respuestas:
 * - 201: Encuesta creada ("¡Gracias por tu opinión!")
 * - 400: Ratings fuera de rango o estado inválido
 * - 404: Pedido no encontrado
 * - 409: Ya existe encuesta para el pedido
 */
router.post('/', (req, res) => surveyController.createSurvey(req, res));

/**
 * GET /surveys/check/:orderNumber - Verificar si existe encuesta para un pedido
 * Útil para el frontend para decidir si mostrar el formulario de encuesta
 * 
 * Respuestas:
 * - 200: { success: true, hasSurvey: boolean }
 */
router.get('/check/:orderNumber', (req, res) => surveyController.checkSurveyExists(req, res));

// ========== Endpoints Admin (Vista de Feedback) ==========

/**
 * GET /surveys - Obtener todas las encuestas con paginación (admin)
 * Query params: page?, limit?
 * 
 * Nota: No requiere autenticación en order-service, 
 * la autenticación se maneja en API Gateway
 */
router.get('/', (req, res) => surveyController.getAllSurveys(req, res));

/**
 * GET /surveys/:id - Obtener una encuesta específica
 */
router.get('/:id', (req, res) => surveyController.getSurveyById(req, res));

export default router;
