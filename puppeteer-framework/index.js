const { Cluster } = require("puppeteer-cluster");
const fs = require("fs");
const axios = require("axios");

let rawdata = fs.readFileSync("input.json");
let inputData = JSON.parse(rawdata);

let apiPayloadRaw = fs.readFileSync("api_payload.json");
let apiPayload = JSON.parse(apiPayloadRaw);

function getRandomNumberBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

const getDate = () => {
  return new Date()
    .toLocaleString("en-US", {
      hour12: false,
    })
    .replace(/\//g, "-")
    .replace(",", "");
};

const main = async (
  currentRestart,
  parentLogsFolder,
  options,
  getOptions,
  log,
  callback
) => {
  let steps = [];

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    ...getOptions(options).cluster,
    maxConcurrency: getOptions(options).sessions,
  });

  let stop = false;

  // Event handler to be called in case of problems
  cluster.on("taskerror", (err, data) => {
    if (!stop) log(`${getDate()}: ${err.stack}`, data.iteration);
  });

  await cluster.task(async ({ page, data }) => {
    const delay = async (milliseconds) => {
      await new Promise((resolve) => setTimeout(resolve, milliseconds));
    };

    const browser = page.browser();
    const pagesArray = await browser.pages();
    const page2 = pagesArray[0];

    await pagesArray[1].close();

    await callback({
      data:
        options.inputOrder === "random"
          ? inputData[getRandomNumberBetween(0, inputData.length - 1)]
          : inputData[
              options.inputRotate === "iteration"
                ? data.iteration - 1
                : data.session - 1
            ],
      page: page2,
      step: async (
        title,
        callback,
        options = {
          disableTracking: false,
          disableScreenshot: false,
          disableLogs: false,
        }
      ) => {
        let failed = false;

        const start = new Date().getTime();
        if (!options.disableLogs)
          log(`${getDate()}: Step: ${title} started`, data.iteration);
        if (!options.disableScreenshot) {
          try {
            await page2.screenshot({
              path: `${parentLogsFolder}/Iteration ${data.iteration}/Session ${data.session} - Step ${title}.png`,
            });
          } catch (error) {}
        }

        try {
          await callback(page2);
        } catch (error) {
          log(`${getDate()}: Step: ${title} failed`, data.iteration);
          log(`${getDate()}: ${error.stack}`, data.iteration);
          failed = true;
        }

        if (!options.disableScreenshot) {
          try {
            fs.unlinkSync(
              `${parentLogsFolder}/Iteration ${data.iteration}/Session ${data.session} - Step ${title}.png`,
              { recursive: true }
            );
          } catch (error) {}
        }
        if (!options.disableLogs && !failed)
          log(
            `${getDate()}: Step: ${title} successfully completed`,
            data.iteration
          );
        const end = new Date().getTime();
        const time = end - start;
        if (!options.disableTracking)
          steps.push({
            title,
            time,
            noSuccess: failed ? 0 : 1,
            noFailed: failed ? 1 : 0,
          });
      },
      delay: delay,
      browser: browser,
    });
    let pace = getOptions(options).pace;
    if (pace) await new Promise((resolve) => setTimeout(resolve, pace));
  });

  let { sessions, loops } = getOptions(options);

  loops = options.uniqueSession ? 1 : loops;

  let time = getOptions(options).time;

  if (time) {
    let interval = setInterval(async () => {
      if (time <= 0) {
        stop = true;
        clearInterval(interval);
        await cluster.close();
        return;
      }
      time -= 1000;
    }, 1000);

    let l = 0;
    while (!stop) {
      l++;
      let currentIteration = options.uniqueSession ? currentRestart + 1 : l;

      log(`Iteration #${currentIteration} is running...`, currentIteration);
      for (let s = 0; s < sessions; s++) {
        if (currentIteration === 1) {
          let rampUp = getOptions(options).rampUp;
          await new Promise((resolve) =>
            setTimeout(resolve, rampUp / getOptions(options).sessions)
          );
        }

        log(`Session #${s + 1} is running...`, currentIteration);
        await cluster.queue({
          iteration: currentIteration,
          session: s + 1,
        });
      }
      await cluster.idle();
    }
  } else {
    for (let l = 0; l < loops; l++) {
      let currentIteration = options.uniqueSession ? currentRestart + 1 : l + 1;

      log(`Iteration #${currentIteration} is running...`, currentIteration);
      for (let s = 0; s < sessions; s++) {
        if (currentIteration === 1) {
          let rampUp = getOptions(options).rampUp;
          await new Promise((resolve) =>
            setTimeout(resolve, rampUp / getOptions(options).sessions)
          );
        }

        log(`Session #${s + 1} is running...`, currentIteration);
        await cluster.queue({
          iteration: currentIteration,
          session: s + 1,
        });
      }
      await cluster.idle();
    }
  }

  await cluster.close();

  return steps;
};

module.exports = {
  launch: async (options, callback) => {
    console.log(`Script started at: ${getDate()}`);

    let startDate = new Date();
    let parentLogsFolder = "";
    parentLogsFolder = `Report ${getDate().replace(/:/g, ".")}`;

    fs.mkdirSync(parentLogsFolder);

    const getOptions = (options) => {
      let loops = 1;
      let sessions = 1;
      let time;
      let pace = 0;
      let rampUp = 0;
      let apiCall = false;

      process.argv.slice(2).forEach(function (val, index, array) {
        if (val === "-i") {
          loops = array[index + 1];
          if (!loops || typeof parseInt(loops) !== "number") {
            throw new Error("Invalid loop amount");
          }
        }

        if (val === "-s") {
          sessions = array[index + 1];
          if (!sessions || typeof parseInt(sessions) !== "number") {
            throw new Error("Invalid session amount");
          }
        }

        if (val === "-t") {
          time = array[index + 1];
          if (!time || typeof parseInt(time) !== "number") {
            throw new Error("Invalid time amount");
          }
        }

        if (val === "-p") {
          pace = array[index + 1];
          if (!pace || typeof parseInt(pace) !== "number") {
            throw new Error("Invalid pace amount");
          }
        }

        if (val === "-r") {
          rampUp = array[index + 1];
          if (!rampUp || typeof parseInt(rampUp) !== "number") {
            throw new Error("Invalid ramp-up amount");
          }
        }

        if (val === "-api") {
          apiCall = true;
        }
      });

      return {
        apiCall,
        time: parseInt(time) * 1000,
        pace: parseInt(pace) * 1000,
        rampUp: parseInt(rampUp) * 1000,
        loops: parseInt(loops),
        sessions: parseInt(sessions),
        ...options,
      };
    };

    const reportLog = (message) => {
      const { loops } = getOptions(options);

      if (loops === 1) console.log(message);
      fs.appendFileSync(
        `${parentLogsFolder}/reports.txt`,
        `${message}\n`,
        function (err) {
          if (err) {
            return console.log(err);
          }
        }
      );
    };

    const log = (message, iteration) => {
      const { loops } = getOptions(options);

      if (loops === 1) console.log(message);

      const dir = `${parentLogsFolder}/Iteration ${iteration}`;
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, {
          recursive: true,
        });
      }

      fs.appendFileSync(
        `${parentLogsFolder}/Iteration ${iteration}/log.txt`,
        `${message}\n`,
        function (err) {
          if (err) {
            return console.log(err);
          }
        }
      );
    };

    const createReport = async (steps) => {
      let { loops, sessions } = getOptions(options);

      let filteredSteps = [];

      for (const step of steps) {
        if (filteredSteps.find((fstep) => fstep.title === step.title)) {
          filteredSteps = filteredSteps.map((fstep) => {
            if (fstep.title === step.title) {
              return {
                title: step.title,
                times: [...fstep.times, step.time],
              };
            }
            return fstep;
          });
        } else {
          filteredSteps.push({
            title: step.title,
            times: [step.time],
          });
        }
      }

      reportLog(
        `Transaction ${" ".repeat(14)}| Min ${" ".repeat(4)}| Avg ${" ".repeat(
          4
        )}| Max ${" ".repeat(4)}| Pass  ${" ".repeat(2)}| Fail  ${" ".repeat(
          2
        )}`
      );

      for (const step of filteredSteps) {
        let { title, times } = step;

        let noSuccess = steps
          .filter((s) => s.title === title)
          .reduce((acc, s) => acc + s.noSuccess, 0);

        let noFailed = steps
          .filter((s) => s.title === title)
          .reduce((acc, s) => acc + s.noFailed, 0);

        // noFailed += sessions * loops - noSuccess - noFailed;

        title = `${title}${" ".repeat(25)}`;
        title = title.substring(0, 25);

        const milToSec = (mil) => mil / 1000;

        let min = parseFloat(milToSec(Math.min(...times))).toFixed(2);
        let avg = parseFloat(
          milToSec(times.reduce((a, b) => a + b, 0) / times.length)
        ).toFixed(2);
        let max = parseFloat(milToSec(Math.max(...times))).toFixed(2);

        min = `${min}${" ".repeat(7).substring(min.toString().length, 7)}`;
        avg = `${avg}${" ".repeat(7).substring(avg.toString().length, 7)}`;
        max = `${max}${" ".repeat(7).substring(max.toString().length, 7)}`;

        noSuccess = `${noSuccess}${" "
          .repeat(7)
          .substring(noSuccess.toString().length, 7)}`;
        noFailed = `${noFailed}${" "
          .repeat(7)
          .substring(noFailed.toString().length, 7)}`;

        reportLog(
          `${title} | ${min} | ${avg} | ${max} | ${noSuccess} | ${noFailed}`
        );
      }

      let noSuccess = steps.reduce((acc, s) => acc + s.noSuccess, 0);

      let noFailed = steps.reduce((acc, s) => acc + s.noFailed, 0);

      let apiCall = getOptions(options).apiCall;

      const data = {
        Passed: noSuccess,
        Failed: noFailed,
        Blocked: 0,
        StartDateTime: startDate.toISOString(),
        EndDateTime: new Date().toISOString(),
        ...apiPayload.data,
      };

      const axiosOptions = {
        method: apiPayload.method,
        headers: apiPayload.headers,
        data: JSON.stringify(data),
        url: apiPayload.endpoint,
      };

      console.log(`Call to Metrics_${apiPayload.method} is initiated`);

      if (apiCall)
        axios(axiosOptions)
          .then((res) => {
            if (res.status === 200) {
              console.log(
                `Metrics_${apiPayload.method} is successful\n${JSON.stringify(
                  res.data
                )}`
              );
              console.log(
                `Metrics_${apiPayload.method} call completed and sent metrics to devops portal`
              );
            } else {
              console.log(
                `Metrics_${apiPayload.method} call failed!\n${res.data}\nStatus: ${res.status}`
              );
            }
          })
          .catch((err) => {
            console.log(
              `Metrics_${apiPayload.method} call failed!\n${err.response.data}\nStatus: ${err.response.status}`
            );
          });
    };

    if (options.uniqueSession) {
      let totalSteps = [];

      for (
        let currentRestart = 0;
        currentRestart < getOptions(options).loops;
        currentRestart++
      ) {
        let steps = await main(
          currentRestart,
          parentLogsFolder,
          options,
          getOptions,
          log,
          callback
        );

        totalSteps = [...totalSteps, ...steps];
      }

      await createReport(totalSteps);
    } else {
      let steps = await main(
        null,
        parentLogsFolder,
        options,
        getOptions,
        log,
        callback
      );

      await createReport(steps);
    }

    console.log(`Script ended at: ${getDate()}`);
  },
  expect: function expect(page) {
    return {
      toMatch: async (textOrRegex, timeout = 30000) => {
        if (textOrRegex instanceof RegExp) {
          await page.waitForFunction(
            `${textOrRegex}.test(document.body.innerText) === true`,
            {
              timeout,
            }
          );
        } else if (typeof textOrRegex === "string") {
          await page.waitForXPath(`//*[contains(text(),'${textOrRegex}')]`, {
            visible: true,
            hidden: false,
            timeout,
          });
        } else {
          throw new Error("toMatch expects a string or a regex");
        }
      },
      toMatchElement: async (selector, timeout = 30000) => {
        if (typeof selector === "string") {
          await page.waitForSelector(selector, {
            visible: true,
            hidden: false,
            timeout,
          });
        } else {
          throw new Error("toMatchElement expects a string");
        }
      },
    };
  },
};
