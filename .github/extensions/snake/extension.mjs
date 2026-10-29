import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

const EXT_DIR = dirname(fileURLToPath(import.meta.url));
const COPILOT_HOME = process.env.COPILOT_HOME || join(homedir(), ".copilot");
const STATS_DIR = join(COPILOT_HOME, "extensions", "snake", "artifacts");
const STATS_FILE = join(STATS_DIR, "stats.json");
const SPEEDS = ["slow", "normal", "fast"];

// ---------- persistence (per user: high score + preferences) ----------

function defaultStats() {
    return { highScore: 0, gamesPlayed: 0, speed: "normal", recent: [] };
}

let stats = (() => {
    try {
        if (existsSync(STATS_FILE)) return { ...defaultStats(), ...JSON.parse(readFileSync(STATS_FILE, "utf8")) };
    } catch {
        // Corrupt file: start fresh.
    }
    return defaultStats();
})();

function persist() {
    mkdirSync(STATS_DIR, { recursive: true });
    const tmp = `${STATS_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(stats, null, 2));
    renameSync(tmp, STATS_FILE);
    broadcast("stats", stats);
}

// Live game status reported by the iframe (ephemeral).
let live = { status: "idle", score: 0, length: 3 };

// ---------- SSE ----------

const subscribers = new Set();
function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of subscribers) res.write(payload);
}

// ---------- HTTP server ----------

function json(res, code, body) {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
}

async function readBody(req) {
    let data = "";
    for await (const chunk of req) {
        data += chunk;
        if (data.length > 10_000) throw new Error("Body too large");
    }
    return data ? JSON.parse(data) : {};
}

async function handle(req, res) {
    const url = new URL(req.url, "http://127.0.0.1");
    try {
        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
            return res.end(readFileSync(join(EXT_DIR, "ui.html"), "utf8"));
        }
        if (req.method === "GET" && url.pathname === "/api/stats") return json(res, 200, stats);
        if (req.method === "POST" && url.pathname === "/api/status") {
            const b = await readBody(req);
            live = {
                status: ["idle", "playing", "paused", "over"].includes(b.status) ? b.status : live.status,
                score: Number.isInteger(b.score) ? b.score : live.score,
                length: Number.isInteger(b.length) ? b.length : live.length,
            };
            return json(res, 200, live);
        }
        if (req.method === "POST" && url.pathname === "/api/gameover") {
            const { score } = await readBody(req);
            const s = Math.max(0, Math.min(Number.parseInt(score, 10) || 0, 100_000));
            const newBest = s > stats.highScore;
            stats.gamesPlayed += 1;
            if (newBest) stats.highScore = s;
            stats.recent = [{ score: s, at: new Date().toISOString() }, ...stats.recent].slice(0, 10);
            persist();
            return json(res, 200, { newBest, stats });
        }
        if (req.method === "POST" && url.pathname === "/api/speed") {
            const { speed } = await readBody(req);
            if (!SPEEDS.includes(speed)) return json(res, 400, { error: "Invalid speed" });
            stats.speed = speed;
            persist();
            return json(res, 200, stats);
        }
        if (req.method === "GET" && url.pathname === "/events") {
            res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
            res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);
            subscribers.add(res);
            const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
            req.on("close", () => {
                clearInterval(ping);
                subscribers.delete(res);
            });
            return;
        }
        json(res, 404, { error: "Not found" });
    } catch (e) {
        json(res, 500, { error: e.message });
    }
}

let serverPromise;
function ensureServer() {
    serverPromise ??= new Promise((resolve) => {
        const server = createServer((req, res) => void handle(req, res));
        server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}/`));
    });
    return serverPromise;
}

function command(type, extra = {}) {
    if (!subscribers.size) throw new CanvasError("not_open", "No Snake canvas is currently connected.");
    broadcast("command", { type, ...extra });
}

// ---------- canvas ----------

await joinSession({
    canvases: [
        createCanvas({
            id: "snake",
            displayName: "Snake",
            description: "Play a mini Snake game with arrow keys/WASD or swipes; tracks your high score.",
            inputSchema: {
                type: "object",
                properties: { speed: { type: "string", enum: SPEEDS, description: "Starting speed preference." } },
                additionalProperties: false,
            },
            actions: [
                {
                    name: "get_stats",
                    description: "Get the high score, games played, recent scores, speed, and the live game status.",
                    handler: async () => ({ ...stats, live }),
                },
                {
                    name: "new_game",
                    description: "Start a new game in the open canvas.",
                    handler: async () => {
                        command("new_game");
                        return { ok: true };
                    },
                },
                {
                    name: "toggle_pause",
                    description: "Pause or resume the current game.",
                    handler: async () => {
                        command("toggle_pause");
                        return { ok: true };
                    },
                },
                {
                    name: "set_speed",
                    description: "Set the snake speed (applies to the next game).",
                    inputSchema: { type: "object", required: ["speed"], properties: { speed: { type: "string", enum: SPEEDS } } },
                    handler: async (ctx) => {
                        stats.speed = ctx.input.speed;
                        persist();
                        return { speed: stats.speed };
                    },
                },
                {
                    name: "reset_stats",
                    description: "Reset the high score and game history.",
                    handler: async () => {
                        stats = { ...defaultStats(), speed: stats.speed };
                        persist();
                        return stats;
                    },
                },
            ],
            open: async (ctx) => {
                if (ctx.input?.speed && ctx.input.speed !== stats.speed) {
                    stats.speed = ctx.input.speed;
                    persist();
                }
                return { title: "Snake", status: `Best ${stats.highScore}`, url: await ensureServer() };
            },
        }),
    ],
});
