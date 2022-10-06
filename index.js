const puppeteer = require("./puppeteer-framework");

const main = async () => {
  await puppeteer.launch(
    {
      inputOrder: "sequential", //random or sequential
      inputRotate: "session", //iteration or session
      uniqueSession: false, //true or false (default)
      cluster: {
        // cluster options
        timeout: 120000, // timeout in ms
        //if the steps aren't finished in this time, it will close the browser
        puppeteerOptions: {
          // headless: true,
          defaultViewport: null,
          args: ["--no-sandbox", "--window-size=1920,1080"],
        }, // puppeteer options },
      },
    },
    async ({ browser, page, step, delay, data }) => {
      const user = data;
      console.log(user);

      await step(
        "1. Launch",
        async (page) => {
          await page.goto("https://www.demoblaze.com/", {
            waitUntil: "networkidle2",
          });
        },
        {
          disableTracking: false,
        }
      );

      await puppeteer
        .expect(page)
        .toMatchElement("#tbodyid > div:nth-child(1) > div > div > h4 > a");

      await page.waitForSelector("#login2", {
        visible: true,
      });

      await page.click("#login2");
      await page.waitForSelector("#loginusername", {
        visible: true,
      });
      const button = await page.$("#loginusername");
      await button.evaluate((b) => b.click());
      await page.type("#loginusername", user.username);
      await page.type("#loginpassword", user.password);

      await step("2. Login", async (page) => {
        await page.waitForSelector('button[onclick="logIn()"]', {
          visible: true,
        });
        const button = await page.$('button[onclick="logIn()"]');
        await button.evaluate((b) => b.click());
        await page.waitForNavigation({
          waitUntil: "networkidle0",
        });
      });

      await page.waitForSelector("#logout2");

      await step("3. Logout", async (page) => {
        await page.click("#logout2");
      });
    }
  );
};

main();
