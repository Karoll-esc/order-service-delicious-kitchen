// Setup global para los tests
import mongoose from 'mongoose';

// Mock de mongoose
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    connect: jest.fn(),
    disconnect: jest.fn(),
    connection: {
      readyState: 1,
      close: jest.fn()
    }
  };
});

// Mock de rabbitMQClient
jest.mock('../src/rabbitmq/rabbitmqClient', () => ({
  rabbitMQClient: {
    connect: jest.fn().mockResolvedValue(undefined),
    publishEvent: jest.fn().mockResolvedValue(true),
    consumeEvent: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    isConnected: jest.fn().mockReturnValue(true)
  }
}));

// Limpiar mocks después de cada test
afterEach(() => {
  jest.clearAllMocks();
});

