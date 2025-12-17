import mongoose, { Schema, Document } from 'mongoose';
import { MONGO_COLLECTIONS } from '../constants/collections';

/**
 * Interface que define la estructura de una reseña
 * Principio SOLID: Interface Segregation - Define contrato claro
 * 
 * HU-014: Sistema de Reseñas Públicas
 * - orderId es opcional (puede ser "N/A" para reviews sin pedido asociado)
 * - foodRating y tasteRating reemplazan ratings.overall y ratings.food
 */
export interface IReview extends Document {
  orderNumber?: string;
  customerName: string;
  customerEmail: string;
  foodRating: number;
  tasteRating: number;
  comment?: string;
  status: 'pending' | 'approved' | 'hidden';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Esquema Mongoose para Review
 * Principio SOLID: Single Responsibility - Solo define la estructura de datos
 *
 * HU-014: Validaciones actualizadas para sistema de reseñas públicas
 * - orderNumber: opcional (puede ser "N/A" para reviews anónimas)
 * - customerName: requerido, min 2 caracteres
 * - customerEmail: requerido, formato email
 * - foodRating: requerido, rango 1-5 (entero)
 * - tasteRating: requerido, rango 1-5 (entero)
 * - comment: opcional, máx 500 caracteres
 * - status: enum [pending, approved, hidden], default pending
 */
const ReviewSchema: Schema = new Schema(
  {
    orderNumber: {
      type: String,
      required: false,
      index: true,
      trim: true,
      default: 'N/A'
    },
    customerName: {
      type: String,
      required: [true, 'Customer name is required'],
      minlength: [2, 'Customer name must be at least 2 characters'],
      maxlength: [100, 'Customer name must not exceed 100 characters'],
      trim: true
    },
    customerEmail: {
      type: String,
      required: [true, 'Customer email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    foodRating: {
      type: Number,
      required: [true, 'Food rating is required'],
      min: [1, 'Food rating must be between 1 and 5'],
      max: [5, 'Food rating must be between 1 and 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Food rating must be an integer'
      }
    },
    tasteRating: {
      type: Number,
      required: [true, 'Taste rating is required'],
      min: [1, 'Taste rating must be between 1 and 5'],
      max: [5, 'Taste rating must be between 1 and 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Taste rating must be an integer'
      }
    },
    comment: {
      type: String,
      maxlength: [500, 'Comment must not exceed 500 characters'],
      trim: true,
      default: ''
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'approved', 'hidden'],
        message: 'Status must be pending, approved, or hidden'
      },
      default: 'pending',
      index: true
    }
  },
  {
    timestamps: true, // Agrega createdAt y updatedAt automáticamente
    versionKey: false, // Elimina __v
    collection: MONGO_COLLECTIONS.REVIEWS // Especifica nombre de colección explícitamente
  }
);

/**
 * Índices compuestos para optimización de consultas
 * HU-014: Índices actualizados para sistema de reseñas públicas
 * - status + createdAt: Para listar reseñas aprobadas ordenadas por fecha
 * - customerEmail: Para búsqueda por cliente
 */
ReviewSchema.index({ status: 1, createdAt: -1 });
ReviewSchema.index({ customerEmail: 1 });

/**
 * Método de instancia para convertir a JSON
 * Oculta campos internos y formatea la respuesta
 */
ReviewSchema.methods.toJSON = function() {
  const review = this.toObject();
  review.id = review._id.toString();
  delete review._id;
  return review;
};

/**
 * Exportación del modelo
 * Patrón: Active Record (modelo con lógica de persistencia integrada)
 */
export const Review = mongoose.model<IReview>('Review', ReviewSchema);
