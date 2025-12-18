import { Model } from 'mongoose';
import { IOrder } from '../models/Order';
import { IAnalyticsRepository } from '../interfaces/IAnalyticsRepository';
import { AnalyticsQueryDTO, AnalyticsResponseDTO, CSVExportRequestDTO } from '../dtos/analytics';
import { IGroupingStrategy } from '../interfaces/IGroupingStrategy';
import { GroupingStrategyFactory } from '../strategies/GroupingStrategies';
import { Readable } from 'stream';
import { AnalyticsResponseMapper } from '../mappers/AnalyticsResponseMapper';
import { CSVExporter } from '../exporters/CSVExporter';
import { OrderStatus } from '../constants/orderStates';

/**
 * Repositorio de analíticas
 * Cumple con Single Responsibility Principle: Solo acceso a datos
 * Cumple con Dependency Inversion Principle: Depende de abstracciones (IGroupingStrategy)
 */
export class AnalyticsRepository implements IAnalyticsRepository {
  private mapper: AnalyticsResponseMapper;
  private csvExporter: CSVExporter;

  constructor(private orderModel: Model<IOrder>) {
    this.mapper = new AnalyticsResponseMapper();
    this.csvExporter = new CSVExporter();
  }

  async getAnalytics(query: AnalyticsQueryDTO): Promise<AnalyticsResponseDTO | null> {
    const { from, to, groupBy, top = 10 } = query;
    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    // Validar rango máximo (10 años)
    const monthsDiff = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsDiff > 120) {
      throw Object.assign(new Error('El rango de fechas excede el máximo permitido (10 años)'), { code: 'RANGE_EXCEEDED' });
    }

    // Usar estrategia de agrupación
    const strategy: IGroupingStrategy = GroupingStrategyFactory.create(groupBy);
    const periodExpr = strategy.getPeriodExpression();

    /**
     * HU-022: Estados válidos para analytics (órdenes que generaron ingresos)
     * - READY: Pedido preparado, esperando entrega (ya generó trabajo/costos)
     * - COMPLETED: Pedido entregado exitosamente al cliente (estado final)
     * - DELIVERED: Mantener por compatibilidad temporal (deprecated, equivalente a COMPLETED)
     * - Se EXCLUYEN explícitamente pedidos cancelados (CANCELLED)
     */
    const validCompletedStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];

    // Pipeline para series temporales (SOLO pedidos completados/entregados)
    const seriesPipeline: any[] = [
      { 
        $match: { 
          createdAt: { $gte: fromDate, $lte: toDate }, 
          status: { $in: validCompletedStatuses } // HU-022: Filtro correcto
        } 
      },
      { $unwind: '$items' },
      {
        $addFields: {
          period: periodExpr,
          itemRevenue: { $multiply: ['$items.quantity', { $ifNull: ['$items.unitPrice', '$items.price'] }] }
        }
      },
      {
        $group: {
          _id: '$period',
          totalOrders: { $addToSet: '$_id' },
          totalRevenue: { $sum: '$itemRevenue' }
        }
      },
      {
        $project: {
          _id: 1,
          totalOrders: { $size: '$totalOrders' },
          totalRevenue: 1
        }
      },
      { $sort: { _id: 1 } }
    ];

    const series = await this.orderModel.aggregate(seriesPipeline).exec();

    // HU-022: Pipeline separado para pedidos cancelados (métricas independientes)
    const cancelledPipeline: any[] = [
      { 
        $match: { 
          createdAt: { $gte: fromDate, $lte: toDate }, 
          status: OrderStatus.CANCELLED 
        } 
      },
      { $unwind: '$items' },
      {
        $addFields: {
          period: periodExpr,
          itemRevenue: { $multiply: ['$items.quantity', { $ifNull: ['$items.unitPrice', '$items.price'] }] }
        }
      },
      {
        $group: {
          _id: '$period',
          totalCancelledOrders: { $addToSet: '$_id' },
          lostRevenue: { $sum: '$itemRevenue' }
        }
      },
      {
        $project: {
          _id: 1,
          totalCancelledOrders: { $size: '$totalCancelledOrders' },
          lostRevenue: 1
        }
      },
      { $sort: { _id: 1 } }
    ];

    const cancelledSeries = await this.orderModel.aggregate(cancelledPipeline).exec();

    if ((!series || series.length === 0) && (!cancelledSeries || cancelledSeries.length === 0)) {
      return null;
    }

    // Pipeline para productos vendidos (SOLO pedidos completados/entregados)
    const productsPipeline: any[] = [
      { 
        $match: { 
          createdAt: { $gte: fromDate, $lte: toDate }, 
          status: { $in: validCompletedStatuses } // HU-022: Filtro correcto
        } 
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: { productId: { $ifNull: ['$items.productId', '$items.name'] }, name: '$items.name' },
          quantity: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.quantity', { $ifNull: ['$items.unitPrice', '$items.price'] }] } }
        }
      },
      { $sort: { quantity: -1 } },
      { $limit: top }
    ];

    const productsSold = await this.orderModel.aggregate(productsPipeline).exec();

    // Usar mapper para transformar datos (ahora incluye series de cancelados)
    return this.mapper.mapToDTO(series, productsSold, cancelledSeries, query);
  }

  streamCsv(query: CSVExportRequestDTO): Readable {
    const readable = new Readable({ read() {} });

    this.getAnalytics(query)
      .then(analytics => {
        const csvStream = this.csvExporter.export(analytics, query);
        csvStream.on('data', chunk => readable.push(chunk));
        csvStream.on('end', () => readable.push(null));
        csvStream.on('error', err => {
          console.error('Error en CSV stream:', err);
          readable.push(null);
        });
      })
      .catch(err => {
        console.error('Error obteniendo analíticas:', err);
        readable.push('period;totalOrders;totalRevenue;productId;productName;quantity;avgPrepTime\n');
        readable.push('Error;0;0;;Error al generar reporte;0;\n');
        readable.push(null);
      });

    return readable;
  }
}
