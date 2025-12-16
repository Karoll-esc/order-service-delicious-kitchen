import { OrderService } from '../services/orderService';
import { Order, OrderStatus } from '../models/Order';
import { OrderCancellation } from '../models/OrderCancellation';
import { rabbitMQClient } from '../rabbitmq/rabbitmqClient';
import { ORDER_EVENT_NAMES } from '../constants/orderStates';

jest.mock('../models/Order', () => {
  return {
    Order: {
      findById: jest.fn(),
      findOne: jest.fn(),
    },
  };
});

jest.mock('../models/OrderCancellation', () => {
  const mockInstance = { save: jest.fn().mockResolvedValue(undefined) };
  const OrderCancellation = jest.fn(() => mockInstance);
  return { OrderCancellation };
});

jest.mock('../rabbitmq/rabbitmqClient', () => ({
  rabbitMQClient: {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('OrderService.cancelOrder - Unit', () => {
  let service: OrderService;
  let baseOrder: any;

  beforeEach(() => {
    const mockEventPublisher = {
      publishEvent: rabbitMQClient.publishEvent
    };
    service = new OrderService(mockEventPublisher as any);

    baseOrder = {
      _id: 'order-123',
      orderNumber: 'ORD-1234567890-001',
      customerName: 'Juan Pérez',
      items: [{ name: 'Pizza', quantity: 1, price: 20 }],
      total: 20,
      status: OrderStatus.PENDING,
      updatedAt: new Date(),
      save: jest.fn().mockResolvedValue(undefined),
    };

    (Order.findById as jest.Mock).mockReset();
    (Order.findOne as jest.Mock).mockReset();
    (OrderCancellation as unknown as jest.Mock).mockClear();
    (rabbitMQClient.publishEvent as jest.Mock).mockClear();
  });

  // F - Fast: prueba rápida y sin IO real
  it('cancela un pedido en estado PENDING', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder });

    const result = await service.cancelOrder('order-123', 'Cambié de idea', 'customer');

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(baseOrder.save).toHaveBeenCalledTimes(1);
    expect(OrderCancellation).toHaveBeenCalledTimes(1);
    expect(rabbitMQClient.publishEvent).toHaveBeenCalledWith(
      ORDER_EVENT_NAMES.CANCELLED,
      expect.objectContaining({
        type: ORDER_EVENT_NAMES.CANCELLED,
        orderId: 'order-123',
        reason: 'Cambié de idea',
        cancelledBy: 'customer',
      })
    );
  });

  // I - Isolated: sin dependencias entre pruebas
  it('rechaza cancelar si el estado es PREPARING', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder, status: OrderStatus.PREPARING });
    await expect(service.cancelOrder('order-123')).rejects.toThrow('No se puede cancelar un pedido en estado "preparing"');
  });

  it('rechaza cancelar si el estado es READY', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder, status: OrderStatus.READY });
    await expect(service.cancelOrder('order-123')).rejects.toThrow('No se puede cancelar un pedido en estado "ready"');
  });

  it('rechaza cancelar si el estado es DELIVERED', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder, status: OrderStatus.DELIVERED });
    await expect(service.cancelOrder('order-123')).rejects.toThrow('No se puede cancelar un pedido en estado "delivered"');
  });

  // R - Repeatable: consistente en ejecuciones múltiples
  it('registra historial de cancelación en cada intento', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder });
    for (let i = 0; i < 3; i++) {
      await service.cancelOrder('order-123', 'Razón ' + i, 'customer');
    }
    expect(OrderCancellation).toHaveBeenCalledTimes(3);
  });

  // S - Self-validating: assertions claras
  it('usa razón por defecto si no se especifica', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder });
    await service.cancelOrder('order-123');
    expect(OrderCancellation).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'Sin especificar',
      })
    );
  });

  it('propaga error si el pedido no existe', async () => {
    (Order.findById as jest.Mock).mockResolvedValue(null);
    await expect(service.cancelOrder('inexistente')).rejects.toThrow('no encontrado');
  });

  it('publica evento con payload esperado', async () => {
    (Order.findById as jest.Mock).mockResolvedValue({ ...baseOrder });
    await service.cancelOrder('order-123', 'test', 'admin');
    expect(rabbitMQClient.publishEvent).toHaveBeenCalledWith(
      ORDER_EVENT_NAMES.CANCELLED,
      expect.objectContaining({
        type: ORDER_EVENT_NAMES.CANCELLED,
        orderId: 'order-123',
        orderNumber: 'ORD-1234567890-001',
        cancelledBy: 'admin',
        reason: 'test',
      })
    );
  });

  // ========== HU-006: Validación de Cancelación por Roles ==========

  describe('TC-006.2: Validación basada en rol', () => {
    it('TC-006.2.1: Cliente NO puede cancelar pedido en estado PREPARING', async () => {
      const preparingOrder = { ...baseOrder, status: OrderStatus.PREPARING };
      (Order.findById as jest.Mock).mockResolvedValue(preparingOrder);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        service.cancelOrder('order-123', 'Cambié de idea', 'customer')
      ).rejects.toThrow(
        'Los clientes solo pueden cancelar pedidos pendientes o recibidos'
      );

      // Verificar que se registró el intento fallido
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Intento de cancelación rechazado')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('customer')
      );

      consoleWarnSpy.mockRestore();
    });

    it('TC-006.2.2: Admin SÍ puede cancelar pedido en estado PREPARING', async () => {
      const preparingOrder = { 
        ...baseOrder, 
        status: OrderStatus.PREPARING,
        save: jest.fn().mockResolvedValue({ ...baseOrder, status: OrderStatus.CANCELLED })
      };
      (Order.findById as jest.Mock).mockResolvedValue(preparingOrder);

      const result = await service.cancelOrder('order-123', 'Cancelación administrativa', 'admin');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(preparingOrder.save).toHaveBeenCalled();
      expect(OrderCancellation).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelledBy: 'admin',
          previousStatus: OrderStatus.PREPARING
        })
      );
    });

    it('TC-006.2.3: Admin puede cancelar pedido en estado READY', async () => {
      const readyOrder = { 
        ...baseOrder, 
        status: OrderStatus.READY,
        save: jest.fn().mockResolvedValue({ ...baseOrder, status: OrderStatus.CANCELLED })
      };
      (Order.findById as jest.Mock).mockResolvedValue(readyOrder);

      const result = await service.cancelOrder('order-123', 'Error en preparación', 'admin');

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('TC-006.2.4: Ni cliente ni admin pueden cancelar pedido COMPLETED', async () => {
      const completedOrder = { ...baseOrder, status: OrderStatus.COMPLETED };
      (Order.findById as jest.Mock).mockResolvedValue(completedOrder);

      // Cliente
      await expect(
        service.cancelOrder('order-123', 'test', 'customer')
      ).rejects.toThrow('solo pueden cancelar pedidos pendientes o recibidos');

      // Admin
      await expect(
        service.cancelOrder('order-123', 'test', 'admin')
      ).rejects.toThrow('No se puede cancelar pedidos en estado final');
    });
  });

  describe('TC-006.4: Idempotencia en cancelaciones duplicadas', () => {
    it('Retorna pedido sin error si ya está cancelado', async () => {
      const cancelledOrder = { 
        ...baseOrder, 
        status: OrderStatus.CANCELLED,
        updatedAt: new Date('2024-01-01')
      };
      (Order.findById as jest.Mock).mockResolvedValue(cancelledOrder);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await service.cancelOrder('order-123', 'Intento duplicado', 'customer');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(result).toBe(cancelledOrder); // Mismo objeto, sin modificar
      
      // No debe guardar nuevo registro de cancelación
      expect(OrderCancellation).not.toHaveBeenCalled();
      
      // No debe publicar evento duplicado
      expect(rabbitMQClient.publishEvent).not.toHaveBeenCalled();

      // Debe loggear que ya estaba cancelado
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('ya estaba cancelado')
      );

      consoleLogSpy.mockRestore();
    });
  });

  describe('TC-006.3: Manejo de race conditions', () => {
    it('Lanza error de conflicto si hay VersionError', async () => {
      const orderWithVersionConflict = {
        ...baseOrder,
        status: OrderStatus.RECEIVED,
        save: jest.fn().mockRejectedValue({
          name: 'VersionError',
          message: 'No matching document found for id "order-123" version 0'
        })
      };
      (Order.findById as jest.Mock).mockResolvedValue(orderWithVersionConflict);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        service.cancelOrder('order-123', 'test', 'customer')
      ).rejects.toThrow('Conflicto detectado: el pedido cambió de estado durante la operación');

      // Verificar que se registró el race condition
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Race condition detectado')
      );

      consoleWarnSpy.mockRestore();
    });

    it('Lanza error de conflicto si mensaje contiene "version"', async () => {
      const orderWithVersionConflict = {
        ...baseOrder,
        status: OrderStatus.PENDING,
        save: jest.fn().mockRejectedValue(new Error('Document version mismatch'))
      };
      (Order.findById as jest.Mock).mockResolvedValue(orderWithVersionConflict);

      await expect(
        service.cancelOrder('order-123', 'test', 'admin')
      ).rejects.toThrow('Conflicto detectado');
    });
  });
});