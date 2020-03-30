require('lazy-console-emojis/src/console');

const DELAY_SECOND_RANGE = [5, 15];
const DEFAULT_RETRIES = 1000;

const { wait } = require('../../utils/wait');

const randomWithinRange = (min, max) => {
  return (Math.random() * (max - min) + min);
};

class BookingManager {
  constructor({ bookingCrawler } = {}) {
    this.bookingCrawler = bookingCrawler;
  }

  async bookSlot({ maxRetries = DEFAULT_RETRIES } = {}) {
    const [ minWaitSeconds, maxWaitSeconds ] = DELAY_SECOND_RANGE;
    let retries = 0;
    let booking;

    await this.bookingCrawler.checkHasBookedSlot();
    await this.prepare();

    while (!booking && retries < maxRetries) {
      const waitingSeconds = randomWithinRange(minWaitSeconds, maxWaitSeconds);
      console.pizza('This is attempt #', retries);

      booking = await this.attemptBooking();

      console.hourglass_flowing_sand(`Waiting ${waitingSeconds} seconds before trying again`);
      await wait(waitingSeconds);

      retries++;
    }

    return booking;
  }

  async prepare() {
    await this.bookingCrawler.preBookingSteps();
  }

  async attemptBooking() {
    const booking = await this.bookingCrawler.bookDeliverySlot();
    return booking;
  }
};

module.exports = BookingManager;
