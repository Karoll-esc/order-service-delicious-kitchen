import { Request, Response } from 'express';
import { SurveyService } from '../services/SurveyService';
import { surveyRepository } from '../repositories/SurveyRepository';
import { orderService } from '../services/orderService';

/**
 * Controller para endpoints de encuestas de proceso
 * Principio SOLID: Single Responsibility - Solo maneja HTTP requests/responses
 * Principio SOLID: Dependency Inversion - Depende de SurveyService (abstracción)
 *
 * Patrón de Diseño: MVC (Model-View-Controller)
 * Objetivo: Capa delgada que traduce HTTP a lógica de negocio
 * 
 * Códigos de respuesta:
 * - 201: Encuesta creada exitosamente
 * - 400: Error de validación (ratings fuera de rango, campos faltantes)
 * - 404: Pedido no encontrado
 * - 409: Ya existe encuesta para el pedido
 * - 500: Error interno del servidor
 */
export class SurveyController {
  /**
   * Constructor con Dependency Injection
   * @param surveyService - Servicio con lógica de negocio de encuestas
   */
  constructor(private readonly surveyService: SurveyService) {}

  /**
   * POST /surveys - Crear una nueva encuesta de proceso
   *
   * Body esperado:
   * {
   *   orderNumber: string,
   *   customerName: string,
   *   customerEmail: string,
   *   waitTimeRating: number (1-5),
   *   serviceRating: number (1-5),
   *   comment?: string (max 500 chars)
   * }
   *
   * Respuestas:
   * - 201: Encuesta creada exitosamente
   * - 400: Validación fallida (ratings fuera de rango, estado inválido)
   * - 404: Pedido no encontrado
   * - 409: El pedido ya tiene una encuesta
   * - 500: Error del servidor
   */
  async createSurvey(req: Request, res: Response): Promise<void> {
    try {
      const { orderNumber, customerName, customerEmail, waitTimeRating, serviceRating, comment } = req.body;

      // Validación básica de estructura (validaciones detalladas en Service)
      if (!orderNumber || !customerName || !customerEmail || 
          waitTimeRating === undefined || serviceRating === undefined) {
        res.status(400).json({
          success: false,
          message: 'Campos requeridos: orderNumber, customerName, customerEmail, waitTimeRating, serviceRating'
        });
        return;
      }

      // Crear encuesta (las validaciones detalladas están en el Service)
      const survey = await this.surveyService.createSurvey({
        orderNumber,
        customerName,
        customerEmail,
        waitTimeRating,
        serviceRating,
        comment: comment || ''
      });

      res.status(201).json({
        success: true,
        message: '¡Gracias por tu opinión!',
        data: survey
      });
    } catch (error: any) {
      // Manejo de errores con código específico
      const statusCode = error.code || 500;
      
      if (statusCode === 409) {
        res.status(409).json({
          success: false,
          message: 'Ya enviaste tu opinión para este pedido'
        });
        return;
      }

      if (statusCode === 404) {
        res.status(404).json({
          success: false,
          message: 'Pedido no encontrado'
        });
        return;
      }

      if (statusCode === 400) {
        res.status(400).json({
          success: false,
          message: error.message || 'Los ratings deben estar entre 1 y 5'
        });
        return;
      }

      console.error('Error creando encuesta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al crear la encuesta'
      });
    }
  }

  /**
   * GET /surveys - Obtener todas las encuestas (admin)
   *
   * Query params:
   * - page?: number (default: 1)
   * - limit?: number (default: 10, max: 50)
   *
   * Respuestas:
   * - 200: Lista de encuestas con paginación
   * - 500: Error del servidor
   */
  async getAllSurveys(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await this.surveyService.getAllSurveys(page, limit);

      res.status(200).json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error('Error obteniendo encuestas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al obtener encuestas'
      });
    }
  }

  /**
   * GET /surveys/:id - Obtener una encuesta por ID
   *
   * Params:
   * - id: ID de la encuesta
   *
   * Respuestas:
   * - 200: Encuesta encontrada
   * - 404: Encuesta no encontrada
   * - 500: Error del servidor
   */
  async getSurveyById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const survey = await this.surveyService.getSurveyById(id);

      res.status(200).json({
        success: true,
        data: survey
      });
    } catch (error: any) {
      if (error.code === 404) {
        res.status(404).json({
          success: false,
          message: 'Encuesta no encontrada'
        });
        return;
      }

      console.error('Error obteniendo encuesta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }

  /**
   * GET /surveys/check/:orderNumber - Verificar si existe encuesta para un pedido
   * Útil para el frontend para saber si mostrar el formulario
   *
   * Params:
   * - orderNumber: Número de pedido
   *
   * Respuestas:
   * - 200: { hasSurvey: boolean }
   * - 500: Error del servidor
   */
  async checkSurveyExists(req: Request, res: Response): Promise<void> {
    try {
      const { orderNumber } = req.params;
      const hasSurvey = await this.surveyService.hasSurveyForOrder(orderNumber);

      res.status(200).json({
        success: true,
        hasSurvey
      });
    } catch (error: any) {
      console.error('Error verificando encuesta:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
}

/**
 * Instancia del controller con dependency injection
 * Se inyecta SurveyService que tiene inyectado SurveyRepository y OrderService
 * Facilita testing y cumple Dependency Inversion Principle
 */
const surveyService = new SurveyService(surveyRepository, orderService);
export const surveyController = new SurveyController(surveyService);
