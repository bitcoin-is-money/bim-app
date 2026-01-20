<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import { AuthService } from '$lib/services/client/auth.service';
	import { currentUser, logout } from '$lib/stores/auth';
	import { onMount } from 'svelte';

	const authService = AuthService.getInstance();

	const handleLogout = async () => {
		await logout();
	};

	// Load enhanced user with WebAuthn credentials on component mount
	onMount(async () => {
		console.log('🔧 UserProfile onMount triggered');
		console.log('🔧 Current user state:', {
			hasCurrentUser: !!$currentUser,
			currentUserKeys: $currentUser ? Object.keys($currentUser) : null,
			hasWebauthnCredentials: !!$currentUser?.webauthnCredentials,
			fullUser: $currentUser
		});

		// Only load if we have a user but no webauthnCredentials
		if ($currentUser && !$currentUser.webauthnCredentials) {
			console.log('🔄 UserProfile: Loading enhanced user with WebAuthn credentials...');
			try {
				const enhancedUser = await authService.loadCurrentUser();
				console.log('🔄 UserProfile: Enhanced user loaded:', {
					success: !!enhancedUser,
					hasCredentials: !!enhancedUser?.webauthnCredentials,
					credentialsKeys: enhancedUser?.webauthnCredentials
						? Object.keys(enhancedUser.webauthnCredentials)
						: null
				});
			} catch (error) {
				console.error('❌ UserProfile: Failed to load enhanced user:', error);
			}
		} else {
			console.log('🔧 UserProfile: Skipping credential loading:', {
				reason: !$currentUser ? 'no user' : 'credentials already exist'
			});
		}
	});
</script>

{#if $currentUser}
	<Card>
		<div class="user-profile">
			<h2>Welcome, {$currentUser.username}!</h2>
			<Button variant="danger" on:click={handleLogout}>Logout</Button>
		</div>
	</Card>
{/if}

<style>
	.user-profile {
		display: flex;
		flex-direction: column;
		gap: 16px;
		color: #ffffff;
	}

	.user-info {
		color: #b0b0b0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.user-info div {
		margin: 0;
	}

	.user-info span {
		font-weight: bold;
		color: #ffffff;
	}
</style>
