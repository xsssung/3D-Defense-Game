// spawner.js
// Controls enemy spawn timing per wave, separate from EnemyManager movement/AI.

export class WaveSpawner {
	/**
	 * @param {EnemyManager} enemyManager - The EnemyManager instance that actually creates enemies.
	 * @param {Object} waveConfigs - Optional custom wave config map: { [waveIndex]: { maxInterval, minInterval } }
	 */
	constructor(enemyManager, waveConfigs = null) {
		this.enemyManager = enemyManager;

		// Time since last spawn (ms)
		this.elapsedSinceSpawn = 0;

		// Current wave index (1-based)
		this.currentWave = 1;

		// Track whether a mid-wave mini boss has been spawned this wave
		this.miniBossSpawned = false;

		// Default per-wave spawn interval configs (ms)
		// As the wave progresses (progress 0 -> 1),
		// spawn interval linearly moves from maxInterval to minInterval.
		const defaultConfigs = {
			1: { maxInterval: 1500, minInterval: 400 }, // Wave 1: starts slow, ends fairly fast
			2: { maxInterval: 1200, minInterval: 350 }, // Wave 2: overall faster
			3: { maxInterval: 1000, minInterval: 300 }, // Wave 3: even faster
		};

		this.waveConfigs = waveConfigs || defaultConfigs;
	}

	/**
	 * Set the current wave index (for later multi-wave support).
	 * Also resets the internal timer and mini-boss flag.
	 * @param {number} waveIndex
	 */
	setWave(waveIndex) {
		this.currentWave = waveIndex;
		this.resetTimer();
	}

	/**
	 * Reset internal spawn timer and mini-boss flag.
	 * Call this when a new wave starts.
	 */
	resetTimer() {
		this.elapsedSinceSpawn = 0;
		this.miniBossSpawned = false;
	}

	/**
	 * Main update function.
	 * Call this every frame from the game loop.
	 *
	 * @param {number} deltaTime - Time since last frame in seconds.
	 * @param {number} waveProgress - 0.0 ~ 1.0, how far the current wave has progressed.
	 */
	update(deltaTime, waveProgress = 0) {
		// If enemyManager is missing or spawning is globally disabled, do nothing.
		if (!this.enemyManager || !this.enemyManager.spawningEnabled) return;

		// Clamp waveProgress between 0 and 1
		let p = waveProgress;
		if (typeof p !== 'number') p = 0;
		if (p < 0) p = 0;
		if (p > 1) p = 1;

		// Get config for current wave, fall back to wave 1 if missing
		const cfg =
			this.waveConfigs[this.currentWave] || this.waveConfigs[1];

		const maxI = cfg.maxInterval;
		const minI = cfg.minInterval;

		// Linear interpolation between maxInterval (at start of wave)
		// and minInterval (at end of wave)
		const currentInterval = maxI - (maxI - minI) * p; // ms

		// Accumulate time since last spawn (convert seconds -> ms)
		this.elapsedSinceSpawn += deltaTime * 1000;

		// Time to spawn a new enemy
		if (this.elapsedSinceSpawn >= currentInterval) {
			// Mid-wave mini boss: spawn once per wave around the middle
			if (
				!this.miniBossSpawned &&
				p > 0.4 &&
				p < 0.9 &&
				typeof this.enemyManager.spawnMiniBoss === 'function'
			) {
				this.enemyManager.spawnMiniBoss();
				this.miniBossSpawned = true;
			} else {
				// Default: spawn a normal enemy
				if (typeof this.enemyManager.spawnEnemy === 'function') {
					this.enemyManager.spawnEnemy();
				}
			}

			// Reset timer (simple reset; you could subtract currentInterval for smoother timing)
			this.elapsedSinceSpawn = 0;
		}
	}
}
