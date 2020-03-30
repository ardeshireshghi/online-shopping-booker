const path = require('path');
const puppeteer = require('puppeteer');

require('lazy-console-emojis/src/console');
require('dotenv').config();

const BookingManager = require('./booking-manager');
const { TescoBookingCrawler } = require('./crawlers/tesco');
const audioPlayer = require('../../audio/player');

const creds = {
  username: process.env.TESCO_USERNAME,
  password: process.env.TESCO_PASSWORD
}

const startBooking = async (page) => {
  const bookingManager = new BookingManager({
    bookingCrawler: new TescoBookingCrawler({
      browser: await puppeteer.launch(),
      creds
    })
  });

  const booking = await bookingManager.bookSlot();
  return booking;
};

(async () => {
  const startTime = Date.now();

  try {
    const booking = await startBooking();

    if (booking) {
      console.baguette_bread('Available slot found! Booking now. Details:', booking);
      await audioPlayer.play(path.resolve(__dirname, '../..', 'audio', 'media', 'rooster.mp3'), {repeat: 6});
    } else {
      console.red_circle(`Tried booking a slot for ${((Date.now() - startTime) / 1000 / 3600).toFixed(2)} hours. No available slots!`);
    }
  } catch(err) {
    const screenshotFile = `error-${Date.now()}.png`;

    await bookingManager.crawler.takeScreenshot({
      path: `./screenshots/${screenshotFile}`,
      fullPage: true
    });

    console.error('Saving screenshot to:', screenshotFile);
  } finally {
    await browser.close();
  }
})();
