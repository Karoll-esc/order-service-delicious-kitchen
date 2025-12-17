/**
 * Tests de Validación para HU-022
 * Valida correcciones en Analytics: fechas futuras, estados excluidos, manejo de errores
 * 
 * Ejecutar: npm test -- analyticsValidation.test.ts
 */

import { AnalyticsRepository } from '../src/repositories/AnalyticsRepository';
import { Model } from 'mongoose';
import { IOrder } from '../src/models/Order';

describe('HU-022: Analytics Data Validation', () => {
  let repository: AnalyticsRepository;
  let mockOrderModel: jest.Mocked<Model<IOrder>>;

  beforeEach(() => {
    // Mock del modelo Order
    mockOrderModel = {
      aggregate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([])
      }),
      countDocuments: jest.fn()
    } as any;

    repository = new AnalyticsRepository(mockOrderModel);
  });

  describe('TC-022-02: Validación de fecha futura en backend', () => {
    it('debe rechazar fecha inicial futura', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const query = {
        from: futureDateStr,
        to: new Date().toISOString().split('T')[0],
        groupBy: 'day' as const,
        top: 10
      };

      await expect(repository.getAnalytics(query)).rejects.toThrow(
        'No se permiten fechas futuras en el rango de análisis'
      );
    });

    it('debe rechazar fecha final futura', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 3);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      const query = {
        from: yesterdayStr,
        to: futureDateStr, // Fecha futura
        groupBy: 'month' as const,
        top: 10
      };

      await expect(repository.getAnalytics(query)).rejects.toThrow(
        'No se permiten fechas futuras en el rango de análisis'
      );
    });

    it('debe lanzar error con código FUTURE_DATE_NOT_ALLOWED', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const futureDateStr = futureDate.toISOString().split('T')[0];

      const query = {
        from: futureDateStr,
        to: futureDateStr,
        groupBy: 'day' as const,
        top: 10
      };

      try {
        await repository.getAnalytics(query);
        fail('Debería haber lanzado error');
      } catch (err: any) {
        expect(err.code).toBe('FUTURE_DATE_NOT_ALLOWED');
        expect(err.message).toContain('futuras');
      }
    });
  });

  describe('TC-022-03: Validación de rango inválido (from > to)', () => {
    it('debe rechazar cuando fecha inicial es mayor que fecha final', async () => {
      const query = {
        from: '2024-12-15',
        to: '2024-12-10', // Anterior a 'from'
        groupBy: 'week' as const,
        top: 10
      };

      await expect(repository.getAnalytics(query)).rejects.toThrow(
        'La fecha inicial no puede ser mayor que la fecha final'
      );
    });

    it('debe lanzar error con código INVALID_DATE_RANGE', async () => {
      const query = {
        from: '2024-12-20',
        to: '2024-12-15',
        groupBy: 'month' as const,
        top: 10
      };

      try {
        await repository.getAnalytics(query);
        fail('Debería haber lanzado error');
      } catch (err: any) {
        expect(err.code).toBe('INVALID_DATE_RANGE');
        expect(err.message).toContain('inicial');
      }
    });
  });

  describe('TC-022-04: Exclusión de pedidos cancelados', () => {
    it('debe filtrar status IN (ready, completed) en seriesPipeline', async () => {
      const query = {
        from: '2024-12-01',
        to: '2024-12-17',
        groupBy: 'day' as const,
        top: 10
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: '2024-12-01', totalOrders: 5, totalRevenue: 250 }
        ])
      });

      await repository.getAnalytics(query);

      // Verificar que se llamó aggregate
      expect(mockOrderModel.aggregate).toHaveBeenCalled();

      // Obtener el primer pipeline (series)
      const firstCall = (mockOrderModel.aggregate as jest.Mock).mock.calls[0];
      const seriesPipeline = firstCall[0];

      // Verificar que el $match incluye filtro correcto
      const matchStage = seriesPipeline.find((stage: any) => stage.$match);
      expect(matchStage).toBeDefined();
      expect(matchStage.$match.status).toEqual({ $in: ['ready', 'completed'] });
    });

    it('NO debe incluir status "cancelled" en el filtro', async () => {
      const query = {
        from: '2024-12-01',
        to: '2024-12-10',
        groupBy: 'month' as const,
        top: 5
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([])
      });

      await repository.getAnalytics(query);

      const firstCall = (mockOrderModel.aggregate as jest.Mock).mock.calls[0];
      const pipeline = firstCall[0];
      const matchStage = pipeline.find((stage: any) => stage.$match);

      // Verificar que NO incluye 'cancelled'
      expect(matchStage.$match.status.$in).not.toContain('cancelled');
      expect(matchStage.$match.status.$in).not.toContain('pending');
      expect(matchStage.$match.status.$in).not.toContain('rejected');
    });

    it('debe aplicar mismo filtro en productsPipeline', async () => {
      const query = {
        from: '2024-12-01',
        to: '2024-12-15',
        groupBy: 'week' as const,
        top: 10
      };

      mockOrderModel.aggregate = jest.fn()
        .mockReturnValueOnce({ // Primera llamada: seriesPipeline
          exec: jest.fn().mockResolvedValue([
            { _id: '2024-W50', totalOrders: 10, totalRevenue: 500 }
          ])
        })
        .mockReturnValueOnce({ // Segunda llamada: productsPipeline
          exec: jest.fn().mockResolvedValue([
            { _id: { productId: 'p1', name: 'Burger' }, quantity: 20, revenue: 200 }
          ])
        });

      await repository.getAnalytics(query);

      // Verificar que se llamó aggregate 2 veces (series + products)
      expect(mockOrderModel.aggregate).toHaveBeenCalledTimes(2);

      // Obtener segunda llamada (productsPipeline)
      const secondCall = (mockOrderModel.aggregate as jest.Mock).mock.calls[1];
      const productsPipeline = secondCall[0];

      // Verificar filtro en productsPipeline
      const matchStage = productsPipeline.find((stage: any) => stage.$match);
      expect(matchStage.$match.status).toEqual({ $in: ['ready', 'completed'] });
    });
  });

  describe('TC-022-06: Validación de rango máximo (12 meses)', () => {
    it('debe rechazar rango mayor a 12 meses', async () => {
      const query = {
        from: '2023-01-01',
        to: '2024-12-31', // Más de 12 meses
        groupBy: 'year' as const,
        top: 10
      };

      await expect(repository.getAnalytics(query)).rejects.toThrow(
        'El rango de fechas excede el máximo permitido'
      );
    });

    it('debe lanzar error con código RANGE_EXCEEDED', async () => {
      const query = {
        from: '2020-01-01',
        to: '2024-12-17',
        groupBy: 'month' as const,
        top: 10
      };

      try {
        await repository.getAnalytics(query);
        fail('Debería haber lanzado error');
      } catch (err: any) {
        expect(err.code).toBe('RANGE_EXCEEDED');
        expect(err.message).toContain('excede');
      }
    });

    it('debe permitir rango exactamente de 12 meses', async () => {
      const to = new Date();
      const from = new Date(to);
      from.setMonth(from.getMonth() - 12);

      const query = {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        groupBy: 'month' as const,
        top: 10
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([])
      });

      await repository.getAnalytics(query);

      // No debería lanzar error
      expect(mockOrderModel.aggregate).toHaveBeenCalled();
    });
  });

  describe('Casos válidos que deben funcionar', () => {
    it('debe aceptar rango válido de 7 días', async () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 7);

      const query = {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        groupBy: 'day' as const,
        top: 10
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: '2024-12-10', totalOrders: 3, totalRevenue: 150 }
        ])
      });

      const result = await repository.getAnalytics(query);

      expect(mockOrderModel.aggregate).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('debe aceptar rango válido de 30 días', async () => {
      const to = new Date();
      const from = new Date(to);
      from.setDate(from.getDate() - 30);

      const query = {
        from: from.toISOString().split('T')[0],
        to: to.toISOString().split('T')[0],
        groupBy: 'week' as const,
        top: 5
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([])
      });

      await expect(repository.getAnalytics(query)).resolves.toBeNull();
    });

    it('debe aceptar fechas iguales (mismo día)', async () => {
      const today = new Date().toISOString().split('T')[0];

      const query = {
        from: today,
        to: today,
        groupBy: 'day' as const,
        top: 10
      };

      mockOrderModel.aggregate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([])
      });

      await repository.getAnalytics(query);

      expect(mockOrderModel.aggregate).toHaveBeenCalled();
    });
  });
});
