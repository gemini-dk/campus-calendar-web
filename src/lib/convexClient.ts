'use client';

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

let client: ConvexHttpClient | null = null;

function resolveConvexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL が設定されていません。Convex のデプロイ URL を .env.local に設定してください。');
  }
  return url;
}

export function getConvexClient(): ConvexHttpClient {
  if (client) {
    return client;
  }
  client = new ConvexHttpClient(resolveConvexUrl());
  return client;
}

export { api as convexApi };
