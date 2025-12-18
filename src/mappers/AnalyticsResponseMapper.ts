import { AnalyticsQueryDTO, AnalyticsResponseDTO } from '../dtos/analytics';

/**
 * Mapper para transformar datos crudos de MongoDB a DTOs
 * Cumple con Single Responsibility Principle: Solo transformación de datos
 */
export class AnalyticsResponseMapper {
  /**
   * HU-022: Mapper actualizado para incluir series de pedidos cancelados
   * @param series - Serie temporal de pedidos completados
   * @param productsSold - Productos vendidos
   * @param cancelledSeries - Serie temporal de pedidos cancelados
   * @param query - Query original
   */
  mapToDTO(
    series: any[],
    productsSold: any[],
    cancelledSeries: any[],
    query: AnalyticsQueryDTO
  ): AnalyticsResponseDTO {
    const summary = this.calculateSummary(series);
    const cancelledSummary = this.calculateCancelledSummary(cancelledSeries);
    
    return {
      range: { from: query.from, to: query.to, groupBy: query.groupBy },
      summary: {
        totalOrders: summary.totalOrders,
        totalRevenue: Number(summary.totalRevenue.toFixed(2)),
        avgPrepTime: null,
        totalCancelled: cancelledSummary.totalCancelled, // HU-022: Métrica separada
        lostRevenue: Number(cancelledSummary.lostRevenue.toFixed(2)) // HU-022: Ingresos perdidos
      },
      series: series.map((s: any) => ({
        period: s._id,
        totalOrders: s.totalOrders,
        totalRevenue: Number(s.totalRevenue.toFixed(2)),
        avgPrepTime: null
      })),
      cancelledSeries: cancelledSeries.map((c: any) => ({ // HU-022: Serie de cancelados
        period: c._id,
        totalCancelled: c.totalCancelledOrders,
        lostRevenue: Number(c.lostRevenue.toFixed(2))
      })),
      productsSold: this.mapProducts(productsSold),
      topNProducts: this.mapProducts(productsSold),
      message: null
    };
  }

  private calculateSummary(series: any[]): { totalOrders: number; totalRevenue: number } {
    return series.reduce(
      (acc, s) => ({
        totalOrders: acc.totalOrders + s.totalOrders,
        totalRevenue: acc.totalRevenue + s.totalRevenue
      }),
      { totalOrders: 0, totalRevenue: 0 }
    );
  }

  /**
   * HU-022: Calcular resumen de pedidos cancelados
   */
  private calculateCancelledSummary(cancelledSeries: any[]): { totalCancelled: number; lostRevenue: number } {
    return cancelledSeries.reduce(
      (acc, c) => ({
        totalCancelled: acc.totalCancelled + c.totalCancelledOrders,
        lostRevenue: acc.lostRevenue + c.lostRevenue
      }),
      { totalCancelled: 0, lostRevenue: 0 }
    );
  }

  private mapProducts(products: any[]): Array<{ productId: string; name: string; quantity: number; revenue: number }> {
    return products.map((p: any) => ({
      productId: typeof p._id === 'object' ? p._id.productId : p._id,
      name: typeof p._id === 'object' ? p._id.name : p.name,
      quantity: p.quantity,
      revenue: p.revenue !== undefined && p.revenue !== null 
        ? Number(p.revenue.toFixed(2)) 
        : 0
    }));
  }
}
