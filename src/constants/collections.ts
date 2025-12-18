/**
 * Constantes centralizadas para nombres de colecciones MongoDB
 * 
 * Principio: Single Source of Truth
 * 
 * Convenciones:
 * - Usar lowercase para nombres simples
 * - Usar snake_case para nombres compuestos
 * - Especificar siempre explícitamente en los schemas Mongoose
 * 
 * @see DB_NAMING_CONVENTIONS.md para documentación completa
 */

export const MONGO_COLLECTIONS = {
  /**
   * Colección de pedidos del sistema
   */
  ORDERS: 'orders',
  
  /**
   * Colección de reseñas de pedidos
   */
  REVIEWS: 'reviews',
  
  /**
   * Colección de historial de cancelaciones
   */
  ORDER_CANCELLATIONS: 'order_cancellations',
  
  /**
   * Colección de encuestas de proceso (feedback durante preparación)
   */
  SURVEYS: 'surveys'
} as const;

/**
 * Tipo derivado para validación en tiempo de compilación
 */
export type MongoCollectionName = typeof MONGO_COLLECTIONS[keyof typeof MONGO_COLLECTIONS];

/**
 * Nombres de bases de datos
 */
export const MONGO_DATABASES = {
  /**
   * Base de datos principal del Order Service
   */
  ORDERS: 'orders'
} as const;
