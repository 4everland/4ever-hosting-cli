#!/usr/bin/env node
const program = require("commander");
const inquirer = require("inquirer");
const pkg = require("../package");
const chalk = require("chalk");
const ora = require("ora");
const spinner = ora("Loading undead unicorns");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const currentDir = path.resolve("./");
const archiver = require("archiver");
const FormData = require("form-data");
let hostingConfig = { token: "", projectId: "" };
try {
  fs.accessSync(currentDir + "/.hostingConfig.json");
  hostingConfig = require(currentDir + "/.hostingConfig");
} catch (err) {}
let Token = hostingConfig.token;
let ProjectId = hostingConfig.projectId;
const instance = axios.create({
  baseURL: "https://cli-api.4everland.org/",
  // baseURL: "https://cli.foreverland.xyz/",
  headers: { token: Token },
  maxBodyLength: Infinity,
});
/**
 * version
 */
program.version(chalk.green(`${pkg.version}`), "-v", "--version");
/**
 * login
 */
program
  .command("login")
  .description("login in hosting")
  .action((arg, value) => {
    login();
  });
/**
 * deploy
 */
program
  .command("deploy")
  .description("deploy")
  .action((arg, value) => {
    if (Token) {
      inquirer
        .prompt([
          {
            type: "list",
            message: "Please select the project you want to deploy",
            name: "type",
            prefix: "****",
            suffix: "****",
            choices: [
              { name: "Create a new project", value: 1 },
              { name: "Select an existing project", value: 2 },
            ],
          },
        ])
        .then((answer) => {
          if (answer.type == 1) {
            createProject();
          } else {
            chooseProject();
          }
        });
    } else {
      spinner.fail(chalk.red("Please login first"));
    }
  });
/**
 * deploy
 */
program
  .command("domain")
  .description("domain")
  .option("-ls, --list", "domain list")
  .option("-a, --add", "add domain")
  .option("-c, --check", "check domain")
  .action((arg, value) => {
    if (Token) {
      if (arg.list) {
        showDomainList();
      }
      if (arg.add) {
        addDomain();
      }
      if (arg.check) {
        checkDomain();
      }
    } else {
      spinner.fail(chalk.red("Please login first"));
    }
  });

program.parse(process.argv);

function addJson(data) {
  let jsonData = hostingConfig || {};
  jsonData = { ...jsonData, ...data };
  let text = JSON.stringify(jsonData);
  let file = path.join(currentDir, ".hostingConfig.json");
  try {
    fs.writeFileSync(file, text);
  } catch (err) {
    spinner.fail(chalk.red(err));
  }
}
function login() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Please enter your Token:",
        name: "token",
      },
    ])
    .then((data) => {
      spinner.start("Logining...");
      instance
        .post("/login", {}, { headers: { token: data.token } })
        .then((res) => {
          if (res.data.code == 200) {
            spinner.succeed(chalk.green(`Login successful`));
            addJson(data);
            Token = data.token;
          } else {
            spinner.fail(chalk.red("Login failed\n" + res.data.message));
          }
        })
        .catch((error) => {
          spinner.fail(chalk.red(error));
        });
    });
}

function createProject() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Please enter your project name:",
        name: "name",
      },
    ])
    .then((answer) => {
      const regexp = new RegExp("^\\w(\\w*-*)*\\w$");
      if (!regexp.test(answer.name)) {
        spinner.fail(
          "The project name can only be alphanumeric, underscore and ‘-’ but cannot start and end with ‘-’!"
        );
        return;
      }
      inquirer
        .prompt([
          {
            type: "list",
            message: "Which platform will you deploy on?",
            name: "type",
            prefix: "****",
            suffix: "****",
            choices: [
              { name: "IPFS", value: "IPFS" },
              { name: "Internet Computer", value: "IC" },
              { name: "Arweave", value: "AR" },
            ],
          },
        ])
        .then((platform) => {
          let type = platform.type;
          spinner.start("Creating...");
          let data = new FormData();
          data.append("name", answer.name);
          data.append("platform", type);
          instance
            .post("/project", data, {
              headers: {
                "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
              },
            })
            .then((res) => {
              if (res.data.code == 200) {
                spinner.succeed(
                  chalk.green(`You successfully created new project`)
                );
                answer.projectId = res.data.content.projectId;
                ProjectId = res.data.content.projectId;
                addJson(answer);
                enterDirectory();
              } else {
                spinner.fail(
                  chalk.red("Failed to create \n" + res.data.message)
                );
              }
            })
            .catch((error) => {
              spinner.fail(chalk.red(error));
            });
        });
    });
}

function chooseProject() {
  spinner.start("Loading...");
  instance
    .get("/project/1?pageSize=15")
    .then((res) => {
      if (res.data.code == 200) {
        spinner.succeed(chalk.green(`Loaded successfully`));
        let projectList = res.data.content.list;
        inquirer
          .prompt([
            {
              type: "list",
              message: "Please select the project you want to deploy",
              name: "projectId",
              prefix: "****",
              suffix: "****",
              choices() {
                let Arr = [];
                projectList.forEach((element) => {
                  let Obj = {};
                  Obj.name = element.name;
                  Obj.value = element.projectId;
                  Arr.push(Obj);
                });
                return Arr;
              },
            },
          ])
          .then((answer) => {
            projectList.filter(function (ele) {
              if (ele.projectId === answer.projectId) {
                answer.name = ele.name;
              }
            });
            ProjectId = answer.projectId;
            addJson(answer);
            enterDirectory();
          });
      } else {
        spinner.fail(chalk.red("Load failed \n" + res.data.message));
      }
    })
    .catch((error) => {
      spinner.fail(chalk.red(error));
    });
}
function enterDirectory() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Please enter the output path for your project:",
        name: "outPath",
        default: "./dist",
      },
    ])
    .then((answer) => {
      zipProject(answer.outPath);
    });
}

function zipProject(dirPath) {
  if (!fs.existsSync(dirPath)) {
    spinner.fail(chalk.red("File path does not exist"));
    return;
  }
  // create a file to stream archive data to.
  const output = fs.createWriteStream(dirPath + "/hostingDeploy.zip");
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Sets the compression level.
  });

  // listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  output.on("close", function () {
    deployProject(dirPath + "/hostingDeploy.zip");
  });

  // This event is fired when the data source is drained no matter what was the data source.
  // It is not part of this library but rather from the NodeJS Stream API.
  // @see: https://nodejs.org/api/stream.html#stream_event_end
  output.on("end", function () {});

  // good practice to catch warnings (ie stat failures and other non-blocking errors)
  archive.on("warning", function (err) {
    if (err.code === "ENOENT") {
      // log warning
    } else {
      // throw error
      throw err;
    }
  });

  // good practice to catch this error explicitly
  archive.on("error", function (err) {
    throw err;
  });

  // pipe archive data to the file
  archive.pipe(output);

  // append files from a sub-directory, putting its contents at the root of archive
  archive.directory(dirPath, false);

  // finalize the archive (ie we are done appending files but streams have to finish yet)
  // 'close', 'end' or 'finish' may be fired right after calling this method so register to them beforehand
  archive.finalize();
}

function deployProject(filePath) {
  if (!filePath) {
    return;
  }
  let data = new FormData();
  let file = fs.createReadStream(filePath);
  data.append("file", file);
  data.append("projectId", ProjectId);
  spinner.start("uploading...");
  instance
    .post(`/deploy`, data, {
      onUploadProgress: (progressEvent) => {
        console.log(progressEvent);
      },
      headers: {
        "Content-Type": `multipart/form-data; boundary=${data._boundary}`,
      },
    })
    .then((res) => {
      if (res.data.code == 200) {
        spinner.succeed(chalk.green(`You successfully deployed`));
      } else {
        spinner.fail(chalk.red(res.data.message));
      }
      fs.unlinkSync(filePath);
    });
}
function showDomainList() {
  instance.get(`/domain/1?pageSize=15`).then((res) => {
    if (res.data.code == 200) {
      res.data.content.domainList.forEach((item) => {
        console.log(item.domain);
      });
    } else {
      spinner.fail(chalk.red(res.data.message));
    }
  });
}

function addDomain() {
  inquirer
    .prompt([
      {
        type: "input",
        message: "Please enter your Domain:",
        name: "domain",
      },
    ])
    .then((data) => {
      instance
        .post(`/domain/${ProjectId}`, { domain: data.domain })
        .then((res) => {
          if (res.data.code == 200) {
            spinner.succeed(chalk.green(`Added successfully`));
          } else {
            spinner.fail(chalk.red(res.data.message));
          }
        });
    });
}
function checkDomain() {
  spinner.start("Loading...");
  instance.get(`/domain/1?pageSize=15`).then((res) => {
    if (res.data.code == 200) {
      spinner.succeed(chalk.green(`Loaded successfully`));
      let domainList = res.data.content.domainList;
      inquirer
        .prompt([
          {
            type: "list",
            message: "Please select the domain you want to check",
            name: "domainId",
            prefix: "****",
            suffix: "****",
            choices() {
              let Arr = [];
              domainList.forEach((element) => {
                let Obj = {};
                Obj.name = element.domain;
                Obj.value = element.domainId;
                Arr.push(Obj);
              });
              return Arr;
            },
          },
        ])
        .then((answer) => {
          sendDomain(answer.domainId);
        });
    } else {
      spinner.fail(chalk.red(res.data.message));
    }
  });
}

function sendDomain(domainId) {
  instance.get(`/domain/examination?domainId=${domainId}`).then((res) => {
    if (res.data.code == 200) {
      if (res.data.content.Success) {
        spinner.succeed(chalk.green(`Valid Configuration,Assigned`));
      } else {
        spinner.fail(chalk.red(`Invalid Configuration`));
      }
    } else {
      spinner.fail(chalk.red(res.data.message));
    }
  });
}
