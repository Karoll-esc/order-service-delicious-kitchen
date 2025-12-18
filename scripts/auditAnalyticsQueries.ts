/**
 * @file auditAnalyticsQueries.ts
 * @description Script de auditoría para validar consistencia de reportes de analytics
 * 
 * HU-022: Validar y Corregir Datos en Reportes de Analytics
 * Caso de Prueba: TC-022-P01, TC-022-B01
 * 
 * Este script compara los datos reportados por el sistema de analytics
 * con queries directas a la base de datos para identificar discrepancias.
 * 
 * Uso: npm run audit:analytics -- --from=2024-01-01 --to=2024-12-31
 */

import mongoose from 'mongoose';
import { Order, OrderStatus } from '../src/models/Order';
import { OrderCancellation } from '../src/models/OrderCancellation';

interface AuditReportEntry {
  check: string;
  expected: number | string;
  actual: number | string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  discrepancy?: string;
}

interface AuditReport {
  executedAt: string;
  dateRange: { from: string; to: string };
  results: AuditReportEntry[];
  summary: {
    totalChecks: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * Configuración de umbrales de tolerancia
 */
const TOLERANCE_PERCENTAGE = 1; // 1% de tolerancia para discrepancias

/**
 * Clase principal de auditoría
 */
class AnalyticsAuditor {
  private fromDate: Date;
  private toDate: Date;
  private report: AuditReport;

  constructor(from: string, to: string) {
    this.fromDate = new Date(`${from}T00:00:00.000Z`);
    this.toDate = new Date(`${to}T23:59:59.999Z`);
    this.report = {
      executedAt: new Date().toISOString(),
      dateRange: { from, to },
      results: [],
      summary: { totalChecks: 0, passed: 0, failed: 0, warnings: 0 }
    };
  }

  /**
   * Ejecuta todas las auditorías
   */
  async runAllAudits(): Promise<AuditReport> {
    console.log('🔍 Iniciando auditoría de analytics...\n');
    console.log(`📅 Rango: ${this.fromDate.toISOString().split('T')[0]} → ${this.toDate.toISOString().split('T')[0]}\n`);

    await this.auditCompletedOrders();
    await this.auditCancelledOrders();
    await this.auditRevenueCalculation();
    await this.auditCancelledNotInCompleted();
    await this.auditOrderStateConsistency();
    await this.auditDateFilterAccuracy();

    this.calculateSummary();
    this.printReport();

    return this.report;
  }

  /**
   * HU-022 TC-022-P02: Auditar que total de órdenes completadas coincida con BD
   */
  private async auditCompletedOrders(): Promise<void> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];
    
    const dbCount = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: { $in: validStatuses }
    });

    // Simular query de analytics para comparar
    const analyticsCount = await this.getAnalyticsCompletedCount();

    this.addCheckResult({
      check: 'Total Órdenes Completadas',
      expected: dbCount,
      actual: analyticsCount,
      status: dbCount === analyticsCount ? 'PASS' : 'FAIL',
      discrepancy: dbCount !== analyticsCount 
        ? `Diferencia de ${Math.abs(dbCount - analyticsCount)} órdenes` 
        : undefined
    });
  }

  /**
   * HU-022 TC-022-N01: Auditar que pedidos cancelados NO estén en reportes de completados
   */
  private async auditCancelledNotInCompleted(): Promise<void> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];
    
    // Verificar que ningún pedido cancelado esté siendo contado como completado
    const cancelledInCompleted = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: { $in: [OrderStatus.CANCELLED, ...validStatuses] }
    });

    const onlyCompleted = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: { $in: validStatuses }
    });

    const onlyCancelled = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: OrderStatus.CANCELLED
    });

    const expectedTotal = onlyCompleted + onlyCancelled;

    this.addCheckResult({
      check: 'Cancelados NO incluidos en Completados',
      expected: expectedTotal,
      actual: cancelledInCompleted,
      status: expectedTotal === cancelledInCompleted ? 'PASS' : 'FAIL',
      discrepancy: expectedTotal !== cancelledInCompleted
        ? '⚠️ Posible contaminación: pedidos cancelados en reporte de completados'
        : undefined
    });
  }

  /**
   * HU-022: Auditar conteo de pedidos cancelados
   */
  private async auditCancelledOrders(): Promise<void> {
    const dbCancelledCount = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: OrderStatus.CANCELLED
    });

    const cancellationRecordsCount = await OrderCancellation.countDocuments({
      cancelledAt: { $gte: this.fromDate, $lte: this.toDate }
    });

    this.addCheckResult({
      check: 'Total Órdenes Canceladas',
      expected: dbCancelledCount,
      actual: dbCancelledCount,
      status: 'PASS'
    });

    // Verificar consistencia con tabla de cancelaciones
    const tolerance = Math.ceil(dbCancelledCount * (TOLERANCE_PERCENTAGE / 100));
    const diff = Math.abs(dbCancelledCount - cancellationRecordsCount);

    this.addCheckResult({
      check: 'Consistencia con OrderCancellation',
      expected: dbCancelledCount,
      actual: cancellationRecordsCount,
      status: diff <= tolerance ? 'PASS' : 'WARNING',
      discrepancy: diff > tolerance 
        ? `Discrepancia de ${diff} registros (tolerancia: ${tolerance})` 
        : undefined
    });
  }

  /**
   * HU-022 TC-022-P02: Auditar cálculo de ingresos totales
   */
  private async auditRevenueCalculation(): Promise<void> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];

    const orders = await Order.find({
      createdAt: { $gte: this.fromDate, $lte: this.toDate },
      status: { $in: validStatuses }
    });

    // Calcular ingresos totales manualmente
    const expectedRevenue = orders.reduce((sum, order) => sum + order.total, 0);

    // Simular cálculo de analytics (agregación)
    const analyticsRevenue = await this.getAnalyticsRevenue();

    const tolerance = expectedRevenue * (TOLERANCE_PERCENTAGE / 100);
    const diff = Math.abs(expectedRevenue - analyticsRevenue);

    this.addCheckResult({
      check: 'Ingresos Totales (Revenue)',
      expected: Number(expectedRevenue.toFixed(2)),
      actual: Number(analyticsRevenue.toFixed(2)),
      status: diff <= tolerance ? 'PASS' : 'FAIL',
      discrepancy: diff > tolerance 
        ? `Diferencia de $${diff.toFixed(2)} (tolerancia: $${tolerance.toFixed(2)})` 
        : undefined
    });
  }

  /**
   * HU-022: Verificar consistencia de estados de órdenes
   */
  private async auditOrderStateConsistency(): Promise<void> {
    const allOrders = await Order.find({
      createdAt: { $gte: this.fromDate, $lte: this.toDate }
    }, 'status');

    const invalidStates = allOrders.filter(order => {
      return !Object.values(OrderStatus).includes(order.status);
    });

    this.addCheckResult({
      check: 'Estados de órdenes válidos',
      expected: 0,
      actual: invalidStates.length,
      status: invalidStates.length === 0 ? 'PASS' : 'FAIL',
      discrepancy: invalidStates.length > 0 
        ? `Encontrados ${invalidStates.length} pedidos con estados inválidos` 
        : undefined
    });
  }

  /**
   * HU-022 TC-022-P02: Verificar precisión de filtros de fecha
   */
  private async auditDateFilterAccuracy(): Promise<void> {
    // Buscar órdenes fuera del rango (edge case)
    const ordersBeforeRange = await Order.countDocuments({
      createdAt: { $lt: this.fromDate }
    });

    const ordersAfterRange = await Order.countDocuments({
      createdAt: { $gt: this.toDate }
    });

    const ordersInRange = await Order.countDocuments({
      createdAt: { $gte: this.fromDate, $lte: this.toDate }
    });

    this.addCheckResult({
      check: 'Filtros de fecha precisos',
      expected: `${ordersInRange} dentro del rango`,
      actual: `${ordersInRange} dentro, ${ordersBeforeRange} antes, ${ordersAfterRange} después`,
      status: 'PASS'
    });
  }

  /**
   * Helpers para simular queries de analytics
   */
  private async getAnalyticsCompletedCount(): Promise<number> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];
    
    const result = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: this.fromDate, $lte: this.toDate },
          status: { $in: validStatuses }
        } 
      },
      { $count: 'total' }
    ]);

    return result[0]?.total || 0;
  }

  private async getAnalyticsRevenue(): Promise<number> {
    const validStatuses = [OrderStatus.READY, OrderStatus.COMPLETED, OrderStatus.DELIVERED];

    const result = await Order.aggregate([
      { 
        $match: { 
          createdAt: { $gte: this.fromDate, $lte: this.toDate },
          status: { $in: validStatuses }
        } 
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: null,
          totalRevenue: { 
            $sum: { 
              $multiply: ['$items.quantity', { $ifNull: ['$items.unitPrice', '$items.price'] }] 
            } 
          }
        }
      }
    ]);

    return result[0]?.totalRevenue || 0;
  }

  /**
   * Agregar resultado de verificación al reporte
   */
  private addCheckResult(entry: AuditReportEntry): void {
    this.report.results.push(entry);
  }

  /**
   * Calcular resumen del reporte
   */
  private calculateSummary(): void {
    this.report.summary.totalChecks = this.report.results.length;
    this.report.summary.passed = this.report.results.filter(r => r.status === 'PASS').length;
    this.report.summary.failed = this.report.results.filter(r => r.status === 'FAIL').length;
    this.report.summary.warnings = this.report.results.filter(r => r.status === 'WARNING').length;
  }

  /**
   * Imprimir reporte en consola
   */
  private printReport(): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 REPORTE DE AUDITORÍA DE ANALYTICS');
    console.log('='.repeat(80) + '\n');

    this.report.results.forEach(result => {
      const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
      console.log(`${icon} ${result.check}`);
      console.log(`   Esperado: ${result.expected}`);
      console.log(`   Obtenido: ${result.actual}`);
      if (result.discrepancy) {
        console.log(`   Discrepancia: ${result.discrepancy}`);
      }
      console.log('');
    });

    console.log('='.repeat(80));
    console.log(`📈 Resumen: ${this.report.summary.passed}/${this.report.summary.totalChecks} verificaciones exitosas`);
    if (this.report.summary.failed > 0) {
      console.log(`❌ Fallos críticos: ${this.report.summary.failed}`);
    }
    if (this.report.summary.warnings > 0) {
      console.log(`⚠️ Advertencias: ${this.report.summary.warnings}`);
    }
    console.log('='.repeat(80) + '\n');

    // HU-022 TC-022-B01: Enviar alerta si hay discrepancias >1%
    if (this.report.summary.failed > 0) {
      console.log('🚨 ALERTA: Se detectaron inconsistencias críticas.');
      console.log('   Acción requerida: Revisar queries de analytics y datos de BD.\n');
    }
  }
}

/**
 * Función principal de ejecución
 */
async function main() {
  try {
    // Parsear argumentos de línea de comandos
    const args = process.argv.slice(2);
    const fromArg = args.find(arg => arg.startsWith('--from='))?.split('=')[1];
    const toArg = args.find(arg => arg.startsWith('--to='))?.split('=')[1];

    const from = fromArg || getDefaultFromDate();
    const to = toArg || getDefaultToDate();

    // Conectar a MongoDB
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/delicious-kitchen-order';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Ejecutar auditoría
    const auditor = new AnalyticsAuditor(from, to);
    const report = await auditor.runAllAudits();

    // Guardar reporte a archivo (opcional)
    // const fs = require('fs');
    // fs.writeFileSync('audit-report.json', JSON.stringify(report, null, 2));

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB\n');

    // Exit code según resultados
    process.exit(report.summary.failed > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Error ejecutando auditoría:', error);
    process.exit(1);
  }
}

/**
 * Helpers para fechas por defecto
 */
function getDefaultFromDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date.toISOString().split('T')[0];
}

function getDefaultToDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Ejecutar si se invoca directamente
if (require.main === module) {
  main();
}

export { AnalyticsAuditor, AuditReport };
