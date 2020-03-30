require('lazy-console-emojis/src/console');

const { wait } = require('../../../utils/wait');

const TESCO_LOGIN_URL = 'https://secure.tesco.com/account/en-GB/login';
const TESCO_DELIVERY_SLOT_URL = 'https://www.tesco.com/groceries/en-GB/slots/delivery/';

const Selectors = {
  LOGIN_FORM: '#sign-in-form',
  USERNAME: '[name="username"]',
  PASSWORD: '[name="password"]',
  AVAILABLE_SLOT: '.slot-grid--item.available',
  BOOKED_SLOT: '.slot-grid--item.booked',
  SLOT_WEEKLY_TAB: '.slot-selector--week-tabheader',
  SLOT_ITEM_SUBMIT_BTN: '[type="submit"]'
};

const twoWeeksLaterDateFormatted = (date = new Date()) => {
  date.setDate(date.getDate() + 15);
  return date.toISOString().split('T')[0];
};

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

const slotGroups = {
  fixed: 1,
  flex: 4
};

class TescoBookingCrawler {
  constructor({ browser, creds } = {}) {
    this.browser = browser;
    this.creds = creds;
  }

  async checkHasBookedSlot() {
    const page = await this.page();
    const alreadyBookedSlot = await page.$(Selectors.BOOKED_SLOT);

    if (alreadyBookedSlot) {
      const details = await alreadyBookedSlot.evaluate(el => el.textContent);
      console.truck('You already have a booked slot, Details:', details);
      await this.browser.close();
    }
  }
  async preBookingSteps() {
    await this.login(this.creds);
    await this.gotoDeliverySlotPage();
  }

  async bookDeliverySlot() {
    let booking;

    try {
      const page = await this.page();
      await page.reload({ waitUntil: ['networkidle0', 'domcontentloaded'] });

      if (this.isLoginPage(page)) {
        await this.preBookingSteps();
      }

      const allAvailableSlots = await page.$$(Selectors.AVAILABLE_SLOT);
      const lastAvailableSlot = allAvailableSlots[allAvailableSlots.length - 1];

      if (!lastAvailableSlot) {
        console.disappointed('No available slots found yet!');
        return null;
      }

      booking = await lastAvailableSlot.evaluate(el => el.textContent);
      const slotFormSubmitBtn = await lastAvailableSlot.$(Selectors.SLOT_ITEM_SUBMIT_BTN);

      await slotFormSubmitBtn.click();
      await wait(10);

      await this.takeScreenshot({
        path: `./screenshots/booking-${Date.now()}.png`,
        fullPage: true
      });

      return booking;
    } catch(err) {
      console.error('Crawler Error attempting to book a slot', err, page.url());
      throw err;
    }
  }

  async gotoDeliverySlotPage() {
    (await this.page()).goto(this.deliverySlotFullUrlBySlotType(process.env.SLOT_TYPE));
  }

  async login({username, password} = {}) {
    const page = await this.page();
    page.goto(TESCO_LOGIN_URL);

    await page.waitForNavigation();

    const loginForm = await page.$(Selectors.LOGIN_FORM);

    await page.type(Selectors.USERNAME, username);
    await page.type(Selectors.PASSWORD, password);
    await loginForm.evaluate(form => form.submit());

    await page.waitForNavigation();
  }

  async takeScreenshot({path, fullPage}) {
    const page = await this.page();

    await page.screenshot({
      path,
      fullPage
    });
  }

  async page() {
    if (!this._page) {
      this._page = await createPage(this.browser);
    }
    return this._page;
  }

  isLoginPage(page) {
    return page.url().includes(TESCO_LOGIN_URL);
  }

  deliverySlotFullUrlBySlotType(slotType) {
    const slotGroup = slotGroups[slotType];
    return `${TescoBookingCrawler.deliverySlotBaseUrl}${twoWeeksLaterDateFormatted()}?slotGroup=${slotGroup}`
  }

  static get loginUrl() {
    return TESCO_LOGIN_URL;
  }

  static get deliverySlotBaseUrl() {
    return TESCO_DELIVERY_SLOT_URL;
  }
}

module.exports = {
  TescoBookingCrawler,
  Selectors,
  TESCO_LOGIN_URL
};
