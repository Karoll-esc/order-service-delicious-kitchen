import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ReviewRepository, CreateReviewDTO } from '../../src/repositories/ReviewRepository';
import { Review, IReview } from '../../src/models/Review';

// Importante: Restaurar Mongoose real para estos tests (setup.ts lo mockea globalmente)
jest.unmock('mongoose');

type ReviewStatus = 'pending' | 'approved' | 'hidden';

describe('ReviewRepository - Unit Tests', () => {
  let mongoServer: MongoMemoryServer;
  let repository: ReviewRepository;

  beforeAll(async () => {
    // Create in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect to the in-memory database
    await mongoose.connect(mongoUri);

    repository = new ReviewRepository();
  });

  afterAll(async () => {
    // Cleanup: disconnect and stop the in-memory server
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clear all reviews after each test
    await Review.deleteMany({});
  });

  describe('create', () => {
    test('should create a review in database', async () => {
      const reviewData: CreateReviewDTO = {
        orderNumber: 'ORD-001',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5,
        comment: 'Great food!'
      };

      const result = await repository.create(reviewData);

      expect(result._id).toBeDefined();
      expect(result.orderNumber).toBe('ORD-001');
      expect(result.customerName).toBe('John Doe');
      expect(result.foodRating).toBe(5);
      expect(result.tasteRating).toBe(5);
      expect(result.comment).toBe('Great food!');
      expect(result.status).toBe('pending');
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    test('should create review without comment', async () => {
      const reviewData: CreateReviewDTO = {
        orderNumber: 'ORD-002',
        customerName: 'Jane Smith',
        customerEmail: 'jane@example.com',
        foodRating: 4,
        tasteRating: 5
      };

      const result = await repository.create(reviewData);

      expect(result._id).toBeDefined();
      expect(result.comment).toBe(''); // Default vacío del modelo
    });

    test('should create review without orderNumber (anonymous)', async () => {
      const reviewData: CreateReviewDTO = {
        customerName: 'Anonymous User',
        customerEmail: 'anon@example.com',
        foodRating: 5,
        tasteRating: 4
      };

      const result = await repository.create(reviewData);

      expect(result._id).toBeDefined();
      expect(result.orderNumber).toBe('N/A');
      expect(result.status).toBe('pending');
    });

    test('should enforce rating constraints', async () => {
      const invalidData: any = {
        orderNumber: 'ORD-003',
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        foodRating: 6, // Invalid: > 5
        tasteRating: 5
      };

      await expect(repository.create(invalidData))
        .rejects
        .toThrow();
    });

    test('should enforce required fields', async () => {
      const invalidData: any = {
        orderNumber: 'ORD-004',
        // Missing customerName
        customerEmail: 'test@example.com',
        foodRating: 5,
        tasteRating: 5
      };

      await expect(repository.create(invalidData))
        .rejects
        .toThrow();
    });
  });

  describe('findById', () => {
    test('should find review by id', async () => {
      const created = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const found = await repository.findById(created._id.toString());

      expect(found).toBeDefined();
      expect(found!._id.toString()).toBe(created._id.toString());
      expect(found!.orderNumber).toBe('ORD-001');
    });

    test('should return null when review not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const found = await repository.findById(fakeId);

      expect(found).toBeNull();
    });

    test('should handle invalid ObjectId format gracefully', async () => {
      const invalidId = 'not-a-valid-objectid';

      // Mongoose devuelve null para IDs inválidos en vez de lanzar error
      const result = await repository.findById(invalidId);
      expect(result).toBeNull();
    });

    test('should return review with all fields populated', async () => {
      const reviewData = {
        orderNumber: 'ORD-FULL',
        customerName: 'Full Data User',
        customerEmail: 'fulldata@example.com',
        foodRating: 4,
        tasteRating: 5,
        comment: 'Complete review with all fields'
      };

      const created = await repository.create(reviewData);
      const found = await repository.findById(created._id.toString());

      expect(found).toBeDefined();
      expect(found!.orderNumber).toBe(reviewData.orderNumber);
      expect(found!.customerName).toBe(reviewData.customerName);
      expect(found!.foodRating).toBe(reviewData.foodRating);
      expect(found!.tasteRating).toBe(reviewData.tasteRating);
      expect(found!.comment).toBe(reviewData.comment);
      expect(found!.status).toBe('pending');
      expect(found!.createdAt).toBeInstanceOf(Date);
      expect(found!.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('findApproved', () => {
    beforeEach(async () => {
      // Create test data with different statuses
      const review1 = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const review2 = await repository.create({
        orderNumber: 'ORD-002',
        customerName: 'Jane',
        customerEmail: 'jane@example.com',
        foodRating: 4,
        tasteRating: 4
      });

      const review3 = await repository.create({
        orderNumber: 'ORD-003',
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
        foodRating: 3,
        tasteRating: 3
      });

      // Approve first two reviews
      await repository.updateStatus(review1._id.toString(), 'approved');
      await repository.updateStatus(review2._id.toString(), 'approved');
      // Keep review3 as pending
    });

    test('should return only approved reviews', async () => {
      const results = await repository.findApproved(1, 10);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'approved')).toBe(true);
    });

    test('should order by createdAt descending (newest first)', async () => {
      const results = await repository.findApproved(1, 10);

      expect(results).toHaveLength(2);
      expect(results[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        results[1].createdAt.getTime()
      );
    });

    test('should handle pagination correctly', async () => {
      // Create 15 approved reviews
      for (let i = 4; i <= 18; i++) {
        const review = await repository.create({
          orderNumber: `ORD-${i.toString().padStart(3, '0')}`,
          customerName: `Customer ${i}`,
          customerEmail: `customer${i}@example.com`,
          foodRating: 5,
          tasteRating: 5
        });
        await repository.updateStatus(review._id.toString(), 'approved');
      }

      // Now we have 17 approved reviews total (2 from beforeEach + 15 new)

      // Test first page
      const page1 = await repository.findApproved(1, 10);
      expect(page1).toHaveLength(10);

      // Test second page
      const page2 = await repository.findApproved(2, 10);
      expect(page2).toHaveLength(7); // Remaining 7 reviews
    });

    test('should return empty array when no approved reviews', async () => {
      // Delete all reviews
      await Review.deleteMany({});

      // Create only pending reviews
      await repository.create({
        orderNumber: 'ORD-100',
        customerName: 'Test',
        customerEmail: 'test@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const results = await repository.findApproved(1, 10);
      expect(results).toHaveLength(0);
    });

    test('should handle page beyond available data', async () => {
      // Create only 3 approved reviews
      for (let i = 1; i <= 3; i++) {
        const review = await repository.create({
          orderNumber: `ORD-${i}`,
          customerName: `Customer ${i}`,
          customerEmail: `customer${i}@example.com`,
          foodRating: 5,
          tasteRating: 5
        });
        await repository.updateStatus(review._id.toString(), 'approved');
      }

      const results = await repository.findApproved(5, 10); // Page 5 doesn't exist
      expect(results).toHaveLength(0);
    });

    test('should exclude hidden reviews from results', async () => {
      // Limpiar datos del beforeEach para evitar contaminación
      await Review.deleteMany({});
      
      const review1 = await repository.create({
        orderNumber: 'ORD-APPROVED',
        customerName: 'Approved User',
        customerEmail: 'approved@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const review2 = await repository.create({
        orderNumber: 'ORD-HIDDEN',
        customerName: 'Hidden User',
        customerEmail: 'hidden@example.com',
        foodRating: 4,
        tasteRating: 4
      });

      await repository.updateStatus(review1._id.toString(), 'approved');
      await repository.updateStatus(review2._id.toString(), 'hidden');

      const results = await repository.findApproved(1, 10);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('approved');
      expect(results.find(r => r.status === 'hidden')).toBeUndefined();
    });
  });

  describe('findAll', () => {
    beforeEach(async () => {
      // Create reviews with different statuses
      const review1 = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const review2 = await repository.create({
        orderNumber: 'ORD-002',
        customerName: 'Jane',
        customerEmail: 'jane@example.com',
        foodRating: 4,
        tasteRating: 4
      });

      const review3 = await repository.create({
        orderNumber: 'ORD-003',
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
        foodRating: 3,
        tasteRating: 3
      });

      await repository.updateStatus(review1._id.toString(), 'approved');
      await repository.updateStatus(review2._id.toString(), 'hidden');
      // review3 stays pending
    });

    test('should return all reviews regardless of status', async () => {
      const results = await repository.findAll(1, 50);

      expect(results).toHaveLength(3);

      const statuses = results.map(r => r.status);
      expect(statuses).toContain('approved');
      expect(statuses).toContain('hidden');
      expect(statuses).toContain('pending');
    });

    test('should order by createdAt descending', async () => {
      const results = await repository.findAll(1, 50);

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          results[i + 1].createdAt.getTime()
        );
      }
    });

    test('should handle pagination', async () => {
      // Create more reviews
      for (let i = 4; i <= 60; i++) {
        await repository.create({
          orderNumber: `ORD-${i.toString().padStart(3, '0')}`,
          customerName: `Customer ${i}`,
          customerEmail: `customer${i}@example.com`,
          foodRating: 5,
          tasteRating: 5
        });
      }

      // Test pagination
      const page1 = await repository.findAll(1, 50);
      expect(page1).toHaveLength(50);

      const page2 = await repository.findAll(2, 50);
      expect(page2).toHaveLength(10); // 60 total - 50 on page 1 = 10 remaining
    });
  });

  describe('updateStatus', () => {
    test('should update review status to approved', async () => {
      const review = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const updated = await repository.updateStatus(
        review._id.toString(),
        'approved'
      );

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('approved');
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(
        review.createdAt.getTime()
      );
    });

    test('should update review status to hidden', async () => {
      const review = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const updated = await repository.updateStatus(
        review._id.toString(),
        'hidden'
      );

      expect(updated).toBeDefined();
      expect(updated!.status).toBe('hidden');
    });

    test('should return null when review not found', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      const updated = await repository.updateStatus(fakeId, 'approved');

      expect(updated).toBeNull();
    });
  });

  describe('countApproved', () => {
    test('should count only approved reviews', async () => {
      const review1 = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const review2 = await repository.create({
        orderNumber: 'ORD-002',
        customerName: 'Jane',
        customerEmail: 'jane@example.com',
        foodRating: 4,
        tasteRating: 4
      });

      await repository.create({
        orderNumber: 'ORD-003',
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
        foodRating: 3,
        tasteRating: 3
      });

      // Approve only first two
      await repository.updateStatus(review1._id.toString(), 'approved');
      await repository.updateStatus(review2._id.toString(), 'approved');

      const count = await repository.countApproved();
      expect(count).toBe(2);
    });

    test('should return 0 when no approved reviews', async () => {
      await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      const count = await repository.countApproved();
      expect(count).toBe(0);
    });
  });

  describe('countAll', () => {
    test('should count all reviews regardless of status', async () => {
      const review1 = await repository.create({
        orderNumber: 'ORD-001',
        customerName: 'John',
        customerEmail: 'john@example.com',
        foodRating: 5,
        tasteRating: 5
      });

      await repository.create({
        orderNumber: 'ORD-002',
        customerName: 'Jane',
        customerEmail: 'jane@example.com',
        foodRating: 4,
        tasteRating: 4
      });

      await repository.create({
        orderNumber: 'ORD-003',
        customerName: 'Bob',
        customerEmail: 'bob@example.com',
        foodRating: 3,
        tasteRating: 3
      });

      await repository.updateStatus(review1._id.toString(), 'approved');

      const count = await repository.countAll();
      expect(count).toBe(3);
    });
  });
});
