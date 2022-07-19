const { default: axios } = require("axios");
const chalk = require("chalk");

const { readFileSync, existsSync, writeFileSync } = require("fs");
if (!existsSync("./data.json")) {
  writeFileSync(
    "./data.json",
    JSON.stringify({
      lastId: 0,
      results: [],
      error: [],
    })
  );
}
let fileData = JSON.parse(readFileSync("./data.json"));
let contents = [];
let id = fileData.lastId || 0;
function writeLine(...messages) {
  process.stdout.cursorTo(0);
  let line = messages.join(" ");
  process.stdout.write(line + " ".repeat(Math.abs(80 - line.length)));
}
function logLine(...messages) {
  writeLine();
  process.stdout.cursorTo(0);
  console.log(...messages);
}
let pause = false;
const MAX_TRY = 3;
let safePauseClock;
function safePause() {
  pause = true;
  if (safePauseClock) clearTimeout(safePauseClock);
  setTimeout(() => (pause = false), 15e3);
}
async function searchById(id) {
  for (let x = 1; x <= MAX_TRY; x++) {
    processCount++;
    try {
      let { data } = await axios.post(
        "https://box3.fun/api/api/content-server-rpc",
        {
          type: "get",
          data: {
            type: "id",
            data: {
              type: 1,
              // userId: 8,
              isPublic: true,
              meshHash: false,
              contentId: id,
            },
          },
        },
        { timeout: 1e3 }
      );
      const contentData = data.data.data;
      contents.push(contentData);
      writeLine();
      process.stdout.cursorTo(0);
      logLine(
        chalk`{green 成功} {blue.bold ${id}} {white ${
          contentData.name
        }} {grey at ${new Date(contentData.created_at).toLocaleString()}}`
      );
      if (MAX_PROCESS < 128) MAX_PROCESS++;
      return;
    } catch (e) {
      if (e.response && e.response.status === 400) {
        return;
      } else if (e.code === "ECONNABORTED" || e.code === "ECONNRESET") {
        // console.log("超时", id);
      } else {
        logLine(chalk`{red 未知错误${String(e)}}`);
        break;
      }
    } finally {
      processCount--;
    }
    logLine(chalk`{grey 重试${x}/${MAX_TRY}} {grey.bold ${id}}`);
    if (MAX_PROCESS > 1) MAX_PROCESS--;
  }
  fileData.error.push(id);
  logLine(chalk`{red.bold 失败 ${id}}`);

  safePause();
}
let MAX_PROCESS = 16;
let processCount = 0;
function waitMaxProcess() {
  if (processCount < MAX_PROCESS) return new Promise((r) => r());
  else
    return new Promise((r) => {
      let clock = setInterval(() => {
        if (processCount < MAX_PROCESS) {
          clearTimeout(clock);
          r();
        }
      });
    });
}
let running = true;
async function start() {
  if (fileData.error.length > 0) {
    logLine(chalk`{yellow.bold 正在重试${fileData.error.length}个失败的请求}`);
    let errorIds = fileData.error;
    fileData.error = [];
    MAX_PROCESS = 1;
    let total = errorIds.length;
    for (let id in errorIds) {
      writeLine(chalk`{yellow 错误恢复 ${id}/${total}}`);
      searchById(errorIds[id]);
      await waitMaxProcess();
    }
    MAX_PROCESS = 16;
    writeLine(chalk`{green 错误恢复已完成}`);
  }
  while (running) {
    if (!pause) {
      id++;
      searchById(id);
      writeLine(
        chalk`{grey 尝试 ${id}} {grey.bold 线程 ${processCount}/${MAX_PROCESS}}`
      );
      await waitMaxProcess();
    } else {
      await new Promise((r) => setTimeout(r, 100));
      writeLine(
        chalk`{blue ID:${id} 暂停中} ${
          processCount > 0
            ? chalk`{yellow 还有${processCount}个线程在运行}`
            : chalk`{grey 线程已全部停止}`
        }`
      );
    }
  }
}
start();
function saveData() {
  fileData.lastId = id;
  fileData.results.push(...contents);
  writeFileSync("./data.json", JSON.stringify(fileData));
  logLine(chalk`{green 保存完成}`);
  contents = [];
}
async function saveAndExit() {
  running = false;
  logLine();
  await new Promise((r) => {
    setInterval(() => {
      if (processCount <= 0) r();
      else
        writeLine(chalk`{yellow 等待线程退出，剩余线程数量: ${processCount}}`);
    }, 1);
  });
  logLine();
  console.log(chalk`{blue 线程全部退出, 正在保存数据...}`);
  saveData();

  process.exit();
}
process.once("SIGINT", saveAndExit);
process.stdin.setRawMode(true);
process.stdin.on("data", (data) => {
  let code = data[0];
  let char = String.fromCharCode(code);

  if (char === "p") pause = !pause;
  if (char === "q" || code === 3) saveAndExit();
  if (char === "+") MAX_PROCESS++;
  if (char === "-" && MAX_PROCESS > 1) MAX_PROCESS--;
  if (char === "s")
    logLine(
      chalk`{white.bold 统计 本次已收集${contents.length}条数据，共收集${
        contents.length + fileData.results.length
      }条}`
    );
  if (code === 19) saveData();
});
