const BookingManager = require('../../../../src/lib/services/slot-booker/booking-manager');

jest.mock('../../../../src/lib/utils/wait', () => ({
  wait: jest.fn(()=> Promise.resolve())
}));

const createBookingCrawlerMock = () => ({
  preBookingSteps: jest.fn(() => Promise.resolve()),
  checkHasBookedSlot: jest.fn(() => Promise.resolve()),
  bookDeliverySlot: jest.fn(() => Promise.resolve({
    booking: 'some booking detail'
  }))
});

describe('BookingManager', () => {
  it('should create a new manager', () => {
    const manager = new BookingManager();
    expect(manager).toBeInstanceOf(BookingManager);
  });

  describe('#bookSlot', () => {
    it('should make booking by calling the crawler', async () => {
      const bookingCrawlerMock = createBookingCrawlerMock();

      const manager = new BookingManager({
        bookingCrawler: bookingCrawlerMock
      });

      await manager.bookSlot();
      expect(bookingCrawlerMock.bookDeliverySlot).toHaveBeenCalled();
    });

    it('should call prepare', async () => {
      const bookingCrawlerMock = createBookingCrawlerMock();
      const manager = new BookingManager({
        bookingCrawler: bookingCrawlerMock
      });

      jest.spyOn(manager, 'prepare');
      await manager.bookSlot();

      expect(manager.prepare).toHaveBeenCalled();
    });

    describe('when booking a slot fails initially', () => {
      let manager;
      let bookingCrawlerMock;
      let result;

      describe('and it succeeds after some retries', () => {
        beforeEach(async () => {
          bookingCrawlerMock = createBookingCrawlerMock();

          bookingCrawlerMock.bookDeliverySlot.mockImplementationOnce(() => Promise.resolve(null));
          bookingCrawlerMock.bookDeliverySlot.mockImplementationOnce(() => Promise.resolve(null));
          bookingCrawlerMock.bookDeliverySlot.mockImplementationOnce(() => Promise.resolve({
            booking: 'some booking detail'
          }));

          manager = new BookingManager({
            bookingCrawler: bookingCrawlerMock
          });

          result = await manager.bookSlot();
        });

        it('should retry until it gets a booking', () => {
          expect(bookingCrawlerMock.bookDeliverySlot).toHaveBeenCalledTimes(3);
        });

        it('eventually gets a booking', () => {
          expect(result).toEqual({
            booking: 'some booking detail'
          });
        });
      });
    });

    describe('and it reaches MAX retries', () => {
      beforeEach(async () => {
        bookingCrawlerMock = createBookingCrawlerMock();
        bookingCrawlerMock.bookDeliverySlot
          .mockImplementation(() => Promise.resolve(null));

        manager = new BookingManager({
          bookingCrawler: bookingCrawlerMock
        });

        await manager.bookSlot({ maxRetries: 10 });
      });

      it('should retry up to the retry threshold', () => {
        expect(bookingCrawlerMock.bookDeliverySlot).toHaveBeenCalledTimes(10);
      });
    });
  });
});
