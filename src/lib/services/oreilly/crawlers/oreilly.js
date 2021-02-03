require('lazy-console-emojis/src/console');

const { EventEmitter } = require('events');
const { wait } = require('../../../utils/wait');

const OREILLY_LOGIN_URL = 'https://www.oreilly.com/member/login';
const OREILLY_BASE_URL = 'https://learning.oreilly.com/library/view';

const Selectors = {
  LOGIN_FORM: '[data-testid="authForm"]',
  USERNAME: '[name="email"]',
  PASSWORD: '[name="password"]',
  LOGIN_SUBMIT: '.orm-Button-root',
  CHAPTER: '#sbo-rt-content',
  FIRST_PAGE: '.detail-toc > li > a',
  NEXT_PAGE_LINK: '.next.nav-link'
};

const MAX_PAGE_CHANGE_CHECK_RETRY = 20;

const createPage = async (browser) => {
  const page = await browser.newPage();
  const viewPort = {
    width: 1500,
    height: 960
  };

  await page.setDefaultNavigationTimeout(0);
  await page.setViewport(viewPort);

  return page;
};

class OreillyBookCrawler extends EventEmitter {
  constructor({ browser, creds, bookKey } = {}) {
    super();

    this.browser = browser;
    this.creds = creds;
    this.bookKey = bookKey;
  }

  static get loginUrl() {
    return OREILLY_LOGIN_URL;
  }

  static get bookBaseUrl() {
    return OREILLY_BASE_URL;
  }

  async preScrapeSteps() {
    await this.login(this.creds);
    await wait(1);
  }

  async scrapeBook() {
    await this.gotoFirstPage();
    const bookContent = [];

    let page = await this.page();
    let title = await page.evaluate(() => document.title);

    try {
      while (true) {
        page = await this.page();
        await page.waitForSelector(Selectors.CHAPTER);
        const chapterHTML = await page.$eval(
          Selectors.CHAPTER,
          (el) => el.innerHTML
        );
        const strippedHTML = chapterHTML
          .replace(/\{\{/g, '')
          .replace(/’/g, "'");

        bookContent.push(Buffer.from(strippedHTML));
        console.log(
          `Adding section with title "${title}" from book: ${this.bookKey}`
        );

        try {
          let newTitle;

          if ((await page.$$(Selectors.NEXT_PAGE_LINK)).length === 0) {
            break;
          }

          await page.$eval(Selectors.NEXT_PAGE_LINK, (el) => el.click());

          // Check if title has changed
          // TODO: Find a better way of knowing new page is loaded
          let retries = 0;

          while (
            (newTitle = await page.evaluate(() => document.title)) === title &&
            newTitle !== '' &&
            retries < MAX_PAGE_CHANGE_CHECK_RETRY
          ) {
            retries += 1;
            console.log('Retry', retries);
            await wait(0.1);
          }

          title = newTitle;
        } catch (err) {
          console.log('Error going to next chapter link', err);
          break;
        }
      }

      console.log(`\nScraping book "${this.bookKey}" Completed`);
      const scrapedBook = {
        template: await this._createHTMLTemplate(),
        content: bookContent
      };

      this.emit('complete', scrapedBook);
      return scrapedBook;
    } catch (err) {
      console.error('Crawler Error attempting to scrape book', err, page.url());
      throw err;
    }
  }

  async gotoFirstPage() {
    const page = await this.page();

    await this.gotoBookHomePage();
    await page.waitForSelector(Selectors.FIRST_PAGE);
    await page.$eval(Selectors.FIRST_PAGE, (el) => el.click());
    await wait(1);
  }

  async gotoBookHomePage() {
    const page = await this.page();
    await page.goto(this.bookUrl);
  }

  async login({ username, password } = {}) {
    const page = await this.page();
    page.goto(OREILLY_LOGIN_URL);

    await page.waitForNavigation();
    const loginButton = await page.$(Selectors.LOGIN_SUBMIT);

    await page.type(Selectors.USERNAME, username);
    await page.$eval(Selectors.USERNAME, (e) => e.blur());
    await wait(1);

    await page.type(Selectors.PASSWORD, password);
    await page.$eval(Selectors.USERNAME, (e) => e.blur());
    await wait(1);

    await loginButton.evaluate((el) => el.click());

    await page.waitForNavigation();
  }

  async takeScreenshot({ path, fullPage }) {
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
    return page.url().includes(OREILLY_BASE_URL);
  }

  get bookUrl() {
    return `${OreillyBookCrawler.bookBaseUrl}/${this.bookKey}/`;
  }

  async _createHTMLTemplate() {
    const page = await this.page();
    const metaTags = await page.evaluate(() =>
      [...document.querySelectorAll('meta')]
        .map((el) => el.outerHTML)
        .join('\n')
    );
    const linkTags = await page.evaluate(() =>
      [...document.querySelectorAll('link')]
        .map((el) => el.outerHTML)
        .join('\n')
    );
    const bodyClassName = await page.evaluate(() => document.body.className);

    return `
<!DOCTYPE html>
<html>
<head>
<base href="https://learning.oreilly.com/">
${metaTags}
${linkTags}
</head>
<body class="${bodyClassName}">
  <div id="sbo-rt-content">
    {{content}}
  </div>
<body>
</html>`;
  }
}

module.exports = {
  OreillyBookCrawler
};
