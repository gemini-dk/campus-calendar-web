const AUTH_COOKIE_NAME = 'campus-calendar-auth';

type AuthCookiePayload = {
  uid: string;
  token: string;
  expiresAt: number;
};

export type ServerAuthContext = {
  uid: string;
  token: string;
};

export function extractAuthContext(request: Request): ServerAuthContext | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(';').map((entry) => entry.trim());
  const target = cookies.find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));
  if (!target) {
    return null;
  }
  const encodedValue = target.substring(target.indexOf('=') + 1);
  try {
    const decoded = decodeURIComponent(encodedValue);
    const parsed = JSON.parse(decoded) as Partial<AuthCookiePayload>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (typeof parsed.uid !== 'string' || typeof parsed.token !== 'string') {
      return null;
    }
    const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0;
    if (expiresAt && expiresAt <= Date.now()) {
      return null;
    }
    return { uid: parsed.uid, token: parsed.token } satisfies ServerAuthContext;
  } catch (error) {
    console.error('Failed to parse auth cookie', error);
    return null;
  }
}
