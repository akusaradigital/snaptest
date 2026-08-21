import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_REDIRECTS = 5;

export function isPrivateOrReservedIp(address: string): boolean {
  const ip = address.toLowerCase().split('%')[0];
  if (isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) || a >= 224;
  }
  if (isIP(ip) === 6) {
    if (ip === '::' || ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || /^fe[89ab]/.test(ip)) return true;
    // Covers both the modern ::ffff:a.b.c.d mapped form and the legacy/deprecated
    // "IPv4-compatible" ::a.b.c.d form (still parsed as valid by some resolvers).
    const embedded = ip.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return embedded ? isPrivateOrReservedIp(embedded) :
      ip.startsWith('2001:db8:') || ip.startsWith('2001:10:') || ip.startsWith('2001:2:') || ip.startsWith('100::');
  }
  return true;
}

export interface OutboundUrlOptions {
  /** Allow http(s)://localhost destinations. Only safe when the server itself
   * runs locally (dev), since "localhost" resolves to the server's own loopback. */
  allowLocalhost?: boolean;
}

export async function validateOutboundUrl(input: string, opts: OutboundUrlOptions = {}): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Invalid outbound URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP(S) URLs are allowed');
  if (url.username || url.password) throw new Error('URL credentials are not allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const isLocalhost = hostname === 'localhost' || hostname.endsWith('.localhost');
  if (!hostname || (!opts.allowLocalhost && isLocalhost) || hostname.endsWith('.local')) {
    throw new Error('Private or reserved destinations are not allowed');
  }
  // Reject bare decimal/hex numeric hostnames (e.g. "2130706433" or "0x7f000001") some
  // resolvers still parse as packed IPv4 (127.0.0.1) even though net.isIP() doesn't
  // recognize them, which would otherwise slip past the IP-based checks below.
  if (/^\d+$/.test(hostname) || /^0x[0-9a-f]+$/.test(hostname)) {
    throw new Error('Private or reserved destinations are not allowed');
  }
  if (opts.allowLocalhost && isLocalhost) return url;
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error('Private or reserved destinations are not allowed');
  }
  return url;
}

export async function validatedAxiosRequest<T = any>(urlInput: string, config: AxiosRequestConfig = {}, opts: OutboundUrlOptions = {}): Promise<AxiosResponse<T>> {
  let url = (await validateOutboundUrl(urlInput, opts)).toString();
  for (let redirects = 0; ; redirects++) {
    const response = await axios.request<T>({ ...config, url, maxRedirects: 0, validateStatus: () => true });
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.location) return response;
    if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects');
    url = (await validateOutboundUrl(new URL(response.headers.location, url).toString(), opts)).toString();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && config.method?.toUpperCase() === 'POST')) {
      config = { ...config, method: 'GET', data: undefined };
    }
  }
}
