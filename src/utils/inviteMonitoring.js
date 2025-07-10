/**
 * Invite System Monitoring
 * Tracks performance, detects suspicious activity, and provides health metrics
 */

class InviteMonitoring {
    constructor(inviteTracker, options = {}) {
        this.inviteTracker = inviteTracker;
        this.options = {
            suspiciousJoinThreshold: 10, // Joins per minute
            altDetectionAlertThreshold: 5, // Alts detected in last hour
            performanceLogInterval: 300000, // 5 minutes
            cleanupInterval: 86400000, // 24 hours
            ...options
        };
        
        this.metrics = {
            totalProcessed: 0,
            altsDetected: 0,
            errorCount: 0,
            averageProcessingTime: 0,
            joinsPerHour: [],
            lastCleanup: Date.now()
        };
        
        this.recentJoins = [];
        this.recentAlts = [];
        this.processingTimes = [];
        
        this.startMonitoring();
    }

    /**
     * Start monitoring intervals
     */
    startMonitoring() {
        // Performance logging
        setInterval(() => {
            this.logPerformanceMetrics();
        }, this.options.performanceLogInterval);

        // Cleanup old data
        setInterval(() => {
            this.cleanupOldData();
        }, this.options.cleanupInterval);

        console.log('[INVITE MONITORING] Monitoring started');
    }

    /**
     * Record a member join for monitoring
     */
    recordJoin(member, isAlt, processingTimeMs) {
        const now = Date.now();
        
        this.metrics.totalProcessed++;
        this.recentJoins.push(now);
        this.processingTimes.push(processingTimeMs);
        
        if (isAlt) {
            this.metrics.altsDetected++;
            this.recentAlts.push(now);
        }
        
        // Check for suspicious activity
        this.checkSuspiciousActivity();
        
        // Update average processing time
        this.updateAverageProcessingTime();
    }

    /**
     * Record an error for monitoring
     */
    recordError(error, context = '') {
        this.metrics.errorCount++;
        console.error(`[INVITE MONITORING] Error in ${context}:`, error);
        
        // Alert if error rate is high
        if (this.metrics.errorCount % 10 === 0) {
            console.warn(`[INVITE MONITORING] High error rate detected: ${this.metrics.errorCount} errors`);
        }
    }

    /**
     * Check for suspicious join patterns
     */
    checkSuspiciousActivity() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const oneHourAgo = now - 3600000;
        
        // Check recent joins (last minute)
        const recentJoinsCount = this.recentJoins.filter(timestamp => timestamp > oneMinuteAgo).length;
        
        if (recentJoinsCount >= this.options.suspiciousJoinThreshold) {
            console.warn(`[INVITE MONITORING] 🚨 SUSPICIOUS ACTIVITY: ${recentJoinsCount} joins in the last minute`);
            this.alertSuspiciousActivity('rapid_joins', {
                count: recentJoinsCount,
                timeframe: '1 minute'
            });
        }
        
        // Check alt detection rate (last hour)
        const recentAltsCount = this.recentAlts.filter(timestamp => timestamp > oneHourAgo).length;
        
        if (recentAltsCount >= this.options.altDetectionAlertThreshold) {
            console.warn(`[INVITE MONITORING] 🚨 HIGH ALT RATE: ${recentAltsCount} alts detected in the last hour`);
            this.alertSuspiciousActivity('high_alt_rate', {
                count: recentAltsCount,
                timeframe: '1 hour'
            });
        }
    }

    /**
     * Alert suspicious activity (can be extended to send to Discord channel)
     */
    alertSuspiciousActivity(type, data) {
        const alerts = {
            rapid_joins: `⚠️ **Rapid Join Alert**: ${data.count} members joined within ${data.timeframe}. Possible raid attempt.`,
            high_alt_rate: `🔴 **High Alt Detection**: ${data.count} alts detected in ${data.timeframe}. Review invite sources.`
        };
        
        const message = alerts[type] || `Unknown suspicious activity: ${type}`;
        console.warn(`[INVITE MONITORING] ${message}`);
        
        // TODO: Send to Discord moderation channel
        // this.sendAlert(message);
    }

    /**
     * Update average processing time
     */
    updateAverageProcessingTime() {
        if (this.processingTimes.length > 0) {
            const sum = this.processingTimes.reduce((a, b) => a + b, 0);
            this.metrics.averageProcessingTime = sum / this.processingTimes.length;
        }
    }

    /**
     * Log performance metrics
     */
    logPerformanceMetrics() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        
        // Calculate joins per hour
        const joinsLastHour = this.recentJoins.filter(timestamp => timestamp > oneHourAgo).length;
        this.metrics.joinsPerHour.push({ timestamp: now, count: joinsLastHour });
        
        // Keep only last 24 hours of hourly data
        this.metrics.joinsPerHour = this.metrics.joinsPerHour.filter(entry => entry.timestamp > now - 86400000);
        
        console.log(`[INVITE MONITORING] Performance Report:
            - Total Processed: ${this.metrics.totalProcessed}
            - Alts Detected: ${this.metrics.altsDetected} (${((this.metrics.altsDetected / this.metrics.totalProcessed) * 100).toFixed(1)}%)
            - Joins Last Hour: ${joinsLastHour}
            - Average Processing Time: ${this.metrics.averageProcessingTime.toFixed(2)}ms
            - Error Count: ${this.metrics.errorCount}
        `);
    }

    /**
     * Cleanup old monitoring data
     */
    cleanupOldData() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const oneDayAgo = now - 86400000;
        
        // Clean up recent joins (keep last hour)
        this.recentJoins = this.recentJoins.filter(timestamp => timestamp > oneHourAgo);
        
        // Clean up recent alts (keep last hour)
        this.recentAlts = this.recentAlts.filter(timestamp => timestamp > oneHourAgo);
        
        // Clean up processing times (keep last 1000 entries)
        if (this.processingTimes.length > 1000) {
            this.processingTimes = this.processingTimes.slice(-1000);
        }
        
        this.metrics.lastCleanup = now;
        console.log('[INVITE MONITORING] Cleanup completed');
    }

    /**
     * Get current health status
     */
    getHealthStatus() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        
        const recentJoins = this.recentJoins.filter(timestamp => timestamp > oneHourAgo).length;
        const recentAlts = this.recentAlts.filter(timestamp => timestamp > oneHourAgo).length;
        const altRate = this.metrics.totalProcessed > 0 ? (this.metrics.altsDetected / this.metrics.totalProcessed) * 100 : 0;
        
        const status = {
            healthy: this.metrics.errorCount < 5 && this.metrics.averageProcessingTime < 1000,
            metrics: {
                totalProcessed: this.metrics.totalProcessed,
                altsDetected: this.metrics.altsDetected,
                altDetectionRate: altRate.toFixed(1) + '%',
                joinsLastHour: recentJoins,
                altsLastHour: recentAlts,
                averageProcessingTime: this.metrics.averageProcessingTime.toFixed(2) + 'ms',
                errorCount: this.metrics.errorCount,
                lastCleanup: new Date(this.metrics.lastCleanup).toISOString()
            },
            alerts: []
        };
        
        // Add alerts based on current status
        if (this.metrics.errorCount > 10) {
            status.alerts.push('High error rate detected');
        }
        
        if (this.metrics.averageProcessingTime > 2000) {
            status.alerts.push('Slow processing time detected');
        }
        
        if (recentJoins > 50) {
            status.alerts.push('Unusually high join rate');
        }
        
        if (recentAlts > 10) {
            status.alerts.push('High alt detection rate');
        }
        
        return status;
    }

    /**
     * Generate performance report
     */
    generateReport(hours = 24) {
        const now = Date.now();
        const timeAgo = now - (hours * 3600000);
        
        const relevantHourlyData = this.metrics.joinsPerHour.filter(entry => entry.timestamp > timeAgo);
        const totalJoins = relevantHourlyData.reduce((sum, entry) => sum + entry.count, 0);
        const averageJoinsPerHour = relevantHourlyData.length > 0 ? totalJoins / relevantHourlyData.length : 0;
        const peakJoins = relevantHourlyData.length > 0 ? Math.max(...relevantHourlyData.map(entry => entry.count)) : 0;
        
        return {
            timeframe: `${hours} hours`,
            totalJoins,
            averageJoinsPerHour: averageJoinsPerHour.toFixed(1),
            peakJoinsPerHour: peakJoins,
            totalAltsDetected: this.metrics.altsDetected,
            altDetectionRate: this.metrics.totalProcessed > 0 ? ((this.metrics.altsDetected / this.metrics.totalProcessed) * 100).toFixed(1) + '%' : '0%',
            systemHealth: this.getHealthStatus(),
            hourlyBreakdown: relevantHourlyData.map(entry => ({
                hour: new Date(entry.timestamp).toISOString(),
                joins: entry.count
            }))
        };
    }
}

module.exports = InviteMonitoring; 