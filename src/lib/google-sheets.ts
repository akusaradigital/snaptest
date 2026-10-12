/**
 * Helper utility for Google Sheets API v4 and Spreadsheet URL handling.
 */

export function extractSpreadsheetId(urlOrId?: string | null): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();
  // Standard Google Sheet URL formats:
  // https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
  // https://docs.google.com/spreadsheets/u/0/d/SPREADSHEET_ID/...
  const match = trimmed.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/);
  if (match) return match[1];
  // If user pasted bare ID (Google spreadsheet IDs are ~44 alphanumeric/dash/underscore chars)
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed) && !trimmed.includes('/')) {
    return trimmed;
  }
  return null;
}

export function buildSpreadsheetUrl(spreadsheetId: string, sheetId?: string | number): string {
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
  if (sheetId !== undefined && sheetId !== null) {
    return `${base}#gid=${sheetId}`;
  }
  return base;
}

interface SheetProperties {
  sheetId: number;
  title: string;
}

/**
 * Fetch spreadsheet metadata to check available sheet tabs.
 */
export async function getSpreadsheetSheets(
  accessToken: string,
  spreadsheetId: string
): Promise<SheetProperties[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    const message = errorJson.error?.message || `Google Sheets API error (${res.status})`;
    throw new Error(message);
  }

  const data = await res.json();
  const sheets = data.sheets || [];
  return sheets.map((s: any) => ({
    sheetId: s.properties?.sheetId ?? 0,
    title: s.properties?.title || 'Sheet1',
  }));
}

/**
 * Creates a new tab/sheet in the spreadsheet if it does not already exist.
 */
export async function ensureSheetTabExists(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<{ sheetId: number; created: boolean }> {
  const existingSheets = await getSpreadsheetSheets(accessToken, spreadsheetId);
  const found = existingSheets.find(
    (s) => s.title.toLowerCase() === sheetName.toLowerCase()
  );
  if (found) {
    return { sheetId: found.sheetId, created: false };
  }

  // Create the new sheet tab
  const addUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
  const res = await fetch(addUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
            },
          },
        },
      ],
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || 'Failed to create sheet tab in spreadsheet');
  }

  const data = await res.json();
  const newSheetId = data.replies?.[0]?.addSheet?.properties?.sheetId ?? 0;
  return { sheetId: newSheetId, created: true };
}

/**
 * Checks whether a sheet tab has any data.
 */
export async function isSheetEmpty(
  accessToken: string,
  spreadsheetId: string,
  sheetName: string
): Promise<boolean> {
  const range = encodeURIComponent(`${sheetName}!A1:Z1`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) return true;
  const data = await res.json();
  return !data.values || data.values.length === 0;
}

/**
 * Appends rows to a spreadsheet tab, inserting headers first if the sheet is empty.
 */
export async function appendRowsViaGoogleApi({
  accessToken,
  spreadsheetId,
  sheetName,
  headers,
  rows,
}: {
  accessToken: string;
  spreadsheetId: string;
  sheetName: string;
  headers?: string[];
  rows: (string | number | boolean | null)[][];
}): Promise<{ updatedRows: number; sheetUrl: string }> {
  // 1. Ensure sheet tab exists
  const { sheetId, created } = await ensureSheetTabExists(accessToken, spreadsheetId, sheetName);

  // 2. Determine if headers need to be written
  const rowsToWrite: (string | number | boolean | null)[][] = [];
  const isEmpty = created || (await isSheetEmpty(accessToken, spreadsheetId, sheetName));

  if (isEmpty && headers && headers.length > 0) {
    rowsToWrite.push(headers);
  }
  rowsToWrite.push(...rows);

  if (rowsToWrite.length === 0) {
    return {
      updatedRows: 0,
      sheetUrl: buildSpreadsheetUrl(spreadsheetId, sheetId),
    };
  }

  // 3. Append rows
  const range = encodeURIComponent(`${sheetName}!A1`);
  const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(appendUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `${sheetName}!A1`,
      majorDimension: 'ROWS',
      values: rowsToWrite,
    }),
    cache: 'no-store',
  });

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}));
    throw new Error(errorJson.error?.message || 'Failed to append rows to Google Sheets');
  }

  const data = await res.json();
  const updatedRows = data.updates?.updatedRows || rowsToWrite.length;

  return {
    updatedRows,
    sheetUrl: buildSpreadsheetUrl(spreadsheetId, sheetId),
  };
}

/**
 * Refresh an expired Google OAuth access token using a refresh token.
 */
export async function refreshGoogleToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    cache: 'no-store',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error_description || err.error || 'Failed to refresh Google token');
  }

  return res.json();
}
