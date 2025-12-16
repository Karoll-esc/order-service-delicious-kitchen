/**
 * @file orderStates.ts
 * @description Definición centralizada de estados de pedidos para Order Service
 * 
 * Este archivo contiene la única fuente de verdad para los estados de pedidos
 * en el sistema. Todos los servicios deben referenciar estas constantes para
 * garantizar consistencia en nomenclatura y evitar ambigüedades.
 * 
 * @see ORDER_STATES.md - Documentación completa de estados y transiciones
 */

/**
 * Estados oficiales del sistema de pedidos
 * Nomenclatura: minúsculas, formato snake_case
 */
export enum OrderStatus {
  /** Pedido creado, esperando ser enviado a cocina */
  PENDING = 'pending',
  
  /** Kitchen Service ha recibido y registrado el pedido */
  RECEIVED = 'received',
  
  /** El equipo de cocina está preparando activamente el pedido */
  PREPARING = 'preparing',
  
  /** Pedido completamente preparado, esperando entrega al cliente */
  READY = 'ready',
  
  /** Pedido entregado exitosamente al cliente (estado final) */
  COMPLETED = 'completed',
  
  /** Pedido cancelado por cliente o administrador (estado final) */
  CANCELLED = 'cancelled',
  
  /** @deprecated Usar COMPLETED en su lugar - Mantener solo por compatibilidad temporal */
  DELIVERED = 'delivered'
}

/**
 * Array de todos los estados válidos
 * Útil para validaciones y mapeos
 */
export const ALL_ORDER_STATES = Object.values(OrderStatus);

/**
 * Mapa de transiciones de estado permitidas
 * Define qué estados pueden transicionar a cuáles otros
 */
export const ALLOWED_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.RECEIVED, OrderStatus.CANCELLED],
  [OrderStatus.RECEIVED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [], // Estado final
  [OrderStatus.CANCELLED]: [], // Estado final
  [OrderStatus.DELIVERED]: []  // @deprecated - Estado final legacy
};

/**
 * Estados desde los cuales se permite cancelación por cliente
 */
export const CUSTOMER_CANCELLABLE_STATES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.RECEIVED
];

/**
 * Estados desde los cuales se permite cancelación por admin
 * (admin puede cancelar en más estados que el cliente)
 */
export const ADMIN_CANCELLABLE_STATES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.RECEIVED,
  OrderStatus.PREPARING,
  OrderStatus.READY
];

/**
 * Estados finales del sistema (no se pueden modificar una vez alcanzados)
 */
export const FINAL_STATES: OrderStatus[] = [
  OrderStatus.COMPLETED,
  OrderStatus.DELIVERED, // @deprecated - Legacy final state
  OrderStatus.CANCELLED
];

/**
 * Valida si una transición de estado es permitida
 * @param currentStatus - Estado actual del pedido
 * @param newStatus - Nuevo estado deseado
 * @returns true si la transición es válida, false si no
 */
export function isValidStateTransition(
  currentStatus: OrderStatus, 
  newStatus: OrderStatus
): boolean {
  const allowedTransitions = ALLOWED_STATE_TRANSITIONS[currentStatus];
  return allowedTransitions.includes(newStatus);
}

/**
 * Verifica si un estado es cancelable por un cliente
 * @param status - Estado del pedido a verificar
 * @returns true si el cliente puede cancelar desde ese estado
 */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return CUSTOMER_CANCELLABLE_STATES.includes(status);
}

/**
 * Verifica si un estado es cancelable por un administrador
 * @param status - Estado del pedido a verificar
 * @returns true si el admin puede cancelar desde ese estado
 */
export function isAdminCancellable(status: OrderStatus): boolean {
  return ADMIN_CANCELLABLE_STATES.includes(status);
}

/**
 * Verifica si un estado es final (no se puede modificar)
 * @param status - Estado del pedido a verificar
 * @returns true si el estado es final
 */
export function isFinalState(status: OrderStatus): boolean {
  return FINAL_STATES.includes(status);
}

/**
 * Nombres de eventos RabbitMQ para cada estado
 * Garantiza consistencia en la nomenclatura de eventos
 */
export const ORDER_EVENT_NAMES = {
  CREATED: 'order.created',
  RECEIVED: 'order.received',
  PREPARING: 'order.preparing',
  READY: 'order.ready',
  COMPLETED: 'order.completed',
  CANCELLED: 'order.cancelled',
  STATUS_UPDATED: 'order.status.updated'
} as const;

/**
 * Mapeo de estados a nombres de eventos
 */
export const STATE_TO_EVENT: Record<OrderStatus, string> = {
  [OrderStatus.PENDING]: ORDER_EVENT_NAMES.CREATED,
  [OrderStatus.RECEIVED]: ORDER_EVENT_NAMES.RECEIVED,
  [OrderStatus.PREPARING]: ORDER_EVENT_NAMES.PREPARING,
  [OrderStatus.READY]: ORDER_EVENT_NAMES.READY,
  [OrderStatus.COMPLETED]: ORDER_EVENT_NAMES.COMPLETED,
  [OrderStatus.DELIVERED]: ORDER_EVENT_NAMES.COMPLETED, // @deprecated - Legacy mapping
  [OrderStatus.CANCELLED]: ORDER_EVENT_NAMES.CANCELLED
};
