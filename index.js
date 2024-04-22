import puppeteer from "puppeteer";
import { writeFile } from 'node:fs/promises';
import { sleep } from "./utils.js";
import 'dotenv/config.js';

const AUTH = process.env.BRIGHT_DATA_AUTH;
const SBR_WS_ENDPOINT = `wss://${AUTH}@${process.env.BRIGHT_DATA_SBR_WS_ENDPOINT}`;
const browser = process.env.DEV
  ? await puppeteer.launch({
    headless: false,
    userDataDir: './user_data',
  })
  : await puppeteer.connect({ browserWSEndpoint: SBR_WS_ENDPOINT });

const page = await browser.newPage();
// Set screen size
await page.setViewport({width: 1280, height: 1373});

// Navigate the page to a URL
await page.goto('https://vuejobs.com/jobs', {
  timeout: 120000,
});

// click "remote" switch
await page.click('[role="switch"]');

// only filter full-time
await page.click('.n-base-selection-tags');
await page.click('.n-base-select-option');

// wait for list to be loaded
await sleep(5000);

// check all links and find the ones to detail pages
const allLinks = await page.$$('a');
const globalRemoteJobLinks = [];
for (const link of allLinks) {
  // must be job detail page
  const href = await link.evaluate((node) => node.getAttribute('href'));
  if (!href || !href.startsWith('/jobs/')) continue;

  const badgeIcons = await link.$$('img.h-3');
  const hasCountry = badgeIcons.some(async (badgeIcon) => {
    const alt = await badgeIcon.evaluate((node) => node.getAttribute('alt'));
    return alt.startsWith('Flag of ');
  });

  if (!hasCountry) {
    globalRemoteJobLinks.push(link);
  }
}

// fetch all job details
const jobDetails = [];
for (const link of globalRemoteJobLinks) {
  const href = await link.evaluate((node) => node.getAttribute('href'));
  const url = `https://vuejobs.com${href}`;
  const newPage = await browser.newPage();
  await newPage.setViewport({width: 1280, height: 1373});
  await newPage.goto(url, {
    timeout: 120000,
  });
  await newPage.waitForSelector('button.u-btn.px-6.text-lg[type="submit"]');

  // check timezones
  const timezone = await newPage.evaluate(() => {
    function findElementByContent(content) {
      content = content.toLowerCase();
      const elements = [document.body];
      let result;
      while (elements.length) {
        const element = elements.shift();

        const textContent = element.textContent.toLowerCase();
        if (!textContent.includes(content)) {
          continue;
        }

        result = element;
        if (element.children) {
          elements.push(...Array.from(element.children));
        }
      }
      return result;
    }
    const timezoneElement = findElementByContent('timezone');
    if (!timezoneElement) return;

    return timezoneElement.nextElementSibling.textContent;
  });

  const content = await newPage.evaluate(() => {
    const container = document.querySelector('.order-2.lg\\:order.lg\\:col-span-5');
    return container.innerHTML;
  });

  jobDetails.push({timezone, content});
  await newPage.close();
}

await writeFile('jobs.json', JSON.stringify(jobDetails, null, 2), 'utf8');


await browser.close();
