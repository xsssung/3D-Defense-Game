// main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { World } from './world.js';
import { EnemyManager } from './enemies.js';
import { Tower } from './towers.js';
import { WaveSpawner } from './spawner.js';

// global variables
let scene, camera, renderer, controls;
let world, enemies;
let spawner;
let towers = [];            // List of all active towers
let lastTime = 0;           // Last frame time (for delta time)
let globalTime = 0;         // Elapsed game time in seconds 
let bossWarningShown = false;
let bossPhase = false;      // When true, keep the world dark (night)
let placingTower = null;    // Currently selected tower type ("basic")
let raycaster, mouse;
let health = 20;            // Player base health
let healthBar, healthFill, healthText;
let bossHealthBar, bossHealthFill, bossHealthText;
let towerUI;

// Wave / Timer / Warning UI
let topPanelEl;
let waveLabelEl;
let waveTimerEl;            // countdown 
let waveWarningEl;          // WARNING 
let centerMessageEl;        

let currentWave = 1;
const waveDuration = 60;    // seconds

let waveTimeLeft = waveDuration;
let waveTimerRunning = false;
let waveHasStarted = false;

let tooltipEl;              // tower stats tooltip element
let hoveredTower = null;    // currently hovered tower (3D)

// Grid cell size (used to align towers neatly to the ground grid))
const GRID_SIZE = 2;

const TOWER_COSTS = {
    basic: 5,
    double: 10,
    sniper: 15,
    tower4: 5
};

// Tower stats (hard-coded based on current design)
function getTowerStats(type, towerInstance = null) {
    const damage = (type === 'sniper') ? 10 : 1;   // sniper damage 10
    let range, fireDelayMs, shotsPerBurst, maxHp;

    if (type === 'core') {
        range = 16;
        fireDelayMs = 2400;
        shotsPerBurst = 1;
        maxHp = 9999;

    } else if (type === 'double') {
        range = 10;
        fireDelayMs = 1200;
        shotsPerBurst = 2;
        maxHp = 5;

    } else if (type === 'sniper') {
        range = 25;
        fireDelayMs = 7200;   // VERY slow (6x)
        shotsPerBurst = 1;
        maxHp = 5;

    } else if (type === 'tower4') {
        range = 10;
        fireDelayMs = 1200;
        shotsPerBurst = 1;
        maxHp = 5;

    } else {
        // basic
        range = 10;
        fireDelayMs = 1200;
        shotsPerBurst = 1;
        maxHp = 5;
    }

    const fireDelaySec = fireDelayMs / 1000;
    const shotsPerSec = shotsPerBurst / fireDelaySec;
    const dps = damage * shotsPerSec;

    let hp = maxHp;
    if (towerInstance) {
        if (typeof towerInstance.maxHp === 'number') maxHp = towerInstance.maxHp;
        if (typeof towerInstance.hp === 'number') hp = towerInstance.hp;
    }

    return {
        type,
        damage,
        range,
        fireDelayMs,
        shotsPerBurst,
        shotsPerSec,
        dps,
        hp,
        maxHp,
    };
}


let placementPreview = null;
let lastPreviewPos = null;

let coins = 0;              // Player money
let coinUI, coinAmount;     // Coin UI elements

// Update the health bar UI whenever HP changes
function updateHealthUI() {
	const percentage = Math.max(0, (health / 20) * 100);
	healthFill.style.width = `${percentage}%`;
	healthText.textContent = `HP: ${health}`;

	// Change color depending on HP level
	if (percentage > 50) {
	healthFill.style.background = 'linear-gradient(to right, #00e676, #76ff03)';
	} else if (percentage > 25) {
	healthFill.style.background = 'linear-gradient(to right, #ffeb3b, #ffc107)';
	} else {
	healthFill.style.background = 'linear-gradient(to right, #f44336, #d32f2f)';
	}
}

// Update the wave countdown timer text (format mm:ss)
function updateWaveTimerUI() {
	if (!waveTimerEl) return;

	const totalSeconds = Math.max(0, Math.floor(waveTimeLeft));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const secondsStr = seconds < 10 ? `0${seconds}` : `${seconds}`;

	waveTimerEl.textContent = `${minutes}:${secondsStr}`;
}

function updateBossHealthUI() {
	if (!enemies || !bossHealthBar) return;

	if (typeof enemies.getBoss !== 'function') return;

	const boss = enemies.getBoss();
	if (!boss || !boss.userData) {
		bossHealthBar.style.display = 'none';
		return;
	}

	const hp = typeof boss.userData.hp === 'number' ? boss.userData.hp : 0;
	const maxHp =
		typeof boss.userData.maxHp === 'number' ? boss.userData.maxHp : 1;

	const ratio = Math.max(0, hp / maxHp);

	bossHealthFill.style.width = ratio * 100 + '%';
	bossHealthText.textContent = `Boss HP: ${hp} / ${maxHp}`;
	bossHealthBar.style.display = 'block';
}

// Show "3, 2, 1" and "Wave 1" at the center, then start the wave timer and enemy spawning
function startWaveIntro() {
	if (!centerMessageEl) {
		// If UI element is missing, just start immediately
		waveTimeLeft = waveDuration;
		waveTimerRunning = true;
		if (enemies) enemies.spawningEnabled = true;
		return;
	}

	// Reset timer
	waveTimeLeft = waveDuration;
	updateWaveTimerUI();
	waveTimerRunning = false;

	// Show countdown at center
	centerMessageEl.style.display = 'block';
	centerMessageEl.textContent = '3';

	setTimeout(() => {
		centerMessageEl.textContent = '2';
	}, 1000);

	setTimeout(() => {
		centerMessageEl.textContent = '1';
	}, 2000);

	setTimeout(() => {
		centerMessageEl.textContent = 'Wave 1';
	}, 3000);

	setTimeout(() => {
		centerMessageEl.style.display = 'none';

		// Start wave timer and enable enemy spawning after intro is done
		waveHasStarted = true;
		waveTimerRunning = true;
		if (enemies) enemies.spawningEnabled = true;
	}, 4000);
}

// Show a short "Warning" message at the center of the screen
function showBossWarning() {
	if (!centerMessageEl) return;

	centerMessageEl.style.display = 'block';
	centerMessageEl.textContent = 'WARNING';
	centerMessageEl.style.color = '#ff4444';   
	centerMessageEl.style.fontSize = '64px';   
	centerMessageEl.style.fontWeight = 'bold';
	centerMessageEl.style.textShadow = '0 0 20px #ff0000';

	setTimeout(() => {
		centerMessageEl.style.display = 'none';

		centerMessageEl.style.color = '';
		centerMessageEl.style.fontSize = '';
		centerMessageEl.style.textShadow = '';
	}, 1200);
}

// Update coin UI
function updateCoinUI() {
	if (!coinAmount) return;
	coinAmount.textContent = coins.toString();
}

// Show a temporary floating text near the coin UI 
function showCoinChange(amount) {
	if (!towerUI) return;

	const floatEl = document.createElement('div');
	floatEl.className = 'coin-float';

	if (typeof amount === 'number') {
		floatEl.textContent = (amount > 0 ? '+' : '') + amount;
		floatEl.style.color = amount > 0 ? '#00e676' : '#ff5252';
	} else {
		floatEl.textContent = amount;
		floatEl.style.color = '#ff5252';
	}

	towerUI.appendChild(floatEl);

	// Make sure initial transform matches CSS (centered, Y = 0)
	floatEl.style.transform = 'translate(-50%, 0)';

	// Keep visible for 1 second, then move straight upward
	setTimeout(() => {
		floatEl.style.transform = 'translate(-50%, -40px)';  // up only
		floatEl.style.opacity = '0';
	}, 1000);

	// Remove after fade-out finishes
	setTimeout(() => {
		if (floatEl.parentNode === towerUI) {
			towerUI.removeChild(floatEl);
		}
	}, 1700);
}

// Show tower stats tooltip near the mouse position
function showTowerTooltip(stats, clientX, clientY) {
	if (!tooltipEl) return;

	let text = `Type: ${stats.type}\n`;

	// Only show HP if it's not the core
	if (stats.type !== 'core') {
		text += `HP: ${stats.hp}/${stats.maxHp}\n`;
	}

	text +=
		`Damage: ${stats.damage}\n` +
		`Range: ${stats.range}\n` +
		`Fire Rate: ${stats.shotsPerSec.toFixed(2)} shots/sec\n` +
		`DPS: ${stats.dps.toFixed(2)}`;

	tooltipEl.textContent = text;
	tooltipEl.style.display = 'block';
	tooltipEl.style.left = `${clientX + 12}px`;
	tooltipEl.style.top  = `${clientY - 10}px`;
}

// Hide tower stats tooltip
function hideTowerTooltip() {
	if (!tooltipEl) return;
	tooltipEl.style.display = 'none';
}



// Initialize the 3D scene and start the game
function initGame() {
	console.log('initGame()');

	const container = document.getElementById('game-container');
	healthBar = document.getElementById('health-bar');
	towerUI = document.getElementById('tower-ui');
	healthFill = document.getElementById('health-fill');
	healthText = document.getElementById('health-text');
	
	coinUI = document.getElementById('coin-ui');
	coinAmount = document.getElementById('coin-amount');
	tooltipEl = document.getElementById('tower-tooltip');
	
	// Boss HP UI elements
	bossHealthBar  = document.getElementById('boss-health-bar');
	bossHealthFill = document.getElementById('boss-health-fill');
	bossHealthText = document.getElementById('boss-health-text');
	if (bossHealthBar) {
		bossHealthBar.style.display = 'none'; 
	}
	
	// Get wave / timer / warning / center-message elements
	topPanelEl     = document.getElementById('top-panel');
	waveLabelEl    = document.getElementById('wave-label');
	waveTimerEl    = document.getElementById('wave-timer');
	waveWarningEl  = document.getElementById('wave-warning');
	centerMessageEl = document.getElementById('center-message');
	
	// show wave
	currentWave = 1;
	if (waveLabelEl) {
		waveLabelEl.textContent = `Wave ${currentWave}`;
	}
	if (waveWarningEl) {
		waveWarningEl.textContent = '';
	}

	// Show UI elements
	healthBar.style.display = 'block';
	towerUI.style.display = 'flex';
	coinUI.style.display = 'block';
	if (topPanelEl) {
		topPanelEl.style.display = 'block';
	}
	
	// Initialize wave timer text
	waveTimeLeft = waveDuration;
	updateWaveTimerUI();
	waveTimerRunning = false;
	
	health = 20;
	updateHealthUI();
	
	coins = 0;
	updateCoinUI();

	// Scene setup 
	scene = new THREE.Scene();
	scene.background = new THREE.Color(0x87ceeb);

	camera = new THREE.PerspectiveCamera(
		60,
		window.innerWidth / window.innerHeight,
		0.1,
		1000
	);
	camera.position.set(25, 25, 25);
	camera.lookAt(0, 0, 0);

	// Renderer setup
	renderer = new THREE.WebGLRenderer({ antialias: true });
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.shadowMap.enabled = true;
	container.innerHTML = '';
	container.appendChild(renderer.domElement);
	
	// mouse camera movement
	controls = new OrbitControls(camera, renderer.domElement);
	controls.target.set(0, 0, 0);
	controls.update();

	// for detecting ground clicks
	raycaster = new THREE.Raycaster();
	mouse = new THREE.Vector2();

	// Initialize world and enemies
	world = new World(scene);
	world.init();

    if (world && typeof world.setBiomeForWave === 'function') {
        world.setBiomeForWave(currentWave);
    }
	
	enemies = new EnemyManager(scene, new THREE.Vector3(0, 0, 0));
	
	// Disable enemy spawning until countdown finishes
	enemies.spawningEnabled = false;
	
	// Create wave spawner linked to this enemy manager
	spawner = new WaveSpawner(enemies);
	
	// Main core also attacks as a basic tower
	if (world.core) {
		const coreTower = new Tower(
			scene,
			world.core.position,
			'core',            // basic attack pattern
			handleEnemyKilled,  // reuse enemy kill callback (for coins 등)
			world.core          // use existing core mesh
		);
		towers.push(coreTower);
	}

	// Create transparent preview cube (wireframe)
	const previewGeo = new THREE.BoxGeometry(GRID_SIZE, 3, GRID_SIZE);
	const previewMat = new THREE.MeshStandardMaterial({
		color: 0xffd700,
		transparent: true,
		opacity: 0.6,
		wireframe: true,
		depthWrite: false,
	});
	placementPreview = new THREE.Mesh(previewGeo, previewMat);
	placementPreview.visible = false;
	scene.add(placementPreview);

	// Event listeners
	window.addEventListener('resize', onWindowResize);
	renderer.domElement.addEventListener('click', onMouseClick);
	renderer.domElement.addEventListener('mousemove', onMouseMove);

	// Hide tooltip when mouse leaves the 3D canvas
	renderer.domElement.addEventListener('mouseleave', onCanvasMouseLeave);

	// Hide tooltip whenever mouse button is released anywhere on the page
	window.addEventListener('mouseup', onGlobalMouseUp);

	initTowerUI();

	lastTime = performance.now();
	animate();
	
	// Start 3-2-1 countdown and show "Wave 1" at the center
	startWaveIntro();
	
}


// Main animation, game loop
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const delta = (now - lastTime) / 1000;
    lastTime = now;

    // Track total world time (for day/night system)
    globalTime += delta;

    // --- WORLD LIGHTING / DAY-NIGHT ---
    if (world && typeof world.updateDayNight === 'function') {
        world.updateDayNight(globalTime, bossPhase);
    }

    // --- WAVE TIMER UPDATE ---
    if (waveTimerRunning) {
        waveTimeLeft -= delta;

        if (waveTimeLeft <= 0) {
            waveTimeLeft = 0;
            waveTimerRunning = false;

            // ---- ENTER BOSS PHASE AFTER THE WAVE ----
            if (!bossPhase) {
                bossPhase = true;

                // Stop spawning & remove leftover enemies
                enemies.spawningEnabled = false;
                for (const e of enemies.enemies) {
                    if (typeof enemies.createEnemyDebris === 'function') {
                        enemies.createEnemyDebris(e.position);
                    }
                    if (e.parent) e.parent.remove(e);
                }
                enemies.enemies = [];

                // Show warning and spawn boss
                if (!bossWarningShown) {
                    bossWarningShown = true;
                    showBossWarning();
                }
                if (typeof enemies.spawnBoss === 'function') {
                    enemies.spawnBoss();
                }
            }
        }

        updateWaveTimerUI();
    }

    // --- CALCULATE WAVE PROGRESS (0→1) ---
    let waveProgress = 0;
    if (!bossPhase && waveTimerRunning) {
        waveProgress = 1 - waveTimeLeft / waveDuration;
        waveProgress = Math.min(Math.max(waveProgress, 0), 1);
    }

    // --- SPAWNER: CREATE ENEMIES ---
    if (spawner) {
        spawner.update(delta, waveProgress);
    }

    // --- ENEMY UPDATE (movement, chasing, hp bars) ---
    if (enemies && world.core) {
        enemies.update(delta, towers, camera);
    }

    // --- ENEMY COLLISIONS (tower melee, core hits) ---
    if (enemies && world.core) {
        enemies.checkCollisions(world.core.position, towers, handleCoreHit);
    }

    // --- TOWER UPDATES ---
    for (const tower of towers) {
        tower.update(enemies.enemies, delta, camera);
    }

    // --- BOSS HP BAR UI ---
    updateBossHealthUI();

    // --- WAVE COMPLETION CHECK ---
    // Conditions to start next wave:
    //  • Boss phase is finished
    //  • No enemies remain
    //  • Spawning is disabled (wave ended properly)
    if (
        bossPhase &&
        enemies.enemies.length === 0
    ) {
        // End boss phase
        bossPhase = false;
        bossWarningShown = false;

        // Advance wave
        currentWave++;
        waveLabelEl.textContent = `Wave ${currentWave}`;

        // Change biome
        if (world && typeof world.setBiomeForWave === 'function') {
            world.setBiomeForWave(currentWave);
        }

        // Prepare next wave
        spawner.setWave(currentWave);
        enemies.spawningEnabled = false; // turned on after countdown

        waveTimeLeft = waveDuration;
        updateWaveTimerUI();

        // Start next 3-2-1 intro
        startWaveIntro();
    }

    // --- CORE ROTATION ---
    if (world.core) world.core.rotation.y += 0.01;

    // --- RENDER ---
    controls.update();
    renderer.render(scene, camera);
}



// Handle when an enemy hits the core
function handleCoreHit() {
	health -= 1;
	console.log(`Core Hit! HP: ${health}`);
	updateHealthUI();

	// Flash global HP bar when core takes damage
	if (healthFill) {
		healthFill.classList.remove('hp-flash'); // reset if still applied
		void healthFill.offsetWidth;             // force reflow to restart animation
		healthFill.classList.add('hp-flash');

		setTimeout(() => {
			if (healthFill) healthFill.classList.remove('hp-flash');
		}, 250);
	}
}

// Called when an enemy is hit by a tower bullet
function handleEnemyKilled(enemy) {
	if (!enemy) return;

	// Ensure userData exists
	if (!enemy.userData) {
		enemy.userData = {};
	}

	const ud = enemy.userData;

	// Ignore if the enemy is already dead
	if (ud.isDead) return;

	// If HP does not exist, assign default values
	if (typeof ud.hp !== 'number') {
		ud.hp = 1;
	}
	if (typeof ud.maxHp !== 'number') {
		ud.maxHp = ud.hp;
	}

	// Reduce HP by 1 per bullet hit
	ud.hp -= 1;

	// If HP remains, do nothing (no effect or coin reward yet)
	if (ud.hp > 0) {
		return;
	}

	// HP is now 0 or below → process death
	ud.isDead = true;

	// Spawn destruction debris effect (already implemented in EnemyManager)
	if (enemies && typeof enemies.createEnemyDebris === 'function') {
		enemies.createEnemyDebris(enemy.position);
	}

	// Remove enemy from the scene
	if (scene && enemy.parent) {
		enemy.parent.remove(enemy);
	}

	// Remove enemy from EnemyManager list
	if (enemies && Array.isArray(enemies.enemies)) {
		enemies.enemies = enemies.enemies.filter((e) => e !== enemy);
	}

	// Add coin reward
	coins += 1;
	updateCoinUI();
}


// Display the Game Over message
function showGameOver() {
	const text = document.createElement('div');
	text.style.position = 'absolute';
	text.style.top = '50%';
	text.style.left = '50%';
	text.style.transform = 'translate(-50%, -50%)';
	text.style.color = '#fff';
	text.style.fontSize = '48px';
	text.style.fontWeight = 'bold';
	text.textContent = 'GAME OVER';
	document.body.appendChild(text);

	enemies.spawnInterval = 999999; // no more enemies
}

function onMouseMove(event) {
	if (!renderer || !camera) return;

	const rect = renderer.domElement.getBoundingClientRect();
	mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
	mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

	// 1) Placement preview (when placingTower is active)
	if (placingTower && placementPreview) {
		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObjects(scene.children, true);

		for (let i of intersects) {
			if (i.object.geometry && i.object.geometry.type === 'PlaneGeometry') {
				let pos = i.point.clone();
				pos.y = 0;

				// Snap to grid
				pos.x = Math.round(pos.x / GRID_SIZE) * GRID_SIZE;
				pos.z = Math.round(pos.z / GRID_SIZE) * GRID_SIZE;

				const distToCore = pos.length();
				if (distToCore < 4) {
					placementPreview.visible = false;
					lastPreviewPos = null;
					return;
				}

				const occupied = towers.some(
					(t) =>
						Math.abs(t.mesh.position.x - pos.x) < 0.01 &&
						Math.abs(t.mesh.position.z - pos.z) < 0.01
				);
				if (occupied) {
					placementPreview.visible = false;
					lastPreviewPos = null;
					return;
				}

				placementPreview.visible = true;
				placementPreview.position.set(pos.x, 1.5, pos.z); // center of cube
				lastPreviewPos = pos;
				break;
			}
		}

		// If nothing hit for placement
		if (!lastPreviewPos) {
			placementPreview.visible = false;
		}
	}

	// 2) Check hover over existing towers (3D objects)
	raycaster.setFromCamera(mouse, camera);

	const towerMeshes = towers.map((t) => t.mesh);
	const towerHits = raycaster.intersectObjects(towerMeshes, false);

	if (towerHits.length > 0) {
		const hitMesh = towerHits[0].object;
		const tower = towers.find((t) => t.mesh === hitMesh);
		if (tower) {
			hoveredTower = tower;
			const stats = getTowerStats(tower.type, tower); 
			showTowerTooltip(stats, event.clientX, event.clientY);
			return;
		}
	}

	hoveredTower = null;
	hideTowerTooltip();
}


// Handle mouse clicks for tower placement
function onMouseClick(event) {
	if (!placingTower || !lastPreviewPos) return;

	const type = placingTower;
	const cost = TOWER_COSTS[type] || 0;

	// Final check before placing (in case coins changed)
	if (coins < cost) {
		showCoinChange('Not enough coin');
		return;
	}

	const pos = lastPreviewPos.clone();

	// Deduct coins and show negative effect
	coins -= cost;
	updateCoinUI();
	showCoinChange(-cost);

	const newTower = new Tower(scene, pos, type, handleEnemyKilled);
	towers.push(newTower);
	console.log(`🧱 Placed ${type} tower at`, pos);

	placingTower = null;
	lastPreviewPos = null;
	if (placementPreview) placementPreview.visible = false;

	document
		.querySelectorAll('.tower-btn')
		.forEach((b) => b.classList.remove('placing'));
}

// Hide tooltip when mouse leaves the 3D canvas
function onCanvasMouseLeave() {
	hideTowerTooltip();
	hoveredTower = null;
}

// Hide tooltip when mouse button is released anywhere
function onGlobalMouseUp() {
	hideTowerTooltip();
	hoveredTower = null;
}

// Initialize the tower selection UI
function initTowerUI() {
	towerUI = document.getElementById('tower-ui');

	document.querySelectorAll('.tower-btn').forEach((btn) => {
		const type = btn.dataset.type;

		// Click: select or deselect tower type
		btn.addEventListener('click', () => {
			const cost = TOWER_COSTS[type] || 0;

			// Not enough coins → show message and do nothing
			if (coins < cost) {
				showCoinChange('Not enough coin');
				return;
			}

			// Remove highlight from all tower buttons
			document
				.querySelectorAll('.tower-btn')
				.forEach((b) => b.classList.remove('placing'));

			// If the same tower is clicked again, cancel placement
			if (placingTower === type) {
				placingTower = null;      // cancel selection
			} else {
				// Select this tower type for placement
				placingTower = type;
				btn.classList.add('placing');  // add highlight border
			}

			// Hide tooltip after clicking the button
			hideTowerTooltip();
		});

		// Hover: show stats tooltip
		btn.addEventListener('mouseenter', (e) => {
			const stats = getTowerStats(type);
			showTowerTooltip(stats, e.clientX, e.clientY);
		});

		btn.addEventListener('mousemove', (e) => {
			const stats = getTowerStats(type);
			showTowerTooltip(stats, e.clientX, e.clientY);
		});

		btn.addEventListener('mouseleave', () => {
			hideTowerTooltip();
		});
	});
}

// Handle browser window resize
function onWindowResize() {
	if (!camera || !renderer) return;
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
}

// Initialize Start Screen and set up Start button
function initStartUI() {
	const startScreen = document.getElementById('start-screen'); 
	const startBtn = document.getElementById('start-btn');
	const gameContainer = document.getElementById('game-container');
	
	
	startBtn.addEventListener('click', () => { 
	startScreen.style.display = 'none';      // Hide start screen
	gameContainer.style.display = 'block';   // Show game canvas
	initGame();                              // Start the game
	});   
}

// Initialize start screen UI at page load
initStartUI();
