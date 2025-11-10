import { NextResponse } from 'next/server';

import { getGoogleCalendarClientSecret, getServerGoogleCalendarClientId } from '@/lib/google-calendar/serverConfig';

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

type TokenRequestBody = {
  code?: unknown;
  codeVerifier?: unknown;
  redirectUri?: unknown;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = (await request.json()) as TokenRequestBody;
    const code = typeof body.code === 'string' ? body.code : '';
    const codeVerifier = typeof body.codeVerifier === 'string' ? body.codeVerifier : '';
    const redirectUri = typeof body.redirectUri === 'string' ? body.redirectUri : '';

    if (!code || !codeVerifier || !redirectUri) {
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'code, codeVerifier, redirectUri は必須です。' },
        { status: 400 },
      );
    }

    const params = new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      client_id: getServerGoogleCalendarClientId(),
      client_secret: getGoogleCalendarClientSecret(),
      grant_type: 'authorization_code',
      access_type: 'offline',
    });

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const text = await response.text();
    const payload: TokenResponse | string = safeJsonParse(text);

    if (!response.ok) {
      const errorPayload =
        typeof payload === 'string'
          ? { error: 'token_exchange_failed', error_description: payload }
          : payload;
      const status = response.status || 500;
      return NextResponse.json(errorPayload, { status });
    }

    if (typeof payload === 'string') {
      return NextResponse.json(
        { error: 'invalid_response', error_description: 'Googleのトークンエンドポイントから不正なレスポンスが返されました。' },
        { status: 502 },
      );
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Google カレンダーのトークン交換に失敗しました。', error);
    return NextResponse.json(
      { error: 'internal_error', error_description: 'Googleカレンダーのトークン交換に失敗しました。' },
      { status: 500 },
    );
  }
}

function safeJsonParse(text: string): TokenResponse | string {
  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    return text;
  }
}
