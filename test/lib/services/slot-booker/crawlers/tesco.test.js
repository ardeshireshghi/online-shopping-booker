jest.mock('puppeteer');

const puppeteer = require('puppeteer');

jest.mock('../../../../../src/lib/utils/wait', () => ({
  wait: jest.fn(()=> Promise.resolve())
}));

const { TescoBookingCrawler, Selectors, TESCO_LOGIN_URL } = require('../../../../../src/lib/services/slot-booker/crawlers/tesco');

const createMockBrowserPage = () => ({
  setDefaultNavigationTimeout() {},
  setViewport() {},
  waitForNavigation: jest.fn(() => Promise.resolve()),
  type: jest.fn(() => Promise.resolve()),
  goto: jest.fn(() => Promise.resolve()),
  reload: jest.fn(() => Promise.resolve()),
  screenshot: jest.fn(() => Promise.resolve()),
  url: jest.fn(() => ''),
  $: jest.fn(() => Promise.resolve({
    evaluate: jest.fn(() => Promise.resolve())
  })),
  $$: jest.fn(() => Promise.resolve([]))
});

describe('TescoBookingCrawler', () => {
  let mockBrowserPage;

  beforeEach(() => {
    mockBrowserPage = createMockBrowserPage();

    puppeteer.launch.mockResolvedValue({
      newPage: () => Promise.resolve(mockBrowserPage)
    });
  });

  it('should create a new crawler', () => {
    const crawler = new TescoBookingCrawler();
    expect(crawler).toBeInstanceOf(TescoBookingCrawler);
  });

  describe('#login', () => {
    it('should login user', async () => {
      const mockBrowser = await puppeteer.launch();

      const crawler = new TescoBookingCrawler({ browser: mockBrowser });
      await crawler.login();

      expect(mockBrowserPage.goto).toHaveBeenCalledWith(TESCO_LOGIN_URL);
      expect(mockBrowserPage.type).toHaveBeenCalledTimes(2);
    });
  });

  describe('#preBookingSteps', () => {
    it('should login user and go to delivery slot page', async () => {
      const mockBrowser = await puppeteer.launch();

      const crawler = new TescoBookingCrawler({ browser: mockBrowser });

      jest.spyOn(crawler, 'login');
      jest.spyOn(crawler, 'gotoDeliverySlotPage');

      await crawler.preBookingSteps();

      expect(crawler.login).toHaveBeenCalled();
      expect(crawler.gotoDeliverySlotPage).toHaveBeenCalled();
    });
  });

  describe('#bookDeliverySlot', () => {
    let crawler;

    beforeEach(async () => {
      const mockBrowser = await puppeteer.launch();
      crawler = new TescoBookingCrawler({ browser: mockBrowser });
    });

    it('should check the page for available booking slots', async () => {
      await crawler.bookDeliverySlot();
      expect(mockBrowserPage.$$).toHaveBeenCalledWith(Selectors.AVAILABLE_SLOT);
    });

    it('should reload the page before checking for available booking slots', async () => {
      await crawler.bookDeliverySlot();
      expect(mockBrowserPage.reload).toHaveBeenCalled();
    });

    describe('when available slot is found', () => {
      let submitClickSpy;

      beforeEach(async () => {
        submitClickSpy = jest.fn(() => Promise.resolve());
        mockBrowserPage.$$.mockImplementationOnce(() => Promise.resolve([
          {
            evaluate: jest.fn(() => Promise.resolve()),
            $: () => Promise.resolve({ click: submitClickSpy })
          }
        ]));

        await crawler.bookDeliverySlot();
      });

      it('should make booking', async () => {
        expect(submitClickSpy).toHaveBeenCalled();
      });

      it('should take screenshot', async () => {
        expect(mockBrowserPage.screenshot).toHaveBeenCalled();
      });
    });
  });
});
