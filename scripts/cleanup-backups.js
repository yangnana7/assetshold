#!/usr/bin/env node

/**
 * Backup cleanup script for AssetsHold
 * 
 * Usage:
 *   node scripts/cleanup-backups.js [backup_directory] [keep_count]
 *   
 * Environment variables:
 *   KEEP_BACKUPS - Number of backups to keep (default: 10)
 *   
 * Examples:
 *   node scripts/cleanup-backups.js
 *   node scripts/cleanup-backups.js ./backup 5
 *   KEEP_BACKUPS=20 node scripts/cleanup-backups.js
 */

const fs = require('fs').promises;
const path = require('path');

async function ensureWritable(dirPath) {
  try {
    await fs.access(dirPath, fs.constants.F_OK);
  } catch (error) {
    throw new Error(`Backup directory not found: ${dirPath}`);
  }
  
  try {
    await fs.access(dirPath, fs.constants.W_OK);
  } catch (error) {
    throw new Error(`No write permission for directory: ${dirPath}`);
  }
  
  // Test actual write capability
  const testFile = path.join(dirPath, '.perm_test.tmp');
  try {
    await fs.writeFile(testFile, 'test');
    await fs.unlink(testFile);
  } catch (error) {
    throw new Error(`Cannot write to directory ${dirPath}: ${error.message}`);
  }
}

async function cleanupBackups(dirPath, keepCount = 10) {
  console.log(`Starting backup cleanup in: ${dirPath}`);
  console.log(`Keeping newest ${keepCount} files`);
  
  await ensureWritable(dirPath);
  
  // Get all files in the directory
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => path.join(dirPath, entry.name));
  
  if (files.length === 0) {
    console.log('No files found in backup directory');
    return;
  }
  
  // Get file stats and sort by modification time (newest first)
  const fileStats = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        return {
          path: filePath,
          name: path.basename(filePath),
          mtime: stats.mtimeMs,
          size: stats.size
        };
      } catch (error) {
        console.warn(`Warning: Cannot stat file ${filePath}: ${error.message}`);
        return null;
      }
    })
  );
  
  // Filter out any failed stat operations
  const validFiles = fileStats.filter(file => file !== null);
  
  // Sort by modification time (newest first)
  validFiles.sort((a, b) => b.mtime - a.mtime);
  
  const filesToKeep = validFiles.slice(0, keepCount);
  const filesToDelete = validFiles.slice(keepCount);
  
  console.log(`Found ${validFiles.length} files total`);
  console.log(`Will keep ${filesToKeep.length} newest files`);
  console.log(`Will delete ${filesToDelete.length} old files`);
  
  if (filesToDelete.length === 0) {
    console.log('No files to delete');
    return;
  }
  
  // Delete old files
  let deletedCount = 0;
  let deletedSize = 0;
  let errorCount = 0;
  
  for (const file of filesToDelete) {
    try {
      await fs.unlink(file.path);
      deletedCount++;
      deletedSize += file.size;
      console.log(`Deleted: ${file.name} (${formatFileSize(file.size)})`);
    } catch (error) {
      errorCount++;
      console.error(`Failed to delete ${file.name}: ${error.message}`);
    }
  }
  
  // Summary
  console.log('\n--- Cleanup Summary ---');
  console.log(`Files deleted: ${deletedCount}`);
  console.log(`Files failed: ${errorCount}`);
  console.log(`Space freed: ${formatFileSize(deletedSize)}`);
  console.log(`Files remaining: ${filesToKeep.length}`);
  
  // Show newest files being kept
  if (filesToKeep.length > 0) {
    console.log('\nNewest files kept:');
    filesToKeep.slice(0, 5).forEach(file => {
      const date = new Date(file.mtime).toISOString().slice(0, 19).replace('T', ' ');
      console.log(`  ${file.name} (${date})`);
    });
    if (filesToKeep.length > 5) {
      console.log(`  ... and ${filesToKeep.length - 5} more`);
    }
  }
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showUsage() {
  console.log(`Usage: node scripts/cleanup-backups.js [backup_directory] [keep_count]

Arguments:
  backup_directory  Path to backup directory (default: ./backup)
  keep_count       Number of newest files to keep (default: 10)

Environment variables:
  KEEP_BACKUPS     Override default keep count

Examples:
  node scripts/cleanup-backups.js
  node scripts/cleanup-backups.js ./backup 5
  KEEP_BACKUPS=20 node scripts/cleanup-backups.js`);
}

async function main() {
  try {
    const args = process.argv.slice(2);
    
    // Show help
    if (args.includes('--help') || args.includes('-h')) {
      showUsage();
      return;
    }
    
    // Determine backup directory
    const defaultDir = path.join(__dirname, '..', 'backup');
    const backupDir = args[0] ? path.resolve(args[0]) : defaultDir;
    
    // Determine keep count
    const envKeepCount = process.env.KEEP_BACKUPS;
    const argKeepCount = args[1];
    let keepCount = 10; // default
    
    if (argKeepCount) {
      keepCount = parseInt(argKeepCount, 10);
      if (isNaN(keepCount) || keepCount < 1) {
        throw new Error(`Invalid keep count: ${argKeepCount}. Must be a positive integer.`);
      }
    } else if (envKeepCount) {
      keepCount = parseInt(envKeepCount, 10);
      if (isNaN(keepCount) || keepCount < 1) {
        throw new Error(`Invalid KEEP_BACKUPS value: ${envKeepCount}. Must be a positive integer.`);
      }
    }
    
    await cleanupBackups(backupDir, keepCount);
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { cleanupBackups };