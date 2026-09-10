import assert from 'node:assert/strict';
import { parseImageData, supportsVision } from '../src/app/api/ai/llm';

// 1. parseImageData checks
const pngRaw = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const jpegRaw = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
const gifRaw = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const webpRaw = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA=';

// Raw base64 magic byte detection
const parsedPng = parseImageData(pngRaw);
assert.equal(parsedPng.mimeType, 'image/png');
assert.equal(parsedPng.base64, pngRaw);
assert.equal(parsedPng.dataUrl, `data:image/png;base64,${pngRaw}`);

const parsedJpeg = parseImageData(jpegRaw);
assert.equal(parsedJpeg.mimeType, 'image/jpeg');
assert.equal(parsedJpeg.base64, jpegRaw);
assert.equal(parsedJpeg.dataUrl, `data:image/jpeg;base64,${jpegRaw}`);

const parsedGif = parseImageData(gifRaw);
assert.equal(parsedGif.mimeType, 'image/gif');

const parsedWebp = parseImageData(webpRaw);
assert.equal(parsedWebp.mimeType, 'image/webp');

// Data URL input and jpg normalization
const parsedDataUrlJpg = parseImageData(`data:image/jpg;base64,${jpegRaw}`);
assert.equal(parsedDataUrlJpg.mimeType, 'image/jpeg');
assert.equal(parsedDataUrlJpg.base64, jpegRaw);
assert.equal(parsedDataUrlJpg.dataUrl, `data:image/jpeg;base64,${jpegRaw}`);

// Double prefix bug prevention
const parsedDoublePrefix = parseImageData(`data:image/png;base64,data:image/png;base64,${pngRaw}`);
assert.equal(parsedDoublePrefix.mimeType, 'image/png');
assert.equal(parsedDoublePrefix.base64, pngRaw);
assert.equal(parsedDoublePrefix.dataUrl, `data:image/png;base64,${pngRaw}`);

// Whitespace stripping
const parsedWhitespace = parseImageData(`\n  data:image/png;base64,  ${pngRaw.slice(0, 10)}\n  ${pngRaw.slice(10)}  \n`);
assert.equal(parsedWhitespace.mimeType, 'image/png');
assert.equal(parsedWhitespace.base64, pngRaw);

// 2. supportsVision checks
// OpenAI
assert.equal(supportsVision('openai', 'gpt-5.5'), true);
assert.equal(supportsVision('openai', 'gpt-5.4'), true);
assert.equal(supportsVision('openai', 'gpt-5.4-mini'), true);
assert.equal(supportsVision('openai', 'gpt-4o'), true);
assert.equal(supportsVision('openai', 'gpt-4o-mini'), true);
assert.equal(supportsVision('openai', 'gpt-4-turbo'), true);
assert.equal(supportsVision('openai', 'gpt-4.1'), true);
assert.equal(supportsVision('openai', 'o1'), true);
assert.equal(supportsVision('openai', 'o4'), true);
assert.equal(supportsVision('openai', 'o1-mini'), false);
assert.equal(supportsVision('openai', 'o3-mini'), false);
assert.equal(supportsVision('openai', 'gpt-3.5-turbo'), false);

// 9Router & 9Router-Public
assert.equal(supportsVision('9router', 'cc/claude-3-7-sonnet'), true);
assert.equal(supportsVision('9router-public', 'cc/claude-3-5-sonnet'), true);
assert.equal(supportsVision('9router', 'cx/gpt-4o'), true);
assert.equal(supportsVision('9router', 'cx/gpt-5.4'), true);
assert.equal(supportsVision('9router', 'cx/o1'), true);
assert.equal(supportsVision('9router', 'cx/o1-mini'), false);
assert.equal(supportsVision('9router', 'cx/o3-mini'), false);
assert.equal(supportsVision('9router', 'gpt-4o'), true);
assert.equal(supportsVision('9router', 'gpt-5.5'), true);
assert.equal(supportsVision('9router', 'claude-3-5-sonnet'), true);
assert.equal(supportsVision('9router', 'gemini-2.0-flash'), true);
assert.equal(supportsVision('9router', 'qwen-vl-max'), true);
assert.equal(supportsVision('9router', 'llama-3.2-11b-vision-preview'), true);
assert.equal(supportsVision('9router', 'qd/unsupported'), false);
assert.equal(supportsVision('9router', 'unsupported-text-model'), false);

// Groq
assert.equal(supportsVision('groq', 'meta-llama/llama-4-scout-17b-16e-instruct'), true);
assert.equal(supportsVision('groq', 'llama-3.2-11b-vision-preview'), true);
assert.equal(supportsVision('groq', 'llama-3.1-8b-instant'), false);

// Alibaba
assert.equal(supportsVision('alibaba', 'qwen-vl-max'), true);
assert.equal(supportsVision('alibaba', 'qwen3.6-plus'), true);

console.log('vision-llm-check passed');
