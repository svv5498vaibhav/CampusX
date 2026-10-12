import fs from 'node:fs/promises';
import logger from './logger.js';

/** Deletes a temporary upload. Safe to call more than once. */
export async function removeTempFile(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') logger.warn(`Could not remove temp upload ${filePath}: ${error.message}`);
  }
}
