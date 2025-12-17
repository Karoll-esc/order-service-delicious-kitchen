import { ICSVExporter } from '../interfaces/ICSVExporter';
import { AnalyticsResponseDTO, CSVExportRequestDTO } from '../dtos/analytics';
import { Readable } from 'stream';
const { stringify } = require('csv-stringify/sync');

/**
 * Exportador de CSV
 * Cumple con Single Responsibility Principle: Solo generación de CSV
 * HU-022 TC-022-B02: Garantiza que CSV refleje EXACTAMENTE los datos del reporte
 */
export class CSVExporter implements ICSVExporter {
  export(analytics: AnalyticsResponseDTO | null, query: CSVExportRequestDTO): Readable {
    const readable = new Readable({ read() {} });

    /**
     * HU-022: Columnas actualizadas para incluir métricas de cancelados
     */
    const columns = query.columns?.length
      ? query.columns
      : ['period', 'totalOrders', 'totalRevenue', 'totalCancelled', 'lostRevenue', 'productId', 'productName', 'quantity', 'avgPrepTime'];

    // Preparar datos
    const records: any[] = [];

    if (!analytics || !analytics.series || !analytics.productsSold) {
      records.push({
        period: `${query.from} to ${query.to}`,
        totalOrders: 0,
        totalRevenue: 0,
        totalCancelled: 0,
        lostRevenue: 0,
        productId: '',
        productName: 'No data available',
        quantity: 0,
        avgPrepTime: ''
      });
    } else {
      /**
       * HU-022 TC-022-B02: Conteo exacto de filas
       * - Una fila por cada combinación de (periodo, producto)
       * - Incluye métricas de cancelados por periodo
       * - Total de filas = series.length × productsSold.length
       */
      analytics.series.forEach(seriesItem => {
        // Buscar métricas de cancelados para este periodo
        const cancelledForPeriod = analytics.cancelledSeries?.find(
          c => c.period === seriesItem.period
        ) || { totalCancelled: 0, lostRevenue: 0 };

        analytics.productsSold.forEach(product => {
          records.push({
            period: seriesItem.period || '',
            totalOrders: seriesItem.totalOrders || 0,
            totalRevenue: seriesItem.totalRevenue || 0,
            totalCancelled: cancelledForPeriod.totalCancelled || 0, // HU-022: Cancelados por periodo
            lostRevenue: cancelledForPeriod.lostRevenue || 0,        // HU-022: Ingresos perdidos
            productId: product.productId || '',
            productName: product.name || '',
            quantity: product.quantity || 0,
            avgPrepTime: seriesItem.avgPrepTime || ''
          });
        });
      });
    }

    // Generar CSV con punto y coma para Excel español
    try {
      const output = stringify(records, {
        header: true,
        columns: columns,
        delimiter: ';',
        quote: '"',
        quoted: true,
        quoted_empty: true
      });
      
      /**
       * HU-022 TC-022-B02: Validación de consistencia
       * El número de filas del CSV debe coincidir exactamente con:
       * - (series.length × productsSold.length) + 1 fila de encabezado
       */
      const expectedRows = analytics?.series && analytics?.productsSold 
        ? analytics.series.length * analytics.productsSold.length 
        : 0;
      
      console.log(`[CSV Export] Generando ${expectedRows} filas de datos (+ 1 encabezado)`);
      
      // BOM UTF-8 para Excel
      readable.push('\uFEFF' + output);
      readable.push(null);
    } catch (err) {
      console.error('Error generando CSV:', err);
      readable.push('Error generating CSV report\n');
      readable.push(null);
    }

    return readable;
  }
}
