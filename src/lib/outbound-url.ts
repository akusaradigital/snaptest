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
    const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    return mapped ? isPrivateOrReservedIp(mapped) :
      ip.startsWith('2001:db8:') || ip.startsWith('2001:10:') || ip.startsWith('2001:2:') || ip.startsWith('100::');
  }
  return true;
}

export async function validateOutboundUrl(input: string): Promise<URL> {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('Invalid outbound URL'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('Only HTTP(S) URLs are allowed');
  if (url.username || url.password) throw new Error('URL credentials are not allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Private or reserved destinations are not allowed');
  }
  const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error('Private or reserved destinations are not allowed');
  }
  return url;
}

export async function validatedAxiosRequest<T = any>(urlInput: string, config: AxiosRequestConfig = {}): Promise<AxiosResponse<T>> {
  let url = (await validateOutboundUrl(urlInput)).toString();
  for (let redirects = 0; ; redirects++) {
    const response = await axios.request<T>({ ...config, url, maxRedirects: 0, validateStatus: () => true });
    if (![301, 302, 303, 307, 308].includes(response.status) || !response.headers.location) return response;
    if (redirects >= MAX_REDIRECTS) throw new Error('Too many redirects');
    url = (await validateOutboundUrl(new URL(response.headers.location, url).toString())).toString();
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && config.method?.toUpperCase() === 'POST')) {
      config = { ...config, method: 'GET', data: undefined };
    }
  }
}
