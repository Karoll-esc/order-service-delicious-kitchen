import { Survey, ISurvey, CreateSurveyDTO } from '../models/Survey';

/**
 * Interface que define el contrato del Repository para Encuestas
 * Principio SOLID: Dependency Inversion - Los servicios dependen de esta abstracción
 * Principio SOLID: Interface Segregation - Métodos específicos y cohesivos
 *
 * Patrón de Diseño: Repository Pattern
 * Objetivo: Abstraer la lógica de acceso a datos, desacoplando la persistencia
 */
export interface ISurveyRepository {
  /** Crea una nueva encuesta */
  create(surveyData: CreateSurveyDTO): Promise<ISurvey>;
  /** Busca una encuesta por su ID */
  findById(id: string): Promise<ISurvey | null>;
  /** Busca una encuesta por número de pedido */
  findByOrderNumber(orderNumber: string): Promise<ISurvey | null>;
  /** Lista todas las encuestas con paginación (para vista admin) */
  findAll(page: number, limit: number): Promise<ISurvey[]>;
  /** Cuenta el total de encuestas */
  countAll(): Promise<number>;
  /** Verifica si ya existe una encuesta para un pedido */
  hasSurveyForOrder(orderNumber: string): Promise<boolean>;
}

/**
 * Implementación concreta del Repository usando Mongoose
 * Principio SOLID: Single Responsibility - Solo maneja persistencia de datos
 * Principio SOLID: Open/Closed - Abierto a extensión, cerrado a modificación
 *
 * Patrón de Diseño: Repository Pattern
 * 
 * Nota: Las encuestas NO requieren moderación, se guardan directamente
 * a diferencia de las reseñas que tienen estado pending/approved/hidden
 */
export class SurveyRepository implements ISurveyRepository {
  /**
   * Crea una nueva encuesta en la base de datos
   * @param surveyData - Datos de la encuesta
   * @returns Encuesta creada
   * @throws Error si el orderNumber ya tiene una encuesta (código 11000)
   */
  async create(surveyData: CreateSurveyDTO): Promise<ISurvey> {
    try {
      const survey = new Survey(surveyData);
      await survey.save();
      return survey;
    } catch (error: any) {
      // Manejo específico de errores de duplicado (código 11000 de MongoDB)
      if (error.code === 11000) {
        throw new Error('Ya existe una encuesta para este pedido');
      }

      // Manejo de errores de validación de Mongoose
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors)
          .map((err: any) => err.message)
          .join(', ');
        throw new Error(`Error de validación: ${messages}`);
      }

      throw error;
    }
  }

  /**
   * Busca una encuesta por su ID de MongoDB
   * @param id - ID de la encuesta
   * @returns Encuesta encontrada o null
   */
  async findById(id: string): Promise<ISurvey | null> {
    try {
      return await Survey.findById(id);
    } catch {
      return null;
    }
  }

  /**
   * Busca una encuesta por número de pedido
   * @param orderNumber - Número de pedido (formato ORD-XXX)
   * @returns Encuesta encontrada o null
   */
  async findByOrderNumber(orderNumber: string): Promise<ISurvey | null> {
    return await Survey.findOne({ orderNumber });
  }

  /**
   * Lista todas las encuestas con paginación
   * Ordenadas por fecha de creación descendente (más recientes primero)
   * 
   * @param page - Número de página (1-indexed)
   * @param limit - Cantidad de elementos por página
   * @returns Array de encuestas
   */
  async findAll(page: number, limit: number): Promise<ISurvey[]> {
    const skip = (page - 1) * limit;
    return await Survey.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
  }

  /**
   * Cuenta el total de encuestas en la base de datos
   * @returns Número total de encuestas
   */
  async countAll(): Promise<number> {
    return await Survey.countDocuments();
  }

  /**
   * Verifica si ya existe una encuesta para un pedido específico
   * @param orderNumber - Número de pedido a verificar
   * @returns true si ya existe, false si no
   */
  async hasSurveyForOrder(orderNumber: string): Promise<boolean> {
    const existing = await Survey.findOne({ orderNumber });
    return existing !== null;
  }
}

// Instancia singleton para inyección de dependencias
export const surveyRepository = new SurveyRepository();
