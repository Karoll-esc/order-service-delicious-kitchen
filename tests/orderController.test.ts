import { Request, Response } from 'express';
import { OrderController } from '../src/controllers/orderController';
import { orderService } from '../src/services/orderService';
import { OrderStatus } from '../src/models/Order';

// Mock del servicio
jest.mock('../src/services/orderService', () => ({
  orderService: {
    createOrder: jest.fn(),
    getOrderById: jest.fn(),
    getOrderStatus: jest.fn(),
    getAllOrders: jest.fn()
  }
}));

describe('OrderController', () => {
  let orderController: OrderController;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    orderController = new OrderController();
    jest.clearAllMocks();

    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });
    
    mockResponse = {
      status: mockStatus,
      json: mockJson
    } as Partial<Response>;
  });

  describe('createOrder', () => {
    it('debería crear un pedido exitosamente', async () => {
      const mockOrder = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        orderNumber: 'ORD-1234567890-001',
        customerName: 'Juan Pérez',
        items: [
          { name: 'Pizza Margherita', quantity: 2, price: 15.99 }
        ],
        status: OrderStatus.PENDING,
        total: 31.98,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      };

      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [
            { name: 'Pizza Margherita', quantity: 2, price: 15.99 }
          ]
        }
      };

      (orderService.createOrder as jest.Mock).mockResolvedValue(mockOrder);

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(orderService.createOrder).toHaveBeenCalledWith(
        'Juan Pérez',
        [{ name: 'Pizza Margherita', quantity: 2, price: 15.99 }]
      );
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith({
        message: 'Pedido creado exitosamente',
        order: expect.objectContaining({
          orderNumber: 'ORD-1234567890-001',
          customerName: 'Juan Pérez',
          status: OrderStatus.PENDING
        })
      });
    });

    it('debería retornar error 400 si falta customerName', async () => {
      mockRequest = {
        body: {
          items: [{ name: 'Pizza', quantity: 1, price: 10 }]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'El nombre del cliente es requerido'
      });
      expect(orderService.createOrder).not.toHaveBeenCalled();
    });

    it('debería retornar error 400 si customerName está vacío', async () => {
      mockRequest = {
        body: {
          customerName: '   ',
          items: [{ name: 'Pizza', quantity: 1, price: 10 }]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'El nombre del cliente es requerido'
      });
    });

    it('debería retornar error 400 si no hay items', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: []
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'El pedido debe tener al menos un item'
      });
    });

    it('debería retornar error 400 si falta información en items', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [
            { name: 'Pizza' } // Falta quantity y price
          ]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Cada item debe tener name, quantity y price'
      });
    });

    it('debería retornar error 400 si quantity es 0 (falsy)', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [
            { name: 'Pizza', quantity: 0, price: 10 } // quantity es 0 (falsy)
          ]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      // quantity: 0 es falsy, por lo que se activa la primera validación
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Cada item debe tener name, quantity y price'
      });
    });

    it('debería retornar error 400 si quantity es menor a 1 (pero truthy)', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [
            { name: 'Pizza', quantity: 0.5, price: 10 } // quantity < 1 pero truthy
          ]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Quantity debe ser mayor a 0 y price debe ser mayor o igual a 0'
      });
    });

    it('debería retornar error 400 si price es negativo', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [
            { name: 'Pizza', quantity: 1, price: -5 } // price inválido
          ]
        }
      };

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Quantity debe ser mayor a 0 y price debe ser mayor o igual a 0'
      });
    });

    it('debería manejar errores del servicio', async () => {
      mockRequest = {
        body: {
          customerName: 'Juan Pérez',
          items: [{ name: 'Pizza', quantity: 1, price: 10 }]
        }
      };

      const error = new Error('Error de base de datos');
      (orderService.createOrder as jest.Mock).mockRejectedValue(error);

      await orderController.createOrder(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Error al crear el pedido',
        details: 'Error de base de datos'
      });
    });
  });

  describe('getOrderById', () => {
    it('debería obtener un pedido por ID exitosamente', async () => {
      const mockOrder = {
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        orderNumber: 'ORD-1234567890-001',
        customerName: 'Juan Pérez',
        items: [{ name: 'Pizza', quantity: 1, price: 10 }],
        status: OrderStatus.PENDING,
        total: 10,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
      };

      mockRequest = {
        params: { id: '507f1f77bcf86cd799439011' }
      };

      (orderService.getOrderById as jest.Mock).mockResolvedValue(mockOrder);

      await orderController.getOrderById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(orderService.getOrderById).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          order: expect.objectContaining({
            orderNumber: 'ORD-1234567890-001'
          })
        })
      );
    });

    it('debería retornar 404 si el pedido no existe', async () => {
      mockRequest = {
        params: { id: '507f1f77bcf86cd799439011' }
      };

      (orderService.getOrderById as jest.Mock).mockResolvedValue(null);

      await orderController.getOrderById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Pedido no encontrado'
      });
    });

    it('debería manejar errores del servicio', async () => {
      mockRequest = {
        params: { id: '507f1f77bcf86cd799439011' }
      };

      const error = new Error('Error de base de datos');
      (orderService.getOrderById as jest.Mock).mockRejectedValue(error);

      await orderController.getOrderById(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Error al obtener el pedido',
        details: 'Error de base de datos'
      });
    });
  });

  describe('getOrderStatus', () => {
    it('debería obtener el estado de un pedido exitosamente', async () => {
      const mockStatus = {
        orderNumber: 'ORD-1234567890-001',
        status: OrderStatus.PREPARING
      };

      mockRequest = {
        params: { id: '507f1f77bcf86cd799439011' }
      };

      (orderService.getOrderStatus as jest.Mock).mockResolvedValue(mockStatus);

      await orderController.getOrderStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(orderService.getOrderStatus).toHaveBeenCalledWith('507f1f77bcf86cd799439011');
      expect(mockJson).toHaveBeenCalledWith({
        orderNumber: 'ORD-1234567890-001',
        status: OrderStatus.PREPARING
      });
    });

    it('debería retornar 404 si el pedido no existe', async () => {
      mockRequest = {
        params: { id: '507f1f77bcf86cd799439011' }
      };

      (orderService.getOrderStatus as jest.Mock).mockResolvedValue(null);

      await orderController.getOrderStatus(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({
        error: 'Pedido no encontrado'
      });
    });
  });

  describe('getAllOrders', () => {
    it('debería obtener todos los pedidos con parámetros por defecto', async () => {
      const mockOrders = [
        {
          _id: { toString: () => '507f1f77bcf86cd799439011' },
          orderNumber: 'ORD-001',
          customerName: 'Juan Pérez',
          items: [],
          status: OrderStatus.PENDING,
          total: 10,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      mockRequest = {
        query: {}
      };

      (orderService.getAllOrders as jest.Mock).mockResolvedValue(mockOrders);

      await orderController.getAllOrders(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(orderService.getAllOrders).toHaveBeenCalledWith(50, 0);
      expect(mockJson).toHaveBeenCalledWith({
        count: 1,
        orders: expect.arrayContaining([
          expect.objectContaining({
            orderNumber: 'ORD-001'
          })
        ])
      });
    });

    it('debería obtener pedidos con límite y skip personalizados', async () => {
      const mockOrders: any[] = [];
      mockRequest = {
        query: {
          limit: '10',
          skip: '5'
        }
      };

      (orderService.getAllOrders as jest.Mock).mockResolvedValue(mockOrders);

      await orderController.getAllOrders(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(orderService.getAllOrders).toHaveBeenCalledWith(10, 5);
      expect(mockJson).toHaveBeenCalledWith({
        count: 0,
        orders: []
      });
    });
  });
});

