export function canReleaseJob(job, userId, now = Date.now()) {
  return Boolean(userId && job.claimed_by === userId
    && (!job.assigned_to || job.assigned_to === userId)
    && ['claimed', 'scheduled'].includes(job.status)
    && !job.started_at && !job.completed_at
    && Date.parse(job.start_window) - now > 48 * 60 * 60 * 1000);
}
