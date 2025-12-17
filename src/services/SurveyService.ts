import { ISurveyRepository } from '../repositories/SurveyRepository';
import { ISurvey, CreateSurveyDTO } from '../models/Survey';
import { OrderService } from './orderService';
import { OrderStatus } from '../models/Order';

/**
 * Estados válidos para enviar encuestas de proceso
 * Las encuestas evalúan la experiencia durante la preparación
 */
const SURVEY_VALID_STATES: OrderStatus[] = [
  OrderStatus.PREPARING,
  OrderStatus.READY
];

/**
 * Servicio para gestionar la lógica de negocio de encuestas de proceso
 * Principio SOLID: Single Responsibility - Solo maneja lógica de negocio de encuestas
 * Principio SOLID: Dependency Inversion - Depende de abstracciones (ISurveyRepository)
 * Principio SOLID: Open/Closed - Extensible mediante nuevos métodos sin modificar existentes
 *
 * Patrón de Diseño: Service Layer Pattern
 * Objetivo: Centralizar la lógica de negocio y orquestar operaciones
 * 
 * Reglas de Negocio (HU-013):
 * - RN-SURVEY-001: Solo estados "preparing" o "ready" permiten encuestas
 * - RN-SURVEY-002: Un pedido solo puede tener una encuesta (unicidad)
 * - RN-SURVEY-003: Ratings deben estar entre 1 y 5 (enteros)
 * - RN-SURVEY-004: Comentario es opcional, máx 500 caracteres
 */
export class SurveyService {
  /**
   * Constructor con Dependency Injection
   * Principio SOLID: Dependency Inversion - Recibe abstracciones
   * Facilita testing mediante inyección de mocks
   *
   * @param surveyRepository - Repository para persistencia de encuestas
   * @param orderService - Servicio para validar estado del pedido
   */
  constructor(
    private readonly surveyRepository: ISurveyRepository,
    private readonly orderService: OrderService
  ) {}

  /**
   * Crea una nueva encuesta de proceso con validaciones de negocio
   *
   * Flujo de validación:
   * 1. Validar campos requeridos
   * 2. Validar rangos de ratings (1-5)
   * 3. Verificar que el pedido existe
   * 4. Verificar que el pedido está en estado válido (preparing/ready)
   * 5. Verificar que no existe encuesta previa para el pedido
   *
   * @param surveyData - Datos de la encuesta a crear
   * @returns Encuesta creada
   * @throws Error con código 400 si validaciones fallan
   * @throws Error con código 409 si ya existe encuesta para el pedido
   * @throws Error con código 404 si el pedido no existe
   */
  async createSurvey(surveyData: CreateSurveyDTO): Promise<ISurvey> {
    // Validación 1: Campos obligatorios
    this.validateRequiredFields(surveyData);

    // Validación 2: Rangos de calificación (1-5)
    this.validateRatings(surveyData.waitTimeRating, surveyData.serviceRating);

    // Validación 3: Longitud de comentario (si existe)
    if (surveyData.comment) {
      this.validateCommentLength(surveyData.comment);
    }

    // Validación 4: Verificar que el pedido existe
    const order = await this.orderService.getOrderByNumber(surveyData.orderNumber);
    if (!order) {
      const error = new Error('Pedido no encontrado');
      (error as any).code = 404;
      throw error;
    }

    // Validación 5: Verificar estado válido del pedido (preparing o ready)
    if (!SURVEY_VALID_STATES.includes(order.status as OrderStatus)) {
      const error = new Error(
        'Las encuestas solo pueden enviarse para pedidos en preparación o listos'
      );
      (error as any).code = 400;
      throw error;
    }

    // Validación 6: Verificar que no existe encuesta previa
    const hasSurvey = await this.surveyRepository.hasSurveyForOrder(surveyData.orderNumber);
    if (hasSurvey) {
      const error = new Error('Ya enviaste tu opinión para este pedido');
      (error as any).code = 409;
      throw error;
    }

    // Crear encuesta
    return await this.surveyRepository.create(surveyData);
  }

  /**
   * Obtiene todas las encuestas con paginación (para vista admin)
   * Las encuestas no requieren moderación, solo visualización
   *
   * @param page - Número de página (default: 1)
   * @param limit - Resultados por página (default: 10)
   * @returns Object con surveys, total, page, totalPages
   */
  async getAllSurveys(page: number = 1, limit: number = 10) {
    // Validar parámetros de paginación
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 50); // Máximo 50 por página

    const [surveys, total] = await Promise.all([
      this.surveyRepository.findAll(validatedPage, validatedLimit),
      this.surveyRepository.countAll()
    ]);

    return {
      surveys,
      total,
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(total / validatedLimit)
    };
  }

  /**
   * Obtiene una encuesta por su ID
   * @param id - ID de la encuesta
   * @returns Encuesta encontrada
   * @throws Error si no existe
   */
  async getSurveyById(id: string): Promise<ISurvey> {
    const survey = await this.surveyRepository.findById(id);
    if (!survey) {
      const error = new Error('Encuesta no encontrada');
      (error as any).code = 404;
      throw error;
    }
    return survey;
  }

  /**
   * Verifica si un pedido ya tiene encuesta
   * @param orderNumber - Número de pedido
   * @returns true si ya existe encuesta
   */
  async hasSurveyForOrder(orderNumber: string): Promise<boolean> {
    return await this.surveyRepository.hasSurveyForOrder(orderNumber);
  }

  // ==================== Métodos de Validación Privados ====================

  /**
   * Valida que todos los campos requeridos estén presentes
   * @throws Error si falta algún campo obligatorio
   */
  private validateRequiredFields(data: CreateSurveyDTO): void {
    const requiredFields = ['orderNumber', 'customerName', 'customerEmail', 'waitTimeRating', 'serviceRating'];
    
    for (const field of requiredFields) {
      if (data[field as keyof CreateSurveyDTO] === undefined || 
          data[field as keyof CreateSurveyDTO] === null ||
          data[field as keyof CreateSurveyDTO] === '') {
        const error = new Error(`El campo ${field} es requerido`);
        (error as any).code = 400;
        throw error;
      }
    }

    // Validar formato de email
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(data.customerEmail)) {
      const error = new Error('Por favor proporcione un email válido');
      (error as any).code = 400;
      throw error;
    }
  }

  /**
   * Valida que los ratings estén en el rango permitido (1-5)
   * @throws Error si algún rating está fuera de rango o no es entero
   */
  private validateRatings(waitTimeRating: number, serviceRating: number): void {
    const ratings = [
      { name: 'waitTimeRating', value: waitTimeRating },
      { name: 'serviceRating', value: serviceRating }
    ];

    for (const rating of ratings) {
      // Verificar que es un número
      if (typeof rating.value !== 'number' || isNaN(rating.value)) {
        const error = new Error(`${rating.name} debe ser un número`);
        (error as any).code = 400;
        throw error;
      }

      // Verificar que es un entero
      if (!Number.isInteger(rating.value)) {
        const error = new Error(`${rating.name} debe ser un número entero`);
        (error as any).code = 400;
        throw error;
      }

      // Verificar rango 1-5
      if (rating.value < 1 || rating.value > 5) {
        const error = new Error('Los ratings deben estar entre 1 y 5');
        (error as any).code = 400;
        throw error;
      }
    }
  }

  /**
   * Valida la longitud máxima del comentario
   * @throws Error si el comentario excede 500 caracteres
   */
  private validateCommentLength(comment: string): void {
    if (comment.length > 500) {
      const error = new Error('El comentario no debe exceder 500 caracteres');
      (error as any).code = 400;
      throw error;
    }
  }
}
