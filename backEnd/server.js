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

// Maximum number of processes inside one container
const MAX_PIDS = 64;

// VPS has 2 vCPUs, so allow only 2 compiler jobs at once
const MAX_CONCURRENT_RUNS = 2;

// Minimum time between two "run" requests from one client
const RUN_COOLDOWN = 1000; // 1 second

let activeRuns = 0;

// Allowed browser origins
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

// Handle HTTP -> WebSocket upgrade
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
// WEBSOCKET CONNECTION
// ============================================================

wss.on("connection", (ws, req) => {
  console.log("Client connected from:", req.headers.origin || "unknown origin");

  // Currently running Docker CLI process
  let proc = null;

  // Current Docker container name
  let containerName = null;

  // Current temporary directory
  let currentDir = null;

  // Execution timeout
  let timeout = null;

  // Track output size
  let outputBytes = 0;

  // Prevent multiple executions on the same WebSocket
  let isRunning = false;

  // Used for simple per-client rate limiting
  let lastRunAt = 0;

  // ------------------------------------------------------------
  // SEND MESSAGE HELPER
  // ------------------------------------------------------------

  const sendMessage = (message) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  };

  // ------------------------------------------------------------
  // CLEANUP
  // ------------------------------------------------------------

  const cleanup = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (currentDir) {
      try {
        fs.rmSync(currentDir, {
          recursive: true,
          force: true,
        });
      } catch (err) {
        console.error("❌ Failed to remove temp directory:", err);
      }

      currentDir = null;
    }

    proc = null;
    containerName = null;

    if (isRunning) {
      isRunning = false;

      if (activeRuns > 0) {
        activeRuns--;
      }
    }
  };

  // ------------------------------------------------------------
  // KILL CONTAINER
  // ------------------------------------------------------------

  const killContainer = () => {
    if (containerName) {
      console.log(`🛑 Force removing container: ${containerName}`);

      // Explicitly stop and remove the actual container
      const removeProc = spawn("docker", ["rm", "-f", containerName]);

      removeProc.on("error", (err) => {
        console.error("❌ Failed to remove container:", err);
      });
    }

    // Also kill the Docker CLI process if it is still alive
    if (proc) {
      try {
        proc.kill("SIGKILL");
      } catch (err) {
        // Process may already have exited
      }
    }
  };

  // ============================================================
  // WEBSOCKET MESSAGE HANDLER
  // ============================================================

  ws.on("message", (msg) => {
    let data;

    // ----------------------------------------------------------
    // PARSE MESSAGE
    // ----------------------------------------------------------

    try {
      data = JSON.parse(msg.toString());
    } catch {
      sendMessage({
        type: "error",
        data: "Invalid JSON message",
      });

      return;
    }

    // ==========================================================
    // RUN PROGRAM
    // ==========================================================

    if (data.type === "run") {
      // --------------------------------------------------------
      // Only one execution per WebSocket
      // --------------------------------------------------------

      if (isRunning) {
        sendMessage({
          type: "error",
          data: "A program is already running. Please wait for it to finish.",
        });

        return;
      }

      // --------------------------------------------------------
      // Global concurrent execution limit
      // --------------------------------------------------------

      if (activeRuns >= MAX_CONCURRENT_RUNS) {
        sendMessage({
          type: "error",
          data: "Compiler is busy. Please try again shortly.",
        });

        return;
      }

      // --------------------------------------------------------
      // Rate limiting
      // --------------------------------------------------------

      const now = Date.now();

      if (now - lastRunAt < RUN_COOLDOWN) {
        sendMessage({
          type: "error",
          data: "Please wait before running another program.",
        });

        return;
      }

      lastRunAt = now;

      // --------------------------------------------------------
      // Validate code
      // --------------------------------------------------------

      if (typeof data.code !== "string") {
        sendMessage({
          type: "error",
          data: "Invalid source code.",
        });

        return;
      }

      // --------------------------------------------------------
      // Language configuration
      // --------------------------------------------------------

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
          sendMessage({
            type: "error",
            data: "Unsupported language",
          });

          return;
      }

      // ========================================================
      // CREATE TEMP DIRECTORY
      // ========================================================

      const id = uuidv4();

      currentDir = path.join(os.tmpdir(), id);

      try {
        fs.mkdirSync(currentDir, {
          recursive: true,
        });

        // Write user source code
        fs.writeFileSync(path.join(currentDir, filename), data.code);
      } catch (err) {
        console.error("❌ File creation error:", err);

        cleanup();

        sendMessage({
          type: "error",
          data: "Failed to prepare source code.",
        });

        return;
      }

      // ========================================================
      // CREATE UNIQUE CONTAINER NAME
      // ========================================================

      containerName = `compiler-${id}`;

      // ========================================================
      // DOCKER COMMAND
      // ========================================================

      const dockerCmd = [
        "run",

        "--rm",
        "-i",

        // No internet access
        "--network",
        "none",

        // Resource limits
        "--memory",
        "256m",

        "--memory-swap",
        "256m",

        "--cpus",
        "1",

        "--pids-limit",
        String(MAX_PIDS),

        // Run as the same UID/GID as the Node process
        "--user",
        `${process.getuid()}:${process.getgid()}`,

        // Security
        "--cap-drop",
        "ALL",

        "--security-opt",
        "no-new-privileges",

        // Writable environment for compilers/runtimes
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

        // .NET / C#
        "-e",
        "DOTNET_CLI_HOME=/tmp/dotnet",

        "-e",
        "NUGET_PACKAGES=/tmp/nuget",

        // Container name
        "--name",
        containerName,

        // Source directory
        "-v",
        `${currentDir}:/workspace`,

        "-w",
        "/workspace",

        // Language image
        dockerImage,

        "bash",
        "-c",
        execCmd,
      ];

      // ========================================================
      // START EXECUTION
      // ========================================================

      isRunning = true;
      activeRuns++;
      outputBytes = 0;

      console.log(
        `🚀 Running ${data.lang} | container=${containerName} | active=${activeRuns}/${MAX_CONCURRENT_RUNS}`,
      );

      proc = spawn("docker", dockerCmd);

      // --------------------------------------------------------
      // TIMEOUT
      // --------------------------------------------------------

      timeout = setTimeout(() => {
        if (!isRunning) return;

        console.log(`⏰ Execution timeout: ${containerName}`);

        sendMessage({
          type: "error",
          data: "Execution timed out (10 seconds).",
        });

        killContainer();
      }, EXECUTION_TIMEOUT);

      // --------------------------------------------------------
      // STDOUT
      // --------------------------------------------------------

      proc.stdout.on("data", (chunk) => {
        outputBytes += chunk.length;

        if (outputBytes > MAX_OUTPUT_BYTES) {
          sendMessage({
            type: "error",
            data: "Output limit exceeded (1 MB).",
          });

          killContainer();
          return;
        }

        sendMessage({
          type: "stdout",
          data: chunk.toString(),
        });
      });

      // --------------------------------------------------------
      // STDERR
      // --------------------------------------------------------

      proc.stderr.on("data", (chunk) => {
        outputBytes += chunk.length;

        if (outputBytes > MAX_OUTPUT_BYTES) {
          sendMessage({
            type: "error",
            data: "Output limit exceeded (1 MB).",
          });

          killContainer();
          return;
        }

        sendMessage({
          type: "stderr",
          data: chunk.toString(),
        });
      });

      // --------------------------------------------------------
      // DOCKER PROCESS ERROR
      // --------------------------------------------------------

      proc.on("error", (err) => {
        console.error("❌ Docker process error:", err);

        sendMessage({
          type: "error",
          data: "Failed to start compiler.",
        });

        cleanup();
      });

      // --------------------------------------------------------
      // PROCESS CLOSED
      // --------------------------------------------------------

      proc.on("close", (code) => {
        console.log(
          `🏁 Execution finished | container=${containerName} | code=${code}`,
        );

        if (isRunning) {
          sendMessage({
            type: "exit",
            code,
          });
        }

        cleanup();
      });
    }

    // ==========================================================
    // STDIN
    // ==========================================================

    if (data.type === "stdin" && proc && isRunning) {
      try {
        proc.stdin.write(data.data);
      } catch (err) {
        console.error("❌ Failed to write stdin:", err);
      }
    }
  });

  // ============================================================
  // CLIENT DISCONNECTED
  // ============================================================

  ws.on("close", () => {
    console.log("🔌 Client disconnected");

    if (isRunning) {
      killContainer();
      cleanup();
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
