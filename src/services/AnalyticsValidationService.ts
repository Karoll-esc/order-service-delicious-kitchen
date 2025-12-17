/**
 * @file AnalyticsValidationService.ts
 * @description Servicio de validación automática de consistencia de analytics
 * 
 * HU-022 TC-022-B01: Validación Automática de Consistencia
 * 
 * Este servicio se ejecuta periódicamente para validar que las métricas
 * reportadas coincidan con la base de datos real. Si detecta discrepancias
 * mayores al 1%, envía alertas al administrador.
 * 
 * Uso:
 * - Puede ser invocado por un cron job
 * - Puede ser llamado después de cada generación de reporte
 * - Puede ser ejecutado on-demand desde un endpoint administrativo
 */

import { Model } from 'mongoose';
import { IOrder } from '../models/Order';
import { OrderStatus } from '../constants/orderStates';
import { AnalyticsQueryDTO, AnalyticsResponseDTO } from '../dtos/analytics';
import { IAnalyticsRepository } from '../interfaces/IAnalyticsRepository';

interface ValidationResult {
  isValid: boolean;
  discrepancies: ValidationDiscrepancy[];
  timestamp: string;
}

interface ValidationDiscrepancy {
  metric: string;
  reportedValue: number;
  actualValue: number;
  discrepancyPercentage: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

/**
 * Servicio de validación automática de analytics
 * Cumple con Single Responsibility: Solo validación de consistencia
 */
export class AnalyticsValidationService {
  private readonly TOLERANCE_PERCENTAGE = 1; // 1% de tolerancia
  private readonly CRITICAL_THRESHOLD = 5; // 5% para alertas críticas

  constructor(
    private orderModel: Model<IOrder>,
    private repository: IAnalyticsRepository
  ) {}

  /**
   * HU-022 TC-022-B01: Validar consistencia de reporte con BD
   * @param query - Query de analytics a validar
   * @returns Resultado de validación con discrepancias detectadas
   */
  async validateAnalyticsConsistency(query: AnalyticsQueryDTO): Promise<ValidationResult> {
    console.log(`[Validation Service] Iniciando validación para rango ${query.from} - ${query.to}`);

    const discrepancies: ValidationDiscrepancy[] = [];
    const fromDate = new Date(`${query.from}T00:00:00.000Z`);
    const toDate = new Date(`${query.to}T23:59:59.999Z`);

    try {
      // Obtener reporte de analytics
      const analyticsReport = await this.repository.getAnalytics(query);

      if (!analyticsReport) {
        console.log('[Validation Service] No hay datos en el reporte');
        return {
          isValid: true,
          discrepancies: [],
          timestamp: new Date().toISOString()
        };
      }

      // Validación 1: Total de órdenes completadas
      await this.validateCompletedOrdersCount(
        analyticsReport, 
        fromDate, 
        toDate, 
        discrepancies
      );

      // Validación 2: Total de órdenes canceladas
      await this.validateCancelledOrdersCount(
        analyticsReport, 
        fromDate, 
        toDate, 
        discrepancies
      );

      // Validación 3: Ingresos totales
      await this.validateTotalRevenue(
        analyticsReport, 
        fromDate, 
        toDate, 
        discrepancies
      );

      // Validación 4: Ingresos perdidos por cancelaciones
      await this.validateLostRevenue(
        analyticsReport, 
        fromDate, 
        toDate, 
        discrepancies
      );

      // Determinar si el reporte es válido
      const hasSignificantDiscrepancies = discrepancies.some(
        d => d.discrepancyPercentage > this.TOLERANCE_PERCENTAGE
      );

      const result: ValidationResult = {
        isValid: !hasSignificantDiscrepancies,
        discrepancies,
        timestamp: new Date().toISOString()
      };

      // HU-022 TC-022-B01: Enviar alerta si hay discrepancias críticas
      if (discrepancies.some(d => d.severity === 'CRITICAL')) {
        await this.sendCriticalAlert(result, query);
      }

      return result;

    } catch (error) {
      console.error('[Validation Service] Error durante validación:', error);
      throw error;
    }
  }

  /**
   * Validar que el conteo de órdenes completadas coincida con BD
   */
  private async validateCompletedOrdersCount(
    report: AnalyticsResponseDTO,
    fromDate: Date,
    toDate: Date,
    discrepancies: ValidationDiscrepancy[]
  ): Promise<void> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];
    
    const actualCount = await this.orderModel.countDocuments({
      createdAt: { $gte: fromDate, $lte: toDate },
      status: { $in: validStatuses }
    });

    const reportedCount = report.summary.totalOrders;

    if (actualCount !== reportedCount) {
      const discrepancy = this.calculateDiscrepancy(
        'Total Órdenes Completadas',
        reportedCount,
        actualCount
      );
      discrepancies.push(discrepancy);
    }
  }

  /**
   * Validar que el conteo de órdenes canceladas coincida con BD
   */
  private async validateCancelledOrdersCount(
    report: AnalyticsResponseDTO,
    fromDate: Date,
    toDate: Date,
    discrepancies: ValidationDiscrepancy[]
  ): Promise<void> {
    const actualCount = await this.orderModel.countDocuments({
      createdAt: { $gte: fromDate, $lte: toDate },
      status: OrderStatus.CANCELLED
    });

    const reportedCount = report.summary.totalCancelled;

    if (actualCount !== reportedCount) {
      const discrepancy = this.calculateDiscrepancy(
        'Total Órdenes Canceladas',
        reportedCount,
        actualCount
      );
      discrepancies.push(discrepancy);
    }
  }

  /**
   * Validar que los ingresos totales coincidan con BD
   */
  private async validateTotalRevenue(
    report: AnalyticsResponseDTO,
    fromDate: Date,
    toDate: Date,
    discrepancies: ValidationDiscrepancy[]
  ): Promise<void> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];

    const orders = await this.orderModel.find({
      createdAt: { $gte: fromDate, $lte: toDate },
      status: { $in: validStatuses }
    }, 'total');

    const actualRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    const reportedRevenue = report.summary.totalRevenue;

    const diff = Math.abs(actualRevenue - reportedRevenue);
    const tolerance = actualRevenue * (this.TOLERANCE_PERCENTAGE / 100);

    if (diff > tolerance) {
      const discrepancy = this.calculateDiscrepancy(
        'Ingresos Totales',
        reportedRevenue,
        actualRevenue
      );
      discrepancies.push(discrepancy);
    }
  }

  /**
   * Validar que los ingresos perdidos coincidan con BD
   */
  private async validateLostRevenue(
    report: AnalyticsResponseDTO,
    fromDate: Date,
    toDate: Date,
    discrepancies: ValidationDiscrepancy[]
  ): Promise<void> {
    const cancelledOrders = await this.orderModel.find({
      createdAt: { $gte: fromDate, $lte: toDate },
      status: OrderStatus.CANCELLED
    }, 'total');

    const actualLostRevenue = cancelledOrders.reduce((sum, order) => sum + order.total, 0);
    const reportedLostRevenue = report.summary.lostRevenue;

    const diff = Math.abs(actualLostRevenue - reportedLostRevenue);
    const tolerance = actualLostRevenue * (this.TOLERANCE_PERCENTAGE / 100);

    if (diff > tolerance) {
      const discrepancy = this.calculateDiscrepancy(
        'Ingresos Perdidos',
        reportedLostRevenue,
        actualLostRevenue
      );
      discrepancies.push(discrepancy);
    }
  }

  /**
   * Calcular discrepancia y asignar severidad
   */
  private calculateDiscrepancy(
    metric: string,
    reportedValue: number,
    actualValue: number
  ): ValidationDiscrepancy {
    const diff = Math.abs(reportedValue - actualValue);
    const percentage = actualValue > 0 ? (diff / actualValue) * 100 : 0;

    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (percentage > this.CRITICAL_THRESHOLD) {
      severity = 'CRITICAL';
    } else if (percentage > this.TOLERANCE_PERCENTAGE) {
      severity = 'HIGH';
    } else if (percentage > 0.5) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }

    return {
      metric,
      reportedValue,
      actualValue,
      discrepancyPercentage: Number(percentage.toFixed(2)),
      severity
    };
  }

  /**
   * HU-022 TC-022-B01: Enviar alerta crítica al administrador
   * En producción, esto podría:
   * - Enviar email
   * - Crear ticket en sistema de monitoreo
   * - Publicar evento en RabbitMQ para notification-service
   * - Escribir en logs centralizados
   */
  private async sendCriticalAlert(
    validationResult: ValidationResult,
    query: AnalyticsQueryDTO
  ): Promise<void> {
    const criticalDiscrepancies = validationResult.discrepancies.filter(
      d => d.severity === 'CRITICAL'
    );

    const alertMessage = {
      type: 'ANALYTICS_VALIDATION_FAILURE',
      timestamp: validationResult.timestamp,
      dateRange: { from: query.from, to: query.to },
      criticalDiscrepancies,
      totalDiscrepancies: validationResult.discrepancies.length,
      message: '🚨 ALERTA CRÍTICA: Se detectaron inconsistencias significativas en reportes de analytics',
      actionRequired: 'Revisar queries de analytics y verificar integridad de datos en BD'
    };

    // Log en consola (en producción sería un sistema de alertas real)
    console.error('='.repeat(80));
    console.error('🚨 ALERTA CRÍTICA DE VALIDACIÓN DE ANALYTICS');
    console.error('='.repeat(80));
    console.error(JSON.stringify(alertMessage, null, 2));
    console.error('='.repeat(80));

    /**
     * TODO: Integrar con sistema de notificaciones real
     * - await this.notificationService.sendEmail(adminEmail, alertMessage);
     * - await this.rabbitmqService.publish('analytics.validation.failed', alertMessage);
     * - await this.slackService.sendAlert(alertMessage);
     */
  }

  /**
   * Método público para ejecutar validación programada (cron job)
   * Ejemplo: Ejecutar cada día a las 2 AM
   */
  async runScheduledValidation(): Promise<void> {
    console.log('[Validation Service] Ejecutando validación programada...');

    // Validar últimos 30 días
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 30);

    const query: AnalyticsQueryDTO = {
      from: from.toISOString().split('T')[0],
      to: to.toISOString().split('T')[0],
      groupBy: 'day',
      top: 10
    };

    const result = await this.validateAnalyticsConsistency(query);

    if (result.isValid) {
      console.log('✅ [Validation Service] Validación exitosa - Sin discrepancias');
    } else {
      console.warn('⚠️ [Validation Service] Validación completada con discrepancias');
      result.discrepancies.forEach(d => {
        console.warn(`  - ${d.metric}: ${d.discrepancyPercentage}% de diferencia (${d.severity})`);
      });
    }
  }
}
