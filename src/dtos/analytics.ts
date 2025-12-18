export type GroupBy = 'day' | 'week' | 'month' | 'year';

export interface AnalyticsQueryDTO {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  groupBy: GroupBy;
  top?: number; // default 10
}

/**
 * HU-022: DTO extendido con métricas de pedidos cancelados separadas
 * Permite distinguir claramente entre pedidos completados y cancelados
 */
export interface AnalyticsResponseDTO {
  range: { from: string; to: string; groupBy: GroupBy };
  summary: { 
    totalOrders: number; 
    totalRevenue: number; 
    avgPrepTime: number | null;
    totalCancelled: number; // HU-022: Total de pedidos cancelados
    lostRevenue: number;    // HU-022: Ingresos perdidos por cancelaciones
  };
  series: Array<{ period: string; totalOrders: number; totalRevenue: number; avgPrepTime: number | null }>;
  cancelledSeries: Array<{ period: string; totalCancelled: number; lostRevenue: number }>; // HU-022: Serie temporal de cancelados
  productsSold: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  topNProducts: Array<{ productId: string; name: string; quantity: number; revenue: number }>;
  message: string | null;
}

export interface CSVExportRequestDTO extends AnalyticsQueryDTO {
  columns: string[];
}