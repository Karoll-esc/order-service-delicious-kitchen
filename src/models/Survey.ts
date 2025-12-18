import mongoose, { Schema, Document } from 'mongoose';
import { MONGO_COLLECTIONS } from '../constants/collections';

/**
 * Interface que define la estructura de una encuesta de proceso
 * Principio SOLID: Interface Segregation - Define contrato claro
 * 
 * Las encuestas permiten a los clientes evaluar:
 * - Tiempo de espera (waitTimeRating)
 * - Calidad del servicio/atención (serviceRating)
 * - Comentarios adicionales opcionales
 */
export interface ISurvey extends Document {
  /** Número de pedido único (formato ORD-XXX) */
  orderNumber: string;
  /** Nombre del cliente que envía la encuesta */
  customerName: string;
  /** Email del cliente para validación */
  customerEmail: string;
  /** Calificación del tiempo de espera (1-5) */
  waitTimeRating: number;
  /** Calificación del servicio/atención (1-5) */
  serviceRating: number;
  /** Comentario opcional del cliente */
  comment?: string;
  /** Fecha de creación */
  createdAt: Date;
  /** Fecha de última actualización */
  updatedAt: Date;
}

/**
 * DTO para crear una encuesta
 * Principio SOLID: Single Responsibility - Solo para transferencia de datos
 */
export interface CreateSurveyDTO {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  waitTimeRating: number;
  serviceRating: number;
  comment?: string;
}

/**
 * Esquema Mongoose para Survey (Encuesta de Proceso)
 * Principio SOLID: Single Responsibility - Solo define la estructura de datos
 *
 * Validaciones:
 * - orderNumber: requerido, único (previene duplicados por pedido)
 * - customerName: requerido, min 2 caracteres
 * - customerEmail: requerido, formato email
 * - waitTimeRating: requerido, rango 1-5
 * - serviceRating: requerido, rango 1-5
 * - comment: opcional, máx 500 caracteres
 * 
 * Nota: A diferencia de las reseñas, las encuestas NO requieren moderación
 * ya que son feedback interno del proceso de preparación.
 */
const SurveySchema: Schema = new Schema(
  {
    orderNumber: {
      type: String,
      required: [true, 'El número de pedido es requerido'],
      unique: true,
      index: true,
      trim: true
    },
    customerName: {
      type: String,
      required: [true, 'El nombre del cliente es requerido'],
      minlength: [2, 'El nombre debe tener al menos 2 caracteres'],
      maxlength: [100, 'El nombre no debe exceder 100 caracteres'],
      trim: true
    },
    customerEmail: {
      type: String,
      required: [true, 'El email del cliente es requerido'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Por favor proporcione un email válido']
    },
    waitTimeRating: {
      type: Number,
      required: [true, 'La calificación de tiempo de espera es requerida'],
      min: [1, 'La calificación debe estar entre 1 y 5'],
      max: [5, 'La calificación debe estar entre 1 y 5'],
      validate: {
        validator: Number.isInteger,
        message: 'La calificación debe ser un número entero'
      }
    },
    serviceRating: {
      type: Number,
      required: [true, 'La calificación de servicio es requerida'],
      min: [1, 'La calificación debe estar entre 1 y 5'],
      max: [5, 'La calificación debe estar entre 1 y 5'],
      validate: {
        validator: Number.isInteger,
        message: 'La calificación debe ser un número entero'
      }
    },
    comment: {
      type: String,
      maxlength: [500, 'El comentario no debe exceder 500 caracteres'],
      trim: true,
      default: ''
    }
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
    versionKey: false, // Elimina __v
    collection: MONGO_COLLECTIONS.SURVEYS // Especifica nombre de colección explícitamente
  }
);

/**
 * Índices para optimización de consultas
 * - createdAt: Para listar encuestas ordenadas por fecha (vista admin)
 * - customerEmail: Para buscar encuestas por cliente
 */
SurveySchema.index({ createdAt: -1 });
SurveySchema.index({ customerEmail: 1 });

export const Survey = mongoose.model<ISurvey>('Survey', SurveySchema);
