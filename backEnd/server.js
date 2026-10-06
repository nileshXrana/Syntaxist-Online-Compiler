import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";
import cors from "cors";
import "dotenv/config";

const app = express();

app.use(express.json());
app.use(cors());

// ============================================================
// CONFIG
// ============================================================

const PORT = 5001;

// Maximum time one program can run
const EXECUTION_TIMEOUT = 30_000; // 30 seconds

// Maximum combined stdout + stderr
const MAX_OUTPUT_BYTES = 1 * 1024 * 1024; // 1 MB

// Maximum source code size
const MAX_CODE_SIZE_BYTES = 100 * 1024; // 100 KB

// Maximum number of processes inside one container
const MAX_PIDS = 64;

// VPS has 2 vCPUs, so only 2 jobs run at once
const MAX_CONCURRENT_RUNS = 2;

// Maximum number of jobs waiting in memory
const MAX_QUEUE_SIZE = 500;

// Minimum time between two "run" requests from one client
const RUN_COOLDOWN = 1000; // 1 second

// ============================================================
// GLOBAL JOB QUEUE
// ============================================================

let activeRuns = 0;

const executionQueue = [];

// ============================================================
// ALLOWED ORIGINS
// ============================================================

const allowedOrigins = new Set(
  ["http://localhost:3000", process.env.FRONTEND_ORIGIN].filter(Boolean),
);

// ============================================================
// HTTP SERVER
// ============================================================

const server = app.listen(PORT, () => {
  console.log(`✅ Express running on port ${PORT}`);
  console.log(`✅ WebSocket running on ws://localhost:${PORT}`);
});

// ============================================================
// WEBSOCKET SERVER
// ============================================================

const wss = new WebSocketServer({
  noServer: true,

  // Prevent extremely large WebSocket messages
  maxPayload: 1 * 1024 * 1024,
});

// ============================================================
// HTTP -> WEBSOCKET UPGRADE
// ============================================================

server.on("upgrade", (req, socket, head) => {
  const origin = req.headers.origin;

  // Reject unknown browser origins
  if (origin && !allowedOrigins.has(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

// ============================================================
// SEND MESSAGE
// ============================================================

const sendMessage = (ws, message) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

// ============================================================
// UPDATE QUEUE POSITIONS
// ============================================================

const notifyQueuePositions = () => {
  executionQueue.forEach((job, index) => {
    const position = index + 1;

    if (job.lastQueuePosition !== position) {
      job.lastQueuePosition = position;

      sendMessage(job.ws, {
        type: "queued",
        position,
      });
    }
  });
};

// ============================================================
// REMOVE JOB FROM QUEUE
// ============================================================

const removeQueuedJob = (job) => {
  const index = executionQueue.indexOf(job);

  if (index !== -1) {
    executionQueue.splice(index, 1);
    notifyQueuePositions();
  }
};

// ============================================================
// PROCESS NEXT QUEUED JOBS
// ============================================================

const processQueue = () => {
  while (activeRuns < MAX_CONCURRENT_RUNS && executionQueue.length > 0) {
    const job = executionQueue.shift();

    // Skip cancelled/disconnected jobs
    if (job.cancelled || job.ws.readyState !== WebSocket.OPEN) {
      if (job.state.currentJob === job) {
        job.state.currentJob = null;
        job.state.isRunning = false;
      }

      continue;
    }

    job.lastQueuePosition = null;

    startExecution(job);
  }

  // Update positions for remaining queued jobs
  notifyQueuePositions();
};

// ============================================================
// CLEANUP JOB
// ============================================================

const finishJob = (job, exitCode = null) => {
  if (job.finished) {
    return;
  }

  job.finished = true;

  // Clear timeout
  if (job.timeout) {
    clearTimeout(job.timeout);
    job.timeout = null;
  }

  // Remove temporary directory
  if (job.currentDir) {
    try {
      fs.rmSync(job.currentDir, {
        recursive: true,
        force: true,
      });
    } catch (err) {
      console.error("❌ Failed to remove temp directory:", err);
    }

    job.currentDir = null;
  }

  // Release concurrency slot
  if (job.started) {
    if (activeRuns > 0) {
      activeRuns--;
    }
  }

  const state = job.state;

  if (state.currentJob === job) {
    state.currentJob = null;
    state.isRunning = false;
    state.proc = null;
    state.containerName = null;
  }

  // Normal process completion
  if (exitCode !== null && !job.terminationMessageSent) {
    sendMessage(job.ws, {
      type: "exit",
      code: exitCode,
    });
  }

  console.log(
    `🏁 Job finished | language=${job.lang} | active=${activeRuns}/${MAX_CONCURRENT_RUNS} | queue=${executionQueue.length}`,
  );

  // Start next waiting jobs
  setImmediate(processQueue);
};

// ============================================================
// KILL CONTAINER
// ============================================================

const killContainer = (job) => {
  if (job.containerName) {
    console.log(`🛑 Killing container: ${job.containerName}`);

    // Explicitly remove the real container
    const removeProc = spawn("docker", ["rm", "-f", job.containerName]);

    removeProc.on("error", (err) => {
      console.error("❌ Failed to remove container:", err);
    });
  }

  // Also kill Docker CLI process
  if (job.proc) {
    try {
      job.proc.kill("SIGKILL");
    } catch {
      // Process may already be closed
    }
  }
};

// ============================================================
// START EXECUTION
// ============================================================

const startExecution = (job) => {
  if (job.cancelled || job.finished || job.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const state = job.state;

  job.started = true;
  activeRuns++;

  // ----------------------------------------------------------
  // CREATE TEMP DIRECTORY
  // ----------------------------------------------------------

  const id = uuidv4();

  job.currentDir = path.join(os.tmpdir(), id);

  try {
    fs.mkdirSync(job.currentDir, {
      recursive: true,
    });

    // --------------------------------------------------------
    // WRITE SOURCE CODE
    // --------------------------------------------------------

    fs.writeFileSync(path.join(job.currentDir, job.filename), job.code);
  } catch (err) {
    console.error("❌ File creation error:", err);

    job.terminationMessageSent = true;

    sendMessage(job.ws, {
      type: "error",
      data: "Failed to prepare source code.",
    });

    finishJob(job);

    return;
  }

  // ----------------------------------------------------------
  // CONTAINER NAME
  // ----------------------------------------------------------

  job.containerName = `compiler-${id}`;

  // ----------------------------------------------------------
  // DOCKER COMMAND
  // ----------------------------------------------------------

  const dockerCmd = [
    "run",

    // Automatically remove container after normal exit
    "--rm",

    // Keep stdin open
    "-i",

    // No internet
    "--network",
    "none",

    // Memory limit
    "--memory",
    "256m",

    // Prevent swap
    "--memory-swap",
    "256m",

    // One full vCPU
    "--cpus",
    "1",

    // Process limit
    "--pids-limit",
    String(MAX_PIDS),

    // Run using same UID/GID as Node process
    "--user",
    `${process.getuid()}:${process.getgid()}`,

    // Security
    "--cap-drop",
    "ALL",

    "--security-opt",
    "no-new-privileges",

    // --------------------------------------------------------
    // Writable compiler/runtime locations
    // --------------------------------------------------------

    "-e",
    "HOME=/tmp",

    "-e",
    "TMPDIR=/tmp",

    "-e",
    "XDG_CACHE_HOME=/tmp/.cache",

    // Go
    "-e",
    "GOCACHE=/tmp/go-build",

    "-e",
    "GOPATH=/tmp/go",

    // .NET
    "-e",
    "DOTNET_CLI_HOME=/tmp/dotnet",

    "-e",
    "NUGET_PACKAGES=/tmp/nuget",

    // Container name
    "--name",
    job.containerName,

    // Source directory
    "-v",
    `${job.currentDir}:/workspace`,

    // Working directory
    "-w",
    "/workspace",

    // Language image
    job.dockerImage,

    // Command
    "bash",
    "-c",
    job.execCmd,
  ];

  // ----------------------------------------------------------
  // START DOCKER
  // ----------------------------------------------------------

  sendMessage(job.ws, {
    type: "started",
  });

  console.log(
    `🚀 Running ${job.lang} | container=${job.containerName} | active=${activeRuns}/${MAX_CONCURRENT_RUNS}`,
  );

  job.proc = spawn("docker", dockerCmd);

  state.proc = job.proc;
  state.containerName = job.containerName;

  // ----------------------------------------------------------
  // TIMEOUT
  // ----------------------------------------------------------

  job.timeout = setTimeout(() => {
    if (job.finished || job.terminationMessageSent) {
      return;
    }

    console.log(`⏰ Execution timeout: ${job.containerName}`);

    job.terminationMessageSent = true;

    sendMessage(job.ws, {
      type: "error",
      data: "Execution timed out (30 seconds).",
    });

    killContainer(job);
  }, EXECUTION_TIMEOUT);

  // ----------------------------------------------------------
  // STDOUT
  // ----------------------------------------------------------

  job.proc.stdout.on("data", (chunk) => {
    if (job.finished || job.terminationMessageSent) {
      return;
    }

    job.outputBytes += chunk.length;

    if (job.outputBytes > MAX_OUTPUT_BYTES) {
      console.log(`⚠️ Output limit exceeded: ${job.containerName}`);

      job.terminationMessageSent = true;

      sendMessage(job.ws, {
        type: "error",
        data: "Output limit exceeded (1 MB).",
      });

      killContainer(job);

      return;
    }

    sendMessage(job.ws, {
      type: "stdout",
      data: chunk.toString(),
    });
  });

  // ----------------------------------------------------------
  // STDERR
  // ----------------------------------------------------------

  job.proc.stderr.on("data", (chunk) => {
    if (job.finished || job.terminationMessageSent) {
      return;
    }

    job.outputBytes += chunk.length;

    if (job.outputBytes > MAX_OUTPUT_BYTES) {
      console.log(`⚠️ Output limit exceeded: ${job.containerName}`);

      job.terminationMessageSent = true;

      sendMessage(job.ws, {
        type: "error",
        data: "Output limit exceeded (1 MB).",
      });

      killContainer(job);

      return;
    }

    sendMessage(job.ws, {
      type: "stderr",
      data: chunk.toString(),
    });
  });

  // ----------------------------------------------------------
  // DOCKER PROCESS ERROR
  // ----------------------------------------------------------

  job.proc.on("error", (err) => {
    console.error("❌ Docker process error:", err);

    if (!job.terminationMessageSent) {
      job.terminationMessageSent = true;

      sendMessage(job.ws, {
        type: "error",
        data: "Failed to start compiler.",
      });
    }

    finishJob(job);
  });

  // ----------------------------------------------------------
  // DOCKER PROCESS CLOSED
  // ----------------------------------------------------------

  job.proc.on("close", (code) => {
    finishJob(job, code);
  });
};

// ============================================================
// WEBSOCKET CONNECTION
// ============================================================

wss.on("connection", (ws, req) => {
  console.log("Client connected from:", req.headers.origin || "unknown origin");

  const state = {
    ws,
    proc: null,
    containerName: null,
    currentJob: null,
    isRunning: false,
    lastRunAt: 0,
  };

  // ==========================================================
  // MESSAGE HANDLER
  // ==========================================================

  ws.on("message", (msg) => {
    let data;

    // --------------------------------------------------------
    // PARSE JSON
    // --------------------------------------------------------

    try {
      data = JSON.parse(msg.toString());
    } catch {
      sendMessage(ws, {
        type: "error",
        data: "Invalid JSON message",
      });

      return;
    }

    // ========================================================
    // RUN
    // ========================================================

    if (data.type === "run") {
      // ------------------------------------------------------
      // One job per WebSocket
      // ------------------------------------------------------

      if (state.isRunning) {
        sendMessage(ws, {
          type: "error",
          data: "A program is already running. Please wait for it to finish.",
        });

        return;
      }

      // ------------------------------------------------------
      // RATE LIMIT
      // ------------------------------------------------------

      const now = Date.now();

      if (now - state.lastRunAt < RUN_COOLDOWN) {
        sendMessage(ws, {
          type: "error",
          data: "Please wait before running another program.",
        });

        return;
      }

      state.lastRunAt = now;

      // ------------------------------------------------------
      // VALIDATE CODE
      // ------------------------------------------------------

      if (typeof data.code !== "string") {
        sendMessage(ws, {
          type: "error",
          data: "Invalid source code.",
        });

        return;
      }

      // ------------------------------------------------------
      // SOURCE CODE SIZE LIMIT
      // ------------------------------------------------------

      const codeSizeBytes = Buffer.byteLength(data.code, "utf8");

      if (codeSizeBytes > MAX_CODE_SIZE_BYTES) {
        sendMessage(ws, {
          type: "error",
          data: "Source code is too large. Maximum allowed size is 100 KB.",
        });

        return;
      }

      // ------------------------------------------------------
      // QUEUE LIMIT
      // ------------------------------------------------------

      if (executionQueue.length >= MAX_QUEUE_SIZE) {
        sendMessage(ws, {
          type: "error",
          data: "Compiler queue is full. Please try again later.",
        });

        return;
      }

      // ------------------------------------------------------
      // LANGUAGE CONFIG
      // ------------------------------------------------------

      let filename;
      let dockerImage;
      let execCmd;

      switch (data.lang) {
        case "cpp":
          filename = "main.cpp";
          dockerImage = "cpp-runner";
          execCmd = "g++ main.cpp -o main.out && ./main.out";
          break;

        case "python":
          filename = "main.py";
          dockerImage = "py-runner";
          execCmd = "python3 main.py";
          break;

        case "java":
          filename = "Main.java";
          dockerImage = "java-runner";
          execCmd = "javac Main.java && java Main";
          break;

        case "javascript":
          filename = "main.js";
          dockerImage = "js-runner";
          execCmd = "node main.js";
          break;

        case "go":
          filename = "main.go";
          dockerImage = "go-runner";
          execCmd = "go run main.go";
          break;

        case "ruby":
          filename = "main.rb";
          dockerImage = "ruby-runner";
          execCmd = "ruby main.rb";
          break;

        case "php":
          filename = "main.php";
          dockerImage = "php-runner";
          execCmd = "php main.php";
          break;

        case "rust":
          filename = "main.rs";
          dockerImage = "rust-runner";
          execCmd = "rustc main.rs -o main.out && ./main.out";
          break;

        case "swift":
          filename = "main.swift";
          dockerImage = "swift-runner";
          execCmd = "swift main.swift";
          break;

        case "csharp":
          filename = "Program.cs";
          dockerImage = "csharp-runner";

          execCmd =
            "dotnet new console -o app --no-restore && " +
            "mv Program.cs app/Program.cs && " +
            "cd app && dotnet run";

          break;

        default:
          sendMessage(ws, {
            type: "error",
            data: "Unsupported language",
          });

          return;
      }

      // ======================================================
      // CREATE JOB
      // ======================================================

      const job = {
        state,
        ws,

        lang: data.lang,
        code: data.code,

        filename,
        dockerImage,
        execCmd,

        proc: null,
        timeout: null,
        currentDir: null,
        containerName: null,

        outputBytes: 0,

        started: false,
        finished: false,
        cancelled: false,

        terminationMessageSent: false,

        lastQueuePosition: null,
      };

      // Mark this WebSocket as occupied
      state.isRunning = true;
      state.currentJob = job;

      // ======================================================
      // ADD TO QUEUE
      // ======================================================

      executionQueue.push(job);

      console.log(
        `📥 Job queued | language=${job.lang} | queue=${executionQueue.length} | active=${activeRuns}/${MAX_CONCURRENT_RUNS}`,
      );

      // ======================================================
      // START JOBS IF A SLOT IS AVAILABLE
      // ======================================================

      processQueue();

      // Update waiting users
      notifyQueuePositions();
    }

    // ========================================================
    // STDIN
    // ========================================================

    if (
      data.type === "stdin" &&
      state.currentJob &&
      state.currentJob.started &&
      state.proc
    ) {
      try {
        state.proc.stdin.write(data.data);
      } catch (err) {
        console.error("❌ Failed to write stdin:", err);
      }
    }
  });

  // ==========================================================
  // CLIENT DISCONNECTED
  // ==========================================================

  ws.on("close", () => {
    console.log("🔌 Client disconnected");

    const job = state.currentJob;

    if (!job) {
      return;
    }

    // --------------------------------------------------------
    // JOB IS STILL WAITING IN QUEUE
    // --------------------------------------------------------

    if (!job.started) {
      job.cancelled = true;

      removeQueuedJob(job);

      state.currentJob = null;
      state.isRunning = false;

      console.log(
        `🗑️ Removed disconnected queued job | queue=${executionQueue.length}`,
      );

      // Start/update queue
      processQueue();

      return;
    }

    // --------------------------------------------------------
    // JOB IS CURRENTLY RUNNING
    // --------------------------------------------------------

    if (job.started && !job.finished) {
      console.log(
        `🛑 Client disconnected while job was running: ${job.containerName}`,
      );

      if (!job.terminationMessageSent) {
        job.terminationMessageSent = true;
      }

      killContainer(job);
    }
  });
});

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/", (_, res) => {
  res.json({
    status: "running",

    message: "Multi-language compiler backend running",

    websocket: `ws://localhost:${PORT}`,

    activeExecutions: activeRuns,

    queuedJobs: executionQueue.length,

    maxConcurrentExecutions: MAX_CONCURRENT_RUNS,

    maxQueueSize: MAX_QUEUE_SIZE,

    maxCodeSize: `${MAX_CODE_SIZE_BYTES / 1024} KB`,

    supportedLanguages: [
      "python",
      "javascript",
      "cpp",
      "java",
      "go",
      "ruby",
      "php",
      "csharp",
      "swift",
      "rust",
    ],
  });
});
