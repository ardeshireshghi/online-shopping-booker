const puppeteer = require('puppeteer');
const path = require('path');

require('lazy-console-emojis/src/console');
require('dotenv').config();

const player = require('../../audio/player');

const TESCO_LOGIN_URL = 'https://secure.tesco.com/account/en-GB/login';
const TESCO_DELIVERY_SLOT_URL = 'https://www.tesco.com/groceries/en-GB/slots/delivery/';
const BOOKING_MAX_RETRIES = 1000;
const BOOKING_ATTEMPTS_DELAY_SECOND_RANGE = [20, 60];

const Selectors = {
  LOGIN_FORM: '#sign-in-form',
  USERNAME: '[name="username"]',
  PASSWORD: '[name="password"]',
  AVAILABLE_SLOT: '.slot-grid--item.available',
  BOOKED_SLOT: '.slot-grid--item.booked',
  SLOT_WEEKLY_TAB: '.slot-selector--week-tabheader'
};

const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000));

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
  const twoWeeksToday = new Date(Date.now() + 12096e5);
  const formattedTwoWeeksToday = twoWeeksToday.toISOString().split('T')[0];
  await page.goto(TESCO_DELIVERY_SLOT_URL + formattedTwoWeeksToday + '?slotGroup=4');

  //const slotTabs = await page.$$(Selectors.SLOT_WEEKLY_TAB);
  //const lastSlotTabLink = await slotTabs[slotTabs.length - 1].$('a');

  //console.info('Looking at the last date and time range: %s', await lastSlotTabLink.evaluate(link => link.textContent));
  //await lastSlotTabLink.click();
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

  const { booking } = await bookSlotIfAvailable(page);
  return booking;
};

const randomWaitWithinRange = (min, max) => {
  return (Math.random() * (max - min) + min);
};
const startBookingLoop = async (page) => {
  const [minSeconds, maxSeconds] = BOOKING_ATTEMPTS_DELAY_SECOND_RANGE;
  let retries = 0;
  let booking;

  while(retries < BOOKING_MAX_RETRIES) {
    if (page.url().includes(TESCO_LOGIN_URL)) {
      await loginAndGotoBookingSlotPage(page);
    }

    console.pizza('This is attempt #', retries);
    booking = await attemptBooking(page);

    if (booking) {
      break;
    }

    const waitingSeconds = randomWaitWithinRange(minSeconds, maxSeconds);
    console.hourglass_flowing_sand(`Waiting ${waitingSeconds} seconds before trying again`);
    await wait(waitingSeconds);
    retries++;
  }

  return booking;
};

(async () => {
  const startTime = Date.now();
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

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
    console.err('There was an error booking a slot', err);
  } finally {
    await browser.close();
  }
})();
