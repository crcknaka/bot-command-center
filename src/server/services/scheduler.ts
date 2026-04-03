import cron from 'node-cron';

interface ScheduledJob {
  id: string;
  task: cron.ScheduledTask;
}

class Scheduler {
  private jobs = new Map<string, ScheduledJob>();

  /**
   * Register a cron job.
   * @param id Unique identifier (e.g., "task-42")
   * @param cronExpression Standard cron expression (e.g., "0 9 * * *")
   * @param callback Function to execute on each tick
   */
  register(id: string, cronExpression: string, callback: () => Promise<void>) {
    // Remove existing job with same id
    this.unregister(id);

    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    const task = cron.schedule(cronExpression, async () => {
      try {
        await callback();
      } catch (err) {
        console.error(`❌ Cron job "${id}" failed:`, (err as Error).message);
      }
    });

    this.jobs.set(id, { id, task });
    console.log(`⏰ Cron job "${id}" registered: ${cronExpression}`);
  }

  /** Unregister and stop a cron job. */
  unregister(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.task.stop();
      this.jobs.delete(id);
    }
  }

  /** Stop all cron jobs. */
  stopAll() {
    for (const [id, job] of this.jobs) {
      job.task.stop();
    }
    this.jobs.clear();
    console.log('⏰ All cron jobs stopped');
  }

  /** Get count of active jobs. */
  get activeCount(): number {
    return this.jobs.size;
  }
}

export const scheduler = new Scheduler();
