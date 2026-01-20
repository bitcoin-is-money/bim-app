<script lang="ts">
	import type { User } from '$lib/db';

	export let user: User;
</script>

<div class="user-info">
	<div>
		<strong>Username:</strong>
		{user.username}
	</div>
</div>

<style>
	.user-info {
		background: #1e1e1e;
		padding: 16px;
		border-radius: 8px;
		margin-bottom: 20px;
		border: 1px solid #404040;
	}

	.user-info div {
		margin: 8px 0;
		font-size: 14px;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.user-info {
			padding: 12px;
			margin-bottom: 16px;
		}

		.user-info div {
			font-size: 15px;
			margin: 6px 0;
		}
	}
</style>
