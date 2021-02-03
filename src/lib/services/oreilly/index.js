const puppeteer = require('puppeteer');
const http = require('http');
const { promises: fs } = require('fs');
const { createReadStream } = require('fs');

require('lazy-console-emojis/src/console');
require('dotenv').config();

const { OreillyBookCrawler } = require('./crawlers/oreilly');

const books = require('../../../../books.json');

class Book {
  constructor({ name, key, template, content }) {
    this.name = name;
    this.key = key;
    this.template = template;
    this.content = content;
  }
}

const creds = {
  username: process.env.OREILLY_USERNAME,
  password: process.env.OREILLY_PASSWORD
};

const createPage = async (browser) => {
  const page = await browser.newPage();
  const viewPort = {
    width: 1280,
    height: 960
  };

  await page.setDefaultNavigationTimeout(0);
  await page.setViewport(viewPort);

  return page;
};

const startWebServer = async () => {
  const server = http.createServer((req, res) => {
    const bookKey = req.url.slice(1);

    const readStream = createReadStream(
      `./tmp/${bookKey.replace(/\//g, '-')}.html`
    );
    res.setHeader('Content-Type', 'text/html');
    readStream.pipe(res);
  });

  await new Promise((resolve) => {
    server.listen(0, () => {
      console.log('Listening to incoming requests', server.address().port);
      resolve();
    });
  });

  return server;
};

const createPdfBook = async ({ browser, serverPort, scrapedBook }) => {
  const page = await createPage(browser);

  await page.goto(`http://localhost:${serverPort}/${scrapedBook.key}`, {
    waitUntil: 'networkidle0'
  });

  await page.emulateMedia('screen');

  const pdf = await page.pdf({
    printBackground: true,
    width: 900
  });

  const outputPdfFile = `./pdfs/${scrapedBook.name
    .toLowerCase()
    .replace(/\s/g, '-')}.pdf`;

  await fs.writeFile(outputPdfFile, pdf);
  console.log('\nPDF book generated', scrapedBook.name);

  await page.close();
};

const scrapeBooks = async ({ browser, books, server }) => {
  const oreillyCrawler = new OreillyBookCrawler({
    browser,
    creds
  });

  await oreillyCrawler.preScrapeSteps();

  await Promise.all(
    books.map(async (book) => {
      console.log('Scraping book with key:', book.key);

      const crawler = new OreillyBookCrawler({
        browser,
        creds,
        bookKey: book.key
      });

      const scrapedBookData = await crawler.scrapeBook();

      console.log('Called complete handler for book', book.key);
      const scrapedBook = new Book({
        ...book,
        ...scrapedBookData
      });

      console.log('\nWriting HTML book', scrapedBook.name);
      await fs.writeFile(
        `./tmp/${scrapedBook.key.replace(/\//, '-')}.html`,
        scrapedBook.template.replace(
          '{{content}}',
          Buffer.concat(scrapedBook.content).toString()
        )
      );

      await createPdfBook({
        browser,
        scrapedBook,
        serverPort: server.address().port
      });
    })
  );
};

(async () => {
  let server;
  let browser = await puppeteer.launch({ headless: true });

  try {
    server = await startWebServer();
    await scrapeBooks({ browser, server, books });

    // await fs.rmdir('./tmp', { recursive: true });
  } catch (err) {
    console.error(err);
  } finally {
    await browser.close();
    server.close();
  }
})();
