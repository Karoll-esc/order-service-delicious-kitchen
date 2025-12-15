// Mock del cliente RabbitMQ
export const rabbitMQClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  publishEvent: jest.fn().mockResolvedValue(true),
  consumeEvent: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  isConnected: jest.fn().mockReturnValue(true)
};

