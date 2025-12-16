import { OrderService } from '../../src/services/orderService';
import { Order, OrderStatus } from '../../src/models/Order';
import { OrderCancellation } from '../../src/models/OrderCancellation';
import { rabbitMQClient } from '../../src/rabbitmq/rabbitmqClient';
import { ORDER_EVENT_NAMES } from '../../src/constants/orderStates';

// Mock de RabbitMQ
jest.mock('../../src/rabbitmq/rabbitmqClient', () => ({
  rabbitMQClient: {
    publishEvent: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('OrderService.cancelOrder - Unit', () => {
  let service: OrderService;
  let baseOrder: any;
  let mockFindById: jest.SpyInstance;
  let mockFindOne: jest.SpyInstance;
  let mockOrderCancellationSave: jest.Mock;

  beforeEach(() => {
    const mockEventPublisher = {
      publishEvent: rabbitMQClient.publishEvent
    };
    service = new OrderService(mockEventPublisher as any);

    // Spy en Order.findById y Order.findOne
    mockFindById = jest.spyOn(Order, 'findById' as any);
    mockFindOne = jest.spyOn(Order, 'findOne' as any);
    
    // Mock para OrderCancellation.save
    mockOrderCancellationSave = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(OrderCancellation.prototype, 'save').mockImplementation(mockOrderCancellationSave);

    baseOrder = {
      _id: '507f1f77bcf86cd799439011', // ObjectId válido de 24 caracteres hex
      orderNumber: 'ORD-1234567890-001',
      customerName: 'Juan Pérez',
      customerEmail: 'juan@test.com',
      items: [{ name: 'Pizza', quantity: 1, price: 20 }],
      total: 20,
      status: OrderStatus.PENDING,
      updatedAt: new Date(),
      save: jest.fn().mockImplementation(function(this: any) {
        return Promise.resolve(this);
      }),
    };

    jest.clearAllMocks();
  });

  // F - Fast: prueba rápida y sin IO real
  it('cancela un pedido en estado PENDING', async () => {
    const mockOrder = { ...baseOrder };
    mockFindById.mockResolvedValue(mockOrder);

    const result = await service.cancelOrder('507f1f77bcf86cd799439011', 'Cambié de idea', 'customer');

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(mockOrder.save).toHaveBeenCalledTimes(1);
    expect(mockOrderCancellationSave).toHaveBeenCalledTimes(1);
    expect(rabbitMQClient.publishEvent).toHaveBeenCalledWith(
      ORDER_EVENT_NAMES.CANCELLED,
      expect.objectContaining({
        type: ORDER_EVENT_NAMES.CANCELLED,
        orderId: '507f1f77bcf86cd799439011',
        reason: 'Cambié de idea',
        cancelledBy: 'customer',
      })
    );
  });

  // I - Isolated: sin dependencias entre pruebas
  it('rechaza cancelar si el estado es PREPARING', async () => {
    const mockOrder = { ...baseOrder, status: OrderStatus.PREPARING };
    mockFindById.mockResolvedValue(mockOrder);
    
    await expect(service.cancelOrder('507f1f77bcf86cd799439011')).rejects.toThrow('Los clientes solo pueden cancelar pedidos pendientes o recibidos');
  });

  it('rechaza cancelar si el estado es READY', async () => {
    const mockOrder = { ...baseOrder, status: OrderStatus.READY };
    mockFindById.mockResolvedValue(mockOrder);
    
    await expect(service.cancelOrder('507f1f77bcf86cd799439011')).rejects.toThrow('Los clientes solo pueden cancelar pedidos pendientes o recibidos');
  });

  it('rechaza cancelar si el estado es DELIVERED', async () => {
    const mockOrder = { ...baseOrder, status: OrderStatus.DELIVERED };
    mockFindById.mockResolvedValue(mockOrder);
    
    await expect(service.cancelOrder('507f1f77bcf86cd799439011')).rejects.toThrow('Los clientes solo pueden cancelar pedidos pendientes o recibidos');
  });

  // R - Repeatable: consistente en ejecuciones múltiples
  it('registra historial de cancelación en cada intento', async () => {
    for (let i = 0; i < 3; i++) {
      const mockOrder = { ...baseOrder };
      mockFindById.mockResolvedValue(mockOrder);
      await service.cancelOrder('507f1f77bcf86cd799439011', 'Razón ' + i, 'customer');
    }
    expect(mockOrderCancellationSave).toHaveBeenCalledTimes(3);
  });

  // S - Self-validating: assertions claras
  it('usa razón por defecto si no se especifica', async () => {
    const mockOrder = { ...baseOrder };
    mockFindById.mockResolvedValue(mockOrder);
    
    await service.cancelOrder('507f1f77bcf86cd799439011');
    expect(mockOrderCancellationSave).toHaveBeenCalled();
    // Verificar que se llamó con el objeto que contiene reason: 'Sin especificar'
    const cancellationCall = (mockOrderCancellationSave.mock.instances[0] as any);
    expect(cancellationCall.reason).toBe('Sin especificar');
  });

  it('propaga error si el pedido no existe', async () => {
    mockFindById.mockResolvedValue(null);
    mockFindOne.mockResolvedValue(null);
    await expect(service.cancelOrder('507f1f77bcf86cd799439011')).rejects.toThrow('no encontrado');
  });

  it('publica evento con payload esperado', async () => {
    const mockOrder = { ...baseOrder };
    mockFindById.mockResolvedValue(mockOrder);
    
    await service.cancelOrder('507f1f77bcf86cd799439011', 'test', 'admin');
    expect(rabbitMQClient.publishEvent).toHaveBeenCalledWith(
      ORDER_EVENT_NAMES.CANCELLED,
      expect.objectContaining({
        type: ORDER_EVENT_NAMES.CANCELLED,
        orderId: '507f1f77bcf86cd799439011',
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
      mockFindById.mockResolvedValue(preparingOrder);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011', 'Cambié de idea', 'customer')
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
        status: OrderStatus.PREPARING
      };
      mockFindById.mockResolvedValue(preparingOrder);

      const result = await service.cancelOrder('507f1f77bcf86cd799439011', 'Cancelación administrativa', 'admin');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(preparingOrder.save).toHaveBeenCalled();
      expect(mockOrderCancellationSave).toHaveBeenCalled();
      // Verificar que se guardó con cancelledBy='admin' y previousStatus='preparing'
      const cancellation = (mockOrderCancellationSave.mock.instances[0] as any);
      expect(cancellation.cancelledBy).toBe('admin');
      expect(cancellation.previousStatus).toBe(OrderStatus.PREPARING);
    });

    it('TC-006.2.3: Admin puede cancelar pedido en estado READY', async () => {
      const readyOrder = { 
        ...baseOrder, 
        status: OrderStatus.READY
      };
      mockFindById.mockResolvedValue(readyOrder);

      const result = await service.cancelOrder('507f1f77bcf86cd799439011', 'Error en preparación', 'admin');

      expect(result.status).toBe(OrderStatus.CANCELLED);
    });

    it('TC-006.2.4: Ni cliente ni admin pueden cancelar pedido COMPLETED', async () => {
      const completedOrder = { ...baseOrder, status: OrderStatus.COMPLETED };
      
      // Cliente
      mockFindById.mockResolvedValue({ ...completedOrder });
      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011', 'test', 'customer')
      ).rejects.toThrow('solo pueden cancelar pedidos pendientes o recibidos');

      // Admin
      mockFindById.mockResolvedValue({ ...completedOrder });
      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011', 'test', 'admin')
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
      mockFindById.mockResolvedValue(cancelledOrder);

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await service.cancelOrder('507f1f77bcf86cd799439011', 'Intento duplicado', 'customer');

      expect(result.status).toBe(OrderStatus.CANCELLED);
      
      // No debe guardar nuevo registro de cancelación
      expect(mockOrderCancellationSave).not.toHaveBeenCalled();
      
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
      mockFindById.mockResolvedValue(orderWithVersionConflict);

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011', 'test', 'customer')
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
      mockFindById.mockResolvedValue(orderWithVersionConflict);

      await expect(
        service.cancelOrder('507f1f77bcf86cd799439011', 'test', 'admin')
      ).rejects.toThrow('Conflicto detectado');
    });
  });
});
