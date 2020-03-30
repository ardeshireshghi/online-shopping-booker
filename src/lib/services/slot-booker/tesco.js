const puppeteer = require('puppeteer');
const path = require('path');

require('lazy-console-emojis/src/console');
require('dotenv').config();

const player = require('../../audio/player');

const TESCO_LOGIN_URL = 'https://secure.tesco.com/account/en-GB/login';
const TESCO_DELIVERY_SLOT_URL = 'https://www.tesco.com/groceries/en-GB/slots/delivery/';
const BOOKING_MAX_RETRIES = 1000;
const BOOKING_ATTEMPTS_DELAY_SECOND_RANGE = [5, 15];

const Selectors = {
  LOGIN_FORM: '#sign-in-form',
  USERNAME: '[name="username"]',
  PASSWORD: '[name="password"]',
  AVAILABLE_SLOT: '.slot-grid--item.available',
  BOOKED_SLOT: '.slot-grid--item.booked',
  SLOT_WEEKLY_TAB: '.slot-selector--week-tabheader'
};

const slotGroups = {
  fixed: 1,
  flex: 4
};

const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

const createPage = async browser => {
  const page = await browser.newPage();
  const viewPort = {
    width: 1280,
    height: 960
  };

  await page.setDefaultNavigationTimeout(0);
  await page.setViewport(viewPort);

  return page;
};

const login = async (page, { username, password }) => {
  page.goto(TESCO_LOGIN_URL);

  await page.waitForNavigation();

  const loginForm = await page.$(Selectors.LOGIN_FORM);

  await page.type(Selectors.USERNAME, username);
  await page.type(Selectors.PASSWORD, password);
  await loginForm.evaluate(form => form.submit());

  await page.waitForNavigation();
};

const bookSlotIfAvailable = async (page) => {
  const allAvailableSlots = await page.$$(Selectors.AVAILABLE_SLOT);
  const lastAvailableSlot = allAvailableSlots[allAvailableSlots.length - 1];

  if (lastAvailableSlot) {
    const booking = await lastAvailableSlot.evaluate(el => el.textContent);
    console.log(await lastAvailableSlot.evaluate(el => el.innerHTML));

    const slotFormSubmitBtn = await lastAvailableSlot.$('[type="submit"]');
    await slotFormSubmitBtn.click();

    await wait(5);

    await page.screenshot({
      path: `./screenshots/booking-${Date.now()}.png`,
      fullPage: true
    });

    return {
      booking
    };
  }

  console.disappointed('No available slots found yet!');

  return {
    booking: null
  };
};

const gotoSlotPageLastTab = async (page) => {
  const slotGroup = slotGroups[process.env.SLOT_TYPE];
  const twoWeeksToday = new Date();

  // plust 15 instead of 14 to make sure mid-night date change is fine
  twoWeeksToday.setDate(twoWeeksToday.getDate() + 15);
  const formattedTwoWeeksToday = twoWeeksToday.toISOString().split('T')[0];
  await page.goto(TESCO_DELIVERY_SLOT_URL + formattedTwoWeeksToday + `?slotGroup=${slotGroup}`);
};

const loginAndGotoBookingSlotPage = async (page) => {
  await login(page, {
    username: process.env.TESCO_USERNAME,
    password: process.env.TESCO_PASSWORD
  });

  await gotoSlotPageLastTab(page);
};

const attemptBooking = async (page) => {
  await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });

  if (page.url().includes(TESCO_LOGIN_URL)) {
    await loginAndGotoBookingSlotPage(page);
  }

  const { booking } = await bookSlotIfAvailable(page);
  return booking;
};

const randomWaitWithinRange = (min, max) => {
  return (Math.random() * (max - min) + min);
};
const startBookingLoop = async (page) => {
  const [minSeconds, maxSeconds] = BOOKING_ATTEMPTS_DELAY_SECOND_RANGE;
  let retries = 0;
  let currentPage = page;
  let booking;

  while(retries < BOOKING_MAX_RETRIES) {
    console.pizza('This is attempt #', retries);

    try {
      booking = await attemptBooking(currentPage);
    } catch(err) {
      const screenshotFile = `error-${Date.now()}.png`;
      await page.screenshot({
        path: `./screenshots/${screenshotFile}`,
        fullPage: true
      });

      if (err.message.includes('Execution context was destroyed')) {
        console.log('Came across wierd error, recovering', currentPage.url());

        const browser = await puppeteer.launch();
        const page = await createPage(browser);
        currentPage = page;

        await loginAndGotoBookingSlotPage(currentPage);
      } else {
        throw err;
      }
    }

    if (booking) {
      break;
    }

    const waitingSeconds = randomWaitWithinRange(minSeconds, maxSeconds);
    console.hourglass_flowing_sand(`Waiting ${waitingSeconds} seconds before trying again`);
    await wait(waitingSeconds);

    if (retries % 5 === 0) {
      await currentPage.screenshot({
        path: `./screenshots/info-${Date.now()}.png`,
        fullPage: true
      });
    }

    retries++;
  }

  return booking;
};

(async () => {
  const startTime = Date.now();
  const browser = await puppeteer.launch();
  const page = await createPage(browser);

  await loginAndGotoBookingSlotPage(page);

  const alreadyBookedSlot = await page.$(Selectors.BOOKED_SLOT);

  if (alreadyBookedSlot) {
    console.truck('You already have a booked slot, Details:', await alreadyBookedSlot.evaluate(el => el.textContent));
    await browser.close();
    return;
  }

  try {
    const booking = await startBookingLoop(page);

    if (booking) {
      console.baguette_bread('Available slot found! Booking now. Details:', booking);
      await player.play(path.resolve(__dirname, '../..', 'audio', 'media', 'rooster.mp3'), {repeat: 6});
    } else {
      console.red_circle(`Tried booking a slot for ${((Date.now() - startTime) / 1000 / 3600).toFixed(2)} hours. No available slots!`);
    }
  } catch(err) {
    const screenshotFile = `error-${Date.now()}.png`;

    await page.screenshot({
      path: `./screenshots/${screenshotFile}`,
      fullPage: true
    });

    console.error('Saving screenshot to:', screenshotFile);
   } finally {
    await browser.close();
  }
})();
