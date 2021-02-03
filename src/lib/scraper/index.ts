import { launch, Page } from "puppeteer";

interface ScrapeOutput {
  [index: number]: any;
}

interface Scrapable {
  scrape(page: Page): Promise<any>;
}

interface Stateful {
  state: any;
}

interface IScraper extends Scrapable, Stateful {
  output: ScrapeOutput;
}

interface ICrawler {
  page: Page;
  visit(url: string): Promise<any>;
}

interface HackerNewsEntry {
  author: any;
  link: any;
  title: any;
}

export class HackerNewsScraper implements IScraper {
  output: Array<HackerNewsEntry> = [];
  state: any = {};
  config: any = {};

  constructor(config: any, state: any) {
    this.state = state;
    this.config = config;
  }

  async scrape(page: Page): Promise<any> {
    const domElements = await page.$$(this.config.linkSelector);

    if (domElements.length > 0) {
      this.output = [
        ...this.output,
        ...await Promise.all(
          domElements.map(
            async (el) => await el.evaluate((el) => {
              let nextSiblingEl: any = el.closest('tr');

              do {
                nextSiblingEl = nextSiblingEl?.nextSibling;
              } while (nextSiblingEl && nextSiblingEl.nodeType !== 1);

              const author = nextSiblingEl?.querySelector('.hnuser')?.textContent;
              const entry: HackerNewsEntry = {
                link: el.getAttribute('href'),
                title: el.textContent,
                author
              }

              return entry;
            })
          )
        )
      ];
    }
    this.state.currentPage += 1;
  }
}

export class Crawler implements ICrawler {
  page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async visit(url: string): Promise<any> {
    this.page.goto(url);
    await this.page.waitForNavigation();
  }
}
(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  const viewPort = {
    width: 1280,
    height: 960
  };

  await page.setDefaultNavigationTimeout(0);
  await page.setViewport(viewPort);

  const scraper = new HackerNewsScraper(
    { maxPage: 10, linkSelector: ".storylink" },
    { currentPage: 1 }
  );
  const crawler = new Crawler(page);

  while (scraper.state.currentPage <= scraper.config.maxPage) {
    await crawler.visit(`https://news.ycombinator.com/news?p=${scraper.state.currentPage}`);
    await scraper.scrape(crawler.page);
  }

  console.log(scraper.output);
  browser.close();
})();
