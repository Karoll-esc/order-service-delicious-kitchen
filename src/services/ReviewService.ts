import { IReviewRepository, CreateReviewDTO } from '../repositories/ReviewRepository';
import { IReview } from '../models/Review';

/**
 * Servicio para gestionar la lógica de negocio de reseñas
 * Principio SOLID: Single Responsibility - Solo maneja lógica de negocio de reseñas
 * Principio SOLID: Dependency Inversion - Depende de IReviewRepository (abstracción)
 * Principio SOLID: Open/Closed - Extensible mediante nuevos métodos sin modificar existentes
 *
 * Patrón de Diseño: Service Layer Pattern
 * Objetivo: Centralizar la lógica de negocio y orquestar operaciones
 */
export class ReviewService {
  /**
   * Constructor con Dependency Injection
   * Principio SOLID: Dependency Inversion - Recibe abstracción, no implementación concreta
   * Facilita testing mediante inyección de mocks
   *
   * @param reviewRepository - Implementación del repository (puede ser mock en tests)
   */
  constructor(private readonly reviewRepository: IReviewRepository) {}

  /**
   * Crea una nueva reseña con validaciones de negocio
   * Patrón: Strategy Pattern (validaciones extensibles)
   *
   * HU-014: Sistema de Reseñas Públicas
   * Validaciones aplicadas:
   * 1. Campos requeridos (foodRating, tasteRating, customerName, customerEmail)
   * 2. Rangos de calificación (1-5, enteros)
   * 3. Longitud de comentario (max 500)
   * 
   * orderNumber es OPCIONAL - puede ser "N/A" para reviews sin pedido asociado
   *
   * @param reviewData - Datos de la reseña a crear
   * @returns Reseña creada con estado "pending"
   * @throws Error si las validaciones fallan
   */
  async createReview(reviewData: CreateReviewDTO): Promise<IReview> {
    // Validación 1: Campos obligatorios (orderNumber ahora es opcional)
    this.validateRequiredFields(reviewData);

    // Validación 2: Rangos de calificación
    this.validateRatings(reviewData.foodRating, reviewData.tasteRating);

    // Validación 3: Longitud de comentario
    if (reviewData.comment) {
      this.validateCommentLength(reviewData.comment);
    }

    // HU-014: No se valida duplicados ni existencia de pedido
    // Crear reseña con estado "pending" por defecto
    return await this.reviewRepository.create(reviewData);
  }

  /**
   * Obtiene reseñas aprobadas para vista pública
   * Solo retorna reseñas con status="approved"
   *
   * @param page - Número de página (default: 1)
   * @param limit - Resultados por página (default: 10)
   * @returns Object con reviews, total, page, totalPages
   */
  async getPublicReviews(page: number = 1, limit: number = 10) {
    // Validar parámetros de paginación
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 50); // Máximo 50 por página

    const [reviews, total] = await Promise.all([
      this.reviewRepository.findApproved(validatedPage, validatedLimit),
      this.reviewRepository.countApproved()
    ]);

    return {
      reviews,
      total,
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(total / validatedLimit)
    };
  }

  /**
   * Obtiene todas las reseñas (incluye pending, hidden)
   * Solo para administradores
   *
   * @param page - Número de página
   * @param limit - Resultados por página
   * @returns Object con reviews, total, page, totalPages
   */
  async getAllReviews(page: number = 1, limit: number = 10) {
    const validatedPage = Math.max(1, page);
    const validatedLimit = Math.min(Math.max(1, limit), 50);

    const [reviews, total] = await Promise.all([
      this.reviewRepository.findAll(validatedPage, validatedLimit),
      this.reviewRepository.countAll()
    ]);

    return {
      reviews,
      total,
      page: validatedPage,
      limit: validatedLimit,
      totalPages: Math.ceil(total / validatedLimit)
    };
  }

  /**
   * Obtiene una reseña por su ID
   * @param id - ID de la reseña
   * @returns Reseña encontrada
   * @throws Error si no existe
   */
  async getReviewById(id: string): Promise<IReview> {
    const review = await this.reviewRepository.findById(id);

    if (!review) {
      throw new Error('Review not found');
    }

    return review;
  }

  /**
   * Cambia el estado de una reseña (moderación)
   * Solo para administradores
   *
   * Transiciones válidas:
   * - pending → approved (publicar reseña)
   * - approved → hidden (ocultar reseña inapropiada)
   * - pending → hidden (rechazar reseña ofensiva)
   *
   * @param id - ID de la reseña
   * @param status - Nuevo estado (pending, approved, hidden)
   * @returns Reseña actualizada
   * @throws Error si no existe o la transición no es válida
   */
  async changeReviewStatus(
    id: string,
    status: 'pending' | 'approved' | 'hidden'
  ): Promise<IReview> {
    // Validar que el estado sea válido
    if (!['pending', 'approved', 'hidden'].includes(status)) {
      throw new Error('Invalid status. Must be pending, approved, or hidden');
    }

    // Verificar que la reseña existe
    const existingReview = await this.reviewRepository.findById(id);
    if (!existingReview) {
      throw new Error('Review not found');
    }

    // Actualizar estado
    const updatedReview = await this.reviewRepository.updateStatus(id, status);

    if (!updatedReview) {
      throw new Error('Failed to update review status');
    }

    return updatedReview;
  }

  /**
   * Validación: Campos requeridos
   * Principio SOLID: Single Responsibility - Método con una sola responsabilidad
   * 
   * HU-014: orderNumber es OPCIONAL
   * @private
   */
  private validateRequiredFields(reviewData: CreateReviewDTO): void {
    // orderNumber es opcional en HU-014
    
    if (!reviewData.customerName?.trim()) {
      throw new Error('Customer name is required');
    }

    if (!reviewData.customerEmail?.trim()) {
      throw new Error('Customer email is required');
    }

    if (reviewData.foodRating === undefined || reviewData.foodRating === null) {
      throw new Error('Food rating is required');
    }

    if (reviewData.tasteRating === undefined || reviewData.tasteRating === null) {
      throw new Error('Taste rating is required');
    }
  }

  /**
   * Validación: Rangos de calificación (1-5)
   * HU-014: foodRating y tasteRating son campos directos
   * @private
   */
  private validateRatings(foodRating: number, tasteRating: number): void {
    if (foodRating < 1 || foodRating > 5) {
      throw new Error('Food rating must be between 1 and 5');
    }

    if (tasteRating < 1 || tasteRating > 5) {
      throw new Error('Taste rating must be between 1 and 5');
    }

    // Validar que sean números enteros
    if (!Number.isInteger(foodRating)) {
      throw new Error('Food rating must be an integer');
    }

    if (!Number.isInteger(tasteRating)) {
      throw new Error('Taste rating must be an integer');
    }
  }

  /**
   * Validación: Longitud de comentario (max 500 caracteres)
   * @private
   */
  private validateCommentLength(comment: string): void {
    if (comment.length > 500) {
      throw new Error('Comment must not exceed 500 characters');
    }
  }
}
