import 'dotenv/config';
import express from 'express';
import { Pool } from 'pg';

const app = express();
const database = new Pool(
  process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {}
);
let isDatabaseConnected = false;

app.use(express.json());
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const createdAt = new Date();
    const clientIp = req.get("cf-connecting-ip") || req.ip || req.socket.remoteAddress || "";
    const logLine = `${createdAt.toISOString()} ${clientIp} ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`;

    console.log(logLine);
    insertRequestLog({
      createdAt,
      ipAddress: req.ip,
      socketIpAddress: req.socket.remoteAddress || "",
      method: req.method,
      url: req.originalUrl,
      protocol: req.protocol,
      host: req.get("host") || "",
      userAgent: req.get("user-agent") || "",
      referrer: req.get("referer") || "",
      cookies: req.get("cookie") || "",
      cfConnectingIp: req.get("cf-connecting-ip") || "",
      cfRay: req.get("cf-ray") || "",
      cfCountry: req.get("cf-ipcountry") || "",
      forwardedFor: req.get("x-forwarded-for") || "",
      forwardedProto: req.get("x-forwarded-proto") || "",
      headers: req.headers,
      statusCode: res.statusCode,
      durationMs,
    }).catch((error) => {
      console.error("Failed to persist request log:", errorMessage(error));
    });
  });

  next();
});

async function createSchema(log) {
  await database.query(`
    CREATE TABLE IF NOT EXISTS request_logger (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL,
      ip_address TEXT NOT NULL,
      socket_ip_address TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      protocol TEXT NOT NULL DEFAULT '',
      host TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      referrer TEXT NOT NULL DEFAULT '',
      cookies TEXT NOT NULL DEFAULT '',
      cf_connecting_ip TEXT NOT NULL DEFAULT '',
      cf_ray TEXT NOT NULL DEFAULT '',
      cf_country TEXT NOT NULL DEFAULT '',
      forwarded_for TEXT NOT NULL DEFAULT '',
      forwarded_proto TEXT NOT NULL DEFAULT '',
      headers JSONB NOT NULL DEFAULT '{}'::JSONB,
      status_code INTEGER NOT NULL,
      duration_ms DOUBLE PRECISION NOT NULL
    )
  `);
}

async function insertRequestLog({
  createdAt,
  ipAddress,
  socketIpAddress,
  method,
  url,
  protocol,
  host,
  userAgent,
  referrer,
  cookies,
  cfConnectingIp,
  cfRay,
  cfCountry,
  forwardedFor,
  forwardedProto,
  headers,
  statusCode,
  durationMs,
}) {
  if (process.env.DEVELOPMENT) return;
  if (!isDatabaseConnected) return;
  await database.query(
    `INSERT INTO request_logger
      (created_at, ip_address, socket_ip_address, method, url, protocol, host,
       user_agent, referrer, cookies, cf_connecting_ip, cf_ray, cf_country,
       forwarded_for, forwarded_proto, headers, status_code, duration_ms)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
       $16, $17, $18)`,
    [
      createdAt,
      ipAddress,
      socketIpAddress,
      method,
      url,
      protocol,
      host,
      userAgent,
      referrer,
      cookies,
      cfConnectingIp,
      cfRay,
      cfCountry,
      forwardedFor,
      forwardedProto,
      headers,
      statusCode,
      durationMs,
    ]
  );
}

app.use((req, res) => {
  if (process.env.REDIRECT_URL) {
    if (process.env.REDIRECT_LOG === "true") 
      console.log(`Redirecting ${req.originalUrl} to ${process.env.REDIRECT_URL}${req.originalUrl}`);
    if (process.env.REDIRECT_STATIC != "true") 
      return res.redirect(`${process.env.REDIRECT_URL}${req.originalUrl}`);
    return res.redirect(process.env.REDIRECT_URL);
  }

  return res.status(404).send("<pre style=\"word-wrap: break-word; white-space: pre-wrap;\">404 page not found</pre>");
});

const port = process.env.PORT || 3000;

app.listen(port, async () => {
  console.log(`Server is running on port ${port}`);
  try {
    await createSchema();
    isDatabaseConnected = true;
    console.log("Database schema is ready.");
  } catch (error) {
    isDatabaseConnected = false;
    console.error("Failed to create database schema:", errorMessage(error));
  }
});

function errorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}