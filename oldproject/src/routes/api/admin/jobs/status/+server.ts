import { authMiddleware } from '$lib/middleware/auth';
import { backgroundJobsService } from '$lib/services/server/background-jobs.service';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	try {
		// Apply authentication middleware
		const authResult = authMiddleware.protected(event);
		if (!authResult.authenticated) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const statuses = backgroundJobsService.getJobStatuses();
		const isShuttingDown = backgroundJobsService.isShutdownInProgress();

		return json({
			success: true,
			isShuttingDown,
			jobs: statuses,
			summary: {
				totalJobs: statuses.length,
				runningJobs: statuses.filter((job) => job.isRunning).length,
				errorJobs: statuses.filter((job) => job.errorCount > 0).length
			}
		});
	} catch (error) {
		console.error('Background jobs status error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
