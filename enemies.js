// enemies.js
import * as THREE from 'three';

// Enemy movement and attack tuning
const ENEMY_SPEED = 1;              // base movement speed
const TOWER_AGGRO_RADIUS = 8;       // how far enemies will notice towers
const TOWER_ATTACK_RANGE = 1.5;     // distance to start hitting a tower
const TOWER_ATTACK_INTERVAL = 1000; // ms between each melee hit

export class EnemyManager {
	constructor(scene, target) {
		this.scene = scene;			// Reference to the main scene
		this.target = target;		// Vector3 position of the core (enemy destination)
		this.enemies = [];			// Active enemy objects currently in the scene
		this.spawnInterval = 500;   // Spawn rate (milliseconds between spawns)
		this.lastSpawn = 0;         // Timestamp of last enemy spawn
		this.debris = [];			// Enemy death debris pieces (explosion effect)
		this.spawningEnabled = false; // will be turned on after 3-2-1 countdown
	}

	// Spawn a new enemy at a random map edge
	spawnEnemy() {
		// Enemy geometry and material (blue sphere)
		const enemyGeo = new THREE.SphereGeometry(0.7, 16, 16);
		const enemyMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
		const enemy = new THREE.Mesh(enemyGeo, enemyMat);

		// Determine spawn side (0~3: left, right, top, bottom)
		const range = 20; // Distance from center to spawn
		const side = Math.floor(Math.random() * 4);
		let x = 0, z = 0;

		// Left side
		if (side === 0) {
			x = -range;
			z = Math.random() * range * 2 - range;
		}
		// Right side
		if (side === 1) {
			x = range;
			z = Math.random() * range * 2 - range;
		}
		// Top side
		if (side === 2) {
			z = -range;
			x = Math.random() * range * 2 - range;
		}
		// Bottom side
		if (side === 3) {
			z = range;
			x = Math.random() * range * 2 - range;
		}

		// Set initial position and add to scene
		enemy.position.set(x, 0.7, z);

		// Basic AI state for this enemy
		enemy.userData = {
			hp: 1,                 // enemy HP (for collision with towers)
			maxHp: 1,
			targetType: 'core',    // 'core' or 'tower'
			targetTower: null,     // Tower instance when chasing a tower
			lastAttackTime: 0,     // not used now, but kept for future
			isDead: false          // used by bullet logic
		};
		
		enemy.castShadow = true;
		enemy.receiveShadow = true;

		this.scene.add(enemy);
		this.enemies.push(enemy);
	}
	
	spawnMiniBoss() {
		// Slightly larger, tougher yellow orb (mini-boss)
		const enemyGeo = new THREE.SphereGeometry(1.0, 20, 20);
		const enemyMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
		const enemy = new THREE.Mesh(enemyGeo, enemyMat);

		// Use the same spawn logic as normal enemies
		const range = 20;
		const side = Math.floor(Math.random() * 4);
		let x = 0, z = 0;

		if (side === 0) {
			x = -range;
			z = Math.random() * range * 2 - range;
		} else if (side === 1) {
			x = range;
			z = Math.random() * range * 2 - range;
		} else if (side === 2) {
			x = Math.random() * range * 2 - range;
			z = -range;
		} else {
			x = Math.random() * range * 2 - range;
			z = range;
		}

		enemy.position.set(x, 0.5, z);

		// Tougher stats and faster speed than normal enemies
		enemy.userData = {
			hp: 10,
			maxHp: 10,
			targetType: 'core',
			targetTower: null,
			lastAttackTime: 0,
			isDead: false,
			isMiniBoss: true,
			speed: 2, // move at the old normal speed
		};

		// === Attach a floating HP bar above the mini-boss ===
		const miniHpBar = this.createBossHpBar();   
		miniHpBar.group.scale.set(0.6, 0.6, 0.6);
		miniHpBar.group.position.set(0, 3, 0);      
		enemy.add(miniHpBar.group);
		enemy.userData.hpBar = miniHpBar;

		enemy.castShadow = true;
		enemy.receiveShadow = true;

		this.scene.add(enemy);
		this.enemies.push(enemy);
	}
	
	// Create a floating HP bar that will be attached above the boss
	createBossHpBar() {
		const barWidth = 6;
		const barHeight = 0.4;
		const yOffset = 5; // height above boss center

		// Background (black)
		const bgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
		const bgMat = new THREE.MeshBasicMaterial({
			color: 0x000000,
			transparent: true,
			opacity: 0.7,
			side: THREE.DoubleSide,
		});
		const bg = new THREE.Mesh(bgGeo, bgMat);

		// Foreground (red)
		const fgGeo = new THREE.PlaneGeometry(barWidth, barHeight);
		const fgMat = new THREE.MeshBasicMaterial({
			color: 0xff5555,
			transparent: true,
			opacity: 0.9,
			side: THREE.DoubleSide,
		});
		const fg = new THREE.Mesh(fgGeo, fgMat);

		const group = new THREE.Group();
		group.add(bg);
		group.add(fg);

		// Position above boss
		group.position.set(0, yOffset, 0);

		return {
			group,
			bg,
			fg,
			maxWidth: barWidth,
		};
	}

	// Spawn a single boss enemy (large, slow, high HP)
	spawnBoss() {
		// If a boss already exists, do not spawn another one
		const existingBoss = this.enemies.find(
			(e) => e.userData && e.userData.isBoss
		);
		if (existingBoss) return;

		// Create a large sphere mesh as the boss
		const bossGeo = new THREE.SphereGeometry(4, 32, 32);
		const bossMat = new THREE.MeshStandardMaterial({
			color: 0x8e44ad,
			emissive: 0x2c3e50,
			metalness: 0.3,
			roughness: 0.5,
		});
		const boss = new THREE.Mesh(bossGeo, bossMat);

		// Starting position (far away from the core)
		boss.position.set(0, 2, -60);

		// Enable shadows
		boss.castShadow = true;
		boss.receiveShadow = true;

		// Basic boss properties stored in userData
		boss.userData = {
			hp: 50,
			maxHp: 50,
			speed: 1.5,     // Slower than normal enemies
			isBoss: true,   // Mark as boss
			targetType: 'core',
			targetTower: null,
			lastAttackTime: 0,
			isDead: false,
		};
		
		// Attach a floating HP bar above the boss
		const bossHpBar = this.createBossHpBar();
		boss.add(bossHpBar.group);
		boss.userData.hpBar = bossHpBar;
		
		this.scene.add(boss);
		this.enemies.push(boss);
	}
	
	// Return the current boss enemy (if alive), otherwise null
	getBoss() {
		return (
			this.enemies.find(
				(e) => e.userData && e.userData.isBoss && !e.userData.isDead
			) || null
		);
	}

	
	// Update enemy positions each frame
	// towers: array of Tower instances
	update(deltaTime, towers = [], camera = null) {
		const now = performance.now();

		// Move each enemy (normal or boss)
		for (const e of this.enemies) {
			if (!e) continue;

			const ud = e.userData || {};

			// Default target is the core position
			let targetPos = this.target;

			// This will store the nearest tower (for normal enemies only)
			let nearestTower = null;

			// Boss logic — always chase the core
			if (ud.isBoss) {
				// Boss ignores towers and goes straight to the core
				ud.targetType = 'core';
				ud.targetTower = null;
			}
			// Normal enemy logic — tower aggro
			else {
				let minDist = TOWER_AGGRO_RADIUS;
				let secondMin = Infinity;
				const EPS = 0.2; // if two towers are almost equally close, treat as tie

				// Find closest and second-closest towers
				for (const t of towers) {
					if (!t || t.isDestroyed || !t.mesh) continue;

					const d = e.position.distanceTo(t.mesh.position);

					if (d < minDist) {
						// previous #1 becomes #2
						secondMin = minDist;
						minDist = d;
						nearestTower = t;
					} else if (d < secondMin) {
						// update #2
						secondMin = d;
					}
				}

				// If the two closest towers are almost at the same distance,
				// ignore them and keep targeting the core (prevents weird mid-line behavior).
				if (nearestTower && Math.abs(secondMin - minDist) < EPS) {
					nearestTower = null;
					minDist = TOWER_AGGRO_RADIUS;
				}

				// Final decision: attack a tower or move to the core
				if (nearestTower) {
					ud.targetType = 'tower';
					ud.targetTower = nearestTower;
					targetPos = nearestTower.mesh.position;
				} else {
					ud.targetType = 'core';
					ud.targetTower = null;
					targetPos = this.target;
				}
			}

			// Movement (shared by boss and normal enemies)
			const dir = new THREE.Vector3(
				targetPos.x - e.position.x,
				0,
				targetPos.z - e.position.z
			);

			const dist = dir.length();

			// If a normal enemy is chasing a tower and already in melee range,
			// stop moving (actual damage is handled inside checkCollisions()).
			if (
				ud.targetType === 'tower' &&
				ud.targetTower &&
				!ud.targetTower.isDestroyed &&
				dist < TOWER_ATTACK_RANGE * 0.9
			) {
				continue;
			}

			if (dist > 0.001) {
				dir.normalize();
				const speed =
					typeof ud.speed === 'number' ? ud.speed : ENEMY_SPEED;
				e.position.addScaledVector(dir, deltaTime * speed);
			}

			// === Update floating HP bar above boss / mini-boss ===
			if ((ud.isBoss || ud.isMiniBoss) && ud.hpBar && camera) {
				const ratio = Math.max(0, ud.hp / ud.maxHp);

				// scale foreground bar
				ud.hpBar.fg.scale.set(ratio, 1, 1);
				ud.hpBar.fg.position.x =
					(ratio - 1) * (ud.hpBar.maxWidth / 2);

				// make HP bar face the camera
				ud.hpBar.group.lookAt(camera.position);
			}
		}

		// Update enemy death debris pieces (fall and fade out)
		this.updateDebris(deltaTime);
	}

	// Check if enemies have collided with the core or a tower
	checkCollisions(corePosition, towers, onCoreHit) {
		const remaining = [];

		// Precompute core position on XZ plane
		const coreXZ = new THREE.Vector3(corePosition.x, 0, corePosition.z);
		const CORE_ATTACK_RANGE = 2.0; // range to damage core

		for (const e of this.enemies) {
			let removed = false;

			const ud = e.userData || {};

			// 1) Collision with target tower
			const targetTower = ud.targetTower;

			// Only melee normal towers, not the main core tower
			if (
				ud.targetType === 'tower' &&
				targetTower &&
				!targetTower.isDestroyed &&
				targetTower.mesh &&
				targetTower.type !== 'core'
			) {
				const enemyXZ = new THREE.Vector3(e.position.x, 0, e.position.z);
				const towerPos = targetTower.mesh.position;
				const towerXZ = new THREE.Vector3(towerPos.x, 0, towerPos.z);

				const distToTower = enemyXZ.distanceTo(towerXZ);

				if (distToTower < TOWER_ATTACK_RANGE) {
					// HP trade between enemy and tower
					let enemyHp =
						typeof ud.hp === 'number' ? ud.hp : 1;

					let towerHp =
						typeof targetTower.hp === 'number'
							? targetTower.hp
							: (targetTower.maxHp || 0);

					if (enemyHp > 0 && towerHp > 0) {
						const damage = Math.min(enemyHp, towerHp);

						// Apply damage to tower
						if (typeof targetTower.takeDamage === 'function') {
							targetTower.takeDamage(damage);
						} else {
							targetTower.hp = Math.max(0, towerHp - damage);
						}

						// Apply damage to enemy
						enemyHp -= damage;
						ud.hp = enemyHp;

						// Enemy dies → spawn debris and remove from scene
						if (enemyHp <= 0) {
							ud.isDead = true;
							this.createEnemyDebris(e.position);   // enemy break effect
							this.scene.remove(e);
							removed = true;
						}
					}
				}
			}

			// 2) Collision with core (global HP)
			if (!removed) {
				const enemyXZ = new THREE.Vector3(e.position.x, 0, e.position.z);
				const distToCore = enemyXZ.distanceTo(coreXZ);

				if (distToCore < CORE_ATTACK_RANGE) {
					// Hit the core → use global HP logic
					if (typeof onCoreHit === 'function') {
						onCoreHit();
					}

					// Enemy break effect at the core
					this.createEnemyDebris(e.position);
					this.scene.remove(e);
					if (ud) ud.isDead = true;
					removed = true;
				}
			}

			// 3) Keep enemy if still alive
			if (!removed) {
				remaining.push(e);
			}
		}

		// Update the enemy list
		this.enemies = remaining;
	}

	// Create small debris pieces when an enemy dies
	createEnemyDebris(position) {
		if (!this.scene) return;

		const origin = position.clone();
		const debrisCount = 8;
		const baseSize = 0.3;

		for (let i = 0; i < debrisCount; i++) {
			const size = baseSize * (0.5 + Math.random() * 0.7);
			const geo = new THREE.SphereGeometry(size, 8, 8);
			const mat = new THREE.MeshStandardMaterial({
				color: 0x3498db,      // same blue as the enemy
				transparent: true,
				opacity: 1.0,
				metalness: 0.1,
				roughness: 0.6,
			});

			const piece = new THREE.Mesh(geo, mat);

			// Start near the enemy position with a slight random offset
			piece.position.set(
				origin.x + (Math.random() - 0.5) * 0.5,
				origin.y + Math.random() * 0.5,
				origin.z + (Math.random() - 0.5) * 0.5
			);

			// Random velocity (scatter)
			const velocity = new THREE.Vector3(
				(Math.random() - 0.5) * 5,
				2 + Math.random() * 3,
				(Math.random() - 0.5) * 5
			);

			// Random angular velocity
			const angularVel = new THREE.Vector3(
				(Math.random() - 0.5) * 4,
				(Math.random() - 0.5) * 4,
				(Math.random() - 0.5) * 4
			);

			// Lifetime in seconds
			const life = 1.0 + Math.random() * 0.4;

			this.scene.add(piece);

			this.debris.push({
				mesh: piece,
				velocity,
				angularVel,
				life,
				age: 0,
			});
		}
	}

	// Update enemy debris pieces (apply gravity, rotation, and fade-out)
	updateDebris(deltaTime) {
		if (!this.debris || this.debris.length === 0) return;

		const GRAVITY = -9.8;
		const remaining = [];

		for (const d of this.debris) {
			d.age += deltaTime;
			if (d.age > d.life) {
				// Lifetime over - remove from scene
				if (d.mesh && d.mesh.parent) {
					d.mesh.parent.remove(d.mesh);
				}
				continue;
			}

			// Apply gravity and move
			d.velocity.y += GRAVITY * deltaTime * 0.5;
			d.mesh.position.addScaledVector(d.velocity, deltaTime);

			// Rotate debris piece
			d.mesh.rotation.x += d.angularVel.x * deltaTime;
			d.mesh.rotation.y += d.angularVel.y * deltaTime;
			d.mesh.rotation.z += d.angularVel.z * deltaTime;

			// Fade out over lifetime
			const t = d.age / d.life; // 0 → 1
			const opacity = 1.0 - t;
			if (d.mesh.material && d.mesh.material.transparent) {
				d.mesh.material.opacity = opacity;
			}

			remaining.push(d);
		}

		this.debris = remaining;
	}


}


