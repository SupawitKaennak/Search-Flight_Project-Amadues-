/**
 * Scheduled Jobs Service
 * รันงานอัตโนมัติตามเวลาที่กำหนด
 * 
 * Features:
 * - Sync Amadeus Flight Prices ทุกวัน เวลา 02:00 น.
 */

import * as cron from 'node-cron';
import { amadeusSyncService } from './amadeusSyncService';

export class SchedulerService {
  private jobs: cron.ScheduledTask[] = [];

  /**
   * เริ่ม Scheduled Jobs ทั้งหมด
   */
  startAll(): void {
    console.log('\n📅 Starting scheduled jobs...');
    console.log('='.repeat(60));

    // Start Amadeus sync service
    amadeusSyncService.start();

    console.log('='.repeat(60));
    console.log(`✅ Started scheduled jobs\n`);
  }

  /**
   * หยุด Scheduled Jobs ทั้งหมด
   */
  stopAll(): void {
    console.log('🛑 Stopping scheduled jobs...');
    amadeusSyncService.stop();
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    console.log('✅ All scheduled jobs stopped');
  }
}

export const schedulerService = new SchedulerService();

