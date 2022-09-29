const puppeteer = require("./puppeteer-framework");

const main = async () => {
  await puppeteer.launch(
    {
      inputOrder: "sequential", //random or sequential
      inputRotate: "session", //iteration or session
      cluster: {
        // cluster options
        timeout: 120000, // timeout in ms
        //if the steps aren't finished in this time, it will close the browser
        puppeteerOptions: {
          headless: false,
          sloMo: 20,
          defaultViewport: null,
          args: ["--no-sandbox", "--window-size=1920,1080"],
        }, // puppeteer options },
      },
    },
    // async ({ browser, page, step, delay }) => {
    //   const user =
    //     credentials[getRandomNumberBetween(0, credentials.length - 1)];
    async ({ browser, page, step, delay, data }) => {
      const user = data;
      console.log(user);
      
      await step("1. Launch", async (page) => {
        await page.goto("https://www.wikipedia.org", {
          waitUntil: "networkidle2",
        });
      });

      await step("2. Click on English", async (page) => {
        await page.click("#js-link-box-en > strong", {
          waitUntil: "networkidle2",
        });
        
      });

      await step("3. Click on Contents", async (page) => {
        await page.click("#n-contents > a > span", {
          waitUntil: "networkidle2",
        });
        
      });

      await step("4. Click on Random Article", async (page) => {
        await page.click("#n-currentevents > a > span");
        await page.waitForSelector("mw-content-text")
      });
        

      await step("5. Click on Current Events", async (page) => {
        await page.click("#n-currentevents > a > span", {
          waitUntil: "networkidle2",
        });
        
      });

 
    }
  );
};

main();
