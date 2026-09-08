import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

/**
 * Constant-time safe string comparison to prevent timing attacks
 */
export function safeTimingCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Resolves the backend webhook URL strictly from environment variables
 */
export function getBackendWebhookUrl(): string {
  return (process.env.ZAPIER_WEBHOOK_URL || process.env.HOUZZ_WEBHOOK_URL || '').trim();
}

/**
 * Inbound Webhook Secret Validator (Angi, Universal Inbound)
 * Strict header-only authentication:
 * - x-webhook-secret
 * - x-webhook-token
 * - x-api-key
 * - Authorization: Bearer <secret>
 * Query parameter tokens are rejected.
 * Fails closed if WEBHOOK_SECRET_KEY is empty/missing.
 */
export function validateWebhookSecret(req: express.Request): boolean {
  const expectedSecret = process.env.WEBHOOK_SECRET_KEY ? process.env.WEBHOOK_SECRET_KEY.trim() : '';
  if (!expectedSecret) {
    console.warn('[Webhook Auth] Rejected: WEBHOOK_SECRET_KEY is not configured on the server');
    return false;
  }

  // Header-based only (NO query parameters allowed)
  const headerToken =
    req.headers['x-webhook-secret'] ||
    req.headers['x-webhook-token'] ||
    req.headers['x-api-key'] ||
    req.headers['authorization'];

  if (!headerToken || typeof headerToken !== 'string') return false;
  const cleanToken = headerToken.replace(/^Bearer\s+/i, '').trim();
  return safeTimingCompare(cleanToken, expectedSecret);
}

/**
 * Inbound Thumbtack Webhook Validator
 * Strict HTTP Basic Authentication only using:
 * - THUMBTACK_WEBHOOK_USERNAME
 * - THUMBTACK_WEBHOOK_PASSWORD
 * Fails closed if either variable is missing.
 * WEBHOOK_SECRET_KEY must never authenticate Thumbtack.
 */
export function validateThumbtackAuth(req: express.Request): boolean {
  const expectedUser = process.env.THUMBTACK_WEBHOOK_USERNAME ? process.env.THUMBTACK_WEBHOOK_USERNAME.trim() : '';
  const expectedPass = process.env.THUMBTACK_WEBHOOK_PASSWORD ? process.env.THUMBTACK_WEBHOOK_PASSWORD.trim() : '';

  if (!expectedUser || !expectedPass) {
    console.warn('[Thumbtack Auth] Rejected: THUMBTACK_WEBHOOK_USERNAME or THUMBTACK_WEBHOOK_PASSWORD is not configured on the server');
    return false;
  }

  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Basic ')) {
    try {
      const base64Credentials = authHeader.split('Basic ')[1].trim();
      const decoded = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const colonIdx = decoded.indexOf(':');
      if (colonIdx !== -1) {
        const username = decoded.substring(0, colonIdx);
        const password = decoded.substring(colonIdx + 1);
        if (safeTimingCompare(username, expectedUser) && safeTimingCompare(password, expectedPass)) {
          return true;
        }
      }
    } catch {}
  }

  return false;
}

// Rate limiter: Max 60 requests per minute per IP for webhook ingest
const webhookRateLimits = new Map<string, { count: number; resetTime: number }>();

export function isWebhookRateLimited(ip: string): boolean {
  const now = Date.now();
  const record = webhookRateLimits.get(ip);
  if (!record || now > record.resetTime) {
    webhookRateLimits.set(ip, { count: 1, resetTime: now + 60000 });
    return false;
  }
  record.count++;
  return record.count > 60;
}
