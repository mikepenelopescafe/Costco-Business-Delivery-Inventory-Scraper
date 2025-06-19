const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    // Check if running on Vercel
    this.isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV !== undefined;
    
    if (!this.isVercel) {
      this.logDir = path.join(__dirname, '../logs');
      this.ensureLogDir();
    }
  }

  ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  formatMessage(level, message, error = null) {
    const timestamp = new Date().toISOString();
    let logMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    
    if (error) {
      logMessage += `\nError: ${error.message}`;
      if (error.stack) {
        logMessage += `\nStack: ${error.stack}`;
      }
    }
    
    return logMessage;
  }

  writeToFile(filename, message) {
    // Skip file writing on Vercel
    if (this.isVercel) {
      return;
    }
    
    try {
      const filePath = path.join(this.logDir, filename);
      fs.appendFileSync(filePath, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  info(message, context = {}) {
    const logMessage = this.formatMessage('info', message);
    console.log(logMessage);
    this.writeToFile('app.log', logMessage);
    
    if (Object.keys(context).length > 0) {
      const contextMessage = `Context: ${JSON.stringify(context)}`;
      console.log(contextMessage);
      this.writeToFile('app.log', contextMessage);
    }
  }

  error(message, error = null, context = {}) {
    const logMessage = this.formatMessage('error', message, error);
    console.error(logMessage);
    this.writeToFile('error.log', logMessage);
    this.writeToFile('app.log', logMessage);
    
    if (Object.keys(context).length > 0) {
      const contextMessage = `Context: ${JSON.stringify(context)}`;
      console.error(contextMessage);
      this.writeToFile('error.log', contextMessage);
      this.writeToFile('app.log', contextMessage);
    }
  }

  warn(message, context = {}) {
    const logMessage = this.formatMessage('warn', message);
    console.warn(logMessage);
    this.writeToFile('app.log', logMessage);
    
    if (Object.keys(context).length > 0) {
      const contextMessage = `Context: ${JSON.stringify(context)}`;
      console.warn(contextMessage);
      this.writeToFile('app.log', contextMessage);
    }
  }

  debug(message, context = {}) {
    if (process.env.NODE_ENV === 'development') {
      const logMessage = this.formatMessage('debug', message);
      console.debug(logMessage);
      this.writeToFile('debug.log', logMessage);
      
      if (Object.keys(context).length > 0) {
        const contextMessage = `Context: ${JSON.stringify(context)}`;
        console.debug(contextMessage);
        this.writeToFile('debug.log', contextMessage);
      }
    }
  }

  // Job-specific logging
  jobStart(jobId) {
    this.info(`Scraping job ${jobId} started`);
  }

  jobComplete(jobId, stats) {
    this.info(`Scraping job ${jobId} completed`, stats);
  }

  jobFailed(jobId, error) {
    this.error(`Scraping job ${jobId} failed`, error, { jobId });
  }

  productProcessed(productName, isNew) {
    this.debug(`Product processed: ${productName} (${isNew ? 'new' : 'updated'})`);
  }

  // Cleanup old logs (keep last 30 days)
  cleanup() {
    // Skip cleanup on Vercel
    if (this.isVercel) {
      return;
    }
    
    try {
      const files = fs.readdirSync(this.logDir);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      files.forEach(file => {
        const filePath = path.join(this.logDir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`Deleted old log file: ${file}`);
        }
      });
    } catch (error) {
      console.error('Error cleaning up logs:', error);
    }
  }
}

// Export singleton instance
module.exports = new Logger();